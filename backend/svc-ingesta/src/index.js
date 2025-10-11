/**
 * Servicio de ingesta de documentos
 * Proporciona un API REST para monitorear el estado del servicio
 * y un worker en background para procesar documentos
 */

import "dotenv/config";
import express from "express";
import pino from "pino";
import pinoHttp from "pino-http";
import { pool } from "../../libreria-compartida/src/db.js";
import { logger } from "../../libreria-compartida/src/logger.js";
import "./worker.js";

// Configuración básica del servidor Express
const app = express();
app.use(express.json({ limit: "512kb" }));
app.use(pinoHttp({ logger: pino({ level: process.env.LOG_LEVEL || "info" }) }));

app.get("/estado", async (_req, res) => {
  const inicio = Date.now();
  let bd = { ok: false };
  
  // Verifica conexión a base de datos
  try {
    const c = await pool.getConnection();
    await c.ping();
    c.release();
    bd.ok = true;
  } catch (err) {
    bd = { ok: false, error: String(err) };
  }

  // Retorna estado completo
  res.json({
    servicio: "svc-ingesta",
    version: process.env.APP_VERSION || "1.0.0",
    entorno: process.env.NODE_ENV || "desarrollo",
    hora_servidor_iso: new Date().toISOString(),
    uptime_seg: Math.round(process.uptime()),
    latencia_ms: Date.now() - inicio,
    base_datos: bd,
    config: {
      tamano_chunk: Number(process.env.TAMANO_CHUNK || 800),
      solapamiento: Number(process.env.SOBRELAPAMIENTO_CHUNK || 120),
      lote_tareas: Number(process.env.INGESTA_BATCH || 5),
      polling_ms: Number(process.env.INGESTA_POLL_MS || 2000),
      guardar_texto_completo: process.env.GUARDAR_TEXTO_COMPLETO !== "false",
      max_excel_sheets: Number(process.env.MAX_EXCEL_SHEETS || 10),
      max_excel_rows: Number(process.env.MAX_EXCEL_ROWS || 5000),
      max_excel_cols: Number(process.env.MAX_EXCEL_COLS || 50)
    }
  });
});

// Inicia el servidor HTTP
const port = process.env.PORT_SVC_INGESTA || 8082;
app.listen(port, () => logger.info({ port }, "svc-ingesta escuchando y worker activo"));
