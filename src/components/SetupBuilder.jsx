import { useRef, useState } from 'react';
import { t } from '../i18n/index.js';
import { SETUP_COMPONENT_TYPES } from '../data.js';
import { BUILDER_HOSTS, newBuilderComponent, componentToBuilder, validateBuilder, buildInstructions } from '../utils/setupBuilder.js';
import { saveText } from '../utils/download.js';

export function SetupBuilder({ draft, setDraft, report, stored, setNotice }) {
  const [errors, setErrors] = useState({});
  const [selected, setSelected] = useState('');
  const [removed, setRemoved] = useState(null);
  const form = useRef(null);
  const host = BUILDER_HOSTS.find(item => item.id === draft.tool);
  const update = patch => { setDraft(value => ({ ...value, ...patch })); setErrors({}); };
  const change = (id, patch) => update({ components: draft.components.map(item => item.id === id ? { ...item, ...patch } : item) });
  const append = item => { update({ components: [...draft.components, item] }); requestAnimationFrame(() => document.getElementById(item.id + '-name')?.focus()); };
  const candidates = report.components.filter(item => item.subtype !== 'reference_ai_coding_tool');
  const valid = !Object.keys(validateBuilder(draft)).length;
  const preview = valid ? buildInstructions(draft).content : '';
  const fieldError = key => errors[key] ? <small className="field-error" id={'error-' + key}>{errors[key]}</small> : null;
  const validation = key => ({ 'aria-invalid': Boolean(errors[key]), 'aria-describedby': errors[key] ? 'error-' + key : undefined, 'data-error-key': key });
  const submit = event => {
    event.preventDefault();
    const nextErrors = validateBuilder(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      requestAnimationFrame(() => { const invalid = form.current.querySelector('[aria-invalid="true"]'); invalid?.focus(); invalid?.scrollIntoView({ block: 'center', behavior: 'instant' }); });
      return;
    }
    try { const result = buildInstructions(draft); saveText(result.content, result.filename, 'text/markdown;charset=utf-8'); setNotice(t('File di istruzioni generato.') + ' ' + result.filename); }
    catch { setNotice(t('Download non riuscito. La bozza è conservata: riprova.')); }
  };
  return <section className="builder-page" aria-labelledby="builder-title">
    <div className="feature-heading"><div><span className="eyebrow">AI SETUP ATLAS / BUILDER</span><h1 id="builder-title">{t('Costruisci il tuo setup')}</h1><p>{t('Scegli il tool AI, aggiungi le componenti e definisci quando usarle.')}</p></div><span className="draft-state" role="status">{stored ? t('Bozza conservata in questa scheda') : t('Bozza in memoria: esportala prima di chiudere')}</span></div>
    <form noValidate ref={form} onSubmit={submit} className="builder-layout">
      <div className="builder-editor">
        <section className="feature-panel"><h2>{t('Tool AI e obiettivo')}</h2><div className="feature-fields">
          <label><span>{t('Tool AI')}</span><select aria-label={t('Tool AI')} value={draft.tool} onChange={event => update({ tool: event.target.value })} {...validation('tool')}>{BUILDER_HOSTS.map(item => <option value={item.id} key={item.id}>{item.name} · {item.filename}</option>)}</select>{fieldError('tool')}</label>
          <label><span>{t('Nome del setup')}</span><input aria-label={t('Nome del setup')} value={draft.name} onChange={event => update({ name: event.target.value })} maxLength={160} {...validation('name')} />{fieldError('name')}</label>
          <label className="wide"><span>{t('Obiettivo')}</span><textarea className="resize-none" rows={3} value={draft.purpose} onChange={event => update({ purpose: event.target.value })} maxLength={4000}/></label>
        </div></section>
        <section className="feature-panel"><h2>{t('Componenti')} <small>({draft.components.length})</small></h2>
          <div className="builder-import"><label><span>{t('Dal report corrente')}</span><select aria-label={t('Dal report corrente')} value={selected} onChange={event => setSelected(event.target.value)}><option value="">{t('Scegli una componente')}</option>{candidates.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button type="button" className="ghost" disabled={!selected} onClick={() => { const item = candidates.find(item => item.id === selected); if (item) append(componentToBuilder(item)); setSelected(''); }}>{t('Aggiungi dal report')}</button></div>
          {!draft.components.length && <p className="feature-empty">{t('Nessuna componente. Aggiungi una skill, una knowledge base o un’integrazione.')}</p>}
          {fieldError('components')}
          <div className="builder-components">{draft.components.map((item, index) => <article className="builder-component" key={item.id}>
            <header><h3>{String(index + 1).padStart(2, '0')} / {item.name || t('Nuova componente')}</h3><button type="button" className="ghost" onClick={() => { setRemoved({ item, index }); update({ components: draft.components.filter(candidate => candidate.id !== item.id) }); }} aria-label={t('Rimuovi componente') + ' ' + (index + 1)}>{t('Rimuovi')}</button></header>
            <div className="feature-fields">
              <label><span>{t('Tipo')}</span><select aria-label={t('Tipo')} value={item.type} onChange={event => change(item.id, { type: event.target.value })} {...validation(item.id + ':type')}>{SETUP_COMPONENT_TYPES.map(type => <option key={type.id} value={type.id}>{t(type.label)}</option>)}</select>{fieldError(item.id + ':type')}</label>
              <label htmlFor={item.id + '-name'}><span>{t('Nome componente')} {index + 1}</span><input aria-label={t('Nome componente') + ' ' + (index + 1)} id={item.id + '-name'} value={item.name} maxLength={160} onChange={event => change(item.id, { name: event.target.value })} {...validation(item.id + ':name')}/>{fieldError(item.id + ':name')}</label>
              <label className="wide"><span>{t('Percorso o identificatore')} {index + 1}</span><input aria-label={t('Percorso o identificatore') + ' ' + (index + 1)} value={item.path} onChange={event => change(item.id, { path: event.target.value })} maxLength={1000} {...validation(item.id + ':path')}/><small>{t('Per file e skill usa il percorso; per MCP e plugin usa il nome configurato nel tool.')}</small>{fieldError(item.id + ':path')}</label>
              <label className="wide"><span>{t('Descrizione')}</span><textarea className="resize-none" rows={3} maxLength={4000} value={item.description} onChange={event => change(item.id, { description: event.target.value })}/></label>
              <label className="wide"><span>{t('Quando usarla (opzionale)')}</span><input aria-label={t('Quando usarla (opzionale)')} value={item.when} maxLength={500} onChange={event => change(item.id, { when: event.target.value })}/><small>{t('Lascia vuoto per prescriverne l’uso in ogni attività.')}</small></label>
            </div>
          </article>)}</div>
          <div className="feature-actions"><button type="button" {...validation('components')} onClick={() => append(newBuilderComponent())}>{t('Aggiungi componente')}</button>{removed && <button type="button" className="ghost" onClick={() => { const items = [...draft.components]; items.splice(Math.min(removed.index, items.length), 0, removed.item); update({ components: items }); setRemoved(null); }}>{t('Annulla rimozione')}</button>}</div>
        </section>
      </div>
      <aside className="builder-preview feature-panel"><div className="preview-file"><span>{t('Anteprima del file')}</span><strong>{host.filename}</strong></div><p>{t('Salva il file nella radice del progetto. Rivedilo prima di unirlo a istruzioni già presenti.')}</p>
        <pre tabIndex={0} aria-label={t('Anteprima istruzioni')}>{preview || t('Completa nome e componenti per visualizzare le istruzioni.')}</pre>
        <button type="submit">{t('Scarica')} {host.filename}</button><p className="builder-note">{t('Il file collega le risorse al tool; non installa plugin né configura MCP.')}</p>
      </aside>
    </form>
  </section>;
}
