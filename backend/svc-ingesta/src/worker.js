import fs from "node:fs";
import { consultar, ejecutar } from "../../libreria-compartida/src/db.js";
import { trocearTexto } from "../../libreria-compartida/src/texto.js";
import { embeddingTexto } from "../../libreria-compartida/src/openai.js";
import { logger } from "../../libreria-compartida/src/logger.js";
import { extraerPDF } from "./extractores/pdf.js";
import { extraerDOCX } from "./extractores/docx.js";
import { extraerTXT } from "./extractores/txt.js";
import { extraerExcelComoTexto } from "./extractores/excel.js";

const TAM = +process.env.TAMANO_CHUNK || 800;
const OVER = +process.env.SOBRELAPAMIENTO_CHUNK || 120;
const BATCH = +process.env.INGESTA_BATCH || 5;
const POLL_MS = +process.env.INGESTA_POLL_MS || 2000;
const GUARDAR_TEXTO_COMPLETO = process.env.GUARDAR_TEXTO_COMPLETO !== "false";

/**
 * Worker para procesar documentos
 * Se encarga de extraer texto de diferentes tipos de archivos,
 * dividirlo en fragmentos y generar embeddings
 */

/**
 * Ciclo principal del worker
 * Busca tareas pendientes y las procesa en lotes
 */
async function ciclo() {
  try {
    const tareas = await consultar(
      `SELECT t.id, t.id_documento, d.ruta_almacenamiento, d.tipo_mime, d.nombre_original
       FROM tareas_ingesta t
       JOIN documentos d ON d.id = t.id_documento
       WHERE t.estado = 'PENDIENTE'
       ORDER BY t.id ASC
       LIMIT ?`, [BATCH]
    );

    for (const t of tareas) {
      await procesarTarea(t).catch(err => logger.error({ err, tarea: t.id }, "Error procesando tarea"));
    }
  } catch (e) {
    logger.error({ e }, "Fallo en ciclo de ingesta");
  } finally {
    setTimeout(ciclo, POLL_MS);
  }
}

/**
 * Procesa una tarea individual de ingesta
 * Extrae texto, genera chunks y embeddings, y guarda en BD
 */
async function procesarTarea(t) {
  await ejecutar(`UPDATE tareas_ingesta SET estado='EN_PROCESO', mensaje_error=NULL WHERE id=?`, [t.id]);

  try {
    const texto = await extraerTexto(t.tipo_mime, t.ruta_almacenamiento, t.nombre_original);
    const chunks = trocearTexto(texto, TAM, OVER);

    let idx = 0;
    for (const ch of chunks) {
      const emb = await embeddingTexto(ch); // float[]
      await ejecutar(
        `INSERT INTO fragmentos_documento
         (id_documento, indice_fragmento, contenido, embedding_json, total_tokens)
         VALUES (?, ?, ?, ?, NULL)`,
        [t.id_documento, idx++, ch, JSON.stringify(emb)]
      );
    }

    if (GUARDAR_TEXTO_COMPLETO && texto && texto.length) {
      await ejecutar(
        `INSERT INTO textos_documento (id_documento, texto_completo) VALUES (?, ?)`,
        [t.id_documento, texto.slice(0, 5_000_000)]
      );
    }

    await ejecutar(`UPDATE tareas_ingesta SET estado='TERMINADA', mensaje_error=NULL WHERE id=?`, [t.id]);
    logger.info({ tarea: t.id, doc: t.id_documento, chunks: chunks.length }, "Ingesta terminada");
  } catch (err) {
    await ejecutar(`UPDATE tareas_ingesta SET estado='FALLIDA', mensaje_error=? WHERE id=?`, [String(err?.message || err), t.id]);
    logger.warn({ tarea: t.id, err }, "Ingesta fallida");
  }
}

/**
 * Extrae texto de diferentes tipos de archivos
 * Soporta PDF, DOCX, TXT, Excel y otros formatos
 */
async function extraerTexto(mime, ruta, nombre) {
  const low = (nombre || "").toLowerCase();
  if (mime?.includes("pdf") || low.endsWith(".pdf"))  return await extraerPDF(ruta);
  if (mime?.includes("word") || low.endsWith(".docx") || low.endsWith(".doc")) return await extraerDOCX(ruta);
  if (mime?.includes("text") || low.endsWith(".txt") || low.endsWith(".md"))  return await extraerTXT(ruta);

  // ✅ Excel con exceljs (sin sheetjs/xlsx)
  if (low.endsWith(".xlsx") || low.endsWith(".xls") || low.endsWith(".csv")) {
    return await extraerExcelComoTexto(ruta);
  }

  // Fallback: intentar leer como UTF-8
  try {
    return fs.readFileSync(ruta, "utf8");
  } catch {
    const buf = fs.readFileSync(ruta);
    return buf.toString("utf8");
  }
}

// iniciar loop
ciclo();
