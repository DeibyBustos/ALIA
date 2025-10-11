import "dotenv/config";
import express from "express";
import pino from "pino";
import pinoHttp from "pino-http";
import { pool } from "../../libreria-compartida/src/db.js";
import { logger } from "../../libreria-compartida/src/logger.js";
import router from "./rutas.busqueda.js";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(pinoHttp({ logger: pino({ level: process.env.LOG_LEVEL || "info" }) }));

app.get("/estado", async (_req, res) => {
  const inicio = Date.now();
  let bd = { ok: false };
  try {
    const c = await pool.getConnection();
    await c.ping();
    c.release();
    bd.ok = true;
  } catch (err) {
    bd = { ok: false, error: String(err) };
  }
  res.json({
    servicio: "svc-busqueda",
    version: process.env.APP_VERSION || "1.0.0",
    entorno: process.env.NODE_ENV || "desarrollo",
    hora_servidor_iso: new Date().toISOString(),
    uptime_seg: Math.round(process.uptime()),
    latencia_ms: Date.now() - inicio,
    base_datos: bd,
    config: {
      limite_candidatos: Number(process.env.RAG_CANDIDATOS || 1000),
      k_por_defecto: Number(process.env.RAG_K || 6),
      umbral_min: process.env.RAG_UMBRAL ? Number(process.env.RAG_UMBRAL) : null
    }
  });
});

app.use("/busqueda", router);

app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada en svc-busqueda", ruta: req.originalUrl });
});

const port = process.env.PORT_SVC_BUSQUEDA || 8083;
app.listen(port, () => logger.info({ port }, "svc-busqueda escuchando"));
