import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { consultar } from '../../libreria-compartida/src/db.js';
import { logger } from '../../libreria-compartida/src/logger.js';
import { verificarToken, requiereRol } from './middleware.auth.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'tu_secreto_super_seguro_cambiar_en_produccion';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * POST /auth/login
 * Login con correo y contraseña, retorna JWT con roles del usuario
 */
router.post('/login', async (req, res) => {
  try {
    const { correo, contrasena } = req.body;

    if (!correo || !contrasena) {
      return res.status(400).json({
        error: 'Correo y contraseña son requeridos'
      });
    }

    logger.info({ correo }, 'Intento de login');

    // 1. Buscar usuario por correo
    const usuarios = await consultar(
      `SELECT id, correo, contrasena_hash, nombre_completo, activo
       FROM usuarios
       WHERE correo = ? AND activo = 1`,
      [correo]
    );

    if (usuarios.length === 0) {
      logger.warn({ correo }, '❌ Usuario no encontrado o inactivo');
      return res.status(401).json({
        error: 'Credenciales inválidas'
      });
    }

    const usuario = usuarios[0];

    // 2. Verificar contraseña
    const esValida = await bcrypt.compare(contrasena, usuario.contrasena_hash);

    if (!esValida) {
      logger.warn({ correo }, 'Contraseña incorrecta');
      return res.status(401).json({
        error: 'Credenciales inválidas'
      });
    }

    // 3. Obtener roles del usuario
    const roles = await consultar(
      `SELECT r.nombre
       FROM roles r
       JOIN usuario_roles ur ON ur.id_rol = r.id
       WHERE ur.id_usuario = ?`,
      [usuario.id]
    );

    const nombresRoles = roles.map(r => r.nombre);

    // 4. Generar JWT
    const token = jwt.sign(
      {
        id: usuario.id,
        correo: usuario.correo,
        nombre: usuario.nombre_completo,
        roles: nombresRoles
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    logger.info({
      correo,
      roles: nombresRoles
    }, 'Login exitoso');

    res.json({
      exito: true,
      token,
      usuario: {
        id: usuario.id,
        correo: usuario.correo,
        nombre: usuario.nombre_completo,
        roles: nombresRoles
      }
    });

  } catch (err) {
    logger.error({ err }, 'Error en login');
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
});

/**
 * POST /auth/registro
 * Registra un nuevo usuario (solo para testing, en producción usar importación)
 */
router.post('/registro', async (req, res) => {
  try {
    const { correo, contrasena, nombre_completo, roles: rolesInput } = req.body;

    if (!correo || !contrasena || !nombre_completo) {
      return res.status(400).json({
        error: 'Correo, contraseña y nombre son requeridos'
      });
    }

    logger.info({ correo, nombre_completo }, 'Intento de registro');

    // 1. Verificar si el usuario ya existe
    const existente = await consultar(
      'SELECT id FROM usuarios WHERE correo = ?',
      [correo]
    );

    if (existente.length > 0) {
      return res.status(400).json({
        error: 'El correo ya está registrado'
      });
    }

    // 2. Hashear contraseña
    const salt = await bcrypt.genSalt(10);
    const contrasena_hash = await bcrypt.hash(contrasena, salt);

    // 3. Insertar usuario
    const resultado = await consultar(
      `INSERT INTO usuarios (correo, contrasena_hash, nombre_completo, activo)
       VALUES (?, ?, ?, 1)`,
      [correo, contrasena_hash, nombre_completo]
    );

    const usuarioId = resultado.insertId;

    // 4. Asignar roles (por defecto 'DOCENTE' si no se especifica)
    const rolesAsignar = rolesInput && rolesInput.length > 0
      ? rolesInput
      : ['DOCENTE'];

    for (const nombreRol of rolesAsignar) {
      // Obtener ID del rol
      const rolData = await consultar(
        'SELECT id FROM roles WHERE nombre = ?',
        [nombreRol]
      );

      if (rolData.length > 0) {
        await consultar(
          'INSERT INTO usuario_roles (id_usuario, id_rol) VALUES (?, ?)',
          [usuarioId, rolData[0].id]
        );
      } else {
        logger.warn({ nombreRol }, '⚠️ Rol no encontrado, se omite');
      }
    }

    logger.info({
      correo,
      usuarioId,
      roles: rolesAsignar
    }, '✅ Usuario registrado');

    res.status(201).json({
      exito: true,
      mensaje: 'Usuario registrado exitosamente',
      usuario: {
        id: usuarioId,
        correo,
        nombre: nombre_completo,
        roles: rolesAsignar
      }
    });

  } catch (err) {
    logger.error({ err }, '❌ Error en registro');
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
});

/**
 * GET /auth/verificar
 * Verifica si un token JWT es válido y retorna info del usuario
 */
router.get('/verificar', verificarToken, async (req, res) => {
  res.json({
    exito: true,
    usuario: req.usuario
  });
});

/**
 * GET /auth/me
 * Obtiene información completa del usuario autenticado
 */
router.get('/me', verificarToken, async (req, res) => {
  try {
    const { id } = req.usuario;

    // Obtener datos actualizados del usuario
    const usuarios = await consultar(
      `SELECT id, correo, nombre_completo, activo, creado_en
       FROM usuarios
       WHERE id = ?`,
      [id]
    );

    if (usuarios.length === 0) {
      return res.status(404).json({
        error: 'Usuario no encontrado'
      });
    }

    const usuario = usuarios[0];

    // Obtener roles
    const roles = await consultar(
      `SELECT r.id, r.nombre, r.descripcion
       FROM roles r
       JOIN usuario_roles ur ON ur.id_rol = r.id
       WHERE ur.id_usuario = ?`,
      [id]
    );

    res.json({
      exito: true,
      usuario: {
        ...usuario,
        roles
      }
    });

  } catch (err) {
    logger.error({ err }, '❌ Error obteniendo datos de usuario');
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
});

/**
 * Ejemplo de ruta protegida por rol
 * GET /auth/admin-only
 */
router.get('/admin-only',
  verificarToken,
  requiereRol(['ADMIN', 'COORDINADOR']),
  (req, res) => {
    res.json({
      mensaje: 'Acceso permitido solo para administradores o coordinadores',
      usuario: req.usuario
    });
  }
);

export { router as rutasAuth };
