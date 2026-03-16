import { consultar, ejecutar } from '../../../libreria-compartida/src/db.js';
import { logger } from '../../../libreria-compartida/src/logger.js';

export async function insertarCalificacion(parametros) {
  const { estudiante_nombre, asignatura, nota, evaluacion, periodo } = parametros;

  try {
    const estudiantes = await consultar(`
      SELECT id, nombres, apellidos FROM estudiantes
      WHERE CONCAT(nombres, ' ', apellidos) LIKE ?
      LIMIT 5
    `, [`%${estudiante_nombre}%`]);

    if (estudiantes.length === 0) {
      return { exito: false, mensaje: `No se encontró ningún estudiante con el nombre "${estudiante_nombre}". Verifica que el nombre esté escrito correctamente.` };
    }

    const estudiante = estudiantes[0];

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
      return { exito: false, mensaje: `No se encontró la asignatura "${asignatura}"${periodo ? ` en el período "${periodo}"` : ''}. Verifica que esté registrada en el sistema.` };
    }

    const curso = cursos[0];
    const evaluacionNombre = evaluacion || 'Evaluación General';

    const [evalExistente] = await consultar(`
      SELECT id FROM evaluaciones WHERE curso_id = ? AND nombre = ?
    `, [curso.id, evaluacionNombre]);

    let evaluacionId;
    if (evalExistente) {
      evaluacionId = evalExistente.id;
    } else {
      const result = await ejecutar(`
        INSERT INTO evaluaciones (curso_id, nombre, porcentaje, fecha)
        VALUES (?, ?, 100, CURDATE())
      `, [curso.id, evaluacionNombre]);
      evaluacionId = result.insertId;
    }

    await ejecutar(`
      INSERT INTO calificaciones (evaluacion_id, estudiante_id, nota)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE nota = ?
    `, [evaluacionId, estudiante.id, nota, nota]);

    logger.info({ estudiante, curso, nota }, 'Calificación insertada');

    return {
      exito: true,
      mensaje: `Se registró una nota de ${nota} para ${estudiante.nombres} ${estudiante.apellidos} en ${curso.asignatura}, evaluación "${evaluacionNombre}".`,
      datos: { estudiante, asignatura: curso.asignatura, nota, evaluacion: evaluacionNombre }
    };

  } catch (err) {
    logger.error({ err }, 'Error insertando calificación');
    return { exito: false, mensaje: `Ocurrió un error al registrar la calificación: ${err.message}` };
  }
}

export async function eliminarCalificacion(parametros) {
  const { estudiante_nombre, asignatura, evaluacion } = parametros;

  try {
    const estudiantes = await consultar(`
      SELECT id, nombres, apellidos FROM estudiantes
      WHERE CONCAT(nombres, ' ', apellidos) LIKE ?
      LIMIT 1
    `, [`%${estudiante_nombre}%`]);

    if (estudiantes.length === 0) {
      return { exito: false, mensaje: `No se encontró ningún estudiante con el nombre "${estudiante_nombre}".` };
    }

    const estudiante = estudiantes[0];

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
      return { exito: false, mensaje: `No se encontró ninguna calificación de ${asignatura}${evaluacion ? ` para la evaluación "${evaluacion}"` : ''} registrada para ${estudiante.nombres} ${estudiante.apellidos}.` };
    }

    const calificacion = calificaciones[0];
    await ejecutar(`DELETE FROM calificaciones WHERE id = ?`, [calificacion.id]);

    logger.info({ calificacion }, 'Calificación eliminada');

    return {
      exito: true,
      mensaje: `Se eliminó la calificación de ${calificacion.asignatura} (${calificacion.evaluacion}) para ${estudiante.nombres} ${estudiante.apellidos}.`
    };

  } catch (err) {
    logger.error({ err }, 'Error eliminando calificación');
    return { exito: false, mensaje: `Ocurrió un error al eliminar la calificación: ${err.message}` };
  }
}

export async function consultarCalificaciones(parametros) {
  const { estudiante_nombre, asignatura, periodo } = parametros;

  const estudiantes = await consultar(`
    SELECT id, nombres, apellidos FROM estudiantes
    WHERE CONCAT(nombres, ' ', apellidos) LIKE ?
    LIMIT 1
  `, [`%${estudiante_nombre}%`]);

  if (estudiantes.length === 0) {
    return { exito: false, mensaje: `No se encontró ningún estudiante con el nombre "${estudiante_nombre}".` };
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

  if (calificaciones.length === 0) {
    return {
      exito: true,
      mensaje: `No se encontraron calificaciones registradas para ${estudiante.nombres} ${estudiante.apellidos}${asignatura ? ` en ${asignatura}` : ''}${periodo ? ` durante el período ${periodo}` : ''}.`,
      datos: { estudiante: `${estudiante.nombres} ${estudiante.apellidos}`, calificaciones: [] }
    };
  }

  const promedio = (calificaciones.reduce((s, c) => s + Number(c.nota), 0) / calificaciones.length).toFixed(2);

  return {
    exito: true,
    mensaje: `${estudiante.nombres} ${estudiante.apellidos} tiene ${calificaciones.length} calificación${calificaciones.length > 1 ? 'es' : ''} registrada${calificaciones.length > 1 ? 's' : ''}, con un promedio de ${promedio}.`,
    datos: {
      estudiante: `${estudiante.nombres} ${estudiante.apellidos}`,
      promedio: Number(promedio),
      calificaciones
    }
  };
}