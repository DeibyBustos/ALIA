import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import pino from "pino";
import pinoHttp from "pino-http";
import { MailtrapClient } from "mailtrap";
import bcrypt from "bcrypt";
import { consultar, ejecutar } from "../../libreria-compartida/src/db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logoBase64 = fs.readFileSync(
  path.join(__dirname, "../assets/Logo_WMS.png")
).toString("base64");


const logoSrc = `data:image/png;base64,${logoBase64}`;

const app = express();
const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const PORT = Number(process.env.PORT_SVC_USUARIOS || 8086);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5174")
  .split(",")
  .map(o => o.trim())
  .filter(Boolean);

// Middlewares
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

// Mailtrap API
const mailtrapClient = new MailtrapClient({
  token: process.env.MAILTRAP_API_TOKEN
});

async function enviarCorreoUsuarioCreado({ nombre, email }) {
  const info = await mailtrapClient.send({
    from: {
      email: process.env.MAIL_FROM_EMAIL || "hello@aliaoficial.com",
      name: process.env.MAIL_FROM_NAME || "ALIA Notificaciones"
    },
    to: [{ email }],
    subject: "Usuario creado exitosamente",
    text: `Hola ${nombre}, ¡bienvenido/a! Tu cuenta ha sido creada exitosamente. Ya puedes iniciar sesión en la plataforma.`,
    attachments: [
      {
        filename: "Logo_WMS.png",
        content: logoBase64,
        type: "image/png",
        disposition: "inline",
        content_id: "logo_wms"
      }
    ],
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
        .cta { display: inline-block; background: #0f1117; color: #ffffff; text-decoration: none; padding: 13px 28px; border-radius: 8px; font-size: 14px; font-weight: 500; }
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
    </html>
    `,
    category: "usuarios"
  });

  return info;
}

// Health
app.get("/estado", async (_req, res) => {
  try {
    await consultar("SELECT 1 AS ok");
    res.json({ ok: true, servicio: "svc-usuarios", db: "ok" });
  } catch (e) {
    res.status(500).json({ ok: false, servicio: "svc-usuarios", db: "error" });
  }
});

// Crear usuario
app.post(["/", "/usuarios"], async (req, res) => {
  try {
    const { nombre, email, password, rol } = req.body ?? {};

    // Validaciones
    if (!nombre || typeof nombre !== "string" || nombre.trim().length < 2) {
      return res.status(400).json({ error: "El nombre es obligatorio y debe tener al menos 2 caracteres" });
    }

    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "El email es obligatorio y debe tener formato válido" });
    }

    if (!password || typeof password !== "string" || password.length < 8) {
      return res.status(400).json({
        error: "La contraseña es obligatoria y debe tener al menos 8 caracteres"
      });
    }

    const emailNormalizado = email.trim().toLowerCase();
    const nombreNormalizado = nombre.trim();

    // Verificar duplicado en BD
    const existe = await consultar(
      `SELECT id FROM usuarios WHERE LOWER(correo) = LOWER(?) LIMIT 1`,
      [emailNormalizado]
    );

    if (existe.length > 0) {
      return res.status(409).json({ error: "Ya existe un usuario con ese correo" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const insertRes = await ejecutar(
      `
      INSERT INTO usuarios (correo, contrasena_hash, nombre_completo, activo)
      VALUES (?, ?, ?, ?)
      `,
      [emailNormalizado, passwordHash, nombreNormalizado, 1]
    );

    const rows = await consultar(
      `
      SELECT id, correo, nombre_completo, activo, creado_en
      FROM usuarios
      WHERE id = ?
      LIMIT 1
      `,
      [insertRes.insertId]
    );

        //Se realiza la validacion del rol eviado por el cliente y se valida la existencia del mismo 

    const rolRow = await consultar(`SELECT id FROM roles WHERE nombre = ? LIMIT 1`, [rol]);

    if (!rolRow.length) {
      return res.status(400).json({ error: "Rol inválido" });
    }

    await ejecutar(
      `INSERT INTO usuario_roles (id_usuario, id_rol) VALUES (?, ?)`,
      [insertRes.insertId, rolRow[0].id]
    );

    const row = rows[0];

    const dataUsuario = {
      id: row.id,
      nombre: row.nombre_completo,
      email: row.correo,
      activo: !!row.activo,
      creadoEn: row.creado_en
    };

    try {
      const info = await enviarCorreoUsuarioCreado({
        nombre: dataUsuario.nombre,
        email: dataUsuario.email
      });

      return res.status(201).json({
        ok: true,
        usuario: dataUsuario,
        correo: {
          enviado: true,
          detalle: info
        }
      });
    } catch (mailErr) {
      req.log?.error({ err: mailErr }, "Usuario creado pero falló envío de correo");

      return res.status(201).json({
        ok: true,
        usuario: dataUsuario,
        warning: "Usuario creado, pero no se pudo enviar el correo"
      });
    }

  } catch (err) {
    req.log?.error({ err }, "Error creando usuario");
    return res.status(500).json({ error: "Error interno del servicio de usuarios" });
  }
});

app.get(["/", "/usuarios"], async (_req, res) => {
  try {
    const rows = await consultar(`
      SELECT id, correo, nombre_completo, activo, creado_en
      FROM usuarios
      ORDER BY id DESC
    `);

    const data = rows.map(r => ({
      id: r.id,
      nombre: r.nombre_completo,
      email: r.correo,
      activo: !!r.activo,
      creadoEn: r.creado_en
    }));

    res.json({ ok: true, total: data.length, data });
  } catch (err) {
    logger.error({ err }, "Error listando usuarios");
    res.status(500).json({ error: "Error consultando usuarios" });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada en svc-usuarios", ruta: req.originalUrl });
});


// Start
app.listen(PORT, () => {
  logger.info({ port: PORT }, "svc-usuarios escuchando");
});