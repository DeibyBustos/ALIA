import ExcelJS from 'exceljs';
import { consultar } from '../../../libreria-compartida/src/db.js';

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