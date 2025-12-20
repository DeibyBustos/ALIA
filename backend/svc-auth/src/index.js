import express from 'express';
import { logger } from '../../libreria-compartida/src/logger.js';
import { rutasAuth } from './rutas.auth.js';

const app = express();
const PORT = process.env.SVC_AUTH_PORT || 8085;

app.use(express.json());

// Ruta de salud
app.get('/health', (req, res) => {
  res.json({ status: 'OK', servicio: 'svc-auth' });
});

// Rutas de autenticación (el gateway ya maneja el prefijo /auth y lo quita)
// Por eso estas rutas están en la raíz, no bajo /auth
app.use('/', rutasAuth);

app.listen(PORT, () => {
  logger.info(`🔐 svc-auth escuchando en http://localhost:${PORT}`);
});
