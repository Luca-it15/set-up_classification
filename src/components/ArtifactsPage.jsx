import {PagedList,formatDate,statusLabel} from './ContentControls.jsx';
import { t } from '../i18n/index.js';

import { DIMENSIONS } from '../evaluator/catalog.js';

export function ArtifactsPage({type,artifact,onImport}) {

  const assessment=type==='assessment';
  const dimensionLabels={clarity:'Chiarezza',consistency:'Coerenza',applicability:'Applicabilità',verifiability:'Verificabilità'};

  return <section className="evaluation-page"><header className="evaluation-hero"><div><p className="eyebrow">{assessment?'awdf-assess':'awdf-prompt-evaluate'}</p><h1>{t(assessment?'Valutazione delle istruzioni':'Esecuzioni osservate')}</h1><p>{t(assessment?'Punteggi contestuali e consigli con prove.':'Eventi raccolti e confronto con le prescrizioni.')}</p></div><button onClick={onImport}>{t(assessment?'Importa valutazione':'Importa esecuzione')}</button></header>

    {!artifact?<div className="evaluation-empty"><h2>{t('Nessun risultato importato')}</h2><p>{t('Invoca la skill nel tuo tool AI e importa il JSON prodotto.')}</p></div>:<>

      <p>{t('Origine')}: {artifact.format} · <time dateTime={artifact.created_at||artifact.started_at}>{formatDate(artifact.created_at||artifact.started_at)}</time></p><p>{artifact.tool_id} · {artifact.task} · {artifact.task_path}</p>

      {assessment?<><div className="evidence-metrics">{DIMENSIONS.map(dimension=><article key={dimension}><span>{t(dimensionLabels[dimension])}</span><strong>{artifact.summary.dimensions[dimension].score??'—'}{artifact.summary.dimensions[dimension].score!==null&&<small>/100</small>}</strong><p>{Math.round(artifact.summary.dimensions[dimension].coverage*100)}% {t('Copertura')}</p></article>)}</div><p>{t('Risultato complessivo')}: {artifact.summary.total===null?t('Parziale'):artifact.summary.total+'/100'} · {Math.round(artifact.summary.coverage*100)}% {t('Copertura')}</p><p>{t('Versione catalogo')}: {artifact.catalog.version}</p>

        <PagedList key={artifact.report_id} items={artifact.outcomes} label={t('Cerca criteri')} searchText={item=>[item.criterion_id,item.rationale,item.status].join(' ')}>{items=><div className="rule-list">{items.map(item=><details className="rule-card" key={item.criterion_id}><summary>{t(artifact.catalog.criteria.find(rule=>rule.id===item.criterion_id).description)} · {item.score??'—'} · {statusLabel(item.status)}</summary><p>{item.rationale}</p>{item.evidence.map((citation,index)=><blockquote key={index}><cite>{citation.path}:{citation.start_line}</cite><p>{citation.excerpt}</p></blockquote>)}{item.improvement&&<><p>{item.improvement.priority} · {item.improvement.action}</p><p>{t('Completato quando:')} {item.improvement.completion_criterion}</p></>}{artifact.catalog.criteria.find(rule=>rule.id===item.criterion_id).sources.map(source=><p key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.publisher}</a> · {source.origin} · {source.consulted_at}</p>)}</details>)}</div>}</PagedList>
      </>:<><p>{statusLabel(artifact.status)} · {artifact.client_version} · {statusLabel(artifact.coverage.status)}</p><blockquote>{artifact.prompt}</blockquote><PagedList key={artifact.run_id} items={artifact.events} label={t('Cerca eventi')} empty="Nessun evento osservato." searchText={event=>[event.type,event.tool,event.resource_path,event.provenance].join(' ')}>{events=><ol className="rule-list">{events.map(event=><li className="rule-card" key={event.id}><strong>{event.type} · {event.tool}</strong><p><time dateTime={event.timestamp}>{formatDate(event.timestamp)}</time> · {statusLabel(event.provenance)}</p>{event.resource_path&&<code>{event.resource_path}</code>}<details><summary>{t('Dati evento')}</summary><pre>{JSON.stringify({input:event.input,result:event.result},null,2)}</pre></details></li>)}</ol>}</PagedList><PagedList items={artifact.comparisons} label={t('Cerca verifiche')} searchText={item=>[item.contract_id,item.outcome,item.rationale].join(' ')}>{items=><div className="rule-list">{items.map(item=><details className="rule-card" key={item.contract_id}><summary>{item.contract_id} · {statusLabel(item.outcome)}</summary><p>{item.rationale}</p><p>{item.event_ids.join(' · ')}</p></details>)}</div>}</PagedList><PagedList items={artifact.instruction_reviews} label={t('Cerca valutazioni delle istruzioni')} searchText={item=>[item.id,item.outcome,item.rationale].join(' ')}>{items=><div className="rule-list">{items.map(item=><details className="rule-card" key={item.id}><summary>{item.id} · {statusLabel(item.outcome)} · {statusLabel(item.provenance)}</summary><p>{item.rationale}</p>{item.evidence.map((citation,index)=><blockquote key={index}><cite>{citation.path}:{citation.start_line}</cite><p>{citation.excerpt}</p></blockquote>)}<p>{item.event_ids.join(' · ')}</p></details>)}</div>}</PagedList>{artifact.coverage.limitations.map(item=><p key={item}>{item}</p>)}</>}

      {artifact.limitations.map(item=><p key={item}>{item}</p>)}

    </>}

  </section>;

}
