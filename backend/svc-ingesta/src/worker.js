import fs from "node:fs";
import path from "node:path";
import { consultar, ejecutar } from "../../libreria-compartida/src/db.js";
import { trocearTexto } from "../../libreria-compartida/src/texto.js";
import { embeddingTexto } from "../../libreria-compartida/src/openai.js";
import { logger } from "../../libreria-compartida/src/logger.js";
import { resolverRutaFSDesdeDB } from "../../libreria-compartida/src/almacenamiento.js";
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
 * Intenta “reparar” rutas antiguas sin extensión probando variantes
 * derivadas del nombre original y del MIME.
 */
function intentarConExtensiones(baseSinExt, nombreOriginal, mime) {
  const candidatos = [];
  const extNom = (path.parse(nombreOriginal || "").ext || "").toLowerCase();
  if (extNom) candidatos.push(baseSinExt + extNom);

  const m = (mime || "").toLowerCase();
  if (m.includes("pdf")) candidatos.push(baseSinExt + ".pdf");
  else if (m.includes("word") || m.includes("officedocument.wordprocessingml.document")) candidatos.push(baseSinExt + ".docx");
  else if (m.includes("excel") || m.includes("spreadsheetml")) candidatos.push(baseSinExt + ".xlsx");
  else if (m.includes("text") || m.includes("plain")) candidatos.push(baseSinExt + ".txt");

  for (const cand of candidatos) if (fs.existsSync(cand)) return cand;
  return null;
}

/** Resuelve la ruta física desde lo guardado en BD (relativo), con fallback de extensión. */
function resolverRutaFisica(rutaDB, nombreOriginal, mime) {
  // 1) Convertir la ruta de BD (storage/AAAA-MM/...) a ruta de FS
  let rutaFS = resolverRutaFSDesdeDB(rutaDB);

  // 2) Si existe tal cual, usamos esa
  if (fs.existsSync(rutaFS)) return rutaFS;

  // 3) Si no existe, y no tiene extensión, probamos variantes con extensión
  const parsed = path.parse(rutaFS);
  if (!parsed.ext || !fs.existsSync(rutaFS)) {
    const baseSinExt = parsed.ext ? rutaFS.slice(0, rutaFS.length - parsed.ext.length) : rutaFS;
    const reparada = intentarConExtensiones(baseSinExt, nombreOriginal, mime);
    if (reparada) return reparada;
  }

  // 4) Devolver la original (fallará más adelante y quedará log)
  return rutaFS;
}

/**
 * Extrae texto de diferentes tipos de archivos.
 * Soporta PDF, DOCX, TXT, Excel y fallback a lectura UTF-8 binaria.
 */
async function extraerTexto(mime, rutaFS, nombre) {
  const low = (nombre || "").toLowerCase();
  if (mime?.includes("pdf") || low.endsWith(".pdf"))  return await extraerPDF(rutaFS);
  if (mime?.includes("word") || low.endsWith(".docx") || low.endsWith(".doc")) return await extraerDOCX(rutaFS);
  if (mime?.includes("text") || low.endsWith(".txt") || low.endsWith(".md"))  return await extraerTXT(rutaFS);

  // ✅ Excel con exceljs
  if (low.endsWith(".xlsx") || low.endsWith(".xls") || low.endsWith(".csv") || mime?.includes("spreadsheet")) {
    return await extraerExcelComoTexto(rutaFS);
  }

  // Fallback: intentar leer como UTF-8
  try {
    return fs.readFileSync(rutaFS, "utf8");
  } catch {
    const buf = fs.readFileSync(rutaFS);
    return buf.toString("utf8");
  }
}

/** Procesa una tarea individual de ingesta. */
async function procesarTarea(t) {
  await ejecutar(`UPDATE tareas_ingesta SET estado='EN_PROCESO', mensaje_error=NULL WHERE id=?`, [t.id]);

  try {
    // Resolver ruta física desde la ruta almacenada en BD (relativa) + reparar extensión si hace falta
    const rutaFS = resolverRutaFisica(t.ruta_almacenamiento, t.nombre_original, t.tipo_mime);
    if (!fs.existsSync(rutaFS)) {
      throw new Error(`Archivo no encontrado: ${rutaFS} (desde rutaBD=${t.ruta_almacenamiento})`);
    }

    const texto = await extraerTexto(t.tipo_mime, rutaFS, t.nombre_original);
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

/** Ciclo principal del worker: busca tareas pendientes y las procesa en lotes. */
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

// iniciar loop
ciclo();
