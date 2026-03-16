import { consultar, ejecutar } from '../../../libreria-compartida/src/db.js';
import { logger } from '../../../libreria-compartida/src/logger.js';

export async function insertarAsistencia(parametros) {
  const { estudiante_nombre, asignatura, fecha, estado } = parametros;

  try {
    const estudiantes = await consultar(`
      SELECT id, nombres, apellidos FROM estudiantes
      WHERE CONCAT(nombres, ' ', apellidos) LIKE ?
      LIMIT 1
    `, [`%${estudiante_nombre}%`]);

    if (estudiantes.length === 0) {
      return { exito: false, mensaje: `No se encontró ningún estudiante con el nombre "${estudiante_nombre}". Verifica que el nombre esté escrito correctamente.` };
    }

    const estudiante = estudiantes[0];

    const cursos = await consultar(`
      SELECT c.id FROM cursos c
      JOIN asignaturas a ON a.id = c.asignatura_id
      WHERE a.nombre LIKE ?
      LIMIT 1
    `, [`%${asignatura}%`]);

    if (cursos.length === 0) {
      return { exito: false, mensaje: `No se encontró la asignatura "${asignatura}". Verifica que el nombre esté registrado en el sistema.` };
    }

    const curso = cursos[0];
    const estadoFinal = (estado || 'ASISTE').toUpperCase();
    const fechaFinal  = fecha || new Date().toISOString().split('T')[0];

    await ejecutar(`
      INSERT INTO asistencias (curso_id, estudiante_id, fecha, estado)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE estado = ?
    `, [curso.id, estudiante.id, fechaFinal, estadoFinal, estadoFinal]);

    logger.info({ estudiante, curso, fecha: fechaFinal, estado: estadoFinal }, 'Asistencia registrada');

    const estadoTexto = {
      ASISTE:      'presente',
      AUSENTE:     'ausente',
      TARDE:       'con llegada tarde',
      JUSTIFICADO: 'con falta justificada',
    }[estadoFinal] ?? estadoFinal.toLowerCase();

    return {
      exito: true,
      mensaje: `Se registró a ${estudiante.nombres} ${estudiante.apellidos} como ${estadoTexto} en ${asignatura} el ${fechaFinal}.`,
      datos: { estudiante, asignatura, fecha: fechaFinal, estado: estadoFinal }
    };

  } catch (err) {
    logger.error({ err }, 'Error registrando asistencia');
    return { exito: false, mensaje: `Ocurrió un error al registrar la asistencia: ${err.message}` };
  }
}

export async function consultarAsistencias(parametros) {
  const { estudiante_nombre, asignatura, fecha_inicio, fecha_fin } = parametros;

  const estudiantes = await consultar(`
    SELECT id, nombres, apellidos FROM estudiantes
    WHERE CONCAT(nombres, ' ', apellidos) LIKE ?
    LIMIT 1
  `, [`%${estudiante_nombre}%`]);

  if (estudiantes.length === 0) {
    return { exito: false, mensaje: `No se encontró ningún estudiante con el nombre "${estudiante_nombre}".` };
  }

  const estudiante = estudiantes[0];

  const asistencias = await consultar(`
    SELECT a.fecha, a.estado, asig.nombre as asignatura
    FROM asistencias a
    JOIN cursos c ON c.id = a.curso_id
    JOIN asignaturas asig ON asig.id = c.asignatura_id
    WHERE a.estudiante_id = ?
    AND (? IS NULL OR asig.nombre LIKE ?)
    AND (? IS NULL OR a.fecha >= ?)
    AND (? IS NULL OR a.fecha <= ?)
    ORDER BY a.fecha DESC
  `, [estudiante.id, asignatura, `%${asignatura}%`, fecha_inicio, fecha_inicio, fecha_fin, fecha_fin]);

  if (asistencias.length === 0) {
    return {
      exito: true,
      mensaje: `No se encontraron registros de asistencia para ${estudiante.nombres} ${estudiante.apellidos}${asignatura ? ` en ${asignatura}` : ''}.`,
      datos: { estudiante: `${estudiante.nombres} ${estudiante.apellidos}`, asistencias: [] }
    };
  }

  const resumen = asistencias.reduce((acc, a) => {
    acc[a.estado] = (acc[a.estado] || 0) + 1;
    return acc;
  }, {});

  const partes = [];
  if (resumen.ASISTE)      partes.push(`${resumen.ASISTE} presente${resumen.ASISTE > 1 ? 's' : ''}`);
  if (resumen.AUSENTE)     partes.push(`${resumen.AUSENTE} ausencia${resumen.AUSENTE > 1 ? 's' : ''}`);
  if (resumen.TARDE)       partes.push(`${resumen.TARDE} llegada${resumen.TARDE > 1 ? 's' : ''} tarde`);
  if (resumen.JUSTIFICADO) partes.push(`${resumen.JUSTIFICADO} justificada${resumen.JUSTIFICADO > 1 ? 's' : ''}`);

  return {
    exito: true,
    mensaje: `${estudiante.nombres} ${estudiante.apellidos} tiene ${asistencias.length} registro${asistencias.length > 1 ? 's' : ''} de asistencia: ${partes.join(', ')}.`,
    datos: {
      estudiante: `${estudiante.nombres} ${estudiante.apellidos}`,
      resumen,
      asistencias
    }
  };
}