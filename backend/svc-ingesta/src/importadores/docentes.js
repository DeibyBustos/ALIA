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
    if (value.richText) {
      return value.richText.map(x => x.text || "").join("").trim();
    }
    if (value.hyperlink && value.text) return String(value.text).trim();
  }

  return String(value).trim();
}

// FIX #5: splitNombreCompleto unificado y consistente entre importadores.
// Ya no retorna "." como apellido — usa cadena vacía o el valor real.
function splitNombreCompleto(nombreCompleto = "") {
  const limpio = String(nombreCompleto).trim().replace(/\s+/g, " ");
  if (!limpio) return { nombres: "SIN_NOMBRE", apellidos: "SIN_APELLIDO" };

  const partes = limpio.split(" ");
  if (partes.length === 1) {
    return { nombres: partes[0], apellidos: "" };
  }

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

// FIX #8: compararHoras ahora lanza error si alguna hora es null,
// para evitar que null >= 0 evalúe como false y salte la validación.
function compararHoras(h1, h2) {
  if (!h1 || !h2) throw new Error(`Horas inválidas para comparar: '${h1}' / '${h2}'`);
  return h1.localeCompare(h2);
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

  // FIX #4: insertId puede ser 0 cuando no hubo cambio real (affectedRows=0).
  // El fallback selectId cubre todos los casos.
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

// FIX #6 y #7: helpers para gestionar lote e ingesta
async function crearLote(conn, idDocumento, periodo_id) {
  const [result] = await conn.execute(
    `INSERT INTO lotes_importacion (id_documento, tipo, periodo_id, total_filas, filas_ok, filas_error)
     VALUES (?, 'docentes', ?, 0, 0, 0)`,
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

async function marcarTareaIngesta(conn, idDocumento, estado, mensajeError = null) {
  await conn.execute(
    `UPDATE tareas_ingesta
        SET estado = ?, mensaje_error = ?, actualizado_en = NOW()
      WHERE id_documento = ?
        AND estado NOT IN ('TERMINADA', 'FALLIDA')`,
    [estado, mensajeError, idDocumento]
  );
}

export async function importarDocentesDesdeExcel({ rutaFS, idDocumento, nombre, periodo }) {
  logger.info({ rutaFS, idDocumento, nombre }, "👨‍🏫 INICIANDO importación de docentes");

  const wb = new Excel.Workbook();
  await wb.xlsx.readFile(rutaFS);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Excel sin hojas");

  const headers = (ws.getRow(1).values || []).slice(1).map(norm);
  logger.info({ headers }, "Encabezados detectados");

  const iNombres        = idxOf(headers, "nombres", "nombre");
  const iApellidos      = idxOf(headers, "apellidos", "apellido");
  const iNombreCompleto = idxOf(headers, "docente", "docente_nombre", "nombre_docente", "nombre_completo", "profesor", "maestro");
  const iCorreo         = idxOf(headers, "correo", "email", "mail");
  const iAsignatura     = idxOf(headers, "asignatura", "materia");
  const iNivel          = idxOf(headers, "nivel", "nivel_educativo");
  const iGradoNum       = idxOf(headers, "grado_numero", "grado", "grado_num", "curso", "grupo");
  const iSeccion        = idxOf(headers, "seccion", "grupo", "letra");
  const iPeriodoAnio    = idxOf(headers, "periodo_anio", "anio", "año", "ano");
  const iPeriodoNom     = idxOf(headers, "periodo_nombre", "periodo");
  const iHorarioDia     = idxOf(headers, "horario_dia", "dia_semana", "dia");
  const iHorarioInicio  = idxOf(headers, "horario_inicio", "hora_inicio", "hora_inicial", "inicio");
  const iHorarioFin     = idxOf(headers, "horario_fin", "hora_fin", "hora_final", "fin");
  const iAulaCodigo     = idxOf(headers, "aula_codigo", "aula", "salon", "salon_codigo");
  const iAulaNombre     = idxOf(headers, "aula_nombre", "salon_nombre");
  const iCodocenteRol   = idxOf(headers, "codocente_rol", "rol_adicional", "rol");

  const tieneNombreSeparado = iNombres >= 0 && iApellidos >= 0;
  const tieneNombreCompleto = iNombreCompleto >= 0;

  if ((!tieneNombreSeparado && !tieneNombreCompleto) || iCorreo < 0 || iAsignatura < 0) {
    throw new Error("Faltan columnas mínimas: nombres+apellidos o nombre_completo, correo, asignatura");
  }

  const pool = getPool();
  const conn = await pool.getConnection();

  const stats = {
    insertados: 0,
    actualizados: 0,
    filasError: 0,
    filasProcesadas: 0,
    cursosCreados: 0,
    horariosCreados: 0,
    horariosActualizados: 0,
    aulasCreadas: 0,
    codocenciasCreadas: 0
  };

  // FIX #7: marcar ingesta EN_PROCESO antes de empezar
  await marcarTareaIngesta(conn, idDocumento, "EN_PROCESO");

  let loteId = null;

  try {
    await conn.beginTransaction();

    const defAnio         = periodo?.anio  || new Date().getFullYear();
    const defPeriodoNombre = periodo?.nombre || "ANUAL";

    // FIX #6: crear lote de importación al inicio
    loteId = await crearLote(conn, idDocumento, null); // periodo_id se actualizará al final

    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      if (!row || row.actualCellCount === 0) continue;

      let nombres   = "";
      let apellidos = "";

      if (tieneNombreSeparado) {
        nombres   = getCellText(row, iNombres);
        apellidos = getCellText(row, iApellidos);
      } else if (tieneNombreCompleto) {
        const split = splitNombreCompleto(getCellText(row, iNombreCompleto));
        nombres   = split.nombres;
        apellidos = split.apellidos;
      }

      const correo       = getCellText(row, iCorreo).toLowerCase();
      const asignaturaNom = getCellText(row, iAsignatura);

      if (!nombres || !apellidos || !correo || !asignaturaNom) {
        logger.warn({ fila: r, nombres, apellidos, correo, asignaturaNom }, "Fila sin datos mínimos");
        continue;
      }

      stats.filasProcesadas++;

      const nivelNom = iNivel >= 0 ? getCellText(row, iNivel) || "General" : "General";
      const anioRaw  = iPeriodoAnio >= 0 ? getCellValue(row, iPeriodoAnio) : defAnio;
      const anio     = Number(anioRaw) || defAnio;
      const perNom   = iPeriodoNom >= 0 ? getCellText(row, iPeriodoNom) || defPeriodoNombre : defPeriodoNombre;

      let gradoNum = null;
      let seccion  = "";

      if (iGradoNum >= 0 || iSeccion >= 0) {
        const rawGrado     = iGradoNum >= 0 ? getCellValue(row, iGradoNum) : null;
        const rawGradoText = iGradoNum >= 0 ? getCellText(row, iGradoNum) : "";
        const gradoNumerico = Number(rawGrado);

        if (Number.isFinite(gradoNumerico) && gradoNumerico > 0) {
          gradoNum = gradoNumerico;
          seccion  = iSeccion >= 0 ? getCellText(row, iSeccion).toUpperCase() : "";
        } else if (rawGradoText) {
          const parsed = parseCursoEtiqueta(rawGradoText);
          gradoNum = parsed.grado_numero;
          seccion  = iSeccion >= 0
            ? (getCellText(row, iSeccion).toUpperCase() || parsed.seccion)
            : parsed.seccion;
        } else {
          seccion = iSeccion >= 0 ? getCellText(row, iSeccion).toUpperCase() : "";
        }
      }

      const horarioDia    = iHorarioDia    >= 0 ? parseDiaSemana(getCellValue(row, iHorarioDia))   : null;
      const horarioInicio = iHorarioInicio >= 0 ? parseHora(getCellValue(row, iHorarioInicio))     : null;
      const horarioFin    = iHorarioFin    >= 0 ? parseHora(getCellValue(row, iHorarioFin))        : null;
      const aulaCodigo    = iAulaCodigo    >= 0 ? getCellText(row, iAulaCodigo) || null             : null;
      const aulaNombre    = iAulaNombre    >= 0 ? getCellText(row, iAulaNombre) || null             : null;
      const codocenteRol  = iCodocenteRol  >= 0 ? getCellText(row, iCodocenteRol) || null          : null;

      try {
        // ── Docente ──────────────────────────────────────────────────────────
        const [docenteResult] = await conn.execute(
          `INSERT INTO docentes (nombres, apellidos, correo)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE nombres=VALUES(nombres), apellidos=VALUES(apellidos)`,
          [nombres, apellidos, correo]
        );

        const docente_id =
          docenteResult.insertId ||
          (await selectId(conn, `SELECT id FROM docentes WHERE correo=? LIMIT 1`, [correo]));

        if (!docente_id) throw new Error(`No se pudo resolver id de docente: ${correo}`);

        if (docenteResult.insertId) {
          stats.insertados++;
          logger.info({ correo, docente_id }, "✅ Docente INSERTADO");
        } else {
          stats.actualizados++;
        }

        // ── Nivel ────────────────────────────────────────────────────────────
        const nivel_id = await upsertSimple(conn, "niveles_educativos", "nombre", {
          nombre: nivelNom || "General"
        });
        if (!nivel_id) throw new Error(`No se pudo resolver nivel: ${nivelNom}`);

        // ── Grado ────────────────────────────────────────────────────────────
        let grado_id = null;
        if (Number.isFinite(Number(gradoNum)) && Number(gradoNum) > 0) {
          const gnum     = Number(gradoNum);
          const sec      = seccion || "";
          const etiqueta = `${gnum}${sec}`;

          const [gradoResult] = await conn.execute(
            `INSERT INTO grados (nivel_id, grado_numero, seccion, etiqueta)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE etiqueta=VALUES(etiqueta)`,
            [nivel_id, gnum, sec, etiqueta]
          );

          grado_id =
            gradoResult.insertId ||
            (await selectId(
              conn,
              `SELECT id FROM grados WHERE nivel_id=? AND grado_numero=? AND seccion=? LIMIT 1`,
              [nivel_id, gnum, sec]
            ));

          if (!grado_id) throw new Error(`No se pudo resolver grado: ${etiqueta}`);
        }

        // ── Asignatura ───────────────────────────────────────────────────────
        const asignatura_id = await upsertSimple(conn, "asignaturas", "nombre", {
          nombre: asignaturaNom
        });
        if (!asignatura_id) throw new Error(`No se pudo resolver asignatura: ${asignaturaNom}`);

        // ── Período ──────────────────────────────────────────────────────────
        const [periodoResult] = await conn.execute(
          `INSERT INTO periodos_academicos (anio, nombre)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE nombre=VALUES(nombre)`,
          [anio, perNom]
        );

        const periodo_id =
          periodoResult.insertId ||
          (await selectId(
            conn,
            `SELECT id FROM periodos_academicos WHERE anio=? AND nombre=? LIMIT 1`,
            [anio, perNom]
          ));

        if (!periodo_id) throw new Error(`No se pudo resolver periodo: ${anio}-${perNom}`);

        // ── Curso ────────────────────────────────────────────────────────────
        let curso_id = null;
        if (grado_id) {
          const [cursoResult] = await conn.execute(
            `INSERT INTO cursos (grado_id, asignatura_id, periodo_id, docente_id)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE docente_id=VALUES(docente_id)`,
            [grado_id, asignatura_id, periodo_id, docente_id]
          );

          curso_id =
            cursoResult.insertId ||
            (await selectId(
              conn,
              `SELECT id FROM cursos WHERE grado_id=? AND asignatura_id=? AND periodo_id=? LIMIT 1`,
              [grado_id, asignatura_id, periodo_id]
            ));

          if (!curso_id) throw new Error(`No se pudo resolver curso para docente ${correo}`);

          if (cursoResult.insertId) {
            stats.cursosCreados++;
            logger.info({ curso_id, docente_id, asignatura: asignaturaNom, grado_id }, "✅ Curso asignado");
          }
        }

        // ── Aula ─────────────────────────────────────────────────────────────
        let aula_id = null;
        if (aulaCodigo) {
          const [aulaResult] = await conn.execute(
            `INSERT INTO aulas (codigo, nombre)
             VALUES (?, ?)
             ON DUPLICATE KEY UPDATE nombre=VALUES(nombre)`,
            [aulaCodigo, aulaNombre || `Aula ${aulaCodigo}`]
          );

          aula_id =
            aulaResult.insertId ||
            (await selectId(conn, `SELECT id FROM aulas WHERE codigo=? LIMIT 1`, [aulaCodigo]));

          if (!aula_id) throw new Error(`No se pudo resolver aula: ${aulaCodigo}`);

          if (aulaResult.insertId) {
            stats.aulasCreadas++;
            logger.debug({ aula_id, aulaCodigo }, "Aula creada");
          }
        }

        // ── Horario ──────────────────────────────────────────────────────────
        if (curso_id && horarioDia && horarioInicio && horarioFin) {
          // FIX #8: compararHoras ahora lanza si alguno es null, así que
          // el check de arriba (&&) garantiza que ambas son strings válidas.
          if (compararHoras(horarioInicio, horarioFin) >= 0) {
            throw new Error(`Hora inicio debe ser menor que hora fin (${horarioInicio} - ${horarioFin})`);
          }

          const [horarioExist] = await conn.query(
            `SELECT id FROM horarios
              WHERE curso_id=? AND dia_semana=? AND hora_inicio=? AND hora_fin=?
              LIMIT 1`,
            [curso_id, horarioDia, horarioInicio, horarioFin]
          );

          if (horarioExist?.length) {
            await conn.execute(
              `UPDATE horarios SET aula_id=? WHERE id=?`,
              [aula_id, horarioExist[0].id]
            );
            stats.horariosActualizados++;
            logger.info({ fila: r, curso_id, horarioDia, horarioInicio, horarioFin }, "♻️ Horario ACTUALIZADO");
          } else {
            await conn.execute(
              `INSERT INTO horarios (curso_id, dia_semana, hora_inicio, hora_fin, aula_id)
               VALUES (?, ?, ?, ?, ?)`,
              [curso_id, horarioDia, horarioInicio, horarioFin, aula_id]
            );
            stats.horariosCreados++;
            logger.info({ fila: r, curso_id, horarioDia, horarioInicio, horarioFin }, "✅ Horario creado");
          }
        }

        // ── Co-docencia ──────────────────────────────────────────────────────
        if (curso_id && codocenteRol) {
          await conn.execute(
            `INSERT INTO curso_docentes (curso_id, docente_id, rol)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE rol=VALUES(rol)`,
            [curso_id, docente_id, codocenteRol]
          );
          stats.codocenciasCreadas++;
          logger.debug({ curso_id, docente_id, rol: codocenteRol }, "Co-docencia asignada");
        }

      } catch (rowErr) {
        stats.filasError++;
        // FIX #6: registrar error en errores_importacion
        if (loteId) {
          await registrarErrorLote(conn, loteId, r, null, rowErr.message).catch(() => {});
        }
        logger.error(
          { fila: r, correo, nombres, apellidos, asignaturaNom, error: rowErr.message },
          "❌ Error procesando fila"
        );
      }
    }

    // FIX #6: cerrar lote con totales finales
    if (loteId) await cerrarLote(conn, loteId, stats);

    await conn.commit();

    // FIX #7: marcar tarea como TERMINADA
    await marcarTareaIngesta(conn, idDocumento, "TERMINADA");

    logger.info({ archivo: nombre, ...stats, totalFilas: ws.rowCount - 1 }, "✅ Importación docentes COMPLETADA");

  } catch (e) {
    await conn.rollback();

    // FIX #7: marcar tarea como FALLIDA
    await marcarTareaIngesta(conn, idDocumento, "FALLIDA", e.message).catch(() => {});

    logger.error({ error: e.message, stack: e.stack }, "❌ Importación docentes FALLÓ");
    throw e;
  } finally {
    conn.release();
  }
}