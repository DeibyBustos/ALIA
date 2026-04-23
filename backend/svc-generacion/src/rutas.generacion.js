import express from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { consultar, ejecutar } from "../../libreria-compartida/src/db.js";
import { logger } from "../../libreria-compartida/src/logger.js";
import { openai } from "../../libreria-compartida/src/openai.js";
import { RESPUESTA_FUERA_ALCANCE } from "../../libreria-compartida/src/topicFilter.js";

import {
  generarExcelEstudiantes,
  generarExcelCalificaciones,
  generarExcelAsistencias,
  generarExcelHorarioEstudiante
} from "./generadores/excel.generador.js";
import {
  generarPDFEstudiantes,
  generarPDFBoletin,
  generarPDFCertificado
} from "./generadores/pdf.generador.js";
import { generarWordInforme } from "./generadores/word.generador.js";
import { analizarIntencion } from "./analizadores/intencion.analizador.js";
import { extraerParametros } from "./analizadores/parametros.extractor.js";
import {
  insertarCalificacion,
  eliminarCalificacion,
  consultarCalificaciones
} from "./operaciones/calificaciones.ops.js";
import {
  insertarAsistencia,
  consultarAsistencias
} from "./operaciones/asistencias.ops.js";
import {
  consultarMateriasEstudiante,
  consultarAcudiente,
  consultarInfoEstudiante,
  consultarEstudiantesGrado,
  consultarHorarioEstudiante,
  consultarHorarioDocente
} from "./operaciones/consultas.ops.js";
import { importarCalificaciones } from "./operaciones/calificaciones.importar.ops.js";
import { importarPlaneaciones } from "./operaciones/planeaciones.importar.ops.js";
import { generarRecomendaciones } from "./recomendaciones/rendimiento.js";
import { ContextoManager } from "./chat/contexto.manager.js";
import { consultarPlaneacion } from "./analizadores/intencion.analizador.js";

const router = express.Router();

// ── Directorios de almacenamiento ─────────────────────────────────────────────
const DOCS_DIR    = path.join(process.cwd(), '..', 'storage', 'generados');
const UPLOADS_DIR = path.join(process.cwd(), '..', 'storage', 'uploads');
if (!fs.existsSync(DOCS_DIR))    fs.mkdirSync(DOCS_DIR,    { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({
  dest: '/tmp/alia-notas/',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls', '.csv'].includes(ext)) return cb(null, true);
    cb(new Error('Solo se aceptan archivos .xlsx, .xls o .csv'));
  },
});

// ── Función reutilizable para guardar en storage/YYYY-MM ──────────────────────
function generarRutaStorage(nombreOriginal) {
  const fecha = new Date();
  const anioMes = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;

  const carpeta = path.join(process.cwd(), '..', 'storage', anioMes);
  if (!fs.existsSync(carpeta)) {
    fs.mkdirSync(carpeta, { recursive: true });
  }

  const nombreArchivo = `${Date.now()}-${nombreOriginal.replace(/\s+/g, '-')}`;
  const rutaFinal = path.join(carpeta, nombreArchivo);

  return { rutaFinal, nombreArchivo, anioMes };
}

function guardarArchivo(buffer, nombreArchivo) {
  if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true });
  const rutaArchivo = path.join(DOCS_DIR, nombreArchivo);
  fs.writeFileSync(rutaArchivo, buffer);
  return {
    tipo: nombreArchivo.endsWith('.xlsx') ? 'EXCEL' : nombreArchivo.endsWith('.pdf') ? 'PDF' : 'WORD',
    nombre: nombreArchivo,
    ruta: rutaArchivo,
    url_descarga: `/generacion/descargar/${nombreArchivo}`
  };
}

// ── Chat ──────────────────────────────────────────────────────────────────────

async function postChatHandler(req, res) {
  try {
    const { mensaje, id_conversacion } = req.body;
    if (!mensaje || mensaje.trim() === "") {
      return res.status(400).json({ error: "Campo 'mensaje' es requerido" });
    }
    logger.info({ mensaje, id_conversacion }, "Mensaje recibido");
    const contextoMgr = new ContextoManager(id_conversacion);
    await contextoMgr.cargarContexto();
    const intencion = await analizarIntencion(mensaje);
    logger.info({ intencion }, "Intención detectada");
    const parametros = await extraerParametros(mensaje, intencion);
    logger.info({ parametros }, "Parámetros extraídos");
    let respuesta = null;
    let archivoGenerado = null;

    switch (intencion) {
      case 'insertar_calificacion':
        respuesta = await insertarCalificacion(parametros); break;
      case 'eliminar_calificacion':
        respuesta = await eliminarCalificacion(parametros); break;
      case 'insertar_asistencia':
        respuesta = await insertarAsistencia(parametros); break;
      case 'consultar_notas':
        respuesta = await consultarCalificaciones(parametros); break;
      case 'consultar_asistencias':
        respuesta = await consultarAsistencias(parametros); break;

      case 'consultar_estudiantes_grado': {
        if (!parametros.grado) {
          respuesta = { exito: false, mensaje: "Necesito el grado para consultar los estudiantes. Indícame el grado, por ejemplo: 6A o 7B." };
          break;
        }
        respuesta = await consultarEstudiantesGrado(parametros);
        if (respuesta.exito && respuesta.datos?.estudiantes?.length) {
          const { estudiantes, grado, total } = respuesta.datos;
          let msg = `El grado ${grado} tiene ${total} estudiante${total === 1 ? '' : 's'} matriculado${total === 1 ? '' : 's'}:\n\n`;
          estudiantes.forEach((e, i) => {
            msg += `${i + 1}. ${e.nombres} ${e.apellidos}`;
            if (e.documento) msg += ` — Documento: ${e.documento}`;
            msg += '\n';
          });
          respuesta.mensaje = msg.trim();
        }
        break;
      }

      case 'consultar_materias_estudiante':
        if (!parametros.estudiante_nombre) {
          respuesta = { exito: false, mensaje: "Necesito el nombre del estudiante para consultar sus materias." }; break;
        }
        respuesta = await consultarMateriasEstudiante(parametros);
        if (respuesta.exito && respuesta.datos?.materias?.length) {
          const { estudiante, grado, materias } = respuesta.datos;
          let msg = `${estudiante} (Grado ${grado}) tiene las siguientes materias inscritas:\n\n`;
          materias.forEach((m, i) => {
            msg += `${i + 1}. ${m.asignatura}`;
            if (m.docente) msg += ` — Docente: ${m.docente}`;
            msg += '\n';
          });
          respuesta.mensaje = msg.trim();
        }
        break;

      case 'consultar_acudiente':
        if (!parametros.estudiante_nombre) {
          respuesta = { exito: false, mensaje: "Necesito el nombre del estudiante para consultar su acudiente." }; break;
        }
        respuesta = await consultarAcudiente(parametros);
        if (respuesta.exito && respuesta.datos?.acudientes?.length) {
          const { estudiante, acudientes } = respuesta.datos;
          let msg = '';
          acudientes.forEach((a) => {
            msg += `El acudiente de ${estudiante} es ${a.nombres} ${a.apellidos}`;
            if (a.relacion) msg += `, ${a.relacion.toLowerCase()}`;
            msg += '.';
            if (a.telefono && a.correo)   msg += ` Teléfono: ${a.telefono}. Correo: ${a.correo}.`;
            else if (a.telefono)          msg += ` Teléfono: ${a.telefono}.`;
            else if (a.correo)            msg += ` Correo: ${a.correo}.`;
            msg += '\n\n';
          });
          respuesta.mensaje = msg.trim();
        }
        break;

      case 'consultar_info_estudiante':
        if (!parametros.estudiante_nombre) {
          respuesta = { exito: false, mensaje: "Necesito el nombre del estudiante para consultar su información." }; break;
        }
        respuesta = await consultarInfoEstudiante(parametros);
        if (respuesta.exito && respuesta.datos) {
          const { estudiante, matricula_actual } = respuesta.datos;
          let msg = `Estudiante: ${estudiante.nombre}\n`;
          if (estudiante.documento)        msg += `Documento: ${estudiante.documento}\n`;
          if (estudiante.fecha_nacimiento) msg += `Fecha de nacimiento: ${estudiante.fecha_nacimiento}\n`;
          if (matricula_actual) {
            msg += `\nMatrícula actual: Grado ${matricula_actual.grado}, período ${matricula_actual.periodo} ${matricula_actual.anio}, estado ${matricula_actual.estado.toLowerCase()}.`;
          } else {
            msg += '\nNo tiene matrícula activa registrada.';
          }
          respuesta.mensaje = msg.trim();
        }
        break;

      case 'consultar_horario_estudiante':
        if (!parametros.estudiante_nombre) {
          respuesta = { exito: false, mensaje: "Necesito el nombre del estudiante para consultar su horario." }; break;
        }
        respuesta = await consultarHorarioEstudiante(parametros);
        if (respuesta.exito && respuesta.datos?.horario?.length) {
          const dias = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
          const { estudiante, horario } = respuesta.datos;
          let msg = `Horario de ${estudiante}:\n\n`;
          for (const h of horario) {
            const dia = dias[h.dia_semana] || `Día ${h.dia_semana}`;
            msg += `${dia} de ${h.hora_inicio} a ${h.hora_fin}: ${h.asignatura}`;
            if (h.aula)    msg += ` — Aula: ${h.aula}`;
            if (h.docente) msg += ` — Docente: ${h.docente}`;
            msg += '\n';
          }
          respuesta.mensaje = msg.trim();
        }
        break;

      case 'consultar_horario_docente':
        if (!parametros.docente_nombre) {
          respuesta = { exito: false, mensaje: "Necesito el nombre del docente para consultar su horario." }; break;
        }
        respuesta = await consultarHorarioDocente(parametros);
        if (respuesta.exito && respuesta.datos?.horario?.length) {
          const dias = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
          const { docente, horario } = respuesta.datos;
          let msg = `Horario de ${docente}:\n\n`;
          for (const h of horario) {
            const dia = dias[h.dia_semana] || `Día ${h.dia_semana}`;
            msg += `${dia} de ${h.hora_inicio} a ${h.hora_fin}: ${h.asignatura}`;
            if (h.curso)            msg += ` — Curso: ${h.curso}`;
            if (h.aula_codigo)      msg += ` — Aula: ${h.aula_codigo}`;
            else if (h.aula_nombre) msg += ` — Aula: ${h.aula_nombre}`;
            msg += '\n';
          }
          respuesta.mensaje = msg.trim();
        }
        break;

      case 'consultar_planeacion': {
      const resultadoPlaneacion = await consultarPlaneacion(mensaje);
        respuesta = {
          exito: true,
          mensaje: resultadoPlaneacion.mensaje,
          datos: resultadoPlaneacion.datos
        };
        break;
      }

      case 'generar_excel_estudiantes':
        if (!parametros.grado) {
          respuesta = { exito: false, mensaje: "Necesito el grado para generar el Excel de estudiantes. Indícame el grado, por ejemplo: 6A o 7B." };
        } else {
          const buffer = await generarExcelEstudiantes(parametros.grado, parametros.periodo_id || 1);
          archivoGenerado = guardarArchivo(buffer, `estudiantes_${parametros.grado}_${Date.now()}.xlsx`);
          respuesta = { exito: true, mensaje: `Se generó el Excel de estudiantes del grado ${parametros.grado}.`, archivo: archivoGenerado };
        }
        break;

      case 'generar_pdf_estudiantes':
        if (!parametros.grado) {
          respuesta = { exito: false, mensaje: "Necesito el grado para generar el PDF de estudiantes. Indícame el grado, por ejemplo: 6A o 7B." };
        } else {
          const buffer = await generarPDFEstudiantes(parametros.grado, parametros.periodo_id || 1);
          archivoGenerado = guardarArchivo(buffer, `estudiantes_${parametros.grado}_${Date.now()}.pdf`);
          respuesta = { exito: true, mensaje: `Se generó el PDF de estudiantes del grado ${parametros.grado}.`, archivo: archivoGenerado };
        }
        break;

      case 'generar_excel_calificaciones':
        if (!parametros.curso_id || !parametros.periodo_id) {
          respuesta = { exito: false, mensaje: "Necesito el curso y el período para generar el Excel de calificaciones." };
        } else {
          const buffer = await generarExcelCalificaciones(parametros.curso_id, parametros.periodo_id);
          archivoGenerado = guardarArchivo(buffer, `calificaciones_${Date.now()}.xlsx`);
          respuesta = { exito: true, mensaje: "Se generó el Excel de calificaciones.", archivo: archivoGenerado };
        }
        break;

      case 'generar_pdf_boletin':
        if (!parametros.estudiante_id || !parametros.periodo_id) {
          respuesta = { exito: false, mensaje: "Necesito el estudiante y el período para generar el boletín." };
        } else {
          const buffer = await generarPDFBoletin(parametros.estudiante_id, parametros.periodo_id);
          archivoGenerado = guardarArchivo(buffer, `boletin_${Date.now()}.pdf`);
          respuesta = { exito: true, mensaje: "Se generó el boletín en PDF.", archivo: archivoGenerado };
        }
        break;

      case 'recomendar':
        if (!parametros.estudiante_id || !parametros.periodo_id) {
          respuesta = { exito: false, mensaje: "Necesito el estudiante y el período para generar recomendaciones." };
        } else {
          const recomendaciones = await generarRecomendaciones(parametros.estudiante_id, parametros.periodo_id);
          respuesta = { exito: true, datos: recomendaciones };
        }
        break;

      case 'fuera_de_alcance':
        respuesta = { exito: false, mensaje: RESPUESTA_FUERA_ALCANCE }; break;
      case 'consulta_general':
      default:
        respuesta = await procesarConsultaGeneral(mensaje, contextoMgr); break;
    }

    if (id_conversacion) {
      await ejecutar(`
        INSERT INTO mensajes_conversacion (id_conversacion, rol, contenido, metadatos)
        VALUES (?, 'user', ?, ?), (?, 'assistant', ?, ?)
      `, [
        id_conversacion, mensaje, JSON.stringify({ intencion, parametros }),
        id_conversacion, JSON.stringify(respuesta), JSON.stringify({ intencion })
      ]);
      await ejecutar(`
        INSERT INTO operaciones_ia (id_conversacion, tipo_operacion, parametros, resultado, estado)
        VALUES (?, ?, ?, ?, 'EJECUTADA')
      `, [id_conversacion, intencion, JSON.stringify(parametros), JSON.stringify(respuesta)]);
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

    contextoMgr.actualizarContexto('ultima_intencion', intencion);
    contextoMgr.actualizarContexto('ultimos_parametros', parametros);
    await contextoMgr.guardarContexto();
    res.json({ mensaje, intencion, parametros, respuesta, id_conversacion });

  } catch (err) {
    logger.error({ err, stack: err.stack }, "Error en chat handler");
    res.status(500).json({ error: "Error procesando mensaje", detalle: err.message });
  }
}

async function procesarConsultaGeneral(pregunta, contextoMgr) {
  try {
    const historial = await contextoMgr.obtenerHistorial(5);
    const resumenContexto = contextoMgr.generarResumenContexto();
    const mensajes = [
      {
        role: 'system',
        content: `Eres un asistente académico del sistema ALIA, diseñado exclusivamente para apoyar a docentes, coordinadores y personal administrativo de instituciones de educación básica y secundaria.
${resumenContexto}
REGLA ESTRICTA: Solo puedes responder preguntas relacionadas con el trabajo escolar: estudiantes, calificaciones, asistencias, horarios, planeaciones, documentos institucionales y gestión académica. Si el usuario pregunta algo fuera de ese contexto (recetas, entretenimiento, deportes, noticias, vida personal, etc.), responde ÚNICAMENTE: "Disculpa, no puedo ayudarte con eso. Estoy diseñado para apoyarte en tareas del entorno escolar: estudiantes, calificaciones, horarios, asistencias y documentos institucionales. ¿En qué puedo ayudarte en ese ámbito?"
Responde de forma clara, directa y en español. No uses emojis. Si el usuario pregunta sobre datos específicos de un estudiante, indícale que puedes consultar esa información si te proporciona el nombre del estudiante.`
      },
      ...historial.map(h => ({
        role: h.rol === 'user' ? 'user' : 'assistant',
        content: typeof h.contenido === 'string' ? h.contenido : JSON.stringify(h.contenido)
      })),
      { role: 'user', content: pregunta }
    ];
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
      messages: mensajes,
      temperature: 0.7,
      max_tokens: 500
    });
    return {
      exito: true,
      mensaje: response.choices[0]?.message?.content,
      tokens_usados: response.usage?.total_tokens
    };
  } catch (err) {
    logger.error({ err }, "Error en consulta general");
    return { exito: false, mensaje: "No fue posible procesar la consulta en este momento. Intenta de nuevo." };
  }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function postConversacionHandler(req, res) {
  try {
    const { titulo, id_usuario, contexto_inicial } = req.body;
    const result = await ejecutar(`
      INSERT INTO conversaciones (titulo, id_usuario, contexto_inicial) VALUES (?, ?, ?)
    `, [titulo || "Nueva conversación", id_usuario || null, contexto_inicial ? JSON.stringify(contexto_inicial) : null]);
    res.status(201).json({ id_conversacion: result.insertId, titulo: titulo || "Nueva conversación" });
  } catch (err) {
    logger.error({ err }, "Error creando conversación");
    res.status(500).json({ error: "No se pudo crear la conversación", detalle: err.message });
  }
}

async function getConversacionHandler(req, res) {
  try {
    const { id } = req.params;
    const [conversacion] = await consultar(`SELECT id, titulo, contexto_inicial, creado_en FROM conversaciones WHERE id = ?`, [id]);
    if (!conversacion) return res.status(404).json({ error: "Conversación no encontrada" });
    const mensajes = await consultar(`
      SELECT id, rol, contenido, metadatos, creado_en
      FROM mensajes_conversacion WHERE id_conversacion = ? ORDER BY creado_en ASC
    `, [id]);
    const operaciones = await consultar(`
      SELECT id, tipo_operacion, parametros, resultado, estado, creado_en
      FROM operaciones_ia WHERE id_conversacion = ? ORDER BY creado_en DESC
    `, [id]);
    res.json({ ...conversacion, mensajes, operaciones });
  } catch (err) {
    logger.error({ err }, "Error obteniendo conversación");
    res.status(500).json({ error: "No se pudo obtener la conversación", detalle: err.message });
  }
}

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
      GROUP BY c.id ORDER BY c.actualizado_en DESC LIMIT 50
    `, [id_usuario ?? null, id_usuario ?? null]);
    res.json(conversaciones);
  } catch (err) {
    logger.error({ err }, "Error listando conversaciones");
    res.status(500).json({ error: "No se pudieron listar las conversaciones", detalle: err.message });
  }
}

async function generarExcelCalificacionesHandler(req, res) {
  try {
    const { curso_id, periodo_id } = req.body;
    if (!curso_id || !periodo_id) return res.status(400).json({ error: "curso_id y periodo_id son requeridos" });
    const buffer = await generarExcelCalificaciones(curso_id, periodo_id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="calificaciones_${curso_id}_${periodo_id}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    logger.error({ err }, "Error generando Excel");
    res.status(500).json({ error: "Error generando Excel", detalle: err.message });
  }
}

async function generarPDFBoletinHandler(req, res) {
  try {
    const { estudiante_id, periodo_id } = req.body;
    if (!estudiante_id || !periodo_id) return res.status(400).json({ error: "estudiante_id y periodo_id son requeridos" });
    const buffer = await generarPDFBoletin(estudiante_id, periodo_id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="boletin_${estudiante_id}_${periodo_id}.pdf"`);
    res.send(buffer);
  } catch (err) {
    logger.error({ err }, "Error generando PDF");
    res.status(500).json({ error: "Error generando PDF", detalle: err.message });
  }
}

async function generarRecomendacionesHandler(req, res) {
  try {
    const { estudiante_id, periodo_id } = req.body;
    if (!estudiante_id || !periodo_id) return res.status(400).json({ error: "estudiante_id y periodo_id son requeridos" });
    const recomendaciones = await generarRecomendaciones(estudiante_id, periodo_id);
    res.json(recomendaciones);
  } catch (err) {
    logger.error({ err }, "Error generando recomendaciones");
    res.status(500).json({ error: "Error generando recomendaciones", detalle: err.message });
  }
}

function descargarArchivoHandler(req, res) {
  try {
    const { archivo } = req.params;
    const rutaArchivo = path.join(DOCS_DIR, archivo);
    if (!fs.existsSync(rutaArchivo)) return res.status(404).json({ error: "Archivo no encontrado" });
    res.download(rutaArchivo);
  } catch (err) {
    logger.error({ err }, "Error descargando archivo");
    res.status(500).json({ error: "Error descargando archivo", detalle: err.message });
  }
}

// ── Handler importar notas (CORREGIDO) ────────────────────────────────────────
async function importarNotasHandler(req, res) {
  const archivo = req.file;
  if (!archivo) return res.status(400).json({ error: 'Falta el archivo.' });

  // Mover a storage/YYYY-MM igual que estudiantes
  const { rutaFinal, nombreArchivo, anioMes } = generarRutaStorage(archivo.originalname);

  try {
    fs.copyFileSync(archivo.path, rutaFinal);
    fs.unlink(archivo.path, () => {});

    const docResult = await ejecutar(
      `INSERT INTO documentos
         (titulo, tipo_documento, ruta_almacenamiento, nombre_original, tipo_mime, tamano_bytes)
       VALUES (?, 'excel_calificaciones', ?, ?, ?, ?)`,
      [
        `Cargue notas – ${archivo.originalname}`,
        `storage/${anioMes}/${nombreArchivo}`,
        archivo.originalname,
        archivo.mimetype,
        archivo.size,
      ]
    );

    const resultado = await importarCalificaciones({
      rutaArchivo: rutaFinal,
      documentoId: docResult.insertId,
    });

    const status = resultado.filasOk === 0 && resultado.filasError > 0 ? 422 : 200;
    return res.status(status).json({
      lote_id:     resultado.loteId,
      total_filas: resultado.totalFilas,
      filas_ok:    resultado.filasOk,
      filas_error: resultado.filasError,
      errores:     resultado.errores,
    });
  } catch (err) {
    // Intentar limpiar /tmp si aún existe (por si copyFileSync falló antes)
    fs.unlink(archivo?.path, () => {});
    logger.error({ err }, 'Error importando notas');
    return res.status(422).json({ error: err.message });
  }
}

// ── Handler importar planeaciones (CORREGIDO) ─────────────────────────────────
async function importarPlaneacionesHandler(req, res) {
  const archivo = req.file;
  if (!archivo) return res.status(400).json({ error: 'Falta el archivo.' });

  // Mover a storage/YYYY-MM igual que estudiantes
  const { rutaFinal, nombreArchivo, anioMes } = generarRutaStorage(archivo.originalname);

  try {
    // Leer buffer antes de mover (importarPlaneaciones lo necesita)
    const buffer = fs.readFileSync(archivo.path);

    fs.copyFileSync(archivo.path, rutaFinal);
    fs.unlink(archivo.path, () => {});

    const docResult = await ejecutar(
      `INSERT INTO documentos
         (titulo, tipo_documento, ruta_almacenamiento, nombre_original, tipo_mime, tamano_bytes)
       VALUES (?, 'excel_planeaciones', ?, ?, ?, ?)`,
      [
        `Cargue planeaciones – ${archivo.originalname}`,
        `storage/${anioMes}/${nombreArchivo}`,
        archivo.originalname,
        archivo.mimetype,
        archivo.size,
      ]
    );

    const resultado = await importarPlaneaciones(buffer, consultar);

    const status = resultado.ok === 0 && resultado.errores.length > 0 ? 422 : 200;
    return res.status(status).json({
      documento_id: docResult.insertId,
      filas_ok:     resultado.ok,
      filas_error:  resultado.errores.length,
      errores:      resultado.errores,
    });
  } catch (err) {
    fs.unlink(archivo?.path, () => {});
    logger.error({ err }, 'Error importando planeaciones');
    return res.status(422).json({ error: err.message });
  }
}

// ── Rutas ─────────────────────────────────────────────────────────────────────

router.post("/chat", postChatHandler);
router.post("/conversacion", postConversacionHandler);
router.get("/conversacion/:id", getConversacionHandler);
router.get("/conversaciones", getConversacionesHandler);
router.post("/excel/calificaciones", generarExcelCalificacionesHandler);
router.post("/pdf/boletin", generarPDFBoletinHandler);
router.post("/recomendaciones", generarRecomendacionesHandler);
router.get("/descargar/:archivo", descargarArchivoHandler);
router.post("/importar/notas", upload.single('archivo'), importarNotasHandler);
router.post("/importar/planeaciones", upload.single('archivo'), importarPlaneacionesHandler);

// ── Estadísticas ──────────────────────────────────────────────────────────────

router.get("/estadisticas/resumen", async (_req, res) => {
  try {
    const [[est], [doc], [grd], [asig], [asis], [docs]] = await Promise.all([
      consultar("SELECT COUNT(DISTINCT estudiante_id) AS total FROM matriculas WHERE estado = 'ACTIVA'"),
      consultar("SELECT COUNT(*) AS total FROM docentes"),
      consultar("SELECT COUNT(DISTINCT grado_id) AS total FROM matriculas WHERE estado = 'ACTIVA'"),
      consultar("SELECT COUNT(*) AS total FROM asignaturas"),
      consultar("SELECT COUNT(*) AS total FROM asistencias WHERE fecha >= DATE_FORMAT(CURDATE(), '%Y-%m-01')"),
      consultar("SELECT COUNT(*) AS total FROM documentos WHERE activo = 1"),
    ]);
    res.json({ ok: true, data: {
      estudiantes: est.total, docentes: doc.total, grados: grd.total,
      asignaturas: asig.total, asistencias: asis.total, documentos: docs.total,
    }});
  } catch (err) {
    logger.error({ err }, "Error estadisticas/resumen");
    res.status(500).json({ error: "Error obteniendo resumen" });
  }
});

router.get("/estadisticas/asistencias-por-estado", async (_req, res) => {
  try {
    const rows = await consultar(`SELECT estado, COUNT(*) AS total FROM asistencias GROUP BY estado ORDER BY total DESC`);
    res.json({ ok: true, data: rows });
  } catch (err) {
    logger.error({ err }, "Error estadisticas/asistencias-por-estado");
    res.status(500).json({ error: "Error obteniendo asistencias por estado" });
  }
});

router.get("/estadisticas/promedio-por-grado", async (_req, res) => {
  try {
    const rows = await consultar(`
      SELECT g.etiqueta AS grado, ROUND(AVG(cal.nota), 2) AS promedio, COUNT(cal.id) AS total_notas
      FROM calificaciones cal
      JOIN evaluaciones ev ON ev.id = cal.evaluacion_id
      JOIN cursos c        ON c.id  = ev.curso_id
      JOIN grados g        ON g.id  = c.grado_id
      GROUP BY g.id, g.etiqueta ORDER BY g.grado_numero, g.seccion
    `);
    res.json({ ok: true, data: rows });
  } catch (err) {
    logger.error({ err }, "Error estadisticas/promedio-por-grado");
    res.status(500).json({ error: "Error obteniendo promedios por grado" });
  }
});

router.get("/estadisticas/estudiantes-por-grado", async (_req, res) => {
  try {
    const rows = await consultar(`
      SELECT g.etiqueta AS grado, COUNT(DISTINCT m.estudiante_id) AS total
      FROM matriculas m JOIN grados g ON g.id = m.grado_id
      WHERE m.estado = 'ACTIVA'
      GROUP BY g.etiqueta ORDER BY MIN(g.grado_numero), MIN(g.seccion)
    `);
    res.json({ ok: true, data: rows });
  } catch (err) {
    logger.error({ err }, "Error estadisticas/estudiantes-por-grado");
    res.status(500).json({ error: "Error obteniendo estudiantes por grado" });
  }
});

router.get("/estadisticas/top-asignaturas", async (_req, res) => {
  try {
    const rows = await consultar(`
      SELECT a.nombre AS asignatura, ROUND(AVG(cal.nota), 2) AS promedio, COUNT(cal.id) AS total_notas
      FROM calificaciones cal
      JOIN evaluaciones ev ON ev.id = cal.evaluacion_id
      JOIN cursos c        ON c.id  = ev.curso_id
      JOIN asignaturas a   ON a.id  = c.asignatura_id
      GROUP BY a.id, a.nombre HAVING total_notas >= 1 ORDER BY promedio DESC LIMIT 10
    `);
    res.json({ ok: true, data: rows });
  } catch (err) {
    logger.error({ err }, "Error estadisticas/top-asignaturas");
    res.status(500).json({ error: "Error obteniendo top asignaturas" });
  }
});

router.get("/estadisticas/asistencias-ultimos-dias", async (req, res) => {
  try {
    const dias = Math.min(parseInt(req.query.dias) || 30, 90);
    const rows = await consultar(`
      SELECT DATE_FORMAT(fecha, '%Y-%m-%d') AS dia, estado, COUNT(*) AS total
      FROM asistencias WHERE fecha >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY dia, estado ORDER BY dia ASC
    `, [dias]);
    res.json({ ok: true, data: rows });
  } catch (err) {
    logger.error({ err }, "Error estadisticas/asistencias-ultimos-dias");
    res.status(500).json({ error: "Error obteniendo asistencias recientes" });
  }
});

export default router;