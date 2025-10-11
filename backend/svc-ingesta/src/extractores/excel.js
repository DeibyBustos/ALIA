import ExcelJS from "exceljs";

// Límites para prevenir consumo excesivo (configurables por .env)
const MAX_SHEETS  = parseInt(process.env.MAX_EXCEL_SHEETS || "10", 10);
const MAX_ROWS    = parseInt(process.env.MAX_EXCEL_ROWS   || "5000", 10);
const MAX_COLUMNS = parseInt(process.env.MAX_EXCEL_COLS   || "50", 10);

/**
 * Lee un .xlsx/.xls/.csv y devuelve texto tipo CSV por hoja.
 * - No evalúa fórmulas (solo valores presentes).
 * - Aplica límites de hojas/filas/columnas para prevenir DoS.
 */
export async function extraerExcelComoTexto(ruta) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(ruta);

  let texto = "";
  const sheets = wb.worksheets.slice(0, MAX_SHEETS);

  for (const ws of sheets) {
    texto += `\n[Hoja: ${ws.name}]\n`;

    let filasProcesadas = 0;
    ws.eachRow({ includeEmpty: false }, (row) => {
      if (filasProcesadas >= MAX_ROWS) return;
      filasProcesadas++;

      // row.values[0] es null por diseño de exceljs
      const values = row.values.slice(1, 1 + MAX_COLUMNS).map(v => {
        if (v == null) return "";
        if (typeof v === "string" || typeof v === "number") return String(v);
        if (v.text) return String(v.text);             
        if (v.result != null) return String(v.result); 
        if (v.hyperlink) return String(v.text || v.hyperlink);
        if (v.toISOString) return v.toISOString();     
        return String(v);
      });

      texto += values.join(",") + "\n";
    });
  }

  return texto;
}
