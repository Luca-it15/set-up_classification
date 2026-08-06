import { useEffect, useMemo, useRef, useState } from 'react';
import { simulate } from '../simulator/index.js';
import { evaluateChatExamples } from '../simulator/evaluateChats.js';
import { download, extractChatExamples, simulationStatus } from '../utils/appUtils.js';

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

export function PromptLabPage({ prompt, setPrompt, run, result, report, setNotice, setRuntimeEvaluation }) {
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
  useEffect(() => { setRuntimeEvaluation(evaluateChatExamples(report, chatExamples, chatSource)); }, [chatExamples, chatSource, report, setRuntimeEvaluation]);
  const loadChat = event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { const examples = extractChatExamples(String(reader.result || ''), file.name); setChatExamples(examples); setChatSource('chat_import'); setNotice(examples.length ? `${examples.length} prompt estratti e valutati localmente dalla chat.` : 'Nessun prompt utente riconoscibile nella chat.'); };
    reader.readAsText(file);
  };
  return <section className="prompt-lab-page"><header className="evaluation-hero"><div><p className="eyebrow">PROMPT LAB</p><h1>Routing ed esempi reali</h1><p>I prompt provenienti dalla cronologia del tool principale sono già disponibili nel report in forma redatta. Puoi aggiungere manualmente altri export senza inviarli fuori dal browser.</p></div><button className="ghost" onClick={() => chatInput.current.click()}>Importa altra chat</button><input ref={chatInput} hidden type="file" accept=".json,.jsonl,.txt,.md" onChange={loadChat} /></header><div className="prompt-lab-layout"><section className="prompt-console"><label className="prompt-field"><span>Prompt da simulare</span><textarea value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="Descrivi un’attività reale del tuo setup…" rows="6" /></label><div className="preset-row">{presets.map(example => <button key={example} onClick={() => setPrompt(example)}>{example.slice(0, 46)}…</button>)}</div><div className="prompt-actions"><button className="ghost" onClick={() => setPrompt('')}>Pulisci</button><button onClick={() => run()}>Simula routing</button></div>{result && <SimulationFlow result={result} report={report} />}</section><aside className="history-evals"><div className="flow-heading"><div><p className="eyebrow">CHAT EVAL</p><h2>{analyzed.length} prompt disponibili</h2></div></div><p className="flow-disclaimer">In alto trovi i casi più deboli, ambigui o divergenti dai tool osservati.</p>{analyzed.length ? <div className="chat-example-list single">{analyzed.map(example => <article key={example.id}><header><span>{example.source}</span><b>{Math.round(example.routingConfidence * 100)}%</b></header><p>{example.prompt}</p><small>{example.flags.length ? example.flags.join(' · ') : 'routing coerente'}</small><button onClick={() => run(example.prompt)}>Analizza</button></article>)}</div> : <div className="chat-empty">Il report non contiene ancora esempi di chat. Rigenera la scansione del tool principale.</div>}</aside></div></section>;
}
