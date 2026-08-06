import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORY_META, PALETTES } from './data.js';
import reportFile from '../ai-setup.json';
import settingsFile from '../ai-setup-settings.json';
import { simulate } from './simulator/index.js';
import { evaluateChatExamples } from './simulator/evaluateChats.js';
import { EvaluationPage } from './components/EvaluationPage.jsx';
import { PromptLabPage } from './components/PromptLabPage.jsx';
import { SettingsEditor } from './components/SettingsEditor.jsx';
import { SetupGraph } from './components/SetupGraph.jsx';
import {
  categoryFor,
  clonePalette,
  download,
  loadPaletteConfigs,
  loadSettings,
  reportChatExamples,
  validateAwdf
} from './utils/appUtils.js';

export default function App() {
  const [report, setReport] = useState(() => validateAwdf(reportFile));
  const [appSettings, setAppSettings] = useState(() => loadSettings(settingsFile));
  const [paletteId, setPaletteId] = useState(() => appSettings.viewer?.palette || 'dark');
  const [paletteConfigs, setPaletteConfigs] = useState(() => loadPaletteConfigs(appSettings));
  const [settingsOpen, setSettingsOpen] = useState(() => !appSettings.initialized || !appSettings.workspace?.folders?.length);
  const [settingsSection, setSettingsSection] = useState('workspace');
  const [activeView, setActiveView] = useState('setup');
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState(null);
  const [runtimeEvaluation, setRuntimeEvaluation] = useState(() => evaluateChatExamples(reportFile, reportChatExamples(reportFile)));
  const [notice, setNotice] = useState('');
  const reportInput = useRef();
  const settingsInput = useRef();
  const palette = paletteConfigs[paletteId];

  const settingsGroups = useMemo(() => Object.entries(CATEGORY_META).map(([id, meta]) => ({
    ...meta,
    id,
    items: report.components.filter(component => !component.parent_id && categoryFor(component) === id)
  })).filter(group => group.items.length), [report]);

  useEffect(() => {
    const next = { ...appSettings, viewer: { ...appSettings.viewer, palette: paletteId, palettes: paletteConfigs } };
    try { localStorage.setItem('ai-setup-classifier-settings', JSON.stringify(next)); } catch { /* Keep in-memory settings. */ }
  }, [appSettings, paletteConfigs, paletteId]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch('/api/settings', { cache: 'no-store' }).then(response => response.ok ? response.json() : Promise.reject(Error('Settings locali non leggibili.'))),
      fetch('/api/report', { cache: 'no-store' }).then(response => response.ok ? response.json() : Promise.reject(Error('Report locale non leggibile.')))
    ]).then(([settings, currentReport]) => {
      if (!active) return;
      const validatedReport = validateAwdf(currentReport);
      setAppSettings(settings);
      setPaletteId(settings.viewer?.palette || 'dark');
      setPaletteConfigs(loadPaletteConfigs(settings));
      setSettingsOpen(!settings.initialized || !settings.workspace?.folders?.length);
      setReport(validatedReport);
      setRuntimeEvaluation(evaluateChatExamples(validatedReport, reportChatExamples(validatedReport)));
    }).catch(error => { if (active) setNotice(`${error.message} Avvia l'app con npm start.`); });
    return () => { active = false; };
  }, []);

  const updatePaletteColor = (section, key, value) => setPaletteConfigs(configs => ({ ...configs, [paletteId]: { ...configs[paletteId], [section]: { ...configs[paletteId][section], [key]: value } } }));
  const resetPalette = () => setPaletteConfigs(configs => ({ ...configs, [paletteId]: clonePalette(PALETTES[paletteId]) }));

  const saveSettings = async (nextWorkspace = appSettings.workspace) => {
    const folders = (nextWorkspace.folders || []).map(value => value.trim()).filter(Boolean);
    if (!folders.length) return setNotice('Aggiungi almeno una cartella al workspace.');
    const next = { ...appSettings, initialized: true, workspace: { ...nextWorkspace, folders }, viewer: { ...appSettings.viewer, palette: paletteId, palettes: paletteConfigs } };
    try {
      const response = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
      const saved = await response.json();
      if (!response.ok) throw Error(saved.error || 'Salvataggio non riuscito.');
      setAppSettings(saved);
      setSettingsOpen(false);
      setNotice('Settings salvati direttamente in ai-setup-settings.json.');
    } catch (error) { setNotice(`${error.message} Verifica che l'app sia stata avviata con npm start.`); }
  };

  const importSettings = event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const value = JSON.parse(reader.result);
        if (value.version !== '1.0' || !value.workspace?.folders || !value.viewer) throw Error('File settings 1.0 non valido.');
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

  const uploadReport = event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const nextReport = validateAwdf(JSON.parse(reader.result));
        setReport(nextReport);
        setResult(null);
        setRuntimeEvaluation(evaluateChatExamples(nextReport, reportChatExamples(nextReport)));
        setNotice('Documento AWDF caricato.');
      } catch (error) { setNotice(error.message); }
    };
    reader.readAsText(file);
  };

  const runSimulation = candidate => {
    const value = typeof candidate === 'string' ? candidate : prompt;
    if (!value.trim()) return setNotice('Inserisci un prompt da simulare.');
    setPrompt(value);
    setResult(simulate(value, report));
    setNotice('Simulazione statica completata: nessun tool è stato eseguito.');
  };

  return <main className={`app ${palette.mode}`} style={{ '--canvas': palette.canvas.background, '--grid': palette.canvas.grid, '--ink': palette.centralTool.text, '--central': palette.centralTool.background, '--central-border': palette.centralTool.border }}>
    <header className="app-header"><div className="brand"><div className="logo">◈</div><div><strong>AI Setup Classifier</strong><span>{report.metadata.title}</span></div></div><div className="header-actions"><button onClick={() => reportInput.current.click()}>↑ Importa AWDF</button><input ref={reportInput} hidden type="file" accept=".json" onChange={uploadReport} /><button className="ghost" onClick={() => download(report, 'ai-setup.json')}>↓ Esporta AWDF</button><button className="ghost" onClick={() => { setSettingsSection('workspace'); setSettingsOpen(true); }}>⚙ Settings</button><input ref={settingsInput} hidden type="file" accept=".json" onChange={importSettings} /><button className="ghost" onClick={() => setActiveView('simulator')}>▷ Prompt Lab</button></div></header>
    <nav className="view-tabs" aria-label="Sezioni del report"><button className={activeView === 'setup' ? 'active' : ''} onClick={() => setActiveView('setup')}>Mappa setup</button><button className={activeView === 'assessment' ? 'active' : ''} onClick={() => setActiveView('assessment')}>Valutazione e roadmap</button><button className={activeView === 'simulator' ? 'active' : ''} onClick={() => setActiveView('simulator')}>Prompt Lab</button></nav>
    {notice && <div className="notice">{notice}<button onClick={() => setNotice('')}>×</button></div>}
    {activeView === 'setup' ? <SetupGraph report={report} palette={palette} /> : activeView === 'assessment' ? <EvaluationPage report={report} runtimeEvaluation={runtimeEvaluation} openSimulator={() => setActiveView('simulator')} /> : <PromptLabPage prompt={prompt} setPrompt={setPrompt} run={runSimulation} result={result} report={report} setNotice={setNotice} setRuntimeEvaluation={setRuntimeEvaluation} />}
    {settingsOpen && <SettingsEditor settings={appSettings} setSettings={setAppSettings} section={settingsSection} setSection={setSettingsSection} paletteId={paletteId} setPaletteId={setPaletteId} palette={palette} groups={settingsGroups} updateColor={updatePaletteColor} reset={resetPalette} importSettings={() => settingsInput.current.click()} exportSettings={exportSettings} save={saveSettings} close={() => setSettingsOpen(false)} setNotice={setNotice} />}
  </main>;
}
