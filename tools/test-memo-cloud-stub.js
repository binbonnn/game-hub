/* Uji adapter Memo ZIP lewat stub Firestore/Auth di browser.
   Tidak memakai Firestore produksi dan tidak menulis data uji ke server. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const uid = 'memo-stub-uid';

function load(file, ctx) {
  const code = fs.readFileSync(path.join(root, file), 'utf8');
  vm.runInContext(code, ctx, { filename: file });
}

function makeContext() {
  const sandbox = {
    console,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    setInterval: function () { return 0; },
    clearInterval: function () {},
    location: { search: '?registered=1&uid=' + uid, href: 'http://localhost/' },
    navigator: { onLine: true },
    crypto: {
      getRandomValues: function (arr) {
        for (let i = 0; i < arr.length; i++) arr[i] = (i * 37 + 11) & 255;
        return arr;
      }
    },
    document: {
      visibilityState: 'visible',
      head: { appendChild: function () {} },
      addEventListener: function () {},
      createElement: function () { return { setAttribute: function () {}, addEventListener: function () {}, parentNode: null }; }
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.addEventListener = function () {};
  sandbox.requestAnimationFrame = function (fn) { setTimeout(fn, 0); };
  const ctx = vm.createContext(sandbox);
  ctx.GH = {
    firebaseConfig: { apiKey: 'stub-key', projectId: 'stub-project' },
    firebaseOptions: {}
  };
  return ctx;
}

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

(async function () {
  const ctx = makeContext();
  const GH = ctx.GH;

  load('tools/stub-cloud.js', ctx);
  load('js/core/cloud.js', ctx);
  load('js/data/memo-core.js', ctx);
  load('js/data/memo-data.js', ctx);

  let registered = true;
  GH.identity = {
    getIdentity: function () {
      return registered
        ? { registered: true, uid: uid, name: 'Uji Pemain', avatar: '🦊' }
        : { registered: false, uid: null, name: 'Tamu', avatar: '🦊' };
    },
    isRegistered: function () { return registered; },
    getUid: function () { return registered ? uid : null; }
  };

  const C = GH.cloud;
  ['memoNormName', 'memoCheckName', 'memoRegisterProfile', 'memoSaveSession',
    'memoGetBoard', 'memoGetProfile', 'memoGetHistory', 'memoUpdateIcon',
    'memoBoardKey', 'memoRemoteKey'].forEach(function (key) {
    assert(typeof C[key] === 'function', 'API cloud tidak tersedia: ' + key);
  });

  const ready = await C.init();
  assert(ready === true, 'cloud.init harus memakai SDK stub');
  assert(C.getStatus().projectId === 'stub-project', 'cloud tidak memakai konfigurasi stub');

  const writesBeforeGuest = ctx.__stubWrites.length;
  registered = false;
  const guest = await C.memoSaveSession({ pid: uid, session: {}, payload: {} });
  assert(guest.skipped === true, 'tamu tidak boleh menulis sesi');
  assert(ctx.__stubWrites.length === writesBeforeGuest, 'tamu menulis ke stub');
  registered = true;

  const check = await C.memoCheckName('Uji Memo', uid);
  assert(check.ok && check.free && check.name === 'Uji Memo', 'pemeriksaan nama gagal');
  const reg = await C.memoRegisterProfile('Uji Memo', { icon: '🦊' });
  assert(reg.ok && reg.name === 'Uji Memo', 'registrasi profil gagal');
  assert(ctx.__stubDocs['memo_names/uji_memo'], 'dokumen memo_names tidak dibuat');
  assert(ctx.__stubDocs['memo_profiles/' + uid], 'dokumen memo_profiles tidak dibuat');

  const taken = await C.memoCheckName('Uji Memo', 'pemain-lain');
  assert(taken.ok && taken.free === false, 'nama ganda tidak terdeteksi');

  const session = {
    type: 'standard',
    practice: false,
    mode: 'snapshot',
    diff: 'normal',
    plannedRounds: 10,
    total: 10,
    correct: 9,
    score: 1234,
    bestCombo: 4,
    hints: 1,
    accuracy: 0.9,
    totalMs: 42000,
    livesLost: 1,
    maxSeqLen: 5,
    done: true,
    failed: false,
    dateKey: null,
    modesSeen: ['snapshot'],
    player: { name: 'Uji Pemain', avatar: '🦊' },
    perRound: []
  };
  const item = GH.memoData.buildItem(session, { won: false });
  assert(item && item.pid === uid, 'buildItem harus memakai UID rebuild');
  assert(item.payload.bk === 'std_snapshot_normal_10', 'kunci papan salah: ' + item.payload.bk);

  const saved = await C.memoSaveSession(item);
  assert(saved.ok && saved.entered, 'sesi gagal disimpan ke papan');
  assert(Array.isArray(saved.newAch) && saved.newAch.indexOf('first') >= 0, 'achievement pertama tidak muncul');
  const sessPath = 'memo_profiles/' + uid + '/sessions/' + item.sid;
  assert(ctx.__stubDocs[sessPath], 'dokumen sesi tidak dibuat');
  assert(ctx.__stubDocs['memo_boards/std_snapshot_normal_10/entries/' + uid], 'entri papan tidak dibuat');
  assert(ctx.__stubDocs['memo_profiles/' + uid].st.sessions === 1, 'stat sesi tidak bertambah');

  const dup = await C.memoSaveSession(item);
  assert(dup.ok && dup.dup === true, 'sid yang sama harus idempoten');
  assert(ctx.__stubDocs['memo_profiles/' + uid].st.sessions === 1, 'duplikat menambah stat sesi');

  const board = await C.memoGetBoard({ type: 'standard', mode: 'snapshot', diff: 'normal', plannedRounds: 10 }, 5);
  assert(board.ok && board.rows.length === 1 && board.rows[0].score === 1234, 'papan Memo salah');
  assert(board.rows[0].meta.label.indexOf('90') >= 0, 'label akurasi salah');

  const prof = await C.memoGetProfile(uid);
  assert(prof.ok && prof.profile.st.sessions === 1 && prof.profile.name === 'Uji Memo', 'profil Memo salah');

  const history = await C.memoGetHistory(uid, 5);
  assert(history.ok && history.rows.length === 1, 'riwayat Memo salah');

  const icon = await C.memoUpdateIcon(uid, '🐙');
  assert(icon.ok, 'pembaruan ikon gagal');
  assert(ctx.__stubDocs['memo_profiles/' + uid].icon === '🐙', 'ikon tidak tersimpan');

  const badPaths = ctx.__stubWrites
    .map(function (w) { return w.path || ''; })
    .filter(function (p) { return p && p.indexOf('memo_') !== 0; });
  assert(badPaths.length === 0, 'ada tulisan di luar koleksi Memo: ' + badPaths.join(', '));
  assert(ctx.__stubWrites.every(function (w) { return w.actor === uid; }), 'actor tulisan bukan UID rebuild');

  console.log('stub writes :', ctx.__stubWrites.length);
  console.log('OK: Memo cloud adapter memakai UID rebuild, idempoten, dan tidak menyentuh produksi.');
})().catch(function (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
