/**
 * Operaciones de importación de planeaciones desde Excel
 * Archivo: svc-generacion/src/operaciones/planeaciones.importar.ops.js
 *
 * Columnas requeridas en el Excel:
 *   grado | asignatura | titulo | descripcion | semana | fecha
 *   | docente_nombres | docente_apellidos | docente_correo
 *
 * Ejemplo:
 *   7A | Matemáticas | Fracciones | Intro | 3 | 2025-03-15 | Juan | Pérez | juan@cole.edu
 *
 * Lógica:
 *  1. Busca grado por etiqueta (grados.etiqueta)     → grados.id
 *  2. Busca asignatura por nombre                    → asignaturas.id
 *  3. grado_id + asignatura_id → cursos.id           (período más reciente)
 *  4. Docente: busca por correo; si no existe lo crea; si existe NO modifica nada
 *  5. Planeación: mismo curso_id + titulo → UPDATE desc/semana/fecha
 *                 no existe              → INSERT
 */

import ExcelJS from "exceljs";

// ─── helpers ────────────────────────────────────────────────────────────────

function normalizarFecha(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  const s = String(valor).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const n = Number(s);
  if (!isNaN(n) && n > 0)
    return new Date(Date.UTC(1900, 0, n - 1)).toISOString().slice(0, 10);
  return s || null;
}

async function resolverGradoId(consultar, etiqueta) {
  const filas = await consultar(
    `SELECT id FROM grados WHERE LOWER(TRIM(etiqueta)) = LOWER(TRIM(?)) LIMIT 1`,
    [etiqueta]
  );
  return filas.length ? filas[0].id : null;
}

async function resolverAsignaturaId(consultar, nombre) {
  const filas = await consultar(
    `SELECT id FROM asignaturas WHERE LOWER(TRIM(nombre)) = LOWER(TRIM(?)) LIMIT 1`,
    [nombre]
  );
  return filas.length ? filas[0].id : null;
}

async function resolverCursoId(consultar, gradoId, asignaturaId) {
  const filas = await consultar(
    `SELECT c.id
     FROM cursos c
     JOIN periodos_academicos p ON p.id = c.periodo_id
     WHERE c.grado_id = ? AND c.asignatura_id = ?
     ORDER BY p.anio DESC, p.fecha_inicio DESC
     LIMIT 1`,
    [gradoId, asignaturaId]
  );
  return filas.length ? filas[0].id : null;
}

/**
 * Busca docente por correo.
 * Existe  → devuelve su id sin modificar nada.
 * No existe → INSERT y devuelve el nuevo id.
 */
async function upsertDocente(consultar, nombres, apellidos, correo) {
  const encontrado = await consultar(
    `SELECT id FROM docentes WHERE LOWER(TRIM(correo)) = LOWER(TRIM(?)) LIMIT 1`,
    [correo]
  );
  if (encontrado.length) return encontrado[0].id;

  const res = await consultar(
    `INSERT INTO docentes (nombres, apellidos, correo) VALUES (?, ?, ?)`,
    [nombres.trim(), apellidos.trim(), correo.trim()]
  );
  return res.insertId;
}

// ─── función principal ───────────────────────────────────────────────────────

export async function importarPlaneaciones(buffer, consultar) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const hoja = workbook.worksheets[0];
  if (!hoja) throw new Error("El archivo Excel no contiene hojas.");

  const cab = {};
  hoja.getRow(1).eachCell((celda, col) => {
    cab[String(celda.value).trim().toLowerCase()] = col;
  });

  const requeridos = [
    "grado", "asignatura", "titulo", "semana", "fecha",
    "docente_nombres", "docente_apellidos", "docente_correo",
  ];
  for (const campo of requeridos) {
    if (!cab[campo]) throw new Error(`Columna requerida no encontrada: "${campo}"`);
  }

  const ok = [];
  const errores = [];

  for (let numFila = 2; numFila <= hoja.rowCount; numFila++) {
    const fila = hoja.getRow(numFila);

    const vals = [];
    fila.eachCell((c) => vals.push(c.value));
    if (vals.every((v) => v === null || v === undefined || v === "")) continue;

    const get = (nombre) => {
      const col = cab[nombre];
      if (!col) return null;
      const v = fila.getCell(col).value;
      return v !== null && v !== undefined ? String(v).trim() : null;
    };

    const gradoEtiqueta    = get("grado");
    const asignaturaNombre = get("asignatura");
    const titulo           = get("titulo");
    const descripcion      = get("descripcion") ?? null;
    const semana           = get("semana");
    const fechaRaw         = fila.getCell(cab["fecha"]).value;
    const fecha            = normalizarFecha(fechaRaw);
    const docenteNombres   = get("docente_nombres");
    const docenteApellidos = get("docente_apellidos");
    const docenteCorreo    = get("docente_correo");

    // ── Validaciones ──────────────────────────────────────────────────────
    if (!gradoEtiqueta) { errores.push({ fila: numFila, motivo: "Campo 'grado' vacío" }); continue; }
    if (!asignaturaNombre) { errores.push({ fila: numFila, motivo: "Campo 'asignatura' vacío" }); continue; }
    if (!titulo) { errores.push({ fila: numFila, motivo: "Campo 'titulo' vacío" }); continue; }
    if (!semana || isNaN(Number(semana))) { errores.push({ fila: numFila, motivo: `Semana inválida: "${semana}"` }); continue; }
    if (!fecha) { errores.push({ fila: numFila, motivo: `Fecha inválida: "${fechaRaw}"` }); continue; }
    if (!docenteNombres || !docenteApellidos || !docenteCorreo) {
      errores.push({ fila: numFila, motivo: "Datos del docente incompletos (docente_nombres, docente_apellidos, docente_correo)" });
      continue;
    }

    // ── Resolver grado → grados.id ────────────────────────────────────────
    let gradoId;
    try { gradoId = await resolverGradoId(consultar, gradoEtiqueta); }
    catch (err) { errores.push({ fila: numFila, motivo: `Error buscando grado: ${err.message}` }); continue; }
    if (!gradoId) { errores.push({ fila: numFila, motivo: `Grado no encontrado: "${gradoEtiqueta}"` }); continue; }

    // ── Resolver asignatura → asignaturas.id ──────────────────────────────
    let asignaturaId;
    try { asignaturaId = await resolverAsignaturaId(consultar, asignaturaNombre); }
    catch (err) { errores.push({ fila: numFila, motivo: `Error buscando asignatura: ${err.message}` }); continue; }
    if (!asignaturaId) { errores.push({ fila: numFila, motivo: `Asignatura no encontrada: "${asignaturaNombre}"` }); continue; }

    // ── Resolver curso → cursos.id ────────────────────────────────────────
    let cursoId;
    try { cursoId = await resolverCursoId(consultar, gradoId, asignaturaId); }
    catch (err) { errores.push({ fila: numFila, motivo: `Error buscando curso: ${err.message}` }); continue; }
    if (!cursoId) {
      errores.push({ fila: numFila, motivo: `No existe curso para grado="${gradoEtiqueta}" y asignatura="${asignaturaNombre}"` });
      continue;
    }

    // ── Upsert docente ────────────────────────────────────────────────────
    let docenteId;
    try { docenteId = await upsertDocente(consultar, docenteNombres, docenteApellidos, docenteCorreo); }
    catch (err) { errores.push({ fila: numFila, motivo: `Error procesando docente: ${err.message}` }); continue; }

    // ── Planeación: UPDATE si mismo curso_id+titulo, INSERT si no existe ───
    try {
      const existe = await consultar(
        `SELECT id FROM planeaciones
         WHERE curso_id = ? AND LOWER(TRIM(titulo)) = LOWER(TRIM(?))
         LIMIT 1`,
        [cursoId, titulo]
      );

      if (existe.length) {
        await consultar(
          `UPDATE planeaciones SET descripcion = ?, semana = ?, fecha = ? WHERE id = ?`,
          [descripcion, Number(semana), fecha, existe[0].id]
        );
      } else {
        await consultar(
          `INSERT INTO planeaciones (curso_id, titulo, descripcion, semana, fecha)
           VALUES (?, ?, ?, ?, ?)`,
          [cursoId, titulo, descripcion, Number(semana), fecha]
        );
      }

      ok.push(numFila);
    } catch (err) {
      errores.push({ fila: numFila, motivo: `Error guardando planeación: ${err.message}` });
    }
  }

  return { ok: ok.length, errores };
}