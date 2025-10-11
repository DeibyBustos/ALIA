import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { createProxyMiddleware } from "http-proxy-middleware";
import pino from "pino";
import pinoHttp from "pino-http";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });
const app = express();

// Definir los orígenes permitidos
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',');

// Configuración de CORS más específica
const corsOptions = {
  origin: function (origin, callback) {
    // Permitir solicitudes sin origen (como las herramientas de desarrollo)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400 // 24 horas
};

// Middlewares de seguridad, CORS, parsing y logging

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));
app.use(pinoHttp({ logger }));

// Función para crear un proxy con configuración común y manejo de errores

function buildProxy(target) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    proxyTimeout: 15_000,
    timeout: 15_000,
    onError(err, req, res) {
      req.log?.error({ err }, "Error en proxy");
      if (!res.headersSent) {
        res.status(502).json({ error: "Error en proxy del gateway" });
      }
    }
  });
}

// Determina si el servicio está activo y muestra las URLs de los servicios conectados

app.get("/estado", (req, res) => {
  res.json({
    ok: true,
    servicio: "api-gateway",
    servicios: {
      documentos: `http://localhost:${process.env.PORT_SVC_DOCUMENTOS || 8081}`,
      busqueda:   `http://localhost:${process.env.PORT_SVC_BUSQUEDA  || 8083}`,
      ingesta:    `http://localhost:${process.env.PORT_SVC_INGESTA   || 8082}`
    }
  });
});

app.use("/documentos", buildProxy(`http://localhost:${process.env.PORT_SVC_DOCUMENTOS || 8081}`));
app.use("/busqueda",  buildProxy(`http://localhost:${process.env.PORT_SVC_BUSQUEDA  || 8083}`));

app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada en el gateway", ruta: req.originalUrl });
});


const port = process.env.PORT_API_GATEWAY || 8080;
app.listen(port, () => logger.info({ port }, "api-gateway escuchando"));
