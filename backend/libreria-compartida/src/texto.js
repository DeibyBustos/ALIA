export function normalizarEspacios(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

/**
 * Trocea texto en fragmentos con sobrelapamiento
 * Evita fragmentos muy cortos y bucles infinitos
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
    sobre = Math.floor(tam * 0.15); 
  }

  const chunks = [];
  let i = 0;
  const AVANCE_MINIMO = Math.floor(tam * 0.5); 

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