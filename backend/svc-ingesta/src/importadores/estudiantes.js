// backend/svc-ingesta/src/importadores/estudiantes.js
import Excel from "exceljs";
import { getPool } from "../../../libreria-compartida/src/db.js";
import { logger } from "../../../libreria-compartida/src/logger.js";

// Normaliza encabezado a snake simple
const norm = s => String(s||"")
  .normalize("NFD").replace(/\p{Diacritic}/gu,"")
  .toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");

// Busca índice por lista de alias
const idxOf = (headers, ...alts) => headers.findIndex(h => alts.includes(h));

// helpers de catálogo
async function upsertSimple(conn, table, uniqueCol, cols) {
  const keys = Object.keys(cols);
  const qMarks = keys.map(()=>"?").join(",");
  const dup = keys.map(k=>`${k}=VALUES(${k})`).join(",");
  
  const [result] = await conn.execute(
    `INSERT INTO ${table} (${keys.join(",")}) VALUES (${qMarks})
     ON DUPLICATE KEY UPDATE ${dup}`,
    keys.map(k=>cols[k])
  );
  
  if (result.insertId) {
    return result.insertId;
  }
  
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

export async function importarEstudiantesDesdeExcel({ rutaFS, idDocumento, nombre, periodo }) {
  logger.info({ rutaFS, idDocumento, nombre }, "🔵 INICIANDO importación de estudiantes");
  
  const wb = new Excel.Workbook();
  await wb.xlsx.readFile(rutaFS);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Excel sin hojas");

  const headers = (ws.getRow(1).values || []).slice(1).map(norm);
  logger.info({ headers }, "Encabezados detectados");

  // Indices flexibles
  const iDocumento = idxOf(headers, "documento", "num_documento", "id", "dni", "cedula");
  const iNombres   = idxOf(headers, "nombres", "nombre");
  const iApellidos = idxOf(headers, "apellidos", "apellido");
  const iNacimiento= idxOf(headers, "fecha_nacimiento", "nacimiento", "fnac", "fecha_nac");
  const iNivel     = idxOf(headers, "nivel", "nivel_educativo");
  const iGradoNum  = idxOf(headers, "grado_numero", "grado", "grado_num");
  const iSeccion   = idxOf(headers, "seccion", "grupo", "letra");
  const iPeriodoAnio = idxOf(headers, "periodo_anio", "anio", "año", "ano");
  const iPeriodoNom  = idxOf(headers, "periodo_nombre", "periodo");
  const iAsignaturas = idxOf(headers, "asignaturas", "materias");

  logger.info({
    iDocumento, iNombres, iApellidos, iNacimiento, iNivel, 
    iGradoNum, iSeccion, iPeriodoAnio, iPeriodoNom, iAsignaturas
  }, "Índices de columnas");

  if (iDocumento < 0 || iNombres < 0 || iApellidos < 0) {
    throw new Error("Faltan columnas mínimas: documento, nombres, apellidos");
  }

  const pool = getPool();
  const conn = await pool.getConnection();
  
  try {
    await conn.beginTransaction();
    logger.info("Transacción iniciada");

    const defAnio = periodo?.anio || new Date().getFullYear();
    const defPeriodoNombre = periodo?.nombre || "ANUAL";

    let insertados = 0, actualizados = 0, filasError = 0;
    let filasProcesadas = 0;
    let totalAcudientesVinculados = 0;

    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      if (!row || row.actualCellCount === 0) continue;

      const documento = String(row.getCell(iDocumento+1).value ?? "").trim();
      const nombres   = String(row.getCell(iNombres+1).value ?? "").trim();
      const apellidos = String(row.getCell(iApellidos+1).value ?? "").trim();
      
      if (!documento || !nombres || !apellidos) {
        logger.warn({ fila: r, documento, nombres, apellidos }, "Fila sin datos mínimos");
        continue;
      }

      filasProcesadas++;

      const fnacVal   = iNacimiento>=0 ? row.getCell(iNacimiento+1).value : null;
      const fecha_nac = fnacVal ? new Date(fnacVal) : null;
      const nivelNom  = iNivel>=0 ? String(row.getCell(iNivel+1).value ?? "").trim() : null;
      const gradoNum  = iGradoNum>=0 ? Number(row.getCell(iGradoNum+1).value ?? "") : null;
      const seccion   = iSeccion>=0 ? String(row.getCell(iSeccion+1).value ?? "").trim() : null;
      const anio      = iPeriodoAnio>=0 ? Number(row.getCell(iPeriodoAnio+1).value ?? "") : defAnio;
      const perNom    = iPeriodoNom>=0 ? String(row.getCell(iPeriodoNom+1).value ?? "").trim() : defPeriodoNombre;
      const asigsCSV  = iAsignaturas>=0 ? String(row.getCell(iAsignaturas+1).value ?? "").trim() : "";
      const asignaturas = asigsCSV ? asigsCSV.split(",").map(s=>s.trim()).filter(Boolean) : [];

      try {
        // ESTUDIANTE
        const [estResult] = await conn.execute(
          `INSERT INTO estudiantes (nombres, apellidos, documento, fecha_nacimiento)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             nombres=VALUES(nombres), apellidos=VALUES(apellidos), fecha_nacimiento=VALUES(fecha_nacimiento)`,
          [nombres, apellidos, documento, fecha_nac]
        );

        const idEst = estResult.insertId || (await selectId(conn, `SELECT id FROM estudiantes WHERE documento=?`, [documento]));
        if (!idEst) throw new Error(`No se pudo resolver id de estudiante: ${documento}`);

        if (estResult.insertId) {
          insertados++;
          logger.info({ documento, idEst }, "✅ Estudiante INSERTADO");
        } else {
          actualizados++;
        }

        // NIVEL
        let nivel_id = await upsertSimple(conn, "niveles_educativos", "nombre", { nombre: nivelNom || "General" });

        // GRADO
        const etiqueta = (gradoNum!=null && seccion) ? `${gradoNum}${seccion}` : (gradoNum!=null ? String(gradoNum) : (seccion||""));
        const gnum = Number.isFinite(gradoNum) ? gradoNum : 0;
        const sec  = seccion || "";
        
        const [gradoResult] = await conn.execute(
          `INSERT INTO grados (nivel_id, grado_numero, seccion, etiqueta) VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE etiqueta=VALUES(etiqueta)`,
          [nivel_id, gnum, sec, etiqueta || null]
        );
        const grado_id = gradoResult.insertId || (await selectId(conn, `SELECT id FROM grados WHERE nivel_id=? AND grado_numero=? AND seccion=? LIMIT 1`, [nivel_id, gnum, sec]));

        // PERIODO
        const [periodoResult] = await conn.execute(
          `INSERT INTO periodos_academicos (anio, nombre) VALUES (?, ?) ON DUPLICATE KEY UPDATE nombre=VALUES(nombre)`,
          [anio, perNom || "ANUAL"]
        );
        const periodo_id = periodoResult.insertId || (await selectId(conn, `SELECT id FROM periodos_academicos WHERE anio=? AND nombre=? LIMIT 1`, [anio, perNom || "ANUAL"]));

        // MATRÍCULA
        await conn.execute(
          `INSERT INTO matriculas (estudiante_id, grado_id, periodo_id, estado) VALUES (?, ?, ?, 'ACTIVA')
           ON DUPLICATE KEY UPDATE estado='ACTIVA', grado_id=VALUES(grado_id)`,
          [idEst, grado_id, periodo_id]
        );

        // INSCRIPCIONES
        for (const asig of asignaturas) {
          const asignatura_id = await upsertSimple(conn, "asignaturas", "nombre", { nombre: asig });
          const [cursoResult] = await conn.execute(
            `INSERT INTO cursos (grado_id, asignatura_id, periodo_id, docente_id) VALUES (?, ?, ?, NULL)
             ON DUPLICATE KEY UPDATE asignatura_id=VALUES(asignatura_id)`,
            [grado_id, asignatura_id, periodo_id]
          );
          const curso_id = cursoResult.insertId || (await selectId(conn, `SELECT id FROM cursos WHERE grado_id=? AND asignatura_id=? AND periodo_id=? LIMIT 1`, [grado_id, asignatura_id, periodo_id]));
          await conn.execute(
            `INSERT INTO inscripciones (estudiante_id, curso_id, periodo_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE estudiante_id=VALUES(estudiante_id)`,
            [idEst, curso_id, periodo_id]
          );
        }

        // ============ ACUDIENTES ============
        let numAcudiente = 1;
        let acudientesEsteEst = 0;
        
        while (numAcudiente <= 10) {
          const iAcudNombres = idxOf(headers, `acudiente${numAcudiente}_nombres`, `acud${numAcudiente}_nombres`);
          const iAcudApellidos = idxOf(headers, `acudiente${numAcudiente}_apellidos`, `acud${numAcudiente}_apellidos`);
          
          if (iAcudNombres < 0 || iAcudApellidos < 0) {
            numAcudiente++;
            continue;
          }

          const acudNombres = String(row.getCell(iAcudNombres+1).value ?? "").trim();
          const acudApellidos = String(row.getCell(iAcudApellidos+1).value ?? "").trim();
          
          if (!acudNombres || !acudApellidos) {
            numAcudiente++;
            continue;
          }

          const iAcudTel = idxOf(headers, `acudiente${numAcudiente}_telefono`, `acud${numAcudiente}_telefono`);
          const iAcudCorreo = idxOf(headers, `acudiente${numAcudiente}_correo`, `acud${numAcudiente}_correo`);
          const iAcudRelacion = idxOf(headers, `acudiente${numAcudiente}_relacion`, `acud${numAcudiente}_relacion`);

          const acudTelefono = iAcudTel >= 0 ? String(row.getCell(iAcudTel+1).value ?? "").trim() : null;
          const acudCorreo = iAcudCorreo >= 0 ? String(row.getCell(iAcudCorreo+1).value ?? "").trim() : null;
          const acudRelacion = iAcudRelacion >= 0 ? String(row.getCell(iAcudRelacion+1).value ?? "").trim() : 'NO ESPECIFICADO';

          logger.debug({ numAcudiente, acudNombres, acudCorreo }, "Procesando acudiente");

          let acudiente_id;
          
          if (acudCorreo) {
            const [acudExist] = await conn.query(`SELECT id FROM acudientes WHERE correo=? LIMIT 1`, [acudCorreo]);
            if (acudExist && acudExist.length > 0) {
              acudiente_id = acudExist[0].id;
              await conn.execute(`UPDATE acudientes SET nombres=?, apellidos=?, telefono=? WHERE id=?`, [acudNombres, acudApellidos, acudTelefono, acudiente_id]);
            } else {
              const [acudResult] = await conn.execute(`INSERT INTO acudientes (nombres, apellidos, telefono, correo) VALUES (?, ?, ?, ?)`, [acudNombres, acudApellidos, acudTelefono, acudCorreo]);
              acudiente_id = acudResult.insertId;
            }
          } else {
            const [acudResult] = await conn.execute(`INSERT INTO acudientes (nombres, apellidos, telefono, correo) VALUES (?, ?, ?, ?)`, [acudNombres, acudApellidos, acudTelefono, null]);
            acudiente_id = acudResult.insertId;
          }

          await conn.execute(
            `INSERT INTO estudiante_acudiente (estudiante_id, acudiente_id, relacion) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE relacion=VALUES(relacion)`,
            [idEst, acudiente_id, acudRelacion]
          );

          logger.info({ estudiante_id: idEst, acudiente_id, acudNombres, relacion: acudRelacion }, "✅ Acudiente vinculado");
          acudientesEsteEst++;
          totalAcudientesVinculados++;
          numAcudiente++;
        }

        if (acudientesEsteEst > 0) {
          logger.debug({ idEst, acudientesEsteEst }, "Acudientes vinculados a este estudiante");
        }

      } catch (rowErr) {
        filasError++;
        logger.error({ fila: r, documento, error: rowErr.message }, "❌ Error procesando fila");
      }
    }

    await conn.commit();
    logger.info({ 
      archivo: nombre, insertados, actualizados, filasError, filasProcesadas,
      totalFilas: ws.rowCount - 1, totalAcudientesVinculados
    }, "✅ Importación estudiantes COMPLETADA");

  } catch (e) {
    await conn.rollback();
    logger.error({ error: e.message, stack: e.stack }, "❌ Importación estudiantes FALLÓ");
    throw e;
  } finally {
    conn.release();
  }
}