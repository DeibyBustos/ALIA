import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { createProxyMiddleware } from "http-proxy-middleware";
import pino from "pino";
import pinoHttp from "pino-http";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });
const app = express();

/** ===== Error handlers ===== */
process.on("uncaughtException", (err) => {
  console.error("uncaughtException:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection:", reason);
  process.exit(1);
});

/** ===== CORS ===== */
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5174").split(",");

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV === "development") {
      return callback(null, true);
    }
    return callback(new Error("No permitido por CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  maxAge: 86400
};

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors(corsOptions));
app.use(pinoHttp({ logger }));

/** ===== Proxy factory ===== */
function buildProxy(target) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    proxyTimeout: 30_000,
    timeout: 30_000,
    onError(err, req, res) {
      req.log?.error({ err }, "Error en proxy");
      if (!res.headersSent) {
        res.status(502).json({ error: "Error en proxy del gateway" });
      }
    }
  });
}

/** ===== Hosts de servicios ===== */
const SVC_AUTH_HOST       = process.env.SVC_AUTH_HOST       || "localhost";
const SVC_USUARIOS_HOST   = process.env.SVC_USUARIOS_HOST   || "localhost";
const SVC_DOCUMENTOS_HOST = process.env.SVC_DOCUMENTOS_HOST || "localhost";
const SVC_BUSQUEDA_HOST   = process.env.SVC_BUSQUEDA_HOST   || "localhost";
const SVC_GENERACION_HOST = process.env.SVC_GENERACION_HOST || "localhost";
const SVC_INGESTA_HOST    = process.env.SVC_INGESTA_HOST    || "localhost";

/** ===== Health ===== */
app.get("/estado", (_req, res) => {
  res.json({
    ok: true,
    servicio: "api-gateway",
    servicios: {
      auth:       `http://${SVC_AUTH_HOST}:${process.env.PORT_SVC_AUTH       || 8085}`,
      documentos: `http://${SVC_DOCUMENTOS_HOST}:${process.env.PORT_SVC_DOCUMENTOS || 8081}`,
      busqueda:   `http://${SVC_BUSQUEDA_HOST}:${process.env.PORT_SVC_BUSQUEDA   || 8083}`,
      ingesta:    `http://${SVC_INGESTA_HOST}:${process.env.PORT_SVC_INGESTA    || 8082}`,
      generacion: `http://${SVC_GENERACION_HOST}:${process.env.PORT_SVC_GENERACION || 8084}`,
      usuarios:   `http://${SVC_USUARIOS_HOST}:${process.env.PORT_SVC_USUARIOS   || 8086}`
    }
  });
});

/** ===== Rutas proxied ===== */
app.use("/auth", buildProxy(`http://${SVC_AUTH_HOST}:${process.env.PORT_SVC_AUTH || 8085}`));
app.use("/usuarios", buildProxy(`http://${SVC_USUARIOS_HOST}:${process.env.PORT_SVC_USUARIOS || 8086}`));
app.use("/documentos", createProxyMiddleware({
  target: `http://${SVC_DOCUMENTOS_HOST}:${process.env.PORT_SVC_DOCUMENTOS || 8081}`,
  changeOrigin: true,
  pathRewrite: { "^/": "/documentos/" },
  proxyTimeout: 30_000,
  timeout: 30_000,
  on: {
    proxyReq(proxyReq, req) {
      console.log("[PROXY DOC] originalUrl:", req.originalUrl, "→ path:", proxyReq.path);
    }
  },
  onError(err, req, res) {
    req.log?.error({ err }, "Error en proxy");
    if (!res.headersSent) res.status(502).json({ error: "Error en proxy del gateway" });
  }
}));
app.use("/busqueda",   buildProxy(`http://${SVC_BUSQUEDA_HOST}:${process.env.PORT_SVC_BUSQUEDA   || 8083}`));
app.use("/generacion", buildProxy(`http://${SVC_GENERACION_HOST}:${process.env.PORT_SVC_GENERACION || 8084}`));

/** ===== 404 ===== */
app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada en el gateway", ruta: req.originalUrl });
});

/** ===== Start ===== */
const port = process.env.PORT_API_GATEWAY || 8080;
const server = app.listen(port, () => logger.info({ port }, "api-gateway escuchando"));

server.on("error", (err) => {
  console.error("Error al iniciar servidor:", err);
  process.exit(1);
});