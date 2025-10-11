// libreria-compartida/src/almacenamiento.js
import fs from "node:fs";
import path from "node:path";
import slugify from "slugify";

const baseDirRaw = process.env.STORAGE_DIR || "./storage";
// Asegura ruta absoluta
export const STORAGE_DIR = path.isAbsolute(baseDirRaw)
  ? baseDirRaw
  : path.resolve(process.cwd(), baseDirRaw);

// Crea carpeta base si no existe
if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });

/**
 * Genera una ruta ABSOLUTA para guardar el archivo preservando la extensión.
 * - Carpeta por mes: YYYY-MM
 * - Nombre: <timestamp>-<slug-del-nombre-sin-ext><ext>
 */
export function rutaParaGuardar(nombreOriginal) {
  const fecha = new Date();
  const carpetaMes = path.join(STORAGE_DIR, `${fecha.getFullYear()}-${String(fecha.getMonth()+1).padStart(2, "0")}`);
  if (!fs.existsSync(carpetaMes)) fs.mkdirSync(carpetaMes, { recursive: true });

  const { name, ext } = path.parse(nombreOriginal);
  const base = slugify(name, { lower: true, strict: true }); // sin puntos
  const extLimpia = (ext || "").toLowerCase(); // mantiene .xlsx, .txt, .pdf, etc.

  const filename = `${Date.now()}-${base}${extLimpia}`;
  return path.join(carpetaMes, filename); // ABSOLUTO
}
