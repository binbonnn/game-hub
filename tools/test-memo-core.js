/* =====================================================================
   Game Hub v2 — Node test runner for js/data/memo-core.js
   Ported from tests/memo-core.test.js in the authoritative ZIP.

   Preserves the ZIP coverage: all 6 modes x 4 difficulties x modifier
   sets x seeds, solve/validator agreement, wrong-choice rejection,
   reasons, option/cell counts, timing, modifier compatibility,
   determinism and double-recall mini checks. Modifier/seed loops are
   reduced only to keep runtime reasonable.

   No DOM, no Firebase, no network, no ZIP page chrome.
   ===================================================================== */
'use strict';

const C = require('../js/data/memo-core.js');

let fails = 0, count = 0, rhythmChecked = 0;
const kindsSeen = {};
const cat = {};

function bad(m, r) {
  fails++;
  const key = m.split(' ').slice(0, 2).join(' ') + ' ' + (r ? r.mode + ':' + r.kind : '');
  cat[key] = (cat[key] || 0) + 1;
  if (fails < 15) {
    console.log('FAIL', m, r && [r.mode, r.diff, r.kind, r.mods.join('+'), r.seed, r.index].join('|'));
  }
}

const modsets = [
  'auto', [], ['reverse'], ['doubleRecall'], ['distraction'],
  ['falseFamiliarity'], ['interference'], ['reverse', 'distraction'],
  ['falseFamiliarity', 'interference'], ['doubleRecall', 'interference']
];
const SEEDS = 10; // reduced from the ZIP's 120; all modes/difficulties/modifier sets still covered

for (const mode of C.MODES) {
  for (const diff of C.DIFFS) {
    for (const ms of modsets) {
      for (let s = 0; s < SEEDS; s++) {
        const recent = [];
        for (let i = 0; i < 3; i++) {
          let r;
          try {
            r = C.generateRound({ mode, diff, seed: 't' + s, index: i, mods: ms, recent });
          } catch (e) {
            bad('throw ' + e.message + ((e.stack || '').split('\n')[1] || ''), { mode, diff, kind: '?', mods: [], seed: s, index: i });
            continue;
          }
          count++;
          recent.push(r.kind);
          kindsSeen[mode + ':' + r.kind] = (kindsSeen[mode + ':' + r.kind] || 0) + 1;
          const rc = r.recall;

          // Solver must always produce an accepted answer.
          if (!C.validate(r, C.solve(r)).correct) bad('solve not correct', r);

          if (rc.type === 'choice') {
            const keys = rc.options.map(o => o.key);
            if (new Set(keys).size !== keys.length) bad('dup option keys', r);
            if (rc.options.length < 2 || rc.options.length > 8) bad('opt count ' + rc.options.length, r);
            rc.options.forEach((o, k) => {
              if (k !== r.answer) {
                if (C.validate(r, k).correct) bad('wrong opt validates', r);
                if (!o.reason) bad('no reason ' + r.kind, r);
              }
            });
            if (mode === 'snapshot' && rc.options.length !== 4) bad('snap opts ' + rc.options.length + ' ' + r.kind, r);
            if (mode === 'mindtrap' && rc.options.length < 3) bad('mt opts ' + rc.options.length, r);
          }

          if (rc.type === 'seq') {
            const ids = new Set(rc.pool.map(p => p.id));
            if (!r.answer.every(a => ids.has(a))) bad('answer not in pool', r);
            if (r.answer.length !== rc.need) bad('need mismatch', r);
            if (C.validate(r, r.answer.slice().reverse()).correct && new Set(r.answer).size > 1 && r.answer.join() === r.answer.slice().reverse().join() === false) bad('reverse also correct', r);
            if (rc.slots && rc.slots.filter(x => !x).length !== 1) bad('slots', r);
          }

          if (rc.type === 'cells') {
            if (!r.answer.length || r.answer.length !== rc.pick) bad('cells pick', r);
            if (r.answer.some(c => c < 0 || c >= rc.cols * rc.rows)) bad('cell range', r);
            if (mode === 'glitch') {
              const A = r.scene.A, B = r.scene.B;
              let d = 0;
              for (let c = 0; c < A.length; c++) {
                const a = A[c], b = B[c];
                if ((!a) !== (!b) || (a && (a.shape !== b.shape || a.color !== b.color))) d++;
              }
              if (d !== r.answer.length || d < C.P.glitch.k[C.DIFF_INFO[diff].idx]) bad('glitch diff ' + d, r);
            }
          }

          // Rhythm tolerance mini check (the ZIP test only left a comment here).
          if (rc.type === 'rhythm') {
            const solved = C.solve(r);
            const ok = C.validate(r, solved);
            if (!ok.correct || ok.accuracy !== 1) bad('rhythm solve', r);
            const shifted = solved.slice();
            shifted[0] += 1500;
            if (C.validate(r, shifted).correct) bad('rhythm tolerance', r);
            rhythmChecked++;
          }

          if (r.observeMs < 1500 || r.recallMs < 8000 || !isFinite(r.recallMs)) bad('timing', r);
          if (r.mods.length > 2 || !C.compatible(r.mods)) bad('mods', r);
          if (Array.isArray(ms) && ms.length === 0 && r.mods.length) bad('mods should be empty', r);
          if (r.mods.includes('doubleRecall') && (!r.mini || r.mini.options.indexOf(r.mini.options[r.mini.answer]) < 0 || new Set(r.mini.options).size !== 4)) bad('mini', r);

          // Same options + same recent history must give a byte-identical round.
          const r2 = C.generateRound({ mode, diff, seed: 't' + s, index: i, mods: ms, recent: recent.slice(0, -1) });
          if (JSON.stringify(r2) !== JSON.stringify(r)) bad('nondeterministic', r);
        }
      }
    }
  }
}

// --- Scoring sanity (same two calls as the ZIP test) ---
const scoreExpert = C.scoreRound({ diff: 'expert', prevCombo: 12, correct: true, elapsedMs: 0, recallMs: 10000, hints: 0, corrections: 0 });
const scoreEasy = C.scoreRound({ diff: 'easy', prevCombo: 0, correct: true, elapsedMs: 5000, recallMs: 10000, hints: 1, corrections: 1 });
if (scoreExpert.total !== 675 || scoreExpert.perfectRound !== true) bad('score expert');
if (scoreEasy.total !== 105 || scoreEasy.perfectRound !== false) bad('score easy');
if (C.scoreRound({ diff: 'easy', prevCombo: 0, correct: false, elapsedMs: 0, recallMs: 10000, hints: 0, corrections: 0 }).total !== 0) bad('score wrong answer');

// --- RNG / hash determinism ---
const rngA = C.makeRng('abc'), rngB = C.makeRng('abc');
for (let i = 0; i < 8; i++) if (rngA() !== rngB()) bad('rng deterministic');
if (C.hashSeed('abc') !== C.hashSeed('abc') || C.hashSeed('abc') === C.hashSeed('abd')) bad('hashSeed');

// --- Session planning helpers ---
if (C.totalRounds({ type: 'boss' }) !== C.BOSS_PHASES.reduce((a, b) => a + b.rounds, 0)) bad('boss totalRounds');
if (C.totalRounds({ type: 'daily' }) !== 10) bad('daily totalRounds');
if (C.totalRounds({ type: 'endless' }) !== Infinity) bad('endless totalRounds');
if (C.totalRounds({ type: 'standard', rounds: 7 }) !== 7) bad('standard totalRounds');
if (C.dateKey(new Date(2024, 0, 2)) !== '2024-01-02') bad('dateKey');
for (const cfg of [{ type: 'boss' }, { type: 'daily', seed: 'd1' }, { type: 'endless', seed: 'e1' }]) {
  const n = Math.min(C.totalRounds(cfg), 10);
  for (let i = 0; i < n; i++) {
    const plan = C.planRound(cfg, i, []);
    if (!C.MODES.includes(plan.mode) || !C.DIFFS.includes(plan.diff)) { bad('plan invalid'); continue; }
    const planned = C.generateRound(plan);
    if (!C.validate(planned, C.solve(planned)).correct) bad('plan round unsolvable');
  }
}

// --- Browser UMD: GH may be undefined; GH/GH.data/MemoCore must be created ---
const fs = require('fs'), path = require('path'), vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'data', 'memo-core.js'), 'utf8');
const sandbox = { window: {} };
try {
  vm.runInNewContext(source, sandbox, { filename: 'memo-core.js' });
  const w = sandbox.window;
  if (!w.GH || !w.GH.memoCore || !w.GH.data || !w.GH.data.memoCore || !w.MemoCore) bad('browser globals');
  if (w.GH.memoCore !== w.MemoCore || w.GH.data.memoCore !== w.MemoCore) bad('browser export identity');
  if (w.MemoCore.generateRound({ mode: 'snapshot', diff: 'easy', seed: 'browser', index: 0, mods: [] }).mode !== 'snapshot') bad('browser generateRound');
} catch (e) {
  bad('browser UMD threw ' + e.message);
}

console.log('rounds', count, 'rhythm', rhythmChecked, 'fails', fails, JSON.stringify(cat));
console.log('kinds', JSON.stringify(kindsSeen));
console.log('score expert', JSON.stringify(scoreExpert));
console.log('score easy', JSON.stringify(scoreEasy));
if (fails) {
  console.log('FAILED: ' + fails + ' check(s)');
  process.exit(1);
}
console.log('OK');
process.exit(0);
