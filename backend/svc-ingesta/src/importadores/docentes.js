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
  await conn.execute(
    `INSERT INTO ${table} (${keys.join(",")}) VALUES (${qMarks})
     ON DUPLICATE KEY UPDATE ${dup}`,
    keys.map(k=>cols[k])
  );
  const [r] = await conn.query(
    `SELECT id FROM ${table} WHERE ${uniqueCol}=? LIMIT 1`, [cols[uniqueCol]]
  );
  return r?.[0]?.id ?? null;
}
async function selectId(conn, sql, params){ const [r]=await conn.query(sql,params); return r?.[0]?.id??null; }

export async function importarDocentesDesdeExcel({ rutaFS, idDocumento, nombre }) {
  const wb = new Excel.Workbook();
  await wb.xlsx.readFile(rutaFS);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Excel sin hojas");

  const headers = (ws.getRow(1).values || []).slice(1).map(norm);

  const iNom   = idxOf(headers, "nombres", "nombre");
  const iApe   = idxOf(headers, "apellidos", "apellido");
  const iMail  = idxOf(headers, "correo", "email");
  const iAsig  = idxOf(headers, "asignatura", "materia");
  const iNivel = idxOf(headers, "nivel", "nivel_educativo");
  const iGrado = idxOf(headers, "grado_numero", "grado");
  const iSec   = idxOf(headers, "seccion", "grupo", "letra");
  const iAnio  = idxOf(headers, "periodo_anio", "anio", "año");
  const iPer   = idxOf(headers, "periodo_nombre", "periodo");

  if (iNom<0 || iApe<0 || iMail<0 || iAsig<0) {
    throw new Error("Faltan columnas mínimas: nombres, apellidos, correo, asignatura");
  }

  const pool = await getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const defAnio = new Date().getFullYear();
    const defPer  = "ANUAL";

    for (let r=2; r<=ws.rowCount; r++) {
      const row = ws.getRow(r);
      if (!row || row.actualCellCount===0) continue;

      const nombres = String(row.getCell(iNom+1).value ?? "").trim();
      const apellidos = String(row.getCell(iApe+1).value ?? "").trim();
      const correo = String(row.getCell(iMail+1).value ?? "").trim();
      const asig   = String(row.getCell(iAsig+1).value ?? "").trim();
      if (!nombres || !apellidos || !correo || !asig) continue;

      const nivelNom = iNivel>=0 ? String(row.getCell(iNivel+1).value ?? "").trim() : "General";
      const gradoNum = iGrado>=0 ? Number(row.getCell(iGrado+1).value ?? "") : 0;
      const seccion  = iSec>=0   ? String(row.getCell(iSec+1).value ?? "").trim() : "";
      const anio     = iAnio>=0  ? Number(row.getCell(iAnio+1).value ?? "") : defAnio;
      const perNom   = iPer>=0   ? String(row.getCell(iPer+1).value ?? "").trim() : defPer;

      // docente
      await conn.execute(
        `INSERT INTO docentes (nombres, apellidos, correo)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE nombres=VALUES(nombres), apellidos=VALUES(apellidos)`,
        [nombres, apellidos, correo]
      );
      const [docSel] = await conn.query(`SELECT id FROM docentes WHERE correo=?`, [correo]);
      const docente_id = docSel?.[0]?.id;

      // nivel / grado
      const nivel_id = await upsertSimple(conn, "niveles_educativos", "nombre", { nombre: nivelNom });
      const etiqueta = (Number.isFinite(gradoNum) && seccion) ? `${gradoNum}${seccion}` : (String(gradoNum||"") + (seccion||""));
      await conn.execute(
        `INSERT INTO grados (nivel_id, grado_numero, seccion, etiqueta)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE etiqueta=VALUES(etiqueta)`,
        [nivel_id, Number.isFinite(gradoNum)?gradoNum:0, seccion||"", etiqueta||null]
      );
      const grado_id = await selectId(conn,
        `SELECT id FROM grados WHERE nivel_id=? AND grado_numero=? AND seccion=? LIMIT 1`,
        [nivel_id, Number.isFinite(gradoNum)?gradoNum:0, seccion||""]
      );

      // asignatura
      const asignatura_id = await upsertSimple(conn, "asignaturas", "nombre", { nombre: asig });

      // periodo
      await conn.execute(
        `INSERT INTO periodos_academicos (anio, nombre)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE nombre=VALUES(nombre)`,
        [anio, perNom]
      );
      const periodo_id = await selectId(conn,
        `SELECT id FROM periodos_academicos WHERE anio=? AND nombre=? LIMIT 1`,
        [anio, perNom]
      );

      // curso con docente titular
      await conn.execute(
        `INSERT INTO cursos (grado_id, asignatura_id, periodo_id, docente_id)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE docente_id=VALUES(docente_id)`,
        [grado_id, asignatura_id, periodo_id, docente_id]
      );
    }

    await conn.commit();
    logger.info({ archivo: nombre }, "Importación docentes OK");
  } catch (e) {
    await conn.rollback();
    logger.error({ e }, "Importación docentes FALLÓ");
    throw e;
  } finally {
    conn.release();
  }
}
