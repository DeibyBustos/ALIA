/**
 * Utilidad para comparar la similitud entre textos
 * Se usa para encontrar respuestas relevantes comparando
 * las preguntas del usuario con preguntas almacenadas
 */
export function coseno(a, b) {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
