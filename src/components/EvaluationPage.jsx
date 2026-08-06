import { DIMENSION_GROUPS } from '../utils/appUtils.js';

function AssessmentCard({ assessment }) {
  const tone = assessment.score >= 4 ? 'strong' : assessment.score >= 2.5 ? 'medium' : 'critical';
  return <article className={`assessment-card ${tone}`}><header><b>{assessment.dimension.replaceAll('_', ' ')}</b><span>{assessment.score}/5</span></header><div className="score-bar"><i style={{ width: `${assessment.score * 20}%` }} /></div><p>{assessment.rationale}</p><div className="assessment-notes">{assessment.strengths?.map(item => <small key={item}>+ {item}</small>)}{assessment.weaknesses?.map(item => <small className="weakness" key={item}>− {item}</small>)}</div></article>;
}

export function EvaluationPage({ report, runtimeEvaluation, openSimulator }) {
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
    <div className="evaluation-layout"><section className="dimensions-section"><div className="section-heading"><div><p className="eyebrow">COPERTURA DEL SETUP</p><h2>Dimensioni</h2></div><span>{report.assessments.length} aree · 4 gruppi</span></div><div className="dimension-groups">{dimensionGroups.filter(group => group.items.length).map(group => { const average = group.items.reduce((sum, item) => sum + item.score, 0) / group.items.length; const critical = group.items.filter(item => item.score < 2.5).length; return <section className="dimension-group" key={group.id}><header className="dimension-group-header"><i>{group.icon}</i><div><h3>{group.label}</h3><p>{group.description}</p></div><aside><strong>{average.toFixed(1)}</strong><span>media /5</span>{critical > 0 && <small>{critical} criticità</small>}</aside></header><div className="assessment-grid">{group.items.map(assessment => <AssessmentCard assessment={assessment} key={assessment.id} />)}</div></section>; })}</div></section>
    <section className="roadmap-section"><div className="section-heading"><div><p className="eyebrow">PROSSIME AZIONI</p><h2>Roadmap</h2></div><span>{recommendations.length} interventi consigliati</span></div>{recommendations.length ? <div className="roadmap-grid">{recommendations.map((item, index) => <article className="recommendation-card" key={item.id}><header><b>{String(index + 1).padStart(2, '0')}</b><span>{item.priority.replaceAll('_', ' ')}</span></header><h3>{item.title}</h3><p>{item.description}</p><footer><span>Impegno</span><strong>{item.effort}</strong></footer></article>)}</div> : <p>Nessuna raccomandazione aperta.</p>}</section></div>
  </section>;
}
