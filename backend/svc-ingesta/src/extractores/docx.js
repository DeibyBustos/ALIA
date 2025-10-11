import { readFile } from "node:fs/promises";
import mammoth from "mammoth";

export async function extraerDOCX(ruta) {
  const buf = await readFile(ruta);
  const { value } = await mammoth.extractRawText({ buffer: buf });
  return value || "";
}
