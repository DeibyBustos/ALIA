import Excel from "exceljs";
import { getPool } from "../../../libreria-compartida/src/db.js";
import { logger } from "../../../libreria-compartida/src/logger.js";

const norm = s => String(s || "")
  .normalize("NFD")
  .replace(/\p{Diacritic}/gu, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_|_$/g, "");

const idxOf = (headers, ...alts) => headers.findIndex(h => alts.includes(h));

function getCellValue(row, idx) {
  if (idx < 0) return null;
  return row.getCell(idx + 1).value;
}

function getCellText(row, idx) {
  const value = getCellValue(row, idx);
  if (value == null) return "";

  if (typeof value === "object") {
    if (value.text != null) return String(value.text).trim();
    if (value.result != null) return String(value.result).trim();
    if (value.richText) return value.richText.map(x => x.text || "").join("").trim();
    if (value.hyperlink && value.text) return String(value.text).trim();
  }

  return String(value).trim();
}

async function upsertSimple(conn, table, uniqueCol, cols) {
  const keys = Object.keys(cols);
  const qMarks = keys.map(() => "?").join(",");
  const dup = keys.map(k => `${k}=VALUES(${k})`).join(",");

  const [result] = await conn.execute(
    `INSERT INTO ${table} (${keys.join(",")}) VALUES (${qMarks})
     ON DUPLICATE KEY UPDATE ${dup}`,
    keys.map(k => cols[k])
  );

  // FIX #4: insertId=0 cuando no hubo cambio real; el selectId de fallback lo resuelve.
  if (result.insertId) return result.insertId;

  const [rows] = await conn.query(
    `SELECT id FROM ${table} WHERE ${uniqueCol}=? LIMIT 1`,
    [cols[uniqueCol]]
  );

  return rows?.[0]?.id ?? null;
}

async function selectId(conn, sql, params) {
  const [rows] = await conn.query(sql, params);
  return rows?.[0]?.id ?? null;
}

// FIX #5: splitNombreCompleto unificado con importar-docentes.
// Retorna "SIN_NOMBRE"/"SIN_APELLIDO" cuando no hay datos, nunca un punto literal.
function splitNombreCompleto(nombreCompleto = "") {
  const limpio = String(nombreCompleto).trim().replace(/\s+/g, " ");
  if (!limpio) return { nombres: "SIN_NOMBRE", apellidos: "SIN_APELLIDO" };

  const partes = limpio.split(" ");
  if (partes.length === 1) return { nombres: partes[0], apellidos: "" };

  return {
    nombres: partes[0],
    apellidos: partes.slice(1).join(" ")
  };
}

function parseCursoEtiqueta(curso = "") {
  const txt = String(curso).trim().toUpperCase();
  if (!txt) return { grado_numero: null, seccion: "" };

  const match = txt.match(/^(\d+)\s*[- ]?\s*([A-Z0-9]+)?$/);
  if (!match) return { grado_numero: null, seccion: txt };

  return {
    grado_numero: Number(match[1]),
    seccion: match[2] || ""
  };
}

function parseDiaSemana(valor) {
  if (valor == null) return null;

  if (typeof valor === "number" && Number.isFinite(valor)) {
    const n = Number(valor);
    return n >= 1 && n <= 7 ? n : null;
  }

  const txt = String(valor)
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

  const mapa = {
    lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, domingo: 7,
    lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6, dom: 7
  };

  return mapa[txt] ?? null;
}

function excelFractionToTimeString(fraction) {
  const totalSeconds = Math.round(Number(fraction) * 24 * 60 * 60);
  const hh = Math.floor(totalSeconds / 3600) % 24;
  const mm = Math.floor((totalSeconds % 3600) / 60);
  const ss = totalSeconds % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function parseHora(valor) {
  if (valor == null || valor === "") return null;

  if (valor instanceof Date && !isNaN(valor.getTime())) {
    return `${String(valor.getHours()).padStart(2, "0")}:${String(valor.getMinutes()).padStart(2, "0")}:${String(valor.getSeconds()).padStart(2, "0")}`;
  }

  if (typeof valor === "number" && Number.isFinite(valor)) {
    if (valor >= 0 && valor < 1) return excelFractionToTimeString(valor);
    if (valor >= 0 && valor <= 23) return `${String(Math.floor(valor)).padStart(2, "0")}:00:00`;
  }

  if (typeof valor === "object" && valor !== null) {
    if (valor.text != null) return parseHora(valor.text ?? null);
    if (valor.result != null) return parseHora(valor.result ?? null);
  }

  const txt = String(valor).trim();
  const match = txt.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);

  if (match) {
    const hh = Number(match[1]);
    const mm = Number(match[2]);
    const ss = Number(match[3] || 0);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59 && ss >= 0 && ss <= 59) {
      return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    }
  }

  return null;
}

// FIX #8: lanza error si alguna hora es null, evitando que null >= 0 pase silencioso.
function compararHoras(h1, h2) {
  if (!h1 || !h2) throw new Error(`Horas inválidas para comparar: '${h1}' / '${h2}'`);
  return h1.localeCompare(h2);
}

// ── Helpers de auditoría ─────────────────────────────────────────────────────

// FIX #6: crea el registro en lotes_importacion al inicio
async function crearLote(conn, idDocumento, periodo_id) {
  const [result] = await conn.execute(
    `INSERT INTO lotes_importacion (id_documento, tipo, periodo_id, total_filas, filas_ok, filas_error)
     VALUES (?, 'horarios', ?, 0, 0, 0)`,
    [idDocumento, periodo_id ?? null]
  );
  return result.insertId;
}

async function cerrarLote(conn, loteId, stats) {
  await conn.execute(
    `UPDATE lotes_importacion
        SET total_filas = ?,
            filas_ok    = ?,
            filas_error = ?,
            resumen     = ?
      WHERE id = ?`,
    [
      stats.filasProcesadas,
      stats.insertados + stats.actualizados,
      stats.filasError,
      JSON.stringify(stats),
      loteId
    ]
  );
}

async function registrarErrorLote(conn, loteId, fila, columna, mensaje) {
  await conn.execute(
    `INSERT INTO errores_importacion (lote_id, fila, columna, mensaje) VALUES (?, ?, ?, ?)`,
    [loteId, fila, columna ?? null, mensaje]
  );
}

// FIX #7: actualiza tareas_ingesta según el resultado
async function marcarTareaIngesta(conn, idDocumento, estado, mensajeError = null) {
  await conn.execute(
    `UPDATE tareas_ingesta
        SET estado = ?, mensaje_error = ?, actualizado_en = NOW()
      WHERE id_documento = ?
        AND estado NOT IN ('TERMINADA', 'FALLIDA')`,
    [estado, mensajeError, idDocumento]
  );
}

export async function importarHorariosDesdeExcel({ rutaFS, idDocumento, nombre, periodo }) {
  logger.info({ rutaFS, idDocumento, nombre }, "🔵 INICIANDO importación de horarios");

  const wb = new Excel.Workbook();
  await wb.xlsx.readFile(rutaFS);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Excel sin hojas");

  const headers = (ws.getRow(1).values || []).slice(1).map(norm);
  logger.info({ headers }, "Encabezados detectados");

  const iDocente       = idxOf(headers, "docente", "docente_nombre", "nombre_docente", "nombre_completo", "profesor", "maestro");
  const iCorreo        = idxOf(headers, "correo", "docente_correo", "correo_docente", "email", "mail");
  const iAsignatura    = idxOf(headers, "asignatura", "materia");
  const iCurso         = idxOf(headers, "curso", "grado_etiqueta", "grado", "grupo");
  const iDia           = idxOf(headers, "dia", "dia_semana", "horario_dia");
  const iHoraInicio    = idxOf(headers, "horainicio", "hora_inicio", "hora_inicial", "inicio", "horario_inicio");
  const iHoraFin       = idxOf(headers, "horafin", "hora_fin", "hora_final", "fin", "horario_fin");
  const iAula          = idxOf(headers, "aula", "aula_codigo", "salon", "salon_codigo");
  const iNivel         = idxOf(headers, "nivel", "nivel_educativo");
  const iPeriodoAnio   = idxOf(headers, "periodo_anio", "anio", "año", "ano");
  const iPeriodoNombre = idxOf(headers, "periodo_nombre", "periodo");
  const iGradoNumero   = idxOf(headers, "grado_numero", "grado_num");
  const iSeccion       = idxOf(headers, "seccion", "grupo", "letra");

  if (iAsignatura < 0 || iCurso < 0 || iDia < 0 || iHoraInicio < 0 || iHoraFin < 0) {
    throw new Error("Faltan columnas mínimas: asignatura, curso, dia, horaInicio, horaFin");
  }

  const pool = getPool();
  const conn = await pool.getConnection();

  const stats = {
    insertados: 0,
    actualizados: 0,
    filasError: 0,
    filasProcesadas: 0
  };

  // FIX #7: marcar EN_PROCESO al iniciar
  await marcarTareaIngesta(conn, idDocumento, "EN_PROCESO");

  let loteId = null;

  try {
    await conn.beginTransaction();

    const defAnio          = periodo?.anio   || new Date().getFullYear();
    const defPeriodoNombre = periodo?.nombre  || "ANUAL";
    const defNivel         = periodo?.nivel   || "General";

    // FIX #6: crear lote al inicio de la transacción
    loteId = await crearLote(conn, idDocumento, null);

    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      if (!row || row.actualCellCount === 0) continue;

      const docenteNombre    = getCellText(row, iDocente);
      const docenteCorreo    = getCellText(row, iCorreo).toLowerCase();
      const asignaturaNom    = getCellText(row, iAsignatura);
      const cursoEtiquetaRaw = getCellText(row, iCurso);
      const diaRaw           = getCellValue(row, iDia);
      const horaInicioRaw    = getCellValue(row, iHoraInicio);
      const horaFinRaw       = getCellValue(row, iHoraFin);
      const aulaCodigo       = getCellText(row, iAula) || null;

      if (!asignaturaNom || !cursoEtiquetaRaw || diaRaw == null || horaInicioRaw == null || horaFinRaw == null) {
        logger.warn({ fila: r, asignaturaNom, cursoEtiquetaRaw, diaRaw, horaInicioRaw, horaFinRaw }, "Fila sin datos mínimos");
        continue;
      }

      stats.filasProcesadas++;

      const nivelNom = iNivel >= 0 ? getCellText(row, iNivel) || defNivel : defNivel;
      const anioRaw  = iPeriodoAnio >= 0 ? getCellValue(row, iPeriodoAnio) : defAnio;
      const anio     = Number(anioRaw) || defAnio;
      const perNom   = iPeriodoNombre >= 0 ? getCellText(row, iPeriodoNombre) || defPeriodoNombre : defPeriodoNombre;

      let grado_numero = null;
      let seccion = "";

      if (iGradoNumero >= 0 || iSeccion >= 0) {
        const gradoRaw = iGradoNumero >= 0 ? getCellValue(row, iGradoNumero) : null;
        grado_numero = Number(gradoRaw);
        if (!Number.isFinite(grado_numero)) grado_numero = null;
        seccion = iSeccion >= 0 ? getCellText(row, iSeccion).toUpperCase() : "";
      } else {
        const parsedCurso = parseCursoEtiqueta(cursoEtiquetaRaw);
        grado_numero = parsedCurso.grado_numero;
        seccion = parsedCurso.seccion;
      }

      const dia_semana  = parseDiaSemana(diaRaw);
      const hora_inicio = parseHora(horaInicioRaw);
      const hora_fin    = parseHora(horaFinRaw);

      try {
        if (!dia_semana)    throw new Error(`Día inválido: ${String(diaRaw)}`);
        if (!hora_inicio)   throw new Error(`Hora inicio inválida: ${String(horaInicioRaw)}`);
        if (!hora_fin)      throw new Error(`Hora fin inválida: ${String(horaFinRaw)}`);

        // FIX #8: hora_inicio y hora_fin ya validadas arriba → compararHoras es seguro
        if (compararHoras(hora_inicio, hora_fin) >= 0) {
          throw new Error(`Hora inicio debe ser menor que hora fin (${hora_inicio} - ${hora_fin})`);
        }

        if (!Number.isFinite(Number(grado_numero))) {
          throw new Error(`No se pudo interpretar el curso/grado: ${cursoEtiquetaRaw}`);
        }

        // ── Docente ────────────────────────────────────────────────────────
        let docente_id = null;
        if (docenteCorreo || docenteNombre) {
          const { nombres, apellidos } = splitNombreCompleto(docenteNombre);

          if (docenteCorreo) {
            const [docResult] = await conn.execute(
              `INSERT INTO docentes (nombres, apellidos, correo)
               VALUES (?, ?, ?)
               ON DUPLICATE KEY UPDATE nombres=VALUES(nombres), apellidos=VALUES(apellidos)`,
              [nombres, apellidos, docenteCorreo]
            );

            docente_id =
              docResult.insertId ||
              (await selectId(conn, `SELECT id FROM docentes WHERE correo=? LIMIT 1`, [docenteCorreo]));
          } else {
            // FIX #3: sin correo buscamos por nombre exacto antes de insertar,
            // para evitar duplicados porque NULL != NULL en la constraint UNIQUE.
            const [existing] = await conn.query(
              `SELECT id FROM docentes WHERE nombres=? AND apellidos=? LIMIT 1`,
              [nombres, apellidos]
            );

            if (existing?.length) {
              docente_id = existing[0].id;
            } else {
              // Solo insertamos si realmente no existe (nombres+apellidos nunca vacíos aquí)
              const [docResult] = await conn.execute(
                `INSERT INTO docentes (nombres, apellidos, correo) VALUES (?, ?, NULL)`,
                [nombres, apellidos]
              );
              docente_id = docResult.insertId;
            }
          }
        }

        // ── Asignatura ─────────────────────────────────────────────────────
        const asignatura_id = await upsertSimple(conn, "asignaturas", "nombre", {
          nombre: asignaturaNom
        });
        if (!asignatura_id) throw new Error(`No se pudo resolver asignatura: ${asignaturaNom}`);

        // ── Nivel ──────────────────────────────────────────────────────────
        const nivel_id = await upsertSimple(conn, "niveles_educativos", "nombre", {
          nombre: nivelNom || "General"
        });
        if (!nivel_id) throw new Error(`No se pudo resolver nivel: ${nivelNom}`);

        // ── Grado ──────────────────────────────────────────────────────────
        const etiqueta = `${grado_numero}${seccion || ""}`;
        const [gradoResult] = await conn.execute(
          `INSERT INTO grados (nivel_id, grado_numero, seccion, etiqueta)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE etiqueta=VALUES(etiqueta)`,
          [nivel_id, Number(grado_numero), seccion || "", etiqueta]
        );

        const grado_id =
          gradoResult.insertId ||
          (await selectId(
            conn,
            `SELECT id FROM grados WHERE nivel_id=? AND grado_numero=? AND seccion=? LIMIT 1`,
            [nivel_id, Number(grado_numero), seccion || ""]
          ));

        if (!grado_id) throw new Error(`No se pudo resolver grado: ${etiqueta}`);

        // ── Período ────────────────────────────────────────────────────────
        const [periodoResult] = await conn.execute(
          `INSERT INTO periodos_academicos (anio, nombre)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE nombre=VALUES(nombre)`,
          [anio, perNom || "ANUAL"]
        );

        const periodo_id =
          periodoResult.insertId ||
          (await selectId(
            conn,
            `SELECT id FROM periodos_academicos WHERE anio=? AND nombre=? LIMIT 1`,
            [anio, perNom || "ANUAL"]
          ));

        if (!periodo_id) throw new Error(`No se pudo resolver periodo: ${anio}-${perNom}`);

        // ── Aula ───────────────────────────────────────────────────────────
        let aula_id = null;
        if (aulaCodigo) {
          const [aulaResult] = await conn.execute(
            `INSERT INTO aulas (codigo, nombre)
             VALUES (?, ?)
             ON DUPLICATE KEY UPDATE nombre=VALUES(nombre)`,
            [aulaCodigo, aulaCodigo]
          );

          aula_id =
            aulaResult.insertId ||
            (await selectId(conn, `SELECT id FROM aulas WHERE codigo=? LIMIT 1`, [aulaCodigo]));

          if (!aula_id) throw new Error(`No se pudo resolver aula: ${aulaCodigo}`);
        }

        // ── Curso ──────────────────────────────────────────────────────────
        const [cursoResult] = await conn.execute(
          `INSERT INTO cursos (grado_id, asignatura_id, periodo_id, docente_id)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE docente_id=VALUES(docente_id)`,
          [grado_id, asignatura_id, periodo_id, docente_id]
        );

        const curso_id =
          cursoResult.insertId ||
          (await selectId(
            conn,
            `SELECT id FROM cursos WHERE grado_id=? AND asignatura_id=? AND periodo_id=? LIMIT 1`,
            [grado_id, asignatura_id, periodo_id]
          ));

        if (!curso_id) throw new Error(`No se pudo resolver curso: ${etiqueta} - ${asignaturaNom}`);

        // ── Horario ────────────────────────────────────────────────────────
        const [horarioExist] = await conn.query(
          `SELECT id FROM horarios
            WHERE curso_id=? AND dia_semana=? AND hora_inicio=? AND hora_fin=?
            LIMIT 1`,
          [curso_id, dia_semana, hora_inicio, hora_fin]
        );

        if (horarioExist?.length) {
          await conn.execute(
            `UPDATE horarios SET aula_id=? WHERE id=?`,
            [aula_id, horarioExist[0].id]
          );
          stats.actualizados++;
          logger.info({ fila: r, curso_id, dia_semana, hora_inicio, hora_fin, aula_id }, "♻️ Horario ACTUALIZADO");
        } else {
          await conn.execute(
            `INSERT INTO horarios (curso_id, dia_semana, hora_inicio, hora_fin, aula_id)
             VALUES (?, ?, ?, ?, ?)`,
            [curso_id, dia_semana, hora_inicio, hora_fin, aula_id]
          );
          stats.insertados++;
          logger.info({ fila: r, curso_id, dia_semana, hora_inicio, hora_fin, aula_id }, "✅ Horario INSERTADO");
        }

      } catch (rowErr) {
        stats.filasError++;
        // FIX #6: registrar error en errores_importacion
        if (loteId) {
          await registrarErrorLote(conn, loteId, r, null, rowErr.message).catch(() => {});
        }
        logger.error(
          { fila: r, docenteNombre, docenteCorreo, asignaturaNom, cursoEtiquetaRaw, diaRaw, horaInicioRaw, horaFinRaw, aulaCodigo, error: rowErr.message },
          "❌ Error procesando fila de horario"
        );
      }
    }

    // FIX #6: cerrar lote con totales
    if (loteId) await cerrarLote(conn, loteId, stats);

    await conn.commit();

    // FIX #7: marcar TERMINADA
    await marcarTareaIngesta(conn, idDocumento, "TERMINADA");

    logger.info(
      { archivo: nombre, ...stats, totalFilas: ws.rowCount - 1 },
      "✅ Importación horarios COMPLETADA"
    );

  } catch (e) {
    await conn.rollback();

    // FIX #7: marcar FALLIDA
    await marcarTareaIngesta(conn, idDocumento, "FALLIDA", e.message).catch(() => {});

    logger.error({ error: e.message, stack: e.stack }, "❌ Importación horarios FALLÓ");
    throw e;
  } finally {
    conn.release();
  }
}