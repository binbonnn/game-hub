/* Uji jalur data Nusantara rebuild: ns-schema + ns-data + alias GH.ns*. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const sandbox = {
  console,
  document: { currentScript: { src: 'http://localhost/js/data/ns-data.js?v=p0' } },
  fetch: function (url) {
    const match = /\/([a-z]+)\.json(?:\?|$)/.exec(String(url));
    if (!match) return Promise.resolve({ ok: false, status: 404 });
    const file = path.join(root, 'data', 'nusantara', match[1] + '.json');
    if (!fs.existsSync(file)) return Promise.resolve({ ok: false, status: 404 });
    return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(JSON.parse(fs.readFileSync(file, 'utf8'))); } });
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
const ctx = vm.createContext(sandbox);
ctx.GH = { util: { clamp: function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); } } };

for (const file of [
  'js/data/ns-schema.js', 'js/data/ns-data.js', 'js/data/ns-rng.js',
  'js/data/ns-core.js', 'js/data/ns-battle.js', 'js/data/ns-synergy.js', 'js/data/ns-match.js',
  'js/data/ns-id.js', 'js/data/nusantara-data.js'
]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
}

(async function () {
  const GH = ctx.GH;
  for (const key of ['nsSchema', 'nsData', 'nsRng', 'nsCore', 'nsBattle', 'nsSynergy', 'nsMatch', 'nsId']) {
    if (!GH[key]) throw new Error('GH.' + key + ' tidak tersedia');
  }

  const res = await GH.nsData.load();
  if (!res.ok) throw new Error('validasi data gagal: ' + res.errors.join(' | '));
  const sum = JSON.stringify(res.summary);
  const want = JSON.stringify({ characters: 40, synergies: 16, commanders: 8, arenas: 9, bosses: 135 });
  if (sum !== want) throw new Error('ringkasan salah: ' + sum);
  if (GH.nsData.get() !== res.data) throw new Error('cache nsData.get tidak cocok');

  const again = await GH.nsData.load();
  if (again !== res) throw new Error('load() kedua tidak memakai cache');
  if (typeof GH.nsSchema.validate !== 'function') throw new Error('nsSchema.validate bukan fungsi');
  if (typeof GH.nsMatch.score !== 'function') throw new Error('nsMatch.score bukan fungsi');
  if (!GH.nsLegacyData || typeof GH.nsData.load !== 'function') throw new Error('data lama menimpa GH.nsData loader');

  console.log('summary  :', sum);
  console.log('OK: data Nusantara ZIP termuat lewat GH.nsData.load dan terekspos di GH.ns*.');
})().catch(function (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
