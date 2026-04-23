<template>
  <div class="docs-root">

    <!-- ── Header ── -->
    <header class="docs-header">
      <div class="header-left">
        <h1 class="docs-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          Documentos
        </h1>
        <span class="docs-count" v-if="!cargando">{{ documentos.length }} archivo{{ documentos.length !== 1 ? 's' : '' }}</span>
      </div>
      <div class="header-right">
        <div class="search-wrap">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            v-model="busqueda"
            class="search-input"
            placeholder="Buscar documentos..."
            type="text"
          />
        </div>
        <div class="filter-wrap">
          <button
            v-for="f in filtros"
            :key="f.value"
            :class="['filter-btn', { active: filtroActivo === f.value }]"
            @click="filtroActivo = f.value"
          >{{ f.label }}</button>
        </div>
      </div>
    </header>

    <!-- ── Estado vacío / cargando ── -->
    <div v-if="cargando" class="state-overlay">
      <div class="spinner"/>
      <p>Cargando documentos…</p>
    </div>
    <div v-else-if="error" class="state-overlay error">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <p>{{ error }}</p>
      <button class="retry-btn" @click="cargarDocumentos">Reintentar</button>
    </div>
    <div v-else-if="documentosFiltrados.length === 0" class="state-overlay">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#1e3050" stroke-width="1.3">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      <p>No se encontraron documentos</p>
    </div>

    <!-- ── Grid de documentos ── -->
    <div v-else class="docs-grid">
      <div
        v-for="doc in documentosFiltrados"
        :key="doc.id"
        :class="['doc-card', { selected: docSeleccionado?.id === doc.id }]"
        @click="abrirPreview(doc)"
      >
        <div class="card-icon" :style="{ background: colorTipo(doc.tipo_mime) }">
          <component :is="iconoTipo(doc.tipo_mime)" />
        </div>
        <div class="card-body">
          <p class="card-titulo" :title="doc.titulo">{{ doc.titulo }}</p>
          <p class="card-meta">
            <span class="badge-tipo">{{ labelTipo(doc.tipo_mime) }}</span>
            <span class="card-size">{{ formatSize(doc.tamano_bytes) }}</span>
          </p>
          <p class="card-fecha">{{ formatFecha(doc.creado_en) }}</p>
        </div>
        <div class="card-indicator">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </div>
      </div>
    </div>

    <!-- ── Modal de previsualización ── -->
    <Transition name="modal-fade">
      <div v-if="previewAbierto && docSeleccionado" class="modal-backdrop" @click.self="cerrarPreview">
        <div class="modal-panel">

          <!-- Modal header -->
          <div class="modal-header">
            <div class="modal-title-wrap">
              <div class="modal-icon" :style="{ background: colorTipo(docSeleccionado.tipo_mime) }">
                <component :is="iconoTipo(docSeleccionado.tipo_mime)" />
              </div>
              <div>
                <h2 class="modal-title">{{ docSeleccionado.titulo }}</h2>
                <p class="modal-subtitle">
                  {{ docSeleccionado.nombre_original }} · {{ formatSize(docSeleccionado.tamano_bytes) }} · {{ formatFecha(docSeleccionado.creado_en) }}
                </p>
              </div>
            </div>
            <div class="modal-actions">
              <!-- ← CAMBIO: button en vez de <a> para evitar descarga automática en PDFs -->
              <button
                class="action-btn download-btn"
                @click="descargarDoc"
                title="Descargar"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Descargar
              </button>
              <button class="action-btn close-btn" @click="cerrarPreview" title="Cerrar">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Modal body: preview -->
          <div class="modal-body">

            <div v-if="previewCargando" class="preview-loading">
              <div class="spinner"/>
              <p>Procesando documento…</p>
            </div>

            <div v-else-if="previewError" class="state-overlay error">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <p>{{ previewError }}</p>
            </div>

            <!-- PDF -->
            <template v-else-if="esPDF(docSeleccionado.tipo_mime)">
              <div class="preview-pdf-wrap" />
            </template>

            <!-- Imagen -->
            <template v-else-if="esImagen(docSeleccionado.tipo_mime)">
              <div class="preview-img-wrap">
                <img
                  :src="`${base}/documentos/${docSeleccionado.id}/descarga`"
                  class="preview-img"
                  :alt="docSeleccionado.titulo"
                />
              </div>
            </template>

            <!-- Word -->
            <template v-else-if="esWord(docSeleccionado.tipo_mime)">
              <div class="preview-word-wrap">
                <div class="preview-word-body" v-html="previewHtml" />
              </div>
            </template>

            <!-- Excel -->
            <template v-else-if="esExcel(docSeleccionado.tipo_mime)">
              <div class="preview-excel-wrap">
                <div class="excel-tabs" v-if="previewTablas.length > 1">
                  <button
                    v-for="(hoja, i) in previewTablas"
                    :key="i"
                    :class="['excel-tab', { active: hojaActiva === i }]"
                    @click="hojaActiva = i"
                  >{{ hoja.nombre }}</button>
                </div>
                <div class="excel-table-wrap">
                  <table class="excel-table" v-if="previewTablas[hojaActiva]?.filas?.length">
                    <thead>
                      <tr>
                        <th v-for="(celda, ci) in previewTablas[hojaActiva].filas[0]" :key="ci">{{ celda }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(fila, ri) in previewTablas[hojaActiva].filas.slice(1)" :key="ri">
                        <td v-for="(celda, ci) in fila" :key="ci">{{ celda }}</td>
                      </tr>
                    </tbody>
                  </table>
                  <div v-else class="state-overlay"><p>Hoja vacía</p></div>
                </div>
              </div>
            </template>

            <!-- Otros -->
            <template v-else>
              <div class="preview-meta-panel">
                <div class="meta-grid">
                  <div class="meta-item">
                    <span class="meta-label">Nombre original</span>
                    <span class="meta-value">{{ docSeleccionado.nombre_original }}</span>
                  </div>
                  <div class="meta-item">
                    <span class="meta-label">Tamaño</span>
                    <span class="meta-value">{{ formatSize(docSeleccionado.tamano_bytes) }}</span>
                  </div>
                  <div class="meta-item">
                    <span class="meta-label">Subido el</span>
                    <span class="meta-value">{{ formatFecha(docSeleccionado.creado_en) }}</span>
                  </div>
                </div>
                <div class="preview-no-support">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#1e3050" stroke-width="1.2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="8" y1="13" x2="16" y2="13"/>
                    <line x1="8" y1="17" x2="16" y2="17"/>
                  </svg>
                  <p>Previsualización no disponible para este tipo de archivo.</p>
                  <button class="action-btn download-btn" @click="descargarDoc">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Descargar para abrir
                  </button>
                </div>
              </div>
            </template>

          </div>
        </div>
      </div>
    </Transition>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, defineComponent, h } from "vue";

const props = defineProps({
  base:      { type: String, required: true },
  showToast: { type: Function, default: () => {} },
  auth:      { type: Object, default: null },
});

// ── Estado ────────────────────────────────────────────────────
const documentos      = ref([]);
const cargando        = ref(true);
const error           = ref(null);
const busqueda        = ref("");
const filtroActivo    = ref("todos");
const docSeleccionado = ref(null);
const previewAbierto  = ref(false);
const previewHtml     = ref("");
const previewTablas   = ref([]);
const previewCargando = ref(false);
const previewError    = ref(null);
const pdfPages        = ref([]);
const pdfPageCount    = ref(0);
const hojaActiva      = ref(0);

const filtros = [
  { value: "todos",  label: "Todos" },
  { value: "pdf",    label: "PDF"   },
  { value: "word",   label: "Word"  },
  { value: "excel",  label: "Excel" },
];

// ── Fetch ─────────────────────────────────────────────────────
async function cargarDocumentos() {
  cargando.value = true;
  error.value = null;
  try {
    const headers = {};
    const token = props.auth?.token?.value || props.auth?.getToken?.();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${props.base}/documentos`, { headers });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    documentos.value = await res.json();
  } catch (e) {
    error.value = e.message || "No se pudieron cargar los documentos";
  } finally {
    cargando.value = false;
  }
}

onMounted(cargarDocumentos);

// ── Filtrado ──────────────────────────────────────────────────
const documentosFiltrados = computed(() => {
  let lista = documentos.value;
  if (filtroActivo.value !== "todos") {
    lista = lista.filter(d => {
      const m = (d.tipo_mime || "").toLowerCase();
      if (filtroActivo.value === "pdf")   return m.includes("pdf");
      if (filtroActivo.value === "word")  return m.includes("wordprocessing") || m.includes("msword");
      if (filtroActivo.value === "excel") return m.includes("spreadsheet") || m.includes("excel");
      return true;
    });
  }
  if (busqueda.value.trim()) {
    const q = busqueda.value.toLowerCase();
    lista = lista.filter(d =>
      (d.titulo || "").toLowerCase().includes(q) ||
      (d.nombre_original || "").toLowerCase().includes(q)
    );
  }
  return lista;
});

// ── Helpers auth ──────────────────────────────────────────────
function getHeaders() {
  const headers = {};
  const token = props.auth?.token?.value || props.auth?.getToken?.();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

async function fetchArrayBuffer(url) {
  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) throw new Error(`Error ${res.status} al obtener el archivo`);
  return res.arrayBuffer();
}

// ── Descarga manual (evita que <a href> dispare descarga automática en PDFs) ──
function descargarDoc() {
  if (!docSeleccionado.value) return;
  const a = document.createElement("a");
  a.href = `${props.base}/documentos/${docSeleccionado.value.id}/descarga`;
  a.target = "_blank";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ── Preview ───────────────────────────────────────────────────
async function abrirPreview(doc) {
  docSeleccionado.value = doc;
  previewAbierto.value  = true;
  previewHtml.value     = "";
  previewTablas.value   = [];
  previewError.value    = null;
  pdfPages.value        = [];
  hojaActiva.value      = 0;

  try {
    const res = await fetch(`${props.base}/documentos/${doc.id}`, { headers: getHeaders() });
    if (res.ok) docSeleccionado.value = await res.json();
  } catch {}

  const mime = docSeleccionado.value?.tipo_mime || "";
  const url  = `${props.base}/documentos/${docSeleccionado.value.id}/descarga`;

  // PDF → PDF.js sobre canvas
  if (esPDF(mime)) {
    previewCargando.value = true;
    pdfPages.value = [];
    try {
      if (!window.pdfjsLib) {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }
      const pdfjsLib = window.pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

      const arrayBuffer = await fetchArrayBuffer(url);
      const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

      previewCargando.value = false;
      pdfPages.value = new Array(pdfDoc.numPages).fill(null);

      await nextTick();

      const wrap = document.querySelector(".preview-pdf-wrap");
      if (!wrap) return;
      wrap.innerHTML = "";

      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page     = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas   = document.createElement("canvas");
        canvas.width   = viewport.width;
        canvas.height  = viewport.height;
        canvas.className = "pdf-page-canvas";
        wrap.appendChild(canvas);
        await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      }
    } catch (e) {
      previewError.value = "Error al cargar PDF: " + e.message;
      previewCargando.value = false;
    }
    return;
  }

  // Word → mammoth
  if (esWord(mime)) {
    previewCargando.value = true;
    try {
      const mammoth     = (await import("mammoth")).default ?? (await import("mammoth"));
      const arrayBuffer = await fetchArrayBuffer(url);
      const result      = await mammoth.convertToHtml({ arrayBuffer });
      previewHtml.value = result.value || "<p>El documento no tiene contenido visible.</p>";
    } catch (e) {
      previewError.value = e.message;
    } finally {
      previewCargando.value = false;
    }
    return;
  }

  // Excel → SheetJS
  if (esExcel(mime)) {
    previewCargando.value = true;
    try {
      const XLSX        = await import("xlsx");
      const arrayBuffer = await fetchArrayBuffer(url);
      const wb          = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
      previewTablas.value = wb.SheetNames.map(nombre => {
        const ws    = wb.Sheets[nombre];
        const filas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        return { nombre, filas };
      });
    } catch (e) {
      previewError.value = e.message;
    } finally {
      previewCargando.value = false;
    }
    return;
  }
}

function cerrarPreview() {
  previewAbierto.value  = false;
  docSeleccionado.value = null;
  previewHtml.value     = "";
  previewTablas.value   = [];
  previewError.value    = null;
  pdfPages.value        = [];
  pdfPageCount.value    = 0;
}

// ── Helpers ───────────────────────────────────────────────────
const esPDF    = m => (m || "").toLowerCase().includes("pdf");
const esImagen = m => (m || "").toLowerCase().startsWith("image/");
const esWord   = m => { const s = (m || "").toLowerCase(); return s.includes("wordprocessing") || s.includes("msword"); };
const esExcel  = m => { const s = (m || "").toLowerCase(); return s.includes("spreadsheet") || s.includes("excel"); };

function labelTipo(mime) {
  const m = (mime || "").toLowerCase();
  if (m.includes("pdf")) return "PDF";
  if (m.includes("wordprocessing") || m.includes("msword")) return "Word";
  if (m.includes("spreadsheet")    || m.includes("excel"))  return "Excel";
  if (m.includes("text"))    return "Texto";
  if (m.startsWith("image/")) return "Imagen";
  return "Archivo";
}

function colorTipo(mime) {
  const m = (mime || "").toLowerCase();
  if (m.includes("pdf"))              return "rgba(220,60,60,0.12)";
  if (m.includes("word") || m.includes("openxml")) return "rgba(50,120,220,0.12)";
  if (m.includes("excel") || m.includes("sheet"))  return "rgba(40,160,80,0.12)";
  if (m.startsWith("image/"))         return "rgba(180,100,220,0.12)";
  if (m.includes("text"))             return "rgba(200,140,40,0.12)";
  return "rgba(80,120,180,0.10)";
}

function formatSize(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatFecha(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CO", {
    day: "2-digit", month: "short", year: "numeric"
  });
}

function parsearEtiquetas(raw) {
  if (!raw) return {};
  try { return typeof raw === "string" ? JSON.parse(raw) : raw; }
  catch { return { valor: raw }; }
}

// ── Iconos SVG por tipo ───────────────────────────────────────
function mkIcon(paths, col = "currentColor") {
  return defineComponent({
    render: () => h("svg",
      { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: col,
        "stroke-width": "1.7", "stroke-linecap": "round", "stroke-linejoin": "round" },
      paths.map(([tag, attrs]) => h(tag, attrs))
    )
  });
}

const IconPDF = mkIcon([
  ["path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", fill: "rgba(220,60,60,0.18)" }],
  ["polyline", { points: "14 2 14 8 20 8" }],
  ["line", { x1:"9", y1:"13", x2:"15", y2:"13" }],
  ["line", { x1:"9", y1:"17", x2:"15", y2:"17" }],
], "#dc3c3c");

const IconWord = mkIcon([
  ["path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", fill: "rgba(50,120,220,0.18)" }],
  ["polyline", { points: "14 2 14 8 20 8" }],
  ["line", { x1:"9", y1:"13", x2:"15", y2:"13" }],
  ["line", { x1:"9", y1:"17", x2:"15", y2:"17" }],
], "#3278dc");

const IconExcel = mkIcon([
  ["path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", fill: "rgba(40,160,80,0.18)" }],
  ["polyline", { points: "14 2 14 8 20 8" }],
  ["line", { x1:"9", y1:"13", x2:"15", y2:"13" }],
  ["line", { x1:"9", y1:"17", x2:"15", y2:"17" }],
], "#28a050");

const IconImagen = mkIcon([
  ["rect", { x:"3", y:"3", width:"18", height:"18", rx:"2", fill:"rgba(180,100,220,0.18)" }],
  ["circle", { cx:"8.5", cy:"8.5", r:"1.5" }],
  ["polyline", { points:"21 15 16 10 5 21" }],
], "#b464dc");

const IconGenerico = mkIcon([
  ["path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", fill:"rgba(80,120,180,0.13)" }],
  ["polyline", { points: "14 2 14 8 20 8" }],
], "#5078b4");

function iconoTipo(mime) {
  const m = (mime || "").toLowerCase();
  if (m.includes("pdf"))                             return IconPDF;
  if (m.includes("word") || m.includes("openxml"))   return IconWord;
  if (m.includes("excel") || m.includes("sheet"))    return IconExcel;
  if (m.startsWith("image/"))                        return IconImagen;
  return IconGenerico;
}
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');

.docs-root {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  font-family: 'DM Sans', -apple-system, sans-serif;
  color: #c8d6e8;
  overflow: hidden;
}

.docs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.header-left { display: flex; align-items: baseline; gap: 10px; }

.docs-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 17px;
  font-weight: 600;
  color: #d4e2f4;
  margin: 0;
  letter-spacing: -0.3px;
}

.docs-count {
  font-size: 12px;
  color: #2e4060;
  font-weight: 500;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 20px;
  padding: 2px 9px;
}

.header-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

.search-wrap {
  display: flex;
  align-items: center;
  gap: 7px;
  background: #0d1520;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 9px;
  padding: 6px 12px;
  color: #3a5070;
}
.search-wrap:focus-within { border-color: rgba(74,158,255,0.25); color: #6a90b0; }
.search-input {
  background: transparent;
  border: none;
  outline: none;
  color: #c8d6e8;
  font-size: 13px;
  font-family: inherit;
  width: 180px;
}
.search-input::placeholder { color: #2e4060; }

.filter-wrap { display: flex; gap: 4px; }
.filter-btn {
  background: transparent;
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 7px;
  color: #2e4060;
  font-size: 12px;
  font-family: inherit;
  font-weight: 500;
  padding: 5px 11px;
  cursor: pointer;
  transition: all 0.15s;
}
.filter-btn:hover { background: #0d1520; color: #4a6280; }
.filter-btn.active { background: #162135; border-color: rgba(74,158,255,0.2); color: #4a9eff; }

.state-overlay {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #1e3050;
  font-size: 13px;
}
.state-overlay.error { color: #7a3030; }

.spinner {
  width: 26px;
  height: 26px;
  border: 2px solid rgba(74,158,255,0.12);
  border-top-color: #4a9eff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.retry-btn {
  margin-top: 4px;
  background: #1a0c0c;
  border: 1px solid rgba(200,60,60,0.2);
  color: #c94444;
  border-radius: 8px;
  padding: 6px 16px;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s;
}
.retry-btn:hover { background: #220e0e; }

.docs-grid {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 10px;
  align-content: start;
  padding-right: 4px;
}
.docs-grid::-webkit-scrollbar { width: 4px; }
.docs-grid::-webkit-scrollbar-track { background: transparent; }
.docs-grid::-webkit-scrollbar-thumb { background: #0d1520; border-radius: 4px; }

.doc-card {
  background: #0d1520;
  border: 1px solid rgba(255,255,255,0.04);
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 13px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, transform 0.12s;
  position: relative;
  overflow: hidden;
}
.doc-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(74,158,255,0.03), transparent);
  opacity: 0;
  transition: opacity 0.2s;
}
.doc-card:hover { background: #0f1a28; border-color: rgba(74,158,255,0.12); transform: translateY(-1px); }
.doc-card:hover::before { opacity: 1; }
.doc-card.selected { background: #111e30; border-color: rgba(74,158,255,0.25); box-shadow: 0 0 0 1px rgba(74,158,255,0.1); }

.card-icon { width: 42px; height: 42px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.card-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.card-titulo { font-size: 13px; font-weight: 500; color: #b0c4de; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card-meta { display: flex; align-items: center; gap: 6px; margin: 0; }
.badge-tipo { font-size: 10px; font-weight: 600; letter-spacing: 0.4px; text-transform: uppercase; color: #3a6080; background: rgba(255,255,255,0.04); border-radius: 4px; padding: 1px 6px; }
.card-size { font-size: 11px; color: #2a4060; font-family: 'DM Mono', monospace; }
.card-fecha { font-size: 11px; color: #1e3050; margin: 0; }
.card-indicator { color: #1a2e45; flex-shrink: 0; transition: color 0.15s; }
.doc-card:hover .card-indicator,
.doc-card.selected .card-indicator { color: #3a6080; }

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(8, 14, 24, 0.82);
  backdrop-filter: blur(8px);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal-panel {
  background: #0d1520;
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 16px;
  width: min(900px, 100%);
  height: min(680px, 90vh);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(74,158,255,0.06);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  gap: 12px;
  flex-shrink: 0;
}

.modal-title-wrap { display: flex; align-items: center; gap: 12px; min-width: 0; }
.modal-icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.modal-title { font-size: 15px; font-weight: 600; color: #d4e2f4; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.modal-subtitle { font-size: 11.5px; color: #2a4060; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: 'DM Mono', monospace; }
.modal-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  border-radius: 8px;
  font-size: 13px;
  font-family: inherit;
  font-weight: 500;
  padding: 7px 14px;
  cursor: pointer;
  transition: all 0.15s;
  text-decoration: none;
  border: 1px solid transparent;
}

.download-btn { background: #162135; border-color: rgba(74,158,255,0.18); color: #4a9eff; }
.download-btn:hover { background: #1c2d44; border-color: rgba(74,158,255,0.35); }

.close-btn { background: #0d1520; border-color: rgba(255,255,255,0.06); color: #3a5070; padding: 7px 10px; }
.close-btn:hover { background: #1a0c0c; border-color: rgba(200,60,60,0.2); color: #c94444; }

.modal-body { flex: 1; overflow: hidden; position: relative; }

.preview-img-wrap { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; padding: 20px; background: #080e18; }
.preview-img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 6px; box-shadow: 0 8px 32px rgba(0,0,0,0.5); }

.preview-meta-panel { height: 100%; overflow-y: auto; display: flex; flex-direction: column; gap: 24px; padding: 24px; }
.preview-meta-panel::-webkit-scrollbar { width: 4px; }
.preview-meta-panel::-webkit-scrollbar-thumb { background: #0d1520; border-radius: 4px; }

.meta-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px; }
.meta-item { display: flex; flex-direction: column; gap: 4px; background: #080e18; border: 1px solid rgba(255,255,255,0.04); border-radius: 10px; padding: 12px 14px; }
.meta-label { font-size: 10px; font-weight: 600; letter-spacing: 0.6px; text-transform: uppercase; color: #2a4060; }
.meta-value { font-size: 13px; color: #8aaac8; font-family: 'DM Mono', monospace; word-break: break-all; }

.preview-no-support { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; flex: 1; color: #1e3050; font-size: 13px; text-align: center; padding: 30px; }

.modal-fade-enter-active,
.modal-fade-leave-active { transition: all 0.22s cubic-bezier(0.4, 0, 0.2, 1); }
.modal-fade-enter-from,
.modal-fade-leave-to { opacity: 0; }
.modal-fade-enter-from .modal-panel,
.modal-fade-leave-to .modal-panel { transform: scale(0.96) translateY(8px); }

.preview-word-wrap { height: 100%; overflow-y: auto; background: #f8f9fa; padding: 40px 48px; }
.preview-word-wrap::-webkit-scrollbar { width: 5px; }
.preview-word-wrap::-webkit-scrollbar-thumb { background: #ccc; border-radius: 4px; }
.preview-word-body { max-width: 760px; margin: 0 auto; font-family: 'Georgia', serif; font-size: 14.5px; line-height: 1.75; color: #1a1a1a; }
.preview-word-body h1 { font-size: 22px; font-weight: 700; margin: 0 0 16px; }
.preview-word-body h2 { font-size: 18px; font-weight: 600; margin: 20px 0 10px; }
.preview-word-body h3 { font-size: 15px; font-weight: 600; margin: 16px 0 8px; }
.preview-word-body p  { margin: 0 0 10px; }
.preview-word-body table { border-collapse: collapse; width: 100%; margin: 12px 0; }
.preview-word-body td, .preview-word-body th { border: 1px solid #ddd; padding: 6px 10px; font-size: 13px; }
.preview-word-body th { background: #f0f0f0; font-weight: 600; }
.preview-word-body ul, .preview-word-body ol { padding-left: 24px; margin: 0 0 10px; }
.preview-word-body img { max-width: 100%; height: auto; border-radius: 4px; }

.preview-excel-wrap { height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.excel-tabs { display: flex; gap: 2px; padding: 8px 12px 0; background: #080e18; border-bottom: 1px solid rgba(255,255,255,0.05); flex-shrink: 0; overflow-x: auto; }
.excel-tabs::-webkit-scrollbar { height: 3px; }
.excel-tabs::-webkit-scrollbar-thumb { background: #1a2535; border-radius: 3px; }
.excel-tab { background: transparent; border: 1px solid rgba(255,255,255,0.06); border-bottom: none; border-radius: 6px 6px 0 0; color: #3a5070; font-size: 12px; font-family: 'DM Sans', sans-serif; font-weight: 500; padding: 5px 14px; cursor: pointer; white-space: nowrap; transition: all 0.15s; }
.excel-tab:hover { background: #0d1520; color: #5a7090; }
.excel-tab.active { background: #0d1520; border-color: rgba(74,158,255,0.2); color: #4a9eff; }
.excel-table-wrap { flex: 1; overflow: auto; padding: 0; }
.excel-table-wrap::-webkit-scrollbar { width: 5px; height: 5px; }
.excel-table-wrap::-webkit-scrollbar-thumb { background: #0d1520; border-radius: 4px; }
.excel-table { border-collapse: collapse; font-size: 12.5px; font-family: 'DM Mono', monospace; width: 100%; min-width: max-content; }
.excel-table thead tr { background: #080e18; position: sticky; top: 0; z-index: 1; }
.excel-table th { padding: 8px 14px; color: #4a6280; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; border-bottom: 1px solid rgba(255,255,255,0.06); border-right: 1px solid rgba(255,255,255,0.04); white-space: nowrap; text-align: left; }
.excel-table td { padding: 7px 14px; color: #8aaac8; border-bottom: 1px solid rgba(255,255,255,0.03); border-right: 1px solid rgba(255,255,255,0.03); white-space: nowrap; max-width: 280px; overflow: hidden; text-overflow: ellipsis; }
.excel-table tbody tr:hover td { background: rgba(74,158,255,0.04); }

.preview-loading { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: #2a4060; font-size: 13px; }

.preview-pdf-wrap { height: 100%; overflow-y: auto; background: #525659; display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 20px; }
.preview-pdf-wrap::-webkit-scrollbar { width: 5px; }
.preview-pdf-wrap::-webkit-scrollbar-thumb { background: #888; border-radius: 4px; }
.pdf-page-canvas { max-width: 100%; border-radius: 3px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
</style>