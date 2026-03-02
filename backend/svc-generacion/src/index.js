import "dotenv/config";
import express from "express";
import pino from "pino";
import pinoHttp from "pino-http";
import router from "./rutas.generacion.js";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(pinoHttp({ logger: pino({ level: process.env.LOG_LEVEL || "info" }) }));

// Estado del servicio (usado por el gateway /estado)
app.get("/estado", (_req, res) => {
  res.json({
    servicio: "svc-generacion",
    version: process.env.APP_VERSION || "1.0.0",
    entorno: process.env.NODE_ENV || "desarrollo",
    hora_servidor_iso: new Date().toISOString(),
    uptime_seg: Math.round(process.uptime())
  });
});

// Monta el router en raíz (tiene rutas con y sin /generacion)
app.use("/", router);

// 404 local
app.use((req, res) => res.status(404).json({ error: "Ruta no encontrada en svc-generacion" }));

const port = process.env.PORT_SVC_GENERACION || 8084;
app.listen(port, () => console.log(`[svc-generacion] escuchando en ${port}`));
