<template>
  <div class="auth-page">
    <div class="card auth-card">
      <h1 style="margin-top: 0; text-align: center;">¿Olvidaste tu contraseña?</h1>
      <p class="muted" style="text-align: center; margin-bottom: 20px;">
        Ingresa tu correo para iniciar el proceso de recuperación
      </p>

      <form @submit.prevent="handleSubmit">
        <div style="margin-bottom: 16px;">
          <label>Correo electrónico</label>
          <input
            v-model="correo"
            type="email"
            placeholder="usuario@alia.com"
            required
          />
        </div>

        <div v-if="error" class="bad" style="margin-bottom: 12px; padding: 10px;">
          {{ error }}
        </div>

        <div v-if="okMsg" class="ok" style="margin-bottom: 12px; padding: 10px;">
          {{ okMsg }}
        </div>

        <button class="btn" type="submit" :disabled="loading" style="width: 100%;">
          {{ loading ? "Enviando..." : "Enviar recuperación" }}
        </button>
      </form>

      <div style="margin-top: 16px; text-align: center;">
        <button type="button" class="btn secondary" @click="emit('back-to-login')">
          Volver al inicio de sesión
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { useBaseUrl } from "@/composables/useBaseUrl";

defineProps({
  showToast: { type: Function, default: null },
});

const emit = defineEmits(["back-to-login"]);

const { baseUrl } = useBaseUrl();

const correo = ref("");
const loading = ref(false);
const error = ref("");
const okMsg = ref("");

async function handleSubmit() {
  error.value = "";
  okMsg.value = "";

  try {
    const base = String(baseUrl.value || "").trim().replace(/\/+$/, "");
    if (!base) throw new Error("Configura la URL del API Gateway");

    loading.value = true;

    // Ajusta endpoint según tu backend real
    const res = await fetch(`${base}/auth/olvide-contrasena`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ correo: correo.value }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "No se pudo iniciar la recuperación");

    okMsg.value =
      data.mensaje ||
      "Si el correo existe, se enviaron instrucciones de recuperación.";
    correo.value = "";
  } catch (e) {
    error.value = e?.message || "Error al solicitar recuperación";
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.auth-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
.auth-card {
  width: 100%;
  max-width: 460px;
}
</style>