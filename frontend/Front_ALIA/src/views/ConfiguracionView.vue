<template>
  <div class="config-root">

    <!-- ── Vista interna: Cambiar contraseña ── -->
    <CambiarContrasena
      v-if="vistaActiva === 'cambiar-contrasena'"
      :auth="auth"
      :base="base"
      :showToast="showToast"
      @ir-a="vistaActiva = null"
    />

    <!-- ── Vista principal de configuración ── -->
    <template v-else>

      <!-- Header -->
      <div class="config-header">
        <div class="config-header-left">
          <div class="config-avatar">
            <span>{{ iniciales }}</span>
          </div>
          <div>
            <p class="config-nombre">{{ auth.user.value?.nombre || 'Usuario' }}</p>
            <p class="config-correo">{{ auth.user.value?.correo }}</p>
          </div>
        </div>
        <div class="config-roles">
          <span v-for="rol in auth.user.value?.roles || []" :key="rol" class="rol-badge">
            {{ rolLabel(rol) }}
          </span>
        </div>
      </div>

      <div class="config-sections">

        <!-- ── MI CUENTA (todos) ── -->
        <section class="config-section">
          <h3 class="section-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
            </svg>
            Mi cuenta
          </h3>
          <div class="cards-grid">
            <ConfigCard titulo="Cambiar contraseña" descripcion="Actualiza tu contraseña de acceso" icono="lock" estado="activo" @click="vistaActiva = 'cambiar-contrasena'" />
            <ConfigCard titulo="Asistente IA" descripcion="Chat académico inteligente" icono="chat" estado="activo" @click="emit('ir-a', 'asistente')" />
          </div>
        </section>

        <!-- ── DOCENTE ── -->
        <section v-if="esDocente" class="config-section">
          <h3 class="section-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
            Docente
          </h3>
          <div class="cards-grid">
            <ConfigCard titulo="Documentos" descripcion="Sube y gestiona archivos académicos" icono="docs" estado="activo" @click="emit('ir-a', 'documentos')" />
            <ConfigCard titulo="Registrar asistencias" descripcion="El asistente IA te guía paso a paso" icono="check" estado="activo" @click="irAsistente('Quiero registrar asistencias de mis estudiantes')" />
            <ConfigCard titulo="Ingresar calificaciones" descripcion="El asistente IA gestiona tus notas" icono="star" estado="activo" @click="irAsistente('Quiero ingresar calificaciones de mis estudiantes')" />
            <ConfigCard titulo="Mis horarios" descripcion="El asistente IA consulta tus horarios" icono="calendar" estado="activo" @click="irAsistente('Quiero consultar mis horarios de clases')" />
            <ConfigCard titulo="Planeaciones" descripcion="El asistente IA organiza tu planeación" icono="plan" estado="activo" @click="irAsistente('Quiero gestionar mis planeaciones de clase')" />
          </div>
        </section>

        <!-- ── COORDINADOR ── -->
        <section v-if="esCoordinador" class="config-section">
          <h3 class="section-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            Coordinación
          </h3>
          <div class="cards-grid">
            <ConfigCard titulo="Importar estudiantes" descripcion="Carga masiva desde Excel" icono="upload" estado="activo" @click="emit('ir-a', 'documentos')" />
            <ConfigCard titulo="Importar docentes" descripcion="Carga masiva desde Excel" icono="upload" estado="activo" @click="emit('ir-a', 'documentos')" />
            <ConfigCard titulo="Gestionar estudiantes" descripcion="El asistente IA consulta matrículas" icono="users" estado="activo" @click="irAsistente('Quiero gestionar estudiantes, matrículas e inscripciones')" />
            <ConfigCard titulo="Gestionar cursos" descripcion="El asistente IA asigna docentes" icono="book" estado="activo" @click="irAsistente('Quiero gestionar cursos y asignación de docentes')" />
            <ConfigCard titulo="Períodos académicos" descripcion="El asistente IA crea períodos" icono="calendar" estado="activo" @click="irAsistente('Quiero gestionar períodos académicos')" />
            <ConfigCard titulo="Reportes" descripcion="El asistente IA genera reportes" icono="stats" estado="activo" @click="irAsistente('Quiero generar un reporte de asistencia y rendimiento por grado')" />
          </div>
        </section>

        <!-- ── ADMINISTRATIVO ── -->
        <section v-if="esAdministrativo" class="config-section">
          <h3 class="section-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            Administración
          </h3>
          <div class="cards-grid">
            <ConfigCard titulo="Gestionar usuarios" descripcion="Crear y administrar cuentas" icono="users" estado="activo" @click="emit('ir-a', 'usuarios')" />
            <ConfigCard titulo="Estado de servicios" descripcion="Monitoreo de los microservicios" icono="server" estado="activo" @click="mostrarEstadoServicios = true" />
            <ConfigCard titulo="Niveles y grados" descripcion="El asistente IA consulta la estructura" icono="school" estado="activo" @click="irAsistente('Quiero consultar los niveles y grados académicos')" />
            <ConfigCard titulo="Bitácora" descripcion="El asistente IA revisa la actividad" icono="log" estado="activo" @click="irAsistente('Quiero revisar el registro de actividad del sistema')" />
            <ConfigCard titulo="Parámetros del sistema" descripcion="El asistente IA gestiona la configuración" icono="sliders" estado="activo" @click="irAsistente('Quiero consultar o modificar los parámetros del sistema')" />
          </div>
        </section>

      </div>

    </template>

    <!-- Modal estado de servicios -->
    <Transition name="modal">
      <div v-if="mostrarEstadoServicios" class="modal-overlay" @click.self="mostrarEstadoServicios = false">
        <div class="modal-box">
          <div class="modal-header">
            <span>Estado de servicios</span>
            <button class="modal-close" @click="mostrarEstadoServicios = false">✕</button>
          </div>
          <div class="servicios-list">
            <div v-for="svc in servicios" :key="svc.nombre" class="servicio-row">
              <div class="servicio-info">
                <span class="servicio-nombre">{{ svc.nombre }}</span>
                <span class="servicio-puerto">:{{ svc.puerto }}</span>
              </div>
              <div class="servicio-status" :class="svc.estado">
                <span class="status-dot" />
                {{ svc.estado === 'ok' ? 'Activo' : svc.estado === 'error' ? 'Error' : 'Pendiente' }}
              </div>
            </div>
          </div>
          <button class="btn-verificar" @click="verificarServicios" :disabled="verificando">
            {{ verificando ? 'Verificando...' : 'Verificar ahora' }}
          </button>
        </div>
      </div>
    </Transition>

  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import ConfigCard from '@/components/features/ConfigCard.vue';
import CambiarContrasena from '@/components/features/CambiarContrasena.vue';

const props = defineProps({
  auth:      { type: Object, required: true },
  base:      { type: String, required: true },
  showToast: { type: Function, default: null },
});

const emit = defineEmits(['ir-a', 'ir-asistente']);

// ─── Navegación interna ───────────────────────────────────────
const vistaActiva = ref(null);

// ─── Ir al asistente con mensaje pre-cargado ──────────────────
function irAsistente(msg) {
  emit('ir-asistente', msg);
  emit('ir-a', 'asistente');
}

// ─── Roles ────────────────────────────────────────────────────
const esDocente        = computed(() => props.auth.hasAnyRole(['DOCENTE', 'COORDINADOR', 'ADMINISTRATIVO']));
const esCoordinador    = computed(() => props.auth.hasAnyRole(['COORDINADOR', 'ADMINISTRATIVO']));
const esAdministrativo = computed(() => props.auth.hasRole('ADMINISTRATIVO'));

function rolLabel(rol) {
  const map = { DOCENTE: 'Docente', COORDINADOR: 'Coordinador', ADMINISTRATIVO: 'Administrador' };
  return map[rol] || rol;
}

const iniciales = computed(() => {
  const nombre = props.auth.user.value?.nombre || '';
  return nombre.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase()).join('');
});

// ─── Estado de servicios ──────────────────────────────────────
const mostrarEstadoServicios = ref(false);
const verificando = ref(false);

const servicios = ref([
  { nombre: 'API Gateway', puerto: 8080, path: '/estado', estado: 'idle' },
  { nombre: 'Auth',        puerto: 8085, path: '/health', estado: 'idle' },
  { nombre: 'Usuarios',    puerto: 8086, path: '/estado', estado: 'idle' },
  { nombre: 'Documentos',  puerto: 8081, path: '/estado', estado: 'idle' },
  { nombre: 'Ingesta',     puerto: 8082, path: '/estado', estado: 'idle' },
  { nombre: 'Búsqueda',    puerto: 8083, path: '/estado', estado: 'idle' },
  { nombre: 'Generación',  puerto: 8084, path: '/estado', estado: 'idle' },
]);

async function verificarServicios() {
  verificando.value = true;
  servicios.value.forEach(s => s.estado = 'idle');
  await Promise.all(servicios.value.map(async svc => {
    try {
      const base = props.base.replace(/:\d+/, `:${svc.puerto}`);
      const res = await fetch(`${base}${svc.path}`, { signal: AbortSignal.timeout(3000) });
      svc.estado = res.ok ? 'ok' : 'error';
    } catch {
      svc.estado = 'error';
    }
  }));
  verificando.value = false;
}
</script>

<style scoped>
.config-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  padding: 4px 2px;
  color: #c8d6e8;
  scrollbar-width: thin;
  scrollbar-color: #1a2535 transparent;
}

.config-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 28px;
  padding-bottom: 20px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  flex-wrap: wrap;
  gap: 12px;
}

.config-header-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.config-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, #1c2f4e, #264880);
  border: 1.5px solid rgba(74,158,255,0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 600;
  color: #6b9fd4;
  flex-shrink: 0;
}

.config-nombre { font-size: 14px; font-weight: 600; color: #c8d6e8; margin: 0 0 2px; }
.config-correo { font-size: 12px; color: #3a5070; margin: 0; }

.config-roles { display: flex; gap: 6px; flex-wrap: wrap; }

.rol-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 20px;
  background: rgba(74,158,255,0.08);
  color: #4a9eff;
  border: 1px solid rgba(74,158,255,0.15);
  letter-spacing: 0.03em;
}

.config-sections { display: flex; flex-direction: column; gap: 28px; }

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 600;
  color: #2e4060;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin: 0 0 12px;
}

.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
}

/* ── Modal ── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  backdrop-filter: blur(3px);
}

.modal-box {
  background: #0d1117;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 14px;
  padding: 24px;
  width: 380px;
  max-width: 90vw;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
  font-size: 14px;
  font-weight: 600;
  color: #c8d6e8;
}

.modal-close {
  background: none;
  border: none;
  color: #3a5070;
  font-size: 16px;
  cursor: pointer;
  padding: 0;
  transition: color 0.15s;
}
.modal-close:hover { color: #c8d6e8; }

.servicios-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 18px; }

.servicio-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: #111b2c;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.04);
}

.servicio-info { display: flex; align-items: baseline; gap: 6px; }
.servicio-nombre { font-size: 13px; color: #8aa0b8; font-weight: 500; }
.servicio-puerto { font-size: 11px; color: #2a3a50; font-family: monospace; }

.servicio-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
}

.servicio-status.ok    { color: #4caf50; }
.servicio-status.error { color: #ef4444; }
.servicio-status.idle  { color: #3a5070; }

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}
.servicio-status.ok .status-dot { box-shadow: 0 0 6px #4caf50; }

.btn-verificar {
  width: 100%;
  padding: 10px;
  background: rgba(74,158,255,0.08);
  border: 1px solid rgba(74,158,255,0.15);
  border-radius: 8px;
  color: #4a9eff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-verificar:hover:not(:disabled) { background: rgba(74,158,255,0.14); }
.btn-verificar:disabled { opacity: 0.5; cursor: not-allowed; }

.modal-enter-active, .modal-leave-active { transition: opacity 0.2s, transform 0.2s; }
.modal-enter-from, .modal-leave-to { opacity: 0; transform: scale(0.97); }
</style>