import PDFDocument from 'pdfkit';
import { consultar } from '../../../libreria-compartida/src/db.js';

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