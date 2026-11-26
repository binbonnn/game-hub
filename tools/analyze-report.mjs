import fs from 'fs';

const file = process.argv[2] || 'tools/test-memo-browser-report.json';
const r = JSON.parse(fs.readFileSync(file, 'utf8'));
for (const mode of Object.keys(r.modes)) {
  const m = r.modes[mode];
  if (m.fatal) { console.log('[' + mode + '] FATAL:', m.fatal.split('\n')[0]); continue; }
  console.log('[' + mode + '] roundsSeen:', JSON.stringify(m.roundsSeen.reduce((a, x) => { const k = x.mode + ':' + x.kind; a[k] = (a[k] || 0) + 1; return a; }, {})));
  for (const run of (m.runs || [])) {
    const s = run.summary || {};
    console.log('  run', run.runKind || '—', run.mode || '', 'rounds:', (s.rounds || []).length);
    for (const x of s.rounds || []) console.log('   ', JSON.stringify({ i: x.i, m: x.mode, k: x.kind, c: x.correct, a: x.accuracy, ms: x.ms, t: x.timeout, phase: x.phase, score: x.score, hints: x.hints }));
  }
  const st = m.summary && m.summary.stubWriteCount;
  console.log('  stubWrites:', st, 'errors:', JSON.stringify(m.errors));
}
