import { consultar } from '../libreria-compartida/src/db.js';

(async () => {
  try {
    console.log('=== VERIFICANDO DATOS PARA PDF ===\n');

    // Misma consulta que usa el generador PDF
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
      WHERE g.etiqueta = '6A' AND m.periodo_id = 1
      ORDER BY e.apellidos, e.nombres
    `);

    console.log(`Total estudiantes encontrados: ${estudiantes.length}\n`);

    if (estudiantes.length > 0) {
      console.log('Primeros 3 estudiantes:');
      estudiantes.slice(0, 3).forEach((est, i) => {
        console.log(`\n${i + 1}. ${est.nombres} ${est.apellidos}`);
        console.log(`   Documento: ${est.documento}`);
        console.log(`   Acudiente: ${est.acudiente}`);
        console.log(`   Grado: ${est.grado}`);
      });
    } else {
      console.log('⚠️ NO HAY ESTUDIANTES EN LA BASE DE DATOS');
      console.log('\nVerificando grados disponibles:');
      const grados = await consultar('SELECT DISTINCT etiqueta FROM grados');
      console.log('Grados:', grados.map(g => g.etiqueta).join(', '));

      console.log('\nVerificando períodos:');
      const periodos = await consultar('SELECT id, nombre FROM periodos_academicos');
      console.log('Períodos:', periodos);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();
