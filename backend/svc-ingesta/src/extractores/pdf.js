// backend/svc-ingesta/src/extractores/pdf.js
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// Cargar pdf-parse (CJS) desde ESM:
const pdfParse = require("pdf-parse");

export async function extraerPDF(ruta) {
  const buf = await readFile(ruta);
  const data = await pdfParse(buf);
  return data.text || "";
}
