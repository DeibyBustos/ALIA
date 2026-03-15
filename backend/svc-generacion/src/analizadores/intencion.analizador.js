import { openai } from '../../../libreria-compartida/src/openai.js';
import { logger } from '../../../libreria-compartida/src/logger.js';

/**
 * Detecta la intención del usuario usando IA
 */
export async function analizarIntencion(mensaje) {
  const prompt = `Eres un asistente académico. Analiza el siguiente mensaje y determina la intención del usuario.

Intenciones posibles:
- "generar_excel_estudiantes": Usuario quiere GENERAR un Excel con lista de estudiantes
- "generar_pdf_estudiantes": Usuario quiere GENERAR un PDF con lista de estudiantes
- "generar_excel_calificaciones": Usuario quiere GENERAR un Excel con calificaciones
- "generar_excel_asistencias": Usuario quiere GENERAR un Excel con asistencias
- "generar_excel_horario": Usuario quiere GENERAR un Excel con horarios
- "generar_pdf_boletin": Usuario quiere un boletín de calificaciones en PDF (de UN estudiante específico)
- "generar_pdf_certificado": Usuario quiere un certificado académico
- "generar_word_informe": Usuario quiere un informe académico en Word
- "insertar_calificacion": Usuario quiere agregar una nota/calificación
- "eliminar_calificacion": Usuario quiere eliminar una nota
- "insertar_asistencia": Usuario quiere registrar asistencia
- "consultar_estudiantes_grado": Usuario quiere CONSULTAR cuántos/qué estudiantes hay en un grado (sin generar archivo)
- "consultar_notas": Usuario quiere consultar calificaciones de un estudiante
- "consultar_asistencias": Usuario quiere consultar asistencias de un estudiante
- "consultar_materias_estudiante": Usuario pregunta qué materias o asignaturas tiene o ve un estudiante
- "consultar_acudiente": Usuario pregunta por el acudiente, padre, madre o tutor de un estudiante
- "consultar_info_estudiante": Usuario pregunta información general o datos de un estudiante específico
- "consultar_horario_estudiante": Usuario pregunta el horario de clases de un estudiante
- "recomendar": Usuario solicita recomendaciones académicas
- "consulta_general": Pregunta general sobre el sistema académico que NO involucra datos de un estudiante específico (usa esta SOLO si no encaja en ninguna otra)

REGLAS IMPORTANTES — aplica la primera que coincida:
- Si pregunta "qué materias tiene X", "qué asignaturas ve X", "en qué materias está X" → "consultar_materias_estudiante"
- Si pregunta "quién es el acudiente de X", "quién es el padre/madre/tutor de X", "cómo se llama el acudiente de X" → "consultar_acudiente"
- Si pregunta "cuántos estudiantes hay en X" o "qué estudiantes hay en X" → "consultar_estudiantes_grado"
- Si pregunta "información de X", "datos de X", "quién es X" (siendo X un estudiante) → "consultar_info_estudiante"
- Si pregunta "horario de X" o "a qué horas tiene clases X" → "consultar_horario_estudiante"
- Si pregunta "notas de X", "calificaciones de X" → "consultar_notas"
- Si pregunta "asistencias de X", "faltas de X" → "consultar_asistencias"
- Si pide "genera/genérame/crea un Excel/PDF" → usa la intención de generación correspondiente

Mensaje del usuario: "${mensaje}"

Responde SOLO con el nombre de la intención detectada, sin explicaciones adicionales.`;

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 50
    });

    const intencion = response.choices[0]?.message?.content.trim().toLowerCase();
    logger.info({ mensaje, intencion }, '🎯 Intención detectada');

    return intencion;
  } catch (err) {
    logger.error({ err }, '❌ Error analizando intención');
    return 'consulta_general';
  }
}