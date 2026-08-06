import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CATEGORY_META } from '../data.js';
import { categoryFor, isVisibleSetupComponent } from '../utils/appUtils.js';

function attachPoint(from, to, box) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const scale = 1 / Math.max(Math.abs(dx) / (box.width / 2), Math.abs(dy) / (box.height / 2));
  return { x: from.x + dx * scale, y: from.y + dy * scale };
}

function descendantsOf(componentId, components) {
  const children = components.filter(component => component.parent_id === componentId);
  return children.flatMap(child => [child, ...descendantsOf(child.id, components)]);
}

function Detail({ component, report }) {
  const relationships = report.relationships.filter(relationship => relationship.source_id === component.id || relationship.target_id === component.id);
  const children = descendantsOf(component.id, report.components);
  const triggers = component.activation?.triggers || [];
  return <div className="panel"><p className="eyebrow">{component.kind} · {component.subtype}</p><h2>{component.name}</h2><p>{component.description}</p>{children.length > 0 && <p className="component-count">{children.length} elementi contenuti</p>}{component.capabilities?.length > 0 && <><h3>Capacità</h3><p>{component.capabilities.join(', ')}</p></>}{triggers.length > 0 && <><h3>Trigger rilevati</h3><p>{triggers.map(trigger => trigger.value).join(', ')}</p></>}<h3>Connessioni</h3>{relationships.length ? relationships.slice(0, 12).map(relationship => <p key={relationship.id}>{relationship.type} · {relationship.verification_status}</p>) : <p>Nessuna relazione riportata nel documento.</p>}</div>;
}

function WorkspacePanel({ report, components, relationships }) {
  const counts = components.reduce((map, component) => ({ ...map, [component.kind]: (map[component.kind] || 0) + 1 }), {});
  return <div className="panel"><p className="eyebrow">SETUP OSSERVATO</p><h2>{report.workspace.name}</h2><p>{report.workspace.purpose}</p><h3>Inventario visualizzato</h3>{Object.entries(counts).map(([kind, count]) => <p className="inventory-row" key={kind}><span>{kind.replaceAll('_', ' ')}</span><b>{count}</b></p>)}<h3>Copertura</h3><p>{components.length} componenti principali e {relationships.length} relazioni visibili. Gli elementi contenuti sono disponibili tramite Esamina.</p></div>;
}

function ComponentTree({ parent, components, palette, depth = 0 }) {
  const children = components.filter(component => component.parent_id === parent.id);
  if (!children.length) return null;
  return <div className="component-tree" style={{ '--depth': depth }}>{children.map(child => <article className="examined-child" key={child.id} style={{ '--node': palette.categories[categoryFor(child)] || '#94a3b8' }}><header><span>{child.kind.replaceAll('_', ' ')}</span><strong>{child.name}</strong></header>{child.description && <p>{child.description}</p>}{child.path && <code>{child.path}</code>}<ComponentTree parent={child} components={components} palette={palette} depth={depth + 1} /></article>)}</div>;
}

function ComponentExaminer({ component, report, palette, onBack }) {
  const descendants = descendantsOf(component.id, report.components);
  return <section className="component-examiner"><header className="examiner-toolbar"><button onClick={onBack}>← Torna al grafico completo</button><span>{descendants.length} elementi espansi</span></header><div className="examiner-content"><article className="examined-root" style={{ '--node': palette.categories[categoryFor(component)] || '#94a3b8' }}><p className="eyebrow">{component.kind} · {component.subtype}</p><h1>{component.name}</h1><p>{component.description}</p>{component.path && <code>{component.path}</code>}</article>{descendants.length ? <ComponentTree parent={component} components={report.components} palette={palette} /> : <div className="examiner-empty">Questo componente non contiene elementi figli nel report.</div>}</div></section>;
}

function GroupExaminer({ group, report, palette, onBack }) {
  const expandedCount = group.items.reduce((total, component) => total + 1 + descendantsOf(component.id, report.components).length, 0);
  return <section className="component-examiner"><header className="examiner-toolbar"><button onClick={onBack}>← Torna al grafico completo</button><span>{expandedCount} elementi espansi</span></header><div className="examiner-content"><article className="examined-root examined-group" style={{ '--node': palette.categories[group.id] || '#94a3b8' }}><p className="eyebrow">COMPONENTE PRINCIPALE</p><h1>{group.label}</h1><p>{group.items.length} elementi del setup, con tutti i contenuti associati.</p></article>{group.items.map(component => <article className="examined-root" key={component.id} style={{ '--node': palette.categories[group.id] || '#94a3b8' }}><p className="eyebrow">{component.kind} · {component.subtype}</p><h2>{component.name}</h2><p>{component.description}</p>{component.path && <code>{component.path}</code>}<ComponentTree parent={component} components={report.components} palette={palette} /></article>)}</div></section>;
}

export function SetupGraph({ report, palette }) {
  const [selected, setSelected] = useState(null);
  const [examinedId, setExaminedId] = useState(null);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [examinedGroupId, setExaminedGroupId] = useState(null);
  const [expanded, setExpanded] = useState(new Set());
  const [fullscreen, setFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [edges, setEdges] = useState([]);
  const [detailAnchor, setDetailAnchor] = useState(null);
  const graphRef = useRef();
  const hubRef = useRef();
  const groupRefs = useRef({});
  const dragRef = useRef(null);

  const visibleComponents = useMemo(() => report.components.filter(component => isVisibleSetupComponent(component) && !component.parent_id), [report]);
  const visibleComponentIds = useMemo(() => new Set(visibleComponents.map(component => component.id)), [visibleComponents]);
  const visibleRelationships = useMemo(() => report.relationships.filter(relationship => visibleComponentIds.has(relationship.source_id) && visibleComponentIds.has(relationship.target_id)), [report, visibleComponentIds]);
  const hub = useMemo(() => visibleComponents.find(component => component.kind === 'tool') || visibleComponents[0], [visibleComponents]);
  const groups = useMemo(() => Object.entries(CATEGORY_META).map(([id, meta]) => ({ ...meta, id, items: visibleComponents.filter(component => component.id !== hub?.id && categoryFor(component) === id) })).filter(group => group.items.length), [visibleComponents, hub]);
  const detail = visibleComponents.find(component => component.id === selected);
  const examined = report.components.find(component => component.id === examinedId);
  const selectedGroup = groups.find(group => group.id === selectedGroupId);
  const examinedGroup = groups.find(group => group.id === examinedGroupId);

  useLayoutEffect(() => {
    const calculateEdges = () => {
      const graph = graphRef.current;
      const hubNode = hubRef.current;
      if (!graph || !hubNode) return;
      const graphBox = graph.getBoundingClientRect();
      const hubBox = hubNode.getBoundingClientRect();
      const hubCenter = { x: hubBox.left - graphBox.left + hubBox.width / 2, y: hubBox.top - graphBox.top + hubBox.height / 2 };
      setEdges(groups.flatMap(group => {
        const node = groupRefs.current[group.id];
        if (!node) return [];
        const box = node.getBoundingClientRect();
        const center = { x: box.left - graphBox.left + box.width / 2, y: box.top - graphBox.top + box.height / 2 };
        return [{ id: group.id, start: attachPoint(hubCenter, center, { width: hubBox.width, height: hubBox.height }), end: attachPoint(center, hubCenter, { width: box.width, height: box.height }), color: palette.categories[group.id] }];
      }));
    };
    calculateEdges();
    const observer = new ResizeObserver(calculateEdges);
    if (graphRef.current) observer.observe(graphRef.current);
    window.addEventListener('resize', calculateEdges);
    return () => { observer.disconnect(); window.removeEventListener('resize', calculateEdges); };
  }, [groups, fullscreen, palette]);

  useEffect(() => {
    if (!selectedGroupId) return undefined;
    const dismissPopup = event => {
      if (event.target.closest?.('.focus-detail, .category-node')) return;
      setSelectedGroupId(null);
      setDetailAnchor(null);
    };
    window.addEventListener('click', dismissPopup);
    return () => window.removeEventListener('click', dismissPopup);
  }, [selectedGroupId]);

  const selectGroup = (id, event) => {
    const graph = graphRef.current;
    const node = event.currentTarget;
    if (!graph || !node) return setSelectedGroupId(id);
    const graphBox = graph.getBoundingClientRect();
    const nodeBox = node.getBoundingClientRect();
    const left = nodeBox.left - graphBox.left + nodeBox.width / 2;
    const top = nodeBox.top - graphBox.top + nodeBox.height / 2;
    setSelectedGroupId(id);
    setDetailAnchor({ left: Math.max(180, Math.min(graphBox.width - 180, left)), top: Math.max(115, Math.min(graphBox.height - 120, top)), placeAbove: top > graphBox.height * .58 });
  };
  const selectComponent = id => { setSelected(id); setSelectedGroupId(null); setDetailAnchor(null); };
  const toggle = id => setExpanded(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const startPan = event => { if (event.target.closest('button, textarea, input')) return; dragRef.current = { x: event.clientX, y: event.clientY, pan }; event.currentTarget.setPointerCapture(event.pointerId); setIsPanning(true); };
  const movePan = event => { if (dragRef.current) setPan({ x: dragRef.current.pan.x + event.clientX - dragRef.current.x, y: dragRef.current.pan.y + event.clientY - dragRef.current.y }); };
  const stopPan = event => { if (!dragRef.current) return; dragRef.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); setIsPanning(false); };

  if (examinedGroup) return <GroupExaminer group={examinedGroup} report={report} palette={palette} onBack={() => setExaminedGroupId(null)} />;
  if (examined) return <ComponentExaminer component={examined} report={report} palette={palette} onBack={() => setExaminedId(null)} />;
  return <section className={`workspace ${fullscreen ? 'graph-focus-workspace' : ''}`}>
    <aside className="sidebar"><div className="side-title"><span>COMPONENTI</span><b>{visibleComponents.length}</b></div><div className="category-list">{groups.map(group => <button key={group.id} onClick={() => toggle(group.id)}><i style={{ color: palette.categories[group.id] }}>{group.icon}</i><span>{group.label}</span><b>{group.items.length}</b></button>)}</div><section className="legend"><div className="side-title"><span>COLLEGAMENTI</span></div><p>Le linee mostrano le relazioni del workspace con il tool centrale.</p><p>{edges.length} connessioni visibili</p></section></aside>
    <section className="graph-wrap"><div className="graph-toolbar"><span>AWDF · {report.format_version}</span><div><button onClick={() => setZoom(value => Math.max(.7, +(value - .1).toFixed(1)))} aria-label="Riduci zoom">−</button><button className="zoom-level" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>{Math.round(zoom * 100)}%</button><button onClick={() => setZoom(value => Math.min(1.5, +(value + .1).toFixed(1)))} aria-label="Aumenta zoom">+</button><button onClick={() => setPan({ x: 0, y: 0 })}>⌖ Centra</button><button onClick={() => setExpanded(new Set())}>Comprimi</button><button onClick={() => setExpanded(new Set(groups.map(group => group.id)))}>Espandi</button><button className="fullscreen-toggle" onClick={() => setFullscreen(value => !value)}>{fullscreen ? '× Esci' : '⛶ Schermo intero'}</button></div></div>
      <div ref={graphRef} className={`graph ${isPanning ? 'is-panning' : ''}`} onPointerDown={startPan} onPointerMove={movePan} onPointerUp={stopPan} onPointerCancel={stopPan}><div className="graph-stage" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}><svg className="edges" viewBox={`0 0 ${graphRef.current?.clientWidth || 1} ${graphRef.current?.clientHeight || 1}`} preserveAspectRatio="none" aria-hidden="true">{edges.map(edge => <g key={edge.id}><line x1={edge.start.x} y1={edge.start.y} x2={edge.end.x} y2={edge.end.y} stroke={edge.color} /><circle cx={edge.end.x} cy={edge.end.y} r="6" fill={edge.color} /></g>)}</svg><button ref={hubRef} className="central-node" onClick={event => selectComponent(hub?.id, event)}><span className="central-icon">✦</span><strong>{hub?.name || report.workspace.name}</strong><small>Tool AI principale</small><footer><span>↔ {visibleRelationships.length} relazioni</span><span>● {report.workspace.maturity}</span></footer></button>{groups.map((group, index) => { const angle = 360 * index / groups.length - 90; const x = 50 + 38 * Math.cos(angle * Math.PI / 180); const y = 50 + 34 * Math.sin(angle * Math.PI / 180); const placement = Math.abs(x - 50) > Math.abs(y - 50) ? (y < 50 ? 'up' : 'down') : (y < 50 ? 'left' : 'right'); return <div key={group.id} className="radial-group" style={{ left: `${x}%`, top: `${y}%` }}><button ref={element => { groupRefs.current[group.id] = element; }} className="category-node" style={{ '--node': palette.categories[group.id] }} onClick={event => { toggle(group.id); selectGroup(group.id, event); }}><i>{group.icon}</i><strong>{group.label}</strong><span>{group.items.length} elementi</span></button>{expanded.has(group.id) && <div className={`orbit-items opens-${placement}`}><div className="item-stack">{group.items.map(component => <button className="component-node" style={{ '--node': palette.categories[group.id] }} key={component.id} onClick={event => selectComponent(component.id, event)}>{component.name}</button>)}</div></div>}</div>; })}</div>{selectedGroup && detailAnchor && <div className={`focus-detail ${detailAnchor.placeAbove ? 'above' : ''}`} style={{ left: detailAnchor.left, top: detailAnchor.top }}><button className="focus-detail-close" aria-label="Chiudi dettaglio" onClick={() => { setSelectedGroupId(null); setDetailAnchor(null); }}>×</button><p className="eyebrow">COMPONENTE PRINCIPALE</p><h2>{selectedGroup.label}</h2><p>{selectedGroup.items.length} elementi del setup.</p><button className="focus-detail-examine" onClick={() => setExaminedGroupId(selectedGroup.id)}>Esamina componente</button></div>}</div>
      <div className="graph-footer"><span>{visibleComponents.length} componenti principali</span><span>{visibleRelationships.length} relazioni</span><span>{report.components.length - visibleComponents.length} elementi contenuti</span></div></section>
    <aside className="details">{detail ? <Detail component={detail} report={report} /> : <WorkspacePanel report={report} components={visibleComponents} relationships={visibleRelationships} />}</aside>
  </section>;
}
