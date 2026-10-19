import {PagedList,statusLabel} from './ContentControls.jsx';
import { t } from '../i18n/index.js';
import { CONTRACT_LABELS, relationKind } from '../evaluator/contracts.js';
export const RELATION_LABELS={contractual:'Contrattuale',configured:'Configurata',available:'Disponibile',observed:'Osservata',structural:'Strutturale'};
export function ContractPanel({report,targetId,selectedId,toolId}) {
 const bundle=report.extensions?.['org.awdf.description']?.snapshot?.static_contracts;
 const records=(bundle?.records||[]).filter(r=>(!toolId||r.tool_id===toolId)&&(!targetId||r.target_id===targetId||r.source_component_id===targetId||report.components.some(c=>c.id===targetId&&c.properties?.tool_id===r.tool_id)));
 const name=id=>report.components.find(c=>c.id===id)?.name||id;
 return <section className="contract-panel"><h3>{t("Contratti per tool e ambito")}</h3>{!records.length?<p>{t("Nessuna associazione prevista dimostrata. La presenza nel workspace non prova un obbligo d’uso.")}</p>:null}
 {!!records.length&&<PagedList items={records} label={t('Cerca contratti')} searchText={record=>[record.tool_id,name(record.target_id),record.scope,record.action].join(' ')}>{items=><div>{items.map(r=><details className="rule-card" key={r.id} open={selectedId===r.id?true:undefined}><summary><strong>{CONTRACT_LABELS[r.status]}</strong> · {r.tool_id} → {name(r.target_id)}</summary><div className="rule-body"><p>{t("Ambito:")} <code>{r.scope}</code> · {r.required===true?'Necessario':r.required===false?t("Opzionale"):'Necessità da valutare'}</p><p>{t("Azione:")} {r.action||'Non determinata'} · {r.applicability}</p><p>{t("Condizioni:")} {r.conditions.map(c=>c.value || c.values?.join(', ') || c.type).join(' · ')||'Nessuna esplicita'}</p><p>{t("Eccezioni:")} {r.exceptions.map(c=>c.value || c.values?.join(', ') || c.type).join(' · ')||'Nessuna esplicita'}</p><p>{t("Catena:")} {r.reference_chain.join(' → ')||'Non dimostrata'}</p>{r.evidence.map((e,i)=><blockquote key={i}><cite>{e.path}:{e.start_line}–{e.end_line}</cite><p>{e.excerpt}</p></blockquote>)}{[...(r.conflicts||[]),...r.limitations].map((l,i)=><p key={i}>{l}</p>)}<p>{t("Una prescrizione non dimostra esecuzione o successo.")}</p></div></details>)}</div>}</PagedList>}
 {!targetId&&!toolId&&!!bundle?.unassociated_component_ids?.length&&<details><summary>{bundle.unassociated_component_ids.length} {t("componenti non associate")}</summary><PagedList items={bundle.unassociated_component_ids} searchText={name} label={t('Cerca componenti')}>{ids=><ul>{ids.map(id=><li key={id}>{name(id)}</li>)}</ul>}</PagedList></details>}</section>;
}
export function RelationshipPanel({report,targetId,relationshipId}) {
 const name=id=>report.components.find(c=>c.id===id)?.name||id;
 const contract=id=>report.extensions?.['org.awdf.description']?.snapshot?.static_contracts?.records?.find(record=>record.id===id);
 return <section className="contract-panel"><h3>{t("Relazioni ed evidenze")}</h3>{(report.relationships||[]).filter(r=>(!relationshipId||r.id===relationshipId)&&(!targetId||r.source_id===targetId||r.target_id===targetId)).map(r=>{
   const record=contract(r.properties?.contract_id), path=r.properties?.instruction_path||r.properties?.basis_path||r.properties?.source_path;
   return <details key={r.id} open={relationshipId===r.id?true:undefined}><summary>{t(RELATION_LABELS[relationKind(r)])} · {name(r.source_id)} → {name(r.target_id)}</summary>
     <div className="relationship-origin"><h4>{t('Origine del collegamento')}</h4><p>{r.description}</p><dl><dt>{t('Identificatore')}</dt><dd><code>{r.id}</code></dd><dt>{t('Origine')}</dt><dd>{t(r.properties?.derivation==='skill_catalog'?'Dedotto dal catalogo delle skill':r.properties?.derivation==='instruction_reference'?'Riferimento nelle istruzioni':'Relazione registrata nella descrizione')}</dd>{path&&<><dt>{t('Fonte')}</dt><dd><code>{path}{r.properties?.line?':'+r.properties.line:''}</code></dd></>}{r.properties?.mechanism&&<><dt>{t('Meccanismo')}</dt><dd>{r.properties.mechanism}</dd></>}</dl>
     {r.properties?.excerpt&&<blockquote>{r.properties.excerpt}</blockquote>}
     {(r.evidence_ids||[]).map(id=>{const e=report.evidence.find(e=>e.id===id);return e?<blockquote key={id}><cite>{e.path} {e.location}</cite><p>{e.summary}</p>{e.content_hash&&<code>{e.content_hash}</code>}{e.observed_at&&<small>{e.observed_at}</small>}</blockquote>:null;})}
     {record?.evidence.map((e,index)=><blockquote key={'contract-'+index}><cite>{e.path}:{e.start_line}–{e.end_line}</cite><p>{e.excerpt}</p><code>{e.content_hash||e.hash}</code></blockquote>)}
     {!(r.evidence_ids||[]).length&&!record?.evidence.length&&<p>{t('Nessun estratto di fonte disponibile per questo collegamento.')}</p>}
     </div></details>;
 })}</section>;
}
