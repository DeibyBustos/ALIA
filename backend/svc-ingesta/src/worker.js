import fs from "node:fs";
import path from "node:path";
import { consultar, ejecutar } from "../../libreria-compartida/src/db.js";
import { trocearTexto } from "../../libreria-compartida/src/texto.js";
import { embeddingTexto } from "../../libreria-compartida/src/openai.js";
import { logger } from "../../libreria-compartida/src/logger.js";
import { resolverRutaFSDesdeDB } from "../../libreria-compartida/src/almacenamiento.js";
import { extraerPDF } from "./extractores/pdf.js";
import { extraerDOCX } from "./extractores/docx.js";
import { extraerTXT } from "./extractores/txt.js";
import { extraerExcelComoTexto } from "./extractores/excel.js";

const TAM = +process.env.TAMANO_CHUNK || 800;
const OVER = +process.env.SOBRELAPAMIENTO_CHUNK || 120;
const BATCH = +process.env.INGESTA_BATCH || 5;
const POLL_MS = +process.env.INGESTA_POLL_MS || 2000;
const GUARDAR_TEXTO_COMPLETO = process.env.GUARDAR_TEXTO_COMPLETO !== "false";

// 🆕 Configuración de reintentos
const MAX_REINTENTOS = 3;
const DELAY_ENTRE_EMBEDDINGS = 100; // ms entre llamadas a OpenAI

/**
 * Intenta "reparar" rutas antiguas sin extensión probando variantes
 * derivadas del nombre original y del MIME.
 */
function intentarConExtensiones(baseSinExt, nombreOriginal, mime) {
  const candidatos = [];
  const extNom = (path.parse(nombreOriginal || "").ext || "").toLowerCase();
  if (extNom) candidatos.push(baseSinExt + extNom);

  const m = (mime || "").toLowerCase();
  if (m.includes("pdf")) candidatos.push(baseSinExt + ".pdf");
  else if (m.includes("word") || m.includes("officedocument.wordprocessingml.document")) candidatos.push(baseSinExt + ".docx");
  else if (m.includes("excel") || m.includes("spreadsheetml")) candidatos.push(baseSinExt + ".xlsx");
  else if (m.includes("text") || m.includes("plain")) candidatos.push(baseSinExt + ".txt");

  for (const cand of candidatos) if (fs.existsSync(cand)) return cand;
  return null;
}

/** Resuelve la ruta física desde lo guardado en BD (relativo), con fallback de extensión. */
function resolverRutaFisica(rutaDB, nombreOriginal, mime) {
  // 1) Convertir la ruta de BD (storage/AAAA-MM/...) a ruta de FS
  let rutaFS = resolverRutaFSDesdeDB(rutaDB);

  // 2) Si existe tal cual, usamos esa
  if (fs.existsSync(rutaFS)) return rutaFS;

  // 3) Si no existe, y no tiene extensión, probamos variantes con extensión
  const parsed = path.parse(rutaFS);
  if (!parsed.ext || !fs.existsSync(rutaFS)) {
    const baseSinExt = parsed.ext ? rutaFS.slice(0, rutaFS.length - parsed.ext.length) : rutaFS;
    const reparada = intentarConExtensiones(baseSinExt, nombreOriginal, mime);
    if (reparada) return reparada;
  }

  // 4) Devolver la original (fallará más adelante y quedará log)
  return rutaFS;
}

/**
 * Extrae texto de diferentes tipos de archivos.
 * Soporta PDF, DOCX, TXT, Excel y fallback a lectura UTF-8 binaria.
 */
async function extraerTexto(mime, rutaFS, nombre) {
  const low = (nombre || "").toLowerCase();
  
  try {
    if (mime?.includes("pdf") || low.endsWith(".pdf")) {
      return await extraerPDF(rutaFS);
    }
    if (mime?.includes("word") || low.endsWith(".docx") || low.endsWith(".doc")) {
      return await extraerDOCX(rutaFS);
    }
    if (mime?.includes("text") || low.endsWith(".txt") || low.endsWith(".md")) {
      return await extraerTXT(rutaFS);
    }

    // Excel con exceljs
    if (low.endsWith(".xlsx") || low.endsWith(".xls") || low.endsWith(".csv") || mime?.includes("spreadsheet")) {
      return await extraerExcelComoTexto(rutaFS);
    }

    // Fallback: intentar leer como UTF-8
    try {
      return fs.readFileSync(rutaFS, "utf8");
    } catch {
      const buf = fs.readFileSync(rutaFS);
      return buf.toString("utf8");
    }
  } catch (err) {
    logger.error({ err: err.message, rutaFS, mime }, "Error extrayendo texto");
    throw new Error(`No se pudo extraer texto del archivo: ${err.message}`);
  }
}

/**
 * 🆕 Validar que el texto extraído sea útil
 */
function validarTextoExtraido(texto, nombreArchivo) {
  if (!texto || typeof texto !== 'string') {
    throw new Error('Texto extraído es nulo o no es string');
  }

  const textoLimpio = texto.trim();
  
  if (textoLimpio.length < 50) {
    throw new Error(`Texto extraído muy corto (${textoLimpio.length} caracteres)`);
  }

  // Verificar que no sea solo caracteres especiales o basura
  const caracteresValidos = textoLimpio.replace(/[^a-zA-Z0-9]/g, '').length;
  const porcentajeValido = caracteresValidos / textoLimpio.length;
  
  if (porcentajeValido < 0.1) {
    throw new Error('Texto parece contener solo caracteres especiales o basura');
  }

  logger.debug({ 
    archivo: nombreArchivo,
    longitud: textoLimpio.length,
    porcentajeValido: (porcentajeValido * 100).toFixed(2) + '%'
  }, 'Texto validado correctamente');

  return textoLimpio;
}

/**
 * 🆕 Generar embedding con reintentos
 */
async function generarEmbeddingConReintentos(texto, intentosRestantes = MAX_REINTENTOS) {
  try {
    return await embeddingTexto(texto);
  } catch (err) {
    if (intentosRestantes <= 1) {
      logger.error({ err: err.message, texto: texto.substring(0, 100) }, 'Error generando embedding después de reintentos');
      throw err;
    }

    logger.warn({ 
      err: err.message, 
      intentosRestantes: intentosRestantes - 1 
    }, 'Error generando embedding, reintentando...');

    // Esperar un poco más antes de reintentar
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return generarEmbeddingConReintentos(texto, intentosRestantes - 1);
  }
}

/**
 * 🆕 Verificar si un documento ya tiene fragmentos válidos
 */
async function documentoTieneFragmentosValidos(idDocumento) {
  const resultado = await consultar(`
    SELECT 
      COUNT(*) as total,
      AVG(LENGTH(contenido)) as promedio_longitud,
      SUM(CASE WHEN LENGTH(contenido) < 50 THEN 1 ELSE 0 END) as fragmentos_cortos
    FROM fragmentos_documento
    WHERE id_documento = ?
  `, [idDocumento]);

  if (!resultado.length || resultado[0].total === 0) {
    return false;
  }

  const stats = resultado[0];
  
  // Considerar válido si tiene fragmentos y la mayoría no son cortos
  const esValido = stats.total > 0 && 
                   stats.promedio_longitud > 100 && 
                   stats.fragmentos_cortos === 0;

  if (esValido) {
    logger.info({ 
      idDocumento, 
      totalFragmentos: stats.total,
      promedioLongitud: Math.round(stats.promedio_longitud)
    }, 'Documento ya tiene fragmentos válidos, omitiendo');
  }

  return esValido;
}

/** Procesa una tarea individual de ingesta. */
async function procesarTarea(t) {
  await ejecutar(`UPDATE tareas_ingesta SET estado='EN_PROCESO', mensaje_error=NULL WHERE id=?`, [t.id]);

  try {
    logger.info({ 
      tarea: t.id, 
      documento: t.id_documento, 
      archivo: t.nombre_original 
    }, 'Iniciando procesamiento');

    // 🆕 Verificar si ya tiene fragmentos válidos (evita reprocesar)
    const yaExiste = await documentoTieneFragmentosValidos(t.id_documento);
    if (yaExiste) {
      await ejecutar(`UPDATE tareas_ingesta SET estado='TERMINADA', mensaje_error='Ya procesado' WHERE id=?`, [t.id]);
      logger.info({ tarea: t.id }, 'Tarea omitida: ya procesada');
      return;
    }

    // Resolver ruta física desde la ruta almacenada en BD (relativa) + reparar extensión si hace falta
    const rutaFS = resolverRutaFisica(t.ruta_almacenamiento, t.nombre_original, t.tipo_mime);
    
    if (!fs.existsSync(rutaFS)) {
      throw new Error(`Archivo no encontrado: ${rutaFS} (desde rutaBD=${t.ruta_almacenamiento})`);
    }

    logger.debug({ rutaFS }, 'Ruta física resuelta');

    // Extraer y validar texto
    const textoRaw = await extraerTexto(t.tipo_mime, rutaFS, t.nombre_original);
    const texto = validarTextoExtraido(textoRaw, t.nombre_original);

    logger.info({ 
      tarea: t.id,
      longitudTexto: texto.length,
      tamanoChunk: TAM,
      overlap: OVER
    }, 'Texto extraído, iniciando fragmentación');

    // 🆕 Fragmentar con la función CORREGIDA
    const chunks = trocearTexto(texto, TAM, OVER);

    if (!chunks || chunks.length === 0) {
      throw new Error('La fragmentación no produjo ningún chunk válido');
    }

    // 🆕 Validar que los chunks sean razonables
    const chunksValidos = chunks.filter(c => c && c.trim().length >= 30);
    
    if (chunksValidos.length === 0) {
      throw new Error('Ningún chunk válido después de filtrar (todos < 30 caracteres)');
    }

    logger.info({ 
      tarea: t.id,
      totalChunks: chunks.length,
      chunksValidos: chunksValidos.length,
      promedioLongitud: Math.round(chunksValidos.reduce((a, c) => a + c.length, 0) / chunksValidos.length)
    }, 'Fragmentación completada');

    // 🆕 Eliminar fragmentos antiguos antes de insertar nuevos
    const eliminados = await ejecutar(
      `DELETE FROM fragmentos_documento WHERE id_documento = ?`,
      [t.id_documento]
    );

    if (eliminados.affectedRows > 0) {
      logger.info({ 
        tarea: t.id, 
        eliminados: eliminados.affectedRows 
      }, 'Fragmentos antiguos eliminados');
    }

    // Procesar cada chunk válido
    let idx = 0;
    let procesados = 0;
    let fallidosEmbedding = 0;

    for (const ch of chunksValidos) {
      try {
        // 🆕 Generar embedding con reintentos
        const emb = await generarEmbeddingConReintentos(ch);
        
        // Guardar en BD
        await ejecutar(
          `INSERT INTO fragmentos_documento
           (id_documento, indice_fragmento, contenido, embedding_json, total_tokens)
           VALUES (?, ?, ?, ?, NULL)`,
          [t.id_documento, idx, ch, JSON.stringify(emb)]
        );

        procesados++;
        
        logger.debug({ 
          tarea: t.id, 
          indice: idx, 
          longitud: ch.length,
          preview: ch.substring(0, 60)
        }, 'Fragmento procesado');

        // Rate limiting entre embeddings
        if (idx < chunksValidos.length - 1) {
          await new Promise(resolve => setTimeout(resolve, DELAY_ENTRE_EMBEDDINGS));
        }

      } catch (err) {
        fallidosEmbedding++;
        logger.error({ 
          err: err.message, 
          tarea: t.id, 
          indice: idx,
          preview: ch.substring(0, 60)
        }, 'Error procesando fragmento individual');

        // Si fallan más del 50% de los embeddings, abortar
        if (fallidosEmbedding > chunksValidos.length * 0.5) {
          throw new Error(`Demasiados errores de embedding: ${fallidosEmbedding}/${chunksValidos.length}`);
        }
      }

      idx++;
    }

    // 🆕 Guardar texto completo en tabla separada
    if (GUARDAR_TEXTO_COMPLETO && texto && texto.length) {
      try {
        // Verificar si ya existe
        const existente = await consultar(
          `SELECT id FROM textos_documento WHERE id_documento = ?`,
          [t.id_documento]
        );

        if (existente.length > 0) {
          // Actualizar
          await ejecutar(
            `UPDATE textos_documento SET texto_completo = ? WHERE id_documento = ?`,
            [texto.slice(0, 5_000_000), t.id_documento]
          );
        } else {
          // Insertar
          await ejecutar(
            `INSERT INTO textos_documento (id_documento, texto_completo) VALUES (?, ?)`,
            [t.id_documento, texto.slice(0, 5_000_000)]
          );
        }

        logger.debug({ tarea: t.id }, 'Texto completo guardado');
      } catch (err) {
        logger.warn({ err: err.message, tarea: t.id }, 'Error guardando texto completo (no crítico)');
      }
    }

    // Marcar como terminada
    await ejecutar(`UPDATE tareas_ingesta SET estado='TERMINADA', mensaje_error=NULL WHERE id=?`, [t.id]);
    
    logger.info({ 
      tarea: t.id, 
      doc: t.id_documento, 
      procesados,
      fallidos: fallidosEmbedding,
      total: chunksValidos.length 
    }, '✅ Ingesta terminada exitosamente');

  } catch (err) {
    const mensajeError = String(err?.message || err).slice(0, 500);
    
    await ejecutar(
      `UPDATE tareas_ingesta SET estado='FALLIDA', mensaje_error=? WHERE id=?`, 
      [mensajeError, t.id]
    );
    
    logger.error({ 
      tarea: t.id, 
      documento: t.id_documento,
      archivo: t.nombre_original,
      err: err.message,
      stack: err.stack
    }, '❌ Ingesta fallida');
  }
}

/** Ciclo principal del worker: busca tareas pendientes y las procesa en lotes. */
async function ciclo() {
  try {
    const tareas = await consultar(
      `SELECT t.id, t.id_documento, d.ruta_almacenamiento, d.tipo_mime, d.nombre_original
       FROM tareas_ingesta t
       JOIN documentos d ON d.id = t.id_documento
       WHERE t.estado = 'PENDIENTE'
       ORDER BY t.id ASC
       LIMIT ?`, [BATCH]
    );

    if (tareas.length > 0) {
      logger.info({ cantidad: tareas.length }, 'Procesando lote de tareas');

      for (const t of tareas) {
        await procesarTarea(t).catch(err => 
          logger.error({ err: err.message, tarea: t.id }, 'Error procesando tarea en ciclo')
        );
      }
    }

  } catch (e) {
    logger.error({ err: e.message, stack: e.stack }, 'Fallo en ciclo de ingesta');
  } finally {
    setTimeout(ciclo, POLL_MS);
  }
}

// 🆕 Manejo de señales para cierre limpio
process.on('SIGTERM', () => {
  logger.info('SIGTERM recibido, cerrando worker...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT recibido, cerrando worker...');
  process.exit(0);
});

// Iniciar loop
logger.info({ 
  TAM, 
  OVER, 
  BATCH, 
  POLL_MS,
  GUARDAR_TEXTO_COMPLETO
}, '🚀 Worker de ingesta iniciado');

ciclo();