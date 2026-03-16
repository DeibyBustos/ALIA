<template>
  <div class="login-wrapper">
    <!-- Panel izquierdo: imagen -->
    <div class="login-image-panel">
      <div class="image-overlay" />
    </div>

    <!-- Panel derecho: formulario multi-paso -->
    <div class="login-form-panel">
      <div class="login-form-inner">
        <p class="brand-label">ALIA</p>

        <!-- Indicador de pasos -->
        <div class="steps-indicator">
          <div
            v-for="n in 3"
            :key="n"
            class="step-dot"
            :class="{ active: paso >= n, done: paso > n }"
          />
        </div>

        <!-- ══════════════════════════════════════════
             PASO 1: Ingresar correo
        ══════════════════════════════════════════ -->
        <template v-if="paso === 1">
          <h2 class="form-title">¿Olvidaste tu contraseña?</h2>
          <p class="form-subtitle">
            Ingresa tu correo y te enviaremos un código de verificación
          </p>

          <form @submit.prevent="solicitarOTP" class="form-body">
            <div class="field-group">
              <label class="field-label">Correo electrónico</label>
              <div class="input-wrapper">
                <span class="input-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="2" y="4" width="20" height="16" rx="2"/>
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                  </svg>
                </span>
                <input
                  type="email"
                  v-model.trim="correo"
                  placeholder="nombre@institucion.com"
                  required
                  autofocus
                  class="form-input"
                />
              </div>
            </div>

            <div v-if="error" class="error-box">{{ error }}</div>

            <button class="btn-primary" type="submit" :disabled="loading">
              {{ loading ? "Enviando..." : "Enviar código" }}
            </button>
          </form>
        </template>

        <!-- ══════════════════════════════════════════
             PASO 2: Verificar OTP
        ══════════════════════════════════════════ -->
        <template v-else-if="paso === 2">
          <h2 class="form-title">Revisa tu correo</h2>
          <p class="form-subtitle">
            Ingresa el código de 6 dígitos que enviamos a<br/>
            <strong>{{ correoMascarado }}</strong>
          </p>

          <form @submit.prevent="verificarOTP" class="form-body">
            <div class="field-group">
              <label class="field-label">Código de verificación</label>
              <div class="input-wrapper">
                <span class="input-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </span>
                <input
                  type="text"
                  v-model.trim="otp"
                  placeholder="000000"
                  required
                  maxlength="6"
                  inputmode="numeric"
                  class="form-input otp-input"
                />
              </div>
            </div>

            <div v-if="error" class="error-box">{{ error }}</div>

            <button class="btn-primary" type="submit" :disabled="loading">
              {{ loading ? "Verificando..." : "Verificar código" }}
            </button>
          </form>

          <!-- Reenviar OTP -->
          <div class="resend-area">
            <template v-if="!adminContacto">
              <p class="resend-text">
                ¿No recibiste el código?
                <button
                  type="button"
                  class="btn-link"
                  :disabled="cooldownRestante > 0 || loadingReenvio"
                  @click="reenviarOTP"
                >
                  <template v-if="cooldownRestante > 0">
                    Reenviar en {{ cooldownRestante }}s
                  </template>
                  <template v-else-if="loadingReenvio">
                    Reenviando...
                  </template>
                  <template v-else>
                    Reenviar código
                    <span v-if="reenviosRestantes !== null" class="reenvios-badge">
                      {{ reenviosRestantes }} restante{{ reenviosRestantes === 1 ? '' : 's' }}
                    </span>
                  </template>
                </button>
              </p>
              <div v-if="okReenvio" class="ok-box">{{ okReenvio }}</div>
            </template>

            <!-- Límite de reenvíos alcanzado -->
            <template v-else>
              <div class="admin-box">
                <div class="admin-box-title">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 8v4m0 4h.01"/>
                  </svg>
                  No se pudo enviar el código
                </div>
                <p class="admin-box-text">
                  Has agotado los intentos de reenvío. Contacta a los administradores de la institución:
                </p>
                <div class="admin-contacts">
                  <a :href="`mailto:${adminContacto.email}`" class="admin-contact-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="2" y="4" width="20" height="16" rx="2"/>
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                    </svg>
                    {{ adminContacto.email }}
                  </a>
                  <div class="admin-contact-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.65 3.4 2 2 0 0 1 3.62 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.1a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.73 16z"/>
                    </svg>
                    {{ adminContacto.telefono }}
                  </div>
                  <div class="admin-contact-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"/>
                      <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    {{ adminContacto.horario }}
                  </div>
                </div>
              </div>
            </template>
          </div>
        </template>

        <!-- ══════════════════════════════════════════
             PASO 3: Nueva contraseña
        ══════════════════════════════════════════ -->
        <template v-else-if="paso === 3">
          <h2 class="form-title">Nueva contraseña</h2>
          <p class="form-subtitle">
            Elige una contraseña segura para tu cuenta
          </p>

          <form @submit.prevent="cambiarContrasena" class="form-body">
            <div class="field-group">
              <label class="field-label">Nueva contraseña</label>
              <div class="input-wrapper">
                <span class="input-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </span>
                <input
                  :type="mostrarContrasena ? 'text' : 'password'"
                  v-model="nuevaContrasena"
                  placeholder="Mínimo 8 caracteres"
                  required
                  minlength="8"
                  class="form-input"
                />
                <button
                  type="button"
                  class="toggle-password"
                  @click="mostrarContrasena = !mostrarContrasena"
                  tabindex="-1"
                >
                  <svg v-if="!mostrarContrasena" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                  <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                </button>
              </div>

              <!-- ── Barra de fortaleza ── -->
              <div v-if="nuevaContrasena" class="strength-bar">
                <div
                  v-for="n in 4" :key="n"
                  class="strength-seg"
                  :class="{ activo: fortaleza >= n, [`f${fortaleza}`]: fortaleza >= n }"
                />
              </div>
              <p v-if="nuevaContrasena" class="strength-label" :class="`f${fortaleza}`">
                {{ etiquetaFortaleza }}
              </p>
            </div>

            <div class="field-group">
              <label class="field-label">Confirmar contraseña</label>
              <div class="input-wrapper">
                <span class="input-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                </span>
                <input
                  :type="mostrarContrasena ? 'text' : 'password'"
                  v-model="confirmarContrasena"
                  placeholder="Repite la contraseña"
                  required
                  class="form-input"
                  :class="{ 'input-error': confirmarContrasena && nuevaContrasena !== confirmarContrasena }"
                />
              </div>
              <p
                v-if="confirmarContrasena && nuevaContrasena !== confirmarContrasena"
                class="field-hint-error"
              >
                Las contraseñas no coinciden
              </p>
            </div>

            <div v-if="error" class="error-box">{{ error }}</div>

            <button
              class="btn-primary"
              type="submit"
              :disabled="loading || nuevaContrasena !== confirmarContrasena"
            >
              {{ loading ? "Guardando..." : "Guardar contraseña" }}
            </button>
          </form>
        </template>

        <!-- ══════════════════════════════════════════
             PASO 4: Éxito
        ══════════════════════════════════════════ -->
        <template v-else-if="paso === 4">
          <div class="success-state">
            <div class="success-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <h2 class="form-title">¡Contraseña actualizada!</h2>
            <p class="form-subtitle">
              Tu contraseña fue cambiada correctamente.<br/>
              Ya puedes iniciar sesión.
            </p>
            <button class="btn-primary" @click="emit('back-to-login')">
              Ir al inicio de sesión
            </button>
          </div>
        </template>

        <!-- Volver al login (pasos 1-3) -->
        <div v-if="paso < 4" class="divider"><span>Ó</span></div>
        <p v-if="paso < 4" class="back-link">
          ¿Recordaste tu contraseña?
          <a href="#" @click.prevent="emit('back-to-login')">Inicia sesión</a>
        </p>

      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from "vue";
import { useBaseUrl } from "@/composables/useBaseUrl";

defineProps({
  showToast: { type: Function, default: null },
});

const emit = defineEmits(["back-to-login"]);
const { baseUrl } = useBaseUrl();

// ─── Estado ───────────────────────────────────────────────────────────────────
const paso                = ref(1);
const correo              = ref("");
const correoMascarado     = ref("");
const otp                 = ref("");
const nuevaContrasena     = ref("");
const confirmarContrasena = ref("");
const resetToken          = ref("");
const mostrarContrasena   = ref(false);

const loading           = ref(false);
const loadingReenvio    = ref(false);
const error             = ref("");
const okReenvio         = ref("");
const reenviosRestantes = ref(null);
const adminContacto     = ref(null);
const cooldownRestante  = ref(0);
let   cooldownTimer     = null;

onUnmounted(() => clearInterval(cooldownTimer));

// ─── Fortaleza de contraseña ──────────────────────────────────────────────────
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

const etiquetaFortaleza = computed(() =>
  ['', 'Débil', 'Aceptable', 'Buena', 'Excelente'][fortaleza.value]
);

function getBase() {
  const base = String(baseUrl.value || "").trim().replace(/\/+$/, "");
  if (!base) throw new Error("Configura la URL del API Gateway");
  return base;
}

function iniciarCooldown(segundos) {
  cooldownRestante.value = segundos;
  clearInterval(cooldownTimer);
  cooldownTimer = setInterval(() => {
    cooldownRestante.value--;
    if (cooldownRestante.value <= 0) clearInterval(cooldownTimer);
  }, 1000);
}

// ─── Paso 1: solicitar OTP ────────────────────────────────────────────────────
async function solicitarOTP() {
  error.value = "";
  loading.value = true;
  try {
    const res  = await fetch(`${getBase()}/usuarios/contrasena/solicitar`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ correo: correo.value }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "No se pudo enviar el código");

    reenviosRestantes.value = data.reenviosRestantes ?? null;
    correoMascarado.value   = data.correo || correo.value;
    paso.value = 2;
    iniciarCooldown(60);
  } catch (e) {
    error.value = e?.message || "Error al enviar el código";
    if (e?.contactoAdmin) adminContacto.value = e.contactoAdmin;
  } finally {
    loading.value = false;
  }
}

// ─── Paso 2a: verificar OTP ───────────────────────────────────────────────────
async function verificarOTP() {
  error.value = "";
  loading.value = true;
  try {
    const res  = await fetch(`${getBase()}/usuarios/contrasena/verificar`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ correo: correo.value, otp: otp.value }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Código incorrecto");

    resetToken.value = data.resetToken;
    paso.value = 3;
  } catch (e) {
    error.value = e?.message || "Error al verificar el código";
  } finally {
    loading.value = false;
  }
}

// ─── Paso 2b: reenviar OTP ────────────────────────────────────────────────────
async function reenviarOTP() {
  okReenvio.value      = "";
  error.value          = "";
  loadingReenvio.value = true;
  try {
    const res  = await fetch(`${getBase()}/usuarios/contrasena/reenviar`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ correo: correo.value }),
    });
    const data = await res.json().catch(() => ({}));

    if (data.limitAlcanzado) {
      adminContacto.value = data.contactoAdmin;
      return;
    }

    if (!res.ok) throw new Error(data.error || "No se pudo reenviar el código");

    reenviosRestantes.value = data.reenviosRestantes ?? null;
    if (data.correo) correoMascarado.value = data.correo;
    okReenvio.value = data.mensaje || "Código reenviado. Revisa tu correo.";

    if (data.contactoAdmin) adminContacto.value = data.contactoAdmin;

    iniciarCooldown(60);
  } catch (e) {
    error.value = e?.message || "Error al reenviar el código";
  } finally {
    loadingReenvio.value = false;
  }
}

// ─── Paso 3: cambiar contraseña ───────────────────────────────────────────────
async function cambiarContrasena() {
  error.value = "";
  loading.value = true;
  try {
    const res  = await fetch(`${getBase()}/usuarios/contrasena/cambiar`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        correo:              correo.value,
        resetToken:          resetToken.value,
        nuevaContrasena:     nuevaContrasena.value,
        confirmarContrasena: confirmarContrasena.value,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "No se pudo actualizar la contraseña");

    paso.value = 4;
  } catch (e) {
    error.value = e?.message || "Error al cambiar la contraseña";
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Serif+Display&display=swap');

* { box-sizing: border-box; margin: 0; padding: 0; }

.login-wrapper {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 100vh;
  overflow: hidden;
  font-family: 'DM Sans', sans-serif;
  background: #fff;
}

/* ── Panel izquierdo ── */
.login-image-panel {
  flex: 1 1 0;
  min-width: 0;
  position: relative;
  background-image: url('https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=1200&q=80');
  background-size: cover;
  background-position: center;
}

.image-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.05) 100%);
}

/* ── Panel derecho ── */
.login-form-panel {
  flex: 0 0 480px;
  width: 480px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 48px;
  background: #fff;
  overflow-y: auto;
}

.login-form-inner {
  width: 100%;
  max-width: 340px;
}

.brand-label {
  font-family: 'DM Serif Display', serif;
  font-size: 15px;
  letter-spacing: 0.18em;
  color: #888;
  text-transform: uppercase;
  text-align: center;
  margin-bottom: 20px;
}

/* ── Indicador de pasos ── */
.steps-indicator {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 28px;
}

.step-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #e0e0e0;
  transition: background 0.3s, transform 0.3s;
}

.step-dot.active {
  background: #4caf50;
  transform: scale(1.2);
}

.step-dot.done {
  background: #a5d6a7;
  transform: scale(1);
}

.form-title {
  font-size: 21px;
  font-weight: 600;
  color: #1a1a1a;
  text-align: center;
  margin-bottom: 8px;
  line-height: 1.3;
}

.form-subtitle {
  font-size: 13px;
  color: #888;
  text-align: center;
  margin-bottom: 28px;
  line-height: 1.6;
}

/* ── Campos ── */
.form-body {
  display: flex;
  flex-direction: column;
}

.field-group { margin-bottom: 16px; }

.field-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #444;
  margin-bottom: 6px;
}

.input-wrapper { position: relative; }

.input-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #aaa;
  display: flex;
  align-items: center;
}

.form-input {
  width: 100%;
  padding: 10px 12px 10px 38px;
  border: 1.5px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  font-family: 'DM Sans', sans-serif;
  color: #1a1a1a;
  background: #fafafa;
  transition: border-color 0.2s, box-shadow 0.2s;
  outline: none;
}

.form-input::placeholder { color: #bbb; }

.form-input:focus {
  border-color: #4caf50;
  box-shadow: 0 0 0 3px rgba(76, 175, 80, 0.12);
  background: #fff;
}

.form-input.input-error {
  border-color: #fca5a5;
  box-shadow: 0 0 0 3px rgba(252, 165, 165, 0.15);
}

.otp-input {
  text-align: center;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 10px;
  padding-left: 38px;
}

.toggle-password {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: #aaa;
  display: flex;
  align-items: center;
  padding: 0;
  transition: color 0.2s;
}
.toggle-password:hover { color: #555; }

.field-hint-error {
  font-size: 12px;
  color: #ef4444;
  margin-top: 4px;
}

/* ── Barra de fortaleza ── */
.strength-bar {
  display: flex;
  gap: 4px;
  margin-top: 8px;
}

.strength-seg {
  flex: 1;
  height: 3px;
  border-radius: 2px;
  background: #e8e8e8;
  transition: background 0.2s;
}

.strength-seg.activo.f1 { background: #ef4444; }
.strength-seg.activo.f2 { background: #f59e0b; }
.strength-seg.activo.f3 { background: #3b82f6; }
.strength-seg.activo.f4 { background: #4caf50; }

.strength-label {
  font-size: 11px;
  font-weight: 500;
  margin-top: 4px;
}

.strength-label.f1 { color: #ef4444; }
.strength-label.f2 { color: #f59e0b; }
.strength-label.f3 { color: #3b82f6; }
.strength-label.f4 { color: #4caf50; }

/* ── Mensajes ── */
.error-box {
  background: #fef2f2;
  border: 1px solid #fca5a5;
  color: #b91c1c;
  border-radius: 7px;
  padding: 10px 14px;
  font-size: 13px;
  margin-bottom: 12px;
}

.ok-box {
  background: #f0fdf4;
  border: 1px solid #86efac;
  color: #15803d;
  border-radius: 7px;
  padding: 10px 14px;
  font-size: 13px;
  margin-top: 8px;
}

/* ── Botón principal ── */
.btn-primary {
  width: 100%;
  padding: 11px;
  background: #4caf50;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  font-family: 'DM Sans', sans-serif;
  cursor: pointer;
  transition: background 0.2s, transform 0.1s;
  margin-bottom: 4px;
}

.btn-primary:hover:not(:disabled) { background: #43a047; }
.btn-primary:active:not(:disabled) { transform: scale(0.99); }
.btn-primary:disabled { opacity: 0.65; cursor: not-allowed; }

/* ── Reenviar ── */
.resend-area { margin-top: 16px; }

.resend-text {
  text-align: center;
  font-size: 13px;
  color: #888;
}

.btn-link {
  background: none;
  border: none;
  color: #4caf50;
  font-size: 13px;
  font-weight: 500;
  font-family: 'DM Sans', sans-serif;
  cursor: pointer;
  padding: 0;
  transition: color 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn-link:hover:not(:disabled) { text-decoration: underline; }
.btn-link:disabled { color: #bbb; cursor: not-allowed; }

.reenvios-badge {
  background: #e8f5e9;
  color: #2e7d32;
  font-size: 11px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 20px;
}

/* ── Caja contacto admins ── */
.admin-box {
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 10px;
  padding: 14px 16px;
  margin-top: 12px;
}

.admin-box-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #92400e;
  margin-bottom: 6px;
}

.admin-box-text {
  font-size: 12px;
  color: #78350f;
  margin-bottom: 10px;
  line-height: 1.5;
}

.admin-contacts {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.admin-contact-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #78350f;
  text-decoration: none;
}

a.admin-contact-item:hover { text-decoration: underline; }

/* ── Estado éxito ── */
.success-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.success-icon {
  width: 64px;
  height: 64px;
  background: #f0fdf4;
  border: 2px solid #86efac;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #16a34a;
  margin-bottom: 20px;
}

/* ── Divisor y volver ── */
.divider {
  display: flex;
  align-items: center;
  color: #ccc;
  font-size: 13px;
  margin: 16px 0;
  gap: 10px;
}
.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #e8e8e8;
}

.back-link {
  text-align: center;
  font-size: 13px;
  color: #888;
}
.back-link a {
  color: #4caf50;
  font-weight: 500;
  text-decoration: none;
}
.back-link a:hover { text-decoration: underline; }

/* ── Responsive ── */
@media (max-width: 700px) {
  .login-image-panel { display: none; }
  .login-form-panel {
    width: 100%;
    flex: unset;
    padding: 32px 24px;
  }
}
</style>