<template>
  <div class="login-wrapper">
    <div class="login-image-panel">
      <div class="image-overlay" />
    </div>

    <div class="login-form-panel">
      <div class="login-form-inner">
        <p class="brand-label">ALIA</p>

        <h2 class="form-title">Regístrate en ALIA</h2>
        <p class="form-subtitle">Y gestiona tu asistente virtual</p>

        <form @submit.prevent="handleSubmit" class="form-body">

          <div class="field-group">
            <label class="field-label">Nombre completo</label>
            <div class="input-wrapper">
              <span class="input-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="8" r="4"/>
                  <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                </svg>
              </span>
              <input type="text" v-model="form.nombre" placeholder="Juan Pérez" required class="form-input" />
            </div>
          </div>

          <div class="field-group">
            <label class="field-label">Correo electrónico</label>
            <div class="input-wrapper">
              <span class="input-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="2" y="4" width="20" height="16" rx="2"/>
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                </svg>
              </span>
              <input type="email" v-model="form.email" placeholder="name@institucion.com" required class="form-input" />
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
              <input type="password" v-model="form.password" placeholder="Contraseña" required minlength="8" class="form-input" />
            </div>
          </div>

          <div class="field-group">
            <label class="field-label">Rol</label>
            <div class="input-wrapper">
              <span class="input-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </span>
              <select v-model="form.rol" required class="form-input form-select">
                <option value="" disabled>Seleccionar rol</option>
                <option value="DOCENTE">Docente</option>
                <option value="COORDINADOR">Coordinador</option>
                <option value="ADMINISTRATIVO">Administrativo</option>
              </select>
            </div>
          </div>

          <div v-if="error" class="error-box">{{ error }}</div>
          <div v-if="okMsg" class="ok-box">{{ okMsg }}</div>

          <button class="btn-primary" type="submit" :disabled="loading">
            {{ loading ? "Creando usuario..." : "Registrate" }}
          </button>
        </form>

        <p class="terms-link"><a href="#">Términos y condiciones de Uso</a></p>

        <p class="back-link">
          ¿Ya tienes una cuenta? <a href="#" @click.prevent="emit('back-to-login')">Ingresa Aquí</a>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, watch } from "vue";
import { useBaseUrl } from "@/composables/useBaseUrl";

defineProps({
  showToast: { type: Function, default: null },
});

const emit = defineEmits(["back-to-login"]);
const { baseUrl } = useBaseUrl();

const form = reactive({
  nombre: "",
  documento: "",
  email: "",
  password: "",
  rol: "",
});

const loading = ref(false);
const error = ref("");
const okMsg = ref("");

watch(form, () => {
  error.value = "";
});

async function handleSubmit() {
  error.value = "";
  okMsg.value = "";

  try {
    const base = String(baseUrl.value || "").trim().replace(/\/+$/, "");
    if (!base) throw new Error("Configura la URL del API Gateway");

    loading.value = true;

    const res = await fetch(`${base}/usuarios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: form.nombre,
        documento: form.documento,
        email: form.email,
        password: form.password,
        rol: form.rol,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "No se pudo crear el usuario");

    okMsg.value = "Usuario creado correctamente. Ya puedes iniciar sesión.";
    Object.assign(form, { nombre: "", documento: "", email: "", password: "", rol: "" });
  } catch (e) {
    error.value = e?.message || "Error creando usuario";
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

/* ── Left image panel ── */
/* 👇 Reemplaza con tu imagen: url('@/assets/salon.jpg') */
.login-image-panel {
  flex: 1 1 0;
  min-width: 0;
  position: relative;
  background-image: url('https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=1200&q=80');
  background-size: cover;
  background-position: center;
  background-color: #c8d8c8;
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
  padding: 40px 48px;
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
  margin-bottom: 28px;
}

.form-title {
  font-size: 21px;
  font-weight: 600;
  color: #1a1a1a;
  text-align: center;
  margin-bottom: 6px;
  line-height: 1.3;
}

.form-subtitle {
  font-size: 13px;
  color: #888;
  text-align: center;
  margin-bottom: 22px;
}

.form-body {
  display: flex;
  flex-direction: column;
}

.field-group { margin-bottom: 13px; }

.field-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #444;
  margin-bottom: 5px;
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
  appearance: none;
}

.form-input::placeholder { color: #bbb; }

.form-input:focus {
  border-color: #4caf50;
  box-shadow: 0 0 0 3px rgba(76, 175, 80, 0.12);
  background: #fff;
}

.form-select {
  cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23aaa' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 32px;
}

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
  margin-bottom: 12px;
}

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

.divider {
  display: flex;
  align-items: center;
  color: #ccc;
  font-size: 13px;
  margin: 14px 0;
  gap: 10px;
}
.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #e8e8e8;
}

.btn-google {
  width: 100%;
  padding: 10px 12px;
  background: #fff;
  color: #444;
  border: 1.5px solid #e0e0e0;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  font-family: 'DM Sans', sans-serif;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  transition: border-color 0.2s, box-shadow 0.2s;
  margin-bottom: 14px;
}
.btn-google:hover {
  border-color: #bbb;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
}

.terms-link {
  text-align: center;
  font-size: 12px;
  margin-bottom: 16px;
}
.terms-link a {
  color: #aaa;
  text-decoration: none;
  transition: color 0.2s;
}
.terms-link a:hover { color: #4caf50; text-decoration: underline; }

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

@media (max-width: 700px) {
  .login-image-panel { display: none; }
  .login-form-panel {
    width: 100%;
    flex: unset;
    padding: 32px 24px;
  }
}
</style>