<template>
  <header class="header">
    <h1>ALIA · Panel de Pruebas (RAG)</h1>

    <div class="row header-row">
      <div class="row" style="align-items:center; gap:8px;">
        <span class="muted" style="font-size:13px;">👤 {{ auth.user?.nombre }}</span>
        <span class="pill" style="font-size:11px;">
          {{ (auth.user?.roles || []).join(", ") }}
        </span>
      </div>

      <input
        type="text"
        :value="baseUrl"
        placeholder="URL del API Gateway"
        style="flex:1;"
        @blur="saveBaseUrl($event.target.value)"
      />

      <button class="btn secondary" @click="showToast('URL actualizada')">
        Usar URL
      </button>
      <button class="btn" @click="auth.logout">Salir</button>
    </div>
  </header>
</template>

<script setup>
defineProps({
  auth: { type: Object, required: true },
  baseUrl: { type: String, required: true },
  saveBaseUrl: { type: Function, required: true },
  showToast: { type: Function, required: true },
});
</script>