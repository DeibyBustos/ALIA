import express from "express";
import { consultar } from "../../libreria-compartida/src/db.js";
import { embeddingTexto, chatConContexto } from "../../libreria-compartida/src/openai.js";
import { coseno } from "../../libreria-compartida/src/similitud.js";

const router = express.Router();

router.post("/consulta", async (req, res) => {
  try {
    const {
      pregunta,
      k = Number(process.env.RAG_K || 6),
      usarLLM = true,
      umbral = process.env.RAG_UMBRAL ? Number(process.env.RAG_UMBRAL) : null,
      filtro = {}
    } = req.body || {};

    if (!pregunta || typeof pregunta !== "string" || !pregunta.trim()) {
      return res.status(400).json({ error: "Falta 'pregunta' (string no vacío)" });
    }

    const embPregunta = await embeddingTexto(pregunta);

    const candidatosMax = Number(process.env.RAG_CANDIDATOS || 1000);
    const condiciones = [];
    const params = [];

    if (filtro.original_name) {
      condiciones.push("original_name LIKE ?");
      params.push(`%${String(filtro.original_name)}%`);
    }
    if (filtro.desde) { condiciones.push("created_at >= ?"); params.push(filtro.desde); }
    if (filtro.hasta) { condiciones.push("created_at <= ?"); params.push(filtro.hasta); }

    const whereSql = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";
    const filas = await consultar(
      `SELECT id, file_name, original_name, chunk_index, text, embedding, created_at
       FROM embeddings
       ${whereSql}
       ORDER BY id DESC
       LIMIT ?`,
      [...params, candidatosMax]
    );

    if (!filas.length) {
      return res.json({ pregunta, resultados: [], mensaje: "No hay candidatos que coincidan con el filtro." });
    }

    const scored = [];
    for (const f of filas) {
      let embFrag;
      try { embFrag = JSON.parse(f.embedding); } catch { continue; }
      const score = coseno(embPregunta, embFrag);
      if (umbral == null || score >= umbral) scored.push({ ...f, score });
    }

    if (!scored.length) {
      return res.json({ pregunta, resultados: [], mensaje: "No hay fragmentos sobre el umbral de similitud." });
    }

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, k);

    const contexto = top
      .map((t, i) => `[${i + 1}] (${t.original_name}#${t.chunk_index}) ${t.text}`)
      .join("\n---\n");

    if (!usarLLM) {
      return res.json({
        pregunta,
        k,
        resultados: top.map(({ id, file_name, original_name, chunk_index, score, created_at }) => ({
          id, file_name, original_name, chunk_index, score: +score.toFixed(6), created_at
        }))
      });
    }

    const respuesta = await chatConContexto(pregunta, contexto);
    return res.json({
      pregunta,
      respuesta,
      citas: top.map(({ original_name, chunk_index, score }) => ({
        original_name, chunk_index, score: +score.toFixed(6)
      }))
    });
  } catch (err) {
    return res.status(500).json({ error: "Error en búsqueda RAG", detalle: String(err?.message || err) });
  }
});

export default router;
