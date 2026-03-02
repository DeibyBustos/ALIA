import express from 'express';
import { logger } from '../../libreria-compartida/src/logger.js';
import { rutasAuth } from './rutas.auth.js';

const app = express();
const PORT = process.env.SVC_AUTH_PORT || 8085;

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'OK', servicio: 'svc-auth' });
});

app.use('/', rutasAuth);

app.listen(PORT, () => {
  logger.info(`svc-auth escuchando en http://localhost:${PORT}`);
});
