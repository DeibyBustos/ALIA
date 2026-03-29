import OpenAI from "openai";
import { logger } from "./logger.js";
import { validarPregunta, RESPUESTA_FUERA_ALCANCE } from "./topicFilter.js"; 

const apiKey    = process.env.OPENAI_API_KEY;
const timeout   = Number(process.env.OPENAI_TIMEOUT_MS || 30000);
const useResp   = String(process.env.OPENAI_USE_RESPONSES_API || "true").toLowerCase() === "true";

const chatModel  = process.env.OPENAI_CHAT_MODEL  || "gpt-4o-mini-2024-07-18";
const embedModel = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";

const maxTokens   = Number(process.env.OPENAI_MAX_TOKENS    || 3000);
const temperature = Number(process.env.OPENAI_TEMPERATURE   || 0.9);

if (!apiKey) {
  logger.warn("OPENAI_API_KEY no está definido. El modo LLM quedará degradado.");
} else {
  logger.info({ chatModel, embedModel, useResp, timeout, maxTokens, temperature },
    "openai: configuración de modelos");
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

  const { bloqueada, motivo } = validarPregunta(pregunta);
  if (bloqueada) {
    logger.info({ pregunta, motivo }, "topicFilter: pregunta bloqueada");
    return { respuesta: RESPUESTA_FUERA_ALCANCE };
  }

  const sistema = `Eres un asistente académico escolar especializado EXCLUSIVAMENTE en apoyar el aprendizaje de estudiantes de colegio.

ALCANCE Y ENFOQUE:
✓ Solo responde preguntas relacionadas con materias escolares (matemáticas, ciencias, historia, lengua, geografía, etc.)
✓ Utiliza ÚNICAMENTE la información del contexto de documentos proporcionados
✓ Explica conceptos con claridad pedagógica, con antecedentes y ejemplos concretos
✓ Organiza las respuestas en párrafos bien estructurados
✓ Si hay múltiples aspectos en la pregunta, aborda CADA UNO detalladamente
✓ Sintetiza información de TODOS los fragmentos relevantes disponibles

TEMAS PERMITIDOS (solo estos):
✓ Materias académicas del currículo escolar
✓ Tareas, trabajos y explicaciones de contenido del colegio
✓ Dudas sobre conceptos vistos en clase
✓ Comprensión de textos o documentos académicos

LÍMITES ESTRICTOS — NUNCA hagas lo siguiente:
✗ NO respondas preguntas de entretenimiento, farándula, videojuegos, deportes u ocio
✗ NO generes contenido creativo ajeno al ámbito escolar (chistes, historias, canciones)
✗ NO des consejos personales, emocionales o de vida cotidiana
✗ NO respondas sobre política, noticias, religión ni temas controversiales
✗ NO generes código de programación salvo que sea parte de una materia escolar
✗ NO inventes información que no esté en el contexto proporcionado
✗ NO omitas información relevante disponible en el contexto

CUANDO LA PREGUNTA ESTÉ FUERA DEL ENTORNO ESCOLAR:
Responde SIEMPRE con este mensaje exacto:
"Estoy diseñado exclusivamente para el entorno educativo escolar. Solo puedo ayudarte con preguntas relacionadas a materias y contenidos del colegio. ¿Tienes alguna duda sobre tus estudios en la que pueda ayudarte?"

CUANDO EL CONTEXTO SEA INSUFICIENTE:
Indica claramente qué información está disponible y qué falta para responder completamente.`;

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
        temperature,
        max_tokens: maxTokens,
        store: false
      });

      const respuesta = (resp.output_text || "").trim();


      if (esRespuestaFueraDeAlcance(respuesta)) {
        return { respuesta: RESPUESTA_FUERA_ALCANCE };
      }

      return { respuesta };
    }

    const resp = await openai.chat.completions.create({
      model: chatModel,
      temperature,
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

    const respuesta = resp.choices?.[0]?.message?.content?.trim() || "";
    if (esRespuestaFueraDeAlcance(respuesta)) {
      return { respuesta: RESPUESTA_FUERA_ALCANCE };
    }
    return { respuesta };

  } catch (err) {
    const status = err?.status || err?.response?.status;
    const msg    = err?.message || (await err?.response?.text?.()) || String(err);
    logger.error({ status, msg, err }, "Fallo al invocar el modelo");
    return { respuesta: "(No se pudo consultar el LLM. Devuelvo solo recuperación.)" };
  }
}


function esRespuestaFueraDeAlcance(texto) {
  const señales = [
    "estoy diseñado exclusivamente para el entorno educativo",
    "no puedo ayudarte con eso",
    "ese tema está fuera de mi alcance",
    "solo puedo responder preguntas académicas",
  ];
  const norm = texto.toLowerCase();
  return señales.some((s) => norm.includes(s));
}