import jwt from 'jsonwebtoken';
import { logger } from '../../libreria-compartida/src/logger.js';

const JWT_SECRET = process.env.JWT_SECRET || 'tu_secreto_super_seguro_cambiar_en_produccion';

/**
 * Middleware para verificar el token JWT
 * Espera el token en el header Authorization: Bearer <token>
 */
export function verificarToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        error: 'Token no proporcionado',
        codigo: 'TOKEN_FALTANTE'
      });
    }

    const partes = authHeader.split(' ');

    if (partes.length !== 2 || partes[0] !== 'Bearer') {
      return res.status(401).json({
        error: 'Formato de token inválido. Use: Bearer <token>',
        codigo: 'FORMATO_INVALIDO'
      });
    }

    const token = partes[1];

    const decoded = jwt.verify(token, JWT_SECRET);

    req.usuario = {
      id: decoded.id,
      correo: decoded.correo,
      nombre: decoded.nombre,
      roles: decoded.roles || []
    };

    logger.debug({
      usuario: decoded.correo,
      roles: decoded.roles
    }, ' Token verificado');

    next();

  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expirado',
        codigo: 'TOKEN_EXPIRADO'
      });
    }

    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Token inválido',
        codigo: 'TOKEN_INVALIDO'
      });
    }

    logger.error({ err }, '❌ Error verificando token');
    return res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
}

/**
 * Middleware para requerir roles específicos
 * Debe usarse después de verificarToken
 *
 * @param {Array<string>} rolesPermitidos 
 * @returns {Function}
 */
export function requiereRol(rolesPermitidos) {
  return (req, res, next) => {
    try {
      if (!req.usuario) {
        return res.status(401).json({
          error: 'Usuario no autenticado'
        });
      }

      const { roles } = req.usuario;

      // Verificar si el usuario tiene al menos uno de los roles permitidos
      const tienePermiso = rolesPermitidos.some(rol =>
        roles.includes(rol)
      );

      if (!tienePermiso) {
        logger.warn({
          usuario: req.usuario.correo,
          rolesUsuario: roles,
          rolesRequeridos: rolesPermitidos
        }, 'Acceso denegado por falta de rol');

        return res.status(403).json({
          error: 'No tienes permisos para acceder a este recurso',
          rolesRequeridos: rolesPermitidos,
          tuRoles: roles
        });
      }

      logger.debug({
        usuario: req.usuario.correo,
        rol: roles.find(r => rolesPermitidos.includes(r))
      }, 'Acceso autorizado');

      next();

    } catch (err) {
      logger.error({ err }, 'Error en verificación de roles');
      return res.status(500).json({
        error: 'Error interno del servidor'
      });
    }
  };
}

/**
 * Middleware opcional para verificar token si existe, pero no requiere
 * Útil para rutas que pueden tener contenido diferente según si hay usuario o no
 */
export function verificarTokenOpcional(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      req.usuario = null;
      return next();
    }

    const partes = authHeader.split(' ');

    if (partes.length !== 2 || partes[0] !== 'Bearer') {
      req.usuario = null;
      return next();
    }

    const token = partes[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    req.usuario = {
      id: decoded.id,
      correo: decoded.correo,
      nombre: decoded.nombre,
      roles: decoded.roles || []
    };

    next();

  } catch (err) {
    req.usuario = null;
    next();
  }
}
