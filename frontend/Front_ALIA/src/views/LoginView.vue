<template>
  <div class="login-wrapper">
    <!-- Left panel: classroom image -->
    <div class="login-image-panel">
      <div class="image-overlay" />
    </div>

    <!-- Right panel: form -->
    <div class="login-form-panel">
      <div class="login-form-inner">
        <p class="brand-label">ALIA</p>

        <h2 class="form-title">Iniciar Sesión</h2>
        <p class="form-subtitle">Ingresa para gestionar tus artículos, notas y documentos</p>

        <form @submit.prevent="handleSubmit" class="form-body">
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

          <div class="field-group">
            <label class="field-label">Contraseña</label>
            <div class="input-wrapper">
              <span class="input-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </span>
              <input
                type="password"
                v-model="contrasena"
                placeholder="Contraseña"
                required
                class="form-input"
              />
            </div>
          </div>

          <div v-if="error" class="error-box">
            {{ error }}
          </div>

          <button class="btn-primary" type="submit" :disabled="cargando">
            {{ cargando ? "Iniciando sesión..." : "Iniciar sesión" }}
          </button>
        </form>

        <div class="divider">
          <span>Ó</span>
        </div>

        <div class="secondary-actions">
          <button type="button" class="btn-secondary" @click="emit('go-create-user')">
            Crear usuario
          </button>
          <button type="button" class="btn-secondary" @click="emit('go-forgot-password')">
            Olvidé contraseña
          </button>
        </div>

        <p class="terms-link">
          <a href="#">Términos y condiciones de Uso</a>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";

const props = defineProps({
  auth: { type: Object, required: true },
  showToast: { type: Function, required: true },
});

const correo = ref("");
const contrasena = ref("");
const cargando = ref(false);
const error = ref("");

async function handleSubmit() {
  error.value = "";
  cargando.value = true;

  const r = await props.auth.login(correo.value, contrasena.value);

  if (!r.exito) {
    error.value = r.mensaje;
    cargando.value = false;
    props.showToast("Error al iniciar sesión: " + r.mensaje);
  } else {
  }
}

const emit = defineEmits(["go-create-user", "go-forgot-password"]);
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Serif+Display&display=swap');

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

.login-wrapper {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 100vh;
  overflow: hidden;
  font-family: 'DM Sans', sans-serif;
  background: #fff;
}

/* ── Left image panel ── */
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

/* ── Right form panel ── */
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
  margin-bottom: 36px;
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
  line-height: 1.5;
}

/* ── Fields ── */
.form-body {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.field-group {
  margin-bottom: 16px;
}

.field-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #444;
  margin-bottom: 6px;
}

.input-wrapper {
  position: relative;
}

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

.form-input::placeholder {
  color: #bbb;
}

.form-input:focus {
  border-color: #4caf50;
  box-shadow: 0 0 0 3px rgba(76, 175, 80, 0.12);
  background: #fff;
}

/* ── Error ── */
.error-box {
  background: #fef2f2;
  border: 1px solid #fca5a5;
  color: #b91c1c;
  border-radius: 7px;
  padding: 10px 14px;
  font-size: 13px;
  margin-bottom: 14px;
}

/* ── Primary button ── */
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

.btn-primary:hover:not(:disabled) {
  background: #43a047;
}

.btn-primary:active:not(:disabled) {
  transform: scale(0.99);
}

.btn-primary:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

/* ── Divider ── */
.divider {
  display: flex;
  align-items: center;
  text-align: center;
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

/* ── Secondary buttons ── */
.secondary-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.btn-secondary {
  flex: 1;
  padding: 10px 8px;
  background: #fff;
  color: #555;
  border: 1.5px solid #e0e0e0;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  font-family: 'DM Sans', sans-serif;
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s, background 0.2s;
}

.btn-secondary:hover {
  border-color: #4caf50;
  color: #4caf50;
  background: #f6fff6;
}

/* ── Terms ── */
.terms-link {
  text-align: center;
  font-size: 12px;
}

.terms-link a {
  color: #aaa;
  text-decoration: none;
  transition: color 0.2s;
}

.terms-link a:hover {
  color: #4caf50;
  text-decoration: underline;
}

/* ── Responsive ── */
@media (max-width: 700px) {
  .login-image-panel {
    display: none;
  }

  .login-form-panel {
    width: 100%;
    min-width: unset;
    padding: 32px 24px;
  }
}
</style>