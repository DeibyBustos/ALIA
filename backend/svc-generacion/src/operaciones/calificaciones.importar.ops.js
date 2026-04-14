import XLSX from 'xlsx';
import path from 'node:path';
import { consultar, ejecutar } from '../../../libreria-compartida/src/db.js';
import { logger } from '../../../libreria-compartida/src/logger.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

function leerArchivo(rutaArchivo) {
  const wb   = XLSX.readFile(rutaArchivo, { cellDates: true, raw: false });
  const hoja = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(hoja, { defval: null });
}

function norm(str) {
  if (str == null) return '';
  return String(str).trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function parsearNota(valor) {
  if (valor == null || valor === '') return null;
  const n = parseFloat(String(valor).replace(',', '.'));
  return isNaN(n) ? null : n;
}

function findCol(columnas, ...nombres) {
  return columnas.find(c => nombres.includes(norm(c))) ?? null;
}

// ─── resolver curso desde grado + asignatura ─────────────────────────────────

const cursoCache = new Map();

async function resolverCurso(gradoRaw, asignaturaRaw) {
  const key = `${norm(gradoRaw)}|${norm(asignaturaRaw)}`;
  if (cursoCache.has(key)) return cursoCache.get(key);

  const rows = await consultar(`
    SELECT c.id AS curso_id, c.periodo_id
    FROM cursos c
    JOIN asignaturas a         ON a.id = c.asignatura_id
    JOIN grados g              ON g.id = c.grado_id
    JOIN periodos_academicos p ON p.id = c.periodo_id
    WHERE g.etiqueta LIKE ?
      AND a.nombre   LIKE ?
    ORDER BY p.anio DESC, p.fecha_fin DESC
    LIMIT 1
  `, [`%${String(gradoRaw).trim()}%`, `%${String(asignaturaRaw).trim()}%`]);

  const result = rows.length
    ? { cursoId: rows[0].curso_id, periodoId: rows[0].periodo_id }
    : null;

  cursoCache.set(key, result);
  return result;
}

// ─── función principal ────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {string}  opts.rutaArchivo   Ruta absoluta al archivo
 * @param {number}  opts.documentoId   ID ya registrado en tabla `documentos`
 */
export async function importarCalificaciones({ rutaArchivo, documentoId }) {
  cursoCache.clear();

  // 1. Leer archivo ────────────────────────────────────────────────────────────
  let filas;
  try {
    filas = leerArchivo(rutaArchivo);
  } catch (err) {
    throw new Error(`No se pudo leer el archivo: ${err.message}`);
  }
  if (!filas.length) throw new Error('El archivo está vacío o no contiene datos.');

  const columnas = Object.keys(filas[0]);

  const gradoCol        = findCol(columnas, 'grado');
  const asignaturaCol   = findCol(columnas, 'asignatura');
  const docCol          = findCol(columnas, 'documento_estudiante', 'documento');
  const evalCol         = findCol(columnas, 'nombre_evaluacion', 'evaluacion');
  const notaCol         = findCol(columnas, 'nota');
  const porcentajeCol   = findCol(columnas, 'porcentaje');
  const fechaCol        = findCol(columnas, 'fecha');

  const faltantes = [];
  if (!gradoCol)      faltantes.push('grado');
  if (!asignaturaCol) faltantes.push('asignatura');
  if (!docCol)        faltantes.push('documento_estudiante');
  if (!evalCol)       faltantes.push('nombre_evaluacion');
  if (!notaCol)       faltantes.push('nota');
  if (faltantes.length) {
    throw new Error(`Al archivo le faltan las columnas: ${faltantes.join(', ')}.`);
  }

  // 2. Procesar filas ──────────────────────────────────────────────────────────
  const registros = [];
  const errores   = [];
  const evalCache = new Map(); // cursoId → Map<normNombre, evaluacionId>

  async function resolverEvaluacion(cursoId, nombreEv, porcentaje, fecha) {
    if (!evalCache.has(cursoId)) {
      const rows = await consultar(
        'SELECT id, nombre FROM evaluaciones WHERE curso_id = ?', [cursoId]
      );
      evalCache.set(cursoId, new Map(rows.map(e => [norm(e.nombre), e.id])));
    }
    const map = evalCache.get(cursoId);
    const key = norm(nombreEv);

    if (map.has(key)) {
      // Ya existe — actualizar porcentaje y fecha si vienen en el archivo
      if (porcentaje != null || fecha != null) {
        await ejecutar(
          `UPDATE evaluaciones SET
             porcentaje = COALESCE(?, porcentaje),
             fecha      = COALESCE(?, fecha)
           WHERE id = ?`,
          [porcentaje ?? null, fecha ?? null, map.get(key)]
        );
      }
      return map.get(key);
    }

    // No existe → crearla
    const result = await ejecutar(
      'INSERT INTO evaluaciones (curso_id, nombre, porcentaje, fecha) VALUES (?, ?, ?, ?)',
      [cursoId, nombreEv, porcentaje ?? null, fecha ?? null]
    );
    map.set(key, result.insertId);
    logger.info({ cursoId, nombreEv, id: result.insertId }, 'Evaluación creada automáticamente');
    return result.insertId;
  }

  for (const [idx, fila] of filas.entries()) {
    const numFila       = idx + 2;
    const gradoVal      = String(fila[gradoCol]      ?? '').trim();
    const asignaturaVal = String(fila[asignaturaCol] ?? '').trim();
    const documento     = String(fila[docCol]        ?? '').trim();
    const nombreEv      = String(fila[evalCol]       ?? '').trim();
    const nota          = parsearNota(fila[notaCol]);
    const porcentaje    = porcentajeCol ? parsearNota(fila[porcentajeCol]) : null;
    const fecha         = fechaCol && fila[fechaCol] ? String(fila[fechaCol]).trim() : null;

    if (!gradoVal) {
      errores.push({ fila: numFila, columna: gradoCol, mensaje: 'Grado vacío.' }); continue;
    }
    if (!asignaturaVal) {
      errores.push({ fila: numFila, columna: asignaturaCol, mensaje: 'Asignatura vacía.' }); continue;
    }
    if (!documento) {
      errores.push({ fila: numFila, columna: docCol, mensaje: 'Documento de estudiante vacío.' }); continue;
    }
    if (!nombreEv) {
      errores.push({ fila: numFila, columna: evalCol, mensaje: 'Nombre de evaluación vacío.' }); continue;
    }
    if (nota == null) {
      errores.push({ fila: numFila, columna: notaCol, mensaje: 'Nota inválida o vacía.' }); continue;
    }

    const curso = await resolverCurso(gradoVal, asignaturaVal);
    if (!curso) {
      errores.push({ fila: numFila, columna: asignaturaCol,
                     mensaje: `No se encontró el curso "${asignaturaVal}" para el grado "${gradoVal}".` });
      continue;
    }

    // Buscar estudiante por documento
    const estRows = await consultar(
      'SELECT id FROM estudiantes WHERE documento = ?', [documento]
    );
    if (!estRows.length) {
      errores.push({ fila: numFila, columna: docCol,
                     mensaje: `No se encontró ningún estudiante con documento "${documento}".` });
      continue;
    }
    const estudianteId = estRows[0].id;

    const evaluacionId = await resolverEvaluacion(curso.cursoId, nombreEv, porcentaje, fecha);

    registros.push({ evaluacionId, estudianteId, nota, _fila: numFila,
                     cursoId: curso.cursoId, periodoId: curso.periodoId });
  }

  // 3. Upsert ──────────────────────────────────────────────────────────────────
  let filasOk = 0;
  for (const r of registros) {
    try {
      await ejecutar(`
        INSERT INTO calificaciones (evaluacion_id, estudiante_id, nota)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE nota = ?
      `, [r.evaluacionId, r.estudianteId, r.nota, r.nota]);
      filasOk++;
    } catch (err) {
      logger.warn({ err, fila: r._fila }, 'Error insertando calificación');
      errores.push({ fila: r._fila, columna: 'nota',
                     mensaje: `Error al guardar nota: ${err.message}` });
    }
  }

  // 4. Registrar lote ──────────────────────────────────────────────────────────
  const loteResult = await ejecutar(
    `INSERT INTO lotes_importacion
       (id_documento, tipo, periodo_id, total_filas, filas_ok, filas_error, resumen)
     VALUES (?, 'calificaciones', ?, ?, ?, ?, ?)`,
    [
      documentoId,
      registros[0]?.periodoId ?? null,
      filas.length, filasOk, errores.length,
      JSON.stringify({ archivo: path.basename(rutaArchivo) }),
    ]
  );
  const loteId = loteResult.insertId;

  // 5. Persistir errores ───────────────────────────────────────────────────────
  for (const e of errores) {
    await ejecutar(
      'INSERT INTO errores_importacion (lote_id, fila, columna, mensaje) VALUES (?, ?, ?, ?)',
      [loteId, e.fila, e.columna ?? null, e.mensaje]
    ).catch(dbErr => logger.warn({ dbErr }, 'No se pudo persistir error'));
  }

  logger.info({ loteId, filasOk, filasError: errores.length }, 'Importación de calificaciones completada');

  return { loteId, totalFilas: filas.length, filasOk, filasError: errores.length, errores };
}