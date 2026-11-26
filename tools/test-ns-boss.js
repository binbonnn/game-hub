/* Uji pupuh Penjaga (G5-Fase2i): Sunyi muncul dengan selang biasa; Penjaga menjadi musuh TERAKHIR dalam antrean,
   muncul tepat setelah Sunyi terakhir keluar (tanpa menunggu Sunyi mati), jadi boleh berada di arena bersama Sunyi.
   Jalankan dari folder proyek: node tests/nusantara-boss.test.js */
const fs = require('fs'), path = require('path');
const S0 = require('../js/data/ns-schema.js');
const NS = require('../js/data/ns-rng.js');
require('../js/data/ns-core.js'); require('../js/data/ns-battle.js');
const Core = NS.Core, Battle = NS.Battle, Wave = NS.Wave;
const data = {}; S0.FILES.forEach(f => data[f] = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/nusantara', f + '.json'), 'utf8')));
const A = 'pelataran-keraton-wirasana';
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };
const strong = r => ({ round: r, arenaId: A, units: [[2, 3], [2, 5], [4, 3], [4, 5], [3, 4], [5, 4]].map((p, i) => ({ uid: i + 1, id: 'x', star: 1, r: p[0], c: p[1], stats: { hp: 99999, atk: 400 * (r >= 50 ? 12 : 1), attackSpeed: 1.5, range: 2, armor: 50, resist: 0 } })) });
const empty = r => ({ round: r, arenaId: A, units: [] });
function trace(setup) {
    const B = Battle.create(data, setup); const ev = [];
    let bossSeen = 0, aliveNormalWhenBoss = -1, prevBoss = false, bossT = null, bossId = null, spawnedBeforeBoss = null;
    while (!B.done) {
        Battle.step(B);
        const nb = B.enemies.filter(e => e.boss).length;
        if (nb && !prevBoss) { bossSeen++; bossT = B.t; aliveNormalWhenBoss = B.enemies.filter(e => !e.boss).length; bossId = B.enemies.find(e => e.boss).id; spawnedBeforeBoss = B.spawned - 1; }
        prevBoss = prevBoss || nb > 0;
    }
    return { B, bossSeen, aliveNormalWhenBoss, bossT, bossId, spawnedBeforeBoss };
}
for (const r of [5, 10, 50]) {
    const w = Wave.forRound(data, r, A);
    const t = trace(strong(r));
    const slot = w.pre.count * w.pre.gap; // slot antrean tepat setelah Sunyi terakhir
    ok(w.kind === 'bos' && w.pre && w.pre.count === 6 + Math.floor(r / 5), 'pupuh ' + r + ': ada gelombang Sunyi (' + (w.pre && w.pre.count) + ') sebelum Penjaga');
    ok(t.bossSeen === 1, 'pupuh ' + r + ': Penjaga muncul tepat satu kali');
    ok(t.B.spawned === w.pre.count + 1, 'pupuh ' + r + ': total muncul = Sunyi + 1 Penjaga (' + t.B.spawned + ')');
    ok(t.B.done && t.B.killed === w.pre.count + 1 && t.B.leaks === 0, 'pupuh ' + r + ': semua dikalahkan, pupuh selesai (menang)');
    ok(t.bossT >= slot && t.bossT <= slot + 2 * Battle.DT, 'pupuh ' + r + ': Penjaga muncul tepat di slot setelah Sunyi terakhir (' + t.bossT.toFixed(2) + ' dtk, slot ' + slot.toFixed(2) + ')');
    ok(t.bossId === w.pre.count + 1 && t.spawnedBeforeBoss === w.pre.count, 'pupuh ' + r + ': Penjaga musuh paling akhir (id ' + t.bossId + ', ' + t.spawnedBeforeBoss + ' Sunyi sudah muncul)');
}
// tanpa unit: tidak ada yang mati, jadi Penjaga muncul SAAT Sunyi masih ada (bukan menunggu mereka habis); kerusakan = Sunyi x lolos biasa + 20
{ const r = 10, w = Wave.forRound(data, r, A), t = trace(empty(r));
  ok(t.bossSeen === 1 && t.aliveNormalWhenBoss === w.pre.count, 'tanpa unit: Penjaga muncul bersamaan dengan Sunyi yang belum habis (' + t.aliveNormalWhenBoss + ' Sunyi masih ada)');
  ok(t.B.leaks === w.pre.count + 1 && t.B.leakDamage === w.pre.count * w.pre.leak + w.leak, 'tanpa unit: kerusakan = ' + w.pre.count + ' x ' + w.pre.leak + ' + ' + w.leak + ' (' + t.B.leakDamage + ')'); }
// Sunyi lemah dan lambat dibunuh: Penjaga tetap keluar di slot yang sama (tidak tertunda oleh Sunyi yang masih hidup atau sudah mati)
{ const r = 10, w = Wave.forRound(data, r, A), t = trace(strong(r)), t0 = trace(empty(r));
  ok(Math.abs(t.bossT - t0.bossT) < 1e-9, 'waktu muncul Penjaga sama dengan atau tanpa unit (' + t.bossT.toFixed(2) + ' dtk)'); }
// HP/ATK Penjaga tidak berubah dari konfigurasi lama (1,6 x total gelombang)
{ const w = Wave.forRound(data, 10, A); const pre = w.pre; ok(w.hp === Math.round(pre.count * pre.hp * 1.6) || Math.abs(w.hp - pre.count * pre.hp * 1.6) < pre.count, 'HP Penjaga tetap = 1,6 x total HP gelombang biasa'); }
// pupuh biasa tidak berubah: identik dengan simulator lama
{ let same = true;
  for (const r of [1, 3, 7, 12, 19]) { const w = Wave.forRound(data, r, A); if (w.pre || w.kind !== 'biasa') same = false; }
  ok(same, 'pupuh biasa: tidak ada fase Sunyi tambahan (kind biasa, tanpa pre)'); }
// determinisme
{ const a = Battle.run(Battle.create(data, strong(10))), b = Battle.run(Battle.create(data, strong(10))); ok(a.hash === b.hash && a.seconds === b.seconds, 'pupuh Penjaga deterministik (hash sama)'); }
console.log('\nRINGKASAN ' + pass + ' lulus, ' + fail + ' gagal'); process.exit(fail ? 1 : 0);
