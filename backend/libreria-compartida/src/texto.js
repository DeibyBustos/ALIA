// libreria-compartida/src/texto.js
export function normalizarEspacios(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

export function trocearTexto(texto, tam = 800, sobre = 120) {
  const limpio = normalizarEspacios(texto);
  const chunks = [];
  let i = 0;
  while (i < limpio.length) {
    const fin = Math.min(i + tam, limpio.length);
    let slice = limpio.slice(i, fin);
    const ultPunto = slice.lastIndexOf(". ");
    if (fin < limpio.length && ultPunto > tam * 0.6) {
      slice = slice.slice(0, ultPunto + 1);
    }
    chunks.push(slice);
    i += Math.max(1, slice.length - sobre);
  }
  return chunks;
}
