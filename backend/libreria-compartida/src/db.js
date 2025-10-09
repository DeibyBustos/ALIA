import "dotenv/config";
import mysql from "mysql2/promise";
import { logger } from "./logger.js";

// Configuración del pool de conexiones a la base de datos MySQL

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: +process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: +process.env.DB_CONN_LIMIT || 10,
  charset: "utf8mb4"
});

/**
 * Realiza consultas SELECT a la base de datos
 * @param {string} sql - Query SQL a ejecutar
 * @param {Array} params - Parámetros para la consulta
 * @returns {Promise<Array>} Filas resultantes
 */


export async function consultar(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/**
 * Ejecuta consultas INSERT/UPDATE/DELETE en la base de datos
 * @param {string} sql - Query SQL a ejecutar
 * @param {Array} params - Parámetros para la consulta
 * @returns {Promise<Object>} Resultado de la operación
 */

export async function ejecutar(sql, params = []) {
  const [res] = await pool.execute(sql, params);
  return res;
}

// Prueba inicial de conexión al pool

pool.getConnection().then(c => {
  logger.info("core-comun/db: pool conectado");
  c.release();
}).catch(err => logger.warn({ err }, "core-comun/db: no se pudo validar el pool"));
