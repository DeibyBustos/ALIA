import { openai } from '../../../libreria-compartida/src/openai.js';
import { logger } from '../../../libreria-compartida/src/logger.js';

/**
 * Extrae parámetros del mensaje usando IA
 */
export async function extraerParametros(mensaje, intencion) {
  const ejemplosSegunIntencion = {
    generar_excel_estudiantes: `
Ejemplo: "Genera un Excel de los estudiantes de 6A"
Parámetros necesarios:
- grado: "6A"
- periodo: opcional
`,

    generar_pdf_estudiantes: `
Ejemplo: "Genera un PDF de los estudiantes de 6A"
Parámetros necesarios:
- grado: "6A"
- periodo: opcional
`,

    insertar_calificacion: `
Ejemplo: "Agrega una nota de 4.5 al estudiante Juan Pérez en Matemáticas"
Parámetros necesarios:
- estudiante_nombre: "Juan Pérez"
- asignatura: "Matemáticas"
- nota: 4.5
- tipo_evaluacion: opcional
`,

    generar_excel_calificaciones: `
Ejemplo: "Genera un Excel con las calificaciones del curso 5A de Matemáticas"
Parámetros necesarios:
- grado: "5A"
- asignatura: "Matemáticas"
- periodo: opcional
`,

    consultar_notas: `
Ejemplo: "¿Cuáles son las notas de María García en el período 1?"
Parámetros necesarios:
- estudiante_nombre: "María García"
- periodo: opcional
- asignatura: opcional
`,

    consultar_asistencias: `
Ejemplo: "Muéstrame las asistencias de Juan Pérez"
Parámetros necesarios:
- estudiante_nombre: "Juan Pérez"
- periodo: opcional
`,

    consultar_materias_estudiante: `
Ejemplo: "¿Qué materias tiene Juan Pérez?"
Parámetros necesarios:
- estudiante_nombre: "Juan Pérez"
- periodo: opcional
`,

    consultar_acudiente: `
Ejemplo: "¿Quién es el acudiente de María López?"
Parámetros necesarios:
- estudiante_nombre: "María López"
`,

    consultar_info_estudiante: `
Ejemplo: "Dame la información de Juan Pérez"
Parámetros necesarios:
- estudiante_nombre: "Juan Pérez"
`,

    consultar_estudiantes_grado: `
Ejemplo: "¿Qué estudiantes hay en 7A?"
Parámetros necesarios:
- grado: "7A"
- periodo: opcional
`,

    consultar_horario_estudiante: `
Ejemplo: "¿Cuál es el horario de Juan Pérez?"
Parámetros necesarios:
- estudiante_nombre: "Juan Pérez"
- periodo: opcional
- dia_semana: opcional
`,

    consultar_horario_docente: `
Ejemplo 1: "¿Cuál es el horario de Ana Torres?"
Respuesta esperada:
{
  "docente_nombre": "Ana Torres",
  "curso": null,
  "periodo": null,
  "asignatura": null,
  "dia_semana": null
}

Ejemplo 2: "Dime en qué aula tengo clase con 7A como docente Ana Torres"
Respuesta esperada:
{
  "docente_nombre": "Ana Torres",
  "curso": "7A",
  "periodo": null,
  "asignatura": null,
  "dia_semana": null
}

Ejemplo 3: "¿Qué clases tiene Ana Torres el lunes?"
Respuesta esperada:
{
  "docente_nombre": "Ana Torres",
  "curso": null,
  "periodo": null,
  "asignatura": null,
  "dia_semana": 1
}

Parámetros necesarios:
- docente_nombre
- curso: opcional
- periodo: opcional
- asignatura: opcional
- dia_semana: opcional (1=Lunes, 2=Martes, 3=Miércoles, 4=Jueves, 5=Viernes, 6=Sábado, 7=Domingo)
`,

    generar_excel_horario: `
Ejemplo: "Genera un Excel con el horario de 7A"
Parámetros necesarios:
- grado: "7A"
- periodo: opcional
`
  };

  const ejemplos = ejemplosSegunIntencion[intencion] || '';

  const prompt = `Eres un asistente que extrae parámetros de mensajes en lenguaje natural.

Intención detectada: ${intencion}
${ejemplos}

Mensaje del usuario: "${mensaje}"

Instrucciones:
- Responde SOLO con un JSON válido.
- No incluyas texto antes ni después del JSON.
- Si un parámetro no está presente, usa null.
- Si detectas un nombre de estudiante, usa la clave "estudiante_nombre".
- Si detectas un nombre de docente, usa la clave "docente_nombre".
- Si detectas un curso como 6A, 7B, 10C, usa la clave "curso" o "grado" según la intención.
- Si detectas un día de la semana, conviértelo a número:
  1=Lunes, 2=Martes, 3=Miércoles, 4=Jueves, 5=Viernes, 6=Sábado, 7=Domingo.
- Conserva los nombres propios exactamente como aparezcan.

Ejemplo general de respuesta:
{
  "estudiante_nombre": "Juan Pérez",
  "docente_nombre": null,
  "asignatura": "Matemáticas",
  "nota": 4.5,
  "grado": "5A",
  "curso": null,
  "periodo": null,
  "dia_semana": null,
  "fecha": null
}`;

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 300,
      response_format: { type: 'json_object' }
    });

    const parametrosStr = response.choices[0]?.message?.content?.trim() || '{}';
    const parametros = JSON.parse(parametrosStr);

    logger.info({ mensaje, intencion, parametros }, '📊 Parámetros extraídos');
    return parametros;
  } catch (err) {
    logger.error({ err }, '❌ Error extrayendo parámetros');
    return {};
  }
}