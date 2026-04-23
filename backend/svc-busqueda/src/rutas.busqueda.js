import express from "express";
import { consultar } from "../../libreria-compartida/src/db.js";
import { similitudCoseno } from "../../libreria-compartida/src/similitud.js";
import { embeddingTexto, responderConContexto } from "../../libreria-compartida/src/openai.js";
import { logger } from "../../libreria-compartida/src/logger.js";
import { openai } from "../../libreria-compartida/src/openai.js";

const router = express.Router();
router.use(express.json({ limit: "2mb", type: ["application/json", "application/*+json"] }));

// URL del servicio de generación
const SVC_GENERACION_URL = process.env.SVC_GENERACION_URL || 'http://localhost:8084';

// UTILIDADES

/**
 * Detecta si la pregunta es sobre datos estructurados (BD) o documentos
 * Retorna: 'database' | 'documents'
 */
async function detectarTipoConsulta(pregunta) {
  const preguntaLower = pregunta.toLowerCase();

  // Palabras clave que indican consulta/generación de BD
  const palabrasDB = [
    'generar', 'genera', 'generame', 'crear', 'crea', 'creame',
    'excel', 'pdf', 'word', 'reporte', 'documento',
    'estudiante', 'estudiantes', 'alumno', 'alumnos',
    'nota', 'notas', 'calificacion', 'calificaciones',
    'asistencia', 'asistencias', 'falta', 'faltas',
    'grado', 'curso', 'docente', 'profesor', 'materia',
    'cuantos', 'cuantas', 'listar', 'lista', 'dame',
    'agregar', 'eliminar', 'modificar', 'actualizar',
    // ── NUEVO: términos de planeación ──────────────────────────────────────
    'planeacion', 'planeación', 'planeaciones',
    'plan', 'planilla', 'planning',
    'cronograma', 'contenido', 'contenidos',
    'logro', 'logros', 'indicador', 'indicadores',
    'semana', 'semanas', 'periodo', 'periodos',
    'tema', 'temas', 'actividad', 'actividades'
    // ───────────────────────────────────────────────────────────────────────
  ];

  // Palabras clave que indican búsqueda en documentos
  const palabrasDocs = [
    'dice', 'contiene', 'menciona', 'habla sobre',
    'buscar en', 'revisar', 'documento que', 'archivo que',
    'manual', 'reglamento', 'normativa',
    'pdf del', 'word del', 'archivo del'
  ];

  // Contar coincidencias
  let conteoDoc = 0;
  let conteoDocs = 0;

  for (const palabra of palabrasDB) {
    if (preguntaLower.includes(palabra)) {
      conteoDoc++;
    }
  }

  for (const palabra of palabrasDocs) {
    if (preguntaLower.includes(palabra)) {
      conteoDocs++;
    }
  }

  // Decidir tipo según conteos
  const tipo = conteoDoc > conteoDocs ? 'database' : 'documents';

  logger.info({
    pregunta: pregunta.substring(0, 100),
    tipo,
    conteoDoc,
    conteoDocs
  }, "🔍 Tipo de consulta detectado");

  return tipo;
}

/**
 * Redirige la consulta al servicio de generación para consultas de BD
 */
async function consultarBaseDatos(pregunta) {
  try {
    const response = await fetch(`${SVC_GENERACION_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensaje: pregunta })
    });

    if (!response.ok) {
      throw new Error(`Error del servicio de generación: ${response.status}`);
    }

    const data = await response.json();
    logger.info({ intencion: data.intencion }, "✅ Respuesta del servicio de generación");

    return {
      respuesta: data.respuesta?.mensaje || JSON.stringify(data.respuesta, null, 2),
      datos_estructurados: data.respuesta?.datos || null,
      archivo_generado: data.respuesta?.archivo || null,
      intencion: data.intencion,
      parametros: data.parametros,
      fuente: 'base_datos'
    };
  } catch (error) {
    logger.error({ error: error.message }, "❌ Error consultando servicio de generación");
    throw new Error(`No pude consultar la base de datos: ${error.message}`);
  }
}

/** Escape para LIKE SQL */
function escapeLike(str) {
  return str.replace(/[%_\\]/g, '\\$&');
}

/** Score por coincidencia de palabras */
function scorePorPalabras(texto, consulta) {
  const q = String(consulta || "").toLowerCase().split(/\s+/).filter(Boolean);
  const t = String(texto || "").toLowerCase();
  if (!q.length || !t) return 0;
  let s = 0;
  for (const w of q) if (t.includes(w)) s += 1;
  return s / q.length;
}

function extraerTerminosDocumento(pregunta) {
  const stopWords = new Set([
    'que', 'cual', 'como', 'donde', 'cuando', 'quien', 'porque', 'para',
    'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas',
    'aquel', 'aquella', 'aquellos', 'aquellas', 'con', 'sin', 'sobre',
    'bajo', 'entre', 'hasta', 'desde', 'por', 'según', 'tras',
    'durante', 'mediante', 'contra', 'hacia', 'dentro', 'fuera',
    'puede', 'debe', 'tiene', 'hacer', 'contiene', 'muestra', 'dice',
    'archivo', 'documento', 'carpeta', 'folder', 'file'
  ]);

  const palabras = pregunta
    .toLowerCase()
    .replace(/[^\wáéíóúñü\s-]/g, ' ')
    .split(/\s+/)
    .filter(p => p.length > 2);

  const palabrasClave = palabras.filter(p =>
    !stopWords.has(p) || p.length > 6
  );

  return [...new Set(palabrasClave)];
}

// ETAPA 1: FILTRAR DOCUMENTOS RELEVANTES

async function buscarDocumentosRelevantes({ pregunta, filtro, maxDocs = 50 }) {
  const terminos = extraerTerminosDocumento(pregunta);
  const where = [];
  const params = [];

  if (filtro?.original_name) {
    where.push("nombre_original LIKE ? ESCAPE '\\\\'");
    params.push(`%${escapeLike(filtro.original_name)}%`);
  }
  if (filtro?.desde) {
    where.push("creado_en >= ?");
    params.push(filtro.desde);
  }
  if (filtro?.hasta) {
    where.push("creado_en <= ?");
    params.push(filtro.hasta);
  }

  if (terminos.length === 0) {
    const W = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const sql = `
      SELECT id, nombre_original, creado_en, 0 as score_nombre
      FROM documentos ${W}
      ORDER BY creado_en DESC
      LIMIT ?
    `;
    params.push(maxDocs);
    const docs = await consultar(sql, params);
    logger.info({ terminos_extraidos: 0, documentos_encontrados: docs.length, modo: "sin_filtro_terminos" }, "Etapa 1: Documentos relevantes");
    return docs.map(d => d.id);
  }

  const scoreConditions = terminos.map(() =>
    "(CASE WHEN nombre_original LIKE ? THEN 1 ELSE 0 END)"
  ).join(" + ");

  const W = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const sql = `
    SELECT id, nombre_original, creado_en,
      (${scoreConditions}) as score_nombre
    FROM documentos ${W}
    HAVING score_nombre > 0
    ORDER BY score_nombre DESC, creado_en DESC
    LIMIT ?
  `;

  const terminosParams = terminos.map(t => `%${t}%`);
  const allParams = [...params, ...terminosParams, maxDocs];
  const docs = await consultar(sql, allParams);

  logger.info({
    terminos_extraidos: terminos.length,
    documentos_encontrados: docs.length,
    top3: docs.slice(0, 3).map(d => ({ nombre: d.nombre_original, score: d.score_nombre }))
  }, "Etapa 1: Documentos relevantes");

  return docs.map(d => d.id);
}

// ETAPA 2: BUSCAR FRAGMENTOS EN DOCUMENTOS

async function traerFragmentosDeDocumentos(idsDocumentos, limite = 1000) {
  if (!idsDocumentos.length) return [];

  const placeholders = idsDocumentos.map(() => '?').join(',');

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
    WHERE d.id IN (${placeholders})
      AND LENGTH(f.contenido) >= 50
    ORDER BY d.id, f.indice_fragmento
    LIMIT ?
  `;

  return consultar(sql, [...idsDocumentos, limite]);
}

// SCORING DE FRAGMENTOS

async function scorearFragmentos(candidatos, pregunta) {
  let embPregunta = null;
  let modoFallback = false;

  try {
    embPregunta = await embeddingTexto(pregunta);
    logger.info(`Embedding de pregunta obtenido (dim: ${embPregunta?.length})`);
  } catch (err) {
    modoFallback = true;
    logger.warn({ err: String(err?.message) }, "Fallback a búsqueda por palabras");
  }

  const scored = [];
  let stats = { con_embedding: 0, sin_embedding: 0, errores_parsing: 0 };

  for (const c of candidatos) {
    let score = 0;

    if (!modoFallback && embPregunta) {
      try {
        let embFrag = null;

        if (c.embedding_json) {
          embFrag = typeof c.embedding_json === 'string'
            ? JSON.parse(c.embedding_json)
            : c.embedding_json;

          if (Array.isArray(embFrag) && embFrag.length === embPregunta.length) {
            score = similitudCoseno(embPregunta, embFrag);
            stats.con_embedding++;
          } else {
            stats.sin_embedding++;
          }
        } else {
          stats.sin_embedding++;
        }
      } catch (parseErr) {
        stats.errores_parsing++;
        logger.debug({ err: parseErr.message, id: c.id_fragmento }, "Error parsing embedding");
      }

      if (score === 0 && c.texto) {
        score = scorePorPalabras(c.texto, pregunta) * 0.3;
      }
    } else {
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

  logger.info({ ...stats, total: candidatos.length, modo: modoFallback ? 'palabras' : 'embeddings' }, "Stats scoring");

  return { scored, modoFallback, stats };
}

// ENDPOINT PRINCIPAL

router.post("/consulta", async (req, res) => {
  const t0 = Date.now();

  try {
    const {
      pregunta,
      k = 6,
      usarLLM = true,
      umbral = 0.1,
      filtro = {},
      maxDocs = 50
    } = req.body || {};

    if (!pregunta || typeof pregunta !== "string" || pregunta.length < 3) {
      return res.status(400).json({ error: "Campo 'pregunta' requerido (mínimo 3 caracteres)" });
    }

    logger.info({ pregunta: pregunta.substring(0, 100) }, "Nueva consulta");

    // DETECCIÓN AUTOMÁTICA: ¿Es consulta de BD o búsqueda de documentos?
    const tipoConsulta = await detectarTipoConsulta(pregunta);

    if (tipoConsulta === 'database') {
      logger.info("🔄 Redirigiendo a consulta de base de datos");
      try {
        const resultado = await consultarBaseDatos(pregunta);
        return res.json({ ...resultado, ms: Date.now() - t0, tipo_busqueda: 'base_datos' });
      } catch (error) {
        logger.warn({ error: error.message }, "Falló consulta BD, intentando búsqueda en documentos");
      }
    }

    // ETAPA 1: Filtrar documentos relevantes
    let idsDocumentos = await buscarDocumentosRelevantes({ pregunta, filtro, maxDocs });

    if (!idsDocumentos.length) {
      logger.warn("No hay coincidencias por términos, usando documentos recientes");

      const where = [];
      const params = [];

      if (filtro?.original_name) {
        where.push("nombre_original LIKE ? ESCAPE '\\\\'");
        params.push(`%${escapeLike(filtro.original_name)}%`);
      }
      if (filtro?.desde) { where.push("creado_en >= ?"); params.push(filtro.desde); }
      if (filtro?.hasta) { where.push("creado_en <= ?"); params.push(filtro.hasta); }

      const W = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const fallbackDocs = await consultar(
        `SELECT id FROM documentos ${W} ORDER BY creado_en DESC LIMIT ?`,
        [...params, maxDocs]
      );

      idsDocumentos = fallbackDocs.map(d => d.id);

      if (!idsDocumentos.length) {
        logger.warn("No se encontraron documentos ni con fallback");
        return res.json(
          usarLLM
            ? { respuesta: "No encontré documentos relacionados con tu pregunta.", citas: [] }
            : { resultados: [], mensaje: "No se encontraron documentos" }
        );
      }
    }

    // ETAPA 2: Traer fragmentos
    const candidatos = await traerFragmentosDeDocumentos(idsDocumentos);

    if (!candidatos.length) {
      logger.warn("Documentos encontrados pero sin fragmentos válidos");
      return res.json(
        usarLLM
          ? { respuesta: "Encontré documentos pero no tienen contenido procesable.", citas: [] }
          : { resultados: [] }
      );
    }

    logger.info(`Analizando ${candidatos.length} fragmentos de ${idsDocumentos.length} documentos`);

    // ETAPA 3: Scorear fragmentos
    const { scored, modoFallback, stats } = await scorearFragmentos(candidatos, pregunta);

    scored.sort((a, b) => b.score - a.score);
    let topk = scored.slice(0, Number(k) || 6);

    if (typeof umbral === "number") {
      topk = topk.filter(x => x.score >= umbral);
    }

    if (topk.length === 0 || topk.every(x => x.score < 0.05)) {
      logger.warn("Scores muy bajos, ampliando búsqueda");
      topk = scored.slice(0, Number(k) || 6);
    }

    logger.debug({
      topk: topk.slice(0, 3).map(r => ({
        doc: r.original_name,
        score: r.score.toFixed(3),
        preview: r.texto?.substring(0, 60)
      }))
    }, "Top resultados");

    // Respuesta sin LLM
    if (!usarLLM) {
      return res.json({
        resultados: topk.map(r => ({
          documento: r.original_name,
          score: r.score,
          fragmento: r.texto?.substring(0, 200) + '...'
        })),
        modo: modoFallback ? "palabras" : "embeddings",
        stats: { documentos_analizados: idsDocumentos.length, fragmentos_totales: candidatos.length, ...stats }
      });
    }

    // ETAPA 4: Usar LLM para responder con contexto
    const contexto = topk
      .map((r, i) => `<<Fragmento ${i+1} - Documento: "${r.original_name}" (relevancia: ${r.score.toFixed(2)})>>\n${r.texto}`)
      .join("\n\n---\n\n");

    const preguntaDetallada = `${pregunta}

INSTRUCCIONES PARA LA RESPUESTA:
- Proporciona una respuesta COMPLETA y EXHAUSTIVA (mínimo 3-4 párrafos bien desarrollados)
- Incluye TODOS los detalles relevantes encontrados en los fragmentos proporcionados
- Explica el contexto, antecedentes y cualquier información necesaria para una comprensión completa
- Si hay múltiples aspectos o partes en la pregunta, aborda CADA UNO de manera detallada
- Usa ejemplos específicos, datos concretos y referencias textuales cuando estén disponibles
- Estructura tu respuesta de manera clara con párrafos bien organizados
- Sintetiza información de TODOS los fragmentos relevantes, no solo de uno o dos
- NO proporciones respuestas cortas, superficiales o incompletas
- Si encuentras información complementaria o relacionada, inclúyela para enriquecer la respuesta

Recuerda: el objetivo es dar la respuesta MÁS COMPLETA Y ÚTIL posible basándote en la información disponible.`;

    const { respuesta } = await responderConContexto(preguntaDetallada, contexto);

    const citas = topk.map(r => ({
      id_fragmento: r.id_fragmento,
      id_documento: r.id_documento,
      documento: r.original_name,
      chunk_index: r.chunk_index,
      score: r.score
    }));

    return res.json({
      respuesta,
      citas,
      modo: modoFallback ? "palabras" : "embeddings",
      tipo_busqueda: 'documentos',
      ms: Date.now() - t0,
      stats: { documentos_analizados: idsDocumentos.length, fragmentos_totales: candidatos.length, ...stats }
    });

  } catch (err) {
    logger.error({ err: err.message, stack: err.stack }, "Error en /consulta");
    return res.status(500).json({ error: "Error en búsqueda" });
  }
});

export default router;