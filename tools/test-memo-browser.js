/* =====================================================================
   tools/test-memo-browser.js
   Browser-stub verification driver for js/game-memo.js (G4 Memo Mayahem).
   Uses Chrome DevTools Protocol directly over WebSocket (Node 24 global
   WebSocket). Launches Edge headless against the static server on
   http://127.0.0.1:4173. No playwright/puppeteer; no production writes —
   the page is served with tools/stub-cloud.js active, so registered-mode
   saves land in the in-page stub (window.__stubWrites).

   Usage: node tools/test-memo-browser.js [--modes registered|guest|both]
   ===================================================================== */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BASE = 'http://127.0.0.1:4173';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const REPORT_FILE = path.join(__dirname, 'test-memo-browser-report.json');

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function fetchJson(url, opts) {
  const data = await fetch(url, opts);
  const text = await data.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (e) { /* html */ }
  return { ok: data.ok, status: data.status, json: body, text };
}

/* ---------- minimal CDP client ---------- */
class CDP {
  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl); // Node >= 22 global
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });
    const client = new CDP(ws);
    ws.onmessage = ev => {
      let msg;
      try { msg = JSON.parse(String(ev.data)); } catch (e) { return; }
      client.emit(msg);
    };
    return client;
  }

  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = [];
  }

  emit(msg) {
    if (msg.id) {
      const item = this.pending.get(msg.id);
      if (!item) return;
      this.pending.delete(msg.id);
      if (msg.error) item.reject(new Error('CDP error: ' + JSON.stringify(msg.error)));
      else item.resolve(msg.result || {});
    } else if (msg.method) {
      this.listeners.slice().forEach(fn => fn(msg));
    }
  }

  on(fn) { this.listeners.push(fn); return () => this.listeners.splice(this.listeners.indexOf(fn), 1); }

  waitEvent(method, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout waiting CDP event ' + method)), timeoutMs);
      const stop = this.on(msg => {
        if (msg.method === method) { clearTimeout(timer); stop(); resolve(msg); }
      });
    });
  }

  send(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try { this.ws.send(JSON.stringify({ id, method, params: params || {} })); }
      catch (e) { this.pending.delete(id); reject(e); }
    });
  }

  close() { try { this.ws.close(); } catch (e) { /* ignore */ } }
}

/* ---------- helpers ---------- */
function freePort() {
  return new Promise((resolve, reject) => {
    const net = require('net');
    const srv = net.createServer();
    srv.unref();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function waitTargets(port, timeoutMs) {
  const t0 = Date.now();
  for (;;) {
    try {
      const data = await fetchJson('http://127.0.0.1:' + port + '/json/list');
      if (data.ok && Array.isArray(data.json) && data.json.length) {
        const page = data.json.find(t => t.type === 'page') || data.json[0];
        if (page && page.webSocketDebuggerUrl) return data.json;
      }
      const created = await fetchJson('http://127.0.0.1:' + port + '/json/new?about:blank', { method: 'PUT' });
      if (created.ok && created.json && created.json.webSocketDebuggerUrl) return [created.json];
    } catch (e) { /* retry */ }
    if (Date.now() - t0 > timeoutMs) throw new Error('no CDP target on port ' + port);
    await sleep(150);
  }
}

async function evalJson(cdp, expr, opts) {
  const r = await cdp.send('Runtime.evaluate', Object.assign({ expression: expr, returnByValue: true }, opts || {}));
  if (r.exceptionDetails) {
    throw new Error('page eval failed: ' + JSON.stringify({ text: r.exceptionDetails.text, exception: r.exceptionDetails.exception && r.exceptionDetails.exception.description }));
  }
  return r.result ? r.result.value : undefined;
}

async function waitUntil(cdp, expr, opts) {
  opts = opts || {};
  const timeoutMs = opts.timeout || 15000;
  const intervalMs = opts.interval || 100;
  const t0 = Date.now();
  for (;;) {
    const ok = await evalJson(cdp, expr);
    if (ok) return true;
    if (Date.now() - t0 > timeoutMs) throw new Error('timeout waiting: ' + expr);
    await sleep(intervalMs);
  }
}

async function click(cdp, sel) {
  const expr = '(() => { const el = document.querySelector(' + JSON.stringify(sel) + '); if (!el) return false; el.click(); return true; })()';
  return !!(await evalJson(cdp, expr));
}

async function sleepMs(cdp) { return sleep(60); }

/* ---------- page-side snippets (strings, evaluated in the page) ---------- */
const SNAP = `(() => {
  const m = window.GH && window.GH.memo;
  if (!m) return null;
  const run = m.state.run;
  const out = { screen: m.state.screen, stage: null, mode: null, kind: null, recallType: null,
                mods: null, resultsLen: run ? (run.results || []).length : 0 };
  if (run && run.round) {
    out.mode = run.round.mode;
    out.kind = run.round.kind;
    const rc = run.round.recall;
    out.recallType = rc ? rc.type : null;
    out.mods = run.round.mods;
    if (rc && rc.type === 'rhythm') { out.beats = rc.beats; out.intervals = rc.intervals; out.taps = run.input.taps.length; }
  }
  if (run && run.stage) out.stage = run.stage;
  return out;
})()`;

const FAST_FORWARD = `(() => {
  const run = window.GH && window.GH.memo && window.GH.memo.state.run;
  if (run && run.phase && run.phase.name !== 'recall' && !run.miniDone) run.phase.t = run.phase.dur;
  return true;
})()`;

const CLICK_MINI = `(() => {
  const m = window.GH && window.GH.memo;
  const run = m && m.state.run;
  if (!run || !run.round || !run.round.mini) return false;
  const phase = run.phase;
  if (phase && phase.name !== 'mini') return false;
  const want = run.round.mini.answer;
  const stage = document.querySelector('[data-memo-stage]');
  const el = stage ? stage.querySelector('[data-memo-mini="' + want + '"]') : null;
  if (!el) return false;
  el.click();
  return true;
})()`;

async function handleRecall(cdp, snap) {
  if (!snap || !snap.stage || snap.stage !== 'recall') return false;
  if (!snap.recallType) return false;

  if (snap.recallType === 'choice') {
    const answer = await evalJson(cdp, `(() => {
      const run = window.GH.memo.state.run;
      if (!run || !run.round) return null;
      const Core = window.GH.memoCore || window.MemoCore;
      const ans = Core ? Core.solve(run.round) : null;
      return typeof ans === 'number' ? ans : null;
    })()`);
    if (answer == null) return false;
    return click(cdp, '[data-memo-choice="' + answer + '"]');
  }

  if (snap.recallType === 'cells') {
    const answer = await evalJson(cdp, `(() => {
      const run = window.GH.memo.state.run;
      if (!run || !run.round || !run.round.answer) return null;
      return run.round.answer.slice();
    })()`);
    if (!Array.isArray(answer) || !answer.length) return false;
    const done = await evalJson(cdp, `(() => {
      const run = window.GH.memo.state.run;
      const sel = (run && run.input && run.input.sel) || [];
      const ans = ${JSON.stringify(answer)};
      const stage = document.querySelector('[data-memo-stage]');
      ans.forEach(c => {
        if (sel.indexOf(c) >= 0) return;
        const el = stage ? stage.querySelector('[data-memo-cell-index="' + c + '"]') : null;
        if (el) el.click();
      });
      const sb = stage ? stage.querySelector('[data-memo-submit-cell]') : null;
      if (sb && !sb.disabled) sb.click();
      return sel.length === ans.length;
    })()`);
    return !!done;
  }

  if (snap.recallType === 'seq') {
    const answer = await evalJson(cdp, `(() => {
      const run = window.GH.memo.state.run;
      if (!run || !run.round || !run.round.answer) return null;
      return run.round.answer.slice();
    })()`);
    if (!Array.isArray(answer) || !answer.length) return false;
    const done = await evalJson(cdp, `(() => {
      const run = window.GH.memo.state.run;
      const have = (run.input.seq || []).slice();
      const ans = ${JSON.stringify(answer)};
      let n = 0;
      ans.forEach((id, i) => {
        if (have[i] === id) return;
        const stage = document.querySelector('[data-memo-stage]');
        const el = stage ? stage.querySelector('[data-memo-symbol="' + id + '"]') : null;
        if (el && !el.disabled) { el.click(); n++; }
      });
      return n > 0 || have.length === ans.length;
    })()`);
    return !!done;
  }

  if (snap.recallType === 'rhythm') {
    const beats = await evalJson(cdp, `(() => {
      const run = window.GH.memo.state.run;
      const rc = run && run.round && run.round.recall;
      return rc ? rc.beats : 0;
    })()`);
    const taps = await evalJson(cdp, `(() => {
      const run = window.GH.memo.state.run;
      if (!run || !run.round) return 0;
      const target = ${beats};
      const count = run.input.taps.length;
      if (count >= target) return 0;
      const pad = document.querySelector('[data-memo-tap]');
      if (!pad) return -1;
      pad.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
      return run.input.taps.length;
    })()`);
    dbg('rhythm: beats=', beats, 'taps len now=', taps);
    return taps === 1;
  }

  return false;
}

async function driveOneRound(cdp, stats) {
  const t0 = Date.now();
  await waitUntil(cdp, `(() => { const s = window.GH.memo.state; return !!(s && s.run && s.screen === 'play'); })()`, { timeout: 20000, desc: 'play screen' });
  for (let i = 0; i < 1200; i++) {
    const st = await evalJson(cdp, SNAP);
    if (!st) break;
    if (st.stage === 'feedback' || st.screen === 'result') break;
    if (st.stage === 'mini') {
      await evalJson(cdp, CLICK_MINI);
    } else if (st.stage === 'recall') {
      stats.roundsSeen.push({ mode: st.mode, kind: st.kind, recallType: st.recallType });
      const did = await handleRecall(cdp, st);
      if (!did) await evalJson(cdp, FAST_FORWARD);
    } else {
      await evalJson(cdp, FAST_FORWARD);
    }
    await sleepMs();
  }
  await waitUntil(cdp, `(() => { const s = window.GH.memo.state; return !!(s && s.run && s.run.stage === 'feedback'); })()`, { timeout: 30000, desc: 'feedback screen' }).catch(e => stats.errors.push('driveRound: ' + e.message));
  const hasNext = await click(cdp, '[data-memo-next]');
  await sleepMs();
  if (!hasNext) return false;
  const scr = await evalJson(cdp, `(() => window.GH.memo.state.screen)()`);
  return scr !== 'result';
}

function dbg(...args) {
  if (process.env.MEMO_BROWSER_DEBUG) console.log('[dbg]', ...args);
}

async function driveRounds(cdp, maxRounds, stats) {
  for (let i = 0; i < maxRounds; i++) {
    const screen = await evalJson(cdp, `(() => window.GH.memo.state.screen)()`);
    if (screen === 'result') break;
    const started = await driveOneRound(cdp, stats);
    stats.roundsRun += 1;
    dbg('round done', stats.roundsRun, 'started:', started);
    if (!started) break;
  }
}

const SUMMARY = `(() => {
  const m = window.GH && window.GH.memo;
  if (!m) return null;
  const state = m.state;
  const session = state.result ? state.result.session : null;
  const save = state.result ? state.result.save : null;
  const runResults = (state.run && state.run.results) || [];
  const perRound = (session && session.perRound) || [];
  const recs = runResults.length ? runResults : perRound.map(p => ({
    i: p.i, mode: p.m, kind: p.k, diff: p.d, correct: !!p.c, accuracy: p.a, ms: p.ms, phase: p.p, score: p.s
  }));
  const stubWrites = (window.__stubWrites || []).map(w => ({ op: w.op, path: w.path, actor: w.actor }));
  return {
    screen: state.screen,
    session: session || null,
    save: save || null,
    rounds: recs.map(r => ({ i: r.i, mode: r.mode, kind: r.kind, diff: r.diff, mods: r.mods,
      correct: !!r.correct, accuracy: r.accuracy, ms: r.ms, timeout: !!r.timeout, phase: r.phase,
      score: r.score, hints: r.hints, seqLen: r.seqLen })),
    identity: window.GH.identity ? window.GH.identity.getIdentity() : null,
    stubWriteCount: stubWrites.length,
    stubWrites: stubWrites,
    consoleErrors: window.__memoBrowserErrors || []
  };
})()`;

/* ---------- mode runner ---------- */
async function runMode(cdp, mode, errors) {
  const uid = mode === 'registered' ? 'memo-browser-uid' : 'memo-guest-uid';
  const target = mode === 'registered'
    ? BASE + '/harness-g1g3.html?registered=1&uid=' + uid
    : BASE + '/harness-g1g3.html?uid=' + uid;
  const consoleErrors = [];
  cdp.on(msg => {
    if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'warning')) {
      consoleErrors.push('[' + msg.params.type + '] ' + msg.params.args.map(a => a.value !== undefined ? a.value : (a.description || a.type)).join(' ').slice(0, 300));
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      consoleErrors.push('[exception] ' + (d.text || '') + ' ' + (d.exception && d.exception.description || '').slice(0, 300));
    }
  });
  const stats = { mode, target, roundsSeen: [], roundsRun: 0, errors: errors || [], consoleErrors, runs: [] };
  const capRounds = parseInt(process.env.MEMO_BROWSER_MAX_ROUNDS || '0', 10);
  const capRuns = parseInt(process.env.MEMO_BROWSER_MAX_RUNS || '0', 10);

  const loadResult = await cdp.send('Page.navigate', { url: target });
  if (loadResult.frameId) {
    try { await cdp.waitEvent('Page.loadEventFired', 30000); } catch (e) { /* continue anyway */ }
  }
  await waitUntil(cdp, `(() => { const g = window.GH; return !!(g && g.memo && g.memo.modes); })()`, { timeout: 30000, desc: 'page boot' });
  await evalJson(cdp, `window.GH.router.go('memo')`);
  await waitUntil(cdp, `(() => { const g = window.GH; return !!(g && g.memo && document.querySelector('[data-view="memo"] [data-memo-start]')); })()`, { timeout: 15000, desc: 'memo view visible' });
  await evalJson(cdp, `(() => { window.__memoBrowserErrors = []; const cb = []; const w = window; return true; })()`);

  // Registered: drive 6 practice runs per mode + daily + boss.
  // Guest: drive 6 practice runs per mode (save paths stay quiet).
  const modesOrder = await evalJson(cdp, `(() => Object.keys(window.GH.memo.modes))()`);
  const runs = [];
  if (mode === 'registered') {
    for (const m of modesOrder) runs.push({ kind: 'practice', m });
    runs.push({ kind: 'modifiers', m: null }); // one practice run with all modifiers
    runs.push({ kind: 'daily', m: null });
    runs.push({ kind: 'boss', m: null });
  } else {
    for (const m of modesOrder) runs.push({ kind: 'practice', m });
    runs.push({ kind: 'daily', m: null });
  }

  for (const run of runs) {
    if (capRuns > 0 && stats.runs.length >= capRuns) break;
    dbg(mode, 'run:', run.kind, run.m, 'click start...');
    if (run.kind === 'practice') {
      await evalJson(cdp, `(() => {
        const lobby = document.querySelector('[data-memo-mode="${run.m}"]');
        if (lobby) lobby.click();
        return true;
      })()`);
      await waitUntil(cdp, `(() => window.GH.memo.state.mode === ${JSON.stringify(run.m)})()`, { timeout: 3000, desc: 'mode ' + run.m }).catch(e => stats.errors.push('mode: ' + e.message));
      dbg('state.mode now', await evalJson(cdp, `(() => window.GH.memo.state.mode)()`), 'want', run.m);
      await waitUntil(cdp, `(() => window.GH.memo.state.mode === ${JSON.stringify(run.m)})()`, { timeout: 3000, desc: 'mode ' + run.m }).catch(e => stats.errors.push('mode: ' + e.message));
      await click(cdp, '[data-memo-start]');
      await driveRounds(cdp, capRounds > 0 ? capRounds : 6, stats);
    } else if (run.kind === 'modifiers') {
      await evalJson(cdp, `(() => {
        document.querySelectorAll('[data-memo-mod]').forEach(b => { b.click(); });
        return true;
      })()`);
      await click(cdp, '[data-memo-start]');
      await driveRounds(cdp, capRounds > 0 ? capRounds : 6, stats);
    } else if (run.kind === 'daily') {
      await click(cdp, '[data-memo-daily]');
      await driveRounds(cdp, capRounds > 0 ? Math.min(10, capRounds) : 10, stats);
    } else if (run.kind === 'boss') {
      await click(cdp, '[data-memo-boss]');
      await driveRounds(cdp, capRounds > 0 ? Math.min(12, capRounds) : 12, stats);
    }
    // Let results/save settle, then snapshot what we have.
    await sleepMs();
    await sleepMs();
    const summary = await evalJson(cdp, SUMMARY);
    stats.runs.push({ runKind: run.kind, mode: run.m, summary });
    dbg(mode, run.kind, run.m, 'summary rounds:', summary && summary.rounds && summary.rounds.length);
    // Back to lobby for the next run.
    await evalJson(cdp, `(() => {
      const m = window.GH.memo;
      if (m && m.state) { m.state.screen = 'lobby'; m.state.run = null; }
      window.GH.router.go('hub', {}, { force: true });
      window.GH.router.go('memo', {}, { force: true });
      return true;
    })()`);
    await waitUntil(cdp, `(() => { return !!document.querySelector('[data-view="memo"] [data-memo-start]'); })()`, { timeout: 10000, desc: 'memo lobby again' }).catch(e => stats.errors.push('memo lobby again: ' + e.message));
  }

  const finalSummary = await evalJson(cdp, SUMMARY);
  stats.summary = finalSummary;
  stats.consoleErrors = consoleErrors.slice(0, 50);
  // Exercise the result-screen save status text path once.
  stats.resultScreens = finalSummary && finalSummary.stubWriteCount !== undefined ? finalSummary.stubWriteCount : undefined;
  return stats;
}

/* ---------- main ---------- */
async function main() {
  const argIdx = process.argv.indexOf('--modes');
  const wanted = argIdx >= 0 ? process.argv[argIdx + 1].split(',') : ['registered', 'guest'];
  if (!wanted.length || wanted[0] === 'both') wanted.splice(0, 1, 'registered', 'guest');

  const report = { driver: 'tools/test-memo-browser.js', startedAt: new Date().toISOString(), modes: {}, errors: [] };
  const port = await freePort();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-browser-'));
  const proc = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-sandbox',
    '--disable-dev-shm-usage',
    '--user-data-dir=' + tmpDir,
    '--remote-debugging-port=' + port,
    '--disable-features=Translate,TranslateGuard,OptimizationHints',
    '--host-resolver-rules=MAP fonts.googleapis.com ~NOTFOUND,MAP fonts.gstatic.com ~NOTFOUND,MAP fonts.gstatic.com ~NOTFOUND',
    'about:blank'
  ], { stdio: 'ignore' });

  let cdp = null;
  try {
    const targets = await waitTargets(port, 45000);
    const page = targets.find(t => t.type === 'page');
    if (!page) throw new Error('no page target from Edge on port ' + port);
    cdp = await CDP.connect(page.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');

    for (const mode of wanted) {
      try {
        report.modes[mode] = await runMode(cdp, mode, report.errors);
      } catch (err) {
        report.modes[mode] = { fatal: String((err && err.stack) || err) };
        report.errors.push({ mode, error: String((err && err.message) || err) });
      }
    }
  } catch (err) {
    report.errors.push({ fatal: String((err && err.stack) || err) });
  } finally {
    if (cdp) cdp.close();
    try { proc.kill('SIGKILL'); } catch (e) { /* ignore */ }
    setTimeout(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {} }, 500);
  }

  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

  // Concise console summary.
  const bar = '-'.repeat(70);
  console.log(bar);
  console.log('Memo browser verification (CDP, Edge headless) — ' + report.startedAt);
  console.log('modes run: ' + wanted.join(', '));
  for (const mode of wanted) {
    const m = report.modes[mode];
    if (!m) { console.log('[' + mode + '] FAILED — see report ' + REPORT_FILE); continue; }
    if (m.fatal) { console.log('[' + mode + '] FATAL: ' + m.fatal); continue; }
    const runRounds = (m.runs || []).map(r => r.summary && r.summary.rounds).filter(Array.isArray);
    const sess = (m.runs || []).map(r => r.summary && r.summary.session).filter(Boolean);
    const totalRounds = (runRounds.length ? runRounds.reduce((a, r) => a + r.length, 0) : sess.reduce((a, s) => a + (s.rounds || 0), 0));
    const correct = runRounds.reduce((a, r) => a + r.reduce((b, x) => b + (x.correct ? 1 : 0), 0), 0);
    const sumModes = {}; const sumKinds = {}; const sumTypes = {};
    (m.roundsSeen || []).forEach(r => { sumModes[r.mode] = (sumModes[r.mode] || 0) + 1; sumKinds[r.kind] = (sumKinds[r.kind] || 0) + 1; sumTypes[r.recallType] = (sumTypes[r.recallType] || 0) + 1; });
    const stubWrites = (m.runs || []).reduce((a, r) => a + ((r.summary && r.summary.stubWriteCount) || 0), 0);
    const actors = [...new Set((m.runs || []).flatMap(r => (r.summary && r.summary.stubWrites) || []).map(w => w.actor))];
    const errs = [...new Set((m.consoleErrors || []).concat(m.errors || []).flatMap(e => [typeof e === 'string' ? e : (e.error || '')]))].slice(0, 10);
    console.log('[' + mode + '] rounds=' + totalRounds + ' correct=' + correct + ' identity=' + JSON.stringify((m.summary && m.summary.identity) || (sess[0] && sess[0].player) || null));
    console.log('  modes exercised: ' + JSON.stringify(sumModes));
    console.log('  recall types:    ' + JSON.stringify(sumTypes));
    console.log('  stub writes total: ' + stubWrites + ' actors: ' + JSON.stringify(actors) + (stubWrites > 0 ? '' : ' (expected 0 when not registered)'));
    console.log('  console errors:  ' + JSON.stringify(errs));
    console.log('  errors this run: ' + JSON.stringify((m.errors || []).slice(0, 10)));
  }
  if (report.errors.length) console.log('FATAL report errors: ' + JSON.stringify(report.errors));
  console.log('report written: ' + path.relative(ROOT, REPORT_FILE));
  process.exit(report.modes && wanted.every(x => !report.modes[x] || report.modes[x].fatal === undefined) ? 0 : 1);
}

main().catch(err => {
  console.error('driver fatal: ' + ((err && err.stack) || err));
  process.exit(1);
});
