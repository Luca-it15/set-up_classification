import { useEffect, useRef } from 'react';
import { t } from '../i18n/index.js';
export function Modal({ title, children, close, busy = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    return () => { dialog.close(); requestAnimationFrame(() => previous?.focus()); };
  }, []);
  return <dialog ref={ref} className="feature-dialog" aria-labelledby="feature-dialog-title" onCancel={event => { event.preventDefault(); if (!busy) close(); }}>
    <header><h2 id="feature-dialog-title">{title}</h2><button type="button" className="ghost" disabled={busy} onClick={close}>{t('Chiudi')}</button></header>
    {children}
  </dialog>;
}
