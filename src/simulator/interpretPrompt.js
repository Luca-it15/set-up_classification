import { catalog, resources, outputs } from './intentCatalog.js';

const normalize = value => String(value || '').toLowerCase().replace(/[_-]+/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const occurrence = (text, term) => {
  const normalizedTerm = normalize(term);
  const index = (` ${text} `).indexOf(` ${normalizedTerm} `);
  return index < 0 ? -1 : Math.max(0, index - 1);
};
const matches = (text, map) => Object.entries(map).flatMap(([name, terms]) => {
  const found = terms.map(term => ({ term, position: occurrence(text, term) })).filter(item => item.position >= 0).sort((a, b) => a.position - b.position)[0];
  return found ? [{ name, ...found }] : [];
}).sort((a, b) => a.position - b.position);

export function interpretPrompt(prompt) {
  const text = normalize(prompt);
  const intentMatches = matches(text, catalog);
  const outputMatches = matches(text, outputs);
  const resourceMatches = matches(text, resources);
  return {
    intents: intentMatches.length ? intentMatches.map(item => item.name) : ['unknown'],
    intent_sequence: intentMatches.map(item => ({ intent: item.name, position: item.position, matched_term: item.term })),
    requested_outputs: outputMatches.length ? outputMatches.map(item => item.name) : ['unknown'],
    required_resources: resourceMatches.length ? resourceMatches.map(item => item.name) : ['unknown'],
    keywords: text.split(/\s+/).filter(word => word.length > 2),
    language: /\b(the|and|create|validate|without)\b/.test(text) ? 'en' : 'it',
    confidence: text ? 0.8 : 0
  };
}
