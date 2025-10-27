import { openai } from '../../../libreria-compartida/src/openai.js';
import { logger } from '../../../libreria-compartida/src/logger.js';

/**
 * Detecta la intención del usuario usando IA
 */
export async function analizarIntencion(mensaje) {
  const prompt = `Eres un asistente académico. Analiza el siguiente mensaje y determina la intención del usuario.

Intenciones posibles:
- "generar_excel_estudiantes": Usuario quiere generar un Excel con lista de estudiantes
- "generar_pdf_estudiantes": Usuario quiere generar un PDF con lista de estudiantes
- "generar_excel_calificaciones": Usuario quiere generar un Excel con calificaciones
- "generar_excel_asistencias": Usuario quiere generar un Excel con asistencias
- "generar_excel_horario": Usuario quiere generar un Excel con horarios
- "generar_pdf_boletin": Usuario quiere un boletín de calificaciones en PDF (de UN estudiante específico)
- "generar_pdf_certificado": Usuario quiere un certificado académico
- "generar_word_informe": Usuario quiere un informe académico en Word
- "insertar_calificacion": Usuario quiere agregar una nota/calificación
- "eliminar_calificacion": Usuario quiere eliminar una nota
- "insertar_asistencia": Usuario quiere registrar asistencia
- "consultar_notas": Usuario quiere consultar calificaciones
- "consultar_asistencias": Usuario quiere consultar asistencias
- "recomendar": Usuario solicita recomendaciones académicas
- "consulta_general": Pregunta general sobre el sistema académico

Mensaje del usuario: "${mensaje}"

Responde SOLO con el nombre de la intención detectada, sin explicaciones adicionales.`;

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 50
    });

    const intencion = response.choices[0]?.message?.content.trim();
    logger.info({ mensaje, intencion }, '🎯 Intención detectada');

    return intencion;
  } catch (err) {
    logger.error({ err }, '❌ Error analizando intención');
    return 'consulta_general';
  }
}