import { consultar, ejecutar } from '../../../libreria-compartida/src/db.js';
import { logger } from '../../../libreria-compartida/src/logger.js';

/**
 * Inserta una calificación por lenguaje natural
 */
export async function insertarCalificacion(parametros) {
  const { estudiante_nombre, asignatura, nota, evaluacion, periodo } = parametros;

  try {
    // 1. Buscar estudiante por nombre
    const estudiantes = await consultar(`
      SELECT id, nombres, apellidos FROM estudiantes
      WHERE CONCAT(nombres, ' ', apellidos) LIKE ?
      LIMIT 5
    `, [`%${estudiante_nombre}%`]);

    if (estudiantes.length === 0) {
      return { exito: false, mensaje: `No se encontró estudiante con nombre: ${estudiante_nombre}` };
    }

    const estudiante = estudiantes[0];

    // 2. Buscar el curso (asignatura + período)
    const cursos = await consultar(`
      SELECT c.id, a.nombre as asignatura
      FROM cursos c
      JOIN asignaturas a ON a.id = c.asignatura_id
      JOIN periodos_academicos p ON p.id = c.periodo_id
      WHERE a.nombre LIKE ?
      AND (? IS NULL OR p.nombre LIKE ?)
      LIMIT 1
    `, [`%${asignatura}%`, periodo, `%${periodo}%`]);

    if (cursos.length === 0) {
      return { exito: false, mensaje: `No se encontró curso de ${asignatura}` };
    }

    const curso = cursos[0];

    // 3. Buscar o crear evaluación
    let evaluacionId;
    const evaluacionNombre = evaluacion || 'Evaluación General';

    const [evalExistente] = await consultar(`
      SELECT id FROM evaluaciones
      WHERE curso_id = ? AND nombre = ?
    `, [curso.id, evaluacionNombre]);

    if (evalExistente) {
      evaluacionId = evalExistente.id;
    } else {
      const result = await ejecutar(`
        INSERT INTO evaluaciones (curso_id, nombre, porcentaje, fecha)
        VALUES (?, ?, 100, CURDATE())
      `, [curso.id, evaluacionNombre]);
      evaluacionId = result.insertId;
    }

    // 4. Insertar o actualizar calificación
    await ejecutar(`
      INSERT INTO calificaciones (evaluacion_id, estudiante_id, nota)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE nota = ?
    `, [evaluacionId, estudiante.id, nota, nota]);

    logger.info({ estudiante, curso, nota }, '✅ Calificación insertada');

    return {
      exito: true,
      mensaje: `Calificación de ${nota} registrada para ${estudiante.nombres} ${estudiante.apellidos} en ${curso.asignatura}`,
      datos: { estudiante, asignatura: curso.asignatura, nota, evaluacion: evaluacionNombre }
    };

  } catch (err) {
    logger.error({ err }, '❌ Error insertando calificación');
    return { exito: false, mensaje: `Error: ${err.message}` };
  }
}

/**
 * Elimina una calificación
 */
export async function eliminarCalificacion(parametros) {
  const { estudiante_nombre, asignatura, evaluacion } = parametros;

  try {
    const estudiantes = await consultar(`
      SELECT id, nombres, apellidos FROM estudiantes
      WHERE CONCAT(nombres, ' ', apellidos) LIKE ?
      LIMIT 1
    `, [`%${estudiante_nombre}%`]);

    if (estudiantes.length === 0) {
      return { exito: false, mensaje: `No se encontró estudiante: ${estudiante_nombre}` };
    }

    const estudiante = estudiantes[0];

    // Buscar calificación
    const calificaciones = await consultar(`
      SELECT c.id, ev.nombre as evaluacion, a.nombre as asignatura
      FROM calificaciones c
      JOIN evaluaciones ev ON ev.id = c.evaluacion_id
      JOIN cursos cur ON cur.id = ev.curso_id
      JOIN asignaturas a ON a.id = cur.asignatura_id
      WHERE c.estudiante_id = ?
      AND a.nombre LIKE ?
      AND (? IS NULL OR ev.nombre LIKE ?)
    `, [estudiante.id, `%${asignatura}%`, evaluacion, `%${evaluacion}%`]);

    if (calificaciones.length === 0) {
      return { exito: false, mensaje: 'No se encontró la calificación especificada' };
    }

    const calificacion = calificaciones[0];

    // Eliminar
    await ejecutar(`DELETE FROM calificaciones WHERE id = ?`, [calificacion.id]);

    logger.info({ calificacion }, '🗑️ Calificación eliminada');

    return {
      exito: true,
      mensaje: `Calificación eliminada: ${calificacion.evaluacion} de ${calificacion.asignatura}`
    };

  } catch (err) {
    logger.error({ err }, '❌ Error eliminando calificación');
    return { exito: false, mensaje: `Error: ${err.message}` };
  }
}

/**
 * Consulta calificaciones
 */
export async function consultarCalificaciones(parametros) {
  const { estudiante_nombre, asignatura, periodo } = parametros;

  const estudiantes = await consultar(`
    SELECT id, nombres, apellidos FROM estudiantes
    WHERE CONCAT(nombres, ' ', apellidos) LIKE ?
    LIMIT 1
  `, [`%${estudiante_nombre}%`]);

  if (estudiantes.length === 0) {
    return { exito: false, mensaje: `No se encontró estudiante: ${estudiante_nombre}` };
  }

  const estudiante = estudiantes[0];

  const calificaciones = await consultar(`
    SELECT a.nombre as asignatura, ev.nombre as evaluacion,
           c.nota, ev.fecha, p.nombre as periodo
    FROM calificaciones c
    JOIN evaluaciones ev ON ev.id = c.evaluacion_id
    JOIN cursos cur ON cur.id = ev.curso_id
    JOIN asignaturas a ON a.id = cur.asignatura_id
    JOIN periodos_academicos p ON p.id = cur.periodo_id
    WHERE c.estudiante_id = ?
    AND (? IS NULL OR a.nombre LIKE ?)
    AND (? IS NULL OR p.nombre LIKE ?)
    ORDER BY ev.fecha DESC
  `, [estudiante.id, asignatura, `%${asignatura}%`, periodo, `%${periodo}%`]);

  return {
    exito: true,
    datos: {
      estudiante: `${estudiante.nombres} ${estudiante.apellidos}`,
      calificaciones
    }
  };
}