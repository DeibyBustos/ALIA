<template>
  <div class="app-root">
    <!-- ── Sidebar ── -->
    <aside :class="['sidebar', { expanded: isExpanded }]" @click="isExpanded = !isExpanded">

      <!-- Logo: starburst igual al Figma -->
      <div class="sidebar-logo">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#c8d6e8" stroke-width="1.6">
          <circle cx="12" cy="12" r="2.5"/>
          <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
        </svg>
      </div>

      <!-- Nav icons -->
      <nav class="sidebar-nav">
        <button
          v-for="item in navItems"
          :key="item.id"
          :class="['nav-btn', { active: activeView === item.id }]"
          @click.stop="activeView = item.id; isExpanded = !isExpanded"
        >
          <component :is="item.icon" />
          <span class="nav-label">{{ item.label }}</span>
        </button>

        <!-- dots separadores visuales (igual Figma) -->
        <span class="nav-dot" />
        <span class="nav-dot" />
      </nav>

      <!-- Bottom: avatar + chevron + logout -->
      <div class="sidebar-bottom">
        <div class="avatar-wrap">
          <div class="user-avatar" :title="nombreCorto">
            <img v-if="auth?.user?.value?.avatar" :src="auth.user.value.avatar" alt="avatar" />
            <span v-else class="avatar-initials">
              {{ nombreCorto[0].toUpperCase() }}
            </span>
          </div>
          <svg class="avatar-chevron" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#2e3e55" stroke-width="3">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
          <span class="nav-label user-email">{{ nombreCorto }}</span>
        </div>
        <button class="nav-btn logout-btn" @click.stop="handleLogout" title="Cerrar sesión">
          <IconLogout />
          <span class="nav-label">Cerrar sesión</span>
        </button>
      </div>

    </aside>

    <!-- ── Main content ── -->
    <main class="main-content">
      <AsistenteAcademico
        v-if="activeView === 'asistente'"
        :base="baseUrl"
        :showToast="showToast"
        :auth="auth"
      />
      <Documentos
        v-else-if="activeView === 'documentos'"
        :base="baseUrl"
        :showToast="showToast"
        :auth="auth"
      />
      <div v-else class="view-placeholder">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1e2d42" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/></svg>
        <p>{{ navItems.find(n => n.id === activeView)?.label }}</p>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, defineComponent, h } from "vue";
import AsistenteAcademico from "@/components/features/AsistenteAcademico.vue";
import Documentos from "@/components/features/Documentos.vue";

const props = defineProps({
  auth: { type: Object, required: true },
  baseUrl: { type: String, required: true },
  showToast: { type: Function, required: true },
});

const activeView = ref("asistente");
const isExpanded = ref(false);

const nombreCorto = computed(() => {
  const nombre = props.auth?.user?.value?.nombre || props.auth?.user?.value?.correo || 'Usuario';
  const partes = nombre.trim().split(/\s+/);
  if (partes.length >= 2) return `${partes[0]} ${partes[1]}`;
  return partes[0];
});

async function handleLogout() { await props.auth.logout?.(); }

// ── Icon helper ───────────────────────────────────────────────
function icon(paths) {
  return defineComponent({
    render: () => h(
      "svg",
      { width: 17, height: 17, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.9", "stroke-linecap": "round", "stroke-linejoin": "round" },
      paths.map(([tag, attrs]) => h(tag, attrs))
    )
  });
}

const IconChat = icon([
  ["path", { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" }]
]);
const IconDocs = icon([
  ["path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }],
  ["polyline", { points: "14 2 14 8 20 8" }],
  ["line", { x1: "16", y1: "13", x2: "8", y2: "13" }],
  ["line", { x1: "16", y1: "17", x2: "8", y2: "17" }],
]);
const IconStats = icon([
  ["line", { x1: "18", y1: "20", x2: "18", y2: "10" }],
  ["line", { x1: "12", y1: "20", x2: "12", y2: "4" }],
  ["line", { x1: "6", y1: "20", x2: "6", y2: "14" }],
  ["line", { x1: "2", y1: "20", x2: "22", y2: "20" }],
]);
const IconCalendar = icon([
  ["rect", { x: "3", y: "4", width: "18", height: "18", rx: "2" }],
  ["line", { x1: "16", y1: "2", x2: "16", y2: "6" }],
  ["line", { x1: "8", y1: "2", x2: "8", y2: "6" }],
  ["line", { x1: "3", y1: "10", x2: "21", y2: "10" }],
]);
const IconSettings = icon([
  ["circle", { cx: "12", cy: "12", r: "3" }],
  ["path", { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" }],
]);
const IconLogout = icon([
  ["path", { d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" }],
  ["polyline", { points: "16 17 21 12 16 7" }],
  ["line", { x1: "21", y1: "12", x2: "9", y2: "12" }],
]);

const navItems = [
  { id: "asistente",     label: "Asistente IA",   icon: IconChat },
  { id: "documentos",    label: "Documentos",      icon: IconDocs },
  { id: "estadisticas",  label: "Estadísticas",    icon: IconStats },
  { id: "calendario",    label: "Calendario",      icon: IconCalendar },
  { id: "configuracion", label: "Configuración",   icon: IconSettings },
];
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');

.app-root {
  display: flex;
  height: 100vh;
  width: 100vw;
  background: #0c1422;
  overflow: hidden;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}

/* ── Sidebar ─────────────────────────────────────────────────── */
.sidebar {
  width: 54px;
  flex-shrink: 0;
  background: #0d1117;
  border-right: 1px solid rgba(255,255,255,0.04);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 0 12px;
  z-index: 10;
  cursor: pointer;
  overflow: hidden;
  transition: width 0.22s cubic-bezier(0.4, 0, 0.2, 1);
}

.sidebar.expanded {
  width: 200px;
  align-items: flex-start;
}

.sidebar-logo {
  margin-bottom: 20px;
  opacity: 0.85;
  padding: 0 16px;
  flex-shrink: 0;
}

/* Nav */
.sidebar-nav {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  flex: 1;
  width: 100%;
  padding: 0 7px;
}

.sidebar.expanded .sidebar-nav {
  align-items: flex-start;
}

.nav-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #1a2535;
  margin: 5px 0;
  flex-shrink: 0;
}

.nav-btn {
  position: relative;
  width: 40px;
  height: 40px;
  background: transparent;
  border: none;
  border-radius: 10px;
  color: #2e4060;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s, width 0.22s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
  overflow: hidden;
  white-space: nowrap;
}

.sidebar.expanded .nav-btn {
  width: 100%;
  justify-content: flex-start;
  gap: 10px;
  padding: 0 10px;
}

.nav-btn:hover {
  background: #111b2c;
  color: #4a6280;
}

.nav-btn.active {
  background: #162135;
  color: #4a9eff;
  box-shadow: inset 0 0 0 1px rgba(74,158,255,0.12);
}

/* ── Labels (reemplaza tooltips) ─────────────────────────────── */
.nav-label {
  font-size: 13px;
  font-weight: 500;
  color: inherit;
  white-space: nowrap;
  opacity: 0;
  max-width: 0;
  overflow: hidden;
  transition: opacity 0.18s ease, max-width 0.22s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
}

.sidebar.expanded .nav-label {
  opacity: 1;
  max-width: 140px;
}

/* Email del usuario en el bottom */
.user-email {
  font-size: 11.5px;
  font-weight: 400;
  color: #4a6280;
}

/* Tooltip (desactivado, reemplazado por nav-label) */
.nav-tooltip {
  display: none;
}

/* ── Bottom ──────────────────────────────────────────────────── */
.sidebar-bottom {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 10px 7px 0;
  border-top: 1px solid rgba(255,255,255,0.03);
}

.sidebar.expanded .sidebar-bottom {
  align-items: flex-start;
}

.avatar-wrap {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 0;
  height: 40px;
  width: 40px;
  flex-shrink: 0;
  overflow: visible;
  justify-content: center;
}

.sidebar.expanded .avatar-wrap {
  width: 100%;
  padding: 0 10px;
  justify-content: flex-start;
  overflow: hidden;
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #1c2f4e, #264880);
  border: 1.5px solid rgba(255,255,255,0.07);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.user-avatar img { width: 100%; height: 100%; object-fit: cover; }
.avatar-initials { font-size: 12px; font-weight: 600; color: #6b9fd4; }

.avatar-chevron {
  opacity: 0.5;
  flex-shrink: 0;
  transition: opacity 0.15s;
}

.sidebar.expanded .avatar-chevron {
  display: none;
}

.logout-btn { color: #1e2d40; margin-top: 2px; }
.logout-btn:hover {
  background: #1a0c0c !important;
  color: #c94444 !important;
}

/* ── Main ────────────────────────────────────────────────────── */
.main-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 18px;
  overflow: hidden;
  background: #0c1422;
}

.view-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 10px;
  color: #1e2d42;
  font-size: 13px;
}
</style>