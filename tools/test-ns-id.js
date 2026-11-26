/* Uji GH.nsId (Fase 7 ZIP) dengan Firestore palsu. Tidak menyentuh produksi. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const sandbox = {
  console,
  crypto: globalThis.crypto,
  TextEncoder,
  setTimeout,
  clearTimeout
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
const ctx = vm.createContext(sandbox);
ctx.GH = {};

for (const file of [
  'js/data/ns-schema.js', 'js/data/ns-rng.js', 'js/data/ns-core.js',
  'js/data/ns-battle.js', 'js/data/ns-synergy.js', 'js/data/ns-match.js', 'js/data/ns-id.js'
]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
}

const GH = ctx.GH;
const NS = GH.ns;
const { fakeDb } = require('./fake-firestore.js');

const data = {};
GH.nsSchema.FILES.forEach(function (f) {
  data[f] = JSON.parse(fs.readFileSync(path.join(root, 'data', 'nusantara', f + '.json'), 'utf8'));
});

let pass = 0;
let fail = 0;
const ok = function (cond, msg) {
  console.log((cond ? 'PASS ' : 'FAIL ') + msg);
  cond ? pass++ : fail++;
};

let T = 1e6;
const clock = function () { return T; };

(async function () {
  const db = fakeDb();
  const id = NS.Id.create(db, clock);

  ok((await id.register('a.b', '1234')).reason === 'BAD_NAME'
    && (await id.register('Ani', '12')).reason === 'BAD_PIN'
    && (await id.register('Ani', 'abcd')).reason === 'BAD_PIN',
  'Nama terlarang dan PIN bukan 4 digit ditolak');

  const r = await id.register('  Ani ', '1234');
  ok(r.ok && r.proof.key === 'ani' && r.proof.name === 'Ani', 'Daftar: nama dirapikan, bukti masuk dikembalikan');

  const doc = db.docs['ns_secrets/ani'];
  ok(doc.pinHash.length === 64 && doc.salt.length === 32 && JSON.stringify(doc).indexOf('1234') < 0,
    'PIN tidak tersimpan polos: hash 64 heks + garam (di ns_secrets)');
  ok(!/pinHash|salt|fails|lockUntil/.test(JSON.stringify(db.docs['ns_players/ani'])),
    'Dokumen pemain publik tidak memuat hash, garam, atau hitungan salah');

  ok((await id.register('ANI', '9999')).reason === 'NAME_TAKEN', 'Nama sama (beda huruf besar) ditolak');
  const doc2 = await id.register('Budi', '1234');
  ok(doc2.ok && db.docs['ns_secrets/budi'].pinHash !== doc.pinHash, 'PIN sama + garam beda = hash beda');
  ok((await id.login('Ani', '1234')).ok && (await id.login('ani', '1234')).proof.ph === r.proof.ph,
    'Masuk dengan PIN benar (nama tak peka huruf)');
  ok((await id.login('Tidak', '1234')).reason === 'NO_NAME', 'Nama belum terdaftar');

  let x;
  for (let i = 1; i <= 4; i++) x = await id.login('Ani', '0000');
  ok(x.reason === 'WRONG_PIN' && x.left === 1, 'Percobaan salah dihitung (sisa ' + x.left + ')');
  x = await id.login('Ani', '0000');
  ok(x.reason === 'LOCKED' && x.waitMs === id.LOCK_MS, 'Percobaan salah ke-5: terkunci 15 menit');
  ok((await id.login('Ani', '1234')).reason === 'LOCKED', 'Saat terkunci, PIN benar pun ditolak');
  T += id.LOCK_MS + 1;
  ok((await id.login('Ani', '1234')).ok, 'Setelah masa kunci lewat, bisa masuk lagi');
  ok(db.docs['ns_secrets/ani'].fails === 0, 'Hitungan salah di-reset setelah berhasil');

  const pa = r.proof;
  const pb = doc2.proof;
  ok((await id.check(pa)).ok && (await id.check({ key: 'ani', ph: 'x' })).reason === 'BAD_PROOF',
    'Bukti masuk perangkat divalidasi terhadap hash di server');
  ok((await id.recordScore({ key: 'ani', ph: 'x' }, { matchId: 'M1', mode: 'solo', round: 10, score: 1000 })).reason === 'BAD_PROOF',
    'Skor dengan bukti salah ditolak');
  ok((await id.recordScore(pa, { matchId: 'M1', mode: 'solo', round: 2, score: 200 })).reason === 'NOT_COUNTED'
    && (await id.recordScore(pa, { matchId: 'M1', mode: 'solo', round: 9, score: 0 })).reason === 'NOT_COUNTED',
  'Match < ronde 3 atau skor hangus tidak dicatat');
  ok((await id.recordScore(pa, { matchId: 'M1', mode: 'solo', round: 10, hp: 0, score: 1000 })).ok, 'Skor Solo dicatat');
  ok((await id.recordScore(pa, { matchId: 'M1', mode: 'solo', round: 10, score: 1000 })).reason === 'DUPLICATE',
    'Skor yang sama tidak dihitung dua kali');

  await id.recordScore(pa, { matchId: 'R1-1', mode: 'duel', round: 20, hp: 50, score: 2450 });
  await id.recordScore(pb, { matchId: 'R1-1', mode: 'duel', round: 12, hp: 0, score: 1200 });
  await id.recordScore(pb, { matchId: 'M2', mode: 'solo', round: 30, score: 3000 });

  const t = db.docs['ns_players/ani'].tot;
  ok(t.score === 3450 && t.matches === 2 && t.best === 20, 'Total Ani: skor 3450, 2 match, ronde terbaik 20');
  ok(db.docs['ns_players/ani'].mode.solo.score === 1000 && db.docs['ns_players/ani'].mode.duel.score === 2450,
    'Total per mode terpisah');

  let lb = await id.leaderboard('all');
  ok(lb.length === 2 && lb[0].name === 'Budi' && lb[0].score === 4200 && lb[1].name === 'Ani'
    && lb[1].score === 3450 && lb[0].matches === 2, 'Leaderboard semua mode urut skor total menurun');
  lb = await id.leaderboard('duel');
  ok(lb[0].name === 'Ani' && lb[0].score === 2450 && lb.length === 2, 'Filter Duel: Ani 2450, Budi 1200');
  lb = await id.leaderboard('coop');
  ok(lb.length === 0, 'Mode tanpa skor = papan kosong');
  ok(!JSON.stringify(await id.leaderboard('all')).includes('pinHash'), 'Papan peringkat tidak membocorkan hash PIN');

  lb = await id.leaderboard('week');
  ok(lb.length === 2 && lb[0].name === 'Budi' && lb[0].score === 4200 && lb[1].score === 3450,
    'Mingguan: minggu ini sama dengan total (semua skor di minggu yang sama)');
  T += 8 * 86400000;
  lb = await id.leaderboard('week');
  ok(lb.length === 0, 'Minggu berganti: papan mingguan kosong (total tetap ada)');
  await id.recordScore(pa, { matchId: 'W9', mode: 'solo', round: 10, score: 500 });
  lb = await id.leaderboard('week');
  ok(lb.length === 1 && lb[0].name === 'Ani' && lb[0].score === 500 && lb[0].matches === 1,
    'Skor baru memulai hitungan mingguan dari nol (Ani 500)');
  ok((await id.leaderboard('all'))[0].name === 'Budi' && db.docs['ns_players/ani'].tot.score === 3950,
    'Total sepanjang masa tidak ikut direset');
  ok(NS.Id.weekOf(Date.UTC(2026, 10, 9)) === NS.Id.weekOf(Date.UTC(2026, 10, 15, 23, 59))
    && NS.Id.weekOf(Date.UTC(2026, 10, 16)) === NS.Id.weekOf(Date.UTC(2026, 10, 9)) + 1,
  'Minggu berganti tepat Senin 00:00 UTC (9 Nov 2026 Senin)');
  T -= 8 * 86400000;

  /* Verifikasi ulang dari dokumen room: disusun langsung tanpa ns-net (P4). */
  const created = NS.Match.createRoom({ code: 'VER01', mode: 'duel', host: 'Ani', seed: 4 });
  NS.Match.addPlayer(created.room, 'Budi');
  NS.Match.setReady(created.room, 'Ani', true);
  NS.Match.setReady(created.room, 'Budi', true);
  const M = NS.Match.start(data, created.room).match;
  NS.Match.leave(M, 'Budi');
  M.lastRound = 5;
  M.players.ani.hp = 60;
  M.players.ani.lastRound = 5;
  M.ended = true;
  db.docs['ns_rooms/VER01'] = { matchJson: JSON.stringify(M) };

  const good = NS.Match.score(M, 'Ani');
  ok(good === 5 * 100 + 60 * 5 + 200, 'Skor resmi dari room: ' + good);
  ok((await id.verifyEntry({ mode: 'duel', matchId: 'VER01-1', name: 'Ani', score: good })).ok === true,
    'Entri skor yang benar lolos verifikasi ulang');
  const v = await id.verifyEntry({ mode: 'duel', matchId: 'VER01-1', name: 'Ani', score: good + 999 });
  ok(v.ok === false && v.expected === good, 'Skor yang digelembungkan terdeteksi');
  ok((await id.verifyEntry({ mode: 'solo', matchId: 'x', name: 'Ani', score: 1 })).reason === 'SOLO_UNVERIFIABLE',
    'Skor Solo dinyatakan tidak dapat diverifikasi');

  console.log('RINGKASAN ' + pass + ' lulus, ' + fail + ' gagal');
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  console.log('FAIL galat: ' + (e.stack || e));
  process.exit(1);
});
