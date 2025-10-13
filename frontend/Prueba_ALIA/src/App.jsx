import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "alia_base_url";

/* ===== Utils ===== */
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function safeDecode(s) {
  try {
    if (/%[0-9A-Fa-f]{2}/.test(s)) return decodeURIComponent(s);
  } catch {}
  return s;
}

function useBaseURL() {
  const envDefault = import.meta.env.VITE_API_BASE || "http://localhost:8080";
  const [base, setBase] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || envDefault;
    } catch {
      return envDefault;
    }
  });
  const save = (v) => {
    const cleaned = String(v || "").trim().replace(/\/+$/, "");
    setBase(cleaned);
    try {
      localStorage.setItem(STORAGE_KEY, cleaned);
    } catch {}
  };
  return { base, save };
}

function fmtBytes(n){
  if(n==null) return "";
  const units=["B","KB","MB","GB"]; let i=0; let v=n;
  while(v>=1024 && i<units.length-1){ v/=1024; i++; }
  return v.toFixed(1)+" "+units[i];
}

function Toast({msg, onDone}) {
  useEffect(() => {
    const t = setTimeout(onDone, 2000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="pill" style={{position:'fixed', bottom:16, right:16, zIndex:9999}}>{msg}</div>
  );
}

export default function App() {
  const { base, save } = useBaseURL();
  const [toast, setToast] = useState(null);

  const showToast = (m) => { setToast(m); };

  return (
    <>
      <header>
        <h1>ALIA · Panel de Pruebas (RAG)</h1>
        <div className="row" style={{maxWidth:520, marginLeft:"auto"}}>
          <input type="text" defaultValue={base} placeholder="URL del API Gateway"
                 onBlur={(e)=>save(e.target.value)} />
          <button className="btn secondary" onClick={()=>showToast("URL actualizada")}>Usar URL</button>
        </div>
      </header>

      <main>
        <div className="grid">
          <Estado base={base} />
          <ListaDocs base={base} />
        </div>

        <Subida base={base} onUploaded={()=>{ /* nada, la tabla tiene su botón */ }} />
        <ConsultaRAG base={base} />
      </main>

      {toast && <Toast msg={toast} onDone={()=>setToast(null)} />}
    </>
  );
}

/* ---------------- Estado ---------------- */
function Estado({ base }) {
  const [out, setOut] = useState("Consultando estado...");

  const refrescar = async () => {
    setOut("Consultando estado...");
    try {
      const r = await fetch(`${base}/estado`);
      const j = await r.json();
      const servicios = j.servicios || [];
      setOut(
        `<div class="stack">
          <div><span class="muted">Gateway:</span> <span class="${j.estado_gateway==='OK'?'ok':'bad'}">${j.estado_gateway || 'OK'}</span> · <span class="muted">uptime:</span> ${j.uptime_seg}s</div>
          <div class="stack">
            ${(servicios.length? servicios: []).map(s => `
              <div>
                <span class="pill">${s.servicio || 'svc'}</span>
                <span class="${s.ok?'ok':'bad'}">${s.ok?'OK':'FALLA'}</span>
                <span class="muted">· ${s.latencia_ms ?? '-'} ms · ${s.codigo ?? ''}</span>
                ${s.error ? `<div class="muted">error: ${s.error}</div>` : ""}
              </div>
            `).join("")}
          </div>
        </div>`
      );
    } catch (e) {
      setOut(`<div class="bad">Error: ${e}</div>`);
    }
  };

  useEffect(()=>{ refrescar(); }, [base]);

  return (
    <section className="card">
      <h2>Estado de servicios</h2>
      <div className="flex">
        <button className="btn" onClick={refrescar}>Refrescar estado</button>
        <span className="muted">Consulta <code>/estado</code> del gateway y muestra latencias.</span>
      </div>
      <div id="estadoOut" className="stack" style={{marginTop:10}} dangerouslySetInnerHTML={{__html: out}} />
    </section>
  );
}

/* ---------------- Lista de documentos ---------------- */
function ListaDocs({ base }) {
  const [rows, setRows] = useState(null);

  const cargar = async () => {
    setRows(null);
    try {
      const r = await fetch(`${base}/documentos`);
      const j = await r.json();
      setRows(j);
    } catch (e) {
      setRows({ error: e?.message || String(e) });
    }
  };

  useEffect(()=>{ cargar(); }, [base]);

  return (
    <section className="card">
      <h2>Documentos (lista rápida)</h2>
      <div className="flex">
        <button className="btn secondary" onClick={cargar}>Listar</button>
        <span className="muted">GET <code>/documentos</code> (últimos 100)</span>
      </div>
      <div id="docsOut" style={{maxHeight:260, overflow:"auto", marginTop:10}}>
        <table id="docsTabla">
          <thead><tr><th>ID</th><th>Título</th><th>Original</th><th>MIME</th><th>Tamaño</th><th>Creado</th></tr></thead>
          <tbody>
            {rows===null && (
              <tr><td colSpan="6" className="muted">Cargando...</td></tr>
            )}
            {rows && rows.error && (
              <tr><td colSpan="6" className="bad">Error: {rows.error}</td></tr>
            )}
            {Array.isArray(rows) && rows.length===0 && (
              <tr><td colSpan="6" className="muted">Sin documentos.</td></tr>
            )}
            {Array.isArray(rows) && rows.map(d=>(
              <tr key={d.id}>
                <td>{d.id}</td>
                <td>{d.titulo}</td>
                <td className="mono">{d.nombre_original}</td>
                <td>{d.tipo_mime}</td>
                <td>{fmtBytes(d.tamano_bytes)}</td>
                <td><span className="muted mono">{d.creado_en}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------------- Subida de documento ---------------- */
function Subida({ base }) {
  const fileRef = useRef();
  const tituloRef = useRef();
  const etiquetasRef = useRef();
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState("");

  // Controles para etiquetar la importación
  const [tipoCarga, setTipoCarga] = useState("");
  const [periodoAnio, setPeriodoAnio] = useState(String(new Date().getFullYear()));
  const [periodoNombre, setPeriodoNombre] = useState("ANUAL");

  const subir = async () => {
    const file = fileRef.current.files[0];
    if (!file) { 
      setOut(`<div class="bad">Selecciona un archivo</div>`); 
      return; 
    }

    const fd = new FormData();
    fd.append("file", file);

    const titulo = tituloRef.current.value.trim();
    if (titulo) fd.append("titulo", titulo);

    // Construir etiquetas
    const et = etiquetasRef.current.value.trim();
    let etiquetasJSON = null;

    if (et) {
      // Usuario escribió JSON manual
      etiquetasJSON = et;
      console.log("📤 Enviando etiquetas manuales:", et);
    } else if (tipoCarga) {
      // Construir automáticamente
      const etiquetasAuto = {
        import: tipoCarga,
        periodo: { 
          anio: Number(periodoAnio) || new Date().getFullYear(), 
          nombre: periodoNombre || "ANUAL" 
        }
      };
      etiquetasJSON = JSON.stringify(etiquetasAuto);
      console.log("📤 Enviando etiquetas automáticas:", etiquetasJSON);
    } else {
      console.log("⚠️ No se enviaron etiquetas (tipoCarga vacío)");
    }

    if (etiquetasJSON) {
      fd.append("etiquetas", etiquetasJSON);
    }

    setBusy(true);
    setOut(`<div class="muted">Subiendo...</div>`);
    
    try {
      console.log("🚀 Iniciando subida a:", `${base}/documentos`);
      console.log("📦 FormData contiene:");
      for (let [key, value] of fd.entries()) {
        console.log(`  ${key}:`, value instanceof File ? `[File: ${value.name}]` : value);
      }

      const r = await fetch(`${base}/documentos`, { 
        method: "POST", 
        body: fd 
      });
      
      const j = await r.json();
      console.log("📥 Respuesta del servidor:", j);
      
      if (!r.ok) throw new Error(j?.error || "Error al subir");
      
      setOut(`
        <div class="ok">✅ Subida OK</div>
        <div class="pre">${escapeHtml(JSON.stringify(j, null, 2))}</div>
        <div class="muted">Ahora el worker de ingesta tomará la tarea automáticamente.</div>
        ${etiquetasJSON ? `<div class="muted">Etiquetas enviadas: <code>${escapeHtml(etiquetasJSON)}</code></div>` : ''}
      `);
      
      // Limpiar inputs
      fileRef.current.value = "";
      tituloRef.current.value = "";
      etiquetasRef.current.value = "";
      setTipoCarga("");
    } catch (e) {
      console.error("❌ Error en subida:", e);
      setOut(`<div class="bad">Error: ${e?.message || e}</div>`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2>Subir documento</h2>
      <div className="row">
        <div>
          <label>Archivo</label>
          <input ref={fileRef} type="file" />
        </div>
        <div>
          <label>Título (opcional)</label>
          <input ref={tituloRef} type="text" placeholder="Mi documento" />
        </div>
      </div>

      {/* Sección de etiquetado rápido */}
      <div className="grid" style={{marginTop:10}}>
        <div className="card">
          <h3 style={{marginTop:0, fontSize:14}}>🎯 Tipo de carga</h3>
          <label>¿Deseas que este archivo dispare una importación?</label>
          <select value={tipoCarga} onChange={(e)=>setTipoCarga(e.target.value)}>
            <option value="">Ninguno (solo RAG)</option>
            <option value="estudiantes">Importar estudiantes</option>
            <option value="docentes">Importar docentes</option>
          </select>

          {tipoCarga && (
            <div className="row" style={{marginTop:10}}>
              <div>
                <label>Período · Año</label>
                <input type="number" value={periodoAnio} onChange={e=>setPeriodoAnio(e.target.value)} />
              </div>
              <div>
                <label>Período · Nombre</label>
                <input type="text" value={periodoNombre} onChange={e=>setPeriodoNombre(e.target.value)} placeholder="ANUAL / P1 / P2 ..." />
              </div>
            </div>
          )}

          {tipoCarga && (
            <div className="card" style={{marginTop:10, background:"#f0f9ff", border:"1px solid #0ea5e9"}}>
              <p style={{margin:0, fontSize:13}}>
                📋 Se enviará: <code style={{background:"white", padding:"2px 6px", borderRadius:4}}>
                  {JSON.stringify({import: tipoCarga, periodo: {anio: Number(periodoAnio), nombre: periodoNombre}})}
                </code>
              </p>
            </div>
          )}
        </div>

        <div className="card">
          <h3 style={{marginTop:0, fontSize:14}}>⚙️ Etiquetas (JSON avanzado, opcional)</h3>
          <label>Etiquetas JSON manual</label>
          <input
            ref={etiquetasRef}
            type="text"
            placeholder='{"import":"estudiantes","periodo":{"anio":2025,"nombre":"ANUAL"}}'
          />
          <p className="muted" style={{marginTop:8}}>
            Si completas este campo, se ignorará la selección "Tipo de carga" y se usará este JSON.
          </p>
        </div>
      </div>

      <div className="flex" style={{marginTop:10}}>
        <button disabled={busy} className="btn success" onClick={subir}>
          {busy ? "Subiendo..." : "Subir"}
        </button>
        <span className="muted">POST <code>/documentos</code> → crea tarea de ingesta.</span>
      </div>

      <div id="subidaOut" className="stack" style={{marginTop:10}} dangerouslySetInnerHTML={{__html: out}} />
    </section>
  );
}

/* ---------------- Consulta RAG ---------------- */
function ConsultaRAG({ base }) {
  const [pregunta, setPregunta] = useState("");
  const [k, setK] = useState(6);
  const [usarLLM, setUsarLLM] = useState(true);
  const [umbral, setUmbral] = useState("");
  const [fOriginal, setFOriginal] = useState("");
  const [fDesde, setFDesde] = useState("");
  const [fHasta, setFHasta] = useState("");
  const [out, setOut] = useState("");

  const consultar = async () => {
    if (!pregunta.trim()) {
      setOut(`<div class="bad">Escribe una pregunta</div>`);
      return;
    }

    setOut(`<div class="muted">Consultando...</div>`);
    try {
      const filtro = {};
      if (fOriginal.trim()) filtro.original_name = fOriginal.trim();
      if (fDesde.trim()) filtro.desde = fDesde.trim();
      if (fHasta.trim()) filtro.hasta = fHasta.trim();

      const body = { pregunta, k: Number(k) || 6, usarLLM, filtro };
      const u = umbral.trim();
      if (u !== "" && !Number.isNaN(Number(u))) body.umbral = Number(u);

      const r = await fetch(`${base}/busqueda/consulta`, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify(body)
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Error en consulta");

      if (usarLLM) {
        setOut(`
          <div><strong>Respuesta</strong></div>
          <div class="pre">${escapeHtml(safeDecode(j.respuesta || "(sin respuesta)"))}</div>
          <div><strong>Citas</strong></div>
          <div class="pre">${escapeHtml(JSON.stringify(j.citas || [], null, 2))}</div>
        `);
      } else {
        setOut(`
          <div><strong>Resultados (Top-K)</strong></div>
          <div class="pre">${escapeHtml(JSON.stringify(j.resultados || [], null, 2))}</div>
        `);
      }
    } catch (e) {
      setOut(`<div class="bad">Error: ${e?.message || e}</div>`);
    }
  };

  return (
    <section className="card">
      <h2>Consulta RAG</h2>
      <label>Pregunta</label>
      <textarea value={pregunta} onChange={e=>setPregunta(e.target.value)} placeholder="¿Qué materias ve Juan Andrés de 5 de primaria?" />

      <div className="row">
        <div>
          <label>k (Top-K)</label>
          <input type="number" min="1" value={k} onChange={e=>setK(e.target.value)} />
        </div>
        <div>
          <label>Umbral (opcional)</label>
          <input type="text" value={umbral} onChange={e=>setUmbral(e.target.value)} placeholder="0.15" />
        </div>
        <div className="row" style={{alignItems:"center"}}>
          <input id="usarLLM" type="checkbox" checked={usarLLM} onChange={e=>setUsarLLM(e.target.checked)} />
          <label htmlFor="usarLLM" style={{margin:0}}>Usar LLM</label>
        </div>
      </div>

      <details style={{marginTop:10}}>
        <summary className="muted">Filtros (opcionales)</summary>
        <div className="row" style={{marginTop:10}}>
          <div>
            <label>original_name contiene</label>
            <input type="text" placeholder="horario" value={fOriginal} onChange={e=>setFOriginal(e.target.value)} />
          </div>
          <div>
            <label>Desde (YYYY-MM-DD)</label>
            <input type="text" placeholder="2025-01-01" value={fDesde} onChange={e=>setFDesde(e.target.value)} />
          </div>
          <div>
            <label>Hasta (YYYY-MM-DD)</label>
            <input type="text" placeholder="2025-12-31" value={fHasta} onChange={e=>setFHasta(e.target.value)} />
          </div>
        </div>
      </details>

      <div className="flex" style={{marginTop:10}}>
        <button className="btn" onClick={consultar}>Consultar</button>
        <span className="muted">POST <code>/busqueda/consulta</code></span>
      </div>

      <div id="consultaOut" className="stack" style={{marginTop:10}} dangerouslySetInnerHTML={{__html: out}} />
    </section>
  );
}