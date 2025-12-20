import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { createProxyMiddleware } from "http-proxy-middleware";
import pino from "pino";
import pinoHttp from "pino-http";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });
const app = express();

/** ===== CORS ===== */
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5174").split(",");

const corsOptions = {
  origin(origin, callback) {
    // Permite herramientas sin origen (curl, Postman, file:// etc.)
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

/** ===== Middlewares globales (Opción B) =====
 * Importante: NO parsear JSON antes de los proxies.
 */
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors(corsOptions));
// ❌ No uses app.options("(.*)", ...) en Express 5 (rompe path-to-regexp).
// El middleware de cors arriba ya maneja OPTIONS por defecto.
app.use(pinoHttp({ logger }));

/** ===== Proxy factory (sin reinyectar body) ===== */
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

/** ===== Health ===== */
app.get("/estado", (_req, res) => {
  res.json({
    ok: true,
    servicio: "api-gateway",
    servicios: {
      auth:       `http://localhost:${process.env.PORT_SVC_AUTH       || 8085}`,
      documentos: `http://localhost:${process.env.PORT_SVC_DOCUMENTOS || 8081}`,
      busqueda:   `http://localhost:${process.env.PORT_SVC_BUSQUEDA  || 8083}`,
      ingesta:    `http://localhost:${process.env.PORT_SVC_INGESTA   || 8082}`,
      generacion: `http://localhost:${process.env.PORT_SVC_GENERACION || 8084}`
    }
  });
});

/** ===== Rutas proxied ===== */
app.use("/auth", buildProxy(`http://localhost:${process.env.PORT_SVC_AUTH || 8085}`));

app.use("/documentos", buildProxy(`http://localhost:${process.env.PORT_SVC_DOCUMENTOS || 8081}`));
app.use("/busqueda",  buildProxy(`http://localhost:${process.env.PORT_SVC_BUSQUEDA  || 8083}`));
app.use("/generacion", buildProxy(`http://localhost:${process.env.PORT_SVC_GENERACION || 8084}`));

/** 
 * app.use(express.json({ limit: "1mb" }));
 * app.post("/algo-propio", (req,res)=>{ ... });
 */

/** ===== 404 ===== */
app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada en el gateway", ruta: req.originalUrl });
});

/** ===== Start ===== */
const port = process.env.PORT_API_GATEWAY || 8080;
app.listen(port, () => logger.info({ port }, "api-gateway escuchando"));
