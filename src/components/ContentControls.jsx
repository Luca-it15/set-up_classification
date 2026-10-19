import {useId,useRef,useState} from 'react';
import {t,getLocale} from '../i18n/index.js';

export function SearchField({id,label,value,onChange,placeholder}) {
  const generated=useId(), input=useRef(null), composing=useRef(false);
  const [draft,setDraft]=useState(value);
  const inputId=id||generated;
  return <div className="content-search"><label htmlFor={inputId}>{label}</label><div><input ref={input} id={inputId} type="search" value={composing.current?draft:value} placeholder={placeholder} onCompositionStart={()=>{composing.current=true;setDraft(value);}} onCompositionEnd={event=>{composing.current=false;onChange(event.currentTarget.value);}} onChange={event=>{setDraft(event.target.value);if(!composing.current)onChange(event.target.value);}}/>{value&&<button type="button" aria-label={t('Cancella ricerca')} onClick={()=>{composing.current=false;setDraft('');onChange('');input.current?.focus();}}>×</button>}</div></div>;
}

export function Pagination({page,total,onChange,size=12}) {
  const pages=Math.max(1,Math.ceil(total/size)),current=Math.min(page,pages-1);
  return <nav className="content-pagination atlas-pagination" aria-label={t('Pagine dei risultati')}><button type="button" disabled={!current} aria-label={t('Pagina precedente')} onClick={()=>onChange(current-1)}>←</button><span>{t('Pagina')} {current+1} / {pages}</span><button type="button" disabled={current===pages-1} aria-label={t('Pagina successiva')} onClick={()=>onChange(current+1)}>→</button></nav>;
}
export function PagedList({items,searchText,label,children,empty='Nessun contenuto disponibile.',size=12}) {
  const [query,setQuery]=useState(''),[page,setPage]=useState(0);
  const term=query.trim().toLocaleLowerCase(getLocale());
  const filtered=term?items.filter(item=>searchText(item).toLocaleLowerCase(getLocale()).includes(term)):items;
  const pages=Math.max(1,Math.ceil(filtered.length/size)),current=Math.min(page,pages-1);
  const from=current*size;
  return <section className="paged-content" aria-label={label}>
    <div className="content-controls"><SearchField label={label} value={query} onChange={value=>{setQuery(value);setPage(0);}}/><p role="status">{filtered.length?`${(from+1).toLocaleString(getLocale())}–${Math.min(from+size,filtered.length).toLocaleString(getLocale())}`:'0'} / {filtered.length.toLocaleString(getLocale())} {t('risultati')}</p></div>
    {filtered.length?children(filtered.slice(from,from+size)):<div className="content-empty"><p>{t(query?'Nessun elemento corrisponde ai filtri.':empty)}</p>{query&&<button type="button" onClick={()=>{setQuery('');setPage(0);}}>{t('Azzera filtri')}</button>}</div>}
    <Pagination page={current} total={filtered.length} size={size} onChange={setPage}/>
  </section>;
}

export function formatDate(value) {
  return value ? new Date(value).toLocaleString(getLocale()) : t('Non disponibile');
}
export function statusLabel(value) {
  const labels={pass:'Soddisfatto',fail:'Da correggere',insufficient_evidence:'Prove insufficienti',satisfied:'Soddisfatto',missing:'Mancante',unknown:'Non determinato',not_applicable:'Non applicabile',evaluated:'Valutato',compliant:'Rispettato',violated:'Violato',not_verifiable:'Non verificabile',partial:'Parziale',complete:'Completo',native:'Prova nativa',declaration:'Dichiarazione',inference:'Inferenza',captured:'Acquisito',redacted:'Redatto',truncated:'Troncato'};
  return t(labels[value]||value);
}
