import OpenAI from "openai";
import { logger } from "./logger.js";

const apiKey  = process.env.OPENAI_API_KEY;
const timeout = Number(process.env.OPENAI_TIMEOUT_MS || 30000);
const useResp = String(process.env.OPENAI_USE_RESPONSES_API || "true").toLowerCase() === "true";

const chatModel  = process.env.OPENAI_CHAT_MODEL  || "gpt-4o-mini-2024-07-18";
const embedModel = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";

const maxTokens = Number(process.env.OPENAI_MAX_TOKENS || 3000);
const temperature = Number(process.env.OPENAI_TEMPERATURE || 0.9);

if (!apiKey) {
  logger.warn("OPENAI_API_KEY no está definido. El modo LLM quedará degradado.");
} else {
  logger.info({
    chatModel, embedModel, useResp, timeout, maxTokens, temperature
  }, "openai: configuración de modelos");
}

export const openai = new OpenAI({ apiKey, timeout });

export async function embeddingTexto(texto) {
  const input = String(texto ?? "").slice(0, 30000);
  if (!apiKey) return [];
  try {
    const r = await openai.embeddings.create({ model: embedModel, input });
    return r.data[0]?.embedding ?? [];
  } catch (err) {
    logger.error({ err }, "Fallo en embeddings");
    throw new Error("OPENAI_EMBED_ERROR");
  }
}

export async function responderConContexto(pregunta, contexto) {
  const sistema = `Eres un asistente académico experto que proporciona respuestas exhaustivas y bien fundamentadas.

INSTRUCCIONES CRÍTICAS:
✓ Proporciona respuestas COMPLETAS y DETALLADAS de al menos 3-4 párrafos
✓ Utiliza TODA la información relevante disponible en el contexto
✓ Explica conceptos con claridad, incluyendo antecedentes y contexto necesario
✓ Desarrolla cada aspecto de la pregunta de manera exhaustiva
✓ Incluye ejemplos específicos, datos concretos y detalles cuando estén disponibles
✓ Organiza tu respuesta en párrafos bien estructurados
✓ Sintetiza información de TODOS los fragmentos relevantes
✓ Si hay múltiples aspectos en la pregunta, aborda CADA UNO detalladamente

✗ NO proporciones respuestas cortas o superficiales
✗ NO omitas información relevante del contexto
✗ NO des respuestas de un solo párrafo a menos que la pregunta sea extremadamente simple

Si el contexto no contiene información suficiente para responder completamente, indícalo claramente y explica qué información está disponible y qué falta.`;

  if (!apiKey) {
    return { respuesta: "(LLM deshabilitado: falta OPENAI_API_KEY). Devuelvo solo recuperación." };
  }

  try {
    if (useResp) {
      const resp = await openai.responses.create({
        model: chatModel,
        input: [
          { role: "system", content: sistema },
          {
            role: "user",
            content:
              `PREGUNTA DEL USUARIO:\n${pregunta}\n\n` +
              `CONTEXTO (Fragmentos de documentos relevantes):\n${contexto}\n\n` +
              `Proporciona una respuesta COMPLETA y DETALLADA basada en toda la información disponible en el contexto. ` +
              `Desarrolla tu respuesta extensamente, asegurándote de cubrir todos los aspectos relevantes.`
          }
        ],
        temperature: temperature,
        max_tokens: maxTokens,
        store: false
      });
      return { respuesta: (resp.output_text || "").trim() };
    }

    // Fallback: Chat Completions
    const resp = await openai.chat.completions.create({
      model: chatModel,
      temperature: temperature,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: sistema },
        {
          role: "user",
          content:
            `PREGUNTA DEL USUARIO:\n${pregunta}\n\n` +
            `CONTEXTO (Fragmentos de documentos relevantes):\n${contexto}\n\n` +
            `Proporciona una respuesta COMPLETA y DETALLADA basada en toda la información disponible en el contexto. ` +
            `Desarrolla tu respuesta extensamente, asegurándote de cubrir todos los aspectos relevantes.`
        }
      ]
    });
    return { respuesta: resp.choices?.[0]?.message?.content?.trim() || "" };
  } catch (err) {
    // Manejo de errores
    const status = err?.status || err?.response?.status;
    const msg    = err?.message || (await err?.response?.text?.()) || String(err);
    logger.error({ status, msg, err }, "Fallo al invocar el modelo");
    return { respuesta: "(No se pudo consultar el LLM. Devuelvo solo recuperación.)" };
  }
}