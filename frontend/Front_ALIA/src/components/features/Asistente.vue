<template>
  <section class="card">
    <h2>🤖 Asistente Académico Inteligente</h2>
    <p class="muted">
      Chatea con el asistente para gestionar calificaciones, generar documentos,
      buscar en archivos y más usando lenguaje natural.
    </p>

    <div class="row" style="margin-top: 10px; margin-bottom: 10px;">
      <button class="btn success" @click="nuevaConversacion">
        + Nueva Conversación
      </button>

      <select
        :value="idConversacion ?? ''"
        @change="onSeleccionConversacion"
        style="flex: 2;"
      >
        <option value="">Seleccionar conversación...</option>
        <option v-for="c in conversaciones" :key="c.id" :value="c.id">
          {{ c.titulo }} ({{ c.num_mensajes }} mensajes })
        </option>
      </select>
    </div>

    <div
      style="
        background: #0b1220;
        border: 1px solid #1f2937;
        border-radius: 10px;
        padding: 16px;
        min-height: 400px;
        max-height: 500px;
        overflow-y: auto;
        margin-bottom: 10px;
      "
    >
      <div
        v-if="mensajes.length === 0"
        class="muted"
        style="text-align: center; margin-top: 50px;"
      >
        <p>👋 ¡Hola! Soy tu asistente académico inteligente.</p>
        <p>Puedo ayudarte con:</p>
        <ul style="text-align: left; display: inline-block;">
          <li>📊 Consultar datos de estudiantes, calificaciones y asistencias</li>
          <li>📄 Generar reportes en Excel, PDF o Word</li>
          <li>📚 Buscar información en documentos subidos (PDFs, Word, etc.)</li>
          <li>✏️ Agregar o eliminar calificaciones</li>
          <li>💡 Dar recomendaciones académicas</li>
        </ul>
      </div>

      <div
        v-for="(m, i) in mensajes"
        :key="i"
        :style="{
          marginBottom: '12px',
          padding: '10px',
          borderRadius: '8px',
          background: m.rol === 'user' ? '#1e293b' : '#0f172a',
          borderLeft: m.rol === 'user' ? '3px solid #3b82f6' : '3px solid #22c55e'
        }"
      >
        <div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px;">
          {{ m.rol === 'user' ? '👤 Usuario' : '🤖 Asistente' }}
          <span v-if="m.intencion" class="pill" style="margin-left: 8px;">
            {{ m.intencion }}
          </span>
        </div>

        <div v-if="m.rol === 'user'">
          {{ m.contenido }}
        </div>

        <MensajeAsistente
          v-else
          :contenido="m.contenido"
          :base="baseNormalizada"
        />
      </div>

      <div v-if="cargando" style="text-align: center; color: #94a3b8;">
        ⏳ Procesando...
      </div>

      <div ref="mensajesEndRef"></div>
    </div>

    <div class="row">
      <textarea
        v-model="mensaje"
        @keydown="onKeyDownMensaje"
        placeholder="Escribe tu mensaje aquí... (Enter para enviar)"
        style="min-height: 60px; resize: vertical;"
        :disabled="cargando"
      ></textarea>

      <button
        class="btn"
        @click="enviarMensaje"
        :disabled="cargando || !mensaje.trim()"
      >
        Enviar
      </button>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from "vue";
import MensajeAsistente from "@/components/features/MensajeAsistente.vue";

const props = defineProps({
  base: { type: String, required: true },
  showToast: { type: Function, required: true },
  auth: { type: Object, default: null },
});

const idConversacion = ref(null);
const mensajes = ref([]);
const mensaje = ref("");
const cargando = ref(false);
const conversaciones = ref([]);
const mensajesEndRef = ref(null);

const baseNormalizada = computed(() =>
  String(props.base || "").trim().replace(/\/+$/, "")
);

function scrollToBottom() {
  nextTick(() => {
    mensajesEndRef.value?.scrollIntoView({ behavior: "smooth" });
  });
}

watch(
  mensajes,
  () => {
    scrollToBottom();
  },
  { deep: true }
);

async function cargarConversaciones() {
  try {
    if (!baseNormalizada.value) return;

    const r = await fetch(`${baseNormalizada.value}/generacion/conversaciones`);
    const j = await r.json().catch(() => []);
    conversaciones.value = Array.isArray(j) ? j : [];
  } catch (e) {
    console.error("Error cargando conversaciones:", e);
    conversaciones.value = [];
  }
}

async function nuevaConversacion() {
  try {
    if (!baseNormalizada.value) throw new Error("Base URL no configurada");

    const r = await fetch(`${baseNormalizada.value}/generacion/conversacion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titulo: "Nueva conversación" }),
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || "Error creando conversación");

    idConversacion.value = j.id_conversacion;
    mensajes.value = [];
    props.showToast("Conversación creada");

    await cargarConversaciones();
  } catch (e) {
    console.error(e);
    props.showToast("Error creando conversación");
  }
}

async function cargarConversacion(id) {
  try {
    if (!baseNormalizada.value) throw new Error("Base URL no configurada");

    const r = await fetch(`${baseNormalizada.value}/generacion/conversacion/${id}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || "Error cargando conversación");

    idConversacion.value = Number(id);

    const msgs = (j.mensajes || []).map((m) => {
      let contenido = m.contenido;

      if (m.rol === "assistant" && typeof contenido === "string" && contenido.startsWith("{")) {
        try {
          contenido = JSON.parse(contenido);
        } catch {}
      }

      return {
        rol: m.rol,
        contenido,
        creado_en: m.creado_en,
      };
    });

    mensajes.value = msgs;
  } catch (e) {
    console.error(e);
    props.showToast("Error cargando conversación");
  }
}

function onSeleccionConversacion(e) {
  const value = e.target.value;
  if (!value) return;
  cargarConversacion(Number(value));
}

async function enviarMensaje() {
  const texto = mensaje.value.trim();
  if (!texto || cargando.value) return;

  if (!baseNormalizada.value) {
    props.showToast("Configura la URL del API Gateway");
    return;
  }

  if (!idConversacion.value) {
    await nuevaConversacion();
  }

  if (!idConversacion.value) {
    props.showToast("No se pudo crear la conversación");
    return;
  }

  mensaje.value = "";
  mensajes.value.push({ rol: "user", contenido: texto });

  cargando.value = true;

  try {
    const r = await fetch(`${baseNormalizada.value}/generacion/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mensaje: texto,
        id_conversacion: idConversacion.value,
      }),
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || "Error en chat");

    mensajes.value.push({
      rol: "assistant",
      contenido: j.respuesta,
      intencion: j.intencion,
      parametros: j.parametros,
    });

    cargarConversaciones();
  } catch (e) {
    console.error(e);
    mensajes.value.push({
      rol: "assistant",
      contenido: { exito: false, mensaje: `Error: ${e?.message || e}` },
    });
  } finally {
    cargando.value = false;
  }
}

function onKeyDownMensaje(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    enviarMensaje();
  }
}

watch(
  () => baseNormalizada.value,
  () => {
    idConversacion.value = null;
    mensajes.value = [];
    conversaciones.value = [];
    if (baseNormalizada.value) cargarConversaciones();
  }
);

onMounted(() => {
  if (baseNormalizada.value) cargarConversaciones();
});
</script>