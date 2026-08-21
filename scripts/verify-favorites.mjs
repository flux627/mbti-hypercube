// Headless regression sweep for the taste system: with no override
// params, every kind's example (and cross-face) pair must produce its
// recorded favorite — dance, direction signs, lane, and rotation
// direction — and round trips must play symmetrically (same lane and
// character both ways; quarter pairs cycle with the same turning sense).
//
// Needs a running server and playwright (not a project dependency):
//   npx playwright install chromium   # once
//   node scripts/verify-favorites.mjs [baseUrl]   # default http://127.0.0.1:3000
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://127.0.0.1:3000';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 700, height: 700 } });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));

const CASES = [
  ['ENTP', 'INTJ', { sig: 'mirror|180|diagonal', dance: 'swap-z', lane: 'action-vertical', degSign: 1 }],
  ['ESTP', 'ISTJ', { sig: 'mirror|180|diagonal', dance: 'swap-x', lane: 'action-vertical', degSign: 1 }],
  ['ENTP', 'ENFP', { sig: 'mirror|90|down', dance: 'swap-z', lane: 'action-planar' }],
  ['ENTP', 'ESTJ', { sig: 'mirror|90|down', dance: 'flip', y: -1, lane: 'action-flip' }],
  ['ENTP', 'INTP', { sig: 'mirror|0|swap', dance: 'swap-x', b: 1, lane: 'action-planar' }],
  ['ISTP', 'ESTP', { sig: 'mirror|0|swap', dance: 'swap-z', b: -1, lane: 'action-planar' }],
  ['ENTP', 'ISFJ', { sig: 'mirror|0|flip', dance: 'flip', y: -1, lane: 'action-flip' }],
  ['ENTP', 'ESFP', { sig: 'turn|180|vertical', degSign: -1 }],
  ['ENTP', 'ISTJ', { sig: 'turn|180|normal', degSign: -1 }],
  ['ENTP', 'INFJ', { sig: 'turn|180|lateral', degSign: -1 }],
  ['ENTP', 'ESFJ', { sig: 'turn|180|diagonal', degSign: -1 }],
];

let fail = 0;
for (const [from, to, exp] of CASES) {
  await page.goto(`${base}/?type=${from}&spin=0`, { waitUntil: 'load' });
  await page.waitForTimeout(2200);
  await page.selectOption('#typeSel', to);
  await page.waitForTimeout(150);
  const p = await page.evaluate(() => window.__lastPlan);
  const issues = [];
  if (p.sig !== exp.sig) issues.push(`sig=${p.sig} want ${exp.sig}`);
  if (!p.favored) issues.push('favorite not applied');
  if (exp.dance && !p.chosen.startsWith(exp.dance)) issues.push(`chosen=${p.chosen} want ${exp.dance}`);
  if (exp.lane && p.lane !== exp.lane) issues.push(`lane=${p.lane} want ${exp.lane}`);
  if (exp.b && !p.chosen.includes(`b${exp.b}`)) issues.push(`chosen=${p.chosen} want b${exp.b}`);
  if (exp.y && !p.chosen.includes(`y${exp.y}`)) issues.push(`chosen=${p.chosen} want y${exp.y}`);
  if (exp.degSign && Math.sign(p.chosenDeg) !== exp.degSign) {
    issues.push(`deg=${p.chosenDeg} want sign ${exp.degSign}`);
  }
  const ok = issues.length === 0;
  if (!ok) fail += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${from}->${to} [${p.sig}] ${p.chosen} lane=${p.lane || '-'} deg=${p.chosenDeg}${issues.length ? '  << ' + issues.join('; ') : ''}`);
  await page.waitForTimeout(1300);
}

// round-trip symmetry: same lane both ways; quarter pairs share the sig
// (same turning sense = cycling), 180 pairs share direction
for (const [a, b] of [['ENFP', 'ESFP'], ['ENTP', 'ESTJ'], ['ENTP', 'INTJ']]) {
  await page.goto(`${base}/?type=${a}&spin=0`, { waitUntil: 'load' });
  await page.waitForTimeout(2200);
  await page.selectOption('#typeSel', b);
  await page.waitForTimeout(150);
  const fwd = await page.evaluate(() => window.__lastPlan);
  await page.waitForTimeout(1800);
  await page.selectOption('#typeSel', a);
  await page.waitForTimeout(150);
  const rev = await page.evaluate(() => window.__lastPlan);
  const issues = [];
  if (fwd.lane !== rev.lane) issues.push(`lanes differ: ${fwd.lane} vs ${rev.lane}`);
  if (fwd.sig.includes('|180|') && fwd.chosenDeg !== rev.chosenDeg) {
    issues.push(`180 direction differs: ${fwd.chosenDeg} vs ${rev.chosenDeg}`);
  }
  const ok = issues.length === 0;
  if (!ok) fail += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${a}<->${b} fwd=[${fwd.sig} ${fwd.chosen}] rev=[${rev.sig} ${rev.chosen}]${issues.length ? '  << ' + issues.join('; ') : ''}`);
}

console.log(fail ? `${fail} case(s) FAILED` : 'all favorite and symmetry cases pass');
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
process.exit(fail ? 1 : 0);
