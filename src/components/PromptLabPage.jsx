import {PagedList,statusLabel} from './ContentControls.jsx';
import { t } from '../i18n/index.js';
export function PromptLabPage({prompt,setPrompt,run,result,report}) {
  return <section className="simulator-page"><header className="evaluation-hero"><div><p className="eyebrow">Prompt Lab</p><h1>{t('Previsione del flusso')}</h1><p>{t('Simulazione statica: nessun tool viene eseguito.')}</p></div></header>
    <form noValidate onSubmit={event=>{event.preventDefault();run();}}><label htmlFor="simulation-prompt">{t('Prompt')}</label><textarea className="resize-none" style={{resize: "none",minHeight:160}} id="simulation-prompt" required rows={5} value={prompt} onChange={event=>setPrompt(event.target.value)}/><button disabled={!prompt.trim()} type="submit">{t('Simula prompt')}</button></form>
    {result&&<>{result.simulation.prompt!==prompt&&<p className="inline-warning" role="status">{t('Il risultato si riferisce al prompt precedente. Ripeti la simulazione per aggiornarlo.')}</p>}<p role="status">{result.warnings.join(' · ')}</p><PagedList items={result.steps} label={t('Cerca passaggi')} empty="Nessun componente candidato." searchText={step=>[report.components.find(item=>item.id===step.component_id)?.name,step.reason].join(' ')}>{steps=><ol className="rule-list">{steps.map(step=><li className="rule-card" key={step.id}><h3>{report.components.find(item=>item.id===step.component_id)?.name}</h3><p>{step.reason}</p><p>{statusLabel(step.status)} · {step.basis.join(' · ')}</p></li>)}</ol>}</PagedList></>}
  </section>;
}
