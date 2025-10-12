import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import pino from "pino";
import pinoHttp from "pino-http";
import rutasBusqueda from "./rutas.busqueda.js";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });
const app = express();

app.disable("x-powered-by");
app.set("trust proxy", true);

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({
  origin: true,
  credentials: false,
  methods: ["GET","POST","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"]
}));
app.use(pinoHttp({ logger }));

app.get("/estado", (_req, res) => {
  res.json({ ok: true, servicio: "svc-busqueda", version: "1.0.0", uptime: process.uptime() });
});

// 🔹 Montar el router UNA sola vez
app.use("/", rutasBusqueda);

// 404
app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada en svc-busqueda", ruta: req.originalUrl });
});

// 🔹 Manejador de errores (incluye JSON inválido)
app.use((err, _req, res, _next) => {
  if (err?.type === "entity.parse.failed" || err instanceof SyntaxError) {
    return res.status(400).json({ error: "JSON inválido" });
  }
  return res.status(500).json({ error: "Error interno" });
});

const port = process.env.PORT_SVC_BUSQUEDA || 8083;
app.listen(port, () => logger.info({ port }, "svc-busqueda escuchando"));
