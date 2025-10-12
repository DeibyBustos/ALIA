import express from "express";
import { consultar } from "../../libreria-compartida/src/db.js";
import { similitudCoseno } from "../../libreria-compartida/src/similitud.js";
import { embeddingTexto, responderConContexto } from "../../libreria-compartida/src/openai.js";
import { logger } from "../../libreria-compartida/src/logger.js";

const router = express.Router();

// Parser SOLO aquí (evita dobles lecturas de body)
router.use(express.json({ limit: "2mb", type: ["application/json", "application/*+json"] }));

/** Util: fallback sin embeddings (búsqueda por palabras) */
function scorePorPalabras(texto, consulta) {
  const q = String(consulta || "").toLowerCase().split(/\s+/).filter(Boolean);
  const t = String(texto || "").toLowerCase();
  if (!q.length || !t) return 0;
  let s = 0;
  for (const w of q) if (t.includes(w)) s += 1;
  return s / q.length; // 0..1
}

/**
 * Trae candidatos desde fragmentos_documento + documentos
 * Aplica filtros simples (por nombre y fechas)
 */
async function traerCandidatos({ original_name, desde, hasta }) {
  const where = [];
  const params = [];
  if (original_name) { where.push("d.nombre_original LIKE ?"); params.push(`%${original_name}%`); }
  if (desde)         { where.push("d.creado_en >= ?");         params.push(desde); }
  if (hasta)         { where.push("d.creado_en <= ?");         params.push(hasta); }
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

    if (!candidatos.length) {
      return res.json(usarLLM ? { respuesta: "(no hay contexto disponible)", citas: [] } : { resultados: [] });
    }

    // 2) Intentar embeddings de la pregunta (si falla → fallback por palabras)
    let embPregunta = null;
    let modoFallback = false;

    try {
      embPregunta = await embeddingTexto(pregunta); // <- requiere OPENAI_API_KEY y red
    } catch (err) {
      modoFallback = true;
      logger.warn({ err: String(err?.message || err) }, "Fallo en embeddings: usando fallback por palabras");
    }

    // 3) Scoring
    const scored = [];
    for (const c of candidatos) {
      let score = 0;
      if (!modoFallback) {
        // similitud coseno con embeddings guardados
        let embFrag = null;
        try { embFrag = JSON.parse(c.embedding_json); } catch {}
        if (Array.isArray(embFrag) && Array.isArray(embPregunta)) {
          score = similitudCoseno(embPregunta, embFrag);
        } else {
          // si este fragmento no tiene embedding, dale score mínimo
          score = 0;
        }
      } else {
        // fallback simple por palabras
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

    // 4) Orden, top-k y umbral
    scored.sort((a, b) => b.score - a.score);
    let topk = scored.slice(0, Number(k) || 6);
    if (typeof umbral === "number") topk = topk.filter(x => x.score >= umbral);

    // 5) Si no usamos LLM → devolver recuperación
    if (!usarLLM) {
      return res.json({ resultados: topk, modo: modoFallback ? "fallback_palabras" : "embeddings" });
    }

    // 6) Preparar contexto y preguntar al chat (solo si hay API key; si falla → degradado)
    const contexto = topk.map((r, i) => `<<fragmento ${i+1} (score=${r.score.toFixed(3)})>>\n${r.texto}`).join("\n\n");
    const { respuesta } = await responderConContexto(pregunta, contexto);

    const citas = topk.map(r => ({
      id_fragmento: r.id_fragmento,
      id_documento: r.id_documento,
      original_name: r.original_name,
      chunk_index: r.chunk_index,
      score: r.score
    }));

    return res.json({ respuesta, citas, modo: modoFallback ? "fallback_palabras" : "embeddings", ms: Date.now() - t0 });
  } catch (err) {
    logger.error({ err }, "Error en /consulta");
    return res.status(500).json({ error: "Error en búsqueda/consulta" });
  }
});

export default router;
