import { useSyncExternalStore } from 'react';
import { messages } from './messages.js';
export const LANGUAGES = [
  {code:'it', label:'Italiano', locale:'it-IT'},
  {code:'en', label:'English', locale:'en-US'},
  {code:'es', label:'Español', locale:'es-ES'},
  {code:'fr', label:'Français', locale:'fr-FR'},
  {code:'de', label:'Deutsch', locale:'de-DE'},
  {code:'pt', label:'Português', locale:'pt-PT'}
];
export const normalizeLanguage = value => LANGUAGES.some(item=>item.code===value) ? value : 'it';
let language = 'it';
const listeners = new Set();
export function setLanguage(value) {
  const next = normalizeLanguage(value);
  if (language === next) return;
  language = next;
  for (const notify of listeners) notify();
}
const subscribe = notify => { listeners.add(notify); return () => listeners.delete(notify); };
export const useLanguage = () => useSyncExternalStore(subscribe, () => language, () => 'it');
export const getLocale = () => LANGUAGES.find(item=>item.code===language).locale;
// Translate UI catalog entries only. Unknown strings and evidence remain literal.
export function t(source) {
  if (typeof source !== 'string' || language === 'it') return source;
  const index = LANGUAGES.findIndex(item=>item.code===language) - 1;
  return messages[source]?.[index] || source;
}
