'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path'); const { spawn } = require('child_process');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
class CDP {
  static async connect(u) { const ws = new WebSocket(u); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }); const c = new CDP(ws); ws.onmessage = ev => c.emit(JSON.parse(String(ev.data))); return c; }
  constructor(ws) { this.ws = ws; this.n = 1; this.p = new Map(); this.ls = []; }
  emit(m) { if (m.id) { const i = this.p.get(m.id); if (!i) return; this.p.delete(m.id); m.error ? i.rej(new Error(JSON.stringify(m.error))) : i.res(m.result || {}); } else if (m.method) this.ls.slice().forEach(f => f(m)); }
  on(f) { this.ls.push(f); }
  send(method, params) { const id = this.n++; return new Promise((res, rej) => { this.p.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params: params || {} })); }); }
  close() { try { this.ws.close(); } catch (e) {} }
}
async function ev(cdp, expr) { const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }); return r.result ? r.result.value : undefined; }
async function main() {
  const port = 9222;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-debug2-'));
  const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-sandbox', '--user-data-dir=' + tmp, '--remote-debugging-port=' + port, 'about:blank'], { stdio: 'ignore' });
  try {
    let targets = null;
    for (let i = 0; i < 100; i++) {
      try { const d = await fetch('http://127.0.0.1:' + port + '/json/list'); const j = await d.json(); if (j.length) { targets = j; break; } } catch (e) { }
      await sleep(200);
    }
    const cdp = await CDP.connect(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    const g = async (expr) => ev(cdp, expr);
    await cdp.send('Runtime.enable');
    cdp.on(m => { if (m.method === 'Runtime.exceptionThrown') console.log('[exception]', JSON.stringify(m.params.exceptionDetails).slice(0, 400)); });
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:4173/harness-g1g3.html?registered=1&uid=memo-browser-uid' });
    await g(`(() => { for (let i = 0; i < 100; i++) { const w = window.GH; if (w && w.memo) return true; } return false; })()`);
    // wait until memo lobby
    for (let i = 0; i < 100; i++) { if (await g(`(() => { const e = document.querySelector('[data-view="memo"] [data-memo-start]'); return !!e; })()`)) break; await sleep(200); }
    await g(`(() => { const e = document.querySelector('[data-memo-start]'); if (e) e.click(); return true; })()`);
    await sleep(2000);
    console.log('state after start:', JSON.stringify(await g(`(() => { const s = window.GH.memo.state; return { screen: s.screen, stage: s.run && s.run.stage, mode: s.run && s.round && s.round.mode }; })()`)));
    // fast-forward until rhythm recall
    let st = null;
    for (let i = 0; i < 200; i++) {
      st = await g(`(() => { const r = window.GH.memo.state.run; return { stage: r && r.stage, type: r && r.round && r.round.recall && r.round.recall.type, beats: r && r.round && r.round.recall && r.round.recall.beats, intervals: r && r.round && r.round.recall && r.round.recall.intervals, tolerate: r && r.round && r.round.recall && r.round.recall.tolerance }; })()`);
      if (st && st.type === 'rhythm') break;
      await g(`(() => { const r = window.GH.memo.state.run; if (r && r.phase && r.phase.name !== 'recall') { r.phase.t = r.phase.dur; } return true; })()`);
      await sleep(50);
    }
    console.log('recall state:', JSON.stringify(st));
    await g(`(() => {
      const ts = [];
      const run = window.GH.memo.state.run;
      const n = ${st.beats};
      for (let i = 0; i < n; i++) {
        const ev = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window });
        ts.push(ev.timeStamp);
        document.querySelector('[data-memo-tap]').dispatchEvent(ev);
      }
      return { eventTimeStamps: ts, taps: run.input.taps.slice() };
    })()`);
    await sleep(1500);
    console.log(JSON.stringify(await g(`(() => {
      const s = window.GH.memo.state;
      const run = s.run;
      return { stage: run && run.stage, taps: run && run.input && run.input.taps,
        validate: run && window.GH.memoCore && run.round ? window.GH.memoCore.validate(run.round, run.input.taps) : null };
    })()`)));
    cdp.close();
  } finally { try { proc.kill('SIGKILL'); } catch (e) {} }
}
main().catch(e => { console.error('fatal', e); process.exit(1); });
