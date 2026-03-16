import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import pino from "pino";
import pinoHttp from "pino-http";
import { MailtrapClient } from "mailtrap";
import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { consultar, ejecutar } from "../../libreria-compartida/src/db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logoBase64 = fs.readFileSync(
  path.join(__dirname, "../assets/Logo_WMS.png")
).toString("base64");

const app    = express();
const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const PORT = Number(process.env.PORT_SVC_USUARIOS || 8086);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5174")
  .split(",")
  .map(o => o.trim())
  .filter(Boolean);

// ─── Config OTP ───────────────────────────────────────────────────────────────
const OTP_EXPIRA_MIN    = parseInt(process.env.OTP_EXPIRA_MINUTOS    || "10", 10);
const OTP_MAX_INTENTOS  = parseInt(process.env.OTP_MAX_INTENTOS      || "3",  10);
const OTP_MAX_REENVIOS  = parseInt(process.env.OTP_MAX_REENVIOS      || "3",  10);
const OTP_COOLDOWN_SEGS = parseInt(process.env.OTP_COOLDOWN_SEGUNDOS || "60", 10);

function contactoAdmins() {
  return {
    email:    process.env.ADMIN_CONTACTO_EMAIL    || "soporte@institucion.edu",
    telefono: process.env.ADMIN_CONTACTO_TELEFONO || "No disponible",
    horario:  process.env.ADMIN_CONTACTO_HORARIO  || "Lunes a Viernes, 8am – 5pm",
  };
}

// ─── Middlewares ──────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV === "desarrollo") {
      return callback(null, true);
    }
    return callback(new Error("No permitido por CORS"));
  },
  credentials: true
}));
app.use(express.json({ limit: "1mb" }));
app.use(pinoHttp({ logger }));

// ─── Mailtrap ─────────────────────────────────────────────────────────────────
const mailtrapClient = new MailtrapClient({
  token: process.env.MAILTRAP_API_TOKEN
});

async function enviarCorreoUsuarioCreado({ nombre, email }) {
  return mailtrapClient.send({
    from: {
      email: process.env.MAIL_FROM_EMAIL || "hello@aliaoficial.com",
      name:  process.env.MAIL_FROM_NAME  || "ALIA Notificaciones"
    },
    to: [{ email }],
    subject: "Usuario creado exitosamente",
    text: `Hola ${nombre}, ¡bienvenido/a! Tu cuenta ha sido creada exitosamente. Ya puedes iniciar sesión en la plataforma.`,
    attachments: [{
      filename:    "Logo_WMS.png",
      content:     logoBase64,
      type:        "image/png",
      disposition: "inline",
      content_id:  "logo_wms"
    }],
    html: `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8" />
      <style>
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background-color: #f4f4f0; font-family: 'DM Sans', sans-serif; padding: 40px 16px; }
        .wrapper { max-width: 520px; margin: 0 auto; }
        .card { background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 20px rgba(0,0,0,0.07); }
        .header { background: #0f1117; padding: 36px 40px; }
        .header img { width: 140px; display: block; margin-bottom: 20px; }
        .header h1 { color: #ffffff; font-size: 22px; font-weight: 600; }
        .header p { color: #8a8f9e; font-size: 13px; margin-top: 4px; }
        .body { padding: 36px 40px; }
        .greeting { font-size: 17px; color: #1a1a2e; font-weight: 500; margin-bottom: 12px; }
        .message { font-size: 14px; color: #555; line-height: 1.7; margin-bottom: 28px; }
        .footer { padding: 20px 40px; border-top: 1px solid #f0f0ec; text-align: center; }
        .footer p { font-size: 12px; color: #bbb; line-height: 1.6; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="card">
          <div class="header">
            <img src="cid:logo_wms" alt="Logo WMS" />
            <h1>¡Tu cuenta está lista!</h1>
            <p>Registro completado exitosamente</p>
          </div>
          <div class="body">
            <p class="greeting">Hola, ${nombre} 👋</p>
            <p class="message">
              Te damos la bienvenida a la plataforma. Tu cuenta ha sido creada correctamente
              y ya puedes comenzar a usar todos los recursos disponibles.
            </p>
          </div>
          <div class="footer">
            <p>Este es un correo automático, por favor no respondas a este mensaje.<br/>
            Si no creaste esta cuenta, ignora este correo.</p>
          </div>
        </div>
      </div>
    </body>
    </html>`,
    category: "usuarios"
  });
}

async function enviarCorreoOTP({ nombre, email, otp }) {
  return mailtrapClient.send({
    from: {
      email: process.env.MAIL_FROM_EMAIL || "hello@aliaoficial.com",
      name:  process.env.MAIL_FROM_NAME  || "ALIA Notificaciones"
    },
    to: [{ email }],
    subject: `Tu código de verificación: ${otp}`,
    text: `Hola ${nombre}, tu código para restablecer la contraseña es: ${otp}. Válido por ${OTP_EXPIRA_MIN} minutos.`,
    attachments: [{
      filename:    "Logo_WMS.png",
      content:     logoBase64,
      type:        "image/png",
      disposition: "inline",
      content_id:  "logo_wms"
    }],
    html: `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8"/>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background-color: #f4f4f0; font-family: 'DM Sans', sans-serif; padding: 40px 16px; }
        .wrapper { max-width: 520px; margin: 0 auto; }
        .card { background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 20px rgba(0,0,0,0.07); }
        .header { background: #0f1117; padding: 36px 40px; }
        .header img { width: 140px; display: block; margin-bottom: 20px; }
        .header h1 { color: #ffffff; font-size: 22px; font-weight: 600; }
        .header p { color: #8a8f9e; font-size: 13px; margin-top: 4px; }
        .body { padding: 36px 40px; }
        .greeting { font-size: 17px; color: #1a1a2e; font-weight: 500; margin-bottom: 12px; }
        .message { font-size: 14px; color: #555; line-height: 1.7; margin-bottom: 28px; }
        .otp-box { background: #f0f4ff; border: 2px dashed #3b6fd4; border-radius: 10px;
                   padding: 24px; text-align: center; margin-bottom: 24px; }
        .otp-code { font-size: 44px; font-weight: 700; letter-spacing: 14px;
                    color: #0f1117; font-family: monospace; }
        .expira { font-size: 13px; color: #888; text-align: center; margin-bottom: 24px; }
        .aviso { font-size: 13px; color: #aaa; line-height: 1.6; }
        .footer { padding: 20px 40px; border-top: 1px solid #f0f0ec; text-align: center; }
        .footer p { font-size: 12px; color: #bbb; line-height: 1.6; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="card">
          <div class="header">
            <img src="cid:logo_wms" alt="Logo WMS"/>
            <h1>Restablecer contraseña</h1>
            <p>Código de verificación único</p>
          </div>
          <div class="body">
            <p class="greeting">Hola, ${nombre} 👋</p>
            <p class="message">
              Recibimos una solicitud para restablecer la contraseña de tu cuenta.
              Usa el siguiente código para continuar:
            </p>
            <div class="otp-box">
              <span class="otp-code">${otp}</span>
            </div>
            <p class="expira">⏱ Este código expira en <strong>${OTP_EXPIRA_MIN} minutos</strong>.</p>
            <p class="aviso">
              Si no solicitaste este cambio, ignora este correo.<br/>
              Por seguridad, <strong>nunca compartas este código</strong> con nadie.
            </p>
          </div>
          <div class="footer">
            <p>Correo automático — por favor no respondas a este mensaje.</p>
          </div>
        </div>
      </div>
    </body>
    </html>`,
    category: "password-reset"
  });
}

// ─── Helpers OTP ──────────────────────────────────────────────────────────────
async function generarOTP() {
  const bytes  = crypto.randomBytes(4);
  const numero = bytes.readUInt32BE(0) % 1_000_000;
  const otp    = String(numero).padStart(6, "0");
  const hash   = await bcrypt.hash(otp, 10);
  return { otp, hash };
}

function toMysqlDatetime(date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

// ─── Health ───────────────────────────────────────────────────────────────────
app.get("/estado", async (_req, res) => {
  try {
    await consultar("SELECT 1 AS ok");
    res.json({ ok: true, servicio: "svc-usuarios", db: "ok" });
  } catch (e) {
    res.status(500).json({ ok: false, servicio: "svc-usuarios", db: "error" });
  }
});

// ─── Crear usuario ────────────────────────────────────────────────────────────
app.post(["/", "/usuarios"], async (req, res) => {
  try {
    const { nombre, email, password, rol } = req.body ?? {};

    if (!nombre || typeof nombre !== "string" || nombre.trim().length < 2) {
      return res.status(400).json({ error: "El nombre es obligatorio y debe tener al menos 2 caracteres" });
    }
    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "El email es obligatorio y debe tener formato válido" });
    }
    if (!password || typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ error: "La contraseña es obligatoria y debe tener al menos 8 caracteres" });
    }

    const emailNormalizado  = email.trim().toLowerCase();
    const nombreNormalizado = nombre.trim();

    const existe = await consultar(
      `SELECT id FROM usuarios WHERE LOWER(correo) = LOWER(?) LIMIT 1`,
      [emailNormalizado]
    );
    if (existe.length > 0) {
      return res.status(409).json({ error: "Ya existe un usuario con ese correo" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const insertRes = await ejecutar(
      `INSERT INTO usuarios (correo, contrasena_hash, nombre_completo, activo) VALUES (?, ?, ?, ?)`,
      [emailNormalizado, passwordHash, nombreNormalizado, 1]
    );

    const rows = await consultar(
      `SELECT id, correo, nombre_completo, activo, creado_en FROM usuarios WHERE id = ? LIMIT 1`,
      [insertRes.insertId]
    );

    const rolRow = await consultar(`SELECT id FROM roles WHERE nombre = ? LIMIT 1`, [rol]);
    if (!rolRow.length) {
      return res.status(400).json({ error: "Rol inválido" });
    }

    await ejecutar(
      `INSERT INTO usuario_roles (id_usuario, id_rol) VALUES (?, ?)`,
      [insertRes.insertId, rolRow[0].id]
    );

    const row         = rows[0];
    const dataUsuario = {
      id:       row.id,
      nombre:   row.nombre_completo,
      email:    row.correo,
      activo:   !!row.activo,
      creadoEn: row.creado_en
    };

    try {
      const info = await enviarCorreoUsuarioCreado({ nombre: dataUsuario.nombre, email: dataUsuario.email });
      return res.status(201).json({ ok: true, usuario: dataUsuario, correo: { enviado: true, detalle: info } });
    } catch (mailErr) {
      req.log?.error({ err: mailErr }, "Usuario creado pero falló envío de correo");
      return res.status(201).json({ ok: true, usuario: dataUsuario, warning: "Usuario creado, pero no se pudo enviar el correo" });
    }

  } catch (err) {
    req.log?.error({ err }, "Error creando usuario");
    return res.status(500).json({ error: "Error interno del servicio de usuarios" });
  }
});

// ─── Listar usuarios ──────────────────────────────────────────────────────────
app.get(["/", "/usuarios"], async (_req, res) => {
  try {
    const rows = await consultar(`
      SELECT id, correo, nombre_completo, activo, creado_en
      FROM usuarios ORDER BY id DESC
    `);
    const data = rows.map(r => ({
      id:       r.id,
      nombre:   r.nombre_completo,
      email:    r.correo,
      activo:   !!r.activo,
      creadoEn: r.creado_en
    }));
    res.json({ ok: true, total: data.length, data });
  } catch (err) {
    logger.error({ err }, "Error listando usuarios");
    res.status(500).json({ error: "Error consultando usuarios" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  CAMBIO DE CONTRASEÑA CON OTP
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /usuarios/contrasena/solicitar
 * Genera un OTP y lo envía al correo del usuario.
 * Body: { correo }
 */
app.post("/contrasena/solicitar", async (req, res) => {
  try {
    const { correo } = req.body ?? {};

    if (!correo) {
      return res.status(400).json({ error: "El campo correo es requerido." });
    }

    const correoNorm = correo.trim().toLowerCase();

    // Respuesta genérica — no revelar si el correo existe
    const usuarios = await consultar(
      "SELECT id, nombre_completo FROM usuarios WHERE correo = ? AND activo = 1 LIMIT 1",
      [correoNorm]
    );
    if (!usuarios.length) {
      return res.json({ ok: true, mensaje: "Si el correo está registrado, recibirás el código." });
    }

    const usuario = usuarios[0];

    // Invalidar OTPs anteriores activos
    await ejecutar(
      "UPDATE recuperaciones_contrasena SET usado = 1 WHERE id_usuario = ? AND usado = 0",
      [usuario.id]
    );

    const { otp, hash } = await generarOTP();
    const expira        = toMysqlDatetime(new Date(Date.now() + OTP_EXPIRA_MIN * 60 * 1000));

    await ejecutar(
      "INSERT INTO recuperaciones_contrasena (id_usuario, otp_hash, expira_en, ip) VALUES (?, ?, ?, ?)",
      [usuario.id, hash, expira, req.ip || null]
    );

    try {
      await enviarCorreoOTP({ nombre: usuario.nombre_completo, email: correoNorm, otp });
    } catch (mailErr) {
      req.log?.error({ err: mailErr }, "Error enviando OTP");
      return res.status(500).json({
        error:         "No se pudo enviar el correo. Intenta nuevamente o contacta a los administradores.",
        contactoAdmin: contactoAdmins(),
      });
    }

    logger.info({ correo: correoNorm }, "OTP enviado");
    return res.json({
      ok:                true,
      mensaje:           "Código enviado. Revisa tu correo.",
      correo:            correoNorm.replace(/(.{2})(.*)(@.*)/, "$1***$3"),
      reenviosRestantes: OTP_MAX_REENVIOS,
    });

  } catch (err) {
    req.log?.error({ err }, "Error en contrasena/solicitar");
    return res.status(500).json({ error: "Error interno del servicio de usuarios" });
  }
});

/**
 * POST /usuarios/contrasena/reenviar
 * Reenvía el OTP. Si se agotaron los reenvíos devuelve el contacto de los admins.
 * Body: { correo }
 */
app.post("/contrasena/reenviar", async (req, res) => {
  try {
    const { correo } = req.body ?? {};

    if (!correo) {
      return res.status(400).json({ error: "El campo correo es requerido." });
    }

    const correoNorm = correo.trim().toLowerCase();

    const usuarios = await consultar(
      "SELECT id, nombre_completo FROM usuarios WHERE correo = ? AND activo = 1 LIMIT 1",
      [correoNorm]
    );
    if (!usuarios.length) {
      return res.json({ ok: true, mensaje: "Si el correo está registrado, recibirás el código." });
    }

    const usuario = usuarios[0];

    const otps = await consultar(
      `SELECT * FROM recuperaciones_contrasena
        WHERE id_usuario = ? AND usado = 0
        ORDER BY creado_en DESC LIMIT 1`,
      [usuario.id]
    );

    const otpActual        = otps[0] ?? null;
    const reenviosActuales = otpActual ? otpActual.reenvios : OTP_MAX_REENVIOS;

    // ── Límite de reenvíos alcanzado ──────────────────────────────────────────
    if (reenviosActuales >= OTP_MAX_REENVIOS) {
      logger.warn({ correo: correoNorm }, "Límite de reenvíos OTP alcanzado");
      return res.status(429).json({
        ok:             false,
        limitAlcanzado: true,
        mensaje:        "Has alcanzado el límite de reenvíos. Contacta a los administradores de la institución.",
        contactoAdmin:  contactoAdmins(),
      });
    }

    // ── Cooldown entre reenvíos ───────────────────────────────────────────────
    if (otpActual) {
      const segundosDesde = (Date.now() - new Date(otpActual.creado_en).getTime()) / 1000;
      if (segundosDesde < OTP_COOLDOWN_SEGS) {
        const espera = Math.ceil(OTP_COOLDOWN_SEGS - segundosDesde);
        return res.status(429).json({
          ok:             false,
          mensaje:        `Espera ${espera} segundo(s) antes de solicitar otro código.`,
          esperaSegundos: espera,
        });
      }
      await ejecutar("UPDATE recuperaciones_contrasena SET usado = 1 WHERE id = ?", [otpActual.id]);
    }

    const { otp, hash }  = await generarOTP();
    const nuevosReenvios = reenviosActuales + 1;
    const expira         = toMysqlDatetime(new Date(Date.now() + OTP_EXPIRA_MIN * 60 * 1000));

    await ejecutar(
      "INSERT INTO recuperaciones_contrasena (id_usuario, otp_hash, reenvios, expira_en, ip) VALUES (?, ?, ?, ?, ?)",
      [usuario.id, hash, nuevosReenvios, expira, req.ip || null]
    );

    try {
      await enviarCorreoOTP({ nombre: usuario.nombre_completo, email: correoNorm, otp });
    } catch (mailErr) {
      req.log?.error({ err: mailErr }, "Error reenviando OTP");
      if (nuevosReenvios >= OTP_MAX_REENVIOS) {
        return res.status(500).json({
          ok:             false,
          limitAlcanzado: true,
          mensaje:        "No se pudo enviar el correo y has agotado los reintentos. Contacta a los administradores.",
          contactoAdmin:  contactoAdmins(),
        });
      }
      return res.status(500).json({
        ok:                false,
        mensaje:           "No se pudo enviar el correo. Intenta de nuevo.",
        reenviosRestantes: OTP_MAX_REENVIOS - nuevosReenvios,
      });
    }

    const reenviosRestantes = OTP_MAX_REENVIOS - nuevosReenvios;
    const esUltimo          = reenviosRestantes === 0;

    logger.info({ correo: correoNorm, nuevosReenvios }, "OTP reenviado");
    return res.json({
      ok:                true,
      correo:            correoNorm.replace(/(.{2})(.*)(@.*)/, "$1***$3"),
      mensaje:           esUltimo
        ? "Código reenviado. Este era tu último reenvío disponible."
        : `Código reenviado. Te quedan ${reenviosRestantes} reenvío(s).`,
      reenviosRestantes,
      ...(esUltimo && { contactoAdmin: contactoAdmins() }),
    });

  } catch (err) {
    req.log?.error({ err }, "Error en contrasena/reenviar");
    return res.status(500).json({ error: "Error interno del servicio de usuarios" });
  }
});

/**
 * POST /usuarios/contrasena/verificar
 * Valida el OTP. Si es correcto devuelve un resetToken de un solo uso (15 min).
 * Body: { correo, otp }
 */
app.post("/contrasena/verificar", async (req, res) => {
  try {
    const { correo, otp } = req.body ?? {};

    if (!correo || !otp) {
      return res.status(400).json({ error: "Se requieren correo y otp." });
    }

    const correoNorm = correo.trim().toLowerCase();

    const otps = await consultar(
      `SELECT o.*
         FROM recuperaciones_contrasena o
         JOIN usuarios u ON u.id = o.id_usuario
        WHERE u.correo = ?
          AND o.usado = 0
          AND o.expira_en > NOW()
        ORDER BY o.creado_en DESC LIMIT 1`,
      [correoNorm]
    );

    if (!otps.length) {
      return res.status(400).json({
        ok:    false,
        error: "No hay un código activo o ya expiró. Solicita uno nuevo.",
      });
    }

    const registro = otps[0];

    if (registro.intentos >= OTP_MAX_INTENTOS) {
      await ejecutar("UPDATE recuperaciones_contrasena SET usado = 1 WHERE id = ?", [registro.id]);
      return res.status(400).json({
        ok:                   false,
        error:                "Demasiados intentos fallidos. Solicita un código nuevo.",
        maxIntentosAlcanzado: true,
      });
    }

    const esValido = await bcrypt.compare(otp.trim(), registro.otp_hash);

    if (!esValido) {
      await ejecutar(
        "UPDATE recuperaciones_contrasena SET intentos = intentos + 1 WHERE id = ?",
        [registro.id]
      );
      const restantes = OTP_MAX_INTENTOS - (registro.intentos + 1);
      logger.warn({ correo: correoNorm }, "OTP incorrecto");
      return res.status(400).json({
        ok:                false,
        error:             `Código incorrecto. ${restantes} intento(s) restante(s).`,
        intentosRestantes: restantes,
      });
    }

    // OTP correcto → resetToken de un solo uso, válido 15 min
    const resetToken     = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = await bcrypt.hash(resetToken, 10);
    const tokenExp       = toMysqlDatetime(new Date(Date.now() + 15 * 60 * 1000));

    await ejecutar("UPDATE recuperaciones_contrasena SET usado = 1 WHERE id = ?", [registro.id]);
    await ejecutar(
      "UPDATE usuarios SET token_recuperacion = ?, token_recuperacion_exp = ? WHERE id = ?",
      [resetTokenHash, tokenExp, registro.id_usuario]
    );

    logger.info({ correo: correoNorm }, "OTP verificado — resetToken generado");
    return res.json({
      ok:         true,
      mensaje:    "Código verificado. Procede a establecer tu nueva contraseña.",
      resetToken, // ← usar UNA sola vez en /cambiar
    });

  } catch (err) {
    req.log?.error({ err }, "Error en contrasena/verificar");
    return res.status(500).json({ error: "Error interno del servicio de usuarios" });
  }
});

/**
 * POST /usuarios/contrasena/cambiar
 * Cambia la contraseña usando el resetToken obtenido en /verificar.
 * Body: { correo, resetToken, nuevaContrasena, confirmarContrasena }
 */
app.post("/contrasena/cambiar", async (req, res) => {
  try {
    const { correo, resetToken, nuevaContrasena, confirmarContrasena } = req.body ?? {};

    if (!correo || !resetToken || !nuevaContrasena || !confirmarContrasena) {
      return res.status(400).json({
        error: "Se requieren: correo, resetToken, nuevaContrasena y confirmarContrasena.",
      });
    }
    if (nuevaContrasena !== confirmarContrasena) {
      return res.status(422).json({ error: "Las contraseñas no coinciden." });
    }
    if (nuevaContrasena.length < 8) {
      return res.status(422).json({ error: "La contraseña debe tener al menos 8 caracteres." });
    }

    const correoNorm = correo.trim().toLowerCase();

    const usuarios = await consultar(
      `SELECT id, token_recuperacion
         FROM usuarios
        WHERE correo = ?
          AND token_recuperacion IS NOT NULL
          AND token_recuperacion_exp > NOW()
        LIMIT 1`,
      [correoNorm]
    );

    if (!usuarios.length) {
      return res.status(400).json({ error: "El enlace expiró o ya fue usado. Solicita un nuevo código." });
    }

    const usuario     = usuarios[0];
    const tokenValido = await bcrypt.compare(resetToken, usuario.token_recuperacion);

    if (!tokenValido) {
      return res.status(400).json({ error: "Token inválido." });
    }

    const contrasenaHash = await bcrypt.hash(nuevaContrasena, 10);

    await ejecutar(
      `UPDATE usuarios
          SET contrasena_hash = ?,
              token_recuperacion     = NULL,
              token_recuperacion_exp = NULL
        WHERE id = ?`,
      [contrasenaHash, usuario.id]
    );

    logger.info({ correo: correoNorm }, "Contraseña actualizada correctamente");
    return res.json({ ok: true, mensaje: "Contraseña actualizada correctamente." });

  } catch (err) {
    req.log?.error({ err }, "Error en contrasena/cambiar");
    return res.status(500).json({ error: "Error interno del servicio de usuarios" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  CAMBIO DE CONTRASEÑA AUTENTICADO (desde configuración)
//  Requiere JWT válido en Authorization: Bearer <token>
// ══════════════════════════════════════════════════════════════════════════════

// Middleware liviano para verificar JWT localmente

function verificarJWT(req, res, next) {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Token no proporcionado." });
    }
    const decoded = jwt.verify(
      auth.split(" ")[1],
      process.env.JWT_SECRET || "tu_secreto_super_seguro_cambiar_en_produccion"
    );
    req.usuarioJWT = decoded;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Sesión expirada.", codigo: "TOKEN_EXPIRADO" });
    }
    return res.status(401).json({ error: "Token inválido.", codigo: "TOKEN_INVALIDO" });
  }
}

/**
 * POST /contrasena/cambio/verificar-actual
 * Verifica la contraseña actual del usuario logueado y envía OTP a su correo.
 * Headers: Authorization: Bearer <token>
 * Body: { contrasenaActual }
 */
app.post("/contrasena/cambio/verificar-actual", verificarJWT, async (req, res) => {
  try {
    const { contrasenaActual } = req.body ?? {};

    if (!contrasenaActual) {
      return res.status(400).json({ error: "La contraseña actual es requerida." });
    }

    // Obtener usuario completo desde BD con el id del JWT
    const usuarios = await consultar(
      "SELECT id, correo, nombre_completo, contrasena_hash FROM usuarios WHERE id = ? AND activo = 1 LIMIT 1",
      [req.usuarioJWT.id]
    );

    if (!usuarios.length) {
      return res.status(404).json({ error: "Usuario no encontrado." });
    }

    const usuario = usuarios[0];

    // Verificar contraseña actual
    const esValida = await bcrypt.compare(contrasenaActual, usuario.contrasena_hash);
    if (!esValida) {
      return res.status(400).json({ error: "La contraseña actual es incorrecta." });
    }

    // Invalidar OTPs anteriores activos
    await ejecutar(
      "UPDATE recuperaciones_contrasena SET usado = 1 WHERE id_usuario = ? AND usado = 0",
      [usuario.id]
    );

    // Generar y enviar OTP
    const { otp, hash } = await generarOTP();
    const expira        = toMysqlDatetime(new Date(Date.now() + OTP_EXPIRA_MIN * 60 * 1000));

    await ejecutar(
      "INSERT INTO recuperaciones_contrasena (id_usuario, otp_hash, expira_en, ip) VALUES (?, ?, ?, ?)",
      [usuario.id, hash, expira, req.ip || null]
    );

    try {
      await enviarCorreoOTP({ nombre: usuario.nombre_completo, email: usuario.correo, otp });
    } catch (mailErr) {
      req.log?.error({ err: mailErr }, "Error enviando OTP de cambio autenticado");
      return res.status(500).json({
        error:         "No se pudo enviar el código. Intenta nuevamente o contacta a los administradores.",
        contactoAdmin: contactoAdmins(),
      });
    }

    logger.info({ id: usuario.id }, "OTP de cambio autenticado enviado");
    return res.json({
      ok:      true,
      mensaje: "Código enviado a tu correo registrado.",
      correo:  usuario.correo.replace(/(.{2})(.*)(@.*)/, "$1***$3"), // ej: de***@gmail.com
    });

  } catch (err) {
    req.log?.error({ err }, "Error en contrasena/cambio/verificar-actual");
    return res.status(500).json({ error: "Error interno del servicio de usuarios" });
  }
});

/**
 * POST /contrasena/cambio/verificar-otp
 * Verifica el OTP. Si es correcto devuelve un resetToken de un solo uso (15 min).
 * Headers: Authorization: Bearer <token>
 * Body: { otp }
 */
app.post("/contrasena/cambio/verificar-otp", verificarJWT, async (req, res) => {
  try {
    const { otp } = req.body ?? {};

    if (!otp) {
      return res.status(400).json({ error: "El código OTP es requerido." });
    }

    // Buscar OTP activo por id de usuario (no por correo, ya tenemos el JWT)
    const otps = await consultar(
      `SELECT * FROM recuperaciones_contrasena
        WHERE id_usuario = ? AND usado = 0 AND expira_en > NOW()
        ORDER BY creado_en DESC LIMIT 1`,
      [req.usuarioJWT.id]
    );

    if (!otps.length) {
      return res.status(400).json({
        ok:    false,
        error: "No hay un código activo o ya expiró. Solicita uno nuevo.",
      });
    }

    const registro = otps[0];

    if (registro.intentos >= OTP_MAX_INTENTOS) {
      await ejecutar("UPDATE recuperaciones_contrasena SET usado = 1 WHERE id = ?", [registro.id]);
      return res.status(400).json({
        ok:                   false,
        error:                "Demasiados intentos fallidos. Solicita un código nuevo.",
        maxIntentosAlcanzado: true,
      });
    }

    const esValido = await bcrypt.compare(otp.trim(), registro.otp_hash);

    if (!esValido) {
      await ejecutar(
        "UPDATE recuperaciones_contrasena SET intentos = intentos + 1 WHERE id = ?",
        [registro.id]
      );
      const restantes = OTP_MAX_INTENTOS - (registro.intentos + 1);
      return res.status(400).json({
        ok:                false,
        error:             `Código incorrecto. ${restantes} intento(s) restante(s).`,
        intentosRestantes: restantes,
      });
    }

    // OTP correcto → resetToken de un solo uso
    const resetToken     = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = await bcrypt.hash(resetToken, 10);
    const tokenExp       = toMysqlDatetime(new Date(Date.now() + 15 * 60 * 1000));

    await ejecutar("UPDATE recuperaciones_contrasena SET usado = 1 WHERE id = ?", [registro.id]);
    await ejecutar(
      "UPDATE usuarios SET token_recuperacion = ?, token_recuperacion_exp = ? WHERE id = ?",
      [resetTokenHash, tokenExp, req.usuarioJWT.id]
    );

    logger.info({ id: req.usuarioJWT.id }, "OTP de cambio autenticado verificado");
    return res.json({
      ok:         true,
      mensaje:    "Código verificado. Puedes establecer tu nueva contraseña.",
      resetToken,
    });

  } catch (err) {
    req.log?.error({ err }, "Error en contrasena/cambio/verificar-otp");
    return res.status(500).json({ error: "Error interno del servicio de usuarios" });
  }
});

/**
 * POST /contrasena/cambio/confirmar
 * Cambia la contraseña usando el resetToken obtenido en /verificar-otp.
 * Headers: Authorization: Bearer <token>
 * Body: { resetToken, nuevaContrasena, confirmarContrasena }
 */
app.post("/contrasena/cambio/confirmar", verificarJWT, async (req, res) => {
  try {
    const { resetToken, nuevaContrasena, confirmarContrasena } = req.body ?? {};

    if (!resetToken || !nuevaContrasena || !confirmarContrasena) {
      return res.status(400).json({
        error: "Se requieren: resetToken, nuevaContrasena y confirmarContrasena.",
      });
    }

    if (nuevaContrasena !== confirmarContrasena) {
      return res.status(422).json({ error: "Las contraseñas no coinciden." });
    }

    if (nuevaContrasena.length < 8) {
      return res.status(422).json({ error: "La contraseña debe tener al menos 8 caracteres." });
    }

    const usuarios = await consultar(
      `SELECT id, token_recuperacion, contrasena_hash
         FROM usuarios
        WHERE id = ?
          AND token_recuperacion IS NOT NULL
          AND token_recuperacion_exp > NOW()
        LIMIT 1`,
      [req.usuarioJWT.id]
    );

    if (!usuarios.length) {
      return res.status(400).json({ error: "El token expiró o ya fue usado. Solicita un nuevo código." });
    }

    const usuario     = usuarios[0];
    const tokenValido = await bcrypt.compare(resetToken, usuario.token_recuperacion);

    if (!tokenValido) {
      return res.status(400).json({ error: "Token inválido." });
    }

    // Verificar que la nueva contraseña sea diferente a la actual
    const mismaContrasena = await bcrypt.compare(nuevaContrasena, usuario.contrasena_hash);
    if (mismaContrasena) {
      return res.status(422).json({ error: "La nueva contraseña debe ser diferente a la actual." });
    }

    const contrasenaHash = await bcrypt.hash(nuevaContrasena, 10);

    await ejecutar(
      `UPDATE usuarios
          SET contrasena_hash        = ?,
              token_recuperacion     = NULL,
              token_recuperacion_exp = NULL
        WHERE id = ?`,
      [contrasenaHash, usuario.id]
    );

    logger.info({ id: usuario.id }, "Contraseña cambiada desde configuración");
    return res.json({ ok: true, mensaje: "Contraseña actualizada correctamente." });

  } catch (err) {
    req.log?.error({ err }, "Error en contrasena/cambio/confirmar");
    return res.status(500).json({ error: "Error interno del servicio de usuarios" });
  }
});

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada en svc-usuarios", ruta: req.originalUrl });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info({ port: PORT }, "svc-usuarios escuchando");
});