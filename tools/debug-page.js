'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path'); const { spawn } = require('child_process');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
class CDP {
  static async connect(u) { const ws = new WebSocket(u); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }); const c = new CDP(ws); ws.onmessage = ev => { c.emit(JSON.parse(String(ev.data))); }; return c; }
  constructor(ws) { this.ws = ws; this.n = 1; this.p = new Map(); this.ls = []; }
  emit(m) { if (m.id) { const i = this.p.get(m.id); if (!i) return; this.p.delete(m.id); m.error ? i.rej(new Error(JSON.stringify(m.error))) : i.res(m.result || {}); } else if (m.method) this.ls.slice().forEach(f => f(m)); }
  on(f) { this.ls.push(f); }
  send(method, params) { const id = this.n++; return new Promise((res, rej) => { this.p.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params: params || {} })); }); }
}
async function ev(cdp, expr) { const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }); return r.result ? r.result.value : undefined; }
async function main() {
  const port = 9223;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-debug-'));
  const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-sandbox', '--user-data-dir=' + tmp, '--remote-debugging-port=' + port, 'about:blank'], { stdio: 'ignore' });
  try {
    let targets = null;
    for (let i = 0; i < 100; i++) {
      try {
        const d = await fetch('http://127.0.0.1:' + port + '/json/list');
        const j = await d.json();
        if (j.length) { targets = j; break; }
      } catch (e) { /* retry */ }
      await sleep(200);
    }
    if (!targets) throw new Error('no targets');
    const page = targets.find(t => t.type === 'page');
    const cdp = await CDP.connect(page.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    cdp.on(m => {
      if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
        console.log('[console]', m.params.type, m.params.args.map(a => a.value !== undefined ? a.value : (a.description || a.type)).join(' ').slice(0, 300));
      } else if (m.method === 'Runtime.exceptionThrown') {
        console.log('[exception]', JSON.stringify(m.params.exceptionDetails).slice(0, 500));
      }
    });
    const nav = await cdp.send('Page.navigate', { url: 'http://127.0.0.1:4173/harness-g1g3.html?registered=1&uid=memo-browser-uid' });
    console.log('nav', JSON.stringify(nav));
    for (let i = 0; i < 150; i++) {
      const st = await ev(cdp, `(() => { try { const g = window.GH; return !!(g && g.memo && g.memo.modes); } catch (e) { return 'ERR:' + e.message; } })()`);
      if (st === true) break;
      await sleep(200);
    }
    console.log('GH.memo present:', await ev(cdp, `(() => { try { return !!(window.GH && window.GH.memo); } catch (e) { return 'ERR:' + e.message; } })()`));
    console.log('routes:', await ev(cdp, `(() => { try { return Object.keys(window.GH.router ? {} : {}); } catch (e) { return 'ERR'; } })()`));
    console.log('state.screen:', await ev(cdp, `(() => { try { return window.GH.memo.state.screen; } catch (e) { return 'ERR:' + e.message; } })()`));
    const goRes = await ev(cdp, `window.GH.router.go('memo')`);
    await sleep(1500);
    console.log('location:', await ev(cdp, `location.href`));
    console.log('memo view present:', await ev(cdp, `(() => { try { return !!document.querySelector('[data-view="memo"] [data-memo-start]'); } catch (e) { return 'ERR:' + e.message; } })()`));
    console.log('lobby start exists:', await ev(cdp, `(() => { const e = document.querySelector('[data-memo-start]'); return e ? { tag: e.tagName, cls: e.className, text: e.textContent.slice(0,30) } : null; })()`));
    console.log('mode buttons:', await ev(cdp, `(() => Array.from(document.querySelectorAll('[data-memo-mode]')).map(b => b.dataset.memoMode + ':' + b.className.slice(0, 40)).join(' | '))()`));
    console.log('mode click ->', await ev(cdp, `(() => { const e = document.querySelector('[data-memo-mode="sequence"]'); if (e) { e.click(); return { stateMode: window.GH.memo.state.mode }; } return null; })()`));
    await sleep(300);
    console.log('state.mode after click:', await ev(cdp, `window.GH.memo.state.mode`));
    console.log('start click ->', await ev(cdp, `(() => { const e = document.querySelector('[data-memo-start]'); if (e) { e.click(); return true; } return false; })()`));
    // fast forward until recall with type rhythm
    let st = null;
    for (let i = 0; i < 100; i++) {
      st = await ev(cdp, `(() => { const s = window.GH.memo.state; const r = s.run; return { screen: s.screen, stage: r && r.stage, recallType: r && r.round && r.round.recall && r.round.recall.type, beats: r && r.round && r.round.recall && r.round.recall.beats, intervals: r && r.round && r.round.recall && r.round.recall.intervals }; })()`);
      if (st && st.recallType === 'rhythm') break;
      const ff = await ev(cdp, `(() => { const r = window.GH.memo.state.run; if (r && r.phase && r.phase.name !== 'recall') { r.phase.t = r.phase.dur; } return true; })()`);
      await sleep(50);
    }
    console.log('state at recall:', JSON.stringify(st));
    const taps = await ev(cdp, `(() => {
      const pad = document.querySelector('[data-memo-tap]');
      const run = window.GH.memo.state.run;
      const n = ${st.beats || 3};
      let i = 0;
      const iv = setInterval(() => {
        if (i >= n || !run || run.stage !== 'recall') { clearInterval(iv); return; }
        const p = document.querySelector('[data-memo-tap]');
        if (p) p.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
        i++;
      }, 100);
      return true;
    })()`);
    await sleep(1500);
    const after = await ev(cdp, `(() => { const s = window.GH.memo.state; return { stage: s.run && s.run.stage, taps: s.run && s.run.input && s.run.input.taps, result: s.run && s.run.result }; })()`);
    console.log('after taps:', JSON.stringify(after));
    cdp.close();
  } finally {
    try { proc.kill('SIGKILL'); } catch (e) {}
  }
}
main().catch(e => { console.error('fatal', e); process.exit(1); });
