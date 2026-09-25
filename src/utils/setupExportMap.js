import { graphEdgePath } from './graphModel.js';
import { relationKind } from '../evaluator/contracts.js';
import { t } from '../i18n/index.js';

const safeHex = (value, fallback) => /^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value || '') ? value : fallback;
const mix = (first, second, amount) => {
  const expand = value => value.length === 4 ? '#' + [...value.slice(1)].map(char => char + char).join('') : value;
  const a = expand(first), b = expand(second);
  return '#' + [1, 3, 5].map(index => Math.round(parseInt(a.slice(index, index + 2), 16) * (1 - amount) + parseInt(b.slice(index, index + 2), 16) * amount).toString(16).padStart(2, '0')).join('');
};

export const relationTone = (kind, ink) => {
  const light = ink === '#000000';
  return ({
    contractual: light ? '#087a9b' : '#22d3ee',
    configured: light ? '#14724b' : '#34d399',
    available: light ? '#6d48ac' : '#b49bff',
    observed: light ? '#916000' : '#f4c76e',
    structural: light ? '#526476' : '#91a6bd',
    legacy_unverified: light ? '#7b8692' : '#8090a2'
  })[kind] || (light ? '#526476' : '#91a6bd');
};

export function createSetupMap({ report, model, nodes, positions, edges, width, height, palette, bg, ink, escapeMarkup, wrap, dash }) {
  const esc = escapeMarkup;
  const panel = mix(bg, ink, 0.08);
  const panelTop = mix(bg, ink, 0.12);
  const border = mix(bg, ink, 0.22);
  const muted = mix(bg, ink, 0.57);
  const hubAccent = safeHex(palette.centralTool?.border, ink === '#000000' ? '#568c00' : '#b7e870');
  const parts = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" role="group" aria-label="' + esc(report.workspace?.name) + '" font-family="JetBrains Mono, Cascadia Code, Consolas, monospace">',
    '<defs><pattern id="atlas-grid" width="36" height="36" patternUnits="userSpaceOnUse"><path d="M 36 0 L 0 0 0 36" fill="none" stroke="' + ink + '" stroke-opacity=".045" stroke-width="1"/></pattern>',
    '<linearGradient id="atlas-panel" x1="0" y1="0" x2="1" y2="1"><stop stop-color="' + panelTop + '"/><stop offset="1" stop-color="' + panel + '"/></linearGradient>',
    '<radialGradient id="atlas-atmosphere"><stop stop-color="' + hubAccent + '" stop-opacity=".13"/><stop offset="1" stop-color="' + hubAccent + '" stop-opacity="0"/></radialGradient>',
    '<filter id="atlas-lift" x="-40%" y="-50%" width="180%" height="200%"><feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#000" flood-opacity=".27"/></filter>'
  ];
  for (const kind of ['contractual', 'configured', 'available', 'observed', 'structural', 'legacy_unverified']) {
    const tone = relationTone(kind, ink);
    parts.push('<marker id="atlas-arrow-' + kind + '" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7 Z" fill="' + tone + '"/></marker>');
  }
  parts.push('</defs><rect width="100%" height="100%" fill="' + bg + '"/><rect width="100%" height="100%" fill="url(#atlas-grid)"/>');
  parts.push('<circle cx="' + width / 2 + '" cy="' + height / 2 + '" r="320" fill="url(#atlas-atmosphere)"/>');
  parts.push('<circle cx="' + width / 2 + '" cy="' + height / 2 + '" r="185" fill="none" stroke="' + ink + '" stroke-opacity=".07" stroke-width="1"/>');
  parts.push('<circle cx="' + width / 2 + '" cy="' + height / 2 + '" r="270" fill="none" stroke="' + ink + '" stroke-opacity=".035" stroke-width="1"/>');
  parts.push('<text x="42" y="47" fill="' + muted + '" font-size="11" font-weight="700" letter-spacing="3">AWDF / ' + esc(t('Mappa setup').toUpperCase()) + '</text>');
  parts.push('<path d="M42 66 H' + (width - 42) + '" stroke="' + border + '" stroke-width="1"/>');
  parts.push('<text x="' + (width - 42) + '" y="47" text-anchor="end" fill="' + muted + '" font-size="11" letter-spacing="1.5">' + nodes.length + ' ' + esc(t('Nodi').toUpperCase()) + '  /  ' + edges.length + ' ' + esc(t('Collegamenti aggregati').toUpperCase()) + '</text>');
  for (const edge of edges) {
    const a = positions.get(edge.source_id), b = positions.get(edge.target_id);
    if (!a || !b) continue;
    const kind = relationKind(edge);
    const tone = relationTone(kind, ink);
    const curve = graphEdgePath(a, b);
    parts.push('<g class="atlas-edge"><title>' + esc(kindLabelForEdge(kind) + ' · ' + (edge.members?.length || 1) + ' ' + t('Collegamenti')) + '</title><path d="' + curve + '" fill="none" stroke="' + bg + '" stroke-width="8" stroke-linecap="round"/><path d="' + curve + '" fill="none" stroke="' + tone + '" stroke-opacity="' + (kind === 'legacy_unverified' ? '.48' : '.84') + '" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="' + dash(kind) + '" marker-end="url(#atlas-arrow-' + kind + ')"/></g>');
  }
  if (!model.tools.length) parts.push('<text x="' + width / 2 + '" y="' + height / 2 + '" text-anchor="middle" fill="' + muted + '" font-size="18">' + esc(t('Tool AI non determinato')) + '</text>');
  nodes.forEach((node, number) => {
    const box = positions.get(node.id);
    if (!box) return;
    const hub = node.kind !== 'group';
    const accent = hub ? hubAccent : safeHex(palette.categories?.[node.category], '#91a6bd');
    const groupIndex = model.groups.findIndex(group => group.id === node.id);
    const componentIndex = report.components.findIndex(item => item.id === node.id);
    const target = hub ? 'component-' + componentIndex : 'group-' + (groupIndex + 1);
    if ((hub && componentIndex < 0) || (!hub && groupIndex < 0)) return;
    const x = box.x, y = box.y, w = box.width, h = box.height;
    const label = hub ? t('Tool AI') : t('Gruppo');
    const title = hub ? node.name : t(node.name);
    const nameLines = wrap(title, hub ? 25 : 21).slice(0, 2);
    parts.push('<a class="hotspot" href="#' + target + '" aria-label="' + esc(title) + '"><title>' + esc(title) + '</title>');
    parts.push('<g class="node-shell"><rect class="node-halo" x="' + (x - 5) + '" y="' + (y - 5) + '" width="' + (w + 10) + '" height="' + (h + 10) + '" rx="18" fill="' + accent + '" opacity="0"/>');
    parts.push('<rect class="node-plate" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="12" fill="url(#atlas-panel)" stroke="' + border + '" stroke-width="1"' + (hub ? ' filter="url(#atlas-lift)"' : '') + '/>');
    parts.push('<path d="M' + (x + 14) + ' ' + (y + 1) + ' H' + (x + w - 14) + '" stroke="' + accent + '" stroke-width="2.5" stroke-linecap="round"/>');
    parts.push('<rect x="' + (x + 16) + '" y="' + (y + 15) + '" width="27" height="27" rx="6" fill="' + accent + '" fill-opacity=".14" stroke="' + accent + '" stroke-opacity=".44"/>');
    parts.push('<text x="' + (x + 29.5) + '" y="' + (y + 33) + '" text-anchor="middle" fill="' + accent + '" font-size="11" font-weight="700">' + String(number + 1).padStart(2, '0') + '</text>');
    parts.push('<text x="' + (x + 55) + '" y="' + (y + 33) + '" fill="' + accent + '" font-size="10" font-weight="700" letter-spacing="1.3">' + esc(label.toUpperCase()) + '</text>');
    nameLines.forEach((line, lineNumber) => parts.push('<text x="' + (x + 17) + '" y="' + (y + 69 + lineNumber * 21) + '" fill="' + ink + '" font-size="' + (hub ? 20 : 18) + '" font-weight="700">' + esc(line) + '</text>'));
    if (!hub) parts.push('<text x="' + (x + 17) + '" y="' + (y + h - 13) + '" fill="' + muted + '" font-size="11">' + node.items.length + ' ' + esc(t('elementi')) + '</text>');
    parts.push('<path d="M' + (x + w - 27) + ' ' + (y + h - 23) + ' l8 8 m-8 0 h8" fill="none" stroke="' + accent + '" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>');
    parts.push('</g></a>');
  });
  parts.push('<path d="M42 ' + (height - 41) + ' H' + (width - 42) + '" stroke="' + border + '" stroke-width="1"/></svg>');
  return parts.join('');
}

const kindLabelForEdge = kind => ({
  contractual: t('Prescritto'),
  configured: t('Configurato'),
  available: t('Disponibile'),
  observed: t('Osservato'),
  structural: t('Strutturale'),
  legacy_unverified: t('Da verificare')
})[kind] || t('Da verificare');
