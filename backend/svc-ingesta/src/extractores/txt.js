import { readFile } from "node:fs/promises";

export async function extraerTXT(ruta) {
  return (await readFile(ruta)).toString("utf8");
}
