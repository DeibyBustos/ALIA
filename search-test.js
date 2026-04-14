import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

// ─── Métricas personalizadas ────────────────────────────────────────────────
const tiempoListado  = new Trend('tiempo_listado', true);
const tasaErrores    = new Rate('tasa_errores');

// ─── Configuración ──────────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const TOKEN    = __ENV.TOKEN    || '';

const headers = TOKEN
  ? { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }
  : { 'Content-Type': 'application/json' };

// ─── Escenarios ─────────────────────────────────────────────────────────────
export const options = {
  scenarios: {

    // PRE-02: Carga sostenida — 50 VUs por 30 segundos
    carga_sostenida: {
      executor: 'constant-vus',
      vus: 50,
      duration: '30s',
      tags: { escenario: 'PRE-02_carga_sostenida' },
      gracefulStop: '5s',
    },

    // PRE-03: Spike — sube de 10 a 100 y baja a 0
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 10  },
        { duration: '10s', target: 100 },
        { duration: '10s', target: 0   },
      ],
      tags: { escenario: 'PRE-03_spike' },
      gracefulRampDown: '5s',
      startTime: '35s',
    },
  },

  // ─── Umbrales ──────────────────────────────────────────────────────────
  thresholds: {
    'tiempo_listado{escenario:PRE-02_carga_sostenida}':  ['p(95)<800'],
    'tasa_errores{escenario:PRE-02_carga_sostenida}':    ['rate<0.01'],
    'tasa_errores{escenario:PRE-03_spike}':              ['rate<0.05'],
    'http_req_duration{endpoint:listado}':               ['p(95)<800'],
    'http_req_failed':                                   ['rate<0.05'],
  },
};

// ─── Función principal ───────────────────────────────────────────────────────
export default function () {

  const resListado = http.get(
    `${BASE_URL}/documentos`,
    { headers, tags: { endpoint: 'listado' } }
  );

  tiempoListado.add(resListado.timings.duration);
  tasaErrores.add(resListado.status !== 200);

  check(resListado, {
    'listado: status 200':        (r) => r.status === 200,
    'listado: respuesta < 800ms': (r) => r.timings.duration < 800,
    'listado: body es array':     (r) => {
      try { return Array.isArray(JSON.parse(r.body)); } catch { return false; }
    },
  });

  sleep(0.5);
}

// ─── Resumen al finalizar ────────────────────────────────────────────────────
export function handleSummary(data) {
  const thresholds = data.metrics;
  const lines = [
    '╔══════════════════════════════════════════════════════════╗',
    '║           RESULTADO PRUEBAS DE CARGA — ALIA              ║',
    '╚══════════════════════════════════════════════════════════╝',
    '',
  ];

  const metricas = [
    ['tiempo_listado  (p95)', 'tiempo_listado'],
    ['tasa_errores',          'tasa_errores'],
    ['http_req_duration p95', 'http_req_duration'],
  ];

  for (const [label, key] of metricas) {
    const m = thresholds[key];
    if (m) {
      const val = m.values['p(95)'] ?? m.values['rate'] ?? '—';
      const ok = !m.thresholds || Object.values(m.thresholds).every(t => t.ok);
      lines.push(`  ${ok ? '✅' : '❌'} ${label}: ${typeof val === 'number' ? val.toFixed(2) : val}`);
    }
  }

  lines.push('');

  return {
    stdout: lines.join('\n') + '\n',
    'resumen-carga.json': JSON.stringify(data, null, 2),
  };
}
