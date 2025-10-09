import "dotenv/config";
import OpenAI from "openai";

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Convierte un texto en un vector numérico usando el modelo de embeddings de OpenAI
 * @param {string} texto - Texto a convertir
 * @param {string} modelo - Modelo de embeddings a usar  text-embedding-3-small
 * @returns {Promise<number[]>} Vector numérico que representa el texto
 */
export async function embeddingTexto(texto, modelo = process.env.MODELO_EMBEDDINGS || "text-embedding-3-small") {
  const r = await openai.embeddings.create({ model: modelo, input: texto });
  return r.data[0].embedding; // float[]
}

/**
 * Genera una respuesta a una pregunta basándose en un contexto específico
 * @param {string} pregunta - Pregunta a responder
 * @param {string} contexto - Contexto para responder la pregunta
 * @param {string} modelo - Modelo de chat a usar  gpt-4o-mini
 * @returns {Promise<string>} Respuesta generada
 */
export async function chatConContexto(pregunta, contexto, modelo = process.env.MODELO_CHAT || "gpt-4o-mini") {
  const sistema = `Eres un asistente que responde basándose estrictamente en el CONTEXTO.
Si la respuesta no está en el contexto, dilo explícitamente.`;
  const r = await openai.chat.completions.create({
    model: modelo,
    messages: [
      { role: "system", content: sistema },
      { role: "user", content: `CONTEXTO:\n${contexto}\n\nPREGUNTA: ${pregunta}` }
    ],
    temperature: 0.2
  });
  return r.choices[0]?.message?.content?.trim() ?? "";
}
