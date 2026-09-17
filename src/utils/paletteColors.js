import {categoryFor} from './appUtils.js';

export const componentColor = (item, palette) => palette.categories?.[categoryFor(item)] || '#94a3b8';
// Choose black or white by WCAG relative luminance so custom node fills stay readable.
export function contrastText(color) {
  const hex = color.replace('#','');
  const expanded = hex.length === 3 ? [...hex].map(value=>value+value).join('') : hex;
  if (!/^[0-9a-f]{6}$/i.test(expanded)) return '#000000';
  const rgb = [0,2,4].map(index=>parseInt(expanded.slice(index,index+2),16)/255).map(value=>value<=.04045 ? value/12.92 : ((value+.055)/1.055)**2.4);
  const luminance = rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
  return (luminance+.05)/.05 >= 1.05/(luminance+.05) ? '#000000' : '#ffffff';
}
