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

        <Subida base={base} onUploaded={()=>{ }} />
        <ConsultaRAG base={base} />
        <ChatAsistenteIA base={base} showToast={showToast} />
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
          <h3 style={{marginTop:0, fontSize:14}}>Tipo de carga</h3>
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
            <div className="card" style={{marginTop:10, background:"#0a0a0aff", border:"1px solid #0ea5e9"}}>
              <p style={{margin:0, fontSize:13}}>
                 Se enviará: <code style={{ padding:"2px 6px", borderRadius:4}}>
                  {JSON.stringify({import: tipoCarga, periodo: {anio: Number(periodoAnio), nombre: periodoNombre}})}
                </code>
              </p>
            </div>
          )}
        </div>

        <div className="card">
          <h3 style={{marginTop:0, fontSize:14}}>Etiquetas </h3>
          <label>Etiquetas JSON manual</label>
          <input
            ref={etiquetasRef}
            type="text"
            placeholder='{"import":"estudiantes","periodo":{"anio":2025,"nombre":"ANUAL"}}'
          />
          <p className="muted" style={{marginTop:8}}>
        
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

/* ---------------- Chat Asistente IA (Servicio de Generación) ---------------- */
function ChatAsistenteIA({ base, showToast }) {
  const [idConversacion, setIdConversacion] = useState(null);
  const [mensajes, setMensajes] = useState([]);
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(false);
  const [conversaciones, setConversaciones] = useState([]);
  const mensajesEndRef = useRef(null);

  // Auto-scroll al último mensaje
  useEffect(() => {
    mensajesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes]);

  // Cargar lista de conversaciones
  const cargarConversaciones = async () => {
    try {
      const r = await fetch(`${base}/generacion/conversaciones`);
      const j = await r.json();
      setConversaciones(Array.isArray(j) ? j : []);
    } catch (e) {
      console.error("Error cargando conversaciones:", e);
    }
  };

  // Crear nueva conversación
  const nuevaConversacion = async () => {
    try {
      const r = await fetch(`${base}/generacion/conversacion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo: "Nueva conversación" })
      });
      const j = await r.json();
      setIdConversacion(j.id_conversacion);
      setMensajes([]);
      showToast("Conversación creada");
      cargarConversaciones();
    } catch (e) {
      showToast("Error creando conversación");
    }
  };

  // Cargar conversación existente
  const cargarConversacion = async (id) => {
    try {
      const r = await fetch(`${base}/generacion/conversacion/${id}`);
      const j = await r.json();
      setIdConversacion(id);

      // Parsear mensajes
      const msgs = (j.mensajes || []).map(m => ({
        rol: m.rol,
        contenido: m.rol === 'assistant' ?
          (typeof m.contenido === 'string' && m.contenido.startsWith('{') ?
            JSON.parse(m.contenido) : m.contenido) :
          m.contenido,
        creado_en: m.creado_en
      }));

      setMensajes(msgs);
    } catch (e) {
      showToast("Error cargando conversación");
    }
  };

  // Enviar mensaje
  const enviarMensaje = async () => {
    if (!mensaje.trim()) return;

    // Si no hay conversación, crear una
    if (!idConversacion) {
      await nuevaConversacion();
      // Esperar un poco para que se cree la conversación
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const mensajeUsuario = mensaje.trim();
    setMensaje("");

    // Agregar mensaje del usuario al chat
    setMensajes(prev => [...prev, { rol: 'user', contenido: mensajeUsuario }]);

    setCargando(true);
    try {
      const r = await fetch(`${base}/generacion/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mensaje: mensajeUsuario,
          id_conversacion: idConversacion
        })
      });

      const j = await r.json();

      // Agregar respuesta del asistente
      setMensajes(prev => [...prev, {
        rol: 'assistant',
        contenido: j.respuesta,
        intencion: j.intencion,
        parametros: j.parametros
      }]);
    } catch (e) {
      setMensajes(prev => [...prev, {
        rol: 'assistant',
        contenido: { exito: false, mensaje: `Error: ${e.message}` }
      }]);
    } finally {
      setCargando(false);
    }
  };

  // Cargar conversaciones al montar
  useEffect(() => {
    cargarConversaciones();
  }, [base]);

  return (
    <section className="card">
      <h2>🤖 Asistente Académico con IA</h2>
      <p className="muted">Chatea con el asistente para gestionar calificaciones, generar documentos y más usando lenguaje natural.</p>

      <div className="row" style={{marginTop:10, marginBottom:10}}>
        <button className="btn success" onClick={nuevaConversacion}>+ Nueva Conversación</button>
        <select
          value={idConversacion || ""}
          onChange={(e) => e.target.value && cargarConversacion(Number(e.target.value))}
          style={{flex: 2}}
        >
          <option value="">Seleccionar conversación...</option>
          {conversaciones.map(c => (
            <option key={c.id} value={c.id}>
              {c.titulo} ({c.num_mensajes} mensajes)
            </option>
          ))}
        </select>
      </div>

      {/* Área de mensajes */}
      <div style={{
        background: '#0b1220',
        border: '1px solid #1f2937',
        borderRadius: '10px',
        padding: '16px',
        minHeight: '400px',
        maxHeight: '500px',
        overflowY: 'auto',
        marginBottom: '10px'
      }}>
        {mensajes.length === 0 && (
          <div className="muted" style={{textAlign: 'center', marginTop: '50px'}}>
            <p>👋 ¡Hola! Soy tu asistente académico.</p>
            <p>Puedo ayudarte con:</p>
            <ul style={{textAlign: 'left', display: 'inline-block'}}>
              <li>Agregar o eliminar calificaciones</li>
              <li>Registrar asistencias</li>
              <li>Generar reportes en Excel, PDF o Word</li>
              <li>Dar recomendaciones académicas</li>
              <li>Consultar información del sistema</li>
            </ul>
            <p style={{marginTop: 16}}>Escribe algo como: <code>"Agrega una nota de 4.5 a Juan Pérez en Matemáticas"</code></p>
          </div>
        )}

        {mensajes.map((m, i) => (
          <div key={i} style={{
            marginBottom: '12px',
            padding: '10px',
            borderRadius: '8px',
            background: m.rol === 'user' ? '#1e293b' : '#0f172a',
            borderLeft: m.rol === 'user' ? '3px solid #3b82f6' : '3px solid #22c55e'
          }}>
            <div style={{fontSize: '11px', color: '#94a3b8', marginBottom: '4px'}}>
              {m.rol === 'user' ? '👤 Usuario' : '🤖 Asistente'}
              {m.intencion && <span className="pill" style={{marginLeft: 8}}>{m.intencion}</span>}
            </div>

            {m.rol === 'user' ? (
              <div>{m.contenido}</div>
            ) : (
              <MensajeAsistente contenido={m.contenido} base={base} />
            )}
          </div>
        ))}

        {cargando && (
          <div style={{textAlign: 'center', color: '#94a3b8'}}>
            <span>⏳ Procesando...</span>
          </div>
        )}

        <div ref={mensajesEndRef} />
      </div>

      {/* Input de mensaje */}
      <div className="row">
        <textarea
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              enviarMensaje();
            }
          }}
          placeholder="Escribe tu mensaje aquí... (Enter para enviar)"
          style={{minHeight: '60px', resize: 'vertical'}}
          disabled={cargando}
        />
        <button
          className="btn"
          onClick={enviarMensaje}
          disabled={cargando || !mensaje.trim()}
        >
          Enviar
        </button>
      </div>

      <div className="muted" style={{marginTop: 8}}>
        <strong>Ejemplos:</strong> "Dame las notas de María García" · "Genera un Excel con calificaciones del 5A" · "Recomendaciones para estudiante ID 10"
      </div>
    </section>
  );
}

/* Componente para renderizar mensajes del asistente */
function MensajeAsistente({ contenido, base }) {
  if (!contenido) return <div className="muted">Sin respuesta</div>;

  // Si es string JSON, parsearlo
  if (typeof contenido === 'string') {
    try {
      contenido = JSON.parse(contenido);
    } catch {
      return <div>{contenido}</div>;
    }
  }

  // Si tiene campo 'exito'
  if (contenido.exito !== undefined) {
    return (
      <div className="stack">
        {contenido.exito ? (
          <div className="ok">✅ {contenido.mensaje}</div>
        ) : (
          <div className="bad">❌ {contenido.mensaje}</div>
        )}

        {/* Mostrar datos si existen */}
        {contenido.datos && (
          <details style={{marginTop: 8}}>
            <summary className="muted" style={{cursor: 'pointer'}}>Ver detalles</summary>
            <pre className="pre" style={{marginTop: 8, fontSize: 11}}>
              {JSON.stringify(contenido.datos, null, 2)}
            </pre>
          </details>
        )}

        {/* Botón de descarga si hay archivo generado */}
        {contenido.archivo && (
          <div style={{marginTop: 8}}>
            <a
              href={`${base}${contenido.archivo.url_descarga}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn secondary"
              style={{display: 'inline-block', textDecoration: 'none'}}
            >
              📄 Descargar {contenido.archivo.tipo}
            </a>
          </div>
        )}
      </div>
    );
  }

  // Si tiene campo 'mensaje' directo
  if (contenido.mensaje) {
    return <div>{contenido.mensaje}</div>;
  }

  // Fallback: mostrar JSON
  return (
    <pre className="pre" style={{fontSize: 11}}>
      {JSON.stringify(contenido, null, 2)}
    </pre>
  );
}