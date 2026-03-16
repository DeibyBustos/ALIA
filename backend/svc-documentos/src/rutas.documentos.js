import express from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ejecutar, consultar } from "../../libreria-compartida/src/db.js";
import {
  calcularRutasParaGuardar,
  resolverRutaFSDesdeDB
} from "../../libreria-compartida/src/almacenamiento.js";
import { logger } from "../../libreria-compartida/src/logger.js";

const router = express.Router();

/** ===== Multer (tmp local por servicio) ===== */
const TMP_DIR = "tmp";
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const upload = multer({
  dest: TMP_DIR + "/",
  limits: { fileSize: (Number(process.env.MAX_FILE_MB || 32)) * 1024 * 1024 }
});

/** ===== Utilidades ===== */
function deducirTipo(mime, nombre) {
  const n = (nombre || "").toLowerCase();
  const m = (mime || "").toLowerCase();

  if (m.includes("pdf") || n.endsWith(".pdf")) return "pdf_generico";
  if (m.includes("word") || n.endsWith(".docx") || n.endsWith(".doc")) return "word_generico";
  if (m.includes("text") || n.endsWith(".txt") || n.endsWith(".md")) return "txt_generico";
  if (n.endsWith(".xlsx") || n.endsWith(".xls") || n.endsWith(".csv") || m.includes("spreadsheet"))
    return "excel_generico";
  return "archivo_generico";
}

async function checksumArchivo(ruta) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(ruta);
    stream.on("data", chunk => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

/** ===== POST /documentos (alias POST /) =====
 * 1) Guarda el archivo en FS centralizado (backend/storage/AAAA-MM/...)
 * 2) Inserta registro en `documentos` con ruta relativa (storage/AAAA-MM/...)
 * 3) Crea tarea en `tareas_ingesta` (PENDIENTE)
 */
async function postDocumentoHandler(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: "Archivo requerido (campo 'file')" });

    const { originalname, mimetype, path: tmpPath, size } = req.file;

    // DEBUG: Ver qué llega en req.body
    logger.info({ 
      body: req.body, 
      etiquetas: req.body.etiquetas,
      etiquetasType: typeof req.body.etiquetas 
    }, "📦 Datos recibidos en POST /documentos");

    // Rutas coherentes (rutaFS absoluta para disco, rutaDB relativa para BD)
    const { rutaFS, rutaDB } = calcularRutasParaGuardar(originalname);

    // mover tmp -> storage
    fs.mkdirSync(path.dirname(rutaFS), { recursive: true });
    fs.renameSync(tmpPath, rutaFS);

    // checksum sha256
    const checksum = await checksumArchivo(rutaFS);

    const titulo = (req.body.titulo || originalname).trim();
    const tipo_documento = deducirTipo(mimetype, originalname);

    // etiquetas: aceptar JSON o string crudo
    let etiquetas = null;
    const etiquetasRaw = req.body.etiquetas;
    
    if (etiquetasRaw) {
      logger.info({ etiquetasRaw }, "🔍 Procesando etiquetas");
      
      // Si ya es string que parece JSON, parsearlo y re-stringify para validar
      if (typeof etiquetasRaw === 'string') {
        try { 
          const parsed = JSON.parse(etiquetasRaw);
          etiquetas = JSON.stringify(parsed);
          logger.info({ parsed, etiquetas }, "✅ Etiquetas parseadas como JSON");
        } catch (e) { 
          // Si no es JSON válido, guardarlo como objeto con raw
          etiquetas = JSON.stringify({ raw: String(etiquetasRaw) });
          logger.warn({ etiquetasRaw, error: e.message }, "⚠️ Etiquetas no son JSON válido, guardando como raw");
        }
      } 
      // Si es objeto, stringify directamente
      else if (typeof etiquetasRaw === 'object') {
        etiquetas = JSON.stringify(etiquetasRaw);
        logger.info({ etiquetas }, "✅ Etiquetas guardadas como objeto");
      }
    } else {
      logger.info("ℹ️ No se recibieron etiquetas");
    }

    logger.info({ 
      titulo, 
      tipo_documento, 
      rutaDB, 
      etiquetas, 
      etiquetasFinal: etiquetas 
    }, "💾 Insertando documento en BD");

    const r = await ejecutar(
      `INSERT INTO documentos
       (titulo, tipo_documento, ruta_almacenamiento, nombre_original, tipo_mime, tamano_bytes, checksum_sha256, etiquetas, activo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [titulo, tipo_documento, rutaDB, originalname, mimetype, size, checksum, etiquetas]
    );
    const id_documento = r.insertId;

    // Verificar que se guardó
    const [docGuardado] = await consultar(
      `SELECT id, etiquetas FROM documentos WHERE id = ?`, 
      [id_documento]
    );
    logger.info({ 
      id_documento, 
      etiquetasGuardadas: docGuardado?.etiquetas 
    }, "Documento insertado, verificando etiquetas");

    const t = await ejecutar(
      `INSERT INTO tareas_ingesta (id_documento, estado, mensaje_error)
       VALUES (?, 'PENDIENTE', NULL)`,
      [id_documento]
    );

    res.status(201).json({
      id_documento,
      id_tarea: t.insertId,
      titulo,
      nombre_original: originalname,
      tipo_mime: mimetype,
      tamano_bytes: size,
      tipo_documento,
      checksum,
      ruta_almacenamiento: rutaDB,
      etiquetas: etiquetas // Añadido para debug
    });
  } catch (err) {
    logger.error({ err, stack: err.stack }, "❌ Error subiendo documento");
    // limpieza tmp si algo falló antes de mover
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }
    res.status(500).json({ error: "No se pudo subir el documento", detalle: err.message });
  }
}

/** ===== GET /documentos (alias GET /) ===== */
async function getDocumentosHandler(_req, res) {
  const filas = await consultar(
    `SELECT id, titulo, nombre_original, tipo_mime, tamano_bytes, checksum_sha256, etiquetas, creado_en
     FROM documentos
     ORDER BY id DESC
     LIMIT 100`
  );
  res.json(filas);
}

/** ===== GET /documentos/:id ===== (metadatos) */
async function getDocumentoMeta(req, res) {
  const { id } = req.params;
  const [doc] = await consultar(
    `SELECT id, titulo, tipo_documento, ruta_almacenamiento, nombre_original, tipo_mime, tamano_bytes, checksum_sha256, etiquetas, creado_en
     FROM documentos WHERE id = ? LIMIT 1`, [id]
  );
  if (!doc) return res.status(404).json({ error: "Documento no encontrado" });
  res.json(doc);
}

/** ===== GET /documentos/:id/descarga ===== (stream del archivo) */
async function descargarDocumento(req, res) {
  const { id } = req.params;
  const [doc] = await consultar(
    `SELECT nombre_original, tipo_mime, ruta_almacenamiento
     FROM documentos WHERE id = ? LIMIT 1`, [id]
  );
  if (!doc) return res.status(404).json({ error: "Documento no encontrado" });

  const rutaFS = resolverRutaFSDesdeDB(doc.ruta_almacenamiento);
  if (!fs.existsSync(rutaFS)) {
    return res.status(404).json({ error: "Archivo no existe en el almacenamiento" });
  }

  res.setHeader("Content-Type", doc.tipo_mime || "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(doc.nombre_original)}"`);
  const stream = fs.createReadStream(rutaFS);
  stream.on("error", () => res.status(500).end());
  stream.pipe(res);
}

/** ===== Rutas con prefijo /documentos ===== */
router.post("/documentos", upload.single("file"), postDocumentoHandler);
router.get("/documentos", getDocumentosHandler);
router.get("/documentos/:id", getDocumentoMeta);
router.get("/documentos/:id/descarga", descargarDocumento);

/** ===== Alias sin prefijo (por si llamas directo al servicio) ===== */
router.post("/", upload.single("file"), postDocumentoHandler);
router.get("/", getDocumentosHandler);

export default router;