# Servicio de Autenticación ALIA

Sistema de autenticación con JWT y manejo de roles para el proyecto ALIA.

## Características

- Autenticación con JWT (JSON Web Tokens)
- Manejo de múltiples roles: DOCENTE, COORDINADOR, ADMINISTRATIVO, ADMIN
- Middleware de autorización por roles
- Integración con API Gateway
- Sesiones persistentes en frontend

## Arquitectura

### Backend (Puerto 8085)

- **Framework**: Express.js
- **Autenticación**: JWT + bcryptjs
- **Base de datos**: MySQL (tablas: usuarios, roles, usuario_roles)

### Rutas disponibles

#### POST /auth/login
Login con correo y contraseña.

**Request:**
```json
{
  "correo": "docente@alia.com",
  "contrasena": "123456"
}
```

**Response:**
```json
{
  "exito": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "usuario": {
    "id": 1,
    "correo": "docente@alia.com",
    "nombre": "María Rodríguez",
    "roles": ["DOCENTE"]
  }
}
```

#### POST /auth/registro
Registra un nuevo usuario (solo para testing).

**Request:**
```json
{
  "correo": "nuevo@alia.com",
  "contrasena": "password123",
  "nombre_completo": "Usuario Nuevo",
  "roles": ["DOCENTE"]
}
```

#### GET /auth/verificar
Verifica si un token JWT es válido.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "exito": true,
  "usuario": {
    "id": 1,
    "correo": "docente@alia.com",
    "nombre": "María Rodríguez",
    "roles": ["DOCENTE"]
  }
}
```

#### GET /auth/me
Obtiene información completa del usuario autenticado.

**Headers:**
```
Authorization: Bearer <token>
```

## Usuarios de Prueba

| Correo | Contraseña | Rol | Descripción |
|--------|------------|-----|-------------|
| docente@alia.com | 123456 | DOCENTE | Profesor que imparte asignaturas |
| coordinador@alia.com | 123456 | COORDINADOR | Coordinador académico con permisos de gestión |
| admin@alia.com | 123456 | ADMINISTRATIVO | Personal administrativo |
| superadmin@alia.com | 123456 | TODOS | Usuario con todos los roles |

## Roles y Permisos

### DOCENTE
- Ver estudiantes de sus cursos
- Registrar calificaciones y asistencias
- Generar reportes de sus cursos

### COORDINADOR
- Todos los permisos de DOCENTE
- Ver todos los grados y estudiantes
- Generar reportes académicos globales
- Administrar docentes y asignaciones

### ADMINISTRATIVO
- Gestionar estudiantes y matrícula
- Importar/exportar datos
- Ver estadísticas globales

### ADMIN
- Todos los permisos del sistema
- Gestionar usuarios y roles
- Configuración del sistema

## Middleware de Autenticación

### verificarToken
Middleware que valida el token JWT en el header Authorization.

```javascript
import { verificarToken } from './middleware.auth.js';

router.get('/ruta-protegida', verificarToken, (req, res) => {
  // req.usuario contiene la información del usuario autenticado
  res.json({ usuario: req.usuario });
});
```

### requiereRol(roles)
Middleware que requiere que el usuario tenga al menos uno de los roles especificados.

```javascript
import { verificarToken, requiereRol } from './middleware.auth.js';

router.post('/ruta-admin',
  verificarToken,
  requiereRol(['ADMIN', 'COORDINADOR']),
  (req, res) => {
    res.json({ mensaje: 'Acceso permitido' });
  }
);
```

## Uso en Frontend

### Hook useAuth

```javascript
import { useAuth } from './useAuth';

function MiComponente() {
  const auth = useAuth(baseURL);

  // Login
  const handleLogin = async () => {
    const resultado = await auth.login('correo@alia.com', 'password');
    if (resultado.exito) {
      console.log('Login exitoso');
    }
  };

  // Logout
  const handleLogout = () => {
    auth.logout();
  };

  // Verificar rol
  if (auth.tieneRol('ADMIN')) {
    return <PanelAdmin />;
  }

  // Fetch con autenticación automática
  const obtenerDatos = async () => {
    const res = await auth.fetchAuth('/api/datos');
    const datos = await res.json();
  };

  return (
    <div>
      {auth.autenticado ? (
        <div>
          <p>Bienvenido {auth.usuario.nombre}</p>
          <p>Roles: {auth.usuario.roles.join(', ')}</p>
          <button onClick={handleLogout}>Salir</button>
        </div>
      ) : (
        <button onClick={handleLogin}>Iniciar Sesión</button>
      )}
    </div>
  );
}
```

## Variables de Entorno

```env
# Puerto del servicio
PORT_SVC_AUTH=8085

# JWT Secret (cambiar en producción)
JWT_SECRET=alia_secret_2025_cambiar_en_produccion

# Tiempo de expiración del token
JWT_EXPIRES_IN=24h
```

## Instalación y Ejecución

```bash
# Instalar dependencias
cd backend/svc-auth
npm install

# Crear datos iniciales
mysql -u root -p < datos-iniciales.sql

# Modo desarrollo
npm run dev

# Modo producción
npm start
```

## Seguridad

### Producción
1. **Cambiar JWT_SECRET**: Usar un secret fuerte y aleatorio
2. **HTTPS**: Usar siempre HTTPS en producción
3. **Tiempo de expiración**: Ajustar JWT_EXPIRES_IN según necesidades
4. **Rate limiting**: Implementar limitación de requests en login
5. **Contraseñas**: Los usuarios deben cambiar contraseñas por defecto

### Buenas Prácticas
- No guardar contraseñas en texto plano
- Usar bcrypt con al menos 10 rounds de salt
- Validar todos los inputs
- Implementar refresh tokens para sesiones largas
- Logs de auditoría para accesos críticos

## Testing

```bash
# Login
curl -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "correo": "docente@alia.com",
    "contrasena": "123456"
  }'

# Verificar token
curl http://localhost:8080/auth/verificar \
  -H "Authorization: Bearer <tu_token>"

# Obtener perfil
curl http://localhost:8080/auth/me \
  -H "Authorization: Bearer <tu_token>"
```

## Estructura de Archivos

```
svc-auth/
├── src/
│   ├── index.js              # Servidor Express
│   ├── rutas.auth.js         # Rutas de autenticación
│   └── middleware.auth.js    # Middlewares de auth
├── datos-iniciales.sql       # Script SQL para datos iniciales
├── package.json
└── README.md
```

## Integración con otros servicios

Los demás servicios pueden proteger sus rutas importando el middleware:

```javascript
// En svc-generacion, svc-busqueda, etc.
import { verificarToken, requiereRol } from '../svc-auth/src/middleware.auth.js';

router.get('/datos-sensibles',
  verificarToken,
  requiereRol(['COORDINADOR', 'ADMIN']),
  async (req, res) => {
    // Solo coordinadores y admins pueden acceder
    const datos = await obtenerDatosSensibles();
    res.json(datos);
  }
);
```
