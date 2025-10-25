import { openai } from '../../../libreria-compartida/src/openai.js';
import { logger } from '../../../libreria-compartida/src/logger.js';

/**
 * Extrae parámetros del mensaje usando IA
 */
export async function extraerParametros(mensaje, intencion) {

  const ejemplosSegunIntencion = {
    generar_excel_estudiantes: `
Ejemplo: "Genera un Excel de los estudiantes de 6A"
Parámetros necesarios: grado (ej: 6A, 7B, etc), periodo_id (opcional, por defecto 1)
`,
    insertar_calificacion: `
Ejemplo: "Agrega una nota de 4.5 al estudiante Juan Pérez en Matemáticas"
Parámetros necesarios: estudiante_nombre, asignatura, nota, tipo_evaluacion (opcional)
`,
    generar_excel_calificaciones: `
Ejemplo: "Genera un Excel con las calificaciones del curso 5A de Matemáticas"
Parámetros necesarios: grado, asignatura, periodo (opcional)
`,
    consultar_notas: `
Ejemplo: "¿Cuáles son las notas de María García en el período 1?"
Parámetros necesarios: estudiante_nombre, periodo (opcional), asignatura (opcional)
`
  };

  const ejemplos = ejemplosSegunIntencion[intencion] || '';

  const prompt = `Eres un asistente que extrae parámetros de mensajes en lenguaje natural.

Intención detectada: ${intencion}
${ejemplos}

Mensaje del usuario: "${mensaje}"

Extrae los parámetros relevantes y responde SOLO en formato JSON, sin texto adicional.

Ejemplo de respuesta:
{
  "estudiante_nombre": "Juan Pérez",
  "asignatura": "Matemáticas",
  "nota": 4.5,
  "grado": "5A",
  "fecha": "2025-10-25"
}

Si un parámetro no está presente, usa null.`;

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 300
    });

    const parametrosStr = response.choices[0]?.message?.content.trim();
    const parametros = JSON.parse(parametrosStr);

    logger.info({ mensaje, intencion, parametros }, '📊 Parámetros extraídos');

    return parametros;
  } catch (err) {
    logger.error({ err }, '❌ Error extrayendo parámetros');
    return {};
  }
}