import { buildGraphModel, projectGroupEdges, graphEdgePath } from './graphModel.js';
import { contrastText } from './paletteColors.js';
import { relationKind } from '../evaluator/contracts.js';
import { t } from '../i18n/index.js';
import { saveBlob, saveText } from './download.js';

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
  const mapHeight = model.groups.length > 12 ? 1600 : 1100;
  const bg = color(palette.canvas?.background, '#101926');
  const ink = contrastText(bg);
  const toolFill = color(palette.centralTool?.background, '#e7f7c9');
  const positions = new Map();
  const nodes = [...model.tools, ...model.groups];
  model.tools.forEach((tool, index) => positions.set(tool.id, { x: width / 2 - 150, y: mapHeight / 2 - model.tools.length * 48 + index * 96, width: 300, height: 80 }));
  model.groups.forEach((group, index) => { const angle = -Math.PI / 2 + index * Math.PI * 2 / model.groups.length; positions.set(group.id, { x: width / 2 + Math.cos(angle) * (width / 2 - 165) - 115, y: mapHeight / 2 + Math.sin(angle) * (mapHeight / 2 - 190) - 45, width: 230, height: 90 }); });
  const edgeSources = [...model.relations, ...model.availableRelations, ...model.possibleRelations];
  const edges = projectGroupEdges(edgeSources, model.groupFor, new Set(nodes.map(node => node.id)));
  const elements = [...model.tools, ...model.elements];
  const nameById = new Map(report.components.map(item => [item.id, item.name]));
  const lines = [];
  const text = (x, y, value, size = 18, fill = ink) => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}">${escapeMarkup(value)}</text>`;
  lines.push(`<rect width="100%" height="100%" fill="${bg}"/>`);
  wrap(report.workspace.name, Math.floor(width / 23)).slice(0, 2).forEach((line, index) => lines.push(text(40, 55 + index * 38, line, 30)));
  lines.push(text(40, 130, t('Mappa setup') + ' · ' + t('Componenti') + ': ' + model.groups.length + ' · ' + t('Elementi') + ': ' + model.elements.length, 18));
  for (const edge of edges) {
    const kind = relationKind(edge);
    lines.push(`<path d="${graphEdgePath(positions.get(edge.source_id), positions.get(edge.target_id))}" fill="none" stroke="${ink}" stroke-opacity="0.5" stroke-width="2" stroke-dasharray="${dash(kind)}" marker-end="url(#arrow)"><title>${escapeMarkup(kindLabel(kind))}</title></path>`);
  }
  if (!model.tools.length) lines.push(text(width / 2 - 155, mapHeight / 2, t('Tool AI non determinato'), 20));
  for (const node of nodes) {
    const box = positions.get(node.id);
    const fill = node.kind === 'group' ? color(palette.categories?.[node.category], '#94a3b8') : toolFill;
    lines.push(`<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="14" fill="${fill}"/>`);
    wrap(node.kind === 'group' ? t(node.name) : node.name, 24).slice(0, 2).forEach((line, index) => lines.push(text(box.x + 16, box.y + 26 + index * 22, line, 18, contrastText(fill))));
    lines.push(text(box.x + 16, box.y + 73, node.kind === 'group' ? node.items.length + ' ' + t('elementi') : t('Tool AI'), 14, contrastText(fill)));
  }
  let y = mapHeight;
  ['contractual', 'configured', 'available', 'observed', 'structural', 'legacy_unverified'].forEach((kind, index) => {
    const x = 40 + (index % 3) * (width / 3);
    const ly = y + Math.floor(index / 3) * 35;
    lines.push(`<path d="M${x},${ly} h45" stroke="${ink}" stroke-width="2" stroke-dasharray="${dash(kind)}"/>`, text(x + 55, ly + 5, kindLabel(kind), 16));
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
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeMarkup(report.workspace.name)}" font-family="Segoe UI, Arial, sans-serif"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="${ink}"/></marker></defs>${lines.join('')}</svg>`;
  // Only explicitly rendered fields are exported: no configuration snapshots or scripts.
  const inventory = report.components.map(item => `<article><h3>${escapeMarkup(item.name)}</h3><p>${escapeMarkup(item.description)}</p><small>${escapeMarkup(item.kind)} · ${escapeMarkup(item.verification_status || 'not_verified')}</small>${includePaths && item.path ? `<pre>${escapeMarkup(item.path)}</pre>` : ''}</article>`).join('');
  const relationships = (report.relationships || []).map(item => `<li><strong>${escapeMarkup(nameById.get(item.source_id) || item.source_id)} → ${escapeMarkup(nameById.get(item.target_id) || item.target_id)}</strong><p>${escapeMarkup(item.description)}</p><small>${escapeMarkup(kindLabel(relationKind(item)))} · ${escapeMarkup(item.verification_status || 'not_verified')}</small></li>`).join('');
  const html = `<!doctype html><html lang="${escapeMarkup(language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"><title>${escapeMarkup(report.workspace.name)} · AI Setup Atlas</title><style>body{margin:0;padding:clamp(16px,4vw,48px);background:${bg};color:${ink};font:16px/1.6 'Segoe UI',Arial,sans-serif}main{max-width:1500px;margin:auto}svg{width:100%;height:auto}h1,h2,h3{line-height:1.3;overflow-wrap:anywhere}article,li{padding:20px;border:1px solid ${ink}55;border-radius:12px;margin:12px 0;break-inside:avoid}p,pre,small{overflow-wrap:anywhere;white-space:pre-wrap}ul{padding:0;list-style:none}.inventory{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:16px}a{color:inherit}summary{cursor:pointer;font-size:24px}nav{display:flex;gap:24px;flex-wrap:wrap}@media print{body{background:white;color:black}details{display:block}article,li{border-color:#888}}</style></head><body><main><h1>${escapeMarkup(report.workspace.name)}</h1><p>${escapeMarkup(t('Setup condiviso · consultabile offline'))}</p><nav><a href="#map">${escapeMarkup(t('Mappa setup'))}</a><a href="#inventory">${escapeMarkup(t('Componenti'))}</a><a href="#links">${escapeMarkup(t('Collegamenti'))}</a></nav><section id="map">${svg}</section><section id="inventory"><h2>${escapeMarkup(t('Componenti'))} (${report.components.length})</h2><div class="inventory">${inventory}</div></section><section id="links"><h2>${escapeMarkup(t('Collegamenti'))} (${(report.relationships || []).length})</h2><ul>${relationships}</ul></section></main></body></html>`;
  return { svg, html, width, height };
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
