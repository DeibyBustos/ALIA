import { consultar, ejecutar } from '../../../libreria-compartida/src/db.js';
import { logger } from '../../../libreria-compartida/src/logger.js';

/**
 * Gestiona el contexto de la conversación
 */
export class ContextoManager {
  constructor(idConversacion) {
    this.idConversacion = idConversacion;
    this.contexto = {};
  }

  /**
   * Inicializa el contexto desde la base de datos
   */
  async cargarContexto() {
    if (!this.idConversacion) return;

    const [conversacion] = await consultar(`
      SELECT contexto_inicial FROM conversaciones WHERE id = ?
    `, [this.idConversacion]);

    if (conversacion && conversacion.contexto_inicial) {
      this.contexto = typeof conversacion.contexto_inicial === 'string'
        ? JSON.parse(conversacion.contexto_inicial)
        : conversacion.contexto_inicial || {};
    }
  }

  /**
   * Guarda información relevante en el contexto
   */
  actualizarContexto(clave, valor) {
    this.contexto[clave] = valor;
  }

  /**
   * Obtiene información del contexto
   */
  obtenerContexto(clave) {
    return this.contexto[clave];
  }

  /**
   * Genera un resumen del contexto para el prompt de IA
   */
  generarResumenContexto() {
    if (Object.keys(this.contexto).length === 0) {
      return 'No hay contexto previo.';
    }

    let resumen = 'Contexto de la conversación:\n';
    for (const [clave, valor] of Object.entries(this.contexto)) {
      resumen += `- ${clave}: ${JSON.stringify(valor)}\n`;
    }

    return resumen;
  }

  /**
   * Persiste el contexto en la base de datos
   */
  async guardarContexto() {
    if (!this.idConversacion) return;

    await ejecutar(`
      UPDATE conversaciones
      SET contexto_inicial = ?
      WHERE id = ?
    `, [JSON.stringify(this.contexto), this.idConversacion]);
  }

  /**
   * Obtiene el historial de mensajes
   */
  async obtenerHistorial(limite = 10) {
    if (!this.idConversacion) return [];

    const mensajes = await consultar(`
      SELECT rol, contenido, creado_en
      FROM mensajes_conversacion
      WHERE id_conversacion = ?
      ORDER BY creado_en DESC
      LIMIT ?
    `, [this.idConversacion, limite]);

    return mensajes.reverse();
  }
}