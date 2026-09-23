import { useMemo, useRef, useState } from 'react';
import { t } from '../i18n/index.js';
import { Modal } from './Modal.jsx';
import { createSetupExport, exportSetupHtml, exportSetupPng } from '../utils/setupExport.js';
export function ExportSetupDialog({ report, palette, language, close, setNotice }) {
  const [includePaths, setIncludePaths] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const artifact = useMemo(() => { try { return createSetupExport(report, palette, { includePaths, language }); } catch { return null; } }, [report, palette, includePaths, language]);
  const exportFile = async format => {
    if (lock.current || !artifact) return;
    lock.current = true; setBusy(true); setError('');
    try { if (format === 'html') exportSetupHtml(artifact); else await exportSetupPng(artifact); setNotice(t('Export completato.') + ' ' + format.toUpperCase()); }
    catch (failure) { setError(failure.message || t('Download non riuscito. Riprova.')); }
    finally { lock.current = false; setBusy(false); }
  };
  return <Modal title={t('Condividi il setup')} close={close} busy={busy}>
    <p>{t('HTML include mappa, descrizioni e collegamenti, consultabili offline. PNG include la mappa completa e l’elenco degli elementi.')}</p>
    <label className="export-paths"><input type="checkbox" checked={includePaths} disabled={busy} onChange={event => setIncludePaths(event.target.checked)}/>{t('Includi i percorsi dei componenti')}</label>
    <p className="export-note">{t('Nomi e descrizioni rimangono nel file. Controllali prima di condividerlo.')}</p>
    {artifact ? <div className="export-preview" dangerouslySetInnerHTML={{ __html: artifact.svg }}/> : <p role="alert">{t('Impossibile preparare il setup. Importa un report valido e riprova.')}</p>}
    <p role="status" className="export-feedback">{error || (busy ? t('Preparazione del file…') : t('Il file esportato non richiede il sito né una connessione.'))}</p>
    <footer className="feature-actions"><button disabled={busy || !artifact} aria-busy={busy} onClick={() => exportFile('html')}>{t('Esporta HTML')}</button><button disabled={busy || !artifact} aria-busy={busy} onClick={() => exportFile('png')}>{t('Esporta PNG')}</button></footer>
  </Modal>;
}
