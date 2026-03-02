import { consultar } from '../../../libreria-compartida/src/db.js';
import { openai } from '../../../libreria-compartida/src/openai.js';

/**
 * Genera recomendaciones académicas basadas en el rendimiento
 */
export async function generarRecomendaciones(estudianteId, periodoId) {
  // Obtener datos del estudiante
  const [estudiante] = await consultar(`
    SELECT e.*, g.etiqueta as grado
    FROM estudiantes e
    JOIN matriculas m ON m.estudiante_id = e.id
    JOIN grados g ON g.id = m.grado_id
    WHERE e.id = ? AND m.periodo_id = ?
  `, [estudianteId, periodoId]);

  // Obtener calificaciones
  const calificaciones = await consultar(`
    SELECT a.nombre as asignatura, AVG(c.nota) as promedio,
           MIN(c.nota) as minima, MAX(c.nota) as maxima,
           COUNT(*) as num_evaluaciones
    FROM calificaciones c
    JOIN evaluaciones ev ON ev.id = c.evaluacion_id
    JOIN cursos cur ON cur.id = ev.curso_id
    JOIN asignaturas a ON a.id = cur.asignatura_id
    JOIN inscripciones i ON i.curso_id = cur.id AND i.estudiante_id = c.estudiante_id
    WHERE c.estudiante_id = ? AND i.periodo_id = ?
    GROUP BY a.id, a.nombre
  `, [estudianteId, periodoId]);

  // Obtener asistencias
  const [asistencias] = await consultar(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN estado = 'ASISTE' THEN 1 ELSE 0 END) as asistencias,
      SUM(CASE WHEN estado = 'AUSENTE' THEN 1 ELSE 0 END) as ausencias,
      SUM(CASE WHEN estado = 'TARDE' THEN 1 ELSE 0 END) as tardes
    FROM asistencias a
    JOIN inscripciones i ON i.curso_id = a.curso_id AND i.estudiante_id = a.estudiante_id
    WHERE a.estudiante_id = ? AND i.periodo_id = ?
  `, [estudianteId, periodoId]);

  // Crear prompt para IA
  const datosAcademicos = {
    estudiante: `${estudiante.nombres} ${estudiante.apellidos}`,
    grado: estudiante.grado,
    calificaciones,
    asistencias
  };

  const prompt = `Eres un asesor académico experto. Analiza los siguientes datos y genera recomendaciones personalizadas.

Datos del estudiante:
${JSON.stringify(datosAcademicos, null, 2)}

Genera:
1. Un análisis general del rendimiento académico
2. Fortalezas identificadas (asignaturas con mejor desempeño)
3. Áreas de mejora (asignaturas con bajo rendimiento)
4. Recomendaciones específicas y accionables
5. Alertas si hay situaciones críticas (ej: muchas ausencias, notas muy bajas)

Responde en formato JSON con esta estructura:
{
  "analisis_general": "texto",
  "fortalezas": ["texto", "texto"],
  "areas_mejora": ["texto", "texto"],
  "recomendaciones": ["texto", "texto"],
  "alertas": ["texto", "texto"]
}`;

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 1000
  });

  const recomendacionesStr = response.choices[0]?.message?.content.trim();
  const recomendaciones = JSON.parse(recomendacionesStr);

  return {
    estudiante: datosAcademicos.estudiante,
    grado: datosAcademicos.grado,
    ...recomendaciones
  };
}