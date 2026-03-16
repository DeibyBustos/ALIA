<template>
  <div
    :class="['config-card', estado === 'proximamente' ? 'proxima' : 'disponible']"
    @click="estado === 'activo' && emit('click')"
  >
    <div class="card-icon">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <component v-for="(shape, i) in paths" :key="i" :is="shape.tag" v-bind="shape.attrs" />
      </svg>
    </div>
    <div class="card-body">
      <p class="card-titulo">{{ titulo }}</p>
      <p class="card-desc">{{ descripcion }}</p>
    </div>
    <span v-if="estado === 'proximamente'" class="card-badge">Próximamente</span>
    <svg v-else class="card-arrow" width="13" height="13" viewBox="0 0 24 24"
         fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  titulo:      String,
  descripcion: String,
  icono:       String,
  estado:      { type: String, default: 'activo' },
});

const emit = defineEmits(['click']);

const iconPaths = {
  lock:     [{ tag: 'rect', attrs: { x:'3', y:'11', width:'18', height:'11', rx:'2', ry:'2' } }, { tag: 'path', attrs: { d:'M7 11V7a5 5 0 0 1 10 0v4' } }],
  chat:     [{ tag: 'path', attrs: { d:'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' } }],
  docs:     [{ tag: 'path', attrs: { d:'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' } }, { tag: 'polyline', attrs: { points:'14 2 14 8 20 8' } }],
  upload:   [{ tag: 'polyline', attrs: { points:'16 16 12 12 8 16' } }, { tag: 'line', attrs: { x1:'12', y1:'12', x2:'12', y2:'21' } }, { tag: 'path', attrs: { d:'M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3' } }],
  users:    [{ tag: 'path', attrs: { d:'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' } }, { tag: 'circle', attrs: { cx:'9', cy:'7', r:'4' } }, { tag: 'path', attrs: { d:'M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' } }],
  check:    [{ tag: 'path', attrs: { d:'M22 11.08V12a10 10 0 1 1-5.93-9.14' } }, { tag: 'polyline', attrs: { points:'22 4 12 14.01 9 11.01' } }],
  star:     [{ tag: 'polygon', attrs: { points:'12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2' } }],
  calendar: [{ tag: 'rect', attrs: { x:'3', y:'4', width:'18', height:'18', rx:'2' } }, { tag: 'line', attrs: { x1:'16', y1:'2', x2:'16', y2:'6' } }, { tag: 'line', attrs: { x1:'8', y1:'2', x2:'8', y2:'6' } }, { tag: 'line', attrs: { x1:'3', y1:'10', x2:'21', y2:'10' } }],
  plan:     [{ tag: 'line', attrs: { x1:'8', y1:'6', x2:'21', y2:'6' } }, { tag: 'line', attrs: { x1:'8', y1:'12', x2:'21', y2:'12' } }, { tag: 'line', attrs: { x1:'8', y1:'18', x2:'21', y2:'18' } }, { tag: 'line', attrs: { x1:'3', y1:'6', x2:'3.01', y2:'6' } }, { tag: 'line', attrs: { x1:'3', y1:'12', x2:'3.01', y2:'12' } }, { tag: 'line', attrs: { x1:'3', y1:'18', x2:'3.01', y2:'18' } }],
  book:     [{ tag: 'path', attrs: { d:'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z' } }, { tag: 'path', attrs: { d:'M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z' } }],
  stats:    [{ tag: 'line', attrs: { x1:'18', y1:'20', x2:'18', y2:'10' } }, { tag: 'line', attrs: { x1:'12', y1:'20', x2:'12', y2:'4' } }, { tag: 'line', attrs: { x1:'6', y1:'20', x2:'6', y2:'14' } }, { tag: 'line', attrs: { x1:'2', y1:'20', x2:'22', y2:'20' } }],
  server:   [{ tag: 'rect', attrs: { x:'2', y:'2', width:'20', height:'8', rx:'2', ry:'2' } }, { tag: 'rect', attrs: { x:'2', y:'14', width:'20', height:'8', rx:'2', ry:'2' } }, { tag: 'line', attrs: { x1:'6', y1:'6', x2:'6.01', y2:'6' } }, { tag: 'line', attrs: { x1:'6', y1:'18', x2:'6.01', y2:'18' } }],
  school:   [{ tag: 'path', attrs: { d:'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' } }, { tag: 'polyline', attrs: { points:'9 22 9 12 15 12 15 22' } }],
  log:      [{ tag: 'path', attrs: { d:'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' } }, { tag: 'polyline', attrs: { points:'14 2 14 8 20 8' } }, { tag: 'line', attrs: { x1:'16', y1:'13', x2:'8', y2:'13' } }, { tag: 'line', attrs: { x1:'16', y1:'17', x2:'8', y2:'17' } }],
  sliders:  [{ tag: 'line', attrs: { x1:'4', y1:'21', x2:'4', y2:'14' } }, { tag: 'line', attrs: { x1:'4', y1:'10', x2:'4', y2:'3' } }, { tag: 'line', attrs: { x1:'12', y1:'21', x2:'12', y2:'12' } }, { tag: 'line', attrs: { x1:'12', y1:'8', x2:'12', y2:'3' } }, { tag: 'line', attrs: { x1:'20', y1:'21', x2:'20', y2:'16' } }, { tag: 'line', attrs: { x1:'20', y1:'12', x2:'20', y2:'3' } }, { tag: 'line', attrs: { x1:'1', y1:'14', x2:'7', y2:'14' } }, { tag: 'line', attrs: { x1:'9', y1:'8', x2:'15', y2:'8' } }, { tag: 'line', attrs: { x1:'17', y1:'16', x2:'23', y2:'16' } }],
};

const paths = computed(() => iconPaths[props.icono] || []);
</script>

<style scoped>
.config-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.04);
  background: #0d1117;
  transition: background 0.15s, border-color 0.15s, transform 0.1s;
}

.config-card.disponible { cursor: pointer; }
.config-card.disponible:hover {
  background: #111b2c;
  border-color: rgba(74,158,255,0.15);
  transform: translateY(-1px);
}
.config-card.proxima { opacity: 0.45; cursor: default; }

.card-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(74,158,255,0.07);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #3a6090;
  flex-shrink: 0;
}

.config-card.disponible:hover .card-icon {
  color: #4a9eff;
  background: rgba(74,158,255,0.12);
}

.card-body { flex: 1; min-width: 0; }

.card-titulo {
  font-size: 13px;
  font-weight: 500;
  color: #8aa0b8;
  margin: 0 0 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.config-card.disponible:hover .card-titulo { color: #c8d6e8; }

.card-desc {
  font-size: 11px;
  color: #2a3a50;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-arrow { color: #1e2d40; flex-shrink: 0; }
.config-card.disponible:hover .card-arrow { color: #4a9eff; }

.card-badge {
  font-size: 10px;
  font-weight: 600;
  color: #2a3a50;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.04);
  padding: 2px 7px;
  border-radius: 20px;
  flex-shrink: 0;
  white-space: nowrap;
}
</style>