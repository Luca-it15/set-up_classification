import {statusLabel} from './ContentControls.jsx';
import { useMemo } from 'react';
import { classifyDescription } from '../evaluator/static-classifier.js';
import { ContractPanel } from './ContractPanel.jsx';
import { t } from '../i18n/index.js';
export function EvaluationPage({report}) {
  const checklist=useMemo(()=>classifyDescription(report),[report]);
  return <section className="evaluation-page"><header className="evaluation-hero"><div><p className="eyebrow">{t('Checklist statica')}</p><h1>{t('Controlli sulla descrizione')}</h1><p>{checklist.summary.evaluated}/{checklist.summary.applicable} · {Math.round(checklist.summary.coverage*100)}% {t('Copertura')}</p><p>{t('La checklist non misura la qualità complessiva del setup.')}</p></div></header>
    <div className="rule-list">{checklist.outcomes.map(item=><details className="rule-card" key={item.rule_id}><summary><strong>{t(checklist.rules.find(rule=>rule.id===item.rule_id).description)}</strong> · {statusLabel(item.outcome)}</summary><p>{item.rationale}</p>{item.evidence.map((citation,index)=><blockquote key={index}><cite>{citation.path}:{citation.start_line}</cite><p>{citation.excerpt}</p></blockquote>)}</details>)}</div><ContractPanel report={report}/>
  </section>;
}
