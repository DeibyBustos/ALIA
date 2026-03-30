import ExcelJS from 'exceljs';
import { consultar } from '../../../libreria-compartida/src/db.js';
import { logger } from '../../../libreria-compartida/src/logger.js';
import {
  validateExcelEstudiantesParams,
  sanitizeDatabaseRow,
  sanitizeString
} from '../utils/validators.js';

/**
 * Genera un Excel con la lista de estudiantes de un grado
 */
export async function generarExcelEstudiantes(grado, periodoId) {
  // 1. Validar y sanitizar parámetros de entrada
  const validation = validateExcelEstudiantesParams({ grado, periodo_id: periodoId });

  if (!validation.valid) {
    const errorMsg = validation.errors.join(', ');
    logger.error({ grado, periodoId, errors: validation.errors }, 'Parámetros inválidos para generar Excel');
    throw new Error(`Parámetros inválidos: ${errorMsg}`);
  }

  // Usar parámetros validados
  const params = validation.params;

  logger.info({ grado: params.grado, periodoId: params.periodo_id }, '📊 Generando Excel de estudiantes');

  // 2. Obtener estudiantes del grado usando parámetros validados
const estudiantes = await consultar(`
  SELECT DISTINCT
    e.id,
    e.nombres,
    e.apellidos,
    e.documento,
    e.fecha_nacimiento,
    g.etiqueta as grado,
    (
      SELECT CONCAT(a2.nombres, ' ', a2.apellidos)
      FROM estudiante_acudiente ea2
      JOIN acudientes a2 ON a2.id = ea2.acudiente_id
      WHERE ea2.estudiante_id = e.id
      LIMIT 1
    ) as acudiente
  FROM estudiantes e
  JOIN matriculas m ON m.estudiante_id = e.id
  JOIN grados g ON g.id = m.grado_id
  WHERE g.etiqueta = ? AND m.periodo_id = ?
  ORDER BY e.apellidos, e.nombres
`, [params.grado, params.periodo_id]);

  if (estudiantes.length === 0) {
    throw new Error(`No se encontraron estudiantes en el grado ${params.grado} para el período ${params.periodo_id}`);
  }

  // 3. Sanitizar datos de la base de datos
  const estudiantesSanitizados = estudiantes.map(est => sanitizeDatabaseRow(est));

  // Crear workbook
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Estudiantes');

  workbook.creator = 'ALIA - Sistema Académico';
  workbook.created = new Date();

  // 4. Título con grado validado
  sheet.mergeCells('A1:F1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = `LISTA DE ESTUDIANTES - ${sanitizeString(params.grado, 'N/A').toUpperCase()}`;
  titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' }
  };
  sheet.getRow(1).height = 25;

  // 5. Información con datos validados
  sheet.getCell('A2').value = `Período: ${params.periodo_id}`;
  sheet.getCell('A3').value = `Total estudiantes: ${estudiantesSanitizados.length}`;
  sheet.getCell('A4').value = `Fecha: ${new Date().toLocaleDateString('es-CO')}`;

  // 6. Encabezados
  const headerRow = sheet.getRow(6);
  headerRow.values = ['#', 'Apellidos', 'Nombres', 'Documento', 'Fecha Nacimiento', 'Acudiente'];
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD9E1F2' }
  };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.height = 20;

  // 7. Datos de estudiantes con sanitización adicional
  estudiantesSanitizados.forEach((est, index) => {
    const row = sheet.getRow(7 + index);

    // Sanitizar cada campo antes de escribirlo
    const apellidos = sanitizeString(est.apellidos, 'Sin apellido');
    const nombres = sanitizeString(est.nombres, 'Sin nombre');
    const documento = sanitizeString(est.documento, 'N/A', true);
    const acudiente = sanitizeString(est.acudiente, 'N/A', true);

    // Formatear fecha de forma segura
    let fechaNacimiento = 'N/A';
    if (est.fecha_nacimiento) {
      try {
        const fecha = new Date(est.fecha_nacimiento);
        if (!isNaN(fecha.getTime())) {
          fechaNacimiento = fecha.toLocaleDateString('es-CO');
        }
      } catch (error) {
        logger.warn({ fecha: est.fecha_nacimiento }, 'Error formateando fecha de nacimiento');
      }
    }

    row.values = [
      index + 1,
      apellidos,
      nombres,
      documento,
      fechaNacimiento,
      acudiente
    ];

    // Alternar colores de filas
    if (index % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF2F2F2' }
        };
      });
    }
  });

  // Ajustar anchos de columna
  sheet.getColumn(1).width = 5;
  sheet.getColumn(2).width = 20;
  sheet.getColumn(3).width = 20;
  sheet.getColumn(4).width = 18;
  sheet.getColumn(5).width = 18;
  sheet.getColumn(6).width = 25;

  // 8. Bordes
  const lastRow = 6 + estudiantesSanitizados.length;
  for (let i = 6; i <= lastRow; i++) {
    for (let j = 1; j <= 6; j++) {
      const cell = sheet.getCell(i, j);
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    }
  }

  // 9. Generar buffer
  const buffer = await workbook.xlsx.writeBuffer();
  logger.info({
    grado: params.grado,
    periodo: params.periodo_id,
    numEstudiantes: estudiantesSanitizados.length
  }, '✅ Excel de estudiantes generado exitosamente');

  return buffer;
}

/**
 * Genera un Excel con las calificaciones de un curso
 */
export async function generarExcelCalificaciones(cursoId, periodoId) {
  // Consultar datos
  const estudiantes = await consultar(`
    SELECT
      e.id, e.nombres, e.apellidos,
      ev.nombre as evaluacion, c.nota
    FROM inscripciones i
    JOIN estudiantes e ON e.id = i.estudiante_id
    JOIN cursos cur ON cur.id = i.curso_id
    LEFT JOIN calificaciones c ON c.estudiante_id = e.id
    LEFT JOIN evaluaciones ev ON ev.id = c.evaluacion_id AND ev.curso_id = cur.id
    WHERE i.curso_id = ? AND i.periodo_id = ?
    ORDER BY e.apellidos, e.nombres, ev.fecha
  `, [cursoId, periodoId]);

  // Crear libro de trabajo
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Calificaciones');

  // Configurar columnas
  sheet.columns = [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'Apellidos', key: 'apellidos', width: 20 },
    { header: 'Nombres', key: 'nombres', width: 20 },
    { header: 'Evaluación', key: 'evaluacion', width: 30 },
    { header: 'Nota', key: 'nota', width: 10 }
  ];

  // Estilo del encabezado
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' }
  };

  // Agregar datos
  estudiantes.forEach(est => {
    sheet.addRow(est);
  });

  // Agregar bordes
  sheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
  });

  // Retornar buffer
  return await workbook.xlsx.writeBuffer();
}

/**
 * Genera un Excel con las asistencias
 */
export async function generarExcelAsistencias(cursoId, fechaInicio, fechaFin) {
  const asistencias = await consultar(`
    SELECT
      e.id, e.nombres, e.apellidos,
      a.fecha, a.estado
    FROM asistencias a
    JOIN estudiantes e ON e.id = a.estudiante_id
    WHERE a.curso_id = ? AND a.fecha BETWEEN ? AND ?
    ORDER BY e.apellidos, a.fecha
  `, [cursoId, fechaInicio, fechaFin]);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Asistencias');

  sheet.columns = [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'Apellidos', key: 'apellidos', width: 20 },
    { header: 'Nombres', key: 'nombres', width: 20 },
    { header: 'Fecha', key: 'fecha', width: 15 },
    { header: 'Estado', key: 'estado', width: 15 }
  ];

  // Estilo
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF70AD47' }
  };

  asistencias.forEach(a => {
    const row = sheet.addRow(a);

    // Colorear según estado
    const estadoCell = row.getCell('estado');
    if (a.estado === 'AUSENTE') {
      estadoCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFF0000' }
      };
      estadoCell.font = { color: { argb: 'FFFFFFFF' } };
    } else if (a.estado === 'TARDE') {
      estadoCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFC000' }
      };
    }
  });

  return await workbook.xlsx.writeBuffer();
}

/**
 * Genera un Excel con el horario de un estudiante
 */
export async function generarExcelHorarioEstudiante(estudianteId, periodoId) {
  const horario = await consultar(`
    SELECT * FROM vw_horario_estudiante
    WHERE estudiante_id = ? AND periodo_id = ?
    ORDER BY dia_semana, hora_inicio
  `, [estudianteId, periodoId]);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Horario');

  const dias = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

  sheet.columns = [
    { header: 'Día', key: 'dia', width: 15 },
    { header: 'Hora Inicio', key: 'hora_inicio', width: 12 },
    { header: 'Hora Fin', key: 'hora_fin', width: 12 },
    { header: 'Asignatura', key: 'asignatura', width: 25 },
    { header: 'Aula', key: 'aula', width: 15 }
  ];

  horario.forEach(h => {
    sheet.addRow({
      dia: dias[h.dia_semana],
      hora_inicio: h.hora_inicio,
      hora_fin: h.hora_fin,
      asignatura: h.asignatura,
      aula: h.aula_codigo || 'N/A'
    });
  });

  return await workbook.xlsx.writeBuffer();
}