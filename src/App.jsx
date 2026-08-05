import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CATEGORY_META, PALETTES, TYPE_TO_CATEGORY } from './data.js';
import reportFile from '../codex-setup-report.json';
import { simulate } from './simulator/index.js';
import { evaluateChatExamples } from './simulator/evaluateChats.js';

const categoryFor = (component) => {
  if (component.subtype === 'installed_plugin') return 'plugins';
  if (component.kind === 'mcp_server') return 'mcp_servers';
  if (component.kind === 'tool') return 'tools';
  return component.properties?.setup_category || TYPE_TO_CATEGORY[component.kind] || 'other';
};
const isVisibleSetupComponent = component => component.kind !== 'chat_source' && !(component.kind === 'configuration' && component.subtype === 'ai_configuration');
const simulationStatus = {
  predicted: 'Previsto', required: 'Richiesto', optional: 'Opzionale',
  fallback: 'Candidato debole', blocked: 'Bloccato', unavailable: 'Non disponibile'
};
const DIMENSION_GROUPS = [
  { id: 'foundations', icon: '◇', label: 'Istruzioni e conoscenza', description: 'Regole, fonti e gerarchia del contesto.', dimensions: ['behavior_contract', 'knowledge', 'instruction_hierarchy'] },
  { id: 'capabilities', icon: '✦', label: 'Capacità operative', description: 'Skill, agenti e integrazioni disponibili.', dimensions: ['skills', 'custom_agents', 'tool_integrations', 'tool_ergonomics'] },
  { id: 'assurance', icon: '✓', label: 'Qualità e sicurezza', description: 'Controlli, permessi, eval e osservabilità.', dimensions: ['validation', 'permission_safety', 'observability', 'evaluation_maturity'] },
  { id: 'architecture', icon: '⌘', label: 'Architettura ed efficienza', description: 'Manutenibilità, contesto e proporzionalità.', dimensions: ['maintainability', 'context_efficiency', 'architectural_proportionality'] }
];

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

function contentText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(contentText).filter(Boolean).join('\n');
  if (content && typeof content === 'object') return content.text || content.value || content.content ? contentText(content.text || content.value || content.content) : '';
  return '';
}

function collectMessages(value, found = []) {
  if (!value || typeof value !== 'object') return found;
  if (typeof value.role === 'string' && ('content' in value || 'text' in value)) {
    found.push({ role: value.role, text: contentText(value.content ?? value.text), tools: (value.tool_calls || value.toolCalls || []).map(call => call.function?.name || call.name).filter(Boolean) });
    return found;
  }
  for (const child of Object.values(value)) collectMessages(child, found);
  return found;
}

function extractChatExamples(raw, filename) {
  let messages = [];
  try { messages = collectMessages(JSON.parse(raw)); } catch {
    const parts = raw.split(/\r?\n(?=(?:user|utente|human|assistant|assistente)\s*:)/i);
    messages = parts.map(part => { const match = part.match(/^\s*(user|utente|human|assistant|assistente)\s*:\s*([\s\S]*)$/i); return match ? { role: /assistant|assistente/i.test(match[1]) ? 'assistant' : 'user', text: match[2].trim(), tools: [] } : null; }).filter(Boolean);
    if (!messages.length) messages = raw.split(/\r?\n\s*\r?\n/).filter(text => text.trim().length > 20).map(text => ({ role: 'user', text: text.trim(), tools: [] }));
  }
  const examples = [];
  for (let index = 0; index < messages.length; index += 1) {
    if (!['user', 'human'].includes(messages[index].role.toLowerCase()) || messages[index].text.trim().length < 8) continue;
    const following = [];
    for (let cursor = index + 1; cursor < messages.length && !['user', 'human'].includes(messages[cursor].role.toLowerCase()); cursor += 1) following.push(messages[cursor]);
    examples.push({ id: `chat_${examples.length + 1}`, source: filename, prompt: messages[index].text.trim(), observed_response: following.map(item => item.text).filter(Boolean).join('\n').slice(0, 1200), observed_tools: [...new Set(following.flatMap(item => item.tools || []))] });
  }
  return examples.slice(0, 100);
}

const reportChatExamples = report => report.extensions?.['ai-setup-classifier.chat-evals']?.data?.examples || [];
const clonePalette = palette => ({ ...palette, canvas: { ...palette.canvas }, centralTool: { ...palette.centralTool }, categories: { ...palette.categories }, severity: { ...palette.severity } });
const defaultPaletteConfigs = () => ({ dark: clonePalette(PALETTES.dark), light: clonePalette(PALETTES.light) });
const loadPaletteConfigs = () => {
  try {
    const stored = JSON.parse(localStorage.getItem('ai-setup-classifier-palettes'));
    if (stored?.dark?.categories && stored?.light?.categories) return stored;
  } catch { /* Use defaults when browser storage is unavailable or invalid. */ }
  return defaultPaletteConfigs();
};

export default function App() {
  const [report, setReport] = useState(() => validateAwdf(reportFile));
  const [paletteId, setPaletteId] = useState('dark');
  const [paletteConfigs, setPaletteConfigs] = useState(loadPaletteConfigs);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [activeView, setActiveView] = useState('setup');
  const [selected, setSelected] = useState(null);
  const [expanded, setExpanded] = useState(new Set());
  const [fullscreen, setFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState(null);
  const [runtimeEvaluation, setRuntimeEvaluation] = useState(() => evaluateChatExamples(reportFile, reportChatExamples(reportFile)));
  const [notice, setNotice] = useState('');
  const [edges, setEdges] = useState([]);
  const [detailAnchor, setDetailAnchor] = useState(null);
  const input = useRef();
  const graphRef = useRef();
  const hubRef = useRef();
  const groupRefs = useRef({});
  const dragRef = useRef(null);
  const palette = paletteConfigs[paletteId];

  const visibleComponents = useMemo(() => report.components.filter(isVisibleSetupComponent), [report]);
  const visibleComponentIds = useMemo(() => new Set(visibleComponents.map(component => component.id)), [visibleComponents]);
  const visibleRelationships = useMemo(() => report.relationships.filter(relationship => visibleComponentIds.has(relationship.source_id) && visibleComponentIds.has(relationship.target_id)), [report, visibleComponentIds]);
  const hub = useMemo(() => visibleComponents.find((component) => component.kind === 'tool') || visibleComponents[0], [visibleComponents]);
  const groups = useMemo(() => Object.entries(CATEGORY_META)
    .map(([id, meta]) => ({ ...meta, id, items: visibleComponents.filter((component) => component.id !== hub?.id && categoryFor(component) === id) }))
    .filter((group) => group.items.length), [visibleComponents, hub]);
  const detail = visibleComponents.find((component) => component.id === selected);
  const overallScore = report.executive_summary?.overall_score ?? (report.assessments.length ? report.assessments.reduce((sum, item) => sum + item.score, 0) / report.assessments.length : null);

  useEffect(() => {
    try { localStorage.setItem('ai-setup-classifier-palettes', JSON.stringify(paletteConfigs)); } catch { /* Palette still works for the current session. */ }
  }, [paletteConfigs]);

  const updatePaletteColor = (section, key, value) => setPaletteConfigs(configs => ({ ...configs, [paletteId]: { ...configs[paletteId], [section]: { ...configs[paletteId][section], [key]: value } } }));
  const resetPalette = () => setPaletteConfigs(configs => ({ ...configs, [paletteId]: clonePalette(PALETTES[paletteId]) }));

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
        const nextReport = validateAwdf(JSON.parse(reader.result));
        setReport(nextReport);
        setSelected(null);
        setResult(null);
        setRuntimeEvaluation(evaluateChatExamples(nextReport, reportChatExamples(nextReport)));
        setNotice('Documento AWDF caricato.');
      } catch (error) { setNotice(error.message); }
    };
    reader.readAsText(file);
  };

  const run = (candidate) => {
    const value = typeof candidate === 'string' ? candidate : prompt;
    if (!value.trim()) return setNotice('Inserisci un prompt da simulare.');
    setPrompt(value);
    setResult(simulate(value, report));
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

  return <main className={`app ${palette.mode} ${fullscreen ? 'graph-focus' : ''}`} style={{ '--canvas': palette.canvas.background, '--grid': palette.canvas.grid, '--ink': palette.centralTool.text, '--central': palette.centralTool.background, '--central-border': palette.centralTool.border }}>
    <header className="app-header">
      <div className="brand"><div className="logo">◈</div><div><strong>AI Setup Classifier</strong><span>{report.metadata.title}</span></div></div>
      <div className="header-actions">
        <button onClick={() => input.current.click()}>↑ Importa AWDF</button>
        <input ref={input} hidden type="file" accept=".json" onChange={upload} />
        <button className="ghost" onClick={() => download(report, 'ai-setup.json')}>↓ Esporta AWDF</button>
        <button className="ghost" onClick={() => setPaletteOpen(true)}>◐ Palette</button>
        <button className="ghost" onClick={() => setActiveView('simulator')}>▷ Prompt Lab</button>
      </div>
    </header>
    <nav className="view-tabs" aria-label="Sezioni del report"><button className={activeView === 'setup' ? 'active' : ''} onClick={() => setActiveView('setup')}>Mappa setup</button><button className={activeView === 'assessment' ? 'active' : ''} onClick={() => setActiveView('assessment')}>Valutazione e roadmap</button><button className={activeView === 'simulator' ? 'active' : ''} onClick={() => setActiveView('simulator')}>Prompt Lab</button></nav>
    {notice && <div className="notice">{notice}<button onClick={() => setNotice('')}>×</button></div>}
    {activeView === 'setup' ? <section className="workspace">
      <aside className="sidebar">
        <div className="side-title"><span>COMPONENTI</span><b>{visibleComponents.length}</b></div>
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
          <button ref={hubRef} className="central-node" onClick={(event) => selectComponent(hub?.id, event)}><span className="central-icon">✦</span><strong>{hub?.name || report.workspace.name}</strong><small>Tool AI principale</small><footer><span>↔ {visibleRelationships.length} relazioni</span><span>● {report.workspace.maturity}</span></footer></button>
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
        <div className="graph-footer"><span>{visibleComponents.length} elementi</span><span>{visibleRelationships.length} relazioni</span><span>{edges.length} connessioni visualizzate</span></div>
      </section>
      <aside className="details">{detail ? <Detail component={detail} report={report} /> : <WorkspacePanel report={report} components={visibleComponents} relationships={visibleRelationships} />}</aside>
    </section> : activeView === 'assessment' ? <EvaluationPage report={report} runtimeEvaluation={runtimeEvaluation} openSimulator={() => setActiveView('simulator')} /> : <PromptLabPage prompt={prompt} setPrompt={setPrompt} run={run} result={result} report={report} setNotice={setNotice} setRuntimeEvaluation={setRuntimeEvaluation} />}
    {paletteOpen && <PaletteEditor paletteId={paletteId} setPaletteId={setPaletteId} palette={palette} groups={groups} updateColor={updatePaletteColor} reset={resetPalette} close={() => setPaletteOpen(false)} />}
  </main>;
}

function ColorField({ label, value, onChange }) {
  return <label className="color-field"><span>{label}</span><div><input type="color" value={value} onChange={event => onChange(event.target.value)} aria-label={`Colore ${label}`} /><code>{value.toUpperCase()}</code></div></label>;
}

function PaletteEditor({ paletteId, setPaletteId, palette, groups, updateColor, reset, close }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Personalizza palette"><section className="palette-modal palette-editor"><header><div><p className="eyebrow">ASPETTO DEL VIEWER</p><h2>Palette e colori</h2></div><button aria-label="Chiudi palette" onClick={close}>×</button></header><p>Scegli il layout e personalizza i colori delle componenti. Le modifiche vengono applicate subito e salvate in questo browser.</p><section className="theme-choice"><button className={paletteId === 'dark' ? 'active' : ''} onClick={() => setPaletteId('dark')}><i className="theme-preview dark-preview" /><span><strong>Dark</strong><small>Canvas scuro</small></span></button><button className={paletteId === 'light' ? 'active' : ''} onClick={() => setPaletteId('light')}><i className="theme-preview light-preview" /><span><strong>Light</strong><small>Canvas chiaro</small></span></button></section><div className="palette-columns"><section><div className="palette-section-title"><h3>Struttura</h3><span>Canvas e nodo centrale</span></div><div className="color-grid"><ColorField label="Sfondo canvas" value={palette.canvas.background} onChange={value => updateColor('canvas', 'background', value)} /><ColorField label="Griglia" value={palette.canvas.grid} onChange={value => updateColor('canvas', 'grid', value)} /><ColorField label="Nodo centrale" value={palette.centralTool.background} onChange={value => updateColor('centralTool', 'background', value)} /><ColorField label="Bordo centrale" value={palette.centralTool.border} onChange={value => updateColor('centralTool', 'border', value)} /><ColorField label="Testo centrale" value={palette.centralTool.text} onChange={value => updateColor('centralTool', 'text', value)} /></div></section><section><div className="palette-section-title"><h3>Componenti</h3><span>Il colore vale anche per i collegamenti</span></div><div className="color-grid component-colors">{groups.map(group => <ColorField key={group.id} label={group.label} value={palette.categories[group.id] || '#94a3b8'} onChange={value => updateColor('categories', group.id, value)} />)}</div></section></div><footer><button className="ghost" onClick={reset}>Ripristina {paletteId}</button><button onClick={close}>Applica</button></footer></section></div>;
}

function Detail({ component, report }) {
  const relationships = report.relationships.filter((relationship) => relationship.source_id === component.id || relationship.target_id === component.id);
  const triggers = component.activation?.triggers || [];
  return <div className="panel"><p className="eyebrow">{component.kind} · {component.subtype}</p><h2>{component.name}</h2><p>{component.description}</p>{component.capabilities?.length > 0 && <><h3>Capacita</h3><p>{component.capabilities.join(', ')}</p></>}{triggers.length > 0 && <><h3>Trigger rilevati</h3><p>{triggers.map(trigger => trigger.value).join(', ')}</p></>}<h3>Connessioni</h3>{relationships.length ? relationships.map((relationship) => <p key={relationship.id}>{relationship.type} · {relationship.verification_status}</p>) : <p>Nessuna relazione riportata nel documento.</p>}</div>;
}

function WorkspacePanel({ report, components, relationships }) {
  const counts = components.reduce((map, component) => ({ ...map, [component.kind]: (map[component.kind] || 0) + 1 }), {});
  return <div className="panel"><p className="eyebrow">SETUP OSSERVATO</p><h2>{report.workspace.name}</h2><p>{report.workspace.purpose}</p><h3>Inventario visualizzato</h3>{Object.entries(counts).map(([kind, count]) => <p className="inventory-row" key={kind}><span>{kind.replaceAll('_', ' ')}</span><b>{count}</b></p>)}<h3>Copertura</h3><p>{components.length} componenti e {relationships.length} relazioni visibili. Chat e file di configurazione del tool restano disponibili per analisi e valutazione.</p></div>;
}

function AssessmentCard({ assessment }) {
  const tone = assessment.score >= 4 ? 'strong' : assessment.score >= 2.5 ? 'medium' : 'critical';
  return <article className={`assessment-card ${tone}`}><header><b>{assessment.dimension.replaceAll('_', ' ')}</b><span>{assessment.score}/5</span></header><div className="score-bar"><i style={{ width: `${assessment.score * 20}%` }} /></div><p>{assessment.rationale}</p><div className="assessment-notes">{assessment.strengths?.map(item => <small key={item}>+ {item}</small>)}{assessment.weaknesses?.map(item => <small className="weakness" key={item}>− {item}</small>)}</div></article>;
}

function EvaluationPage({ report, runtimeEvaluation, openSimulator }) {
  const summary = report.executive_summary || {};
  const designScore = summary.design_score ?? summary.overall_score ?? 0;
  const runtimeScore = runtimeEvaluation?.score ?? summary.verified_runtime_score;
  const priorityOrder = { quick_win: 0, short_term: 1, medium_term: 2, strategic: 3 };
  const recommendations = [...report.recommendations].sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9));
  const configuredDimensions = new Set(DIMENSION_GROUPS.flatMap(group => group.dimensions));
  const dimensionGroups = DIMENSION_GROUPS.map(group => ({ ...group, items: group.dimensions.map(dimension => report.assessments.find(item => item.dimension === dimension)).filter(Boolean) }));
  const ungrouped = report.assessments.filter(item => !configuredDimensions.has(item.dimension));
  if (ungrouped.length) dimensionGroups.push({ id: 'other', icon: '•', label: 'Altre dimensioni', description: 'Aree aggiuntive definite dal report.', items: ungrouped });
  return <section className="evaluation-page">
    <header className="evaluation-hero"><div><p className="eyebrow">AI SETUP ARCHITECT</p><h1>Valutazione e roadmap</h1><p>Il design è misurato dalle evidenze statiche. Il runtime resta separato finché prompt e risultati reali non vengono verificati.</p></div><button onClick={openSimulator}>Apri laboratorio prompt</button></header>
    <div className="score-grid"><article><span>Design score</span><strong>{Number(designScore).toFixed(1)}<small>/5</small></strong><p>Configurazione, chiarezza, sicurezza e manutenibilità.</p></article><article className={runtimeScore == null ? 'unverified' : 'observed-runtime'}><span>Runtime osservato {runtimeEvaluation && <em>da chat</em>}</span><strong>{runtimeScore == null ? 'N/D' : Number(runtimeScore).toFixed(1)}{runtimeScore != null && <small>/5</small>}</strong><p>{runtimeEvaluation ? `${runtimeEvaluation.sampleCount} conversazioni analizzate · copertura ${Math.round(runtimeEvaluation.coverage * 100)}% · risposte osservate ${Math.round(runtimeEvaluation.completion * 100)}%.` : runtimeScore == null ? 'Importa chat o eval per calcolare il comportamento osservato.' : 'Valutazione runtime verificata dal report.'}</p>{runtimeEvaluation && <small className="score-method">Valore osservativo, non ground truth · {runtimeEvaluation.gapCount} gap rilevati</small>}</article></div>
    <div className="evaluation-layout"><section className="dimensions-section"><div className="section-heading"><div><p className="eyebrow">COPERTURA DEL SETUP</p><h2>Dimensioni</h2></div><span>{report.assessments.length} aree · 4 gruppi</span></div><div className="dimension-groups">{dimensionGroups.filter(group => group.items.length).map(group => { const average = group.items.reduce((sum, item) => sum + item.score, 0) / group.items.length; const critical = group.items.filter(item => item.score < 2.5).length; return <section className="dimension-group" key={group.id}><header className="dimension-group-header"><i>{group.icon}</i><div><h3>{group.label}</h3><p>{group.description}</p></div><aside><strong>{average.toFixed(1)}</strong><span>media /5</span>{critical > 0 && <small>{critical} {critical === 1 ? 'criticità' : 'criticità'}</small>}</aside></header><div className="assessment-grid">{group.items.map(assessment => <AssessmentCard assessment={assessment} key={assessment.id} />)}</div></section>; })}</div></section>
    <section className="roadmap-section"><div className="section-heading"><div><p className="eyebrow">PROSSIME AZIONI</p><h2>Roadmap</h2></div><span>{recommendations.length} interventi consigliati</span></div>{recommendations.length ? <div className="roadmap-grid">{recommendations.map((item, index) => <article className="recommendation-card" key={item.id}><header><b>{String(index + 1).padStart(2, '0')}</b><span>{item.priority.replaceAll('_', ' ')}</span></header><h3>{item.title}</h3><p>{item.description}</p><footer><span>Impegno</span><strong>{item.effort}</strong></footer></article>)}</div> : <p>Nessuna raccomandazione aperta.</p>}</section></div>
  </section>;
}

function Simulator({ prompt, setPrompt, run, close, result, report }) {
  const examples = ['Analizza questo repository, individua i rischi di sicurezza e crea un report PDF.', 'Leggi la knowledge base e proponi una modifica al codice.', 'Validate the workspace configuration and publish the changes to GitHub.'];
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><section className="palette-modal simulator-modal"><header><div><p className="eyebrow">PROMPT SIMULATOR</p><h2>Simulazione statica</h2></div><button aria-label="Chiudi" onClick={close}>×</button></header><p>Nessun tool o agente verrà eseguito: il routing è previsto esclusivamente dai dati AWDF correnti.</p><label className="prompt-field"><span>Prompt da simulare</span><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Es. Analizza il repository e crea un report PDF…" rows="5" /></label><div className="preset-row">{examples.map((example) => <button key={example} onClick={() => setPrompt(example)}>{example.slice(0, 42)}…</button>)}</div><footer><button className="ghost" onClick={() => setPrompt('')}>Pulisci</button><button onClick={run}>Simula</button></footer>{result && <SimulationFlow result={result} report={report} />}</section></div>;
}

function PromptLabPage({ prompt, setPrompt, run, result, report, setNotice, setRuntimeEvaluation }) {
  const defaults = report.extensions?.['ai-setup-classifier.chat-evals']?.data?.examples || [];
  const [chatExamples, setChatExamples] = useState(defaults);
  const [chatSource, setChatSource] = useState('default_tool_chat_history');
  const chatInput = useRef();
  const presets = ['Analizza questo repository, individua i rischi di sicurezza e crea un report PDF.', 'Apri localhost nel browser e verifica il flusso principale.', 'Controlla le pull request GitHub e proponi le priorità.', 'Analizza i keypoint MediaPipe e restituisci JSON.'];
  useEffect(() => { setChatExamples(defaults); setChatSource('default_tool_chat_history'); }, [report.metadata.report_id]);
  const analyzed = useMemo(() => chatExamples.map((example, index) => {
    const simulation = simulate(example.prompt, report);
    const routedSteps = simulation.steps.filter(step => step.status !== 'required');
    const top = routedSteps[0]?.confidence || 0;
    const second = routedSteps[1]?.confidence || 0;
    const observedTools = example.observed_tools || [];
    const routedNames = routedSteps.slice(0, 4).map(step => report.components.find(component => component.id === step.component_id)?.name?.toLowerCase() || '');
    const observedMismatch = observedTools.length > 0 && !observedTools.some(tool => routedNames.some(name => name.includes(tool.toLowerCase()) || tool.toLowerCase().includes(name)));
    const flags = [top < .75 ? 'routing debole' : null, top && top - second < .15 ? 'routing ambiguo' : null, observedMismatch ? 'tool osservati diversi' : null, routedSteps.length === 0 ? 'nessun componente specifico' : null, simulation.routing_gaps?.length ? `${simulation.routing_gaps.length} gap di copertura` : null].filter(Boolean);
    return { ...example, id: example.id || `history_${index + 1}`, source: example.source || 'Cronologia del tool principale', simulation, flags, routingConfidence: top, reviewPriority: flags.length * 2 + (1 - top) };
  }).sort((a, b) => b.reviewPriority - a.reviewPriority), [chatExamples, report]);
  useEffect(() => {
    setRuntimeEvaluation(evaluateChatExamples(report, chatExamples, chatSource));
  }, [chatExamples, chatSource, report, setRuntimeEvaluation]);
  const loadChat = event => {
    const file = event.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { const examples = extractChatExamples(String(reader.result || ''), file.name); setChatExamples(examples); setChatSource('chat_import'); setNotice(examples.length ? `${examples.length} prompt estratti e valutati localmente dalla chat.` : 'Nessun prompt utente riconoscibile nella chat.'); };
    reader.readAsText(file);
  };
  return <section className="prompt-lab-page"><header className="evaluation-hero"><div><p className="eyebrow">PROMPT LAB</p><h1>Routing ed esempi reali</h1><p>I prompt provenienti dalla cronologia del tool principale sono già disponibili nel report in forma redatta. Puoi aggiungere manualmente altri export senza inviarli fuori dal browser.</p></div><button className="ghost" onClick={() => chatInput.current.click()}>Importa altra chat</button><input ref={chatInput} hidden type="file" accept=".json,.jsonl,.txt,.md" onChange={loadChat} /></header><div className="prompt-lab-layout"><section className="prompt-console"><label className="prompt-field"><span>Prompt da simulare</span><textarea value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="Descrivi un’attività reale del tuo setup…" rows="6" /></label><div className="preset-row">{presets.map(example => <button key={example} onClick={() => setPrompt(example)}>{example.slice(0, 46)}…</button>)}</div><div className="prompt-actions"><button className="ghost" onClick={() => setPrompt('')}>Pulisci</button><button onClick={() => run()}>Simula routing</button></div>{result && <SimulationFlow result={result} report={report} />}</section><aside className="history-evals"><div className="flow-heading"><div><p className="eyebrow">CHAT EVAL</p><h2>{analyzed.length} prompt disponibili</h2></div></div><p className="flow-disclaimer">In alto trovi i casi più deboli, ambigui o divergenti dai tool osservati.</p>{analyzed.length ? <div className="chat-example-list single">{analyzed.map(example => <article key={example.id}><header><span>{example.source}</span><b>{Math.round(example.routingConfidence * 100)}%</b></header><p>{example.prompt}</p><small>{example.flags.length ? example.flags.join(' · ') : 'routing coerente'}</small><button onClick={() => run(example.prompt)}>Analizza</button></article>)}</div> : <div className="chat-empty">Il report non contiene ancora esempi di chat. Rigenera la scansione del tool principale.</div>}</aside></div></section>;
}

function SimulatorLab({ prompt, setPrompt, run, close, result, report, setNotice, setRuntimeEvaluation }) {
  const [chatExamples, setChatExamples] = useState([]);
  const chatInput = useRef();
  const presets = ['Analizza questo repository, individua i rischi di sicurezza e crea un report PDF.', 'Apri localhost nel browser e verifica il flusso principale.', 'Controlla le pull request GitHub e proponi le priorità.', 'Analizza i keypoint MediaPipe e restituisci JSON.'];
  const analyzed = useMemo(() => chatExamples.map(example => {
    const simulation = simulate(example.prompt, report);
    const routedSteps = simulation.steps.filter(step => step.status !== 'required');
    const top = routedSteps[0]?.confidence || 0;
    const second = routedSteps[1]?.confidence || 0;
    const routedNames = routedSteps.slice(0, 4).map(step => report.components.find(component => component.id === step.component_id)?.name?.toLowerCase() || '');
    const observedMismatch = example.observed_tools.length > 0 && !example.observed_tools.some(tool => routedNames.some(name => name.includes(tool.toLowerCase()) || tool.toLowerCase().includes(name)));
    const flags = [top < .75 ? 'routing debole' : null, top && top - second < .15 ? 'routing ambiguo' : null, observedMismatch ? 'tool osservati diversi' : null, routedSteps.length === 0 ? 'nessun componente specifico' : null, simulation.routing_gaps?.length ? `${simulation.routing_gaps.length} gap di copertura` : null].filter(Boolean);
    return { ...example, simulation, flags, routingConfidence: top, reviewPriority: flags.length * 2 + (1 - top) };
  }).sort((a, b) => b.reviewPriority - a.reviewPriority), [chatExamples, report]);
  useEffect(() => {
    setRuntimeEvaluation(evaluateChatExamples(report, chatExamples, 'chat_import'));
  }, [chatExamples, report, setRuntimeEvaluation]);
  const loadChat = event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const examples = extractChatExamples(String(reader.result || ''), file.name);
      setChatExamples(examples);
      setNotice(examples.length ? `${examples.length} prompt estratti localmente dalla chat.` : 'Nessun prompt utente riconoscibile nella chat.');
    };
    reader.readAsText(file);
  };
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><section className="palette-modal simulator-modal"><header><div><p className="eyebrow">PROMPT LAB</p><h2>Routing ed eval dalle chat</h2></div><button aria-label="Chiudi" onClick={close}>×</button></header><p>La simulazione non esegue tool. I file chat vengono analizzati soltanto nel browser e non sono aggiunti al report né inviati altrove.</p><label className="prompt-field"><span>Prompt da simulare</span><textarea value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="Descrivi un’attività reale del tuo setup…" rows="4" /></label><div className="preset-row">{presets.map(example => <button key={example} onClick={() => setPrompt(example)}>{example.slice(0, 46)}…</button>)}</div><footer><button className="ghost" onClick={() => setPrompt('')}>Pulisci</button><button onClick={() => run()}>Simula routing</button></footer><section className="chat-lab"><div className="flow-heading"><div><p className="eyebrow">CHAT EVAL</p><h3>Esempi reali da analizzare</h3></div><button className="ghost" onClick={() => chatInput.current.click()}>Importa chat</button><input ref={chatInput} hidden type="file" accept=".json,.jsonl,.txt,.md" onChange={loadChat} /></div><p className="flow-disclaimer">Sono proposti per primi i prompt con routing debole, ambiguo o diverso dai tool osservati nella conversazione.</p>{analyzed.length > 0 ? <div className="chat-example-list">{analyzed.slice(0, 12).map(example => <article key={example.id}><header><span>{example.source}</span><b>{Math.round(example.routingConfidence * 100)}%</b></header><p>{example.prompt}</p><small>{example.flags.length ? example.flags.join(' · ') : 'routing coerente'}</small><button onClick={() => run(example.prompt)}>Analizza questo prompt</button></article>)}</div> : <div className="chat-empty">Importa un export JSON/JSONL o una chat testuale con ruoli “user” e “assistant”.</div>}</section>{result && <SimulationFlow result={result} report={report} />}</section></div>;
}

function LegacySimulationFlow({ result, report }) {
  return <section className="simulation-flow"><div className="flow-heading"><div><p className="eyebrow">FLUSSO PREVISTO</p><h3>Routing nel workspace</h3></div><button className="ghost" onClick={() => download(result, 'simulation-result.json')}>↓ Esporta risultato</button></div><p className="flow-disclaimer">Il grafico principale resta invariato: questo è il percorso che verrebbe creato per il prompt, senza eseguire componenti.</p>{result.steps.length ? <ol>{result.steps.map((step) => { const component = report.components.find((item) => item.id === step.component_id); return <li key={step.id}><span className="flow-index">{step.order}</span><div><strong>{component?.name || step.component_id}</strong><p>{simulationStatus[step.status] || step.status} · confidenza {Math.round(step.confidence * 100)}%</p><small>{step.reason}</small></div></li>; })}</ol> : <p className="flow-empty">Nessun componente soddisfa i criteri del documento AWDF corrente.</p>}</section>;
}

function RoutingTimelineItem({ item, result, report }) {
  if (item.type === 'gap') return <li className="route-gap"><span className="flow-index">{item.order}</span><div><span className="route-stage">{item.label}</span><strong>Capacità non coperta</strong><p>Gap di routing · termine “{item.matched_term}”</p><small>{item.reason}</small></div></li>;
  const step = result.steps.find(candidate => candidate.id === item.step_id);
  const component = report.components.find(candidate => candidate.id === step?.component_id);
  if (!step) return null;
  return <li><span className="flow-index">{item.order}</span><div><span className="route-stage">{step.route_stage?.label || 'Instradamento'}</span><strong>{component?.name || step.component_id}</strong><p>{simulationStatus[step.status] || step.status} · confidenza {Math.round(step.confidence * 100)}%</p><small>{step.matched_capabilities.length ? `Capacità: ${step.matched_capabilities.join(', ')}` : step.status === 'required' ? 'Orchestratore principale' : 'Nome o trigger distintivo'}{step.matched_triggers.length ? ` · Trigger: ${step.matched_triggers.map(trigger => trigger.value).join(', ')}` : ''}</small>{step.predicted_output_types.length > 0 && <small>Output previsti: {step.predicted_output_types.join(', ')}</small>}</div></li>;
}

function SimulationFlow({ result, report }) {
  const timeline = result.timeline || result.steps.map(step => ({ type: 'route', step_id: step.id, order: step.order }));
  return <section className="simulation-flow"><div className="flow-heading"><div><p className="eyebrow">FLUSSO PREVISTO</p><h3>Routing nel workspace</h3></div><button className="ghost" onClick={() => download(result, 'simulation-result.json')}>↓ Esporta risultato</button></div><p className="flow-disclaimer">Le fasi seguono l’ordine delle richieste nel prompt; a parità di fase, i candidati sono ordinati per confidenza. È una previsione statica: nessun componente viene eseguito.</p>{timeline.length ? <ol>{timeline.map(item => <RoutingTimelineItem item={item} result={result} report={report} key={item.step_id || item.gap_id} />)}</ol> : <p className="flow-empty">Nessuna corrispondenza semantica: il simulatore non prevede l’attivazione di componenti per questo prompt.</p>}</section>;
}
