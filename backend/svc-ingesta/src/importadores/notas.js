/**
 * importadores/notas.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Importación masiva de calificaciones desde Excel (.xlsx/.xls) o CSV.
 * Se invoca desde worker.js cuando el documento tiene:
 *   etiquetas.proposito = 'importar_notas'  o  etiquetas.tipo = 'notas'
 *
 * FORMATOS ADMITIDOS
 * ──────────────────
 * Formato ancho  → una fila por estudiante, columnas = evaluaciones
 *   documento_estudiante | Parcial 1 | Parcial 2 | Examen Final
 *
 * Formato largo  → una fila por nota
 *   documento_estudiante | nombre_evaluacion | nota
 *
 * Las etiquetas del documento deben incluir curso_id y periodo_id:
 *   { "proposito": "importar_notas", "curso_id": 5, "periodo_id": 2 }
 */

import XLSX from 'xlsx';
import path from 'node:path';
import { consultar, ejecutar } from '../../../libreria-compartida/src/db.js';
import { logger } from '../../../libreria-compartida/src/logger.js';


function leerArchivo(rutaFS) {
  const wb   = XLSX.readFile(rutaFS, { cellDates: true, raw: false });
  const hoja = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(hoja, { defval: null });
}

function norm(str) {
  if (str == null) return '';
  return String(str).trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function detectarFormato(columnas) {
  const cols = columnas.map(norm);
  return (cols.includes('nombre_evaluacion') || cols.includes('evaluacion'))
    ? 'largo'
    : 'ancho';
}

function parsearNota(valor) {
  if (valor == null || valor === '') return null;
  const n = parseFloat(String(valor).replace(',', '.'));
  return isNaN(n) ? null : n;
}

/**
 * @param {object} opts
 * @param {string}  opts.rutaFS       Ruta física del archivo en disco
 * @param {number}  opts.idDocumento  ID en tabla `documentos`
 * @param {string}  opts.nombre       Nombre original del archivo (para el lote)
 * @param {number}  opts.cursoId      ID del curso (de etiquetas.curso_id)
 * @param {number}  opts.periodoId    ID del período (de etiquetas.periodo_id)
 */
export async function importarNotasDesdeExcel({ rutaFS, idDocumento, nombre, cursoId, periodoId }) {
  logger.info({ idDocumento, archivo: nombre, cursoId, periodoId }, 'Iniciando importación de notas');

  if (!cursoId || !periodoId) {
    throw new Error(
      'Las etiquetas del documento deben incluir curso_id y periodo_id para importar notas.'
    );
  }

  let filas;
  try {
    filas = leerArchivo(rutaFS);
  } catch (err) {
    throw new Error(`No se pudo leer el archivo: ${err.message}`);
  }
  if (!filas.length) throw new Error('El archivo está vacío o no contiene datos.');

  const columnas = Object.keys(filas[0]);
  const formato  = detectarFormato(columnas);
  logger.info({ formato, totalFilas: filas.length }, 'Archivo leído');

  const evalRows = await consultar(
    'SELECT id, nombre FROM evaluaciones WHERE curso_id = ?',
    [cursoId]
  );
  if (!evalRows.length) {
    throw new Error(`No hay evaluaciones registradas para el curso ${cursoId}.`);
  }
  const evalMap = new Map(evalRows.map(e => [norm(e.nombre), e.id]));

  const inscRows = await consultar(`
    SELECT e.documento, e.id AS estudiante_id
    FROM inscripciones i
    JOIN estudiantes e ON e.id = i.estudiante_id
    WHERE i.curso_id = ? AND i.periodo_id = ?
  `, [cursoId, periodoId]);
  if (!inscRows.length) {
    throw new Error(`No hay estudiantes inscritos en el curso ${cursoId} / período ${periodoId}.`);
  }
  const estudMap = new Map(inscRows.map(r => [String(r.documento).trim(), r.estudiante_id]));

  const registros = [];
  const errores   = [];

  const docCol = columnas.find(c => ['documento_estudiante', 'documento'].includes(norm(c)));
  const colsDesconocidas = new Set();

  filas.forEach((fila, idx) => {
    const numFila = idx + 2;

    const documento = docCol ? String(fila[docCol] ?? '').trim() : '';
    if (!documento) {
      errores.push({ fila: numFila, columna: docCol ?? 'documento_estudiante',
                     mensaje: 'Documento de estudiante vacío.' });
      return;
    }

    const estudianteId = estudMap.get(documento);
    if (!estudianteId) {
      errores.push({ fila: numFila, columna: docCol,
                     mensaje: `Documento "${documento}" no está inscrito en este curso/período.` });
      return;
    }

    if (formato === 'largo') {
      const evalCol  = columnas.find(c => ['nombre_evaluacion', 'evaluacion'].includes(norm(c)));
      const notaCol  = columnas.find(c => norm(c) === 'nota');
      const nombreEv = norm(fila[evalCol]);
      const nota     = parsearNota(fila[notaCol]);

      if (!nombreEv) {
        errores.push({ fila: numFila, columna: evalCol, mensaje: 'Nombre de evaluación vacío.' });
        return;
      }
      const evaluacionId = evalMap.get(nombreEv);
      if (!evaluacionId) {
        errores.push({ fila: numFila, columna: evalCol,
                       mensaje: `Evaluación "${fila[evalCol]}" no existe para este curso.` });
        return;
      }
      if (nota == null) {
        errores.push({ fila: numFila, columna: notaCol, mensaje: 'Nota inválida o vacía.' });
        return;
      }
      registros.push({ evaluacionId, estudianteId, nota, _fila: numFila });

    } else {
      const colsEval = columnas.filter(c =>
        !['documento_estudiante', 'documento', 'nombre_estudiante', 'estudiante'].includes(norm(c))
      );
      for (const col of colsEval) {
        const evaluacionId = evalMap.get(norm(col));
        if (!evaluacionId) {
          if (!colsDesconocidas.has(col)) {
            colsDesconocidas.add(col);
            errores.push({ fila: 1, columna: col,
                           mensaje: `Columna "${col}" no coincide con ninguna evaluación. Se ignorará.` });
          }
          continue;
        }
        const nota = parsearNota(fila[col]);
        if (nota == null) {
          if (fila[col] !== null && fila[col] !== '') {
            errores.push({ fila: numFila, columna: col,
                           mensaje: `Valor de nota inválido: "${fila[col]}".` });
          }
          continue;
        }
        registros.push({ evaluacionId, estudianteId, nota, _fila: numFila });
      }
    }
  });

  logger.info({ registros: registros.length, errores: errores.length }, 'Filas procesadas');

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
      logger.warn({ err: err.message, fila: r._fila }, 'Error insertando calificación');
      errores.push({
        fila:    r._fila,
        columna: 'nota',
        mensaje: `Error BD (ev=${r.evaluacionId}, est=${r.estudianteId}): ${err.message}`,
      });
    }
  }

  const loteResult = await ejecutar(
    `INSERT INTO lotes_importacion
       (id_documento, tipo, periodo_id, total_filas, filas_ok, filas_error, resumen)
     VALUES (?, 'calificaciones', ?, ?, ?, ?, ?)`,
    [
      idDocumento, periodoId,
      filas.length, filasOk, errores.length,
      JSON.stringify({ curso_id: cursoId, periodo_id: periodoId, formato,
                       archivo: path.basename(nombre || '') }),
    ]
  );
  const loteId = loteResult.insertId;

  for (const e of errores) {
    await ejecutar(
      'INSERT INTO errores_importacion (lote_id, fila, columna, mensaje) VALUES (?, ?, ?, ?)',
      [loteId, e.fila, e.columna ?? null, e.mensaje]
    ).catch(dbErr => logger.warn({ dbErr }, 'No se pudo persistir error de importación'));
  }

  logger.info({ loteId, filasOk, filasError: errores.length }, 'Importación de notas completada');

  return { loteId, totalFilas: filas.length, filasOk, filasError: errores.length, errores };
}