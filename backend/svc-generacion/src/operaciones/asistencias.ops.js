import { consultar, ejecutar } from '../../../libreria-compartida/src/db.js';
import { logger } from '../../../libreria-compartida/src/logger.js';

/**
 * Registra asistencia
 */
export async function insertarAsistencia(parametros) {
  const { estudiante_nombre, asignatura, fecha, estado } = parametros;

  try {
    const estudiantes = await consultar(`
      SELECT id, nombres, apellidos FROM estudiantes
      WHERE CONCAT(nombres, ' ', apellidos) LIKE ?
      LIMIT 1
    `, [`%${estudiante_nombre}%`]);

    if (estudiantes.length === 0) {
      return { exito: false, mensaje: `Estudiante no encontrado: ${estudiante_nombre}` };
    }

    const estudiante = estudiantes[0];

    const cursos = await consultar(`
      SELECT c.id FROM cursos c
      JOIN asignaturas a ON a.id = c.asignatura_id
      WHERE a.nombre LIKE ?
      LIMIT 1
    `, [`%${asignatura}%`]);

    if (cursos.length === 0) {
      return { exito: false, mensaje: `Curso no encontrado: ${asignatura}` };
    }

    const curso = cursos[0];

    const estadoFinal = (estado || 'ASISTE').toUpperCase();
    const fechaFinal = fecha || new Date().toISOString().split('T')[0];

    await ejecutar(`
      INSERT INTO asistencias (curso_id, estudiante_id, fecha, estado)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE estado = ?
    `, [curso.id, estudiante.id, fechaFinal, estadoFinal, estadoFinal]);

    logger.info({ estudiante, curso, fecha: fechaFinal, estado: estadoFinal }, '✅ Asistencia registrada');

    return {
      exito: true,
      mensaje: `Asistencia registrada: ${estudiante.nombres} ${estudiante.apellidos} - ${estadoFinal}`,
      datos: { estudiante, asignatura, fecha: fechaFinal, estado: estadoFinal }
    };

  } catch (err) {
    logger.error({ err }, '❌ Error registrando asistencia');
    return { exito: false, mensaje: `Error: ${err.message}` };
  }
}

/**
 * Consulta asistencias
 */
export async function consultarAsistencias(parametros) {
  const { estudiante_nombre, asignatura, fecha_inicio, fecha_fin } = parametros;

  const estudiantes = await consultar(`
    SELECT id, nombres, apellidos FROM estudiantes
    WHERE CONCAT(nombres, ' ', apellidos) LIKE ?
    LIMIT 1
  `, [`%${estudiante_nombre}%`]);

  if (estudiantes.length === 0) {
    return { exito: false, mensaje: `Estudiante no encontrado: ${estudiante_nombre}` };
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

  return {
    exito: true,
    datos: {
      estudiante: `${estudiante.nombres} ${estudiante.apellidos}`,
      asistencias
    }
  };
}