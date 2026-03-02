<template>
  <section class="card">
    <h2>Subir documento</h2>

    <div class="row">
      <div>
        <label>Archivo</label>
        <input ref="fileInputRef" type="file" />
      </div>

      <div>
        <label>Título (opcional)</label>
        <input
          v-model="titulo"
          type="text"
          placeholder="Mi documento"
        />
      </div>
    </div>

    <!-- Sección de etiquetado rápido -->
    <div class="grid" style="margin-top: 10px;">
      <div class="card">
        <h3 style="margin-top: 0; font-size: 14px;">Tipo de carga</h3>
        <label>¿Deseas que este archivo dispare una importación?</label>

        <select v-model="tipoCarga">
          <option value="">Ninguno (solo RAG)</option>
          <option value="estudiantes">Importar estudiantes</option>
          <option value="docentes">Importar docentes</option>
        </select>

        <div v-if="tipoCarga" class="row" style="margin-top: 10px;">
          <div>
            <label>Período · Año</label>
            <input v-model="periodoAnio" type="number" />
          </div>

          <div>
            <label>Período · Nombre</label>
            <input
              v-model="periodoNombre"
              type="text"
              placeholder="ANUAL / P1 / P2 ..."
            />
          </div>
        </div>

        <div
          v-if="tipoCarga"
          class="card"
          style="margin-top: 10px; background: #0a0a0aff; border: 1px solid #0ea5e9;"
        >
          <p style="margin: 0; font-size: 13px;">
            Se enviará:
            <code style="padding: 2px 6px; border-radius: 4px;">
              {{ etiquetasAutoPreview }}
            </code>
          </p>
        </div>
      </div>

      <div class="card">
        <h3 style="margin-top: 0; font-size: 14px;">Etiquetas</h3>
        <label>Etiquetas JSON manual</label>
        <input
          v-model="etiquetasManual"
          type="text"
          placeholder='{"import":"estudiantes","periodo":{"anio":2025,"nombre":"ANUAL"}}'
        />
        <p class="muted" style="margin-top: 8px;"></p>
      </div>
    </div>

    <div class="flex" style="margin-top: 10px;">
      <button :disabled="busy" class="btn success" @click="subir">
        {{ busy ? "Subiendo..." : "Subir" }}
      </button>
      <span class="muted">POST <code>/documentos</code> → crea tarea de ingesta.</span>
    </div>

    <!-- salida -->
    <div id="subidaOut" class="stack" style="margin-top: 10px;" v-html="out"></div>
  </section>
</template>

<script setup>
import { computed, ref } from "vue";

const props = defineProps({
  base: { type: String, required: true },
});

const emit = defineEmits(["uploaded"]);

/* ===== Utils ===== */
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/* ===== State ===== */
const fileInputRef = ref(null);

const titulo = ref("");
const etiquetasManual = ref("");

const busy = ref(false);
const out = ref("");

const tipoCarga = ref("");
const periodoAnio = ref(String(new Date().getFullYear()));
const periodoNombre = ref("ANUAL");

const etiquetasAutoPreview = computed(() => {
  return JSON.stringify({
    import: tipoCarga.value,
    periodo: {
      anio: Number(periodoAnio.value),
      nombre: periodoNombre.value,
    },
  });
});

/* ===== Actions ===== */
async function subir() {
  const file = fileInputRef.value?.files?.[0];

  if (!file) {
    out.value = `<div class="bad">Selecciona un archivo</div>`;
    return;
  }

  const fd = new FormData();
  fd.append("file", file);

  const tituloLimpio = (titulo.value || "").trim();
  if (tituloLimpio) fd.append("titulo", tituloLimpio);

  // Construir etiquetas
  const et = (etiquetasManual.value || "").trim();
  let etiquetasJSON = null;

  if (et) {
    // Usuario escribió JSON manual
    etiquetasJSON = et;
    console.log("📤 Enviando etiquetas manuales:", et);
  } else if (tipoCarga.value) {
    // Construir automáticamente
    const etiquetasAuto = {
      import: tipoCarga.value,
      periodo: {
        anio: Number(periodoAnio.value) || new Date().getFullYear(),
        nombre: periodoNombre.value || "ANUAL",
      },
    };
    etiquetasJSON = JSON.stringify(etiquetasAuto);
    console.log("📤 Enviando etiquetas automáticas:", etiquetasJSON);
  } else {
    console.log("⚠️ No se enviaron etiquetas (tipoCarga vacío)");
  }

  if (etiquetasJSON) {
    fd.append("etiquetas", etiquetasJSON);
  }

  busy.value = true;
  out.value = `<div class="muted">Subiendo...</div>`;

  try {
    const base = String(props.base || "").trim().replace(/\/+$/, "");
    if (!base) throw new Error("Base URL no configurada");

    console.log("🚀 Iniciando subida a:", `${base}/documentos`);
    console.log("📦 FormData contiene:");
    for (const [key, value] of fd.entries()) {
      console.log(`  ${key}:`, value instanceof File ? `[File: ${value.name}]` : value);
    }

    const r = await fetch(`${base}/documentos`, {
      method: "POST",
      body: fd,
    });

    const j = await r.json().catch(() => ({}));
    console.log("📥 Respuesta del servidor:", j);

    if (!r.ok) throw new Error(j?.error || "Error al subir");

    out.value = `
      <div class="ok">✅ Subida OK</div>
      <div class="pre">${escapeHtml(JSON.stringify(j, null, 2))}</div>
      <div class="muted">Ahora el worker de ingesta tomará la tarea automáticamente.</div>
      ${
        etiquetasJSON
          ? `<div class="muted">Etiquetas enviadas: <code>${escapeHtml(etiquetasJSON)}</code></div>`
          : ""
      }
    `;

    // limpiar
    if (fileInputRef.value) fileInputRef.value.value = "";
    titulo.value = "";
    etiquetasManual.value = "";
    tipoCarga.value = "";

    emit("uploaded", j);
  } catch (e) {
    console.error("❌ Error en subida:", e);
    out.value = `<div class="bad">Error: ${escapeHtml(e?.message || String(e))}</div>`;
  } finally {
    busy.value = false;
  }
}
</script>