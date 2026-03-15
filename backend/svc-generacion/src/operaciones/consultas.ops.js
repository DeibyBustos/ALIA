import { consultar } from '../../../libreria-compartida/src/db.js';
import { logger } from '../../../libreria-compartida/src/logger.js';

/**
 * Consulta las materias/asignaturas de un estudiante
 * Intención: "consultar_materias_estudiante"
 */
export async function consultarMateriasEstudiante(parametros) {
  const { estudiante_nombre, periodo } = parametros;

  try {
    const estudiantes = await consultar(`
      SELECT id, nombres, apellidos FROM estudiantes
      WHERE CONCAT(nombres, ' ', apellidos) LIKE ?
      LIMIT 5
    `, [`%${estudiante_nombre}%`]);

    if (estudiantes.length === 0) {
      return { exito: false, mensaje: `No se encontró estudiante con nombre: ${estudiante_nombre}` };
    }

    const estudiante = estudiantes[0];

    const materias = await consultar(`
      SELECT DISTINCT
        a.nombre AS asignatura,
        p.nombre AS periodo,
        p.anio,
        CONCAT(d.nombres, ' ', d.apellidos) AS docente,
        g.etiqueta AS grado
      FROM inscripciones i
      JOIN cursos c       ON c.id = i.curso_id
      JOIN asignaturas a  ON a.id = c.asignatura_id
      JOIN periodos_academicos p ON p.id = i.periodo_id
      LEFT JOIN docentes d ON d.id = c.docente_id
      JOIN grados g       ON g.id = c.grado_id
      WHERE i.estudiante_id = ?
      AND (? IS NULL OR p.nombre LIKE ?)
      ORDER BY p.anio DESC, p.nombre, a.nombre
    `, [estudiante.id, periodo ?? null, periodo ? `%${periodo}%` : null]);

    if (materias.length === 0) {
      return {
        exito: false,
        mensaje: `No se encontraron materias para ${estudiante.nombres} ${estudiante.apellidos}. Puede que no tenga inscripciones registradas.`
      };
    }

    return {
      exito: true,
      mensaje: `${estudiante.nombres} ${estudiante.apellidos} tiene ${materias.length} materia(s) registrada(s).`,
      datos: {
        estudiante: `${estudiante.nombres} ${estudiante.apellidos}`,
        grado: materias[0]?.grado,
        materias
      }
    };

  } catch (err) {
    logger.error({ err }, '❌ Error consultando materias del estudiante');
    return { exito: false, mensaje: `Error: ${err.message}` };
  }
}

/**
 * Consulta el acudiente de un estudiante
 * Intención: "consultar_acudiente"
 */
export async function consultarAcudiente(parametros) {
  const { estudiante_nombre } = parametros;

  try {
    const estudiantes = await consultar(`
      SELECT id, nombres, apellidos, documento FROM estudiantes
      WHERE CONCAT(nombres, ' ', apellidos) LIKE ?
      LIMIT 5
    `, [`%${estudiante_nombre}%`]);

    if (estudiantes.length === 0) {
      return { exito: false, mensaje: `No se encontró estudiante con nombre: ${estudiante_nombre}` };
    }

    const estudiante = estudiantes[0];

    const acudientes = await consultar(`
      SELECT
        a.nombres,
        a.apellidos,
        a.telefono,
        a.correo,
        ea.relacion
      FROM acudientes a
      JOIN estudiante_acudiente ea ON ea.acudiente_id = a.id
      WHERE ea.estudiante_id = ?
    `, [estudiante.id]);

    if (acudientes.length === 0) {
      return {
        exito: false,
        mensaje: `No se encontraron acudientes registrados para ${estudiante.nombres} ${estudiante.apellidos}.`
      };
    }

    return {
      exito: true,
      mensaje: `Se encontraron ${acudientes.length} acudiente(s) para ${estudiante.nombres} ${estudiante.apellidos}.`,
      datos: {
        estudiante: `${estudiante.nombres} ${estudiante.apellidos}`,
        documento: estudiante.documento,
        acudientes
      }
    };

  } catch (err) {
    logger.error({ err }, '❌ Error consultando acudiente');
    return { exito: false, mensaje: `Error: ${err.message}` };
  }
}

/**
 * Consulta información general de un estudiante
 * Intención: "consultar_info_estudiante"
 */
export async function consultarInfoEstudiante(parametros) {
  const { estudiante_nombre } = parametros;

  try {
    const estudiantes = await consultar(`
      SELECT id, nombres, apellidos, documento, fecha_nacimiento FROM estudiantes
      WHERE CONCAT(nombres, ' ', apellidos) LIKE ?
      LIMIT 5
    `, [`%${estudiante_nombre}%`]);

    if (estudiantes.length === 0) {
      return { exito: false, mensaje: `No se encontró estudiante con nombre: ${estudiante_nombre}` };
    }

    const estudiante = estudiantes[0];

    // Grado actual (matrícula activa más reciente)
    const [matriculaActual] = await consultar(`
      SELECT g.etiqueta AS grado, p.nombre AS periodo, p.anio, m.estado
      FROM matriculas m
      JOIN grados g ON g.id = m.grado_id
      JOIN periodos_academicos p ON p.id = m.periodo_id
      WHERE m.estudiante_id = ?
      ORDER BY p.anio DESC, p.id DESC
      LIMIT 1
    `, [estudiante.id]);

    return {
      exito: true,
      mensaje: `Información de ${estudiante.nombres} ${estudiante.apellidos}.`,
      datos: {
        estudiante: {
          nombre: `${estudiante.nombres} ${estudiante.apellidos}`,
          documento: estudiante.documento,
          fecha_nacimiento: estudiante.fecha_nacimiento
        },
        matricula_actual: matriculaActual ?? null
      }
    };

  } catch (err) {
    logger.error({ err }, '❌ Error consultando info estudiante');
    return { exito: false, mensaje: `Error: ${err.message}` };
  }
}

/**
 * Consulta los estudiantes de un grado
 * Intención: "consultar_estudiantes_grado"
 */
export async function consultarEstudiantesGrado(parametros) {
  const { grado, periodo } = parametros;

  try {
    const estudiantes = await consultar(`
      SELECT
        e.id,
        e.nombres,
        e.apellidos,
        e.documento,
        g.etiqueta AS grado,
        p.nombre AS periodo,
        p.anio
      FROM matriculas m
      JOIN estudiantes e ON e.id = m.estudiante_id
      JOIN grados g      ON g.id = m.grado_id
      JOIN periodos_academicos p ON p.id = m.periodo_id
      WHERE g.etiqueta LIKE ?
      AND m.estado = 'ACTIVA'
      AND (? IS NULL OR p.nombre LIKE ?)
      ORDER BY e.apellidos, e.nombres
    `, [`%${grado}%`, periodo ?? null, periodo ? `%${periodo}%` : null]);

    if (estudiantes.length === 0) {
      return {
        exito: false,
        mensaje: `No se encontraron estudiantes activos en el grado ${grado}.`
      };
    }

    return {
      exito: true,
      mensaje: `Se encontraron ${estudiantes.length} estudiante(s) en el grado ${grado}.`,
      datos: { grado, periodo: estudiantes[0]?.periodo, total: estudiantes.length, estudiantes }
    };

  } catch (err) {
    logger.error({ err }, '❌ Error consultando estudiantes por grado');
    return { exito: false, mensaje: `Error: ${err.message}` };
  }
}

/**
 * Consulta el horario de un estudiante
 * Intención: "consultar_horario_estudiante"
 */
export async function consultarHorarioEstudiante(parametros) {
  const { estudiante_nombre, periodo } = parametros;

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

    const horario = await consultar(`
      SELECT
        a.nombre AS asignatura,
        h.dia_semana,
        h.hora_inicio,
        h.hora_fin,
        au.nombre AS aula,
        CONCAT(d.nombres, ' ', d.apellidos) AS docente,
        p.nombre AS periodo
      FROM inscripciones i
      JOIN cursos c      ON c.id = i.curso_id
      JOIN asignaturas a ON a.id = c.asignatura_id
      JOIN periodos_academicos p ON p.id = i.periodo_id
      LEFT JOIN horarios h ON h.curso_id = c.id
      LEFT JOIN aulas au   ON au.id = h.aula_id
      LEFT JOIN docentes d ON d.id = c.docente_id
      WHERE i.estudiante_id = ?
      AND (? IS NULL OR p.nombre LIKE ?)
      ORDER BY h.dia_semana, h.hora_inicio
    `, [estudiante.id, periodo ?? null, periodo ? `%${periodo}%` : null]);

    return {
      exito: true,
      mensaje: `Horario de ${estudiante.nombres} ${estudiante.apellidos}.`,
      datos: {
        estudiante: `${estudiante.nombres} ${estudiante.apellidos}`,
        horario
      }
    };

  } catch (err) {
    logger.error({ err }, '❌ Error consultando horario');
    return { exito: false, mensaje: `Error: ${err.message}` };
  }
}