import "dotenv/config";
import express from "express";
import pino from "pino";
import pinoHttp from "pino-http";
import router from "./rutas.documentos.js";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(pinoHttp({ logger: pino({ level: process.env.LOG_LEVEL || "info" }) }));

// Estado del servicio (usado por el gateway /estado)
app.get("/estado", (_req, res) => {
  res.json({
    servicio: "svc-documentos",
    version: process.env.APP_VERSION || "1.0.0",
    entorno: process.env.NODE_ENV || "desarrollo",
    hora_servidor_iso: new Date().toISOString(),
    uptime_seg: Math.round(process.uptime())
  });
});

// Monta el router en raíz (tiene rutas con y sin /documentos)
app.use("/", router);

// 404 local
app.use((req, res) => res.status(404).json({ error: "Ruta no encontrada en svc-documentos" }));

const port = process.env.PORT_SVC_DOCUMENTOS || 8081;
app.listen(port, () => console.log(`[svc-documentos] escuchando en ${port}`));
