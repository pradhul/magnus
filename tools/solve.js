#!/usr/bin/env node
/*
 * Verifies every level in src/levels.js is solvable and reports the shortest
 * solution (par). Exits non-zero if a level is unsolvable or its `par` is stale.
 *
 *   node tools/solve.js            check all levels
 *   node tools/solve.js 4          check level 4 only and print a replay
 *   node tools/solve.js --replay   print a replay for every level
 */
const path = require('path');
const E = require(path.join(__dirname, '..', 'src', 'engine.js'));
const LEVELS = require(path.join(__dirname, '..', 'src', 'levels.js'));

const args = process.argv.slice(2);
const replay = args.includes('--replay');
const only = args.map(Number).find(n => Number.isInteger(n) && n >= 1);

function render(L, s) {
  const rows = [];
  for (let y = 0; y < L.h; y++) {
    let row = '';
    for (let x = 0; x < L.w; x++) {
      const o = E.objectAt(s, x, y);
      if (s.px === x && s.py === y) row += '@';
      else if (o) row += o.type;
      else {
        const t = E.terrain(L, s, x, y);
        row += t === 'D' && E.doorsOpen(L, s, null) ? 'd' : t;
      }
    }
    rows.push(row);
  }
  return rows.join('\n');
}

function mechanicsUsed(L, solution) {
  const used = new Set();
  let s = E.initialState(L);
  for (const a of solution) {
    s = E.step(L, s, a);
    for (const ev of s.events) {
      if (ev.type === 'fly') used.add(ev.why);
      if (ev.type === 'slide') used.add(ev.fell ? 'fill' : 'slide');
      if (ev.type === 'toggle') used.add('flip');
      if (ev.type === 'pulse' && ev.hit) used.add(ev.hit.mode);
    }
  }
  return [...used].sort();
}

let failed = false;
LEVELS.forEach((def, i) => {
  if (only && only !== i + 1) return;
  const L = E.parseLevel(def);
  const t0 = Date.now();
  const res = E.solve(L);
  const ms = Date.now() - t0;
  if (!res.solution) {
    failed = true;
    console.log(`✗ ${def.name}: UNSOLVABLE (${res.explored} states${res.aborted ? ', aborted' : ''}, ${ms} ms)`);
    return;
  }
  const par = res.solution.length;
  const stale = def.par !== par;
  if (stale) failed = true;
  console.log(`${stale ? '✗' : '✓'} ${def.name}: par ${par}${stale ? ` (levels.js says ${def.par})` : ''}, ${res.explored} states, ${ms} ms`);
  console.log(`    uses: ${mechanicsUsed(L, res.solution).join(', ')}`);
  console.log(`    ${res.solution.join(' ')}`);
  if (replay || only) {
    let s = E.initialState(L);
    console.log(render(L, s) + '\n');
    for (const a of res.solution) {
      s = E.step(L, s, a);
      console.log(`-- ${a}${s.dead ? ' (DEAD)' : ''}${s.won ? ' (WON)' : ''}`);
      console.log(render(L, s) + '\n');
    }
  }
});

process.exit(failed ? 1 : 0);
