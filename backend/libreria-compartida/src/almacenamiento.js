// libreria-compartida/src/almacenamiento.js
import fs from "node:fs";
import path from "node:path";
import slugify from "slugify";

/**
 * BASE para escribir en disco (no se guarda en BD).
 * Déjalo relativo al repo (por ejemplo, backend/storage) o usa env.
 * NO guardamos esta ruta en la BD.
 */
export const STORAGE_FS_BASE =
  process.env.STORAGE_FS_BASE || path.resolve(process.cwd(), "../storage");

/**
 * Prefijo que guardamos en BD 
 * Lo que verás en DB será 'storage/YYYY-MM/archivo.ext'
 */
export const STORAGE_DB_PREFIX = process.env.STORAGE_DB_PREFIX || "storage";

/** Asegura que exista la carpeta base en disco */
if (!fs.existsSync(STORAGE_FS_BASE)) fs.mkdirSync(STORAGE_FS_BASE, { recursive: true });

/**
 * Calcula rutas coherentes:
 * - rutaDB:  'storage/YYYY-MM/<ts>-<slug><ext>' (RELATIVA) -> se guarda en BD
 * - rutaFS:  '<FS_BASE>/YYYY-MM/<ts>-<slug><ext>' (ABSOLUTA) -> se usa para fs.write/move
 * Devuelve { rutaDB, rutaFS }.
 */
export function calcularRutasParaGuardar(nombreOriginal) {
  const fecha = new Date();
  const carpetaMes = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;

  const { name, ext } = path.parse(nombreOriginal);
  const base = slugify(name, { lower: true, strict: true });  
  const extLimpia = (ext || "").toLowerCase();         
  const fileName = `${Date.now()}-${base}${extLimpia}`;

  const rutaDB = path.posix.join(STORAGE_DB_PREFIX, carpetaMes, fileName); 
  const rutaFS = path.join(STORAGE_FS_BASE, carpetaMes, fileName);         

  // crea carpeta del mes si no existe
  const dirMes = path.dirname(rutaFS);
  if (!fs.existsSync(dirMes)) fs.mkdirSync(dirMes, { recursive: true });

  return { rutaDB, rutaFS };
}

/**
 * Convierte una ruta RELATIVA guardada en BD a ruta de FS ABSOLUTA.
 * Soporta tanto 'storage/..' como 'storage\..'
 */
export function resolverRutaFSDesdeDB(rutaDB) {
  // quita prefijo 'storage/' o 'storage\' si viniera
  const sinPrefijo = String(rutaDB || "").replace(/^\.?[/\\]?storage[/\\]?/i, "");
  return path.join(STORAGE_FS_BASE, sinPrefijo);
}
