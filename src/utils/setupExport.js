import { buildGraphModel, projectGroupEdges } from './graphModel.js';
import { contrastText } from './paletteColors.js';
import { relationKind } from '../evaluator/contracts.js';
import { t } from '../i18n/index.js';
import { saveBlob, saveText } from './download.js';
import { createSetupHtml } from './setupExportHtml.js';
import { createSetupMap, relationTone } from './setupExportMap.js';

export const escapeMarkup = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const color = (value, fallback) => /^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value || '') ? value : fallback;
const wrap = (value, length) => String(value || '').split(/\r?\n/).flatMap(line => {
  const parts = [];
  let rest = line;
  while (rest.length > length) { const space = rest.lastIndexOf(' ', length); const cut = space > length / 2 ? space : length; parts.push(rest.slice(0, cut)); rest = rest.slice(cut).trimStart(); }
  parts.push(rest); return parts;
});
const kindLabel = kind => t(({ contractual: 'Prescritto', configured: 'Configurato', available: 'Disponibile', observed: 'Osservato', structural: 'Strutturale', legacy_unverified: 'Da verificare' })[kind] || 'Da verificare');
const dash = kind => ({ contractual: '', configured: '10 5', available: '3 5', observed: '14 3 3 3', structural: '2 3', legacy_unverified: '8 8' })[kind] || '8 8';

export function createSetupExport(report, palette, { includePaths = false, language = 'it' } = {}) {
  const model = buildGraphModel(report);
  const width = model.groups.length > 12 ? 1800 : 1400;
  const mapHeight = model.groups.length > 12 ? 1500 : 900;
  const bg = color(palette.canvas?.background, '#101926');
  const ink = contrastText(bg);
  const toolFill = color(palette.centralTool?.background, '#e7f7c9');
  const positions = new Map();
  const nodes = [...model.tools, ...model.groups];
  model.tools.forEach((tool, index) => positions.set(tool.id, { x: width / 2 - 150, y: mapHeight / 2 - model.tools.length * 70 + index * 140, width: 300, height: 120 }));
  model.groups.forEach((group, index) => { const angle = -Math.PI / 2 + index * Math.PI * 2 / model.groups.length; positions.set(group.id, { x: width / 2 + Math.cos(angle) * (width / 2 - 190) - 125, y: mapHeight / 2 + Math.sin(angle) * (mapHeight / 2 - 190) - 56, width: 250, height: 112 }); });
  const edgeSources = [...model.relations, ...model.availableRelations, ...model.possibleRelations];
  const edges = projectGroupEdges(edgeSources, model.groupFor, new Set(nodes.map(node => node.id)));
  const elements = [...model.tools, ...model.elements];
  const lines = [];
  const text = (x, y, value, size = 18, fill = ink) => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}">${escapeMarkup(value)}</text>`;
  const mapSvg = createSetupMap({ report, model, nodes, positions, edges, width, height: mapHeight, palette, bg, ink, escapeMarkup, wrap, dash });
  let y = mapHeight;
  ['contractual', 'configured', 'available', 'observed', 'structural', 'legacy_unverified'].forEach((kind, index) => {
    const x = 40 + (index % 3) * (width / 3);
    const ly = y + Math.floor(index / 3) * 35;
    lines.push(`<path d="M${x},${ly} h45" stroke="${relationTone(kind, ink)}" stroke-width="2" stroke-dasharray="${dash(kind)}"/>`, text(x + 55, ly + 5, kindLabel(kind), 16));
  });
  y += 100;
  lines.push(text(40, y, t('Inventario della mappa'), 26)); y += 40;
  for (let index = 0; index < elements.length; index += 2) {
    const pair = elements.slice(index, index + 2);
    const rows = pair.map(item => [...wrap(item.name, Math.floor((width / 2 - 100) / 11)), ...(includePaths && item.path ? wrap(item.path, Math.floor((width / 2 - 100) / 11)) : [])]);
    const height = Math.max(...rows.map(row => row.length)) * 24 + 26;
    pair.forEach((item, column) => {
      const x = 40 + column * width / 2;
      lines.push(`<rect x="${x}" y="${y - 22}" width="${width / 2 - 70}" height="${height - 4}" rx="8" fill="${ink}" fill-opacity="0.06"/>`);
      rows[column].forEach((line, row) => lines.push(text(x + 12, y + row * 24, line, 17)));
    });
    y += height + 8;
  }
  if (!elements.length) { lines.push(text(40, y, t('Nessuna componente nel report.'))); y += 35; }
  wrap(t('Configurazione e prescrizioni non dimostrano esecuzione o successo.'), Math.floor((width - 80) / 11)).forEach(line => { y += 24; lines.push(text(40, y, line, 16)); });
  const height = y + 45;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeMarkup(report.workspace.name)}" font-family="JetBrains Mono, Consolas, monospace"><rect width="100%" height="100%" fill="${bg}"/>${mapSvg}${lines.join('')}</svg>`;
  // Only explicitly rendered fields are exported: no configuration snapshots or scripts.
  const html = createSetupHtml({ report, model, mapSvg, palette, bg, ink, language, includePaths, kindLabel, escapeMarkup });
  return { svg, mapSvg, html, width, height };
}
export async function exportSetupPng(artifact) {
  const scale = Math.min(2, 16000 / artifact.width, 16000 / artifact.height, Math.sqrt(32000000 / (artifact.width * artifact.height)));
  if (scale < 1) throw Error(t('Setup troppo grande per un PNG leggibile. Usa HTML per conservarlo completo.'));
  const url = URL.createObjectURL(new Blob([artifact.svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(Error(t('Impossibile creare il PNG. Riprova oppure esporta HTML.'))); image.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(artifact.width * scale); canvas.height = Math.ceil(artifact.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw Error(t('Impossibile creare il PNG. Riprova oppure esporta HTML.'));
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw Error(t('Impossibile creare il PNG. Riprova oppure esporta HTML.'));
    saveBlob(blob, 'ai-setup.png');
  } finally { URL.revokeObjectURL(url); }
}
export const exportSetupHtml = artifact => saveText(artifact.html, 'ai-setup.html', 'text/html;charset=utf-8');
