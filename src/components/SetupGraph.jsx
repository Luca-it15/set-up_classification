import { t } from '../i18n/index.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORY_META } from '../data.js';
import { categoryFor } from '../utils/appUtils.js';
import { buildGraphModel, layoutGraph, graphEdgePath, projectGroupEdges } from '../utils/graphModel.js';
import { CONTRACT_KEY, relationKind } from '../evaluator/contracts.js';
import { ContractPanel, RelationshipPanel, RELATION_LABELS } from './ContractPanel.jsx';
import {useGraphViewport, MIN_ZOOM, MAX_ZOOM} from '../utils/useGraphViewport.js';
import {componentColor, contrastText} from '../utils/paletteColors.js';
import '../graph.css';

const TYPES = [['all', 'Tutti'], ['legacy_unverified', 'Da verificare'], ['contractual', 'Contratti'], ['configured', 'Configurazioni'], ['available', 'Disponibili'], ['observed', 'Osservazioni'], ['structural', 'Struttura']];
const PAGE_SIZE = 24;
const connectionLabel = (item, model) => item.properties?.disabled ? 'Disabilitato' : item.properties?.connection_ready === false ? 'Configurazione incompleta' : model.linkedIds.has(item.id) ? 'Collegato al setup' : 'Collegamento non rilevato';

export function SetupGraph({ report, palette }) {
  const model = useMemo(() => buildGraphModel(report), [report]);
  const [selected, setSelected] = useState(null);
  const [openGroup, setOpenGroup] = useState(null);
  const elementDialog = useRef(null), componentTrigger = useRef(null);
  const [selectedRelation, setSelectedRelation] = useState(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [kind, setKind] = useState('all');
  const [tool, setTool] = useState('all');
  const [page, setPage] = useState(0);
  const [mapPage, setMapPage] = useState(0);
  const primaryIds = report.extensions?.['ai-setup-classifier.reference-tools']?.data?.primary_tool_ids || [];
  const primaryTools = model.tools.filter(item => primaryIds.includes(item.id));
  const visualRelations = [...model.relations, ...model.possibleRelations, ...model.availableRelations];
  const [fullscreen, setFullscreen] = useState(false);
  const canvas = useRef(null), search = useRef(null), graphRoot = useRef(null), detailHeading = useRef(null);
  const {view, fit, zoomBy, panBy, handlers} = useGraphViewport(canvas, 1220, 930);
  const zoom = view.scale;
  const toolIds = useMemo(() => new Set(model.tools.map(item => item.id)), [model]);
  const filtered = useMemo(() => [...model.tools, ...model.elements].filter(item =>
    (category === 'all' || categoryFor(item) === category) &&
    [item.name, item.path, item.description].join(' ').toLocaleLowerCase('it-IT').includes(query.toLocaleLowerCase('it-IT').trim())
  ), [model, query, category]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const inventory = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const relations = visualRelations.filter(item => (kind === 'all' || relationKind(item) === kind) && (tool === 'all' || item.source_id === tool || item.target_id === tool));
  const matchingIds = new Set(filtered.map(item => item.id));
  const relevant = relations.filter(item => matchingIds.has(item.source_id) || matchingIds.has(item.target_id));
  const selectedGroup = model.groups.find(group => group.id === selected);
  const dialogGroup = model.groups.find(group => group.id === openGroup);
  const selectedIds = new Set(selectedGroup ? selectedGroup.items.map(item => item.id) : selected ? [selected] : []);
  const selectionRelations = selected ? relevant.filter(item => selectedIds.has(item.source_id) || selectedIds.has(item.target_id)) : relevant;
  // Overview is stable: components surround the primary tool, elements live in the inspector.
  const visibleGroups = model.groups.filter(group => group.items.some(item => matchingIds.has(item.id)));
  const candidates = [...model.tools.filter(item => !primaryIds.includes(item.id) && (matchingIds.has(item.id) || relevant.some(edge => edge.source_id === item.id || edge.target_id === item.id))), ...visibleGroups];
  const mapPageCount = Math.max(1, Math.ceil(candidates.length / 12)), mapCurrent = Math.min(mapPage, mapPageCount - 1);
  const nodes = candidates.slice(mapCurrent * 12, (mapCurrent + 1) * 12);
  for (const item of [...primaryTools].reverse()) if (candidates.length || matchingIds.has(item.id)) nodes.unshift(item);
  const shownIds = new Set(nodes.map(item => item.id));
  const edges = projectGroupEdges(selectionRelations, model.groupFor, shownIds);
  const layout = layoutGraph(nodes, edges, toolIds, primaryIds);
  const edgeColor = edge => {
    const target = nodes.find(item => item.id === edge.target_id);
    const source = nodes.find(item => item.id === edge.source_id);
    return componentColor(target?.kind === 'group' ? target : source?.kind === 'group' ? source : target || source, palette);
  };
  const detail = selectedGroup || model.byId.get(selected);
  const contained = selectedGroup ? selectedGroup.items : model.components.filter(item => item.parent_id === detail?.id);
  const detailReport = {...report, relationships: visualRelations};
  const selectedEdge = visualRelations.find(item => item.id === selectedRelation);
  const contractCount = model.contracts.filter(item => item.status === 'contract_present').length;
  const categories = Object.entries(CATEGORY_META).filter(([id]) => model.elements.some(item => categoryFor(item) === id) || model.tools.some(item => categoryFor(item) === id));
  const legacy = !report.extensions?.[CONTRACT_KEY];

  useEffect(() => { setOpenGroup(null); setSelected(null); setSelectedRelation(null); setQuery(''); setCategory('all'); setTool('all'); setPage(0); setMapPage(0); }, [report]);
  useEffect(() => { setPage(0); }, [query, category]);
  useEffect(() => { setMapPage(0); }, [selected, kind, tool, query, category]);
  useEffect(() => {
    const element = graphRoot.current;
    const change = () => setFullscreen(document.fullscreenElement === element);
    document.addEventListener('fullscreenchange', change);
    return () => document.removeEventListener('fullscreenchange', change);
  }, []);
  useEffect(() => {
    const dialog = elementDialog.current;
    if (dialogGroup && dialog && !dialog.open) dialog.showModal();
    else if (!dialogGroup && dialog?.open) dialog.close();
  }, [dialogGroup]);
  const closeElements = () => { elementDialog.current?.close(); setOpenGroup(null); componentTrigger.current?.focus({preventScroll:true}); };
  const openElements = (item, event) => {
    componentTrigger.current = event.currentTarget;
    setOpenGroup(item.id);
    setSelected(item.id);
    setSelectedRelation(null);
  };
  const inspectElement = id => {
    closeElements();
    setSelected(id);
    setSelectedRelation(null);
    requestAnimationFrame(() => { detailHeading.current?.scrollIntoView({block:'start',behavior:'instant'}); detailHeading.current?.focus({preventScroll:true}); });
  };
  const choose = id => { setSelected(id); setSelectedRelation(null); };
  const reveal = edge => { setSelected(edge.target_id); setSelectedRelation(edge.id); requestAnimationFrame(() => detailHeading.current?.focus({ preventScroll: true })); };


  return <section className="atlas" ref={graphRoot}>
    <dialog ref={elementDialog} className="atlas-elements-dialog" style={{"--node": dialogGroup ? componentColor(dialogGroup, palette) : undefined}} aria-labelledby="atlas-elements-title" onCancel={event => { event.preventDefault(); closeElements(); }} onClose={() => setOpenGroup(null)} onClick={event => { if (event.target !== event.currentTarget) return; const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeElements(); }}>
      <header><div><p className="eyebrow">{t("ELEMENTI DELLA COMPONENTE")}</p><h2 id="atlas-elements-title">{dialogGroup?.name}</h2><p>{dialogGroup?.items.length || 0} {t("elementi")}</p></div><button autoFocus aria-label={t("Chiudi lista elementi")} onClick={closeElements}>×</button></header>
      <div className="atlas-elements-list">{dialogGroup?.items.length ? <ul>{dialogGroup.items.map(item => <li key={item.id}><button onClick={() => inspectElement(item.id)}><strong>{item.name}<span aria-hidden="true">↗</span></strong><span>{item.description || 'Descrizione non disponibile.'}</span><small>{connectionLabel(item, model)}</small></button></li>)}</ul> : <p>{t("Questa componente non contiene elementi.")}</p>}</div>
    </dialog>
    <header className="atlas-heading"><div><p className="eyebrow">{t("WORKSPACE / MAPPA DEL SETUP")}</p><h1>{t("Ogni connessione ha una fonte.")}</h1><p>{t(primaryIds.length > 1 ? "I tool AI principali al centro, le componenti intorno e i singoli elementi al loro interno." : "Il tool AI al centro, le componenti intorno e i singoli elementi al loro interno.")}</p></div><div className="atlas-summary"><span><b>{model.tools.length}</b> {t("tool AI")}</span><span><b>{contractCount}</b> {t("contratti presenti")}</span><span><b>{model.groups.length}</b> {t("componenti")}</span><span><b>{model.elements.length}</b> {t("elementi")}</span></div></header>
    <div className="atlas-layout">
      <aside className="atlas-inventory" aria-label={t("Inventario elementi")}>
        <div className="atlas-section-label">{t("Elementi")} <span>{model.elements.length}</span></div>
        <div className="atlas-search"><span aria-hidden="true">⌕</span><input ref={search} type="search" aria-label={t("Cerca elementi")} placeholder={t("Cerca nome o percorso…")} value={query} onChange={event => setQuery(event.target.value)} />{query && <button aria-label={t("Cancella ricerca")} onClick={() => { setQuery(''); search.current?.focus(); }}>×</button>}</div>
        <label className="atlas-filter-label" htmlFor="atlas-category">{t("Componente")}</label><select id="atlas-category" value={category} onChange={event => setCategory(event.target.value)}><option value="all">{t("Tutte le componenti")}</option>{categories.map(([id, meta]) => <option key={id} value={id}>{meta.label}</option>)}</select>
        <div className="atlas-inventory-list">{inventory.map(item => <button key={item.id} aria-pressed={selected === item.id} onClick={() => choose(item.id)} style={{ '--node': palette.categories[categoryFor(item)] || 'var(--ui-muted)' }}><i aria-hidden="true">{CATEGORY_META[categoryFor(item)]?.icon || '◇'}</i><span><strong>{item.name}</strong><small>{CATEGORY_META[categoryFor(item)]?.label || item.kind}{item.parent_id ? ' · contenuto' : ''}</small></span><span className={model.linkedIds.has(item.id) ? 'atlas-connected' : 'atlas-unlinked'} aria-label={connectionLabel(item, model)}>{model.linkedIds.has(item.id) ? '↗' : '○'}</span></button>)}{!inventory.length && <div className="atlas-empty"><strong>{t("Nessun elemento trovato")}</strong><p>{t("Prova un altro nome o cambia componente.")}</p></div>}</div>
        <div className="atlas-pagination"><button aria-label={t("Pagina precedente")} disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>←</button><span aria-live="polite">{filtered.length} {t("risultati ·")} {currentPage + 1}/{pageCount}</span><button aria-label={t("Pagina successiva")} disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>→</button></div>
      </aside>
      <section className="atlas-map" aria-label={t("Collegamenti del setup")}>
        <div className="atlas-map-top"><div><p className="eyebrow">{t("RETE DELLE RELAZIONI")}</p><h2>{detail ? detail.name : 'Come lavora il tuo setup'}</h2></div>{selected && <button onClick={() => choose(null)}>{t("Mostra tutta la rete")}</button>}</div>
        <div className="atlas-filters"><div className="atlas-kind-filter" aria-label={t("Tipo di collegamento")}>{TYPES.map(([id, label]) => <button key={id} aria-pressed={kind === id} onClick={() => { setKind(id); setSelectedRelation(null); }}><i className={'atlas-line-key ' + id} aria-hidden="true" />{label}</button>)}</div><label>{t("Tool")} <select aria-label={t("Filtra per tool")} value={tool} onChange={event => { setTool(event.target.value); setSelectedRelation(null); }}><option value="all">{t("Tutti i tool")}</option>{model.tools.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
        <p className="atlas-navigation-help">{t("Rotella o pizzico per zoomare · trascina per spostarti · Adatta per ritrovare tutto il grafico")}</p><div className="atlas-map-note">{legacy ? "Report precedente: i collegamenti tratteggiati sono possibili relazioni da verificare nei contratti." : t("Tool o tool principali al centro e componenti intorno. Ogni linea riassume collegamenti reali ai singoli elementi, definiti da istruzioni, configurazioni o cataloghi del tool.")}</div>
        <div className="atlas-canvas" ref={canvas} tabIndex={0} role="region" aria-label={t("Mappa interattiva. Trascina per spostarti, usa la rotella per zoomare. Tastiera: frecce, più, meno e zero per adattare.")} {...handlers}>
          {nodes.length ? <div className="atlas-stage-size" style={{ width: "100%", height: "100%" }}><div className="atlas-stage" style={{ width: layout.width, height: layout.height, transform: 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + zoom + ')' }}>
            <svg className="atlas-edges" width={layout.width} height={layout.height} aria-hidden="true"><defs>{edges.map((edge,index) => <marker key={edge.id} id={'atlas-arrow-'+index} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1 L 9 5 L 0 9" style={{'--edge':edgeColor(edge)}} /></marker>)}</defs>{edges.map((edge,index) => <path key={edge.id} style={{'--edge':edgeColor(edge)}} className={relationKind(edge) + ((selectedRelation === edge.id || edge.members?.includes(selectedRelation)) ? ' is-selected' : '')} d={graphEdgePath(layout.positions.get(edge.source_id), layout.positions.get(edge.target_id))} markerEnd={'url(#atlas-arrow-'+index+')'} />)}</svg>
            {!primaryIds.length && <div className="atlas-center-placeholder" style={{left:470,top:385}}>{t("Tool principale non determinato")}<small>{t("Il report non identifica un unico tool principale.")}</small></div>}
            {nodes.map(item => { const position = layout.positions.get(item.id), isTool = toolIds.has(item.id); return <button key={item.id} className={'atlas-node ' + (isTool ? 'atlas-tool-node' : 'atlas-group-node') + (primaryIds.includes(item.id) ? ' atlas-primary-node' : '')} aria-pressed={selected === item.id || (item.kind === 'group' && item.items.some(element => element.id === selected))} style={{ left: position.x, top: position.y, width: position.width, height: position.height, '--node': componentColor(item, palette), '--node-ink': contrastText(componentColor(item, palette)) }} aria-haspopup={item.kind === 'group' ? 'dialog' : undefined} onClick={event => item.kind === 'group' ? openElements(item, event) : choose(item.id)}><span className="atlas-node-type">{primaryIds.includes(item.id) ? 'TOOL AI PRINCIPALE' : isTool ? 'TOOL AI' : t("COMPONENTE")}<span aria-hidden="true">↗</span></span><strong>{item.name}</strong><small>{primaryIds.includes(item.id) ? 'Tool principale del setup' : isTool ? item.properties?.tool_id : item.items.length + ' elementi · ' + item.items.filter(element => model.linkedIds.has(element.id)).length + ' collegati'}</small></button>; })}
          </div></div> : <div className="atlas-map-empty"><div className="atlas-empty-symbol" aria-hidden="true">⌁</div><h3>{legacy && kind === 'contractual' ? 'Le connessioni attendono una fonte' : 'Nessuna relazione in questa vista'}</h3><p>{legacy ? 'Questo report precede i contratti. Importa una nuova scansione delle istruzioni, configurazioni e cataloghi del tool per ricostruire i collegamenti.' : 'Cambia tipo, tool o selezione. Le risorse restano disponibili nell’inventario.'}</p>{(selected || query || category !== 'all' || tool !== 'all') && <button onClick={() => { choose(null); setQuery(''); setCategory('all'); setTool('all'); }}>{t("Azzera i filtri")}</button>}</div>}
        </div>
        <div className="atlas-toolbar"><span>{nodes.length} {t("nodi ·")} {edges.length} {t("collegamenti")}{mapPageCount > 1 ? ' · gruppo ' + (mapCurrent + 1) + '/' + mapPageCount : ''}</span><div>{mapPageCount > 1 && <><button aria-label={t("Componenti precedenti nella mappa")} disabled={!mapCurrent} onClick={() => setMapPage(mapCurrent - 1)}>←</button><button aria-label={t("Componenti successivi nella mappa")} disabled={mapCurrent + 1 >= mapPageCount} onClick={() => setMapPage(mapCurrent + 1)}>→</button></>}<button disabled={zoom <= MIN_ZOOM} aria-label={t("Riduci zoom")} onClick={() => zoomBy(1/1.2)}>−</button><button onClick={fit} aria-label={t("Adatta mappa")}>{Math.round(zoom * 100)}%</button><button disabled={zoom >= MAX_ZOOM} aria-label={t("Aumenta zoom")} onClick={() => zoomBy(1.2)}>+</button><button onClick={fit}>{t("Adatta")}</button><button aria-label={t("Sposta vista a sinistra")} onClick={() => panBy(100,0)}>←</button><button aria-label={t("Sposta vista in alto")} onClick={() => panBy(0,100)}>↑</button><button aria-label={t("Sposta vista in basso")} onClick={() => panBy(0,-100)}>↓</button><button aria-label={t("Sposta vista a destra")} onClick={() => panBy(-100,0)}>→</button>{document.fullscreenEnabled && <button onClick={async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await graphRoot.current.requestFullscreen(); } catch { setFullscreen(false); } }}>{fullscreen ? 'Esci' : 'Schermo intero'}</button>}</div></div>
        <section className="atlas-connection-list"><div className="atlas-section-label">{kind === 'all' ? t("Collegamenti del setup") : RELATION_LABELS[kind]} <span>{selectionRelations.length} {t("relazioni")}</span></div>{selectionRelations.slice(0, PAGE_SIZE).map(edge => { const contract = model.byContract.get(edge.properties?.contract_id); return <button key={edge.id} aria-pressed={(selectedRelation === edge.id || edge.members?.includes(selectedRelation))} onClick={() => reveal(edge)}><span><strong>{model.byId.get(edge.source_id)?.name}</strong><i aria-hidden="true">→</i><strong>{model.byId.get(edge.target_id)?.name}</strong></span><small>{contract ? contract.reference_chain.join(' → ') + ' · ambito ' + contract.scope : RELATION_LABELS[relationKind(edge)] + ' · ' + (edge.description || '')}</small><b aria-hidden="true">↗</b></button>; })}{selectionRelations.length > PAGE_SIZE && <p>{t("Seleziona un elemento per restringere le relazioni; il registro completo è disponibile sotto la mappa.")}</p>}{!selectionRelations.length && <p>{t("La presenza nel workspace non dimostra un obbligo d’uso.")}</p>}</section>
      </section>
      <aside className="atlas-detail" aria-label={t("Dettaglio selezione")}><div className="atlas-section-label">{selectedGroup ? 'COMPONENTE / ELEMENTI' : detail ? 'ELEMENTO / FONTI' : 'LEGGERE LA MAPPA'}{detail && <button aria-label={t("Chiudi dettaglio")} onClick={() => choose(null)}>×</button>}</div><h2 ref={detailHeading} tabIndex={-1}>{detail?.name || 'Dal tool al singolo elemento.'}</h2>{detail ? <><p>{detail.description}</p>{!selectedGroup && <p>{connectionLabel(detail, model)}</p>}{detail.path && <code className="atlas-path">{detail.path}</code>}<p className="atlas-detail-kind">{CATEGORY_META[categoryFor(detail)]?.label || detail.kind}</p>{detail.parent_id && <button onClick={() => choose(detail.parent_id)}>↑ {model.byId.get(detail.parent_id)?.name || 'Componente contenitore'}</button>}{!selectedGroup && <><ContractPanel report={report} targetId={detail.id} selectedId={selectedEdge?.properties?.contract_id} /><RelationshipPanel report={detailReport} targetId={detail.id} /></>}<details className="atlas-contained" open={selectedGroup ? true : undefined}><summary>{t("Elementi contenuti (")}{contained.length})</summary>{contained.map(item => <button key={item.id} onClick={() => choose(item.id)}><strong>{item.name} ↗</strong><small>{item.description}</small><small>{connectionLabel(item, model)}</small></button>)}</details>{selectedEdge && <RelationshipPanel report={detailReport} relationshipId={selectedEdge.id} />}</> : <><p>{t("Apri una componente per esplorare gli elementi. Seleziona un elemento o un collegamento per leggerne descrizione e fonti.")}</p><ol className="atlas-reading-guide"><li><b>{t("Tool AI principale")}</b><span>{t("Il centro del setup che può utilizzare gli elementi.")}</span></li><li><b>{t("Componente")}</b><span>{t("Un insieme di elementi dello stesso tipo, come Skill o MCP server.")}</span></li><li><b>{t("Elemento")}</b><span>{t("Una singola unità con nome e descrizione, per esempio Skill evaluator.")}</span></li></ol><div className="atlas-guidance"><strong>{t("Collegamento e utilizzo")}</strong><p>{t("Un elemento può essere collegato anche dalla configurazione o dal catalogo del tool, senza un obbligo nelle istruzioni. La verifica dell’esecuzione resta distinta.")}</p></div><p className="atlas-muted">{report.workspace.name}</p></>}</aside>
    </div>
    <details className="atlas-register"><summary>{t("Registro completo · contratti e relazioni")}</summary><ContractPanel report={report} /><RelationshipPanel report={detailReport} /></details>
  </section>;
}
