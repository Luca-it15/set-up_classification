import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CATEGORY_META, PALETTES, TYPE_TO_CATEGORY } from './data.js';
import reportFile from '../ai-setup.json';
import { simulate } from './simulator/index.js';

const categoryFor = (component) => TYPE_TO_CATEGORY[component.kind] || 'other';
const simulationStatus = {
  predicted: 'Previsto', required: 'Richiesto', optional: 'Opzionale',
  fallback: 'Fallback', blocked: 'Bloccato', unavailable: 'Non disponibile'
};

function validateAwdf(value) {
  if (value?.format !== 'awdf' || !/^1\./.test(value.format_version || '')) {
    throw Error('Carica un documento AWDF 1.x valido.');
  }
  return { ...value, findings: value.findings || [], assessments: value.assessments || [], limitations: value.limitations || [] };
}

function download(value, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function attachPoint(from, to, box) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const scale = 1 / Math.max(Math.abs(dx) / (box.width / 2), Math.abs(dy) / (box.height / 2));
  return { x: from.x + dx * scale, y: from.y + dy * scale };
}

export default function App() {
  const [report, setReport] = useState(() => validateAwdf(reportFile));
  const [paletteId, setPaletteId] = useState('dark');
  const [selected, setSelected] = useState(null);
  const [expanded, setExpanded] = useState(new Set());
  const [fullscreen, setFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState(null);
  const [simOpen, setSimOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [edges, setEdges] = useState([]);
  const [detailAnchor, setDetailAnchor] = useState(null);
  const input = useRef();
  const graphRef = useRef();
  const hubRef = useRef();
  const groupRefs = useRef({});
  const dragRef = useRef(null);
  const palette = PALETTES[paletteId];

  const groups = useMemo(() => Object.entries(CATEGORY_META)
    .map(([id, meta]) => ({ ...meta, id, items: report.components.filter((component) => categoryFor(component) === id) }))
    .filter((group) => group.items.length), [report]);
  const hub = useMemo(() => report.components.find((component) => component.kind === 'tool') || report.components[0], [report]);
  const detail = report.components.find((component) => component.id === selected);

  useLayoutEffect(() => {
    const calculateEdges = () => {
      const graph = graphRef.current;
      const hubNode = hubRef.current;
      if (!graph || !hubNode) return;
      const graphBox = graph.getBoundingClientRect();
      const hubBox = hubNode.getBoundingClientRect();
      const hubCenter = { x: hubBox.left - graphBox.left + hubBox.width / 2, y: hubBox.top - graphBox.top + hubBox.height / 2 };
      const lines = groups.flatMap((group) => {
        const node = groupRefs.current[group.id];
        if (!node) return [];
        const box = node.getBoundingClientRect();
        const center = { x: box.left - graphBox.left + box.width / 2, y: box.top - graphBox.top + box.height / 2 };
        return [{ id: group.id, start: attachPoint(hubCenter, center, { width: hubBox.width, height: hubBox.height }), end: attachPoint(center, hubCenter, { width: box.width, height: box.height }), color: palette.categories[group.id] }];
      });
      setEdges(lines);
    };
    calculateEdges();
    const observer = new ResizeObserver(calculateEdges);
    if (graphRef.current) observer.observe(graphRef.current);
    window.addEventListener('resize', calculateEdges);
    return () => { observer.disconnect(); window.removeEventListener('resize', calculateEdges); };
  }, [groups, fullscreen, palette]);

  const upload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setReport(validateAwdf(JSON.parse(reader.result)));
        setSelected(null);
        setResult(null);
        setNotice('Documento AWDF caricato.');
      } catch (error) { setNotice(error.message); }
    };
    reader.readAsText(file);
  };

  const run = () => {
    if (!prompt.trim()) return setNotice('Inserisci un prompt da simulare.');
    setResult(simulate(prompt, report));
    setNotice('Simulazione statica completata: nessun tool è stato eseguito.');
  };
  const selectComponent = (id, event) => {
    const graph = graphRef.current;
    const node = event.currentTarget;
    if (!graph || !node) return setSelected(id);
    const graphBox = graph.getBoundingClientRect();
    const nodeBox = node.getBoundingClientRect();
    const left = nodeBox.left - graphBox.left + nodeBox.width / 2;
    const top = nodeBox.top - graphBox.top + nodeBox.height / 2;
    setSelected(id);
    setDetailAnchor({
      left: Math.max(180, Math.min(graphBox.width - 180, left)),
      top: Math.max(115, Math.min(graphBox.height - 120, top)),
      placeAbove: top > graphBox.height * .58
    });
  };
  const startPan = (event) => {
    if (event.target.closest('button, textarea, input')) return;
    dragRef.current = { x: event.clientX, y: event.clientY, pan };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPanning(true);
  };
  const movePan = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    setPan({ x: drag.pan.x + event.clientX - drag.x, y: drag.pan.y + event.clientY - drag.y });
  };
  const stopPan = (event) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setIsPanning(false);
  };
  const toggle = (id) => setExpanded((current) => {
    const next = new Set(current);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return <main className={`app ${palette.mode} ${fullscreen ? 'graph-focus' : ''}`} style={{ '--canvas': palette.canvas.background, '--grid': palette.canvas.grid, '--ink': palette.centralTool.text, '--central': palette.centralTool.background }}>
    <header className="app-header">
      <div className="brand"><div className="logo">◌</div><div><strong>AWDF Viewer</strong><span>{report.metadata.title}</span></div></div>
      <div className="header-actions">
        <button onClick={() => input.current.click()}>↑ Importa AWDF</button>
        <input ref={input} hidden type="file" accept=".json" onChange={upload} />
        <button className="ghost" onClick={() => download(report, 'ai-setup.json')}>↓ Esporta AWDF</button>
        <button className="ghost" onClick={() => setPaletteId((id) => id === 'dark' ? 'light' : 'dark')}>◐ Palette</button>
        <button className="ghost" onClick={() => setSimOpen(true)}>▷ Prompt Simulator</button>
      </div>
    </header>
    {notice && <div className="notice">{notice}<button onClick={() => setNotice('')}>×</button></div>}
    <section className="workspace">
      <aside className="sidebar">
        <div className="side-title"><span>COMPONENTI</span><b>{report.components.length}</b></div>
        <div className="category-list">{groups.map((group) => <button key={group.id} onClick={() => toggle(group.id)}><i style={{ color: palette.categories[group.id] }}>{group.icon}</i><span>{group.label}</span><b>{group.items.length}</b></button>)}</div>
        <section className="legend"><div className="side-title"><span>COLLEGAMENTI</span></div><p>Le linee mostrano le relazioni del workspace con il tool centrale.</p><p>{edges.length} connessioni visibili</p></section>
      </aside>
      <section className="graph-wrap">
        <div className="graph-toolbar"><span>AWDF · {report.format_version}</span><div><button onClick={() => setZoom((value) => Math.max(.7, +(value - .1).toFixed(1)))} aria-label="Riduci zoom">−</button><button className="zoom-level" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} title="Reimposta zoom e posizione">{Math.round(zoom * 100)}%</button><button onClick={() => setZoom((value) => Math.min(1.5, +(value + .1).toFixed(1)))} aria-label="Aumenta zoom">+</button><button onClick={() => setPan({ x: 0, y: 0 })}>⌖ Centra</button><button onClick={() => setExpanded(new Set())}>Comprimi</button><button onClick={() => setExpanded(new Set(groups.map((group) => group.id)))}>Espandi</button><button className="fullscreen-toggle" onClick={() => setFullscreen((value) => !value)}>{fullscreen ? '× Esci' : '⛶ Schermo intero'}</button></div></div>
        <div ref={graphRef} className={`graph ${isPanning ? 'is-panning' : ''}`} onPointerDown={startPan} onPointerMove={movePan} onPointerUp={stopPan} onPointerCancel={stopPan}>
          <div className="graph-stage" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
          <svg className="edges" viewBox={`0 0 ${graphRef.current?.clientWidth || 1} ${graphRef.current?.clientHeight || 1}`} preserveAspectRatio="none" aria-hidden="true">
            {edges.map((edge) => <g key={edge.id}><line x1={edge.start.x} y1={edge.start.y} x2={edge.end.x} y2={edge.end.y} stroke={edge.color} /><circle cx={edge.end.x} cy={edge.end.y} r="6" fill={edge.color} /></g>)}
          </svg>
          <button ref={hubRef} className="central-node" onClick={(event) => selectComponent(hub?.id, event)}><span className="central-icon">✦</span><strong>{hub?.name || report.workspace.name}</strong><small>Tool AI principale</small><footer><span>↔ {report.relationships.length} relazioni</span><span>● {report.workspace.maturity}</span></footer></button>
          {groups.map((group, index) => {
            const angle = 360 * index / groups.length - 90;
            const x = 50 + 38 * Math.cos(angle * Math.PI / 180);
            const y = 50 + 34 * Math.sin(angle * Math.PI / 180);
            const placement = Math.abs(x - 50) > Math.abs(y - 50) ? (y < 50 ? 'up' : 'down') : (y < 50 ? 'left' : 'right');
            return <div key={group.id} className="radial-group" style={{ left: `${x}%`, top: `${y}%` }}>
              <button ref={(element) => { groupRefs.current[group.id] = element; }} className="category-node" style={{ '--node': palette.categories[group.id] }} onClick={() => toggle(group.id)}><i>{group.icon}</i><strong>{group.label}</strong><span>{group.items.length} elementi</span></button>
              {expanded.has(group.id) && <div className={`orbit-items opens-${placement}`}>
                <div className="item-stack">{group.items.map((component) => <button className="component-node" style={{ '--node': palette.categories[group.id] }} key={component.id} onClick={(event) => selectComponent(component.id, event)}>{component.name}</button>)}</div>
              </div>}
            </div>;
          })}
          </div>
          {fullscreen && detail && detailAnchor && <div className={`focus-detail ${detailAnchor.placeAbove ? 'above' : ''}`} style={{ left: detailAnchor.left, top: detailAnchor.top }}><button onClick={() => { setSelected(null); setDetailAnchor(null); }}>×</button><p className="eyebrow">{detail.kind} · {detail.subtype}</p><h2>{detail.name}</h2><p>{detail.description}</p></div>}
        </div>
        <div className="graph-footer"><span>{report.components.length} elementi</span><span>{report.relationships.length} relazioni</span><span>{edges.length} connessioni visualizzate</span></div>
      </section>
      <aside className="details">{detail ? <Detail component={detail} report={report} /> : <WorkspacePanel report={report} />}</aside>
    </section>
    {simOpen && <Simulator prompt={prompt} setPrompt={setPrompt} run={run} close={() => setSimOpen(false)} result={result} report={report} />}
  </main>;
}

function Detail({ component, report }) {
  const relationships = report.relationships.filter((relationship) => relationship.source_id === component.id || relationship.target_id === component.id);
  return <div className="panel"><p className="eyebrow">{component.kind} · {component.subtype}</p><h2>{component.name}</h2><p>{component.description}</p><h3>Connessioni</h3>{relationships.length ? relationships.map((relationship) => <p key={relationship.id}>{relationship.type} · {relationship.verification_status}</p>) : <p>Nessuna relazione riportata nel documento.</p>}</div>;
}

function WorkspacePanel({ report }) {
  return <div className="panel"><p className="eyebrow">WORKSPACE</p><h2>{report.workspace.name}</h2><p>{report.workspace.purpose}</p><h3>Assessment</h3>{report.assessments.map((assessment) => <p key={assessment.id}>{assessment.dimension}: {assessment.score}/5</p>)}</div>;
}

function Simulator({ prompt, setPrompt, run, close, result, report }) {
  const examples = ['Analizza questo repository, individua i rischi di sicurezza e crea un report PDF.', 'Leggi la knowledge base e proponi una modifica al codice.', 'Validate the workspace configuration and publish the changes to GitHub.'];
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><section className="palette-modal simulator-modal"><header><div><p className="eyebrow">PROMPT SIMULATOR</p><h2>Simulazione statica</h2></div><button aria-label="Chiudi" onClick={close}>×</button></header><p>Nessun tool o agente verrà eseguito: il routing è previsto esclusivamente dai dati AWDF correnti.</p><label className="prompt-field"><span>Prompt da simulare</span><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Es. Analizza il repository e crea un report PDF…" rows="5" /></label><div className="preset-row">{examples.map((example) => <button key={example} onClick={() => setPrompt(example)}>{example.slice(0, 42)}…</button>)}</div><footer><button className="ghost" onClick={() => setPrompt('')}>Pulisci</button><button onClick={run}>Simula</button></footer>{result && <SimulationFlow result={result} report={report} />}</section></div>;
}

function SimulationFlow({ result, report }) {
  return <section className="simulation-flow"><div className="flow-heading"><div><p className="eyebrow">FLUSSO PREVISTO</p><h3>Routing nel workspace</h3></div><button className="ghost" onClick={() => download(result, 'simulation-result.json')}>↓ Esporta risultato</button></div><p className="flow-disclaimer">Il grafico principale resta invariato: questo è il percorso che verrebbe creato per il prompt, senza eseguire componenti.</p>{result.steps.length ? <ol>{result.steps.map((step) => { const component = report.components.find((item) => item.id === step.component_id); return <li key={step.id}><span className="flow-index">{step.order}</span><div><strong>{component?.name || step.component_id}</strong><p>{simulationStatus[step.status] || step.status} · confidenza {Math.round(step.confidence * 100)}%</p><small>{step.reason}</small></div></li>; })}</ol> : <p className="flow-empty">Nessun componente soddisfa i criteri del documento AWDF corrente.</p>}</section>;
}
