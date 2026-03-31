import { consultar } from '../../../libreria-compartida/src/db.js';
import { logger } from '../../../libreria-compartida/src/logger.js';

export async function consultarMateriasEstudiante(parametros) {
  const { estudiante_nombre, periodo } = parametros;

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
        mensaje: `${estudiante.nombres} ${estudiante.apellidos} no tiene materias inscritas${periodo ? ` en el período ${periodo}` : ''}. Puede que no tenga inscripciones registradas en el sistema.`
      };
    }

    return {
      exito: true,
      mensaje: `${estudiante.nombres} ${estudiante.apellidos} tiene ${materias.length} materia${materias.length > 1 ? 's' : ''} inscrita${materias.length > 1 ? 's' : ''} en el grado ${materias[0]?.grado}.`,
      datos: {
        estudiante: `${estudiante.nombres} ${estudiante.apellidos}`,
        grado: materias[0]?.grado,
        materias
      }
    };

  } catch (err) {
    logger.error({ err }, 'Error consultando materias del estudiante');
    return { exito: false, mensaje: `Ocurrió un error al consultar las materias: ${err.message}` };
  }
}

export async function consultarAcudiente(parametros) {
  const { estudiante_nombre } = parametros;

  try {
    const estudiantes = await consultar(`
      SELECT id, nombres, apellidos, documento FROM estudiantes
      WHERE CONCAT(nombres, ' ', apellidos) LIKE ?
      LIMIT 5
    `, [`%${estudiante_nombre}%`]);

    if (estudiantes.length === 0) {
      return { exito: false, mensaje: `No se encontró ningún estudiante con el nombre "${estudiante_nombre}".` };
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
        mensaje: `No hay acudientes registrados para ${estudiante.nombres} ${estudiante.apellidos}.`
      };
    }

    return {
      exito: true,
      mensaje: `${estudiante.nombres} ${estudiante.apellidos} tiene ${acudientes.length} acudiente${acudientes.length > 1 ? 's' : ''} registrado${acudientes.length > 1 ? 's' : ''}.`,
      datos: {
        estudiante: `${estudiante.nombres} ${estudiante.apellidos}`,
        documento: estudiante.documento,
        acudientes
      }
    };

  } catch (err) {
    logger.error({ err }, 'Error consultando acudiente');
    return { exito: false, mensaje: `Ocurrió un error al consultar el acudiente: ${err.message}` };
  }
}

export async function consultarInfoEstudiante(parametros) {
  const { estudiante_nombre } = parametros;

  try {
    const estudiantes = await consultar(`
      SELECT id, nombres, apellidos, documento, fecha_nacimiento FROM estudiantes
      WHERE CONCAT(nombres, ' ', apellidos) LIKE ?
      LIMIT 5
    `, [`%${estudiante_nombre}%`]);

    if (estudiantes.length === 0) {
      return { exito: false, mensaje: `No se encontró ningún estudiante con el nombre "${estudiante_nombre}".` };
    }

    const estudiante = estudiantes[0];

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
      mensaje: `Se encontró la información de ${estudiante.nombres} ${estudiante.apellidos}.`,
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
    logger.error({ err }, 'Error consultando info estudiante');
    return { exito: false, mensaje: `Ocurrió un error al consultar la información: ${err.message}` };
  }
}

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
        mensaje: `No se encontraron estudiantes con matrícula activa en el grado ${grado}${periodo ? ` para el período ${periodo}` : ''}.`
      };
    }

    return {
      exito: true,
      mensaje: `El grado ${grado} tiene ${estudiantes.length} estudiante${estudiantes.length > 1 ? 's' : ''} con matrícula activa.`,
      datos: { grado, periodo: estudiantes[0]?.periodo, total: estudiantes.length, estudiantes }
    };

  } catch (err) {
    logger.error({ err }, 'Error consultando estudiantes por grado');
    return { exito: false, mensaje: `Ocurrió un error al consultar los estudiantes: ${err.message}` };
  }
}

export async function consultarHorarioEstudiante(parametros) {
  const { estudiante_nombre, periodo } = parametros;

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

    if (horario.length === 0) {
      return {
        exito: true,
        mensaje: `${estudiante.nombres} ${estudiante.apellidos} no tiene horario registrado${periodo ? ` para el período ${periodo}` : ''}.`,
        datos: { estudiante: `${estudiante.nombres} ${estudiante.apellidos}`, horario: [] }
      };
    }

    return {
      exito: true,
      mensaje: `Se encontró el horario de ${estudiante.nombres} ${estudiante.apellidos} con ${horario.length} clase${horario.length > 1 ? 's' : ''} registrada${horario.length > 1 ? 's' : ''}.`,
      datos: {
        estudiante: `${estudiante.nombres} ${estudiante.apellidos}`,
        horario
      }
    };

  } catch (err) {
    logger.error({ err }, 'Error consultando horario');
    return { exito: false, mensaje: `Ocurrió un error al consultar el horario: ${err.message}` };
  }
}

export async function consultarHorarioDocente(parametros) {
  const { docente_nombre, curso, periodo, asignatura, dia_semana } = parametros;

  try {
    const docentes = await consultar(`
      SELECT id, nombres, apellidos, correo
      FROM docentes
      WHERE CONCAT(nombres, ' ', apellidos) LIKE ?
      LIMIT 5
    `, [`%${docente_nombre}%`]);

    if (docentes.length === 0) {
      return {
        exito: false,
        mensaje: `No se encontró ningún docente con el nombre "${docente_nombre}".`
      };
    }

    const docente = docentes[0];

    const horario = await consultar(`
      SELECT
        a.nombre AS asignatura,
        g.etiqueta AS curso,
        p.nombre AS periodo,
        p.anio,
        h.dia_semana,
        h.hora_inicio,
        h.hora_fin,
        au.codigo AS aula_codigo,
        au.nombre AS aula_nombre
      FROM cursos c
      JOIN asignaturas a         ON a.id = c.asignatura_id
      JOIN grados g              ON g.id = c.grado_id
      JOIN periodos_academicos p ON p.id = c.periodo_id
      LEFT JOIN horarios h       ON h.curso_id = c.id
      LEFT JOIN aulas au         ON au.id = h.aula_id
      WHERE c.docente_id = ?
        AND (? IS NULL OR g.etiqueta LIKE ?)
        AND (? IS NULL OR p.nombre LIKE ?)
        AND (? IS NULL OR a.nombre LIKE ?)
        AND (? IS NULL OR h.dia_semana = ?)
      ORDER BY p.anio DESC, p.nombre, h.dia_semana, h.hora_inicio
    `, [
      docente.id,
      curso ?? null, curso ? `%${curso}%` : null,
      periodo ?? null, periodo ? `%${periodo}%` : null,
      asignatura ?? null, asignatura ? `%${asignatura}%` : null,
      dia_semana ?? null, dia_semana ?? null
    ]);

    if (horario.length === 0) {
      return {
        exito: false,
        mensaje: `${docente.nombres} ${docente.apellidos} no tiene horarios registrados${
          curso ? ` para el curso ${curso}` : ''
        }${periodo ? ` en el período ${periodo}` : ''}.`
      };
    }

    return {
      exito: true,
      mensaje: `Se encontró el horario de ${docente.nombres} ${docente.apellidos}.`,
      datos: {
        docente: `${docente.nombres} ${docente.apellidos}`,
        correo: docente.correo,
        horario
      }
    };

  } catch (err) {
    logger.error({ err }, 'Error consultando horario del docente');
    return {
      exito: false,
      mensaje: `Ocurrió un error al consultar el horario del docente: ${err.message}`
    };
  }
}