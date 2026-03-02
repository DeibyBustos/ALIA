<template>
  <div v-if="auth.loading.value" class="full-center">
    <div class="muted">Cargando...</div>
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

  <!-- APP -->
  <div v-else>
    <AppHeader
      :auth="auth"
      :baseUrl="baseUrl"
      :saveBaseUrl="saveBaseUrl"
      :showToast="showToast"
    />

    <main class="main">
      <Subida :base="baseUrl" @uploaded="() => {}" />
      <Asistente :base="baseUrl" :showToast="showToast" :auth="auth" />

      <div class="card"></div>
    </main>

    <Toast v-if="toastMessage" :msg="toastMessage" @done="clearToast" />
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";

import { useBaseUrl } from "@/composables/useBaseUrl";
import { useToast } from "@/composables/useToast";
import { useAuth } from "@/composables/useAuth";

import Toast from "@/components/common/Toast.vue";
import AppHeader from "@/components/layouts/AppHeader.vue";
import LoginView from "@/views/LoginView.vue";
import CrearUsuarioView from "@/views/CrearUsuarioView.vue";
import OlvidoContrasenaView from "@/views/OlvidoContrasenaView.vue";
import Asistente from "@/components/features/Asistente.vue";
import Subida from "@/components/features/Subida.vue";

const { baseUrl: baseUrlRef, saveBaseUrl } = useBaseUrl();
const { toastMessage, showToast, clearToast } = useToast();
const auth = useAuth(baseUrlRef);

const baseUrl = computed(() => baseUrlRef.value);


const authView = ref("login");

watch(
  () => auth.isAuthenticated.value,
  (isAuth) => {
    if (!isAuth) authView.value = "login";
  }
);

const emit = defineEmits(["go-create-user", "go-forgot-password"]);


</script>