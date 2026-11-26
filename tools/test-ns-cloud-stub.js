/* Uji jembatan cloud Nusantara memakai Firestore/Auth palsu. Tidak menyentuh produksi. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');

const root = path.join(__dirname, '..');
const { fakeDb } = require('./fake-firestore.js');

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  setInterval: () => 0,
  clearInterval: () => {},
  TextEncoder,
  crypto: globalThis.crypto || webcrypto,
  Date,
  Math,
  JSON,
  Promise,
  Object,
  Array,
  Number,
  String,
  Error,
  URLSearchParams
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.navigator = { onLine: true };
sandbox.document = { visibilityState: 'visible', addEventListener: () => {} };
sandbox.GH = {};
sandbox.GH.firebaseConfig = { apiKey: 'stub-key', projectId: 'stub-project' };
sandbox.GH.util = {
  esc: v => String(v == null ? '' : v),
  formatNumber: v => String(v),
  nameValid: v => String(v || '').trim().length > 0,
  cleanName: v => String(v || '').trim().slice(0, 16)
};

const ctx = vm.createContext(sandbox);
for (const file of [
  'js/data/ns-schema.js', 'js/data/ns-rng.js', 'js/data/ns-core.js',
  'js/data/ns-battle.js', 'js/data/ns-synergy.js', 'js/data/ns-match.js', 'js/data/ns-id.js',
  'js/core/cloud.js'
]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
}

const db = fakeDb();
let authUser = { uid: 'uid-a' };
let identity = { registered: true, uid: 'uid-a', name: 'Uji Pemain' };
sandbox.firebase = {
  apps: [{ name: '[DEFAULT]' }],
  app: () => sandbox.firebase.apps[0],
  initializeApp: () => sandbox.firebase.apps[0],
  firestore: () => db,
  auth: () => ({
    get currentUser() { return authUser; },
    signInAnonymously: () => Promise.resolve({ user: authUser })
  })
};
sandbox.firebase.firestore.FieldValue = {
  serverTimestamp: () => Date.now(),
  increment: n => ({ __inc: n })
};

const GH = sandbox.GH;
GH.identity = {
  isRegistered: () => !!identity.registered,
  getUid: () => (identity.registered ? identity.uid : null),
  getName: () => identity.name,
  getIdentity: () => ({ registered: !!identity.registered, uid: identity.uid, name: identity.name, avatar: '🦊' })
};

let pass = 0;
let fail = 0;
const ok = (cond, msg) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + msg);
  cond ? pass++ : fail++;
};

(async function () {
  const C = GH.cloud;
  ok(['nsGetProof', 'nsRegister', 'nsLogin', 'nsRecordScore', 'nsLeaderboard', 'nsVerifyEntry', 'nsSoloScore', 'nsWeekInfo']
    .every(k => typeof C[k] === 'function'), 'API Nusantara tersedia di adapter cloud rebuild');

  ok((await C.nsGetProof()).code === 'missing', 'Belum ada bukti nama untuk UID baru');

  const registered = await C.nsRegister('Ani', '1234');
  ok(registered.ok && registered.proof.uid === 'uid-a' && registered.proof.key === 'ani',
    'Registrasi nama terikat UID Auth rebuild');
  ok(db.docs['ns_players/ani'].uid === 'uid-a' && db.docs['ns_secrets/ani'].uid === 'uid-a'
    && db.docs['ns_profiles/uid-a'].uid === 'uid-a',
  'Dokumen pemain, rahasia, dan bukti memuat UID yang sama');

  ok((await C.nsRegister('Budi', '1234')).code === 'PROOF_EXISTS', 'Satu UID tidak bisa mengambil nama kedua');

  const proof = await C.nsGetProof();
  ok(proof.ok && proof.proof.ph === registered.proof.ph, 'Bukti tersimpan dan lolos pemeriksaan hash');

  const score = C.nsSoloScore(10, 50, 'Ani');
  ok(score === 10 * 100 + 50 * 5, 'Skor Solo memakai peringkat ZIP: ' + score);

  const saved = await C.nsRecordScore({ matchId: 'NODE-1', mode: 'solo', round: 10, hp: 50, score });
  ok(saved.ok && saved.tot.score === score && saved.round === 10, 'Skor Solo dicatat sekali');
  ok((await C.nsRecordScore({ matchId: 'NODE-1', mode: 'solo', round: 10, hp: 50, score })).reason === 'DUPLICATE',
    'matchId yang sama ditolak (idempoten)');
  ok(db.docs['ns_scores/NODE-1_ani'].uid === 'uid-a', 'Entri skor membawa UID pemain');
  ok((await C.nsRecordScore({ matchId: 'NODE-2', mode: 'solo', round: 2, hp: 50, score: 100 })).reason === 'NOT_COUNTED',
    'Match di bawah pupuh 3 tidak dicatat');

  const all = await C.nsLeaderboard('all');
  const week = await C.nsLeaderboard('week');
  ok(all.ok && all.rows[0].name === 'Ani' && all.rows[0].score === score, 'Papan semua mode menampilkan skor UID');
  ok(week.ok && week.rows.length === 1 && week.week.week > 0, 'Papan mingguan memakai pembagian minggu UTC');

  const verify = await C.nsVerifyEntry({ mode: 'solo', matchId: 'NODE-1', name: 'Ani', score });
  ok(verify.ok === null && verify.reason === 'SOLO_UNVERIFIABLE', 'Verifikasi Solo dinyatakan tidak dapat diverifikasi ulang');

  db.docs['ns_profiles/uid-b'] = {
    uid: 'uid-b', key: 'ani', name: 'Ani', ph: registered.proof.ph,
    createdAt: Date.now(), updatedAt: Date.now()
  };
  const beforeForeign = Object.keys(db.docs).length;
  identity = { registered: true, uid: 'uid-b', name: 'Pemain Lain' };
  authUser = { uid: 'uid-b' };
  const foreign = await C.nsGetProof();
  ok(!foreign.ok && (foreign.reason === 'FOREIGN_UID' || foreign.code === 'foreign'), 'Bukti milik UID lain ditolak');
  ok(Object.keys(db.docs).length === beforeForeign, 'Percobaan lintas UID tidak menulis dokumen');

  identity = { registered: false, uid: null, name: 'Tamu' };
  authUser = null;
  const beforeGuest = Object.keys(db.docs).length;
  const guestRegister = await C.nsRegister('Tamu', '1234');
  const guestScore = await C.nsRecordScore({ matchId: 'GUEST-1', mode: 'solo', round: 10, hp: 50, score: 1250 });
  ok(guestRegister.skipped && guestScore.skipped, 'Tamu tidak bisa mendaftar atau menyimpan skor');
  ok(Object.keys(db.docs).length === beforeGuest, 'Tamu tidak menulis data permanen');

  console.log('RINGKASAN ' + pass + ' lulus, ' + fail + ' gagal');
  process.exit(fail ? 1 : 0);
})().catch(err => {
  console.log('FAIL galat: ' + (err && err.stack || err));
  process.exit(1);
});
