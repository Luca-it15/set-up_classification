import {PagedList,statusLabel} from './ContentControls.jsx';
import { t } from '../i18n/index.js';
export function DescriptionPage({report}) {
  const description=report.extensions['org.awdf.description'];
  return <section className="evaluation-page"><header className="evaluation-hero"><div><p className="eyebrow">awdf-describe</p><h1>{t('Descrizione del setup')}</h1><p>{report.workspace.purpose}</p></div></header>
    <p>{report.scope.authorized_folders.join(' · ')}</p><p>{description.collection_limits.note}</p>
    <PagedList key={report.metadata.report_id} items={description.instruction_sources} searchText={source=>[source.path,...source.applicable_tool_ids,source.scope].join(' ')} label={t('Cerca istruzioni')}>{sources=><div className="rule-list">{sources.map(source=><details className="rule-card" key={source.path}><summary>{source.path} · {statusLabel(source.content_status)}</summary><p>{source.applicable_tool_ids.join(' · ')} · {source.scope} · {source.activation}</p>{source.blocks.map((block,index)=><blockquote key={index}><cite>{source.path}:{block.evidence.start_line}–{block.evidence.end_line}</cite><pre>{block.description}</pre></blockquote>)}</details>)}</div>}</PagedList>
    {report.limitations.map(item=><p key={item.id}>{item.description}</p>)}
  </section>;
}
