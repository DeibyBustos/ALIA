// libreria-compartida/src/texto.js

export function normalizarEspacios(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

/**
 * Trocea texto en fragmentos con sobrelapamiento
 * CORREGIDO: Evita fragmentos muy cortos y bucles infinitos
 */
export function trocearTexto(texto, tam = 800, sobre = 120) {
  const limpio = normalizarEspacios(texto);
  
  // Validaciones
  if (!limpio || limpio.length === 0) {
    return [];
  }
  
  // Si el texto es más corto que el tamaño, retornar como único fragmento
  if (limpio.length <= tam) {
    return [limpio];
  }

  // Validar que sobre no sea >= tam
  if (sobre >= tam) {
    sobre = Math.floor(tam * 0.15); // 15% del tamaño
  }

  const chunks = [];
  let i = 0;
  const AVANCE_MINIMO = Math.floor(tam * 0.5); // Mínimo 50% del tamaño para avanzar

  while (i < limpio.length) {
    const fin = Math.min(i + tam, limpio.length);
    let slice = limpio.slice(i, fin);
    
    // Buscar punto de corte natural solo si no estamos al final
    if (fin < limpio.length) {
      const ultPunto = slice.lastIndexOf(". ");
      
      // Solo recortar si encontramos un punto en la segunda mitad del chunk
      if (ultPunto > tam * 0.6) {
        slice = slice.slice(0, ultPunto + 1).trim();
      } else {
        // Si no hay punto, buscar otros separadores
        const ultSalto = slice.lastIndexOf("\n");
        const ultComa = slice.lastIndexOf(", ");
        const ultEspacio = slice.lastIndexOf(" ");
        
        // Usar el mejor separador disponible (en la segunda mitad)
        const mejorCorte = Math.max(
          ultSalto > tam * 0.6 ? ultSalto : -1,
          ultComa > tam * 0.6 ? ultComa + 1 : -1,
          ultEspacio > tam * 0.7 ? ultEspacio : -1
        );
        
        if (mejorCorte > 0) {
          slice = slice.slice(0, mejorCorte).trim();
        }
      }
    }

    // Solo agregar fragmentos con contenido significativo
    if (slice.trim().length >= 30) {
      chunks.push(slice.trim());
    }

    // Calcular avance: asegurar que avanzamos al menos AVANCE_MINIMO
    const avanceCalculado = slice.length - sobre;
    const avance = Math.max(AVANCE_MINIMO, avanceCalculado);
    
    // Avanzar posición
    const nuevoI = i + avance;
    
    // Protección contra bucles infinitos
    if (nuevoI <= i) {
      i = Math.min(i + AVANCE_MINIMO, limpio.length);
    } else {
      i = nuevoI;
    }
  }

  return chunks;
}

/**
 * FUNCIÓN DE PRUEBA: Verificar que la fragmentación funciona correctamente
 */
export function testTrocearTexto() {
  console.log('\n🧪 Ejecutando tests de trocearTexto...\n');

  // Test 1: Texto corto
  const test1 = trocearTexto('Texto muy corto.', 800, 120);
  console.assert(test1.length === 1, '❌ Test 1 falló');
  console.log('✅ Test 1: texto corto');

  // Test 2: Texto largo con puntos
  const test2Texto = 'Esta es una oración. ' + 'Esta es otra oración. '.repeat(100);
  const test2 = trocearTexto(test2Texto, 400, 50);
  console.assert(test2.length > 1, '❌ Test 2 falló: debe generar múltiples fragmentos');
  console.assert(test2.every(c => c.length >= 30), '❌ Test 2 falló: fragmentos muy cortos');
  console.assert(test2.every(c => c.length <= 500), '❌ Test 2 falló: fragmentos muy largos');
  console.log(`✅ Test 2: ${test2.length} fragmentos (promedio: ${Math.round(test2.reduce((a,c) => a + c.length, 0) / test2.length)} chars)`);

  // Test 3: Texto sin puntos ni espacios
  const test3Texto = 'a'.repeat(2000);
  const test3 = trocearTexto(test3Texto, 500, 50);
  console.assert(test3.length >= 3, '❌ Test 3 falló: debe fragmentar texto largo sin puntos');
  console.log(`✅ Test 3: ${test3.length} fragmentos de texto sin puntos`);

  // Test 4: Verificar que no hay fragmentos duplicados exactos
  const test4Texto = 'Línea 1. Línea 2. Línea 3. '.repeat(50);
  const test4 = trocearTexto(test4Texto, 300, 50);
  const unicos = new Set(test4);
  console.assert(unicos.size === test4.length, '❌ Test 4 falló: hay fragmentos duplicados');
  console.log(`✅ Test 4: ${test4.length} fragmentos únicos`);

  // Test 5: Texto con formato Excel/CSV
  const test5Texto = '[Hoja: Sheet1] Docente,Correo,Asignatura,Curso,Dia,HoraInicio,HoraFin,Aula Ana Torres,ana.torres@colegio.edu,Lengua,5A,Lunes,07:00,07:55,501 Carlos Ruiz,carlos.ruiz@colegio.edu,Matemáticas,5A,Jueves,10:00,10:55,501 '.repeat(10);
  const test5 = trocearTexto(test5Texto, 600, 100);
  console.log(`✅ Test 5: ${test5.length} fragmentos de datos tabulares`);
  console.log(`   Longitudes: ${test5.map(c => c.length).join(', ')}`);

  // Test 6: Estadísticas detalladas
  console.log('\n📊 Estadísticas del Test 2:');
  test2.slice(0, 3).forEach((c, i) => {
    console.log(`   Fragmento ${i + 1}: ${c.length} chars - "${c.substring(0, 60)}..."`);
  });

  console.log('\n✨ Todos los tests completados\n');
}

// Descomentar para ejecutar tests:
 testTrocearTexto();