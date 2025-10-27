import PDFDocument from 'pdfkit';
import { consultar } from '../../../libreria-compartida/src/db.js';
import { logger } from '../../../libreria-compartida/src/logger.js';
import {
  validateExcelEstudiantesParams,
  sanitizeDatabaseRow,
  sanitizeString
} from '../utils/validators.js';

/**
 * Genera un PDF con la lista de estudiantes de un grado
 */
export async function generarPDFEstudiantes(grado, periodoId) {
  // 1. Validar y sanitizar parámetros de entrada
  const validation = validateExcelEstudiantesParams({ grado, periodo_id: periodoId });

  if (!validation.valid) {
    const errorMsg = validation.errors.join(', ');
    logger.error({ grado, periodoId, errors: validation.errors }, 'Parámetros inválidos para generar PDF');
    throw new Error(`Parámetros inválidos: ${errorMsg}`);
  }

  // Usar parámetros validados
  const params = validation.params;

  logger.info({ grado: params.grado, periodoId: params.periodo_id }, '📄 Generando PDF de estudiantes');

  // 2. Obtener estudiantes del grado
  const estudiantes = await consultar(`
    SELECT
      e.id,
      e.nombres,
      e.apellidos,
      e.documento,
      e.fecha_nacimiento,
      g.etiqueta as grado,
      CONCAT(a.nombres, ' ', a.apellidos) as acudiente
    FROM estudiantes e
    JOIN matriculas m ON m.estudiante_id = e.id
    JOIN grados g ON g.id = m.grado_id
    LEFT JOIN estudiante_acudiente ea ON ea.estudiante_id = e.id
    LEFT JOIN acudientes a ON a.id = ea.acudiente_id
    WHERE g.etiqueta = ? AND m.periodo_id = ?
    ORDER BY e.apellidos, e.nombres
  `, [params.grado, params.periodo_id]);

  if (estudiantes.length === 0) {
    throw new Error(`No se encontraron estudiantes en el grado ${params.grado} para el período ${params.periodo_id}`);
  }

  // 3. Sanitizar datos de la base de datos
  const estudiantesSanitizados = estudiantes.map(est => sanitizeDatabaseRow(est));

  // 4. Crear documento PDF
  const doc = new PDFDocument({
    margin: 50,
    size: 'LETTER',
    bufferPages: true
  });
  const buffers = [];

  doc.on('data', buffers.push.bind(buffers));

  return new Promise((resolve, reject) => {
    doc.on('end', () => {
      const pdfData = Buffer.concat(buffers);
      logger.info({
        grado: params.grado,
        periodo: params.periodo_id,
        numEstudiantes: estudiantesSanitizados.length
      }, '✅ PDF de estudiantes generado exitosamente');
      resolve(pdfData);
    });

    doc.on('error', reject);

    // 5. Encabezado
    doc.rect(0, 0, doc.page.width, 80).fill('#4472C4');
    doc.fillColor('#FFFFFF')
       .fontSize(24)
       .text(`LISTA DE ESTUDIANTES`, 50, 25, { align: 'center' });
    doc.fontSize(16)
       .text(`${sanitizeString(params.grado, 'N/A').toUpperCase()}`, { align: 'center' });

    // 6. Información general
    doc.fillColor('#000000')
       .fontSize(10)
       .text(`Período: ${params.periodo_id}`, 50, 100);
    doc.text(`Total estudiantes: ${estudiantesSanitizados.length}`, 50, 115);
    doc.text(`Fecha: ${new Date().toLocaleDateString('es-CO')}`, 50, 130);

    // 7. Tabla de estudiantes
    let yPosition = 160;
    const pageHeight = doc.page.height - 100;

    // Encabezados de tabla
    doc.fontSize(9);

    // Dibujar todos los rectángulos de encabezado primero
    doc.rect(50, yPosition, 30, 20).fillAndStroke('#D9E1F2', '#000000');
    doc.rect(80, yPosition, 130, 20).fillAndStroke('#D9E1F2', '#000000');
    doc.rect(210, yPosition, 130, 20).fillAndStroke('#D9E1F2', '#000000');
    doc.rect(340, yPosition, 90, 20).fillAndStroke('#D9E1F2', '#000000');
    doc.rect(430, yPosition, 132, 20).fillAndStroke('#D9E1F2', '#000000');

    // IMPORTANTE: Restablecer color de relleno a negro para el texto
    doc.fillColor('#000000');

    // Ahora escribir todos los textos de encabezado
    doc.text('#', 55, yPosition + 5, { width: 20, lineBreak: false });
    doc.text('Apellidos', 85, yPosition + 5, { width: 120, lineBreak: false });
    doc.text('Nombres', 215, yPosition + 5, { width: 120, lineBreak: false });
    doc.text('Documento', 345, yPosition + 5, { width: 80, lineBreak: false });
    doc.text('Acudiente', 435, yPosition + 5, { width: 122, lineBreak: false });

    yPosition += 20;

    // 8. Datos de estudiantes
    estudiantesSanitizados.forEach((est, index) => {
      // Verificar si necesitamos nueva página
      if (yPosition > pageHeight) {
        doc.addPage();
        yPosition = 50;
      }

      const apellidos = sanitizeString(est.apellidos, 'Sin apellido');
      const nombres = sanitizeString(est.nombres, 'Sin nombre');
      const documento = sanitizeString(est.documento, 'N/A', true);
      const acudiente = sanitizeString(est.acudiente, 'N/A', true);

      // Color de fila alternado
      const fillColor = index % 2 === 0 ? '#F2F2F2' : '#FFFFFF';

      // Dibujar todos los rectángulos primero
      doc.rect(50, yPosition, 30, 18).fillAndStroke(fillColor, '#000000');
      doc.rect(80, yPosition, 130, 18).fillAndStroke(fillColor, '#000000');
      doc.rect(210, yPosition, 130, 18).fillAndStroke(fillColor, '#000000');
      doc.rect(340, yPosition, 90, 18).fillAndStroke(fillColor, '#000000');
      doc.rect(430, yPosition, 132, 18).fillAndStroke(fillColor, '#000000');

      // IMPORTANTE: Restablecer el color de relleno a negro para el texto
      doc.fillColor('#000000');

      // Ahora escribir todo el texto
      doc.text(index + 1, 55, yPosition + 4, { width: 20, lineBreak: false });
      doc.text(apellidos, 85, yPosition + 4, { width: 120, lineBreak: false });
      doc.text(nombres, 215, yPosition + 4, { width: 120, lineBreak: false });
      doc.text(documento, 345, yPosition + 4, { width: 80, lineBreak: false });
      doc.text(acudiente, 435, yPosition + 4, { width: 122, lineBreak: false });

      yPosition += 18;
    });

    // 9. Pie de página
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(8)
         .fillColor('#666666')
         .text(
           `ALIA - Sistema Académico | Página ${i + 1} de ${pages.count}`,
           50,
           doc.page.height - 50,
           { align: 'center' }
         );
    }

    doc.end();
  });
}

/**
 * Genera un PDF con el boletín de calificaciones
 */
export async function generarPDFBoletin(estudianteId, periodoId) {
  // Obtener información del estudiante
  const [estudiante] = await consultar(`
    SELECT e.*, p.nombre as periodo, p.anio,
           g.etiqueta as grado
    FROM estudiantes e
    JOIN matriculas m ON m.estudiante_id = e.id
    JOIN grados g ON g.id = m.grado_id
    JOIN periodos_academicos p ON p.id = m.periodo_id
    WHERE e.id = ? AND m.periodo_id = ?
  `, [estudianteId, periodoId]);

  // Obtener calificaciones
  const calificaciones = await consultar(`
    SELECT a.nombre as asignatura, ev.nombre as evaluacion,
           c.nota, ev.porcentaje
    FROM calificaciones c
    JOIN evaluaciones ev ON ev.id = c.evaluacion_id
    JOIN cursos cur ON cur.id = ev.curso_id
    JOIN asignaturas a ON a.id = cur.asignatura_id
    JOIN inscripciones i ON i.curso_id = cur.id AND i.estudiante_id = c.estudiante_id
    WHERE c.estudiante_id = ? AND i.periodo_id = ?
    ORDER BY a.nombre, ev.fecha
  `, [estudianteId, periodoId]);

  // Crear documento PDF
  const doc = new PDFDocument({ margin: 50 });
  const buffers = [];

  doc.on('data', buffers.push.bind(buffers));

  return new Promise((resolve, reject) => {
    doc.on('end', () => {
      const pdfData = Buffer.concat(buffers);
      resolve(pdfData);
    });

    doc.on('error', reject);

    // Encabezado
    doc.fontSize(20).text('Boletín de Calificaciones', { align: 'center' });
    doc.moveDown();

    // Información del estudiante
    doc.fontSize(12);
    doc.text(`Estudiante: ${estudiante.nombres} ${estudiante.apellidos}`);
    doc.text(`Documento: ${estudiante.documento}`);
    doc.text(`Grado: ${estudiante.grado}`);
    doc.text(`Período: ${estudiante.periodo} ${estudiante.anio}`);
    doc.moveDown(2);

    // Tabla de calificaciones
    doc.fontSize(14).text('Calificaciones:', { underline: true });
    doc.moveDown();

    let asignaturaActual = '';
    calificaciones.forEach(cal => {
      if (cal.asignatura !== asignaturaActual) {
        doc.fontSize(12).text(`\n${cal.asignatura}`, { bold: true });
        asignaturaActual = cal.asignatura;
      }
      doc.fontSize(10).text(
        `  • ${cal.evaluacion}: ${cal.nota} (${cal.porcentaje}%)`
      );
    });

    // Pie de página
    doc.moveDown(3);
    doc.fontSize(8).text(
      `Generado el ${new Date().toLocaleDateString('es-CO')}`,
      { align: 'center' }
    );

    doc.end();
  });
}

/**
 * Genera un certificado académico
 */
export async function generarPDFCertificado(estudianteId, periodoId) {
  const [info] = await consultar(`
    SELECT e.*, p.nombre as periodo, p.anio, g.etiqueta as grado
    FROM estudiantes e
    JOIN matriculas m ON m.estudiante_id = e.id
    JOIN grados g ON g.id = m.grado_id
    JOIN periodos_academicos p ON p.id = m.periodo_id
    WHERE e.id = ? AND m.periodo_id = ?
  `, [estudianteId, periodoId]);

  const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
  const buffers = [];

  doc.on('data', buffers.push.bind(buffers));

  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    // Diseño del certificado
    doc.fontSize(24).text('CERTIFICADO ACADÉMICO', { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(12).text('La institución certifica que:', { align: 'center' });
    doc.moveDown();

    doc.fontSize(16).text(
      `${info.nombres} ${info.apellidos}`,
      { align: 'center', bold: true }
    );
    doc.moveDown();

    doc.fontSize(12).text(
      `Con documento de identidad No. ${info.documento}`,
      { align: 'center' }
    );
    doc.moveDown();

    doc.text(
      `Cursó y aprobó el ${info.grado} durante el período ${info.periodo} ${info.anio}`,
      { align: 'center' }
    );

    doc.moveDown(3);
    doc.text(
      `Expedido el ${new Date().toLocaleDateString('es-CO')}`,
      { align: 'center' }
    );

    doc.end();
  });
}