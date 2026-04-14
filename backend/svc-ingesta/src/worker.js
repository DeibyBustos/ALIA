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

// Importadores estructurados
import { importarEstudiantesDesdeExcel } from "./importadores/estudiantes.js";
import { importarDocentesDesdeExcel } from "./importadores/docentes.js";


const TAM = +process.env.TAMANO_CHUNK || 800;
const OVER = +process.env.SOBRELAPAMIENTO_CHUNK || 120;
const BATCH = +process.env.INGESTA_BATCH || 5;
const POLL_MS = +process.env.INGESTA_POLL_MS || 2000;
const GUARDAR_TEXTO_COMPLETO = process.env.GUARDAR_TEXTO_COMPLETO !== "false";
const MAX_REINTENTOS = 3;
const DELAY_ENTRE_EMBEDDINGS = 100;

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

function resolverRutaFisica(rutaDB, nombreOriginal, mime) {
  let rutaFS = resolverRutaFSDesdeDB(rutaDB);
  if (fs.existsSync(rutaFS)) return rutaFS;

  const parsed = path.parse(rutaFS);
  if (!parsed.ext || !fs.existsSync(rutaFS)) {
    const baseSinExt = parsed.ext ? rutaFS.slice(0, rutaFS.length - parsed.ext.length) : rutaFS;
    const reparada = intentarConExtensiones(baseSinExt, nombreOriginal, mime);
    if (reparada) return reparada;
  }
  return rutaFS;
}

async function extraerTexto(mime, rutaFS, nombre) {
  const low = (nombre || "").toLowerCase();
  try {
    if (mime?.includes("pdf") || low.endsWith(".pdf")) return await extraerPDF(rutaFS);
    if (mime?.includes("word") || low.endsWith(".docx") || low.endsWith(".doc")) return await extraerDOCX(rutaFS);
    if (mime?.includes("text") || low.endsWith(".txt") || low.endsWith(".md")) return await extraerTXT(rutaFS);
    if (low.endsWith(".xlsx") || low.endsWith(".xls") || low.endsWith(".csv") || mime?.includes("spreadsheet")) {
      return await extraerExcelComoTexto(rutaFS);
    }
    try { return fs.readFileSync(rutaFS, "utf8"); }
    catch { return fs.readFileSync(rutaFS).toString("utf8"); }
  } catch (err) {
    logger.error({ err: err.message, rutaFS, mime }, "Error extrayendo texto");
    throw new Error(`No se pudo extraer texto del archivo: ${err.message}`);
  }
}

function validarTextoExtraido(texto, nombreArchivo) {
  if (!texto || typeof texto !== "string") throw new Error("Texto extraído es nulo o no es string");
  const textoLimpio = texto.trim();
  if (textoLimpio.length < 50) throw new Error(`Texto extraído muy corto (${textoLimpio.length} caracteres)`);
  const caracteresValidos = textoLimpio.replace(/[^a-zA-Z0-9]/g, "").length;
  const porcentajeValido = caracteresValidos / textoLimpio.length;
  if (porcentajeValido < 0.1) throw new Error("Texto parece contener solo caracteres especiales o basura");
  return textoLimpio;
}

async function generarEmbeddingConReintentos(texto, intentosRestantes = MAX_REINTENTOS) {
  try {
    return await embeddingTexto(texto);
  } catch (err) {
    if (intentosRestantes <= 1) {
      logger.error({ err: err.message }, "Error generando embedding tras reintentos");
      throw err;
    }
    logger.warn({ err: err.message, intentosRestantes: intentosRestantes - 1 }, "Embedding falló, reintentando...");
    await new Promise(r => setTimeout(r, 1000));
    return generarEmbeddingConReintentos(texto, intentosRestantes - 1);
  }
}

async function documentoTieneFragmentosValidos(idDocumento) {
  const resultado = await consultar(`
    SELECT COUNT(*) as total, AVG(LENGTH(contenido)) as promedio_longitud,
           SUM(CASE WHEN LENGTH(contenido) < 50 THEN 1 ELSE 0 END) as fragmentos_cortos
    FROM fragmentos_documento WHERE id_documento = ?
  `, [idDocumento]);
  if (!resultado.length || resultado[0].total === 0) return false;
  const stats = resultado[0];
  return stats.total > 0 && stats.promedio_longitud > 100 && stats.fragmentos_cortos === 0;
}

async function obtenerEtiquetasDoc(idDoc) {
  const filas = await consultar(`SELECT etiquetas FROM documentos WHERE id=?`, [idDoc]);
  logger.info({ filas, etiquetasRaw: filas?.[0]?.etiquetas, tipo: typeof filas?.[0]?.etiquetas }, "🔍 DEBUG: Leyendo etiquetas");
  
  if (!filas?.length || !filas[0].etiquetas) return null;
  const etiq = filas[0].etiquetas;
  
  if (typeof etiq === 'object' && etiq !== null) {
    logger.info({ etiquetas: etiq }, "Etiquetas ya son objeto");
    return etiq;
  }
  
  if (typeof etiq === 'string') {
    try {
      const parsed = JSON.parse(etiq);
      logger.info({ parsed }, "Etiquetas parseadas desde string");
      return parsed;
    } catch (e) {
      logger.warn({ etiq, error: e.message }, "Error parseando etiquetas");
      return null;
    }
  }
  return null;
}

/**
 * Genera fragmentos RAG para búsqueda semántica
 * Se usa tanto para documentos normales como para archivos de importación
 */
async function generarFragmentosRAG(rutaFS, idDocumento, nombreArchivo) {
  logger.info({ idDocumento, archivo: nombreArchivo }, "Generando fragmentos RAG");
  
  try {
    // Extraer texto del archivo
    const textoRaw = await extraerExcelComoTexto(rutaFS);
    const texto = validarTextoExtraido(textoRaw, nombreArchivo);
    
    // Fragmentar texto
    const chunks = trocearTexto(texto, TAM, OVER);
    if (!chunks || chunks.length === 0) {
      logger.warn({ idDocumento }, "No se generaron chunks");
      return { procesados: 0, fallidos: 0 };
    }
    
    const chunksValidos = chunks.filter(c => c && c.trim().length >= 30);
    if (chunksValidos.length === 0) {
      logger.warn({ idDocumento }, "No hay chunks válidos");
      return { procesados: 0, fallidos: 0 };
    }
    
    logger.info({ idDocumento, totalChunks: chunksValidos.length }, "Fragmentación completada");
    
    // Limpiar fragmentos anteriores
    await ejecutar(`DELETE FROM fragmentos_documento WHERE id_documento = ?`, [idDocumento]);
    
    // Generar embeddings y guardar
    let idx = 0, procesados = 0, fallidosEmbedding = 0;
    for (const ch of chunksValidos) {
      try {
        const emb = await generarEmbeddingConReintentos(ch);
        await ejecutar(
          `INSERT INTO fragmentos_documento (id_documento, indice_fragmento, contenido, embedding_json, total_tokens)
           VALUES (?, ?, ?, ?, NULL)`,
          [idDocumento, idx, ch, JSON.stringify(emb)]
        );
        procesados++;
        if (idx < chunksValidos.length - 1) {
          await new Promise(r => setTimeout(r, DELAY_ENTRE_EMBEDDINGS));
        }
      } catch (err) {
        fallidosEmbedding++;
        logger.warn({ err: err.message, fragmento: idx }, "Error generando embedding para fragmento");
        
        // Si hay demasiados fallos, abortar
        if (fallidosEmbedding > chunksValidos.length * 0.5) {
          throw new Error(`Demasiados errores de embedding: ${fallidosEmbedding}/${chunksValidos.length}`);
        }
      }
      idx++;
    }
    
    // Guardar texto completo si está habilitado
    if (GUARDAR_TEXTO_COMPLETO && texto && texto.length) {
      try {
        const existente = await consultar(`SELECT id FROM textos_documento WHERE id_documento = ?`, [idDocumento]);
        if (existente.length > 0) {
          await ejecutar(
            `UPDATE textos_documento SET texto_completo = ? WHERE id_documento = ?`, 
            [texto.slice(0, 5_000_000), idDocumento]
          );
        } else {
          await ejecutar(
            `INSERT INTO textos_documento (id_documento, texto_completo) VALUES (?, ?)`, 
            [idDocumento, texto.slice(0, 5_000_000)]
          );
        }
      } catch (err) {
        logger.warn({ err: err.message }, "Error guardando texto completo (no crítico)");
      }
    }
    
    return { procesados, fallidos: fallidosEmbedding };
    
  } catch (err) {
    logger.error({ err: err.message, idDocumento }, "Error generando fragmentos RAG");
    throw err;
  }
}

async function procesarTarea(t) {
  await ejecutar(`UPDATE tareas_ingesta SET estado='EN_PROCESO', mensaje_error=NULL WHERE id=?`, [t.id]);

  try {
    logger.info({ tarea: t.id, documento: t.id_documento, archivo: t.nombre_original }, "🟦 Iniciando procesamiento");

    const rutaFS = resolverRutaFisica(t.ruta_almacenamiento, t.nombre_original, t.tipo_mime);
    logger.info({ rutaFS, existe: fs.existsSync(rutaFS) }, "Ruta física resuelta");
    
    if (!fs.existsSync(rutaFS)) {
      throw new Error(`Archivo no encontrado: ${rutaFS}`);
    }

    const etiquetas = await obtenerEtiquetasDoc(t.id_documento);
    logger.info({ etiquetas: JSON.stringify(etiquetas) }, "Etiquetas del documento");

    const purpose = (etiquetas?.proposito || etiquetas?.purpose || "").toLowerCase();
    const imp = (etiquetas?.import || etiquetas?.tipo || "").toLowerCase();
    const nombreLower = (t.nombre_original || "").toLowerCase();
    const esExcel = t.tipo_mime?.includes("spreadsheet") || /\.(xlsx?|csv)$/.test(nombreLower);

    logger.info({
      purpose, imp, nombreLower, esExcel, tipoMime: t.tipo_mime,
      condicionEstudiantes: (esExcel && (purpose === "importar_estudiantes" || imp === "estudiantes")),
      condicionDocentes: (esExcel && (purpose === "importar_docentes" || imp === "docentes"))
    }, "🔍 ANÁLISIS DE CONDICIONES");

    // ==========================================
    // IMPORTAR ESTUDIANTES
    // ==========================================
    if (esExcel && (purpose === "importar_estudiantes" || imp === "estudiantes")) {
      logger.info({ tarea: t.id, doc: t.id_documento }, "EJECUTANDO IMPORTADOR DE ESTUDIANTES");
      
      try {
        // 1. Primero ejecutar la importación estructurada a la BD
        await importarEstudiantesDesdeExcel({
          rutaFS,
          idDocumento: t.id_documento,
          nombre: t.nombre_original,
          periodo: etiquetas?.periodo || null
        });
        
        const [countResult] = await consultar(`SELECT COUNT(*) as total FROM estudiantes`);
        logger.info({ tarea: t.id, totalEstudiantes: countResult.total }, "Importación estructurada de estudiantes completada");

        // 2. Ahora generar fragmentos RAG para que sea buscable
        logger.info({ tarea: t.id, doc: t.id_documento }, "Generando fragmentos RAG del archivo de estudiantes");
        
        const { procesados, fallidos } = await generarFragmentosRAG(rutaFS, t.id_documento, t.nombre_original);
        
        logger.info({ 
          tarea: t.id, 
          fragmentosGenerados: procesados, 
          fragmentosFallidos: fallidos 
        }, "Fragmentos RAG generados para archivo de estudiantes");
        
        await ejecutar(`UPDATE tareas_ingesta SET estado='TERMINADA', mensaje_error=NULL WHERE id=?`, [t.id]);
        logger.info({ tarea: t.id }, "Importación de estudiantes COMPLETADA (datos + fragmentos)");
        return;
        
      } catch (importError) {
        logger.error({ error: importError.message, stack: importError.stack, tarea: t.id }, "ERROR EN IMPORTADOR DE ESTUDIANTES");
        throw importError;
      }
    }

    // ==========================================
    // IMPORTAR DOCENTES
    // ==========================================
    if (esExcel && (purpose === "importar_docentes" || imp === "docentes")) {
      logger.info({ tarea: t.id, doc: t.id_documento }, "EJECUTANDO IMPORTADOR DE DOCENTES");
      
      try {
        // 1. Primero ejecutar la importación estructurada a la BD
        await importarDocentesDesdeExcel({
          rutaFS,
          idDocumento: t.id_documento,
          nombre: t.nombre_original,
          periodo: etiquetas?.periodo || null
        });
        
        const [countResult] = await consultar(`SELECT COUNT(*) as total FROM docentes`);
        logger.info({ tarea: t.id, totalDocentes: countResult.total }, "Importación estructurada de docentes completada");

        // 2. Ahora generar fragmentos RAG para que sea buscable
        logger.info({ tarea: t.id, doc: t.id_documento }, "Generando fragmentos RAG del archivo de docentes");
        
        const { procesados, fallidos } = await generarFragmentosRAG(rutaFS, t.id_documento, t.nombre_original);
        
        logger.info({ 
          tarea: t.id, 
          fragmentosGenerados: procesados, 
          fragmentosFallidos: fallidos 
        }, "Fragmentos RAG generados para archivo de docentes");
        
        await ejecutar(`UPDATE tareas_ingesta SET estado='TERMINADA', mensaje_error=NULL WHERE id=?`, [t.id]);
        logger.info({ tarea: t.id }, "Importación de docentes COMPLETADA (datos + fragmentos)");
        return;
        
      } catch (importError) {
        logger.error({ error: importError.message, stack: importError.stack, tarea: t.id }, "ERROR EN IMPORTADOR DE DOCENTES");
        throw importError;
      }
    }


     // ==========================================
    // IMPORTAR NOTAS
    // ==========================================

      if (esExcel && (purpose === "importar_notas" || imp === "notas" || imp === "calificaciones")) {
      logger.info({ tarea: t.id, doc: t.id_documento }, "EJECUTANDO IMPORTADOR DE NOTAS");
 
      try {
        // curso_id y periodo_id vienen en las etiquetas del documento
        const cursoId   = etiquetas?.curso_id   ? Number(etiquetas.curso_id)   : null;
        const periodoId = etiquetas?.periodo_id  ? Number(etiquetas.periodo_id) : null;
 
        // 1. Importación estructurada a la BD
        const resultado = await importarNotasDesdeExcel({
          rutaFS,
          idDocumento: t.id_documento,
          nombre:      t.nombre_original,
          cursoId,
          periodoId,
        });
 
        logger.info({
          tarea:      t.id,
          loteId:     resultado.loteId,
          filasOk:    resultado.filasOk,
          filasError: resultado.filasError,
        }, "Importación estructurada de notas completada");
 
        // 2. Fragmentos RAG para que el archivo quede buscable
        logger.info({ tarea: t.id, doc: t.id_documento }, "Generando fragmentos RAG del archivo de notas");
 
        const { procesados, fallidos } = await generarFragmentosRAG(rutaFS, t.id_documento, t.nombre_original);
 
        logger.info({
          tarea:               t.id,
          fragmentosGenerados: procesados,
          fragmentosFallidos:  fallidos,
        }, "Fragmentos RAG generados para archivo de notas");
 
        await ejecutar(`UPDATE tareas_ingesta SET estado='TERMINADA', mensaje_error=NULL WHERE id=?`, [t.id]);
        logger.info({ tarea: t.id }, "Importación de notas COMPLETADA (datos + fragmentos)");
        return;
 
      } catch (importError) {
        logger.error({ error: importError.message, stack: importError.stack, tarea: t.id },
          "ERROR EN IMPORTADOR DE NOTAS");
        throw importError;
      }
    }

    // ==========================================
    // FLUJO RAG (documentos normales)
    // ==========================================
    logger.info({ tarea: t.id }, "No es importación, continuando con flujo RAG estándar");

    const yaExiste = await documentoTieneFragmentosValidos(t.id_documento);
    if (yaExiste) {
      await ejecutar(`UPDATE tareas_ingesta SET estado='TERMINADA', mensaje_error='Ya procesado' WHERE id=?`, [t.id]);
      logger.info({ tarea: t.id }, "Tarea omitida: ya procesada");
      return;
    }

    const textoRaw = await extraerTexto(t.tipo_mime, rutaFS, t.nombre_original);
    const texto = validarTextoExtraido(textoRaw, t.nombre_original);

    const chunks = trocearTexto(texto, TAM, OVER);
    if (!chunks || chunks.length === 0) throw new Error("Sin chunks válidos");
    
    const chunksValidos = chunks.filter(c => c && c.trim().length >= 30);
    if (chunksValidos.length === 0) throw new Error("Ningún chunk válido");

    logger.info({ tarea: t.id, totalChunks: chunksValidos.length }, "Fragmentación completada");

    await ejecutar(`DELETE FROM fragmentos_documento WHERE id_documento = ?`, [t.id_documento]);

    let idx = 0, procesados = 0, fallidosEmbedding = 0;
    for (const ch of chunksValidos) {
      try {
        const emb = await generarEmbeddingConReintentos(ch);
        await ejecutar(
          `INSERT INTO fragmentos_documento (id_documento, indice_fragmento, contenido, embedding_json, total_tokens)
           VALUES (?, ?, ?, ?, NULL)`,
          [t.id_documento, idx, ch, JSON.stringify(emb)]
        );
        procesados++;
        if (idx < chunksValidos.length - 1) await new Promise(r => setTimeout(r, DELAY_ENTRE_EMBEDDINGS));
      } catch (err) {
        fallidosEmbedding++;
        if (fallidosEmbedding > chunksValidos.length * 0.5) {
          throw new Error(`Demasiados errores de embedding: ${fallidosEmbedding}/${chunksValidos.length}`);
        }
      }
      idx++;
    }

    if (GUARDAR_TEXTO_COMPLETO && texto && texto.length) {
      try {
        const existente = await consultar(`SELECT id FROM textos_documento WHERE id_documento = ?`, [t.id_documento]);
        if (existente.length > 0) {
          await ejecutar(`UPDATE textos_documento SET texto_completo = ? WHERE id_documento = ?`, [texto.slice(0, 5_000_000), t.id_documento]);
        } else {
          await ejecutar(`INSERT INTO textos_documento (id_documento, texto_completo) VALUES (?, ?)`, [t.id_documento, texto.slice(0, 5_000_000)]);
        }
      } catch (err) {
        logger.warn({ err: err.message }, "Error guardando texto completo (no crítico)");
      }
    }

    await ejecutar(`UPDATE tareas_ingesta SET estado='TERMINADA', mensaje_error=NULL WHERE id=?`, [t.id]);
    logger.info({ tarea: t.id, procesados, fallidos: fallidosEmbedding }, "Ingesta RAG terminada");

  } catch (err) {
    const mensajeError = String(err?.message || err).slice(0, 500);
    await ejecutar(`UPDATE tareas_ingesta SET estado='FALLIDA', mensaje_error=? WHERE id=?`, [mensajeError, t.id]);
    logger.error({ tarea: t.id, err: err.message }, "Ingesta fallida");
  }
}

async function ciclo() {
  try {
    const tareas = await consultar(
      `SELECT t.id, t.id_documento, d.ruta_almacenamiento, d.tipo_mime, d.nombre_original
       FROM tareas_ingesta t JOIN documentos d ON d.id = t.id_documento
       WHERE t.estado = 'PENDIENTE' ORDER BY t.id ASC LIMIT ?`, [BATCH]
    );

    if (tareas.length > 0) {
      logger.info({ cantidad: tareas.length }, "Procesando lote");
      for (const t of tareas) {
        await procesarTarea(t).catch(err => logger.error({ err: err.message, tarea: t.id }, "Error en tarea"));
      }
    }
  } catch (e) {
    logger.error({ err: e.message }, "Fallo en ciclo");
  } finally {
    setTimeout(ciclo, POLL_MS);
  }
}

process.on("SIGTERM", () => { logger.info("SIGTERM, cerrando..."); process.exit(0); });
process.on("SIGINT", () => { logger.info("SIGINT, cerrando..."); process.exit(0); });

logger.info({ TAM, OVER, BATCH, POLL_MS }, "Worker de ingesta iniciado");
ciclo();