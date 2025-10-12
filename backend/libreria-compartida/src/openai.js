// backend/libreria-compartida/src/openai.js
import OpenAI from "openai";
import { logger } from "./logger.js";

const apiKey  = process.env.OPENAI_API_KEY;
const timeout = Number(process.env.OPENAI_TIMEOUT_MS || 30000);
const useResp = String(process.env.OPENAI_USE_RESPONSES_API || "true").toLowerCase() === "true";

const chatModel  = process.env.OPENAI_CHAT_MODEL  || "gpt-4o-mini-2024-07-18";
const embedModel = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";

if (!apiKey) {
  logger.warn("OPENAI_API_KEY no está definido. El modo LLM quedará degradado.");
} else {
  logger.info({
    chatModel, embedModel, useResp, timeout
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
  const sistema =
    "Eres un asistente escolar. Responde únicamente usando el CONTEXTO. " +
    "Si el contexto no contiene la respuesta, dilo explícitamente.";

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
              `PREGUNTA:\n${pregunta}\n\n` +
              `CONTEXTO (fragmentos relevantes):\n${contexto}\n\n` +
              "Responde breve y claro; si el contexto no alcanza, dilo."
          }
        ],
        temperature: 0.2,
        store: false
      });
      return { respuesta: (resp.output_text || "").trim() };
    }

    // Fallback: Chat Completions
    const resp = await openai.chat.completions.create({
      model: chatModel,
      temperature: 0.2,
      messages: [
        { role: "system", content: sistema },
        {
          role: "user",
          content:
            `PREGUNTA:\n${pregunta}\n\n` +
            `CONTEXTO (fragmentos relevantes):\n${contexto}\n\n` +
            "Responde breve y claro; si el contexto no alcanza, dilo."
        }
      ]
    });
    return { respuesta: resp.choices?.[0]?.message?.content?.trim() || "" };
  } catch (err) {
    // 👇 imprime detalle de OpenAI para saber si es 401/429/500/timeout
    const status = err?.status || err?.response?.status;
    const msg    = err?.message || (await err?.response?.text?.()) || String(err);
    logger.error({ status, msg, err }, "Fallo al invocar el modelo");
    return { respuesta: "(No se pudo consultar el LLM. Devuelvo solo recuperación.)" };
  }
}
