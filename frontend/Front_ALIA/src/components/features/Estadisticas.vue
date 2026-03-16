<template>
  <div class="stats-root">

    <!-- Header -->
    <div class="stats-header">
      <div class="stats-header-left">
        <div class="stats-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <line x1="18" y1="20" x2="18" y2="10"/>
            <line x1="12" y1="20" x2="12" y2="4"/>
            <line x1="6"  y1="20" x2="6"  y2="14"/>
            <line x1="2"  y1="20" x2="22" y2="20"/>
          </svg>
        </div>
        <div>
          <h2 class="stats-title">Estadísticas</h2>
          <p class="stats-sub">Resumen académico en tiempo real</p>
        </div>
      </div>
      <button class="btn-refresh" @click="cargarTodo" :disabled="cargando">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             :class="{ spinning: cargando }">
          <polyline points="23 4 23 10 17 10"/>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
        </svg>
        {{ cargando ? 'Cargando...' : 'Actualizar' }}
      </button>
    </div>

    <!-- Error -->
    <div v-if="errorGlobal" class="error-banner">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      {{ errorGlobal }}
    </div>

    <!-- KPI Cards -->
    <div class="kpi-grid">
      <div v-for="kpi in kpis" :key="kpi.label" class="kpi-card">
        <div class="kpi-icon" :style="{ background: kpi.bg, color: kpi.color }">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <component v-for="(s, i) in kpi.paths" :key="i" :is="s.tag" v-bind="s.attrs"/>
          </svg>
        </div>
        <div class="kpi-body">
          <p class="kpi-value">
            <span v-if="cargando" class="kpi-skeleton"/>
            <span v-else>{{ Number(kpi.value).toLocaleString() }}</span>
          </p>
          <p class="kpi-label">{{ kpi.label }}</p>
        </div>
      </div>
    </div>

    <!-- Charts -->
    <div class="charts-grid">

      <!-- Estudiantes por grado -->
      <div class="chart-card chart-card--wide">
        <div class="chart-header">
          <p class="chart-title">Estudiantes matriculados por grado</p>
          <span class="chart-badge" v-if="estudiantesPorGrado.length">
            {{ estudiantesPorGrado.length }} grados
          </span>
        </div>
        <div class="canvas-wrap" ref="wrapGrados">
          <canvas ref="cGrados"></canvas>
          <EmptyState v-if="!cargando && !estudiantesPorGrado.length" icon="users" texto="No hay matrículas activas registradas"/>
          <SkeletonCanvas v-if="cargando"/>
        </div>
      </div>

      <!-- Asistencias donut -->
      <div class="chart-card">
        <div class="chart-header">
          <p class="chart-title">Distribución de asistencias</p>
          <span class="chart-badge" v-if="totalAsistencias">
            {{ totalAsistencias.toLocaleString() }} registros
          </span>
        </div>
        <div class="donut-wrap">
          <div class="donut-canvas-area" ref="wrapAsistencias">
            <canvas ref="cAsistencias"></canvas>
            <EmptyState v-if="!cargando && !asistenciasPorEstado.length" icon="check" texto="No hay asistencias registradas aún"/>
            <SkeletonCanvas v-if="cargando"/>
          </div>
          <div v-if="asistenciasPorEstado.length" class="donut-legend">
            <div v-for="(item, i) in asistenciasPorEstado" :key="item.estado" class="legend-row">
              <span class="legend-dot" :style="{ background: donutColors[i % donutColors.length] }"/>
              <span class="legend-name">{{ estadoLabel(item.estado) }}</span>
              <span class="legend-pct">{{ pct(item.total) }}%</span>
              <span class="legend-num">{{ Number(item.total).toLocaleString() }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Promedios por grado -->
      <div class="chart-card chart-card--wide">
        <div class="chart-header">
          <p class="chart-title">Promedio de calificaciones por grado</p>
          <div class="chart-legend-inline">
            <span class="dot-legend" style="background:#4caf50"/> ≥ 4.0
            <span class="dot-legend" style="background:#f59e0b"/> ≥ 3.0
            <span class="dot-legend" style="background:#ef4444"/> &lt; 3.0
          </div>
        </div>
        <div class="canvas-wrap" ref="wrapPromedios">
          <canvas ref="cPromedios"></canvas>
          <EmptyState v-if="!cargando && !promediosPorGrado.length" icon="star" texto="No hay calificaciones registradas aún"/>
          <SkeletonCanvas v-if="cargando"/>
        </div>
      </div>

      <!-- Top asignaturas -->
      <div class="chart-card">
        <div class="chart-header">
          <p class="chart-title">Top asignaturas por promedio</p>
        </div>
        <div class="bar-list" v-if="!cargando && topAsignaturas.length">
          <div v-for="(item, idx) in topAsignaturas" :key="item.asignatura" class="bar-row">
            <span class="bar-rank" :style="{ color: idx < 3 ? '#f59e0b' : '#2a3a50' }">
              {{ idx + 1 }}
            </span>
            <span class="bar-name" :title="item.asignatura">{{ item.asignatura }}</span>
            <div class="bar-track">
              <div class="bar-fill"
                   :style="{ width: barWidth(item.promedio) + '%', background: colorNota(item.promedio) }"/>
            </div>
            <span class="bar-score" :style="{ color: colorNota(item.promedio) }">
              {{ item.promedio }}
            </span>
          </div>
        </div>
        <div v-else-if="cargando" class="skeleton-bars">
          <div v-for="n in 7" :key="n" class="skeleton-row" :style="{ width: (30 + n * 8) + '%' }"/>
        </div>
        <EmptyState v-else icon="star" texto="No hay calificaciones registradas aún"/>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, defineComponent, h } from 'vue';

// ── Sub-componentes inline ────────────────────────────────────
const EmptyState = defineComponent({
  props: { icon: String, texto: String },
  setup(props) {
    const icons = {
      users: [['path', { d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' }], ['circle', { cx: '9', cy: '7', r: '4' }]],
      check: [['path', { d: 'M22 11.08V12a10 10 0 1 1-5.93-9.14' }], ['polyline', { points: '22 4 12 14.01 9 11.01' }]],
      star:  [['polygon', { points: '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2' }]],
    };
    return () => h('div', { style: 'display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 16px;gap:10px' }, [
      h('svg', { width: 28, height: 28, viewBox: '0 0 24 24', fill: 'none', stroke: '#1e2d40', 'stroke-width': '1.5' },
        (icons[props.icon] || []).map(([tag, attrs]) => h(tag, attrs))
      ),
      h('p', { style: 'font-size:12px;color:#2a3a50;margin:0;text-align:center' }, props.texto),
    ]);
  }
});

const SkeletonCanvas = defineComponent({
  setup() {
    return () => h('div', {
      style: 'position:absolute;inset:0;background:#0d1117;border-radius:6px;display:flex;align-items:flex-end;gap:6px;padding:16px;overflow:hidden'
    }, Array.from({ length: 12 }, (_, i) =>
      h('div', {
        style: `flex:1;border-radius:3px 3px 0 0;height:${30 + ((i * 17) % 60)}%;background:linear-gradient(90deg,#111b2c 25%,#1a2535 50%,#111b2c 75%);background-size:200% 100%;animation:shimmer 1.4s infinite;animation-delay:${i * 0.06}s`
      })
    ));
  }
});

const props = defineProps({
  base:      { type: String, required: true },
  auth:      { type: Object, default: null },
  showToast: { type: Function, default: null },
});

// ── Estado ────────────────────────────────────────────────────
const cargando             = ref(false);
const errorGlobal          = ref('');
const resumen              = ref({});
const asistenciasPorEstado = ref([]);
const promediosPorGrado    = ref([]);
const estudiantesPorGrado  = ref([]);
const topAsignaturas       = ref([]);

const cGrados         = ref(null);
const cAsistencias    = ref(null);
const cPromedios      = ref(null);
const wrapGrados      = ref(null);
const wrapPromedios   = ref(null);
const wrapAsistencias = ref(null);

const donutColors = ['#4a9eff', '#ef4444', '#f59e0b', '#4caf50', '#8b5cf6'];

const totalAsistencias = computed(() =>
  asistenciasPorEstado.value.reduce((s, d) => s + Number(d.total), 0)
);

function pct(v) {
  if (!totalAsistencias.value) return 0;
  return Math.round((Number(v) / totalAsistencias.value) * 100);
}

function estadoLabel(e) {
  return { ASISTE: 'Asiste', AUSENTE: 'Ausente', TARDE: 'Tarde', JUSTIFICADO: 'Justificado' }[e] ?? e;
}

// ── KPIs ──────────────────────────────────────────────────────
const kpis = computed(() => [
  {
    label: 'Estudiantes activos', value: resumen.value.estudiantes ?? 0,
    bg: 'rgba(74,158,255,0.1)', color: '#4a9eff',
    paths: [
      { tag: 'path',   attrs: { d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' } },
      { tag: 'circle', attrs: { cx: '9', cy: '7', r: '4' } },
      { tag: 'path',   attrs: { d: 'M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' } },
    ],
  },
  {
    label: 'Docentes', value: resumen.value.docentes ?? 0,
    bg: 'rgba(76,175,80,0.1)', color: '#4caf50',
    paths: [
      { tag: 'path', attrs: { d: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z' } },
      { tag: 'path', attrs: { d: 'M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z' } },
    ],
  },
  {
    label: 'Grados activos', value: resumen.value.grados ?? 0,
    bg: 'rgba(245,158,11,0.1)', color: '#f59e0b',
    paths: [
      { tag: 'path', attrs: { d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' } },
      { tag: 'circle', attrs: { cx: '9', cy: '7', r: '4' } },
    ],
  },
  {
    label: 'Asignaturas', value: resumen.value.asignaturas ?? 0,
    bg: 'rgba(139,92,246,0.1)', color: '#8b5cf6',
    paths: [
      { tag: 'path', attrs: { d: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20' } },
      { tag: 'path', attrs: { d: 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z' } },
    ],
  },
  {
    label: 'Asistencias este mes', value: resumen.value.asistencias ?? 0,
    bg: 'rgba(20,184,166,0.1)', color: '#14b8a6',
    paths: [
      { tag: 'path',     attrs: { d: 'M22 11.08V12a10 10 0 1 1-5.93-9.14' } },
      { tag: 'polyline', attrs: { points: '22 4 12 14.01 9 11.01' } },
    ],
  },
  {
    label: 'Documentos', value: resumen.value.documentos ?? 0,
    bg: 'rgba(239,68,68,0.1)', color: '#ef4444',
    paths: [
      { tag: 'path',     attrs: { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' } },
      { tag: 'polyline', attrs: { points: '14 2 14 8 20 8' } },
    ],
  },
]);

function apiUrl(path) {
  return `${props.base.replace(/:\d+/, ':8080')}${path}`;
}

async function get(path) {
  const res = await fetch(apiUrl(path));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.data ?? data;
}

function colorNota(v) {
  const n = Number(v);
  if (n >= 4) return '#4caf50';
  if (n >= 3) return '#f59e0b';
  return '#ef4444';
}

const maxPromedio = computed(() =>
  topAsignaturas.value.length
    ? Math.max(...topAsignaturas.value.map(t => Number(t.promedio)))
    : 5
);

function barWidth(v) {
  return Math.round((Number(v) / maxPromedio.value) * 100);
}

async function cargarTodo() {
  if (cargando.value) return;
  cargando.value    = true;
  errorGlobal.value = '';
  try {
    const [r, ae, pg, eg, ta] = await Promise.all([
      get('/generacion/estadisticas/resumen'),
      get('/generacion/estadisticas/asistencias-por-estado'),
      get('/generacion/estadisticas/promedio-por-grado'),
      get('/generacion/estadisticas/estudiantes-por-grado'),
      get('/generacion/estadisticas/top-asignaturas'),
    ]);
    resumen.value              = r;
    asistenciasPorEstado.value = ae;
    promediosPorGrado.value    = pg;
    estudiantesPorGrado.value  = eg;
    topAsignaturas.value       = ta;
    await nextTick();
    dibujarTodo();
  } catch (e) {
    errorGlobal.value = 'No se pudieron cargar las estadísticas. Verifica que el backend esté activo.';
  } finally {
    cargando.value = false;
  }
}

// ── prepCanvas con soporte HiDPI ──────────────────────────────
function prepCanvas(el, wrap, cssH = 220) {
  if (!el) return null;

  const dpr = window.devicePixelRatio || 1;
  const cssW = wrap?.clientWidth || el.parentElement?.clientWidth || 400;
  const ctx = el.getContext('2d');

  el.width = Math.round(cssW * dpr);
  el.height = Math.round(cssH * dpr);

  el.style.width = `${cssW}px`;
  el.style.height = `${cssH}px`;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssW, cssH);

  ctx.imageSmoothingEnabled = true;
  ctx.textBaseline = 'alphabetic';

  ctx._cssW = cssW;
  ctx._cssH = cssH;
  return ctx;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(h) / 2, Math.abs(w) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function dibujarTodo() {
  dibujarEstudiantes();
  dibujarDonut();
  dibujarPromedios();
}

function dibujarBarrasH(canvasEl, wrapEl, data, labelKey, valueKey, colorFn, h = 220) {
  const ctx = prepCanvas(canvasEl, wrapEl, h);
  if (!ctx || !data.length) return;

  // Usar coordenadas CSS (prepCanvas ya escaló el contexto)
  const W = ctx._cssW;
  const H = h;

  const maxBarras = Math.floor((W - 60) / 24);
  const datos     = data.length > maxBarras
    ? agruparGrados(data, labelKey, valueKey, maxBarras)
    : data;

  const pad  = { t: 36, r: 14, b: 42, l: 36 };
  const aW   = W - pad.l - pad.r;
  const aH   = H - pad.t - pad.b;
  const max  = Math.max(...datos.map(d => Number(d[valueKey]))) || 1;
  const gap  = Math.max(3, Math.min(8, aW / datos.length * 0.15));
  const bW   = Math.max(12, (aW - gap * (datos.length - 1)) / datos.length);

  const pasos = 4;
  for (let i = 0; i <= pasos; i++) {
    const y   = pad.t + (aH / pasos) * i;
    const val = Math.round(max * (1 - i / pasos));
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
    ctx.fillStyle   = '#2a3a50';
    ctx.font        = '9px system-ui, sans-serif';
    ctx.textAlign   = 'right';
    ctx.fillText(val, pad.l - 5, y + 3);
  }

datos.forEach((item, i) => {
  const x    = pad.l + i * (bW + gap);
  const bH   = Math.max(2, (aH * Number(item[valueKey])) / max);
  const y    = H - pad.b - bH;
  const col  = colorFn ? colorFn(Number(item[valueKey])) : '#4a9eff';

  ctx.shadowColor   = col;
  ctx.shadowBlur    = 3;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle     = col;
  ctx.globalAlpha   = 0.85;
  roundRect(ctx, x, y, bW, bH, Math.min(4, bW / 3));
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.globalAlpha = 1;

  // valor arriba de la barra
  ctx.save();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#cfe3ff';
  ctx.font = `600 ${Math.max(10, Math.min(12, bW - 1))}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';

  if (bW >= 14) {
    const textX = Math.round(x + bW / 2);
    const textY = Math.round(y - 6);
    ctx.fillText(String(item[valueKey]), textX, textY);
  }
  ctx.restore();

  ctx.save();
  const label  = String(item[labelKey]);
  const labelX = x + bW / 2;
  const labelY = H - pad.b + 10;

  if (datos.length > 8) {
    ctx.translate(Math.round(labelX), Math.round(labelY));
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = '#3a5070';
    ctx.font = '9px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(label.length > 6 ? label.slice(0, 6) : label, 0, 0);
  } else {
    ctx.fillStyle = '#3a5070';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(label.length > 5 ? label.slice(0, 5) : label, Math.round(labelX), Math.round(labelY + 4));
  }
  ctx.restore();
});
}

function agruparGrados(data, labelKey, valueKey, maxBarras) {
  if (data.length <= maxBarras) return data;
  const chunk  = Math.ceil(data.length / maxBarras);
  const grupos = [];
  for (let i = 0; i < data.length; i += chunk) {
    const slice = data.slice(i, i + chunk);
    const total = slice.reduce((s, d) => s + Number(d[valueKey]), 0);
    grupos.push({
      [labelKey]: slice[0][labelKey],
      [valueKey]: total,
    });
  }
  return grupos;
}

function dibujarEstudiantes() {
  dibujarBarrasH(cGrados.value, wrapGrados.value, estudiantesPorGrado.value, 'grado', 'total', () => '#4a9eff');
}

function dibujarPromedios() {
  dibujarBarrasH(cPromedios.value, wrapPromedios.value, promediosPorGrado.value, 'grado', 'promedio', colorNota);
}

function dibujarDonut() {
  const ctx = prepCanvas(cAsistencias.value, wrapAsistencias.value, 180);
  if (!ctx || !asistenciasPorEstado.value.length) return;

  const W  = ctx._cssW;
  const H  = 180;
  const cx = W / 2;
  const cy = H / 2;
  const radio = Math.min(cx, cy) * 0.78;
  const total = asistenciasPorEstado.value.reduce((s, d) => s + Number(d.total), 0);

  let angle = -Math.PI / 2;
  asistenciasPorEstado.value.forEach((item, i) => {
    const slice = (Number(item.total) / total) * 2 * Math.PI;
    const gap   = 0.03;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radio, angle + gap, angle + slice - gap);
    ctx.closePath();
    ctx.fillStyle   = donutColors[i % donutColors.length];
    ctx.shadowColor = donutColors[i % donutColors.length];
    ctx.shadowBlur  = 4;
    ctx.fill();
    ctx.shadowBlur  = 0;
    angle += slice;
  });

  // Agujero central
  ctx.beginPath();
  ctx.arc(cx, cy, radio * 0.54, 0, 2 * Math.PI);
  ctx.fillStyle = '#0d1117';
  ctx.fill();

  // Total en centro
  ctx.fillStyle = '#c8d6e8';
  ctx.font      = 'bold 16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(total.toLocaleString(), cx, cy + 6);
  ctx.fillStyle = '#2a3a50';
  ctx.font      = '9px system-ui, sans-serif';
  ctx.fillText('total', cx, cy + 18);
}

onMounted(cargarTodo);
</script>

<style scoped>
@keyframes spin    { to { transform: rotate(360deg); } }
@keyframes shimmer { 0%{background-position:200% 0} to{background-position:-200% 0} }

.stats-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  padding: 4px 2px;
  color: #c8d6e8;
  gap: 20px;
  scrollbar-width: thin;
  scrollbar-color: #1a2535 transparent;
}

/* ── Header ── */
.stats-header {
  display: flex; align-items: center; justify-content: space-between;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  flex-wrap: wrap; gap: 10px;
}
.stats-header-left { display: flex; align-items: center; gap: 12px; }
.stats-icon {
  width: 36px; height: 36px; border-radius: 10px;
  background: rgba(74,158,255,0.08); border: 1px solid rgba(74,158,255,0.12);
  display: flex; align-items: center; justify-content: center;
  color: #4a9eff; flex-shrink: 0;
}
.stats-title { font-size: 15px; font-weight: 600; color: #c8d6e8; margin: 0 0 2px; }
.stats-sub   { font-size: 11px; color: #3a5070; margin: 0; }

.btn-refresh {
  display: flex; align-items: center; gap: 6px;
  background: rgba(74,158,255,0.07); border: 1px solid rgba(74,158,255,0.12);
  border-radius: 8px; color: #4a9eff; font-size: 12px; font-weight: 500;
  padding: 7px 14px; cursor: pointer; transition: background 0.15s; font-family: inherit;
}
.btn-refresh:hover:not(:disabled) { background: rgba(74,158,255,0.13); }
.btn-refresh:disabled { opacity: 0.5; cursor: not-allowed; }
.spinning { animation: spin 0.8s linear infinite; }

/* ── Error ── */
.error-banner {
  display: flex; align-items: center; gap: 8px;
  background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.14);
  border-radius: 8px; padding: 10px 14px; font-size: 12px; color: #ef4444;
}

/* ── KPIs ── */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 8px;
}
.kpi-card {
  display: flex; align-items: center; gap: 11px;
  background: #0d1117; border: 1px solid rgba(255,255,255,0.04);
  border-radius: 10px; padding: 13px; transition: border-color 0.15s;
}
.kpi-card:hover { border-color: rgba(74,158,255,0.1); }
.kpi-icon {
  width: 34px; height: 34px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.kpi-value { font-size: 20px; font-weight: 700; color: #c8d6e8; margin: 0 0 2px; line-height: 1; min-height: 20px; }
.kpi-skeleton {
  display: inline-block; width: 48px; height: 18px; border-radius: 4px;
  background: linear-gradient(90deg, #111b2c 25%, #1a2535 50%, #111b2c 75%);
  background-size: 200% 100%; animation: shimmer 1.4s infinite; vertical-align: middle;
}
.kpi-label { font-size: 11px; color: #3a5070; margin: 0; }

/* ── Charts grid ── */
.charts-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  padding-bottom: 8px;
}
@media (max-width: 700px) {
  .charts-grid { grid-template-columns: 1fr; }
}

.chart-card {
  background: #0d1117; border: 1px solid rgba(255,255,255,0.04);
  border-radius: 12px; padding: 16px;
}
.chart-card--wide { grid-column: span 2; }
@media (max-width: 700px) {
  .chart-card--wide { grid-column: span 1; }
}

.chart-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 14px; flex-wrap: wrap; gap: 6px;
}
.chart-title {
  font-size: 11px; font-weight: 600; color: #2e4060;
  text-transform: uppercase; letter-spacing: 0.08em; margin: 0;
}
.chart-badge {
  font-size: 10px; color: #2a3a50; background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.05); padding: 2px 8px; border-radius: 20px;
}
.chart-legend-inline {
  display: flex; align-items: center; gap: 10px; font-size: 10px; color: #2a3a50;
}
.dot-legend {
  display: inline-block; width: 7px; height: 7px;
  border-radius: 50%; margin-right: 3px;
}

.canvas-wrap { width: 100%; position: relative; min-height: 60px; }
.canvas-wrap canvas { width: 100% !important; display: block; }

/* Donut */
.donut-wrap { display: flex; flex-direction: column; gap: 12px; }
.donut-canvas-area { width: 100%; position: relative; min-height: 60px; }
.donut-canvas-area canvas { width: 100% !important; display: block; }
.donut-legend { display: flex; flex-direction: column; gap: 6px; }
.legend-row { display: flex; align-items: center; gap: 8px; font-size: 11px; }
.legend-dot  { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.legend-name { flex: 1; color: #6b9fd4; }
.legend-pct  { color: #4a6080; font-variant-numeric: tabular-nums; min-width: 32px; text-align: right; }
.legend-num  { color: #2a3a50; font-variant-numeric: tabular-nums; min-width: 48px; text-align: right; }

/* Bar list */
.bar-list { display: flex; flex-direction: column; gap: 9px; }
.bar-row  { display: flex; align-items: center; gap: 8px; }
.bar-rank { font-size: 10px; font-weight: 700; width: 14px; flex-shrink: 0; text-align: center; }
.bar-name {
  font-size: 11px; color: #6b9fd4; width: 90px; flex-shrink: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.bar-track { flex: 1; height: 6px; background: #111b2c; border-radius: 3px; overflow: hidden; }
.bar-fill  { height: 100%; border-radius: 3px; transition: width 0.6s ease; }
.bar-score { font-size: 11px; font-weight: 600; width: 32px; text-align: right; flex-shrink: 0; }

/* Skeleton */
.skeleton-bars { display: flex; flex-direction: column; gap: 10px; padding: 4px 0; }
.skeleton-row {
  height: 12px; border-radius: 4px;
  background: linear-gradient(90deg, #111b2c 25%, #1a2535 50%, #111b2c 75%);
  background-size: 200% 100%; animation: shimmer 1.4s infinite;
}

.no-data { text-align: center; font-size: 12px; color: #2a3a50; padding: 32px 0; margin: 0; }
</style>