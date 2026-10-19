import { useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, Background, Controls, Handle, Position, MarkerType } from '@xyflow/react';
import { siAnthropic, siGithubcopilot } from 'simple-icons';
import '@xyflow/react/dist/style.css';
import '../graph.css';
import { t, getLocale } from '../i18n/index.js';
import { SearchField, Pagination } from './ContentControls.jsx';
import { CATEGORY_META } from '../data.js';
import { buildGraphModel, projectGroupEdges, toolScope } from '../utils/graphModel.js';
import { componentColor, contrastText } from '../utils/paletteColors.js';
import { relationKind } from '../evaluator/contracts.js';
import { ContractPanel, RelationshipPanel, RELATION_LABELS } from './ContractPanel.jsx';

const PAGE_SIZE = 12;
const nodeTypes = { resource: ResourceNode };
const patterns = { configured: '8 5', available: '2 5', observed: '12 3 2 3', structural: '3 3' };
function ResourceNode({ data }) {
  const mark = data.toolId === 'claude_code' ? siAnthropic : data.toolId === 'github_copilot' ? siGithubcopilot : null;
  return <div className={`awdf-flow-node ${data.isTool ? 'is-tool' : ''}`} style={{ '--node-accent': data.color, '--node-fill': data.color, '--node-ink': contrastText(data.color) }}>
    <Handle type="target" position={Position.Left} />
    <div className="awdf-node-kicker"><span className="awdf-node-icon" aria-hidden="true">{mark ? <svg viewBox="0 0 24 24"><path d={mark.path}/></svg> : data.icon}</span><small>{data.type}</small></div>
    <strong title={data.label}>{data.label}</strong>
    <span className="awdf-node-description">{data.subtitle}</span>
    {data.count !== undefined && <div className="awdf-node-footer"><b>{data.count.toLocaleString()}</b> {t('elementi')} <span aria-hidden="true">↗</span></div>}
    <Handle type="source" position={Position.Right} />
  </div>;
}
function ToolOrigins({item,report}) {
  if (!item.properties?.tool_id) return null;
  const signals = item.properties.detection_signals || [];
  return <section className="atlas-tool-origins"><h3>{t('Come è stato riconosciuto')}</h3><p>{t('I file del workspace indicano un setup; installazione ed esecuzione del client non sono verificate.')}</p>
    {signals.length ? <ul>{signals.map((signal,index)=><li key={index}><code>{signal.path}</code><p>{signal.kind === 'workspace_directory' ? t('Cartella dedicata') : t('File o configurazione')} · {signal.detail}</p></li>)}</ul> : <p>{t('Dichiarato nelle impostazioni')}</p>}
    {(item.evidence_ids || []).map(id=>{const evidence=report.evidence.find(record=>record.id===id);return evidence&&<details key={id}><summary>{evidence.path}</summary><p>{evidence.summary}</p>{evidence.content_hash&&<code>{evidence.content_hash}</code>}</details>;})}
  </section>;
}
export function SetupGraph({ report, palette }) {
  const model = useMemo(() => buildGraphModel(report), [report]);
  const detailRef = useRef(null);
  const [query, setQuery] = useState(''), [tool, setTool] = useState('all'), [kind, setKind] = useState('all');
  const [category, setCategory] = useState('all'), [expanded, setExpanded] = useState(false), [page, setPage] = useState(0);
  const [selected, setSelected] = useState(null), [relation, setRelation] = useState(null), [bundle, setBundle] = useState([]), [bundlePage, setBundlePage] = useState(0);
  const [focus, setFocus] = useState(false), [positions, setPositions] = useState(new Map()), [layoutError, setLayoutError] = useState(''), [layoutBusy, setLayoutBusy] = useState(false);
  const scope = useMemo(() => tool === 'all' ? null : toolScope(model, tool), [model, tool]);
  const visible = useMemo(() => model.elements.filter(item => (!scope || scope.visibleIds.has(item.id)) && [item.name, item.description, item.path].join(' ').toLowerCase().includes(query.toLowerCase())), [model, scope, query]);
  const ids = new Set(visible.map(item => item.id));
  const groups = model.groups.map(group => ({ ...group, items: group.items.filter(item => ids.has(item.id)) })).filter(group => group.items.length);
  const tools = model.tools.filter(item => tool === 'all' || item.id === tool);
  const matching = category === 'all' ? visible : groups.find(group => group.id === category)?.items || [];
  const pageItems = matching.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const allRelations = useMemo(() => (scope ? scope.relations : [...model.relations, ...model.availableRelations, ...model.referenceRelations]).filter(edge => kind === 'all' || relationKind(edge) === kind), [scope, model, kind]);
  const relationsById = useMemo(() => new Map(allRelations.map(edge => [edge.id, edge])), [allRelations]);
  const primary = tool === 'all' ? report.extensions['ai-setup-classifier.reference-tools']?.data?.primary_tool_ids || [] : [tool];
  // A detail page exposes twelve real components. Others remain reachable through search and pages.
  const nodes = expanded ? [...tools, ...pageItems] : [...tools, ...groups];
  const nodeIds = new Set(nodes.map(item => item.id));
  const edges = expanded ? allRelations.filter(edge => nodeIds.has(edge.source_id) && nodeIds.has(edge.target_id)) : projectGroupEdges(allRelations, model.groupFor, nodeIds);
  const signature = JSON.stringify({ expanded, nodes: nodes.map(item => item.id), edges: edges.map(edge => [edge.id, edge.source_id, edge.target_id]) });
  useEffect(() => {
    let active = true;
    setLayoutError('');
    if (!expanded) { setPositions(new Map()); setLayoutBusy(false); return () => { active = false; }; }
    setLayoutBusy(true);
    import('elkjs/lib/elk.bundled.js').then(({ default: ELK }) => new ELK().layout({ id: 'root', layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.aspectRatio': '1.5', 'elk.spacing.nodeNode': '36', 'elk.layered.spacing.nodeNodeBetweenLayers': '100' }, children: nodes.map(item => ({ id: item.id, width: 260, height: 160 })), edges: edges.map(edge => ({ id: edge.id, sources: [edge.source_id], targets: [edge.target_id] })) })).then(graph => { if (active) { setPositions(new Map(graph.children.map(node => [node.id, { x: node.x, y: node.y }]))); setLayoutBusy(false); } }).catch(error => { if (active) { setLayoutError(error.message); setLayoutBusy(false); } });
    return () => { active = false; };
  }, [signature]);
  useEffect(() => { setSelected(null); setRelation(null); setBundle([]); setQuery(''); setTool('all'); setKind('all'); setCategory('all'); setExpanded(false); setPage(0); setFocus(false); }, [report]);
  const clearSelection = () => { setSelected(null); setRelation(null); setBundle([]); setBundlePage(0); };
  const resetFilters = () => { setQuery(''); setTool('all'); setKind('all'); setCategory('all'); setExpanded(false); setPage(0); setFocus(false); clearSelection(); };
  const openCategory = id => { setCategory(id); setExpanded(true); setPage(0); clearSelection(); };
  const chooseItem = item => { setSelected(item.id); setRelation(null); setBundle([]); };
  const chooseEdge = edge => {
    setBundle(edge.members || edge.data?.members || [edge.id]); setBundlePage(0);
    setRelation((edge.members || edge.data?.members || [edge.id])[0]); setSelected(null);
    requestAnimationFrame(() => { detailRef.current?.focus({ preventScroll: true }); detailRef.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' }); });
  };
  const neighbors = new Set([selected]);
  edges.forEach(edge => { if (edge.source_id === selected || edge.target_id === selected) { neighbors.add(edge.source_id); neighbors.add(edge.target_id); } });
  const hub = tools.find(item => primary.includes(item.id)) || tools[0];
  const hubs = hub ? [hub] : [];
  const orbit = nodes.filter(item => !hubs.includes(item));
  const overview = new Map();
  hubs.forEach((item, i) => overview.set(item.id, { x: 440, y: 280 + (i - (hubs.length - 1) / 2) * 178 }));
  orbit.forEach((item, i) => { const angle = -Math.PI / 2 + i * Math.PI * 2 / Math.max(1, orbit.length); overview.set(item.id, { x: 440 + Math.cos(angle) * Math.max(390, orbit.length * 50), y: 280 + Math.sin(angle) * Math.max(265, orbit.length * 36) }); });
  const flowNodes = nodes.map(item => ({ id: item.id, type: 'resource', position: expanded ? positions.get(item.id) || { x: 0, y: 0 } : overview.get(item.id), data: { label: item.name, color: tools.includes(item) ? palette.centralTool.background : componentColor(item, palette), type: item.kind === 'group' ? t('Categoria') : item.properties?.tool_id || item.kind, toolId: item.properties?.tool_id, isTool: tools.includes(item), icon: tools.includes(item) ? '>_' : CATEGORY_META[item.category]?.icon || '◇', count: item.items?.length, subtitle: item.kind === 'group' ? t(item.description) : tools.includes(item) ? item.properties?.detection_basis === 'workspace_directory' ? t('Dedotto dalle cartelle') : item.properties?.detection_signals?.length ? t('Rilevato nel workspace') : t('Dichiarato nelle impostazioni') : item.path || item.description }, style: { opacity: focus && selected && !neighbors.has(item.id) ? 0.25 : 1 }, selected: selected === item.id, draggable: false, ariaLabel: item.name }));
  const flowEdges = edges.map(edge => {
    const active = edge.source_id === selected || edge.target_id === selected || edge.id === relation || edge.members?.includes(relation);
    const color = active ? 'var(--map-line-active)' : 'var(--map-line)';
    return { id: edge.id, source: edge.source_id, target: edge.target_id, type: 'smoothstep', data: { members: edge.members || [edge.id] }, label: active ? `${t(RELATION_LABELS[relationKind(edge)])}${edge.members?.length > 1 ? ` · ${edge.members.length}` : ''}` : undefined, labelStyle: { fill: 'var(--ui-text)', fontSize: 13 }, labelBgStyle: { fill: 'var(--ui-surface)' }, style: { stroke: color, strokeWidth: active ? 5 : 3, opacity: focus && selected && !active ? 0.15 : 1, strokeDasharray: patterns[relationKind(edge)] }, markerEnd: { type: MarkerType.ArrowClosed, color, width: 22, height: 22 }, selected: active, interactionWidth: 40, ariaLabel: `${t(RELATION_LABELS[relationKind(edge)])}: ${nodes.find(item => item.id === edge.source_id)?.name || edge.source_id} → ${nodes.find(item => item.id === edge.target_id)?.name || edge.target_id}` };
  });
  const detail = model.byId.get(selected), group = groups.find(item => item.id === selected);
  const related = detail ? allRelations.filter(edge => edge.source_id === detail.id || edge.target_id === detail.id) : [];
  return <section className="atlas" data-report-id={report.metadata.report_id}>
    <header className="atlas-heading"><div><p className="eyebrow">AWDF 2.0 · {t('Mappa setup')}</p><h1>{t('Il tuo setup, a colpo d’occhio.')}</h1><p>{report.workspace.name} · {new Date(report.metadata.created_at).toLocaleString(getLocale())} · {report.metadata.generator.name}</p></div><div className="atlas-summary"><span><b>{model.tools.length}</b>{t('Tool AI')}</span><span><b>{model.elements.length.toLocaleString()}</b>{t('elementi')}</span><span><b>{model.groups.length}</b>{t('Categorie')}</span></div></header>
    <div className="atlas-layout"><aside className="atlas-inventory">
      <SearchField id="map-search" label={t('Cerca elementi')} placeholder={t('Nome, percorso o istruzione')} value={query} onChange={value=>{setQuery(value);setPage(0);clearSelection();}}/>
      <label htmlFor="map-tool">{t('Tool AI')}</label><select id="map-tool" value={tool} onChange={event => { setTool(event.target.value); setPage(0); clearSelection(); }}><option value="all">{t('Tutti')}</option>{model.tools.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <label htmlFor="map-kind">{t('Relazioni')}</label><select id="map-kind" value={kind} onChange={event => { setKind(event.target.value); clearSelection(); }}><option value="all">{t('Tutte')}</option>{Object.entries(RELATION_LABELS).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select>
      <div className="atlas-section-label">{t('Categorie')}<button onClick={resetFilters}>{t('Reset')}</button></div>
      <div className="atlas-category-list"><button aria-pressed={category === 'all'} onClick={() => { setCategory('all'); setPage(0); clearSelection(); }}>{t('Tutti gli elementi')}<b>{visible.length.toLocaleString()}</b></button>{groups.map(group => <button key={group.id} aria-pressed={category === group.id} onClick={() => openCategory(group.id)}><span>{t(group.name)}</span><b>{group.items.length.toLocaleString()}</b></button>)}</div>
      <div className="atlas-section-label">{t('Elementi')}<span>{matching.length ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, matching.length)} / ${matching.length}` : '0'}</span></div>
      <div className="atlas-inventory-list">{pageItems.map(item => <button key={item.id} aria-pressed={selected === item.id} onClick={() => chooseItem(item)}><strong>{item.name}</strong><small title={item.path}>{item.path || item.kind}</small></button>)}{!matching.length && <p>{t('Nessun elemento corrisponde ai filtri.')}</p>}</div>
      <Pagination page={page} total={matching.length} onChange={value => { setPage(value); clearSelection(); }}/>
    </aside><div className="atlas-map">
      <header className="atlas-map-top"><div><p className="eyebrow">{expanded ? t('ESPLORA') : t('PANORAMICA')}</p><h2>{expanded ? t(groups.find(group => group.id === category)?.name || 'Tutti gli elementi') : t('Tool e capacità del setup')}</h2></div><button aria-pressed={expanded} onClick={() => { setExpanded(value => !value); clearSelection(); }}>{expanded ? t('Panoramica') : t('Espandi elementi')}</button></header>
      <div className="atlas-map-context"><p>{expanded ? t('Una pagina alla volta. Seleziona un elemento per leggere istruzioni e prove.') : t('Seleziona una categoria, poi esplora i suoi elementi.')}</p><button aria-pressed={focus} disabled={!selected} onClick={() => setFocus(value => !value)}>{t('Focus collegamenti')}</button></div>
      <section className="awdf-flow-panel" style={{ '--map-line': contrastText(palette.canvas.background) === '#ffffff' ? '#94a3b8' : '#475569', '--map-line-active': contrastText(palette.canvas.background) === '#ffffff' ? '#22d3ee' : '#0e7490' }} aria-label={t('Collegamenti del setup')}>
        {layoutBusy ? <p className="atlas-map-state" role="status">{t('Organizzazione dei collegamenti…')}</p> : layoutError ? <p className="atlas-map-state" role="alert">{t('Layout non disponibile')}: {layoutError}</p> : <ReactFlow key={signature + positions.size} nodes={flowNodes} edges={flowEdges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.08, minZoom: expanded ? 0.65 : 0.25, maxZoom: 1 }} minZoom={0.2} maxZoom={2} nodesConnectable={false} nodesDraggable={false} onNodeClick={(_, node) => { setSelected(node.id); setRelation(null); setBundle([]); }} onEdgeClick={(_, edge) => chooseEdge(edge)}><Background color={palette.canvas.grid} gap={28} size={0.65}/><Controls showInteractive={false}/></ReactFlow>}
      </section>
      <footer className="atlas-map-legend">{Object.entries(RELATION_LABELS).map(([value, label]) => <span key={value}><i className={value}/>{t(label)}</span>)}<p>{expanded ? `${pageItems.length} / ${matching.length} ${t('elementi')} · ${edges.length} ${t('collegamenti visibili')}` : `${edges.length} ${t('collegamenti tra gruppi')}`} · {t('Trascina per spostarti · rotella per lo zoom')}</p></footer>
      <details className="atlas-visible-connections"><summary>{t('Collegamenti mostrati')} · {edges.length}</summary><div>{edges.map(edge => <button key={edge.id} onClick={() => chooseEdge(edge)}><strong>{nodes.find(node => node.id === edge.source_id)?.name} → {nodes.find(node => node.id === edge.target_id)?.name}</strong><span>{t(RELATION_LABELS[relationKind(edge)])} · {edge.members?.length || 1} · {t('Mostra origine')}</span></button>)}</div></details>
    </div><aside ref={detailRef} tabIndex={-1} className="atlas-detail" aria-label={t('Dettagli')}>
      <p className="eyebrow">{t('DETTAGLI E PROVE')}</p>
      {bundle.length ? <><h2>{t('Collegamenti del gruppo')}</h2><p>{bundle.length} {t('relazioni originali, ognuna con le proprie prove.')}</p><div className="atlas-relation-list">{bundle.slice(bundlePage * PAGE_SIZE, (bundlePage + 1) * PAGE_SIZE).map(id => { const edge = relationsById.get(id); return edge && <button key={id} aria-pressed={relation === id} onClick={() => setRelation(id)}><small>{t(RELATION_LABELS[relationKind(edge)])}</small><strong>{model.byId.get(edge.source_id)?.name} → {model.byId.get(edge.target_id)?.name}</strong></button>; })}</div><Pagination page={bundlePage} total={bundle.length} onChange={setBundlePage}/><RelationshipPanel report={{ ...report, relationships: allRelations }} relationshipId={relation}/></> : group ? <><h2>{t(group.name)}</h2><p>{t(group.description)}</p><p className="atlas-detail-count"><b>{group.items.length.toLocaleString()}</b> {t('elementi')}</p><button className="atlas-explore" onClick={() => openCategory(group.id)}>{t('Esplora categoria')} →</button></> : detail ? <><h2>{detail.name}</h2><p>{detail.description}</p>{detail.path && <code className="atlas-path">{detail.path}</code>}<ToolOrigins item={detail} report={report}/><ContractPanel report={report} targetId={detail.id}/><RelationshipPanel report={{ ...report, relationships: related }} targetId={detail.id}/></> : <><h2>{t('Da dove vuoi partire?')}</h2><ol className="atlas-reading-guide"><li><b>{t('Scegli il tool')}</b><span>{t('Filtra le capacità collegate al tuo assistente.')}</span></li><li><b>{t('Apri una categoria')}</b><span>{t('Skills, regole, plugin e server restano separati.')}</span></li><li><b>{t('Leggi le prove')}</b><span>{t('Seleziona un elemento o una linea per risalire alla fonte.')}</span></li></ol><p className="atlas-guidance">{t('Disponibile non significa eseguito. La mappa descrive il setup; le esecuzioni osservate hanno una vista dedicata.')}</p></>}
    </aside></div>
  </section>;
}
