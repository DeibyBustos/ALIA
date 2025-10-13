import express from "express";
import { consultar } from "../../libreria-compartida/src/db.js";
import { similitudCoseno } from "../../libreria-compartida/src/similitud.js";
import { embeddingTexto, responderConContexto } from "../../libreria-compartida/src/openai.js";
import { logger } from "../../libreria-compartida/src/logger.js";

const router = express.Router();

router.use(express.json({ limit: "2mb", type: ["application/json", "application/*+json"] }));

/** Util: fallback sin embeddings (búsqueda por palabras) */
function scorePorPalabras(texto, consulta) {
  const q = String(consulta || "").toLowerCase().split(/\s+/).filter(Boolean);
  const t = String(texto || "").toLowerCase();
  if (!q.length || !t) return 0;
  let s = 0;
  for (const w of q) if (t.includes(w)) s += 1;
  return s / q.length;
}

/**
 * Trae candidatos desde fragmentos_documento + documentos
 * FILTRO MEJORADO: Solo trae fragmentos con contenido mínimo
 */
async function traerCandidatos({ original_name, desde, hasta }) {
  const where = [];
  const params = [];
  
  // ⚠️ CRÍTICO: Filtrar fragmentos muy cortos que no son útiles
  where.push("LENGTH(f.contenido) >= 50");
  
  if (original_name) { 
    where.push("d.nombre_original LIKE ?"); 
    params.push(`%${original_name}%`); 
  }
  if (desde) { 
    where.push("d.creado_en >= ?"); 
    params.push(desde); 
  }
  if (hasta) { 
    where.push("d.creado_en <= ?"); 
    params.push(hasta); 
  }
  
  const W = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const sql = `
    SELECT
      f.id                       AS id_fragmento,
      d.id                       AS id_documento,
      d.nombre_original          AS original_name,
      f.indice_fragmento         AS chunk_index,
      f.contenido                AS texto,
      f.embedding_json           AS embedding_json,
      d.creado_en                AS created_at
    FROM fragmentos_documento f
    JOIN documentos d ON d.id = f.id_documento
    ${W}
    ORDER BY f.id DESC
    LIMIT 2000
  `;
  return consultar(sql, params);
}

/**
 * POST /consulta
 * Body:
 * { pregunta, k=6, usarLLM=true, umbral, filtro:{ original_name, desde, hasta } }
 */
router.post("/consulta", async (req, res) => {
  const t0 = Date.now();
  try {
    const { pregunta, k = 6, usarLLM = true, umbral, filtro = {} } = req.body || {};
    if (!pregunta || typeof pregunta !== "string") {
      return res.status(400).json({ error: "Campo 'pregunta' es requerido (string)" });
    }

    // 1) Traer candidatos desde la BD real
    const candidatos = await traerCandidatos({
      original_name: filtro.original_name,
      desde: filtro.desde,
      hasta: filtro.hasta
    });

    logger.info(`Candidatos encontrados: ${candidatos.length}`);

    if (!candidatos.length) {
      return res.json(
        usarLLM 
          ? { respuesta: "(no hay contexto disponible)", citas: [] } 
          : { resultados: [] }
      );
    }

    // 🔍 DEBUG: Log de muestra de candidatos
    if (candidatos.length > 0) {
      logger.debug({
        muestra: candidatos.slice(0, 2).map(c => ({
          id: c.id_fragmento,
          texto_preview: c.texto?.substring(0, 100),
          tiene_embedding: !!c.embedding_json,
          tipo_embedding: typeof c.embedding_json,
          longitud_texto: c.texto?.length
        }))
      }, "Muestra de candidatos");
    }

    // 2) Intentar embeddings de la pregunta
    let embPregunta = null;
    let modoFallback = false;

    try {
      embPregunta = await embeddingTexto(pregunta);
      logger.info(`Embedding de pregunta obtenido (dim: ${embPregunta?.length})`);
    } catch (err) {
      modoFallback = true;
      logger.warn({ 
        err: String(err?.message || err) 
      }, "Fallo en embeddings: usando fallback por palabras");
    }

    // 3) Scoring CON MEJOR MANEJO DE ERRORES
    const scored = [];
    let fragmentosConEmbedding = 0;
    let fragmentosSinEmbedding = 0;
    let erroresParsingEmbedding = 0;

    for (const c of candidatos) {
      let score = 0;
      
      if (!modoFallback) {
        // Similitud coseno con embeddings guardados
        let embFrag = null;
        
        try {
          if (c.embedding_json) {
            // 🔧 FIX: Si embedding_json es string, parsear; si ya es objeto, usar directo
            if (typeof c.embedding_json === 'string') {
              embFrag = JSON.parse(c.embedding_json);
            } else {
              embFrag = c.embedding_json;
            }
            
            // ✅ Validar que sea un array con datos
            if (Array.isArray(embFrag) && embFrag.length > 0 && 
                Array.isArray(embPregunta) && embPregunta.length > 0) {
              
              // ⚠️ Validar dimensiones compatibles
              if (embFrag.length === embPregunta.length) {
                score = similitudCoseno(embPregunta, embFrag);
                fragmentosConEmbedding++;
              } else {
                logger.warn({
                  id_fragmento: c.id_fragmento,
                  dim_frag: embFrag.length,
                  dim_pregunta: embPregunta.length
                }, "Dimensiones de embedding incompatibles");
                fragmentosSinEmbedding++;
              }
            } else {
              fragmentosSinEmbedding++;
            }
          } else {
            fragmentosSinEmbedding++;
          }
        } catch (parseErr) {
          erroresParsingEmbedding++;
          logger.warn({
            err: String(parseErr.message),
            id_fragmento: c.id_fragmento,
            tiene_embedding: !!c.embedding_json,
            tipo_embedding: typeof c.embedding_json
          }, "Error al parsear embedding_json");
        }
        
        // Si no hay embedding válido, usar fallback por palabras para este fragmento
        if (score === 0 && c.texto) {
          score = scorePorPalabras(c.texto, pregunta) * 0.3; // Penalizado
        }
      } else {
        // Modo fallback total por palabras
        score = scorePorPalabras(c.texto, pregunta);
      }

      scored.push({
        id_fragmento: c.id_fragmento,
        id_documento: c.id_documento,
        original_name: c.original_name,
        chunk_index: c.chunk_index,
        score,
        texto: c.texto
      });
    }

    // 📊 Log de estadísticas
    logger.info({
      total: candidatos.length,
      con_embedding: fragmentosConEmbedding,
      sin_embedding: fragmentosSinEmbedding,
      errores_parsing: erroresParsingEmbedding,
      modo: modoFallback ? "fallback_palabras" : "embeddings"
    }, "Estadísticas de scoring");

    // 4) Orden, top-k y umbral
    scored.sort((a, b) => b.score - a.score);
    let topk = scored.slice(0, Number(k) || 6);
    
    // 🔍 Umbral adaptativo: si todos los scores son 0, usar los mejores por palabras
    if (topk.every(x => x.score === 0)) {
      logger.warn("Todos los scores son 0, aplicando fallback por palabras");
      const fallbackScored = candidatos.map(c => ({
        id_fragmento: c.id_fragmento,
        id_documento: c.id_documento,
        original_name: c.original_name,
        chunk_index: c.chunk_index,
        score: scorePorPalabras(c.texto, pregunta),
        texto: c.texto
      }));
      fallbackScored.sort((a, b) => b.score - a.score);
      topk = fallbackScored.slice(0, Number(k) || 6);
      modoFallback = true;
    }
    
    if (typeof umbral === "number") {
      topk = topk.filter(x => x.score >= umbral);
    }

    // 📊 Log de top resultados
    logger.debug({
      topk: topk.map(r => ({
        score: r.score.toFixed(3),
        preview: r.texto?.substring(0, 80)
      }))
    }, "Top K resultados");

    // 5) Si no usamos LLM → devolver recuperación
    if (!usarLLM) {
      return res.json({ 
        resultados: topk, 
        modo: modoFallback ? "fallback_palabras" : "embeddings",
        stats: {
          total_candidatos: candidatos.length,
          con_embedding: fragmentosConEmbedding,
          sin_embedding: fragmentosSinEmbedding
        }
      });
    }

    // 6) Preparar contexto para LLM
    const contexto = topk
      .map((r, i) => `<<fragmento ${i+1} (score=${r.score.toFixed(3)})>>\n${r.texto}`)
      .join("\n\n");
    
    logger.debug({ contexto_length: contexto.length }, "Contexto preparado");

    const { respuesta } = await responderConContexto(pregunta, contexto);

    const citas = topk.map(r => ({
      id_fragmento: r.id_fragmento,
      id_documento: r.id_documento,
      original_name: r.original_name,
      chunk_index: r.chunk_index,
      score: r.score
    }));

    return res.json({ 
      respuesta, 
      citas, 
      modo: modoFallback ? "fallback_palabras" : "embeddings", 
      ms: Date.now() - t0,
      stats: {
        total_candidatos: candidatos.length,
        con_embedding: fragmentosConEmbedding,
        sin_embedding: fragmentosSinEmbedding
      }
    });
    
  } catch (err) {
    logger.error({ err }, "Error en /consulta");
    return res.status(500).json({ error: "Error en búsqueda/consulta" });
  }
});

export default router;