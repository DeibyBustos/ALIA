/**
 * Configuración de logs usando Pino
 * Permite registrar mensajes con diferentes niveles (debug, info, warn, error)
 * El nivel por defecto es "info" si no se define LOG_LEVEL
 */
import pino from "pino";
export const logger = pino({ level: process.env.LOG_LEVEL || "info" });
