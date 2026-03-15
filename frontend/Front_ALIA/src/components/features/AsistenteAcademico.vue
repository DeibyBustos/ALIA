<template>
  <div class="asistente-wrapper">
    <!-- Header -->
    <div class="asistente-header">
      <div class="header-left">
        <div class="header-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
          </svg>
        </div>
        <div>
          <h2 class="header-title">Asistente Académico</h2>
          <p class="header-sub">IA · En línea</p>
        </div>
      </div>

      <div class="header-actions">
        <!-- Conversación selector -->
        <select
          :value="idConversacion ?? ''"
          @change="onSeleccionConversacion"
          class="conv-select"
        >
          <option value="">Nueva conversación...</option>
          <option v-for="c in conversaciones" :key="c.id" :value="c.id">
            {{ c.titulo }} ({{ c.num_mensajes }})
          </option>
        </select>

        <button class="btn-icon" @click="nuevaConversacion" title="Nueva conversación">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
        </button>

        <!-- Toggle subir archivo -->
        <button class="btn-icon" :class="{ active: mostrarSubida }" @click="mostrarSubida = !mostrarSubida" title="Subir documento">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Panel de subida (colapsable) -->
    <transition name="slide-down">
      <div v-if="mostrarSubida" class="upload-panel">
        <div class="upload-grid">
          <div class="upload-field">
            <label class="field-label">Archivo</label>
            <div class="file-drop" @click="fileInputRef?.click()" @dragover.prevent @drop.prevent="onDrop">
              <input ref="fileInputRef" type="file" style="display:none" @change="onFileChange" />
              <div v-if="archivoSeleccionado" class="file-selected">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span>{{ archivoSeleccionado.name }}</span>
              </div>
              <div v-else class="file-placeholder">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                <span>Haz clic o arrastra un archivo</span>
              </div>
            </div>
          </div>

          <div class="upload-field">
            <label class="field-label">Título <span class="optional">(opcional)</span></label>
            <input v-model="titulo" type="text" class="field-input" placeholder="Mi documento" />
          </div>

          <div class="upload-field">
            <label class="field-label">Tipo de importación</label>
            <select v-model="tipoCarga" class="field-input">
              <option value="">Solo RAG (sin importar)</option>
              <option value="estudiantes">Importar estudiantes</option>
              <option value="docentes">Importar docentes</option>
            </select>
          </div>

          <div v-if="tipoCarga" class="upload-field upload-field--period">
            <label class="field-label">Período</label>
            <div class="period-row">
              <input v-model="periodoAnio" type="number" class="field-input" placeholder="2025" style="width:80px" />
              <input v-model="periodoNombre" type="text" class="field-input" placeholder="ANUAL / P1 / P2..." />
            </div>
          </div>
        </div>

        <div class="upload-footer">
          <div v-if="tipoCarga" class="tags-preview">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
            <code>{{ etiquetasAutoPreview }}</code>
          </div>
          <button class="btn-upload" :disabled="subiendoArchivo || !archivoSeleccionado" @click="subirArchivo">
            <svg v-if="!subiendoArchivo" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <span class="spinner" v-else></span>
            {{ subiendoArchivo ? 'Subiendo...' : 'Subir documento' }}
          </button>
        </div>

        <div v-if="uploadStatus" :class="['upload-status', uploadStatus.ok ? 'status-ok' : 'status-bad']">
          {{ uploadStatus.ok ? '✅' : '❌' }} {{ uploadStatus.msg }}
        </div>
      </div>
    </transition>

    <!-- Área de mensajes -->
    <div ref="chatAreaRef" class="chat-area">
      <div v-if="mensajes.length === 0" class="chat-empty">
        <div class="empty-avatar">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
        </div>
        <p class="empty-title">¿En qué puedo ayudarte hoy?</p>
        <div class="empty-chips">
          <button class="chip" v-for="s in sugerencias" :key="s" @click="mensaje = s">{{ s }}</button>
        </div>
      </div>

      <div v-for="(m, i) in mensajes" :key="i" :class="['message', m.rol === 'user' ? 'message--user' : 'message--bot']">
        <div class="message-avatar">
          <span v-if="m.rol === 'user'">👤</span>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
        </div>
        <div class="message-body">
          <div class="message-meta">
            <span>{{ m.rol === 'user' ? 'Tú' : 'Asistente' }}</span>
            <span v-if="m.intencion" class="intent-pill">{{ m.intencion }}</span>
          </div>
          <!-- Contenido del mensaje: user -->
          <div v-if="m.rol === 'user'" class="message-text">{{ m.contenido }}</div>

          <!-- Contenido del mensaje: bot -->
          <template v-else>
            <div v-if="!contenidoNormalizado(m.contenido)" class="muted-text">Sin respuesta</div>
            <template v-else-if="contenidoNormalizado(m.contenido).exito !== undefined">
              <div :class="['bot-status', contenidoNormalizado(m.contenido).exito ? 'bot-status--ok' : 'bot-status--bad']">
                {{ contenidoNormalizado(m.contenido).exito ? '✅' : '❌' }}
                {{ contenidoNormalizado(m.contenido).mensaje }}
              </div>
              <details v-if="contenidoNormalizado(m.contenido).datos" class="bot-details">
                <summary>Ver detalles</summary>
                <pre>{{ JSON.stringify(contenidoNormalizado(m.contenido).datos, null, 2) }}</pre>
              </details>
              <a v-if="contenidoNormalizado(m.contenido).archivo" :href="descargaUrl(m.contenido)" target="_blank" class="download-btn">
                📄 Descargar {{ contenidoNormalizado(m.contenido).archivo.tipo }}
              </a>
            </template>
            <div v-else-if="contenidoNormalizado(m.contenido).mensaje" class="message-text">
              {{ contenidoNormalizado(m.contenido).mensaje }}
            </div>
            <pre v-else class="bot-pre">{{ JSON.stringify(contenidoNormalizado(m.contenido), null, 2) }}</pre>
          </template>
        </div>
      </div>

      <div v-if="cargando" class="message message--bot">
        <div class="message-avatar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>
        </div>
        <div class="message-body">
          <div class="typing-dots"><span></span><span></span><span></span></div>
        </div>
      </div>

      <div ref="mensajesEndRef"></div>
    </div>

    <!-- Input -->
    <div class="chat-input-area">
      <textarea
        v-model="mensaje"
        @keydown="onKeyDownMensaje"
        placeholder="Escribe tu mensaje... (Enter para enviar, Shift+Enter para nueva línea)"
        class="chat-textarea"
        :disabled="cargando"
        rows="1"
        ref="textareaRef"
        @input="autoResize"
      ></textarea>
      <button class="send-btn" @click="enviarMensaje" :disabled="cargando || !mensaje.trim()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, watch, onMounted } from "vue";

const props = defineProps({
  base: { type: String, required: true },
  showToast: { type: Function, default: (msg) => console.log(msg) },
  auth: { type: Object, default: null },
});

// ── Chat state ──────────────────────────────────────────────
const idConversacion = ref(null);
const mensajes = ref([]);
const mensaje = ref("");
const cargando = ref(false);
const conversaciones = ref([]);
const mensajesEndRef = ref(null);
const chatAreaRef = ref(null);
const textareaRef = ref(null);

// ── Upload state ─────────────────────────────────────────────
const mostrarSubida = ref(false);
const fileInputRef = ref(null);
const archivoSeleccionado = ref(null);
const titulo = ref("");
const tipoCarga = ref("");
const periodoAnio = ref(String(new Date().getFullYear()));
const periodoNombre = ref("ANUAL");
const subiendoArchivo = ref(false);
const uploadStatus = ref(null);

// ── Sugerencias ───────────────────────────────────────────────
const sugerencias = [
  "📊 Ver estadísticas generales",
  "📄 Generar reporte Excel",
  "✏️ Agregar calificación",
  "📚 Buscar en documentos",
];

// ── Computed ──────────────────────────────────────────────────
const baseNormalizada = computed(() =>
  String(props.base || "").trim().replace(/\/+$/, "")
);

const etiquetasAutoPreview = computed(() =>
  JSON.stringify({
    import: tipoCarga.value,
    periodo: { anio: Number(periodoAnio.value), nombre: periodoNombre.value },
  })
);

function contenidoNormalizado(contenido) {
  if (contenido == null) return null;
  if (typeof contenido === "string") {
    try { return JSON.parse(contenido); } catch { return { mensaje: contenido }; }
  }
  return contenido;
}

function descargaUrl(contenido) {
  const c = contenidoNormalizado(contenido);
  if (!c?.archivo?.url_descarga) return "#";
  return `${baseNormalizada.value}${c.archivo.url_descarga}`;
}

// ── Scroll ────────────────────────────────────────────────────
function scrollToBottom() {
  nextTick(() => mensajesEndRef.value?.scrollIntoView({ behavior: "smooth" }));
}
watch(mensajes, scrollToBottom, { deep: true });

// ── Auto-resize textarea ──────────────────────────────────────
function autoResize() {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 140) + "px";
}

// ── Conversaciones ────────────────────────────────────────────
async function cargarConversaciones() {
  try {
    if (!baseNormalizada.value) return;
    const r = await fetch(`${baseNormalizada.value}/generacion/conversaciones`);
    const j = await r.json().catch(() => []);
    conversaciones.value = Array.isArray(j) ? j : [];
  } catch {}
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
    if (!r.ok) throw new Error(j?.error || "Error");
    idConversacion.value = j.id_conversacion;
    mensajes.value = [];
    await cargarConversaciones();
  } catch (e) {
    props.showToast?.("Error creando conversación");
  }
}

async function cargarConversacion(id) {
  try {
    const r = await fetch(`${baseNormalizada.value}/generacion/conversacion/${id}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || "Error");
    idConversacion.value = Number(id);
    mensajes.value = (j.mensajes || []).map((m) => {
      let contenido = m.contenido;
      if (m.rol === "assistant" && typeof contenido === "string" && contenido.startsWith("{")) {
        try { contenido = JSON.parse(contenido); } catch {}
      }
      return { rol: m.rol, contenido, creado_en: m.creado_en };
    });
  } catch {
    props.showToast?.("Error cargando conversación");
  }
}

function onSeleccionConversacion(e) {
  const value = e.target.value;
  if (!value) { nuevaConversacion(); return; }
  cargarConversacion(Number(value));
}

// ── Enviar mensaje ────────────────────────────────────────────
async function enviarMensaje() {
  const texto = mensaje.value.trim();
  if (!texto || cargando.value) return;
  if (!baseNormalizada.value) { props.showToast?.("Configura la URL del API Gateway"); return; }
  if (!idConversacion.value) await nuevaConversacion();
  if (!idConversacion.value) { props.showToast?.("No se pudo crear la conversación"); return; }

  mensaje.value = "";
  nextTick(() => { if (textareaRef.value) { textareaRef.value.style.height = "auto"; } });
  mensajes.value.push({ rol: "user", contenido: texto });
  cargando.value = true;

  try {
    const r = await fetch(`${baseNormalizada.value}/generacion/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mensaje: texto, id_conversacion: idConversacion.value }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || "Error en chat");
    mensajes.value.push({ rol: "assistant", contenido: j.respuesta, intencion: j.intencion });
    cargarConversaciones();
  } catch (e) {
    mensajes.value.push({ rol: "assistant", contenido: { exito: false, mensaje: `Error: ${e?.message || e}` } });
  } finally {
    cargando.value = false;
  }
}

function onKeyDownMensaje(e) {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarMensaje(); }
}

function onFileChange(e) { archivoSeleccionado.value = e.target.files?.[0] || null; }
function onDrop(e) { archivoSeleccionado.value = e.dataTransfer.files?.[0] || null; }

async function subirArchivo() {
  if (!archivoSeleccionado.value) return;
  const fd = new FormData();
  fd.append("file", archivoSeleccionado.value);
  if (titulo.value.trim()) fd.append("titulo", titulo.value.trim());

  let etiquetasJSON = null;
  if (tipoCarga.value) {
    etiquetasJSON = JSON.stringify({
      import: tipoCarga.value,
      periodo: { anio: Number(periodoAnio.value) || new Date().getFullYear(), nombre: periodoNombre.value || "ANUAL" },
    });
    fd.append("etiquetas", etiquetasJSON);
  }

  subiendoArchivo.value = true;
  uploadStatus.value = null;

  try {
    const r = await fetch(`${baseNormalizada.value}/documentos`, { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || "Error al subir");
    uploadStatus.value = { ok: true, msg: "Documento subido correctamente. El worker procesará la ingesta." };
    archivoSeleccionado.value = null;
    titulo.value = "";
    tipoCarga.value = "";
    if (fileInputRef.value) fileInputRef.value.value = "";
  } catch (e) {
    uploadStatus.value = { ok: false, msg: e?.message || "Error desconocido" };
  } finally {
    subiendoArchivo.value = false;
  }
}

// ── Lifecycle ─────────────────────────────────────────────────
watch(() => baseNormalizada.value, () => {
  idConversacion.value = null;
  mensajes.value = [];
  conversaciones.value = [];
  if (baseNormalizada.value) cargarConversaciones();
});

onMounted(() => {
  if (baseNormalizada.value) cargarConversaciones();
});
</script>

<style scoped>
/* ── Layout ─────────────────────────────────────────────────── */
.asistente-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 520px;
  background: #0b1220;
  border-radius: 14px;
  border: 1px solid #1f2937;
  overflow: hidden;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}

/* ── Header ──────────────────────────────────────────────────── */
.asistente-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid #1f2937;
  background: #0d1526;
  flex-shrink: 0;
}
.header-left { display: flex; align-items: center; gap: 10px; }
.header-icon {
  width: 34px; height: 34px;
  background: linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%);
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  color: white;
}
.header-title { font-size: 14px; font-weight: 600; color: #f1f5f9; margin: 0; }
.header-sub { font-size: 11px; color: #22c55e; margin: 2px 0 0; display: flex; align-items: center; gap: 4px; }
.header-sub::before { content: ''; width: 6px; height: 6px; background: #22c55e; border-radius: 50%; display: inline-block; }

.header-actions { display: flex; align-items: center; gap: 8px; }

.conv-select {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 7px;
  color: #cbd5e1;
  font-size: 12px;
  padding: 6px 10px;
  outline: none;
  cursor: pointer;
  max-width: 220px;
}
.conv-select:focus { border-color: #3b82f6; }

.btn-icon {
  width: 32px; height: 32px;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 7px;
  color: #94a3b8;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
}
.btn-icon:hover { background: #253347; color: #e2e8f0; }
.btn-icon.active { background: #1e3a5f; border-color: #3b82f6; color: #3b82f6; }

/* ── Upload Panel ────────────────────────────────────────────── */
.upload-panel {
  background: #0d1a2d;
  border-bottom: 1px solid #1e3a5f;
  padding: 16px 18px;
  flex-shrink: 0;
}
.upload-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}
.upload-field { display: flex; flex-direction: column; gap: 5px; }
.upload-field--period .period-row { display: flex; gap: 6px; }
.field-label { font-size: 11px; font-weight: 500; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
.optional { font-weight: 400; color: #475569; }
.field-input {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 7px;
  color: #cbd5e1;
  font-size: 13px;
  padding: 7px 10px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}
.field-input:focus { border-color: #3b82f6; }

.file-drop {
  background: #1e293b;
  border: 1px dashed #334155;
  border-radius: 7px;
  padding: 10px;
  cursor: pointer;
  transition: border-color 0.15s;
  min-height: 48px;
  display: flex; align-items: center;
}
.file-drop:hover { border-color: #3b82f6; }
.file-placeholder { display: flex; align-items: center; gap: 8px; color: #475569; font-size: 12px; }
.file-selected { display: flex; align-items: center; gap: 6px; color: #22c55e; font-size: 12px; }

.upload-footer { display: flex; align-items: center; justify-content: space-between; }
.tags-preview { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #64748b; }
.tags-preview code { color: #38bdf8; background: #0f2744; padding: 2px 6px; border-radius: 4px; }

.btn-upload {
  display: flex; align-items: center; gap: 6px;
  background: linear-gradient(135deg, #1d4ed8, #3b82f6);
  border: none; border-radius: 7px;
  color: white; font-size: 13px; font-weight: 500;
  padding: 8px 16px; cursor: pointer;
  transition: opacity 0.15s;
}
.btn-upload:hover:not(:disabled) { opacity: 0.9; }
.btn-upload:disabled { opacity: 0.4; cursor: not-allowed; }

.upload-status {
  margin-top: 10px;
  font-size: 12px;
  padding: 8px 12px;
  border-radius: 7px;
}
.status-ok { background: #052e16; color: #4ade80; border: 1px solid #166534; }
.status-bad { background: #2d0a0a; color: #f87171; border: 1px solid #7f1d1d; }

/* ── Chat Area ───────────────────────────────────────────────── */
.chat-area {
  flex: 1;
  overflow-y: auto;
  padding: 20px 18px;
  scroll-behavior: smooth;
}
.chat-area::-webkit-scrollbar { width: 4px; }
.chat-area::-webkit-scrollbar-track { background: transparent; }
.chat-area::-webkit-scrollbar-thumb { background: #1f2937; border-radius: 4px; }

/* ── Empty state ─────────────────────────────────────────────── */
.chat-empty { text-align: center; padding: 40px 20px; }
.empty-avatar {
  width: 56px; height: 56px;
  background: #0d1d3a;
  border: 1px solid #1e3a5f;
  border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  margin: 0 auto 16px;
}
.empty-title { font-size: 16px; font-weight: 500; color: #cbd5e1; margin: 0 0 16px; }
.empty-chips { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.chip {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 20px;
  color: #94a3b8;
  font-size: 12px;
  padding: 6px 14px;
  cursor: pointer;
  transition: all 0.15s;
}
.chip:hover { background: #253347; color: #e2e8f0; border-color: #3b82f6; }

/* ── Messages ────────────────────────────────────────────────── */
.message { display: flex; gap: 10px; margin-bottom: 16px; }
.message--user { flex-direction: row-reverse; }

.message-avatar {
  width: 28px; height: 28px;
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px;
  flex-shrink: 0;
}
.message--user .message-avatar { background: #1e3a5f; }
.message--bot .message-avatar { background: #0d1a2d; border: 1px solid #1e3a5f; }

.message-body { max-width: 78%; }
.message--user .message-body { align-items: flex-end; }

.message-meta {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; color: #475569;
  margin-bottom: 4px;
}
.message--user .message-meta { flex-direction: row-reverse; }

.intent-pill {
  background: #1e3a5f;
  color: #38bdf8;
  font-size: 10px;
  padding: 1px 7px;
  border-radius: 10px;
  border: 1px solid #1e4976;
}

.message-text {
  background: #1e293b;
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 13px;
  color: #e2e8f0;
  line-height: 1.5;
}
.message--user .message-text {
  background: linear-gradient(135deg, #1d4ed8, #2563eb);
  color: white;
  border-radius: 10px 2px 10px 10px;
}
.message--bot .message-text { border-radius: 2px 10px 10px 10px; }

.bot-status {
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  margin-bottom: 6px;
}
.bot-status--ok { background: #052e16; color: #4ade80; border: 1px solid #166534; }
.bot-status--bad { background: #2d0a0a; color: #f87171; border: 1px solid #7f1d1d; }

.bot-details {
  font-size: 11px;
  color: #64748b;
  cursor: pointer;
  margin-top: 4px;
}
.bot-details summary { padding: 4px 0; }
.bot-details pre {
  background: #0f172a;
  border: 1px solid #1f2937;
  border-radius: 6px;
  padding: 8px;
  margin-top: 4px;
  color: #94a3b8;
  overflow-x: auto;
  font-size: 11px;
}

.bot-pre {
  background: #0f172a;
  border: 1px solid #1f2937;
  border-radius: 8px;
  padding: 10px 14px;
  color: #94a3b8;
  font-size: 11px;
  overflow-x: auto;
  margin: 0;
}

.download-btn {
  display: inline-block;
  margin-top: 6px;
  background: #1e3a5f;
  border: 1px solid #2563eb;
  color: #60a5fa;
  font-size: 12px;
  padding: 6px 12px;
  border-radius: 6px;
  text-decoration: none;
  transition: background 0.15s;
}
.download-btn:hover { background: #253f6e; }

.muted-text { color: #475569; font-size: 13px; }

/* ── Typing dots ─────────────────────────────────────────────── */
.typing-dots {
  display: flex; gap: 4px;
  padding: 12px 14px;
  background: #1e293b;
  border-radius: 2px 10px 10px 10px;
  width: fit-content;
}
.typing-dots span {
  width: 6px; height: 6px;
  background: #475569;
  border-radius: 50%;
  animation: bounce 1.2s infinite ease-in-out;
}
.typing-dots span:nth-child(2) { animation-delay: 0.2s; }
.typing-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes bounce { 0%, 80%, 100% { transform: scale(0.7); opacity: 0.5; } 40% { transform: scale(1); opacity: 1; } }

/* ── Input area ──────────────────────────────────────────────── */
.chat-input-area {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 14px 18px;
  border-top: 1px solid #1f2937;
  background: #0d1526;
  flex-shrink: 0;
}

.chat-textarea {
  flex: 1;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 10px;
  color: #e2e8f0;
  font-size: 13px;
  line-height: 1.5;
  padding: 10px 14px;
  resize: none;
  outline: none;
  max-height: 140px;
  overflow-y: auto;
  transition: border-color 0.15s;
  font-family: inherit;
}
.chat-textarea::placeholder { color: #475569; }
.chat-textarea:focus { border-color: #3b82f6; }
.chat-textarea:disabled { opacity: 0.5; }

.send-btn {
  width: 40px; height: 40px;
  background: linear-gradient(135deg, #1d4ed8, #3b82f6);
  border: none; border-radius: 10px;
  color: white; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  transition: opacity 0.15s, transform 0.1s;
}
.send-btn:hover:not(:disabled) { opacity: 0.9; transform: scale(1.04); }
.send-btn:disabled { opacity: 0.35; cursor: not-allowed; }

/* ── Spinner ─────────────────────────────────────────────────── */
.spinner {
  width: 12px; height: 12px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Slide transition ────────────────────────────────────────── */
.slide-down-enter-active, .slide-down-leave-active { transition: all 0.25s ease; }
.slide-down-enter-from, .slide-down-leave-to { opacity: 0; transform: translateY(-8px); max-height: 0; }
.slide-down-enter-to, .slide-down-leave-from { max-height: 400px; }
</style>