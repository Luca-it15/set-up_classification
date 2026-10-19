import { saveText } from './download.js';
import { validateAwdfDocument } from '../evaluator/validate.js';
import { verifySnapshotWeb } from '../evaluator/snapshot.js';
import { PALETTES, TYPE_TO_CATEGORY } from '../data.js';

export const categoryFor = component => {
  if (component.subtype === 'installed_plugin') return 'plugins';
  if (component.kind === 'mcp_server') return 'mcp_servers';
  if (component.kind === 'tool') return 'tools';
  return component.properties?.setup_category || TYPE_TO_CATEGORY[component.kind] || 'other';
};

export const isVisibleSetupComponent = component => component.kind !== 'chat_source'
  && !(component.kind === 'configuration' && component.subtype === 'ai_configuration');

export function validateAwdf(value) {
 const errors=validateAwdfDocument(value);
 if(errors.length) throw Error(errors[0]);
 return value;
}

export function download(value,name) { saveText(JSON.stringify(value,null,2),name,'application/json;charset=utf-8'); }

export const clonePalette = palette => ({ ...palette, canvas: { ...palette.canvas }, centralTool: { ...palette.centralTool }, categories: { ...palette.categories }, severity: { ...palette.severity } });
export const defaultPaletteConfigs = () => ({ dark: clonePalette(PALETTES.dark), light: clonePalette(PALETTES.light) });

export function loadSettings(settingsFile) {
  try {
    const stored = JSON.parse(localStorage.getItem('ai-setup-classifier-settings'));
    if (stored?.version === '1.0' && stored.workspace && stored.viewer) return stored;
  } catch { /* Fall back to the file-backed settings. */ }
  return structuredClone(settingsFile);
}

export function loadPaletteConfigs(settings) {
 return settings?.viewer?.palettes?.dark?.categories && settings?.viewer?.palettes?.light?.categories ? settings.viewer.palettes : defaultPaletteConfigs();
}

export async function validateAwdfAsync(value) {
 const report=validateAwdf(value);
 const snapshot=report.extensions?.['org.awdf.description']?.snapshot;
 if(snapshot){const errors=await verifySnapshotWeb(snapshot);if(errors.length)throw Error(errors[0]);}
 return report;
}
