/**
 * Manejo del almacenamiento de archivos
 * Genera rutas únicas para guardar archivos organizados por fecha
 * El directorio base se configura con STORAGE_DIR o usa './storage' 
 */
import fs from "node:fs";
import path from "node:path";
import slugify from "slugify";

const baseDir = process.env.STORAGE_DIR || "./storage";
if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });

/**
 * Genera una ruta única para guardar un archivo
 * Organiza los archivos en carpetas por año-mes
 * @param {string} nombreOriginal - Nombre del archivo a guardar
 * @returns {string} Ruta completa donde se guardará el archivo
 */
export function rutaParaGuardar(nombreOriginal) {
  const fecha = new Date();
  const carpeta = path.join(baseDir, `${fecha.getFullYear()}-${fecha.getMonth()+1}`);
  if (!fs.existsSync(carpeta)) fs.mkdirSync(carpeta, { recursive: true });
  const base = slugify(nombreOriginal, { lower: true, strict: true });
  return path.join(carpeta, `${Date.now()}-${base}`);
}
