import { Document, Packer, Paragraph, TextRun, Table, TableCell, TableRow } from 'docx';
import { consultar } from '../../../libreria-compartida/src/db.js';

/**
 * Genera un documento Word con el informe académico
 */
export async function generarWordInforme(estudianteId, periodoId) {
  const [estudiante] = await consultar(`
    SELECT e.*, p.nombre as periodo, p.anio, g.etiqueta as grado
    FROM estudiantes e
    JOIN matriculas m ON m.estudiante_id = e.id
    JOIN grados g ON g.id = m.grado_id
    JOIN periodos_academicos p ON p.id = m.periodo_id
    WHERE e.id = ? AND m.periodo_id = ?
  `, [estudianteId, periodoId]);

  const calificaciones = await consultar(`
    SELECT a.nombre as asignatura, AVG(c.nota) as promedio,
           COUNT(*) as num_evaluaciones
    FROM calificaciones c
    JOIN evaluaciones ev ON ev.id = c.evaluacion_id
    JOIN cursos cur ON cur.id = ev.curso_id
    JOIN asignaturas a ON a.id = cur.asignatura_id
    JOIN inscripciones i ON i.curso_id = cur.id AND i.estudiante_id = c.estudiante_id
    WHERE c.estudiante_id = ? AND i.periodo_id = ?
    GROUP BY a.id, a.nombre
  `, [estudianteId, periodoId]);

  // Crear documento
  const doc = new Document({
    sections: [{
      children: [
        // Título
        new Paragraph({
          text: 'INFORME ACADÉMICO',
          heading: 'Heading1',
          alignment: 'center'
        }),
        new Paragraph({ text: '' }),

        // Información del estudiante
        new Paragraph({
          children: [
            new TextRun({ text: 'Estudiante: ', bold: true }),
            new TextRun(`${estudiante.nombres} ${estudiante.apellidos}`)
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Documento: ', bold: true }),
            new TextRun(estudiante.documento || 'N/A')
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Grado: ', bold: true }),
            new TextRun(estudiante.grado)
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Período: ', bold: true }),
            new TextRun(`${estudiante.periodo} ${estudiante.anio}`)
          ]
        }),
        new Paragraph({ text: '' }),

        // Tabla de calificaciones
        new Paragraph({ text: 'Rendimiento Académico:', heading: 'Heading2' }),
        new Paragraph({ text: '' }),

        new Table({
          rows: [
            // Encabezado
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ text: 'Asignatura', bold: true })] }),
                new TableCell({ children: [new Paragraph({ text: 'Promedio', bold: true })] }),
                new TableCell({ children: [new Paragraph({ text: '# Evaluaciones', bold: true })] })
              ]
            }),
            // Datos
            ...calificaciones.map(cal =>
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph(cal.asignatura)] }),
                  new TableCell({ children: [new Paragraph(cal.promedio.toFixed(2))] }),
                  new TableCell({ children: [new Paragraph(String(cal.num_evaluaciones))] })
                ]
              })
            )
          ]
        })
      ]
    }]
  });

  // Generar buffer
  return await Packer.toBuffer(doc);
}