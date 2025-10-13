// backend/svc-ingesta/src/importadores/docentes.js
import Excel from "exceljs";
import { getPool } from "../../../libreria-compartida/src/db.js";
import { logger } from "../../../libreria-compartida/src/logger.js";

const norm = s => String(s||"")
  .normalize("NFD").replace(/\p{Diacritic}/gu,"")
  .toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");

const idxOf = (headers, ...alts) => headers.findIndex(h => alts.includes(h));

async function upsertSimple(conn, table, uniqueCol, cols) {
  const keys = Object.keys(cols);
  const qMarks = keys.map(()=>"?").join(",");
  const dup = keys.map(k=>`${k}=VALUES(${k})`).join(",");
  
  const [result] = await conn.execute(
    `INSERT INTO ${table} (${keys.join(",")}) VALUES (${qMarks})
     ON DUPLICATE KEY UPDATE ${dup}`,
    keys.map(k=>cols[k])
  );
  
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

export async function importarDocentesDesdeExcel({ rutaFS, idDocumento, nombre, periodo }) {
  logger.info({ rutaFS, idDocumento, nombre }, "👨‍🏫 INICIANDO importación de docentes");
  
  const wb = new Excel.Workbook();
  await wb.xlsx.readFile(rutaFS);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Excel sin hojas");

  const headers = (ws.getRow(1).values || []).slice(1).map(norm);
  logger.info({ headers }, "Encabezados detectados");

  // Índices columnas base
  const iNombres     = idxOf(headers, "nombres", "nombre");
  const iApellidos   = idxOf(headers, "apellidos", "apellido");
  const iCorreo      = idxOf(headers, "correo", "email", "mail");
  const iAsignatura  = idxOf(headers, "asignatura", "materia");
  const iNivel       = idxOf(headers, "nivel", "nivel_educativo");
  const iGradoNum    = idxOf(headers, "grado_numero", "grado", "grado_num");
  const iSeccion     = idxOf(headers, "seccion", "grupo", "letra");
  const iPeriodoAnio = idxOf(headers, "periodo_anio", "anio", "año", "ano");
  const iPeriodoNom  = idxOf(headers, "periodo_nombre", "periodo");
  
  // Índices horarios (opcionales)
  const iHorarioDia    = idxOf(headers, "horario_dia", "dia_semana", "dia");
  const iHorarioInicio = idxOf(headers, "horario_inicio", "hora_inicio");
  const iHorarioFin    = idxOf(headers, "horario_fin", "hora_fin");
  const iAulaCodigo    = idxOf(headers, "aula_codigo", "aula");
  const iAulaNombre    = idxOf(headers, "aula_nombre");
  
  // Co-docencia (opcional)
  const iCodocenteRol = idxOf(headers, "codocente_rol", "rol_adicional", "rol");

  logger.info({
    iNombres, iApellidos, iCorreo, iAsignatura, iNivel, iGradoNum, iSeccion,
    iHorarioDia, iAulaCodigo, iCodocenteRol
  }, "Índices de columnas");

  if (iNombres < 0 || iApellidos < 0 || iCorreo < 0 || iAsignatura < 0) {
    throw new Error("Faltan columnas mínimas: nombres, apellidos, correo, asignatura");
  }

  const pool = getPool();
  const conn = await pool.getConnection();
  
  try {
    await conn.beginTransaction();
    logger.info("Transacción iniciada");

    const defAnio = periodo?.anio || new Date().getFullYear();
    const defPeriodoNombre = periodo?.nombre || "ANUAL";

    let stats = {
      insertados: 0, actualizados: 0, filasError: 0, filasProcesadas: 0,
      cursosCreados: 0, horariosCreados: 0, aulasCreadas: 0, codocenciasCreadas: 0
    };

    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      if (!row || row.actualCellCount === 0) continue;

      const nombres = String(row.getCell(iNombres+1).value ?? "").trim();
      const apellidos = String(row.getCell(iApellidos+1).value ?? "").trim();
      const correo = String(row.getCell(iCorreo+1).value ?? "").trim();
      const asignaturaNom = String(row.getCell(iAsignatura+1).value ?? "").trim();
      
      if (!nombres || !apellidos || !correo || !asignaturaNom) {
        logger.warn({ fila: r }, "Fila sin datos mínimos");
        continue;
      }

      stats.filasProcesadas++;

      const nivelNom = iNivel >= 0 ? String(row.getCell(iNivel+1).value ?? "").trim() : "General";
      const gradoNum = iGradoNum >= 0 ? Number(row.getCell(iGradoNum+1).value ?? "") : 0;
      const seccion = iSeccion >= 0 ? String(row.getCell(iSeccion+1).value ?? "").trim() : "";
      const anio = iPeriodoAnio >= 0 ? Number(row.getCell(iPeriodoAnio+1).value ?? "") : defAnio;
      const perNom = iPeriodoNom >= 0 ? String(row.getCell(iPeriodoNom+1).value ?? "").trim() : defPeriodoNombre;

      // Datos horario (opcionales)
      const horarioDia = iHorarioDia >= 0 ? Number(row.getCell(iHorarioDia+1).value ?? 0) : null;
      const horarioInicio = iHorarioInicio >= 0 ? String(row.getCell(iHorarioInicio+1).value ?? "").trim() : null;
      const horarioFin = iHorarioFin >= 0 ? String(row.getCell(iHorarioFin+1).value ?? "").trim() : null;
      const aulaCodigo = iAulaCodigo >= 0 ? String(row.getCell(iAulaCodigo+1).value ?? "").trim() : null;
      const aulaNombre = iAulaNombre >= 0 ? String(row.getCell(iAulaNombre+1).value ?? "").trim() : null;
      
      // Co-docencia (opcional)
      const codocenteRol = iCodocenteRol >= 0 ? String(row.getCell(iCodocenteRol+1).value ?? "").trim() : null;

      try {
        // 1. DOCENTE
        const [docenteResult] = await conn.execute(
          `INSERT INTO docentes (nombres, apellidos, correo)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE nombres=VALUES(nombres), apellidos=VALUES(apellidos)`,
          [nombres, apellidos, correo]
        );

        const docente_id = docenteResult.insertId || (await selectId(
          conn, `SELECT id FROM docentes WHERE correo=?`, [correo]
        ));
        
        if (!docente_id) throw new Error(`No se pudo resolver id de docente: ${correo}`);

        if (docenteResult.insertId) {
          stats.insertados++;
          logger.info({ correo, docente_id }, "✅ Docente INSERTADO");
        } else {
          stats.actualizados++;
        }

        // 2. NIVEL
        const nivel_id = await upsertSimple(conn, "niveles_educativos", "nombre", { nombre: nivelNom });

        // 3. GRADO
        const etiqueta = (Number.isFinite(gradoNum) && gradoNum > 0 && seccion) 
          ? `${gradoNum}${seccion}` 
          : (gradoNum > 0 ? String(gradoNum) : (seccion || ""));
        
        const gnum = Number.isFinite(gradoNum) && gradoNum > 0 ? gradoNum : 0;
        const sec = seccion || "";

        const [gradoResult] = await conn.execute(
          `INSERT INTO grados (nivel_id, grado_numero, seccion, etiqueta)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE etiqueta=VALUES(etiqueta)`,
          [nivel_id, gnum, sec, etiqueta || null]
        );

        const grado_id = gradoResult.insertId || (await selectId(
          conn,
          `SELECT id FROM grados WHERE nivel_id=? AND grado_numero=? AND seccion=? LIMIT 1`,
          [nivel_id, gnum, sec]
        ));

        // 4. ASIGNATURA
        const asignatura_id = await upsertSimple(conn, "asignaturas", "nombre", { nombre: asignaturaNom });

        // 5. PERIODO
        const [periodoResult] = await conn.execute(
          `INSERT INTO periodos_academicos (anio, nombre)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE nombre=VALUES(nombre)`,
          [anio, perNom]
        );

        const periodo_id = periodoResult.insertId || (await selectId(
          conn,
          `SELECT id FROM periodos_academicos WHERE anio=? AND nombre=? LIMIT 1`,
          [anio, perNom]
        ));

        // 6. CURSO (docente titular)
        const [cursoResult] = await conn.execute(
          `INSERT INTO cursos (grado_id, asignatura_id, periodo_id, docente_id)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE docente_id=VALUES(docente_id)`,
          [grado_id, asignatura_id, periodo_id, docente_id]
        );

        const curso_id = cursoResult.insertId || (await selectId(
          conn,
          `SELECT id FROM cursos WHERE grado_id=? AND asignatura_id=? AND periodo_id=? LIMIT 1`,
          [grado_id, asignatura_id, periodo_id]
        ));

        if (cursoResult.insertId || cursoResult.affectedRows > 0) {
          stats.cursosCreados++;
          logger.info({ 
            curso_id, docente_id, asignatura: asignaturaNom, grado: etiqueta 
          }, "✅ Curso asignado");
        }

        // 7. AULA (si viene)
        let aula_id = null;
        if (aulaCodigo) {
          const [aulaResult] = await conn.execute(
            `INSERT INTO aulas (codigo, nombre)
             VALUES (?, ?)
             ON DUPLICATE KEY UPDATE nombre=VALUES(nombre)`,
            [aulaCodigo, aulaNombre || `Aula ${aulaCodigo}`]
          );

          aula_id = aulaResult.insertId || (await selectId(
            conn,
            `SELECT id FROM aulas WHERE codigo=? LIMIT 1`,
            [aulaCodigo]
          ));

          if (aulaResult.insertId) {
            stats.aulasCreadas++;
            logger.debug({ aula_id, aulaCodigo }, "Aula creada");
          }
        }

        // 8. HORARIO (si viene info completa)
        if (horarioDia && horarioDia > 0 && horarioInicio && horarioFin) {
          const [horarioResult] = await conn.execute(
            `INSERT INTO horarios (curso_id, dia_semana, hora_inicio, hora_fin, aula_id)
             VALUES (?, ?, ?, ?, ?)`,
            [curso_id, horarioDia, horarioInicio, horarioFin, aula_id]
          );

          if (horarioResult.insertId) {
            stats.horariosCreados++;
            logger.info({ 
              horario_id: horarioResult.insertId, 
              curso_id, 
              dia: horarioDia, 
              hora: `${horarioInicio}-${horarioFin}` 
            }, "✅ Horario creado");
          }
        }

        // 9. CO-DOCENCIA (si viene rol adicional)
        if (codocenteRol) {
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
        logger.error({ 
          fila: r, correo, error: rowErr.message, stack: rowErr.stack 
        }, "❌ Error procesando fila");
      }
    }

    await conn.commit();
    logger.info({ 
      archivo: nombre, 
      ...stats,
      totalFilas: ws.rowCount - 1
    }, "✅ Importación docentes COMPLETADA");

  } catch (e) {
    await conn.rollback();
    logger.error({ error: e.message, stack: e.stack }, "❌ Importación docentes FALLÓ");
    throw e;
  } finally {
    conn.release();
  }
}