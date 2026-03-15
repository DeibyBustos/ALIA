<template>
  <div v-if="auth.loading.value" class="full-center">
    <div class="loading-spinner"></div>
  </div>

  <!-- LOGIN -->
  <LoginView
    v-else-if="!auth.isAuthenticated.value && authView === 'login'"
    :auth="auth"
    :showToast="showToast"
    @go-create-user="authView = 'crear-usuario'"
    @go-forgot-password="authView = 'olvide-contrasena'"
  />

  <!-- CREAR USUARIO -->
  <CrearUsuarioView
    v-else-if="!auth.isAuthenticated.value && authView === 'crear-usuario'"
    :showToast="showToast"
    @back-to-login="authView = 'login'"
  />

  <!-- OLVIDÉ CONTRASEÑA -->
  <OlvidoContrasenaView
    v-else-if="!auth.isAuthenticated.value && authView === 'olvide-contrasena'"
    :showToast="showToast"
    @back-to-login="authView = 'login'"
  />

  <!-- ✅ APP con sidebar layout -->
  <AppLayout
    v-else
    :auth="auth"
    :baseUrl="baseUrl"
    :showToast="showToast"
  />

  <Toast v-if="toastMessage" :msg="toastMessage" @done="clearToast" />
</template>

<script setup>
import { computed, ref, watch } from "vue";

import { useBaseUrl } from "@/composables/useBaseUrl";
import { useToast } from "@/composables/useToast";
import { useAuth } from "@/composables/useAuth";

import Toast from "@/components/common/Toast.vue";
import LoginView from "@/views/LoginView.vue";
import CrearUsuarioView from "@/views/CrearUsuarioView.vue";
import OlvidoContrasenaView from "@/views/OlvidoContrasenaView.vue";
import AppLayout from "@/components/layouts/AppLayout.vue";  

const { baseUrl: baseUrlRef, saveBaseUrl } = useBaseUrl();
const { toastMessage, showToast, clearToast } = useToast();
const auth = useAuth(baseUrlRef);

const baseUrl = computed(() => baseUrlRef.value);
const authView = ref("login");

watch(
  () => auth.isAuthenticated.value,
  (isAuth) => { if (!isAuth) authView.value = "login"; }
);
</script>

<style>
.full-center {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: #080f1e;
}
.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #1e293b;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>