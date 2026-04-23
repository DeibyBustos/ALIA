import { openai } from '../../../libreria-compartida/src/openai.js';
import { logger } from '../../../libreria-compartida/src/logger.js';
import { validarPregunta, RESPUESTA_FUERA_ALCANCE } from '../../../libreria-compartida/src/topicFilter.js';
import { consultar } from '../../../libreria-compartida/src/db.js';

export async function analizarIntencion(mensaje) {

  const { bloqueada, motivo } = validarPregunta(mensaje);
  if (bloqueada) {
    logger.warn({ mensaje, motivo }, '🚫 Mensaje bloqueado por topicFilter');
    return 'fuera_de_alcance';
  }

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
- "consultar_horario_docente": Usuario pregunta por horario, aula, curso, día o asignatura de un docente
- "consultar_planeacion": Usuario quiere ver la planeación, plan de clase, contenidos, temas o actividades de un grado, curso o docente
- "recomendar": Usuario solicita recomendaciones académicas
- "consulta_general": Pregunta general sobre el sistema académico que NO encaja en ninguna otra

REGLAS IMPORTANTES — aplica la primera que coincida:
- Si pregunta "planeación de X", "plan de clase de X", "qué temas tiene X", "contenidos de X", "actividades del grado X", "dame la planeación", "planeación del docente X" → "consultar_planeacion"
- Si pregunta "qué materias tiene X", "qué asignaturas ve X", "en qué materias está X" → "consultar_materias_estudiante"
- Si pregunta "quién es el acudiente de X", "quién es el padre/madre/tutor de X" → "consultar_acudiente"
- Si pregunta "cuántos estudiantes hay en X" o "qué estudiantes hay en X" → "consultar_estudiantes_grado"
- Si pregunta "información de X", "datos de X", "quién es X" (siendo X un estudiante) → "consultar_info_estudiante"
- Si pregunta por el horario, aula, curso o asignatura de un DOCENTE → "consultar_horario_docente"
- Si pregunta "horario de X" o "a qué horas tiene clases X" y X es un estudiante → "consultar_horario_estudiante"
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

export function extraerParametrosPlaneacion(mensaje) {
  // Grado: "grado 7A", "del grado 7A", o suelto "7A"
  const regexGradoConPalabra = /(?:grado|curso|del\s+grado|de\s+grado)\s*([1-9][0-9]?\s*[a-zA-Z])\b/i;
  const regexGradoSuelto     = /\b([1-9][0-9]?)\s*([A-Z])\b/i;
  const matchGradoPalabra    = mensaje.match(regexGradoConPalabra);
  const matchGradoSuelto     = mensaje.match(regexGradoSuelto);

  let grado = null;
  if (matchGradoPalabra) {
    grado = matchGradoPalabra[1].trim().toUpperCase().replace(/\s+/g, '');
  } else if (matchGradoSuelto) {
    grado = (matchGradoSuelto[1] + matchGradoSuelto[2]).toUpperCase();
  }

  // Docente: "docente Juan González", "profesor Ana Torres"
  const regexDocente = /(?:docente|profesora?|profe)\s+([a-záéíóúüñ]+(?:\s+[a-záéíóúüñ]+){0,3})/i;
  const matchDocente = mensaje.match(regexDocente);
  const docente = matchDocente ? matchDocente[1].trim() : null;

  // Semana: "semana 3", "semana tres"
  const regexSemana = /semana\s+(\d+|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)/i;
  const matchSemana = mensaje.match(regexSemana);
  const semanaTexto = matchSemana ? matchSemana[1] : null;
  const palabrasNum = { uno:1, dos:2, tres:3, cuatro:4, cinco:5, seis:6, siete:7, ocho:8, nueve:9, diez:10 };
  const semana = semanaTexto
    ? (isNaN(semanaTexto) ? (palabrasNum[semanaTexto.toLowerCase()] || null) : parseInt(semanaTexto))
    : null;

  logger.info({ grado, docente, semana }, '📋 Parámetros de planeación extraídos');
  return { grado, docente, semana };
}

export async function consultarPlaneacion(mensaje) {
  const { grado, docente, semana } = extraerParametrosPlaneacion(mensaje);

  if (!grado && !docente) {
    return {
      mensaje: '¿De qué grado o docente necesitas la planeación? Por ejemplo: *planeación del grado 7A* o *planeación del docente Juan González*.',
      datos: null
    };
  }

  try {
    const joins = [
      `JOIN cursos c        ON c.id = p.curso_id`,
      `JOIN grados g        ON g.id = c.grado_id`,
      `JOIN asignaturas a   ON a.id = c.asignatura_id`,
      `LEFT JOIN docentes d ON d.id = c.docente_id`
    ];
    const condiciones = [];
    const params = [];

    if (grado) {
      condiciones.push(`UPPER(REPLACE(g.etiqueta, ' ', '')) = ?`);
      params.push(grado.replace(/\s+/g, '').toUpperCase());
    }

    if (docente) {
      const partes = docente.trim().split(/\s+/);
      partes.forEach(parte => {
        condiciones.push(
          `(d.nombres   COLLATE utf8mb4_general_ci LIKE ? OR
            d.apellidos COLLATE utf8mb4_general_ci LIKE ?)`
        );
        params.push(`%${parte}%`, `%${parte}%`);
      });
    }

    if (semana) {
      condiciones.push(`p.semana = ?`);
      params.push(semana);
    }

    const WHERE = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    const sql = `
      SELECT
        p.id,
        p.titulo,
        p.descripcion,
        p.semana,
        p.fecha,
        g.etiqueta                          AS grado,
        a.nombre                            AS asignatura,
        CONCAT(d.nombres, ' ', d.apellidos) AS docente
      FROM planeaciones p
      ${joins.join('\n')}
      ${WHERE}
      ORDER BY g.etiqueta ASC, p.semana ASC, p.fecha ASC
    `;

    logger.info({ sql, params }, '🔍 Query planeaciones');

    const planeaciones = await consultar(sql, params);

    if (!planeaciones.length) {
      const filtroTexto = [
        grado   ? `grado ${grado}`     : null,
        docente ? `docente ${docente}` : null,
        semana  ? `semana ${semana}`   : null
      ].filter(Boolean).join(', ');

      return {
        mensaje: `No encontré planeaciones registradas para ${filtroTexto}. Verifica que el nombre o grado sea correcto.`,
        datos: []
      };
    }

    const filtroTexto = [
      grado   ? `grado **${grado}**`                     : null,
      docente ? `docente **${planeaciones[0].docente}**` : null,
      semana  ? `semana ${semana}`                       : null
    ].filter(Boolean).join(' — ');

    const grupos = {};
    for (const p of planeaciones) {
      const clave = `${p.grado} | ${p.asignatura}${p.docente ? ' | ' + p.docente : ''}`;
      if (!grupos[clave]) grupos[clave] = [];
      grupos[clave].push(p);
    }

    const bloques = Object.entries(grupos).map(([clave, items]) => {
      const filas = items.map(p => {
        const semanaStr = p.semana      ? ` [Semana ${p.semana}]`                               : '';
        const fechaStr  = p.fecha       ? ` — ${new Date(p.fecha).toLocaleDateString('es-CO')}` : '';
        const desc      = p.descripcion ? `\n      ${p.descripcion}`                            : '';
        return `  • **${p.titulo}**${semanaStr}${fechaStr}${desc}`;
      });
      return `**${clave}**\n${filas.join('\n')}`;
    });

    return {
      mensaje: `Planeaciones — ${filtroTexto}:\n\n${bloques.join('\n\n')}`,
      datos: planeaciones
    };

  } catch (err) {
    logger.error({ err: err.message, stack: err.stack }, '❌ Error consultando planeaciones');
    return {
      mensaje: 'Ocurrió un error al consultar las planeaciones. Inténtalo de nuevo.',
      datos: null
    };
  }
}