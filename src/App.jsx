import { t } from './i18n/index.js';
import { useLanguage, setLanguage, LANGUAGES } from './i18n/index.js';
import { validateAwdfAsync } from './utils/appUtils.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORY_META, PALETTES } from './data.js';
import { DEFAULT_SETTINGS } from './defaultSettings.js';
import { simulate } from './simulator/index.js';
import { validateAssessment } from './evaluator/assessment.js';
import { validateRunReport } from './runtime/report.js';
import { ArtifactsPage } from './components/ArtifactsPage.jsx';
import { DescriptionPage } from './components/DescriptionPage.jsx';
import { EvaluationPage } from './components/EvaluationPage.jsx';
import { PromptLabPage } from './components/PromptLabPage.jsx';
import { SettingsEditor } from './components/SettingsEditor.jsx';
import { SetupGraph } from './components/SetupGraph.jsx';
import { SetupBuilder } from './components/SetupBuilder.jsx';
import { ExportSetupDialog } from './components/ExportSetupDialog.jsx';
import {fetchJson} from './utils/http.js';
import { readBuilderDraft } from './utils/setupBuilder.js';
import {
  categoryFor,
  clonePalette,
  download,
  loadPaletteConfigs,
  loadSettings,
} from './utils/appUtils.js';

const normalizeManualComponents = components => components.map(component => ({
  ...component,
  name: component.name.trim(),
  description: component.description.trim(),
  path: component.path?.trim() || null,
  elements: normalizeManualComponents(component.elements || [])
}));

const hasUnnamedManualComponent = components => components.some(component => !component.name.trim() || hasUnnamedManualComponent(component.elements || []));
const views=[['setup','Mappa setup'],['description','Descrizione'],['checklist','Checklist statica'],['assessment','Valutazione'],['simulator','Prompt Lab'],['runs','Esecuzioni'],['builder','Setup builder']];
const settingsSignature = settings => JSON.stringify({...settings,viewer:{...settings.viewer,palettes:loadPaletteConfigs(settings)}});

export default function App() {
  const [report, setReport] = useState(null);
  const [assessment,setAssessment]=useState(null), [runReport,setRunReport]=useState(null), [importing,setImporting]=useState(false);
  const [appSettings, setAppSettings] = useState(() => loadSettings(DEFAULT_SETTINGS));
  const language = useLanguage();
  useEffect(() => { setLanguage(appSettings.viewer?.language); }, [appSettings.viewer?.language]);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const [paletteId, setPaletteId] = useState(() => appSettings.viewer?.palette || 'dark');
  const [paletteConfigs, setPaletteConfigs] = useState(() => loadPaletteConfigs(appSettings));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading,setLoading]=useState(true),[loadAttempt,setLoadAttempt]=useState(0),[loadError,setLoadError]=useState('');
  const [savedSettings,setSavedSettings]=useState(()=>loadSettings(DEFAULT_SETTINGS));
  const [settingsSection, setSettingsSection] = useState('workspace');
  const [activeView, setActiveView] = useState('setup');
  const [exportOpen, setExportOpen] = useState(false);
  const [builderDraft, setBuilderDraft] = useState(readBuilderDraft);
  const [builderStored, setBuilderStored] = useState(true);
  useEffect(() => {
    try { sessionStorage.setItem('awdf-builder-v1', JSON.stringify(builderDraft)); setBuilderStored(true); }
    catch { setBuilderStored(false); }
  }, [builderDraft]);
  useEffect(() => {
    if (builderStored || (!builderDraft.name && !builderDraft.components.length)) return;
    const guard = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [builderStored, builderDraft]);
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState(null);

  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const importLock = useRef(false);
  const reportInput = useRef();
  const settingsInput = useRef();
  const palette = paletteConfigs[paletteId];

  const settingsGroups = useMemo(() => Object.entries(CATEGORY_META).map(([id, meta]) => ({
    ...meta,
    id,
    items: (report?.components || []).filter(component => categoryFor(component) === id)
  })), [report]);

  useEffect(() => {
    try { localStorage.setItem('ai-setup-classifier-settings', JSON.stringify(savedSettings)); } catch { /* Keep in-memory settings. */ }
  }, [savedSettings]);
  const settingsDirty=settingsSignature({...appSettings,viewer:{...appSettings.viewer,palette:paletteId,palettes:paletteConfigs}})!==settingsSignature(savedSettings);
  useEffect(()=>{
    if(!settingsDirty)return;
    const guard=event=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);
  },[settingsDirty]);

  useEffect(() => {
    let active = true;
    setLoading(true);setLoadError('');
    Promise.allSettled([
      fetchJson('/api/settings',{cache:'no-store'}),
      fetchJson('/api/report',{cache:'no-store'}).then(value=>value?validateAwdfAsync(value):null)
    ]).then(([settingsResult,reportResult]) => {
      if (!active) return;
      if(settingsResult.status==='fulfilled'&&!settingsDirty){
        const settings=settingsResult.value;setAppSettings(settings);setSavedSettings(settings);
        setPaletteId(settings.viewer?.palette||'dark');setPaletteConfigs(loadPaletteConfigs(settings));
      }
      if(reportResult.status==='fulfilled'&&(reportResult.value||!report))setReport(reportResult.value);
      const errors=[settingsResult,reportResult].filter(result=>result.status==='rejected').map(result=>result.reason.message);
      if(errors.length)setLoadError(errors.join(' · '));
      setLoading(false);
    });
    return () => { active = false; };
  }, [loadAttempt]);

  useEffect(() => { document.title = t(({setup:t('Mappa setup'),description:t('Descrizione'),checklist:t('Checklist statica'),assessment:t('Valutazione'),runs:t('Esecuzioni'),simulator:'Prompt Lab',builder:t('Setup builder')})[activeView]) + ' · AI Setup Atlas'; }, [activeView, language]);

  const updatePaletteColor = (section, key, value) => setPaletteConfigs(configs => ({ ...configs, [paletteId]: { ...configs[paletteId], [section]: { ...configs[paletteId][section], [key]: value } } }));
  const resetPalette = () => setPaletteConfigs(configs => ({ ...configs, [paletteId]: clonePalette(PALETTES[paletteId]) }));

  const saveSettings = async (nextWorkspace = appSettings.workspace) => {
    if (saveLock.current) return;
    const folders = (nextWorkspace.folders || []).map(value => value.trim()).filter(Boolean);
    if (!folders.length) return setNotice(t("Aggiungi almeno una cartella al workspace."));
    if (hasUnnamedManualComponent(appSettings.manual_components || [])) return setNotice(t("Assegna un nome a ogni componente ed elemento manuale."));
    const next = { ...appSettings, initialized: true, workspace: { ...nextWorkspace, folders }, manual_components: normalizeManualComponents(appSettings.manual_components || []), viewer: { ...appSettings.viewer, palette: paletteId, palettes: paletteConfigs } };
    saveLock.current = true; setSaving(true);
    try {
      const saved = await fetchJson('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
      setAppSettings(saved);
      setSavedSettings(saved);
      setSettingsOpen(false);
      setNotice(t("Settings salvati direttamente in ai-setup-settings.json."));
    } catch (error) { setNotice(`${error.message} Verifica che l'app sia stata avviata con npm start.`); } finally { saveLock.current = false; setSaving(false); }
  };

  const importSettings = event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const value = JSON.parse(reader.result);
        if (value.version !== '1.0' || !value.workspace?.folders || !value.viewer) throw Error('File settings 1.0 non valido.');
        if (value.viewer.language !== undefined && !LANGUAGES.some(item => item.code === value.viewer.language)) throw Error('Unsupported interface language.');
        setAppSettings(value);
        setPaletteId(value.viewer.palette || 'dark');
        setPaletteConfigs(loadPaletteConfigs(value));
        setNotice('Backup importato. Premi Salva per aggiornare il file locale.');
      } catch (error) { setNotice(error.message); }
    };
    reader.readAsText(file);
  };

  const exportSettings = async () => {
    const value = { ...appSettings, initialized: Boolean(appSettings.workspace?.folders?.some(folder => folder.trim())), viewer: { ...appSettings.viewer, palette: paletteId, palettes: paletteConfigs } };
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({ suggestedName: 'ai-setup-settings.json', types: [{ description: 'AI Setup settings', accept: { 'application/json': ['.json'] } }] });
        const writable = await handle.createWritable();
        await writable.write(`${JSON.stringify(value, null, 2)}\n`);
        await writable.close();
        return setNotice('Backup settings salvato.');
      } catch (error) {
        if (error.name === 'AbortError') return;
        setNotice(`Salvataggio diretto non disponibile: ${error.message}`);
      }
    }
    download(value, 'ai-setup-settings.json');
  };

  const acceptFile = async value => {
    if(value.format==='awdf') { const next=await validateAwdfAsync(value); setReport(next);setAssessment(null);setRunReport(null);setResult(null);setActiveView('setup'); }
    else if(!report) throw Error('Importa prima la descrizione AWDF 2.0.');
    else if(value.format==='awdf-evaluation') { setAssessment(validateAssessment(value,report));setActiveView('assessment'); }
    else if(value.format==='awdf-run') { setRunReport(validateRunReport(value,report));setActiveView('runs'); }
    else throw Error('Formato non supportato.');
  };
  const uploadReport = async event => {
    const file=event.target.files?.[0];if(!file||importLock.current||loading)return;
    importLock.current=true;
    setImporting(true);
    try { if(!/\.json$/i.test(file.name))throw Error(t('Scegli un file JSON.'));await acceptFile(JSON.parse(await file.text()));setNotice(t('Documento importato.')); }
    catch(error){setNotice(error instanceof SyntaxError?t('Il file non contiene JSON valido. Controllalo e riprova.'):t(error.message));}finally{importLock.current=false;setImporting(false);event.target.value='';}
  };
  const loadExample=async()=>{setImporting(true);try{await acceptFile((await import('../examples/codex-workspace.ai-setup.json')).default);setNotice('Esempio dimostrativo caricato.');}catch(error){setNotice(error.message);}finally{setImporting(false);}};

  const runSimulation = (candidate, context) => {
    const value = typeof candidate === 'string' ? candidate : prompt;
    if (!value.trim()) return setNotice('Inserisci un prompt da simulare.');
    setPrompt(value);
    setResult(simulate(value, report, context));
    setNotice('Simulazione statica completata: nessun tool è stato eseguito.');
  };

  return <main className={`app ${palette.mode}`} style={{ '--canvas': palette.canvas.background, '--grid': palette.canvas.grid, '--ink': palette.centralTool.text, '--central': palette.centralTool.background, '--central-border': palette.centralTool.border }}>
    <a className="skip-link" href="#active-panel">{t('Vai al contenuto')}</a>
    <header className="app-header"><div className="brand"><div className="logo">⌘</div><div><strong>AI Setup <em>Atlas</em></strong><span>{report?.workspace.name || t('Nessun setup caricato')}</span></div></div><div className="header-actions"><button disabled={importing||loading} aria-busy={importing} onClick={() => reportInput.current.click()}>{t("↑ Importa AWDF")}</button><input ref={reportInput} hidden type="file" accept=".json" onChange={uploadReport} /><button className="ghost" disabled={!report} onClick={() => download(report, 'ai-setup.json')}>{t("↓ Esporta AWDF")}</button><button className="ghost" disabled={!report} onClick={() => setExportOpen(true)}>{t("Condividi setup")}</button><button className="ghost" disabled={loading} onClick={() => { setSettingsSection('workspace'); setSettingsOpen(true); }}>{t("⚙ Impostazioni")}</button><input ref={settingsInput} hidden type="file" accept=".json" onChange={importSettings} /></div></header>
    <nav className="view-tabs" role="tablist" aria-label={t('Sezioni del report')} onKeyDown={event=>{
      if(event.nativeEvent.isComposing)return;
      const index=views.findIndex(([id])=>id===activeView);
      const target=event.key==='ArrowRight'?(index+1)%views.length:event.key==='ArrowLeft'?(index+views.length-1)%views.length:event.key==='Home'?0:event.key==='End'?views.length-1:null;
      if(target===null)return;event.preventDefault();setActiveView(views[target][0]);document.getElementById('tab-'+views[target][0])?.focus();
    }}>{views.map(([id,label])=><button role="tab" id={'tab-'+id} aria-selected={activeView===id} aria-controls="active-panel" tabIndex={activeView===id?0:-1} key={id} className={activeView===id?'active':''} onClick={()=>setActiveView(id)}>{t(label)}</button>)}</nav>
    {loadError&&<div className="load-error" role="alert"><p>{t('Impossibile caricare i dati locali. Puoi importare un file o riprovare.')} {loadError}</p><button disabled={loading} onClick={()=>setLoadAttempt(value=>value+1)}>{t('Riprova')}</button></div>}
    <div id="active-panel" role="tabpanel" aria-labelledby={'tab-'+activeView} tabIndex={-1} aria-busy={loading||importing}>
    {notice && !settingsOpen && <div className="notice" role="status" aria-live="polite">{t(notice)}<button aria-label={t("Chiudi messaggio")} onClick={() => setNotice('')}>×</button></div>}
    <div className="app-progress" role="status" aria-live="polite">{loading?t('Caricamento del setup…'):importing?t('Validazione del documento…'):''}</div>
    {report&&<div hidden={activeView!=='setup'}><SetupGraph report={report} palette={palette}/></div>}
    {activeView==='builder'?<SetupBuilder draft={builderDraft} setDraft={setBuilderDraft} stored={builderStored} report={report || {components:[]}} setNotice={setNotice}/>:!report&&!loading?<section className="evaluation-page"><div className="evaluation-empty"><h1>{t('Descrivi il tuo setup AI')}</h1><p>{t('Genera AWDF 2.0 con awdf-describe e importa la descrizione.')}</p><button disabled={importing||loading} onClick={()=>reportInput.current.click()}>{t('Importa AWDF')}</button><button disabled={importing} onClick={loadExample}>{t('Carica esempio')}</button></div></section>:!report||activeView==='setup'?null:activeView==='description'?<DescriptionPage report={report}/>:activeView==='checklist'?<EvaluationPage report={report}/>:activeView==='assessment'||activeView==='runs'?<ArtifactsPage type={activeView} artifact={activeView==='assessment'?assessment:runReport} onImport={()=>reportInput.current.click()}/>:<PromptLabPage prompt={prompt} setPrompt={setPrompt} run={runSimulation} result={result} report={report}/>}
    </div>
    {exportOpen && <ExportSetupDialog report={report} palette={palette} language={language} close={() => setExportOpen(false)} setNotice={setNotice}/>}
    {settingsOpen && <SettingsEditor openBuilder={() => { setSettingsOpen(false); setActiveView('builder'); }} settings={appSettings} setSettings={setAppSettings} section={settingsSection} setSection={setSettingsSection} paletteId={paletteId} setPaletteId={setPaletteId} palette={palette} groups={settingsGroups} updateColor={updatePaletteColor} reset={resetPalette} importSettings={() => settingsInput.current.click()} exportSettings={exportSettings} notice={notice} saving={saving} save={saveSettings} close={() => setSettingsOpen(false)} setNotice={setNotice} dirty={settingsDirty} />}
  </main>;
}
