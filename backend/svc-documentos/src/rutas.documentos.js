import express from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ejecutar, consultar } from "../../libreria-compartida/src/db.js";
import { calcularRutasParaGuardar } from "../../libreria-compartida/src/almacenamiento.js";
import { logger } from "../../libreria-compartida/src/logger.js";

const router = express.Router();

/** Asegurar carpeta temporal para Multer */
const TMP_DIR = "tmp";
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

/** Configuración de subida con Multer */
const upload = multer({
  dest: TMP_DIR + "/",
  limits: { fileSize: (Number(process.env.MAX_FILE_MB || 32)) * 1024 * 1024 }
});

/** Utils */
function deducirTipo(mime, nombre) {
  const n = (nombre || "").toLowerCase();
  if (mime?.includes("pdf") || n.endsWith(".pdf")) return "pdf_generico";
  if (mime?.includes("word") || n.endsWith(".docx") || n.endsWith(".doc")) return "word_generico";
  if (mime?.includes("text") || n.endsWith(".txt") || n.endsWith(".md")) return "txt_generico";
  if (n.endsWith(".xlsx") || n.endsWith(".xls") || n.endsWith(".csv")) return "excel_generico";
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

/**
 * POST /documentos  (alias POST /)
 * Sube el archivo, lo mueve a storage (FS), crea registro en `documentos` (ruta relativa)
 * y crea una `tareas_ingesta` en estado PENDIENTE.
 */
async function postDocumentoHandler(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: "Archivo requerido (campo 'file')" });

    const { originalname, mimetype, path: tmpPath, size } = req.file;

    // Calcula rutas coherentes: rutaFS (para escribir) y rutaDB (para guardar en BD, relativa: storage/...)
    const { rutaFS, rutaDB } = calcularRutasParaGuardar(originalname);

    // mover a storage
    fs.mkdirSync(path.dirname(rutaFS), { recursive: true });
    fs.renameSync(tmpPath, rutaFS);

    // checksum sha256 sobre el archivo en disco
    const checksum = await checksumArchivo(rutaFS);

    const titulo = req.body.titulo?.trim() || originalname;
    const tipo_documento = deducirTipo(mimetype, originalname);

    // etiquetas: aceptar JSON válido o string crudo
    let etiquetas = null;
    if (req.body.etiquetas) {
      try { etiquetas = JSON.stringify(JSON.parse(req.body.etiquetas)); }
      catch { etiquetas = JSON.stringify({ raw: String(req.body.etiquetas) }); }
    }

    const r = await ejecutar(
      `INSERT INTO documentos
       (titulo, tipo_documento, ruta_almacenamiento, nombre_original, tipo_mime, tamano_bytes, checksum_sha256, etiquetas, activo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [titulo, tipo_documento, rutaDB, originalname, mimetype, size, checksum, etiquetas]
    );
    const id_documento = r.insertId;

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
      ruta_almacenamiento: rutaDB
    });
  } catch (err) {
    logger.error({ err }, "error subiendo documento");
    // limpiar tmp si quedó
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }
    res.status(500).json({ error: "No se pudo subir el documento" });
  }
}

/** GET /documentos  (alias GET /) — lista básica de documentos */
async function getDocumentosHandler(_req, res) {
  const filas = await consultar(
    `SELECT id, titulo, nombre_original, tipo_mime, tamano_bytes, checksum_sha256, creado_en
     FROM documentos
     ORDER BY id DESC
     LIMIT 100`
  );
  res.json(filas);
}

/** Rutas “oficiales” con prefijo /documentos */
router.post("/documentos", upload.single("file"), postDocumentoHandler);
router.get("/documentos", getDocumentosHandler);

/** Alias sin prefijo, por si el proxy quita /documentos o llamas directo al servicio */
router.post("/", upload.single("file"), postDocumentoHandler);
router.get("/", getDocumentosHandler);

export default router;
