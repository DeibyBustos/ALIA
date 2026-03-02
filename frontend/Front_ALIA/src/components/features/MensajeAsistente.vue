<template>
  <div v-if="!contenidoNormalizado" class="muted">Sin respuesta</div>

  <div v-else-if="contenidoNormalizado.exito !== undefined" class="stack">
    <div v-if="contenidoNormalizado.exito" class="ok">
      ✅ {{ contenidoNormalizado.mensaje }}
    </div>
    <div v-else class="bad">
      ❌ {{ contenidoNormalizado.mensaje }}
    </div>

    <details v-if="contenidoNormalizado.datos" style="margin-top: 8px;">
      <summary class="muted" style="cursor: pointer;">Ver detalles</summary>
      <pre class="pre" style="margin-top: 8px; font-size: 11px;">{{ JSON.stringify(contenidoNormalizado.datos, null, 2) }}</pre>
    </details>

    <div v-if="contenidoNormalizado.archivo" style="margin-top: 8px;">
      <a
        :href="descargaUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="btn secondary"
        style="display: inline-block; text-decoration: none;"
      >
        📄 Descargar {{ contenidoNormalizado.archivo.tipo }}
      </a>
    </div>
  </div>

  <div v-else-if="contenidoNormalizado.mensaje">
    {{ contenidoNormalizado.mensaje }}
  </div>

  <pre v-else class="pre" style="font-size: 11px;">{{ JSON.stringify(contenidoNormalizado, null, 2) }}</pre>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  contenido: { type: [Object, String, Number, Boolean], default: null },
  base: { type: String, required: true },
});

const contenidoNormalizado = computed(() => {
  if (props.contenido == null) return null;

  if (typeof props.contenido === "string") {
    try {
      return JSON.parse(props.contenido);
    } catch {
      return { mensaje: props.contenido };
    }
  }

  return props.contenido;
});

const descargaUrl = computed(() => {
  const c = contenidoNormalizado.value;
  if (!c?.archivo?.url_descarga) return "#";

  const base = String(props.base || "").trim().replace(/\/+$/, "");
  return `${base}${c.archivo.url_descarga}`;
});
</script>