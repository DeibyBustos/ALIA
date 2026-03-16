<template>
  <div class="cc-root">

    <!-- Header de sección -->
    <div class="cc-header">
      <button class="cc-back" @click="emit('ir-a', 'configuracion')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Volver
      </button>
      <div class="cc-title-row">
        <div class="cc-icon-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <div>
          <h2 class="cc-title">Cambiar contraseña</h2>
          <p class="cc-subtitle">Proceso verificado en 3 pasos</p>
        </div>
      </div>
    </div>

    <!-- Stepper -->
    <div class="cc-stepper">
      <div v-for="(s, i) in pasos" :key="i"
           :class="['step', { activo: paso === i, completado: paso > i }]">
        <div class="step-dot">
          <svg v-if="paso > i" width="10" height="10" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="3">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <span v-else>{{ i + 1 }}</span>
        </div>
        <span class="step-label">{{ s }}</span>
        <div v-if="i < pasos.length - 1" class="step-line" :class="{ completado: paso > i }" />
      </div>
    </div>

    <!-- ── PASO 0: Contraseña actual ── -->
    <Transition name="slide" mode="out-in">
      <div v-if="paso === 0" key="p0" class="cc-card">
        <p class="cc-card-desc">
          Ingresa tu contraseña actual para confirmar tu identidad.
          Te enviaremos un código de verificación a tu correo registrado.
        </p>

        <div class="cc-field">
          <label class="cc-label">Contraseña actual</label>
          <div class="cc-input-wrap">
            <svg class="field-icon" width="14" height="14" viewBox="0 0 24 24"
                 fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <input
              :type="verActual ? 'text' : 'password'"
              v-model="contrasenaActual"
              class="cc-input"
              placeholder="Tu contraseña actual"
              autocomplete="current-password"
              @keyup.enter="paso0Siguiente"
            />
            <button class="toggle-ver" @click="verActual = !verActual" type="button">
              <svg v-if="!verActual" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
              <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            </button>
          </div>
        </div>

        <div v-if="error" class="cc-error">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {{ error }}
        </div>

        <button class="cc-btn-primary" @click="paso0Siguiente" :disabled="cargando || !contrasenaActual">
          <span v-if="cargando" class="spinner" />
          <span v-else>Continuar y enviar código</span>
        </button>
      </div>
    </Transition>

    <!-- ── PASO 1: Verificar OTP ── -->
    <Transition name="slide" mode="out-in">
      <div v-if="paso === 1" key="p1" class="cc-card">
        <div class="cc-correo-info">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
          Código enviado a <strong>{{ correoOcultado }}</strong>
        </div>

        <div class="cc-field">
          <label class="cc-label">Código de verificación</label>
          <div class="otp-inputs">
            <input
              v-for="(_, i) in 6"
              :key="i"
              :ref="el => { if (el) otpRefs[i] = el }"
              v-model="otpDigits[i]"
              class="otp-digit"
              type="text"
              inputmode="numeric"
              maxlength="1"
              @input="otpInput(i, $event)"
              @keydown="otpKeydown(i, $event)"
              @paste.prevent="otpPegar($event)"
            />
          </div>
          <p class="cc-hint">Revisa tu bandeja de entrada y carpeta de spam.</p>
        </div>

        <div v-if="error" class="cc-error">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {{ error }}
        </div>

        <button class="cc-btn-primary" @click="paso1Siguiente" :disabled="cargando || otpCompleto === false">
          <span v-if="cargando" class="spinner" />
          <span v-else>Verificar código</span>
        </button>

        <div class="cc-footer-row">
          <button class="cc-link" @click="paso = 0; error = ''; limpiarOtp()">
            ← Volver
          </button>
        </div>
      </div>
    </Transition>

    <!-- ── PASO 2: Nueva contraseña ── -->
    <Transition name="slide" mode="out-in">
      <div v-if="paso === 2" key="p2" class="cc-card">
        <p class="cc-card-desc">
          Elige una contraseña segura de al menos 8 caracteres.
          Debe ser diferente a la contraseña actual.
        </p>

        <div class="cc-field">
          <label class="cc-label">Nueva contraseña</label>
          <div class="cc-input-wrap">
            <svg class="field-icon" width="14" height="14" viewBox="0 0 24 24"
                 fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <input
              :type="verNueva ? 'text' : 'password'"
              v-model="nuevaContrasena"
              class="cc-input"
              placeholder="Mínimo 8 caracteres"
              autocomplete="new-password"
            />
            <button class="toggle-ver" @click="verNueva = !verNueva" type="button">
              <svg v-if="!verNueva" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
              <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            </button>
          </div>
          <!-- Barra de fortaleza -->
          <div class="strength-bar" v-if="nuevaContrasena">
            <div v-for="n in 4" :key="n"
                 :class="['strength-seg', { activo: fortaleza >= n, [`f${fortaleza}`]: fortaleza >= n }]" />
          </div>
          <p v-if="nuevaContrasena" class="strength-label" :class="`f${fortaleza}`">
            {{ etiquetaFortaleza }}
          </p>
        </div>

        <div class="cc-field">
          <label class="cc-label">Confirmar nueva contraseña</label>
          <div class="cc-input-wrap">
            <svg class="field-icon" width="14" height="14" viewBox="0 0 24 24"
                 fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <input
              :type="verConfirmar ? 'text' : 'password'"
              v-model="confirmarContrasena"
              class="cc-input"
              :class="{ 'input-error': confirmarContrasena && nuevaContrasena !== confirmarContrasena }"
              placeholder="Repite la nueva contraseña"
              autocomplete="new-password"
              @keyup.enter="paso2Siguiente"
            />
            <button class="toggle-ver" @click="verConfirmar = !verConfirmar" type="button">
              <svg v-if="!verConfirmar" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
              <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            </button>
          </div>
          <p v-if="confirmarContrasena && nuevaContrasena !== confirmarContrasena"
             class="cc-match-error">Las contraseñas no coinciden</p>
        </div>

        <div v-if="error" class="cc-error">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {{ error }}
        </div>

        <button class="cc-btn-primary" @click="paso2Siguiente"
                :disabled="cargando || !paso2Valido">
          <span v-if="cargando" class="spinner" />
          <span v-else>Actualizar contraseña</span>
        </button>
      </div>
    </Transition>

    <!-- ── PASO 3: Éxito ── -->
    <Transition name="slide" mode="out-in">
      <div v-if="paso === 3" key="p3" class="cc-card cc-success">
        <div class="success-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h3 class="success-title">¡Contraseña actualizada!</h3>
        <p class="success-desc">Tu contraseña ha sido cambiada correctamente. Por seguridad, considera cerrar sesión en otros dispositivos.</p>
        <button class="cc-btn-primary" @click="emit('ir-a', 'configuracion')">
          Volver a configuración
        </button>
      </div>
    </Transition>

  </div>
</template>

<script setup>
import { ref, computed, reactive } from 'vue';

const props = defineProps({
  auth:      { type: Object, required: true },
  base:      { type: String, required: true },
  showToast: { type: Function, default: null },
});

const emit = defineEmits(['ir-a']);

// ── Estado general ─────────────────────────────────────────────
const paso      = ref(0);
const cargando  = ref(false);
const error     = ref('');

const pasos = ['Verificar identidad', 'Código OTP', 'Nueva contraseña'];

// ── Paso 0 ─────────────────────────────────────────────────────
const contrasenaActual = ref('');
const verActual        = ref(false);

// ── Paso 1 ─────────────────────────────────────────────────────
const otpDigits      = reactive(Array(6).fill(''));
const otpRefs        = reactive([]);
const correoOcultado = ref('');

const otpCompleto = computed(() => otpDigits.every(d => d !== ''));
const otpValor    = computed(() => otpDigits.join(''));

function limpiarOtp() {
  for (let i = 0; i < 6; i++) otpDigits[i] = '';
}

function otpInput(i, e) {
  const val = e.target.value.replace(/\D/g, '');
  otpDigits[i] = val.slice(-1);
  if (val && i < 5) otpRefs[i + 1]?.focus();
}

function otpKeydown(i, e) {
  if (e.key === 'Backspace' && !otpDigits[i] && i > 0) {
    otpRefs[i - 1]?.focus();
  }
}

function otpPegar(e) {
  const texto = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
  texto.split('').forEach((c, i) => { otpDigits[i] = c; });
  otpRefs[Math.min(texto.length, 5)]?.focus();
}

// ── Paso 2 ─────────────────────────────────────────────────────
const nuevaContrasena    = ref('');
const confirmarContrasena = ref('');
const verNueva           = ref(false);
const verConfirmar       = ref(false);
const resetToken         = ref('');

const fortaleza = computed(() => {
  const p = nuevaContrasena.value;
  if (!p) return 0;
  let s = 0;
  if (p.length >= 8)  s++;
  if (p.length >= 12) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/[0-9]/.test(p) && /[^A-Za-z0-9]/.test(p)) s++;
  return Math.max(1, s);
});

const etiquetaFortaleza = computed(() => {
  return ['', 'Débil', 'Aceptable', 'Buena', 'Excelente'][fortaleza.value];
});

const paso2Valido = computed(() =>
  nuevaContrasena.value.length >= 8 &&
  nuevaContrasena.value === confirmarContrasena.value
);

// ── Helper fetch ───────────────────────────────────────────────
function apiUrl(path) {
  return `${props.base.replace(/:\d+/, ':8080')}${path}`;
}

function token() {
  return props.auth.token?.value || localStorage.getItem('token') || '';
}

async function apiFetch(path, body) {
  const res = await fetch(apiUrl(path), {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token()}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error desconocido');
  return data;
}

// ── Paso 0 → enviar OTP ────────────────────────────────────────
async function paso0Siguiente() {
  if (!contrasenaActual.value || cargando.value) return;
  error.value  = '';
  cargando.value = true;
  try {
    const data = await apiFetch('/usuarios/contrasena/cambio/verificar-actual', {
      contrasenaActual: contrasenaActual.value,
    });
    correoOcultado.value = data.correo || '';
    paso.value = 1;
    // Enfocar primer dígito OTP
    setTimeout(() => otpRefs[0]?.focus(), 150);
  } catch (e) {
    error.value = e.message;
  } finally {
    cargando.value = false;
  }
}

// ── Paso 1 → verificar OTP ─────────────────────────────────────
async function paso1Siguiente() {
  if (!otpCompleto.value || cargando.value) return;
  error.value  = '';
  cargando.value = true;
  try {
    const data = await apiFetch('/usuarios/contrasena/cambio/verificar-otp', {
      otp: otpValor.value,
    });
    resetToken.value = data.resetToken;
    paso.value = 2;
  } catch (e) {
    error.value = e.message;
    limpiarOtp();
    setTimeout(() => otpRefs[0]?.focus(), 50);
  } finally {
    cargando.value = false;
  }
}

// ── Paso 2 → confirmar nueva contraseña ───────────────────────
async function paso2Siguiente() {
  if (!paso2Valido.value || cargando.value) return;
  error.value  = '';
  cargando.value = true;
  try {
    await apiFetch('/usuarios/contrasena/cambio/confirmar', {
      resetToken:           resetToken.value,
      nuevaContrasena:      nuevaContrasena.value,
      confirmarContrasena:  confirmarContrasena.value,
    });
    paso.value = 3;
  } catch (e) {
    error.value = e.message;
  } finally {
    cargando.value = false;
  }
}
</script>

<style scoped>
.cc-root {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  overflow-y: auto;
  padding: 4px 24px;
  color: #c8d6e8;
  scrollbar-width: thin;
  scrollbar-color: #1a2535 transparent;
}

.cc-root > * {
  width: 100%;
  max-width: 520px;
}

/* ── Header ── */
.cc-header {
  margin-bottom: 24px;
  width: 100%;
  max-width: 520px;
  align-self: center;
}

.cc-back {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: #3a5070;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  margin-bottom: 16px;
  transition: color 0.15s;
}
.cc-back:hover { color: #6b9fd4; }

.cc-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.cc-icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(74,158,255,0.08);
  border: 1px solid rgba(74,158,255,0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #4a9eff;
  flex-shrink: 0;
}

.cc-title {
  font-size: 15px;
  font-weight: 600;
  color: #c8d6e8;
  margin: 0 0 2px;
}
.cc-subtitle {
  font-size: 11px;
  color: #3a5070;
  margin: 0;
}

/* ── Stepper ── */
.cc-stepper {
  display: flex;
  align-items: center;
  margin-bottom: 24px;
  gap: 0;
  width: 100%;
  max-width: 520px;
  align-self: center;
}

.step {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  position: relative;
}

.step-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1.5px solid #1e2d40;
  background: #0d1117;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  color: #2a3a50;
  flex-shrink: 0;
  transition: all 0.2s;
}

.step.activo .step-dot {
  border-color: #4a9eff;
  color: #4a9eff;
  background: rgba(74,158,255,0.08);
  box-shadow: 0 0 0 3px rgba(74,158,255,0.08);
}

.step.completado .step-dot {
  border-color: #4caf50;
  background: rgba(76,175,80,0.1);
  color: #4caf50;
}

.step-label {
  font-size: 11px;
  color: #2a3a50;
  white-space: nowrap;
  transition: color 0.2s;
}
.step.activo .step-label    { color: #6b9fd4; }
.step.completado .step-label { color: #3a6040; }

.step-line {
  flex: 1;
  height: 1px;
  background: #1a2535;
  margin: 0 8px;
  transition: background 0.3s;
}
.step-line.completado { background: rgba(76,175,80,0.3); }

/* ── Card ── */
.cc-card {
  background: #0d1117;
  border: 1px solid rgba(255,255,255,0.04);
  border-radius: 14px;
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: 100%;
  max-width: 520px;
  align-self: center;
}

.cc-card-desc {
  font-size: 12px;
  color: #3a5070;
  line-height: 1.6;
  margin: 0;
}

/* ── Correo info ── */
.cc-correo-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #4a6080;
  background: rgba(74,158,255,0.04);
  border: 1px solid rgba(74,158,255,0.08);
  border-radius: 8px;
  padding: 10px 12px;
}
.cc-correo-info strong { color: #6b9fd4; }

/* ── Field ── */
.cc-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cc-label {
  font-size: 11px;
  font-weight: 600;
  color: #2e4060;
  text-transform: uppercase;
  letter-spacing: 0.07em;
}

.cc-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.field-icon {
  position: absolute;
  left: 12px;
  color: #2a3a50;
  pointer-events: none;
  flex-shrink: 0;
}

.cc-input {
  width: 100%;
  background: #111b2c;
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 8px;
  padding: 10px 40px 10px 36px;
  color: #c8d6e8;
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
  font-family: inherit;
}
.cc-input::placeholder { color: #1e2d40; }
.cc-input:focus { border-color: rgba(74,158,255,0.3); }
.cc-input.input-error { border-color: rgba(239,68,68,0.4); }

.toggle-ver {
  position: absolute;
  right: 10px;
  background: none;
  border: none;
  color: #2a3a50;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  transition: color 0.15s;
}
.toggle-ver:hover { color: #6b9fd4; }

.cc-hint {
  font-size: 11px;
  color: #1e2d40;
  margin: 0;
}

.cc-match-error {
  font-size: 11px;
  color: #ef4444;
  margin: 0;
}

/* ── OTP Inputs ── */
.otp-inputs {
  display: flex;
  gap: 8px;
}

.otp-digit {
  width: 42px;
  height: 48px;
  background: #111b2c;
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 8px;
  text-align: center;
  font-size: 20px;
  font-weight: 600;
  color: #c8d6e8;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
  font-family: monospace;
  caret-color: #4a9eff;
}
.otp-digit:focus {
  border-color: rgba(74,158,255,0.4);
  box-shadow: 0 0 0 2px rgba(74,158,255,0.08);
}

/* ── Strength bar ── */
.strength-bar {
  display: flex;
  gap: 4px;
  margin-top: 6px;
}
.strength-seg {
  flex: 1;
  height: 3px;
  border-radius: 2px;
  background: #1a2535;
  transition: background 0.2s;
}
.strength-seg.activo.f1 { background: #ef4444; }
.strength-seg.activo.f2 { background: #f59e0b; }
.strength-seg.activo.f3 { background: #3b82f6; }
.strength-seg.activo.f4 { background: #4caf50; }

.strength-label {
  font-size: 11px;
  margin: 0;
}
.strength-label.f1 { color: #ef4444; }
.strength-label.f2 { color: #f59e0b; }
.strength-label.f3 { color: #3b82f6; }
.strength-label.f4 { color: #4caf50; }

/* ── Error ── */
.cc-error {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  color: #ef4444;
  background: rgba(239,68,68,0.06);
  border: 1px solid rgba(239,68,68,0.12);
  border-radius: 8px;
  padding: 9px 12px;
}

/* ── Button ── */
.cc-btn-primary {
  width: 100%;
  padding: 11px;
  background: rgba(74,158,255,0.1);
  border: 1px solid rgba(74,158,255,0.2);
  border-radius: 8px;
  color: #4a9eff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-family: inherit;
}
.cc-btn-primary:hover:not(:disabled) {
  background: rgba(74,158,255,0.16);
}
.cc-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

.cc-footer-row {
  display: flex;
  justify-content: center;
}

.cc-link {
  background: none;
  border: none;
  color: #3a5070;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  transition: color 0.15s;
  font-family: inherit;
}
.cc-link:hover { color: #6b9fd4; }

/* ── Spinner ── */
.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(74,158,255,0.2);
  border-top-color: #4a9eff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Success ── */
.cc-success {
  align-items: center;
  text-align: center;
  padding: 36px 22px;
}

.success-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(76,175,80,0.08);
  border: 1.5px solid rgba(76,175,80,0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #4caf50;
}

.success-title {
  font-size: 16px;
  font-weight: 600;
  color: #c8d6e8;
  margin: 0;
}

.success-desc {
  font-size: 12px;
  color: #3a5070;
  line-height: 1.6;
  margin: 0;
  max-width: 280px;
}

/* ── Transitions ── */
.slide-enter-active,
.slide-leave-active { transition: opacity 0.2s, transform 0.2s; }
.slide-enter-from   { opacity: 0; transform: translateX(12px); }
.slide-leave-to     { opacity: 0; transform: translateX(-12px); }
</style>