<template>
  <div class="asistente-wrapper">
    <div class="asistente-header">
      <div class="header-left">
        <div class="header-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
        </div>
        <h2 class="header-title">Asistente Académico</h2>
      </div>
      <div class="header-actions">
        <select :value="idConversacion ?? ''" @change="onSeleccionConversacion" class="conv-select">
          <option value="">Nueva conversación...</option>
          <option v-for="c in conversaciones" :key="c.id" :value="c.id">{{ c.titulo }} ({{ c.num_mensajes }})</option>
        </select>
        <button class="btn-icon" @click="nuevaConversacion" title="Nueva conversación">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
        </button>
        <button class="btn-icon" :class="{ active: mostrarSubida }" @click="togglePanel" title="Subir documento">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        </button>
      </div>
    </div>

    <transition name="slide-down">
      <div v-if="mostrarSubida" class="upload-panel">
        <div class="upload-grid upload-grid--top">
          <div class="upload-field">
            <label class="field-label">Archivo</label>
            <div class="file-drop" @click="fileInputRef?.click()" @dragover.prevent @drop.prevent="onDrop">
              <input ref="fileInputRef" type="file" style="display:none" @change="onFileChange" accept=".xlsx,.xls,.csv,.pdf,.docx,.txt" />
              <div v-if="archivoSeleccionado" class="file-selected">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                {{ archivoSeleccionado.name }}
              </div>
              <div v-else class="file-placeholder">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Clic o arrastra un archivo
              </div>
            </div>
          </div>
          <div class="upload-field">
            <label class="field-label">Tipo de carga</label>
            <select v-model="tipoCarga" class="field-input" @change="onTipoCambio">
              <option value="">Documento general</option>
              <option value="estudiantes">Estudiantes</option>
              <option value="docentes">Docentes</option>
              <option value="horarios">Horarios</option>
              <option value="notas">Notas / Calificaciones</option>
              <option value="planeaciones">Planeaciones</option>
            </select>
          </div>
          <template v-if="tipoCarga && tipoCarga !== 'notas' && tipoCarga !== 'planeaciones'">
            <div class="upload-field">
              <label class="field-label">Período</label>
              <div class="period-row">
                <input v-model="periodoAnio" type="number" class="field-input" placeholder="2025" style="width:76px" />
                <input v-model="periodoNombre" type="text" class="field-input" placeholder="ANUAL / P1..." />
              </div>
            </div>
          </template>
        </div>

        <transition name="fade">
          <div v-if="tipoCarga === 'notas'" class="notas-section">
            <div class="notas-section-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              El archivo debe tener las columnas: grado, asignatura, documento_estudiante, nombre_evaluacion, nota
            </div>
          </div>
        </transition>

        <transition name="fade">
          <div v-if="tipoCarga === 'planeaciones'" class="notas-section">
            <div class="notas-section-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              Columnas requeridas: grado, asignatura, titulo, semana, fecha, docente_nombres, docente_apellidos, docente_correo
            </div>
          </div>
        </transition>

        <div class="upload-footer">
          <button class="btn-upload" :disabled="subiendoArchivo || !puedeSubir" @click="subirArchivo">
            <svg v-if="!subiendoArchivo" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <span class="spinner" v-else></span>
            {{ subiendoArchivo ? 'Subiendo...' : 'Subir' }}
          </button>
          <span v-if="mensajeBloqueo" class="upload-hint">{{ mensajeBloqueo }}</span>
        </div>

        <div v-if="uploadStatus && !uploadStatus.lote" :class="['upload-status', uploadStatus.ok ? 'status-ok' : 'status-bad']">{{ uploadStatus.msg }}</div>

        <div v-if="uploadStatus?.lote" class="lote-resultado">
          <div class="lote-header" :class="uploadStatus.ok ? 'lote-ok' : 'lote-warn'">
            <div class="lote-resumen">
              <span class="lote-stat lote-stat--ok">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                {{ uploadStatus.lote.filas_ok }} {{ uploadStatus.lote.tipo === 'planeaciones' ? 'planeaciones importadas' : 'notas importadas' }}
              </span>
              <span v-if="uploadStatus.lote.filas_error > 0" class="lote-stat lote-stat--err">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {{ uploadStatus.lote.filas_error }} con error
              </span>
              <span class="lote-stat lote-stat--total">{{ uploadStatus.lote.filas_ok + uploadStatus.lote.filas_error }} filas procesadas</span>
            </div>
          </div>
          <div v-if="uploadStatus.lote.errores?.length" class="lote-errores">
            <div class="lote-errores-title">Filas con problemas</div>
            <div class="lote-errores-scroll">
              <table class="errores-table">
                <thead><tr><th>Fila</th><th>Motivo</th></tr></thead>
                <tbody>
                  <tr v-for="(e, i) in uploadStatus.lote.errores" :key="i">
                    <td class="td-fila">{{ e.fila }}</td>
                    <td class="td-msg">{{ e.motivo ?? e.mensaje }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <div ref="chatAreaRef" class="chat-area">
      <div v-if="mensajes.length === 0" class="chat-empty">
        <div class="empty-avatar"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg></div>
        <p class="empty-title">¿En qué puedo ayudarte hoy?</p>
        <div class="empty-chips">
          <button class="chip" v-for="s in sugerencias" :key="s" @click="mensaje = s">{{ s }}</button>
        </div>
      </div>
      <div v-for="(m, i) in mensajes" :key="i" :class="['message', m.rol === 'user' ? 'message--user' : 'message--bot']">
        <div class="message-avatar">
          <span v-if="m.rol === 'user'">👤</span>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>
        </div>
        <div class="message-body">
          <div class="message-meta">
            <span>{{ m.rol === 'user' ? 'Tú' : 'Asistente' }}</span>
            <span v-if="m.intencion" class="intent-pill">{{ m.intencion }}</span>
          </div>
          <div v-if="m.rol === 'user'" class="message-text">{{ m.contenido }}</div>
          <template v-else>
            <div v-if="!contenidoNorm(m.contenido)" class="muted-text">Sin respuesta</div>
            <template v-else-if="contenidoNorm(m.contenido).exito !== undefined">
              <div
                :class="['bot-status', contenidoNorm(m.contenido).exito ? 'bot-status--ok' : 'bot-status--bad']"
                v-html="formatearMensaje(contenidoNorm(m.contenido).mensaje)"
              ></div>
              <a v-if="contenidoNorm(m.contenido).archivo" :href="descargaUrl(m.contenido)" target="_blank" class="download-btn">Descargar {{ contenidoNorm(m.contenido).archivo.tipo }}</a>
            </template>
            <div
              v-else-if="contenidoNorm(m.contenido).mensaje"
              class="message-text"
              v-html="formatearMensaje(contenidoNorm(m.contenido).mensaje)"
            ></div>
            <pre v-else class="bot-pre">{{ JSON.stringify(contenidoNorm(m.contenido), null, 2) }}</pre>
          </template>
        </div>
      </div>
      <div v-if="cargando" class="message message--bot">
        <div class="message-avatar"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg></div>
        <div class="message-body"><div class="typing-dots"><span/><span/><span/></div></div>
      </div>
      <div ref="mensajesEndRef"></div>
    </div>

    <div class="chat-input-area">
      <textarea v-model="mensaje" @keydown="onKeyDownMensaje" placeholder="Escribe tu mensaje..." class="chat-textarea" :disabled="cargando" rows="1" ref="textareaRef" @input="autoResize"></textarea>
      <button class="send-btn" @click="enviarMensaje" :disabled="cargando || !mensaje.trim()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, watch, onMounted } from 'vue';
import { marked } from 'marked';

marked.setOptions({ breaks: true });

const props = defineProps({
  mensajeInicial: { type: String,   default: '' },
  base:           { type: String,   required: true },
  showToast:      { type: Function, default: (m) => console.log(m) },
  auth:           { type: Object,   default: null },
});

const idConversacion      = ref(null);
const mensajes            = ref([]);
const mensaje             = ref('');
const cargando            = ref(false);
const conversaciones      = ref([]);
const mensajesEndRef      = ref(null);
const chatAreaRef         = ref(null);
const textareaRef         = ref(null);
const mostrarSubida       = ref(false);
const fileInputRef        = ref(null);
const archivoSeleccionado = ref(null);
const tipoCarga           = ref('');
const periodoAnio         = ref(String(new Date().getFullYear()));
const periodoNombre       = ref('ANUAL');
const subiendoArchivo     = ref(false);
const uploadStatus        = ref(null);

const base = computed(() => String(props.base || '').trim().replace(/\/+$/, ''));
const puedeSubir = computed(() => !!archivoSeleccionado.value);
const mensajeBloqueo = computed(() =>
  !archivoSeleccionado.value ? 'Selecciona un archivo para continuar' : ''
);

const sugerencias = ['Generar reporte Excel', 'Agregar calificación', 'Buscar en documentos'];

// ── Detecta si la pregunta es sobre un documento ──────────────────────────────
function esConsultaDocumento(texto) {
  const lower = texto.toLowerCase();
  const keysDoc = [
    'documento', 'el archivo', 'de qué habla', 'que dice',
    'qué dice', 'qué contiene', 'que contiene',
    '.pdf', '.docx', '.xlsx', '.txt',
    'según el', 'en el documento', 'en el archivo',
    'busca en', 'buscar en', 'revisar', 'menciona',
    'manual', 'reglamento', 'normativa',
  ];
  return keysDoc.some(k => lower.includes(k));
}

function formatearMensaje(texto) {
  if (!texto) return '';
  return marked.parse(String(texto));
}

function contenidoNorm(c) {
  if (c == null) return null;
  if (typeof c === 'string') { try { return JSON.parse(c); } catch { return { mensaje: c }; } }
  return c;
}
function descargaUrl(c) {
  const n = contenidoNorm(c);
  return n?.archivo?.url_descarga ? `${base.value}${n.archivo.url_descarga}` : '#';
}
function scrollToBottom() { nextTick(() => mensajesEndRef.value?.scrollIntoView({ behavior: 'smooth' })); }
watch(mensajes, scrollToBottom, { deep: true });
function autoResize() {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 140) + 'px';
}
function togglePanel() { mostrarSubida.value = !mostrarSubida.value; }
function onTipoCambio() { uploadStatus.value = null; }

async function subirArchivo() {
  if (!puedeSubir.value || subiendoArchivo.value) return;
  subiendoArchivo.value = true;
  uploadStatus.value = null;
  try {
    if (tipoCarga.value === 'notas') {
      const fd = new FormData();
      fd.append('archivo', archivoSeleccionado.value);
      const r = await fetch(`${base.value}/generacion/importar/notas`, { method: 'POST', body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok && !j.lote_id) throw new Error(j?.error || 'Error importando notas');
      uploadStatus.value = {
        ok: j.filas_ok > 0,
        msg: `${j.filas_ok} notas importadas.`,
        lote: { ...j, tipo: 'notas' },
      };
    } else if (tipoCarga.value === 'planeaciones') {
      const fd = new FormData();
      fd.append('archivo', archivoSeleccionado.value);
      const r = await fetch(`${base.value}/generacion/importar/planeaciones`, { method: 'POST', body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok && !j.filas_ok && !j.errores) throw new Error(j?.error || 'Error importando planeaciones');
      uploadStatus.value = {
        ok: j.filas_ok > 0,
        msg: `${j.filas_ok} planeaciones importadas.`,
        lote: { filas_ok: j.filas_ok, filas_error: j.filas_error, errores: j.errores, tipo: 'planeaciones' },
      };
    } else {
      const fd = new FormData();
      fd.append('file', archivoSeleccionado.value);
      if (tipoCarga.value) {
        fd.append('etiquetas', JSON.stringify({
          import: tipoCarga.value,
          periodo: { anio: Number(periodoAnio.value), nombre: periodoNombre.value },
        }));
      }
      const r = await fetch(`${base.value}/documentos`, { method: 'POST', body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || 'Error al subir');
      uploadStatus.value = { ok: true, msg: 'Documento subido. El worker procesará la ingesta.' };
    }
    archivoSeleccionado.value = null;
    if (fileInputRef.value) fileInputRef.value.value = '';
  } catch (e) {
    uploadStatus.value = { ok: false, msg: e?.message || 'Error desconocido' };
  } finally {
    subiendoArchivo.value = false;
  }
}

async function cargarConversaciones() {
  try {
    const r = await fetch(`${base.value}/generacion/conversaciones`);
    const j = await r.json().catch(() => []);
    conversaciones.value = Array.isArray(j) ? j : [];
  } catch {}
}

async function nuevaConversacion() {
  try {
    const r = await fetch(`${base.value}/generacion/conversacion`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo: 'Nueva conversación' }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error);
    idConversacion.value = j.id_conversacion;
    mensajes.value = [];
    await cargarConversaciones();
  } catch { props.showToast?.('Error creando conversación'); }
}

async function cargarConversacion(id) {
  try {
    const r = await fetch(`${base.value}/generacion/conversacion/${id}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error();
    idConversacion.value = Number(id);
    mensajes.value = (j.mensajes || []).map(m => {
      let c = m.contenido;
      if (m.rol === 'assistant' && typeof c === 'string' && c.startsWith('{')) { try { c = JSON.parse(c); } catch {} }
      return { rol: m.rol, contenido: c };
    });
  } catch { props.showToast?.('Error cargando conversación'); }
}

function onSeleccionConversacion(e) {
  const v = e.target.value;
  if (!v) { nuevaConversacion(); return; }
  cargarConversacion(Number(v));
}

// ── Enviar mensaje — decide a qué servicio llamar ─────────────────────────────
async function enviarMensaje() {
  const txt = mensaje.value.trim();
  if (!txt || cargando.value) return;
  if (!idConversacion.value) await nuevaConversacion();
  if (!idConversacion.value) return;
  mensaje.value = '';
  nextTick(() => { if (textareaRef.value) textareaRef.value.style.height = 'auto'; });
  mensajes.value.push({ rol: 'user', contenido: txt });
  cargando.value = true;

  try {
    const esDoc = esConsultaDocumento(txt);

    const url  = esDoc
      ? `${base.value}/busqueda/consulta`
      : `${base.value}/generacion/chat`;

    const body = esDoc
      ? { pregunta: txt, id_conversacion: idConversacion.value }
      : { mensaje: txt,  id_conversacion: idConversacion.value };

    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error);

    // svc-busqueda devuelve { respuesta, citas, ... }
    // svc-generacion devuelve { respuesta: { exito, mensaje, ... }, intencion, ... }
    const contenidoFinal = esDoc
      ? { exito: true, mensaje: j.respuesta }
      : j.respuesta;

    mensajes.value.push({
      rol: 'assistant',
      contenido: contenidoFinal,
      intencion: j.intencion ?? (esDoc ? 'documentos' : null),
    });

    cargarConversaciones();
  } catch (e) {
    mensajes.value.push({ rol: 'assistant', contenido: { exito: false, mensaje: `Error: ${e?.message}` } });
  } finally {
    cargando.value = false;
  }
}

function onKeyDownMensaje(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMensaje(); } }
function onFileChange(e) { archivoSeleccionado.value = e.target.files?.[0] || null; }
function onDrop(e) { archivoSeleccionado.value = e.dataTransfer.files?.[0] || null; }

watch(() => base.value, () => {
  idConversacion.value = null; mensajes.value = []; conversaciones.value = [];
  if (base.value) cargarConversaciones();
});

onMounted(() => {
  if (base.value) cargarConversaciones();
  if (props.mensajeInicial) mensaje.value = props.mensajeInicial;
});
</script>

<style scoped>
.asistente-wrapper { display:flex; flex-direction:column; height:100%; min-height:520px; background:#0b1220; border-radius:14px; border:1px solid #1f2937; overflow:hidden; font-family:'Inter',-apple-system,sans-serif; }
.asistente-header { display:flex; align-items:center; justify-content:space-between; padding:14px 18px; border-bottom:1px solid #1f2937; background:#0d1526; flex-shrink:0; }
.header-left { display:flex; align-items:center; gap:10px; }
.header-icon { width:34px; height:34px; background:linear-gradient(135deg,#1d4ed8,#3b82f6); border-radius:8px; display:flex; align-items:center; justify-content:center; color:white; }
.header-title { font-size:14px; font-weight:600; color:#f1f5f9; margin:0; }
.header-actions { display:flex; align-items:center; gap:8px; }
.conv-select { background:#1e293b; border:1px solid #334155; border-radius:7px; color:#cbd5e1; font-size:12px; padding:6px 10px; outline:none; cursor:pointer; max-width:200px; }
.conv-select:focus { border-color:#3b82f6; }
.btn-icon { width:32px; height:32px; background:#1e293b; border:1px solid #334155; border-radius:7px; color:#94a3b8; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.15s; }
.btn-icon:hover { background:#253347; color:#e2e8f0; }
.btn-icon.active { background:#1e3a5f; border-color:#3b82f6; color:#3b82f6; }
.upload-panel { background:#0d1a2d; border-bottom:1px solid #1e3a5f; padding:16px 18px; flex-shrink:0; }
.upload-grid { display:grid; gap:12px; margin-bottom:12px; }
.upload-grid--top { grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); }
.upload-field { display:flex; flex-direction:column; gap:5px; }
.period-row { display:flex; gap:6px; }
.field-label { font-size:11px; font-weight:500; color:#64748b; text-transform:uppercase; letter-spacing:0.05em; }
.field-input { background:#1e293b; border:1px solid #334155; border-radius:7px; color:#cbd5e1; font-size:13px; padding:7px 10px; outline:none; width:100%; box-sizing:border-box; transition:border-color 0.15s; }
.field-input:focus { border-color:#3b82f6; }
.field-input:disabled { opacity:0.45; cursor:not-allowed; }
.file-drop { background:#1e293b; border:1px dashed #334155; border-radius:7px; padding:10px; cursor:pointer; transition:border-color 0.15s; min-height:46px; display:flex; align-items:center; }
.file-drop:hover { border-color:#3b82f6; }
.file-placeholder { display:flex; align-items:center; gap:8px; color:#475569; font-size:12px; }
.file-selected { display:flex; align-items:center; gap:6px; color:#22c55e; font-size:12px; overflow:hidden; }
.notas-section { background:#091525; border:1px solid #1e3a5f; border-radius:8px; padding:12px 14px; margin-bottom:12px; }
.notas-section-title { display:flex; align-items:center; gap:6px; font-size:12px; font-weight:600; color:#38bdf8; margin-bottom:6px; }
.upload-footer { display:flex; align-items:center; gap:12px; }
.upload-hint { font-size:11px; color:#64748b; }
.btn-upload { display:flex; align-items:center; gap:6px; background:linear-gradient(135deg,#1d4ed8,#3b82f6); border:none; border-radius:7px; color:white; font-size:13px; font-weight:500; padding:8px 16px; cursor:pointer; transition:opacity 0.15s; }
.btn-upload:hover:not(:disabled) { opacity:0.9; }
.btn-upload:disabled { opacity:0.4; cursor:not-allowed; }
.upload-status { margin-top:10px; font-size:12px; padding:8px 12px; border-radius:7px; }
.status-ok  { background:#052e16; color:#4ade80; border:1px solid #166534; }
.status-bad { background:#2d0a0a; color:#f87171; border:1px solid #7f1d1d; }
.lote-resultado { margin-top:10px; border-radius:8px; overflow:hidden; border:1px solid #1e3a5f; }
.lote-header { padding:10px 14px; }
.lote-ok   { background:#052e16; border-bottom:1px solid #166534; }
.lote-warn { background:#1c1208; border-bottom:1px solid #854d0e; }
.lote-resumen { display:flex; align-items:center; flex-wrap:wrap; gap:12px; }
.lote-stat { display:flex; align-items:center; gap:5px; font-size:12px; font-weight:500; }
.lote-stat--ok    { color:#4ade80; }
.lote-stat--err   { color:#fb923c; }
.lote-stat--total { color:#64748b; font-weight:400; margin-left:auto; }
.lote-errores { background:#0b1220; }
.lote-errores-title { font-size:11px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.05em; padding:8px 14px 4px; }
.lote-errores-scroll { max-height:150px; overflow-y:auto; }
.lote-errores-scroll::-webkit-scrollbar { width:3px; }
.lote-errores-scroll::-webkit-scrollbar-thumb { background:#1f2937; border-radius:3px; }
.errores-table { width:100%; border-collapse:collapse; font-size:12px; }
.errores-table th { text-align:left; padding:5px 14px; color:#475569; font-weight:500; border-bottom:1px solid #1f2937; }
.errores-table td { padding:5px 14px; border-bottom:1px solid #0f172a; }
.errores-table tr:last-child td { border-bottom:none; }
.td-fila { color:#60a5fa; font-weight:600; width:44px; }
.td-msg  { color:#f87171; }
.chat-area { flex:1; overflow-y:auto; padding:20px 18px; scroll-behavior:smooth; }
.chat-area::-webkit-scrollbar { width:4px; }
.chat-area::-webkit-scrollbar-thumb { background:#1f2937; border-radius:4px; }
.chat-empty { text-align:center; padding:40px 20px; }
.empty-avatar { width:56px; height:56px; background:#0d1d3a; border:1px solid #1e3a5f; border-radius:14px; display:flex; align-items:center; justify-content:center; margin:0 auto 16px; }
.empty-title { font-size:16px; font-weight:500; color:#cbd5e1; margin:0 0 16px; }
.empty-chips { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; }
.chip { background:#1e293b; border:1px solid #334155; border-radius:20px; color:#94a3b8; font-size:12px; padding:6px 14px; cursor:pointer; transition:all 0.15s; }
.chip:hover { background:#253347; color:#e2e8f0; border-color:#3b82f6; }
.message { display:flex; gap:10px; margin-bottom:16px; }
.message--user { flex-direction:row-reverse; }
.message-avatar { width:28px; height:28px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:13px; flex-shrink:0; }
.message--user .message-avatar { background:#1e3a5f; }
.message--bot  .message-avatar { background:#0d1a2d; border:1px solid #1e3a5f; }
.message-body { max-width:78%; }
.message-meta { display:flex; align-items:center; gap:6px; font-size:11px; color:#475569; margin-bottom:4px; }
.message--user .message-meta { flex-direction:row-reverse; }
.intent-pill { background:#1e3a5f; color:#38bdf8; font-size:10px; padding:1px 7px; border-radius:10px; border:1px solid #1e4976; }
.message-text { background:#1e293b; border-radius:10px; padding:10px 14px; font-size:13px; color:#e2e8f0; line-height:1.6; }
.message--user .message-text { background:linear-gradient(135deg,#1d4ed8,#2563eb); color:white; border-radius:10px 2px 10px 10px; }
.message--bot  .message-text { border-radius:2px 10px 10px 10px; }
.bot-status { padding:10px 14px; border-radius:8px; font-size:13px; margin-bottom:6px; line-height:1.6; }
.bot-status--ok  { background:#052e16; color:#4ade80; border:1px solid #166534; }
.bot-status--bad { background:#2d0a0a; color:#f87171; border:1px solid #7f1d1d; }
.bot-pre { background:#0f172a; border:1px solid #1f2937; border-radius:8px; padding:10px 14px; color:#94a3b8; font-size:11px; overflow-x:auto; margin:0; }
.download-btn { display:inline-block; margin-top:6px; background:#1e3a5f; border:1px solid #2563eb; color:#60a5fa; font-size:12px; padding:6px 12px; border-radius:6px; text-decoration:none; transition:background 0.15s; }
.download-btn:hover { background:#253f6e; }
.muted-text { color:#475569; font-size:13px; }
.typing-dots { display:flex; gap:4px; padding:12px 14px; background:#1e293b; border-radius:2px 10px 10px 10px; width:fit-content; }
.typing-dots span { width:6px; height:6px; background:#475569; border-radius:50%; animation:bounce 1.2s infinite ease-in-out; }
.typing-dots span:nth-child(2) { animation-delay:0.2s; }
.typing-dots span:nth-child(3) { animation-delay:0.4s; }
@keyframes bounce { 0%,80%,100%{transform:scale(0.7);opacity:0.5}40%{transform:scale(1);opacity:1} }
.chat-input-area { display:flex; align-items:flex-end; gap:8px; padding:14px 18px; border-top:1px solid #1f2937; background:#0d1526; flex-shrink:0; }
.chat-textarea { flex:1; background:#1e293b; border:1px solid #334155; border-radius:10px; color:#e2e8f0; font-size:13px; line-height:1.5; padding:10px 14px; resize:none; outline:none; max-height:140px; overflow-y:auto; transition:border-color 0.15s; font-family:inherit; }
.chat-textarea::placeholder { color:#475569; }
.chat-textarea:focus   { border-color:#3b82f6; }
.chat-textarea:disabled { opacity:0.5; }
.send-btn { width:40px; height:40px; background:linear-gradient(135deg,#1d4ed8,#3b82f6); border:none; border-radius:10px; color:white; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:opacity 0.15s,transform 0.1s; }
.send-btn:hover:not(:disabled) { opacity:0.9; transform:scale(1.04); }
.send-btn:disabled { opacity:0.35; cursor:not-allowed; }
.spinner { width:12px; height:12px; border:2px solid rgba(255,255,255,0.3); border-top-color:white; border-radius:50%; animation:spin 0.7s linear infinite; }
@keyframes spin { to{transform:rotate(360deg)} }
.slide-down-enter-active,.slide-down-leave-active { transition:all 0.25s ease; }
.slide-down-enter-from,.slide-down-leave-to { opacity:0; transform:translateY(-8px); max-height:0; }
.slide-down-enter-to,.slide-down-leave-from { max-height:600px; }
.fade-enter-active,.fade-leave-active { transition:opacity 0.2s ease; }
.fade-enter-from,.fade-leave-to { opacity:0; }
.message-text :deep(p)           { margin: 0 0 6px; }
.message-text :deep(p:last-child){ margin-bottom: 0; }
.message-text :deep(strong)      { color: #f1f5f9; font-weight: 600; }
.message-text :deep(ul),
.message-text :deep(ol)          { margin: 4px 0; padding-left: 18px; }
.message-text :deep(li)          { margin-bottom: 3px; }
.message-text :deep(h1),
.message-text :deep(h2),
.message-text :deep(h3)          { color: #f1f5f9; margin: 8px 0 4px; font-size: 13px; font-weight: 600; }
.message-text :deep(code)        { background: #0f172a; padding: 1px 5px; border-radius: 4px; font-size: 12px; color: #7dd3fc; }
.message-text :deep(hr)          { border: none; border-top: 1px solid #334155; margin: 8px 0; }
.bot-status :deep(p)             { margin: 0; }
.bot-status :deep(p + p)         { margin-top: 4px; }
.bot-status :deep(strong)        { font-weight: 600; }
</style>