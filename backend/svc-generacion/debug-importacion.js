import { consultar } from '../libreria-compartida/src/db.js';

(async () => {
  try {
    console.log('=== DEBUG: VERIFICANDO DATOS DESPUÉS DE IMPORTACIÓN ===\n');

    // 1. Verificar estudiantes
    const estudiantes = await consultar('SELECT id, nombres, apellidos, documento FROM estudiantes LIMIT 5');
    console.log(`✓ Estudiantes en BD: ${estudiantes.length}`);
    if (estudiantes.length > 0) {
      console.log('  Ejemplo:', estudiantes[0]);
    }

    // 2. Verificar grados
    const grados = await consultar('SELECT id, etiqueta, nivel_id FROM grados');
    console.log(`\n✓ Grados en BD: ${grados.length}`);
    grados.forEach(g => console.log(`  - ID: ${g.id}, Etiqueta: "${g.etiqueta}", Nivel: ${g.nivel_id}`));

    // 3. Verificar períodos
    const periodos = await consultar('SELECT id, nombre, anio, activo FROM periodos_academicos');
    console.log(`\n✓ Períodos académicos: ${periodos.length}`);
    periodos.forEach(p => console.log(`  - ID: ${p.id}, Nombre: "${p.nombre}", Año: ${p.anio}, Activo: ${p.activo}`));

    // 4. Verificar matrículas
    const matriculas = await consultar(`
      SELECT m.id, m.estudiante_id, m.grado_id, m.periodo_id,
             e.nombres, e.apellidos, g.etiqueta as grado
      FROM matriculas m
      JOIN estudiantes e ON e.id = m.estudiante_id
      JOIN grados g ON g.id = m.grado_id
      LIMIT 10
    `);
    console.log(`\n✓ Matrículas en BD: ${matriculas.length}`);
    if (matriculas.length > 0) {
      console.log('  Ejemplos:');
      matriculas.slice(0, 3).forEach(m => {
        console.log(`  - ${m.nombres} ${m.apellidos} → Grado: "${m.grado}" (ID: ${m.grado_id}), Período: ${m.periodo_id}`);
      });
    }

    // 5. Consulta específica para 6A período 1 (la que falla)
    console.log('\n=== CONSULTA QUE FALLA ===');
    const resultado = await consultar(`
      SELECT
        e.id,
        e.nombres,
        e.apellidos,
        e.documento,
        g.etiqueta as grado,
        m.periodo_id
      FROM estudiantes e
      JOIN matriculas m ON m.estudiante_id = e.id
      JOIN grados g ON g.id = m.grado_id
      WHERE g.etiqueta = '6A' AND m.periodo_id = 1
    `);
    console.log(`Resultados para grado "6A" y período 1: ${resultado.length}`);

    if (resultado.length === 0) {
      console.log('\n⚠️ NO HAY RESULTADOS - Verificando causas posibles:\n');

      // Verificar si hay grado con etiqueta exacta '6A'
      const grado6A = await consultar(`SELECT id, etiqueta FROM grados WHERE etiqueta = '6A'`);
      if (grado6A.length === 0) {
        console.log('❌ NO existe un grado con etiqueta exactamente "6A"');
        console.log('   Grados disponibles:', grados.map(g => `"${g.etiqueta}"`).join(', '));
      } else {
        console.log(`✓ Existe grado 6A con ID: ${grado6A[0].id}`);

        // Verificar matrículas para ese grado
        const matriculasGrado = await consultar(`
          SELECT * FROM matriculas WHERE grado_id = ?
        `, [grado6A[0].id]);
        console.log(`  Matrículas en grado 6A: ${matriculasGrado.length}`);

        if (matriculasGrado.length > 0) {
          console.log(`  Períodos en esas matrículas:`, matriculasGrado.map(m => m.periodo_id));
        }
      }
    } else {
      console.log('✅ La consulta SÍ devuelve resultados:');
      resultado.forEach(r => console.log(`   - ${r.nombres} ${r.apellidos}`));
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
