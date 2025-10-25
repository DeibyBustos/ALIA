import express from "express";
import fs from "node:fs";
import path from "node:path";
import { consultar, ejecutar } from "../../libreria-compartida/src/db.js";
import { logger } from "../../libreria-compartida/src/logger.js";
import { openai } from "../../libreria-compartida/src/openai.js";

// Importar generadores
import {
  generarExcelEstudiantes,
  generarExcelCalificaciones,
  generarExcelAsistencias,
  generarExcelHorarioEstudiante
} from "./generadores/excel.generador.js";
import {
  generarPDFBoletin,
  generarPDFCertificado
} from "./generadores/pdf.generador.js";
import {
  generarWordInforme
} from "./generadores/word.generador.js";

// Importar analizadores
import { analizarIntencion } from "./analizadores/intencion.analizador.js";
import { extraerParametros } from "./analizadores/parametros.extractor.js";

// Importar operaciones
import {
  insertarCalificacion,
  eliminarCalificacion,
  consultarCalificaciones
} from "./operaciones/calificaciones.ops.js";
import {
  insertarAsistencia,
  consultarAsistencias
} from "./operaciones/asistencias.ops.js";

// Importar recomendaciones
import { generarRecomendaciones } from "./recomendaciones/rendimiento.js";

// Importar manejador de contexto
import { ContextoManager } from "./chat/contexto.manager.js";

const router = express.Router();

// Directorio para almacenar documentos generados
const DOCS_DIR = path.join(process.cwd(), '..', 'storage', 'generados');
if (!fs.existsSync(DOCS_DIR)) {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
}

/**
 * POST /generacion/chat
 * Endpoint principal: procesa mensaje en lenguaje natural y ejecuta acciones
 */
async function postChatHandler(req, res) {
  try {
    const { mensaje, id_conversacion } = req.body;

    if (!mensaje || mensaje.trim() === "") {
      return res.status(400).json({ error: "Campo 'mensaje' es requerido" });
    }

    logger.info({ mensaje, id_conversacion }, "💬 Mensaje recibido");

    // 1. Crear o cargar contexto
    const contextoMgr = new ContextoManager(id_conversacion);
    await contextoMgr.cargarContexto();

    // 2. Analizar intención
    const intencion = await analizarIntencion(mensaje);
    logger.info({ intencion }, "🎯 Intención detectada");

    // 3. Extraer parámetros
    const parametros = await extraerParametros(mensaje, intencion);
    logger.info({ parametros }, "📊 Parámetros extraídos");

    // 4. Ejecutar acción según intención
    let respuesta = null;
    let archivoGenerado = null;

    switch (intencion) {
      case 'insertar_calificacion':
        respuesta = await insertarCalificacion(parametros);
        break;

      case 'eliminar_calificacion':
        respuesta = await eliminarCalificacion(parametros);
        break;

      case 'consultar_notas':
        respuesta = await consultarCalificaciones(parametros);
        break;

      case 'insertar_asistencia':
        respuesta = await insertarAsistencia(parametros);
        break;

      case 'consultar_asistencias':
        respuesta = await consultarAsistencias(parametros);
        break;

      case 'generar_excel_estudiantes':
        if (!parametros.grado) {
          respuesta = {
            exito: false,
            mensaje: "Necesito el grado para generar el Excel de estudiantes (ej: 6A, 7B)"
          };
        } else {
          const periodoId = parametros.periodo_id || 1; // Período por defecto
          const buffer = await generarExcelEstudiantes(parametros.grado, periodoId);
          const nombreArchivo = `estudiantes_${parametros.grado}_${Date.now()}.xlsx`;
          const rutaArchivo = path.join(DOCS_DIR, nombreArchivo);
          fs.writeFileSync(rutaArchivo, buffer);

          archivoGenerado = {
            tipo: 'EXCEL',
            nombre: nombreArchivo,
            ruta: rutaArchivo,
            url_descarga: `/generacion/descargar/${nombreArchivo}`
          };

          respuesta = {
            exito: true,
            mensaje: `Excel de estudiantes del grado ${parametros.grado} generado exitosamente`,
            archivo: archivoGenerado
          };
        }
        break;

      case 'generar_excel_calificaciones':
        if (!parametros.curso_id || !parametros.periodo_id) {
          respuesta = {
            exito: false,
            mensaje: "Necesito el curso_id y periodo_id para generar el Excel"
          };
        } else {
          const buffer = await generarExcelCalificaciones(parametros.curso_id, parametros.periodo_id);
          const nombreArchivo = `calificaciones_${Date.now()}.xlsx`;
          const rutaArchivo = path.join(DOCS_DIR, nombreArchivo);
          fs.writeFileSync(rutaArchivo, buffer);

          archivoGenerado = {
            tipo: 'EXCEL',
            nombre: nombreArchivo,
            ruta: rutaArchivo,
            url_descarga: `/generacion/descargar/${nombreArchivo}`
          };

          respuesta = {
            exito: true,
            mensaje: "Excel de calificaciones generado exitosamente",
            archivo: archivoGenerado
          };
        }
        break;

      case 'generar_pdf_boletin':
        if (!parametros.estudiante_id || !parametros.periodo_id) {
          respuesta = {
            exito: false,
            mensaje: "Necesito el estudiante_id y periodo_id para generar el boletín"
          };
        } else {
          const buffer = await generarPDFBoletin(parametros.estudiante_id, parametros.periodo_id);
          const nombreArchivo = `boletin_${Date.now()}.pdf`;
          const rutaArchivo = path.join(DOCS_DIR, nombreArchivo);
          fs.writeFileSync(rutaArchivo, buffer);

          archivoGenerado = {
            tipo: 'PDF',
            nombre: nombreArchivo,
            ruta: rutaArchivo,
            url_descarga: `/generacion/descargar/${nombreArchivo}`
          };

          respuesta = {
            exito: true,
            mensaje: "Boletín PDF generado exitosamente",
            archivo: archivoGenerado
          };
        }
        break;

      case 'recomendar':
        if (!parametros.estudiante_id || !parametros.periodo_id) {
          respuesta = {
            exito: false,
            mensaje: "Necesito el estudiante_id y periodo_id para generar recomendaciones"
          };
        } else {
          const recomendaciones = await generarRecomendaciones(parametros.estudiante_id, parametros.periodo_id);
          respuesta = {
            exito: true,
            datos: recomendaciones
          };
        }
        break;

      case 'consulta_general':
      default:
        // Usar RAG para responder pregunta general
        respuesta = await procesarConsultaGeneral(mensaje, contextoMgr);
        break;
    }

    // 5. Guardar en conversación si existe
    if (id_conversacion) {
      await ejecutar(`
        INSERT INTO mensajes_conversacion (id_conversacion, rol, contenido, metadatos)
        VALUES (?, 'user', ?, ?), (?, 'assistant', ?, ?)
      `, [
        id_conversacion, mensaje, JSON.stringify({ intencion, parametros }),
        id_conversacion, JSON.stringify(respuesta), JSON.stringify({ intencion })
      ]);

      // Guardar operación ejecutada
      await ejecutar(`
        INSERT INTO operaciones_ia (id_conversacion, tipo_operacion, parametros, resultado, estado)
        VALUES (?, ?, ?, ?, 'EJECUTADA')
      `, [id_conversacion, intencion, JSON.stringify(parametros), JSON.stringify(respuesta)]);

      // Guardar documento si se generó
      if (archivoGenerado) {
        await ejecutar(`
          INSERT INTO documentos_generados (id_conversacion, tipo_documento, nombre_archivo, ruta_almacenamiento, parametros_generacion, tamano_bytes)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [
          id_conversacion,
          archivoGenerado.tipo,
          archivoGenerado.nombre,
          archivoGenerado.ruta,
          JSON.stringify(parametros),
          fs.statSync(archivoGenerado.ruta).size
        ]);
      }
    }

    // 6. Actualizar contexto
    contextoMgr.actualizarContexto('ultima_intencion', intencion);
    contextoMgr.actualizarContexto('ultimos_parametros', parametros);
    await contextoMgr.guardarContexto();

    res.json({
      mensaje,
      intencion,
      parametros,
      respuesta,
      id_conversacion
    });

  } catch (err) {
    logger.error({ err, stack: err.stack }, "❌ Error en chat handler");
    res.status(500).json({
      error: "Error procesando mensaje",
      detalle: err.message
    });
  }
}

/**
 * Procesa consulta general usando RAG
 */
async function procesarConsultaGeneral(pregunta, contextoMgr) {
  try {
    // Aquí integrarías con svc-busqueda para obtener contexto relevante
    // Por ahora, respuesta simple con IA
    const historial = await contextoMgr.obtenerHistorial(5);
    const resumenContexto = contextoMgr.generarResumenContexto();

    // Construir prompt con contexto
    const mensajes = [
      {
        role: 'system',
        content: `Eres un asistente académico del sistema ALIA. ${resumenContexto}`
      },
      ...historial.map(h => ({
        role: h.rol,
        content: h.contenido
      })),
      {
        role: 'user',
        content: pregunta
      }
    ];

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
      messages: mensajes,
      temperature: 0.7,
      max_tokens: 500
    });

    const respuesta = response.choices[0]?.message?.content;

    return {
      exito: true,
      mensaje: respuesta,
      tokens_usados: response.usage?.total_tokens
    };

  } catch (err) {
    logger.error({ err }, "❌ Error en consulta general");
    return {
      exito: false,
      mensaje: "No pude procesar tu pregunta en este momento"
    };
  }
}

/**
 * POST /generacion/conversacion
 * Crea una nueva conversación
 */
async function postConversacionHandler(req, res) {
  try {
    const { titulo, id_usuario, contexto_inicial } = req.body;

    const result = await ejecutar(`
      INSERT INTO conversaciones (titulo, id_usuario, contexto_inicial)
      VALUES (?, ?, ?)
    `, [
      titulo || "Nueva conversación",
      id_usuario || null,
      contexto_inicial ? JSON.stringify(contexto_inicial) : null
    ]);

    logger.info({ id_conversacion: result.insertId }, "💬 Nueva conversación creada");

    res.status(201).json({
      id_conversacion: result.insertId,
      titulo: titulo || "Nueva conversación"
    });

  } catch (err) {
    logger.error({ err }, "❌ Error creando conversación");
    res.status(500).json({ error: "No se pudo crear la conversación", detalle: err.message });
  }
}

/**
 * GET /generacion/conversacion/:id
 * Obtiene el historial de una conversación
 */
async function getConversacionHandler(req, res) {
  try {
    const { id } = req.params;

    const [conversacion] = await consultar(`
      SELECT id, titulo, contexto_inicial, creado_en FROM conversaciones WHERE id = ?
    `, [id]);

    if (!conversacion) {
      return res.status(404).json({ error: "Conversación no encontrada" });
    }

    const mensajes = await consultar(`
      SELECT id, rol, contenido, metadatos, creado_en
      FROM mensajes_conversacion
      WHERE id_conversacion = ?
      ORDER BY creado_en ASC
    `, [id]);

    const operaciones = await consultar(`
      SELECT id, tipo_operacion, parametros, resultado, estado, creado_en
      FROM operaciones_ia
      WHERE id_conversacion = ?
      ORDER BY creado_en DESC
    `, [id]);

    res.json({
      ...conversacion,
      mensajes,
      operaciones
    });

  } catch (err) {
    logger.error({ err }, "❌ Error obteniendo conversación");
    res.status(500).json({ error: "No se pudo obtener la conversación", detalle: err.message });
  }
}

/**
 * GET /generacion/conversaciones
 * Lista todas las conversaciones
 */
async function getConversacionesHandler(req, res) {
  try {
    const { id_usuario } = req.query;

    const conversaciones = await consultar(`
      SELECT c.id, c.titulo, c.creado_en, c.actualizado_en,
             COUNT(DISTINCT m.id) as num_mensajes,
             COUNT(DISTINCT o.id) as num_operaciones
      FROM conversaciones c
      LEFT JOIN mensajes_conversacion m ON c.id = m.id_conversacion
      LEFT JOIN operaciones_ia o ON c.id = o.id_conversacion
      WHERE (? IS NULL OR c.id_usuario = ?)
      GROUP BY c.id
      ORDER BY c.actualizado_en DESC
      LIMIT 50
    `, [id_usuario, id_usuario]);

    res.json(conversaciones);

  } catch (err) {
    logger.error({ err }, "❌ Error listando conversaciones");
    res.status(500).json({ error: "No se pudieron listar las conversaciones", detalle: err.message });
  }
}

/**
 * POST /generacion/excel/calificaciones
 * Genera Excel de calificaciones
 */
async function generarExcelCalificacionesHandler(req, res) {
  try {
    const { curso_id, periodo_id } = req.body;

    if (!curso_id || !periodo_id) {
      return res.status(400).json({ error: "curso_id y periodo_id son requeridos" });
    }

    const buffer = await generarExcelCalificaciones(curso_id, periodo_id);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="calificaciones_${curso_id}_${periodo_id}.xlsx"`);
    res.send(buffer);

  } catch (err) {
    logger.error({ err }, "❌ Error generando Excel");
    res.status(500).json({ error: "Error generando Excel", detalle: err.message });
  }
}

/**
 * POST /generacion/pdf/boletin
 * Genera PDF boletín
 */
async function generarPDFBoletinHandler(req, res) {
  try {
    const { estudiante_id, periodo_id } = req.body;

    if (!estudiante_id || !periodo_id) {
      return res.status(400).json({ error: "estudiante_id y periodo_id son requeridos" });
    }

    const buffer = await generarPDFBoletin(estudiante_id, periodo_id);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="boletin_${estudiante_id}_${periodo_id}.pdf"`);
    res.send(buffer);

  } catch (err) {
    logger.error({ err }, "❌ Error generando PDF");
    res.status(500).json({ error: "Error generando PDF", detalle: err.message });
  }
}

/**
 * POST /generacion/recomendaciones
 * Genera recomendaciones académicas
 */
async function generarRecomendacionesHandler(req, res) {
  try {
    const { estudiante_id, periodo_id } = req.body;

    if (!estudiante_id || !periodo_id) {
      return res.status(400).json({ error: "estudiante_id y periodo_id son requeridos" });
    }

    const recomendaciones = await generarRecomendaciones(estudiante_id, periodo_id);

    res.json(recomendaciones);

  } catch (err) {
    logger.error({ err }, "❌ Error generando recomendaciones");
    res.status(500).json({ error: "Error generando recomendaciones", detalle: err.message });
  }
}

/**
 * GET /generacion/descargar/:archivo
 * Descarga un archivo generado
 */
function descargarArchivoHandler(req, res) {
  try {
    const { archivo } = req.params;
    const rutaArchivo = path.join(DOCS_DIR, archivo);

    if (!fs.existsSync(rutaArchivo)) {
      return res.status(404).json({ error: "Archivo no encontrado" });
    }

    res.download(rutaArchivo);

  } catch (err) {
    logger.error({ err }, "❌ Error descargando archivo");
    res.status(500).json({ error: "Error descargando archivo", detalle: err.message });
  }
}

/** ===== Rutas principales (sin prefijo porque el gateway ya envía a /generacion/*) ===== */
router.post("/chat", postChatHandler);
router.post("/conversacion", postConversacionHandler);
router.get("/conversacion/:id", getConversacionHandler);
router.get("/conversaciones", getConversacionesHandler);
router.post("/excel/calificaciones", generarExcelCalificacionesHandler);
router.post("/pdf/boletin", generarPDFBoletinHandler);
router.post("/recomendaciones", generarRecomendacionesHandler);
router.get("/descargar/:archivo", descargarArchivoHandler);

export default router;