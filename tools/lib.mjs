// Shared helpers for the build scripts: pull data out of index.html without a browser.
import fs from 'fs';
export const INDEX = new URL('../index.html', import.meta.url);
export function readIndex(){ return fs.readFileSync(INDEX, 'utf8'); }
function grab(html, startMarker, endMarker){
  const a = html.indexOf(startMarker);
  if (a === -1) throw new Error('marker not found: ' + startMarker);
  const b = html.indexOf(endMarker, a);
  if (b === -1) throw new Error('end marker not found after: ' + startMarker);
  return html.slice(a + startMarker.length, b + (endMarker === '\n];\n' ? 2 : endMarker === '\n};\n' ? 2 : 0));
}
export function loadCases(html = readIndex()){ return (0, eval)('(' + grab(html, 'const CASES = ', '\n];\n') + ')'); }
export function loadAgency(html = readIndex()){ return (0, eval)('(' + grab(html, 'const AGENCY = ', '\n};\n') + ')'); }
export function loadTierConsts(html = readIndex()){
  const pts = html.match(/const TIER_POINTS = (\{[^}]*\});/), lab = html.match(/const TIER_LABEL = (\{[^}]*\});/);
  if (!pts || !lab) throw new Error('tier constants not found');
  return { points: JSON.parse(pts[1]), labels: JSON.parse(lab[1]) };
}
export function loadWalkthroughGenerator(html = readIndex()){
  const a = html.indexOf('// <walkthrough-generator>'), b = html.indexOf('// </walkthrough-generator>');
  if (a === -1 || b === -1) throw new Error('walkthrough generator markers not found');
  return (0, eval)('(function(){' + html.slice(a, b) + '; return buildWalkthroughMarkdown; })()');
}
