// Writes the teacher answer key to ../teacher-docs/TEACHER_WALKTHROUGH.md (outside the deployed folder).
import fs from 'fs';
import { loadCases, loadAgency, loadTierConsts, loadWalkthroughGenerator } from './lib.mjs';
const gen = loadWalkthroughGenerator();
const t = loadTierConsts();
const md = gen(loadCases(), t.labels, t.points, loadAgency().dispatches);
const out = new URL('../../teacher-docs/TEACHER_WALKTHROUGH.md', import.meta.url);
fs.mkdirSync(new URL('../../teacher-docs/', import.meta.url), { recursive: true });
fs.writeFileSync(out, md + '\n');
console.log('wrote teacher-docs/TEACHER_WALKTHROUGH.md (' + md.length + ' chars)');
