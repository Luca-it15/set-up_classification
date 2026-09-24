import { t } from '../i18n/index.js';
import {useRef,useState} from 'react';
import {evaluateRuntimeProofs} from '../evaluator/runtime.js';
import {download} from '../utils/appUtils.js';
export function RuntimeProofPanel({report}) {
 const [imported,setImported]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),input=useRef();
 const snapshot=report.extensions?.['org.awdf.evaluation']?.snapshot?.id;
 const bundle=imported?.setup_version===snapshot?imported:report.extensions?.['org.awdf.runtime-proofs'];
 const load=async event=>{const file=event.target.files?.[0];if(!file)return;setBusy(true);setError('');try{setImported(evaluateRuntimeProofs(JSON.parse(await file.text()),snapshot));}catch(e){setError(e.message);}finally{setBusy(false);event.target.value='';}};
 return <section className="runtime-separation"><h3>{t("Prove runtime importate")}</h3><p>{t("Task, contesto, versione, criteri attesi e risultati devono essere espliciti. Nessun codice viene eseguito.")}</p><input ref={input} type="file" accept=".json" hidden onChange={load}/><button disabled={!snapshot||busy} onClick={()=>input.current.click()}>{busy?'Importazione…':'Importa prove runtime'}</button>{error&&<p role="alert">{error}</p>}{!snapshot&&<p>{t("Serve una nuova scansione con snapshot.")}</p>}{bundle&&<><p>{bundle.passed} {t("prove conformi ·")} {bundle.failed} {t("non conformi. Attestazioni importate, non autenticate indipendentemente.")}</p>{bundle.proofs.map(p=><details key={p.id}><summary>{p.task} · {p.outcome}</summary><p>{p.context} · {p.verified_at} · {p.verification_method}</p>{p.criteria.map(c=><p key={c.id}>{c.id}: {c.outcome}</p>)}</details>)}<button onClick={()=>download({...report,extensions:{...report.extensions,'org.awdf.runtime-proofs':bundle}},'runtime-report.json')}>{t("Esporta report con prove")}</button></>}</section>;
}
