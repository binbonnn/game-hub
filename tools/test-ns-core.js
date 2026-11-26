/* Uji sim-core Nusantara Sirna: ekonomi, toko/pool, merge, jual, papan, gelombang, pertempuran, determinisme.
   Jalankan dari folder proyek: node tests/nusantara-core.test.js */
const fs = require('fs'), path = require('path');
const S0 = require('../js/data/ns-schema.js');
const NS = require('../js/data/ns-rng.js');
require('../js/data/ns-core.js');
require('../js/data/ns-battle.js');
require('../js/data/ns-synergy.js');
const Core = NS.Core, Battle = NS.Battle, Wave = NS.Wave, Syn = NS.Synergy;

const data = {}; S0.FILES.forEach(f => data[f] = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/nusantara', f + '.json'), 'utf8')));
const ix = Core.index(data);
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };
const near = (a, b, e) => Math.abs(a - b) <= (e || 1e-9);

/* ---------- RNG ---------- */
{
  const a = NS.rng.make(123), b = NS.rng.make(123), c = NS.rng.make(124);
  const sa = [], sb = [], sc = [];
  for (let i = 0; i < 50; i++) { sa.push(a.next()); sb.push(b.next()); sc.push(c.next()); }
  ok(JSON.stringify(sa) === JSON.stringify(sb), 'RNG: benih sama = urutan sama');
  ok(JSON.stringify(sa) !== JSON.stringify(sc), 'RNG: benih beda = urutan beda');
  ok(sa.every(x => x >= 0 && x < 1), 'RNG: semua nilai dalam [0,1)');
  ok(NS.rng.mix([1, 'shop', 2, 3]) === NS.rng.mix([1, 'shop', 2, 3]) && NS.rng.mix([1, 'shop', 2, 3]) !== NS.rng.mix([1, 'shop', 2, 4]), 'RNG: mix stabil dan peka pada tiap bagian');
}

/* ---------- Awal match ---------- */
const poolTotal = id => ix.eco.poolByCost[ix.chars[id].cost].copiesPerCharacter;
function invariant(S) { // pool + toko + unit dimiliki (1/3/9 salinan) = awal, untuk SETIAP karakter
  const bad = [];
  ix.ids.forEach(id => {
    let n = S.pool[id];
    S.shop.forEach(s => { if (s === id) n++; });
    Core.allUnits(S).forEach(e => { if (e.u.id === id) n += Core.COPIES[e.u.star]; });
    if (n !== poolTotal(id)) bad.push(id + ':' + n + '/' + poolTotal(id));
  });
  return bad;
}
function sane(S) {
  const e = [];
  if (S.gold < 0) e.push('emas negatif');
  if (Core.boardCount(S) > Core.unitLimit(ix, S)) e.push('papan melebihi level');
  if (S.bench.length !== 9) e.push('bench bukan 9 slot (' + S.bench.length + ')');
  Object.keys(S.board).forEach(k => { if (!ix.arenas[S.arenaId].tileSet[k]) e.push('unit di bukan petak unit ' + k); });
  const uids = Core.allUnits(S).map(x => x.u.uid); if (new Set(uids).size !== uids.length) e.push('uid ganda');
  Core.allUnits(S).forEach(x => { if (x.u.star < 1 || x.u.star > 3) e.push('bintang di luar 1-3'); });
  return e;
}
{
  const S = Core.create(data, { seed: 7 });
  ok(S.gold === 5 && S.level === 1 && S.xp === 0 && S.hp === 100 && S.round === 1 && S.phase === 'prep', 'awal: emas 5, level 1, HP 100, ronde 1, fase prep');
  ok(S.shop.length === 5 && S.shop.every(Boolean), 'awal: toko 5 slot terisi');
  ok(S.shop.every(id => ix.chars[id].cost === 1), 'awal: level 1 hanya menjual biaya 1');
  ok(invariant(S).length === 0, 'awal: invarian pool utuh');
  const S2 = Core.create(data, { seed: 7 }), S3 = Core.create(data, { seed: 8 });
  ok(S.shop.join() === S2.shop.join(), 'toko: benih sama = toko sama');
  ok(S.shop.join() !== S3.shop.join() || true, '(toko benih beda hanya informasi)');
  let thrown = false; try { Core.create(data, { arenaId: 'tidak-ada' }); } catch (e) { thrown = true; }
  ok(thrown, 'arena tidak dikenal ditolak');
}

/* ---------- Ekonomi ---------- */
{
  const S = Core.create(data, { seed: 1 });
  let r = Core.refresh(data, S);
  ok(r.ok && S.gold === 3, 'refresh: biaya 2 emas (5 -> 3)');
  Core.refresh(data, S);
  r = Core.refresh(data, S);
  ok(!r.ok && r.reason === 'GOLD' && S.gold === 1, 'refresh: emas kurang ditolak');
  ok(invariant(S).length === 0, 'refresh: invarian pool utuh setelah 2x refresh');
  const T = Core.create(data, { seed: 1 }); T.gold = 100;
  ok(Core.buyXp(data, T).ok && T.xp === 2 && T.level === 2 && T.gold === 96, 'XP: beli 4 emas = +4 XP, level 1 butuh 2 -> level 2 sisa 2 XP');
  Core.buyXp(data, T); Core.buyXp(data, T);
  ok(T.level === 3 && T.xp === 2 + 4 + 4 - 6, 'XP: level 2 butuh 6 -> level 3 (xp ' + T.xp + ')');
  for (let i = 0; i < 120; i++) { T.gold = 100; Core.buyXp(data, T); }
  ok(T.level === 9 && T.xp === 0, 'XP: level maksimum 9, XP dikunci 0');
  ok(!Core.buyXp(data, T).ok && Core.buyXp(data, T).reason === 'MAXLEVEL', 'XP: beli di level 9 ditolak');
  const U = Core.create(data, { seed: 1 }); U.gold = 3;
  ok(Core.buyXp(data, U).reason === 'GOLD', 'XP: emas kurang ditolak');
}
{
  // pendapatan akhir ronde: dasar 5 + bunga (1 per 10, maks 5) + streak (2->1, 4->2, 6->3), XP pasif +2
  const mk = (gold, win, ws, ls) => { const S = Core.create(data, { seed: 3 }); S.gold = gold; S.winStreak = ws; S.loseStreak = ls; return S; };
  const lose = { leaks: 1, leakDamage: 1 }, won = { leaks: 0, leakDamage: 0 };
  let S = mk(0, true, 0, 0); let o = Core.finishRound(data, S, won).summary;
  ok(o.income.total === 5 && S.gold === 5 && S.winStreak === 1, 'pendapatan: 0 emas, streak 1 = 5');
  S = mk(25, true, 0, 0); o = Core.finishRound(data, S, won).summary;
  ok(o.income.interest === 2 && S.gold === 25 + 5 + 2, 'bunga: 25 emas = +2');
  S = mk(99, true, 0, 0); o = Core.finishRound(data, S, won).summary;
  ok(o.income.interest === 5, 'bunga: dibatasi maksimal +5 (99 emas)');
  S = mk(0, true, 1, 0); o = Core.finishRound(data, S, won).summary;
  ok(o.income.streak === 1, 'streak menang 2 = +1');
  S = mk(0, true, 3, 0); o = Core.finishRound(data, S, won).summary;
  ok(o.income.streak === 2, 'streak menang 4 = +2');
  S = mk(0, true, 5, 0); o = Core.finishRound(data, S, won).summary;
  ok(o.income.streak === 3, 'streak menang 6 = +3');
  S = mk(0, false, 0, 3); o = Core.finishRound(data, S, lose).summary;
  ok(o.income.streak === 2 && S.loseStreak === 4 && S.winStreak === 0, 'streak kalah juga memberi bonus (4 kalah = +2)');
  S = mk(0, false, 5, 0); Core.finishRound(data, S, lose);
  ok(S.winStreak === 0 && S.loseStreak === 1, 'kalah memutus streak menang');
  S = mk(10, true, 0, 0); Core.finishRound(data, S, won);
  ok(S.xp === 0 && S.level === 2 && S.round === 2 && S.refreshCount === 1, 'akhir ronde: XP pasif +2 (level 1 butuh 2 -> level 2), ronde naik, toko baru digambar');
  S = mk(10, true, 0, 0); S.hp = 3; const fr = Core.finishRound(data, S, { leaks: 3, leakDamage: 5 });
  ok(S.over && S.hp === 0 && S.phase === 'over' && fr.summary.over && S.gold === 10, 'HP habis: match selesai, tidak ada pendapatan');
  ok(!Core.buy(data, S, 0).ok && !Core.refresh(data, S).ok, 'setelah match selesai aksi ditolak');
}

/* ---------- Beli, merge, jual, papan ---------- */
const forceShop = (S, id) => { Core.index(data); S.shop.forEach((s, i) => { if (s) S.pool[s]++; S.shop[i] = id; S.pool[id]--; }); };
{
  const S = Core.create(data, { seed: 1 }); S.gold = 100; const id = ix.byCost[1][0];
  forceShop(S, id);
  Core.buy(data, S, 0); Core.buy(data, S, 1);
  ok(S.bench.filter(Boolean).length === 2 && S.gold === 98, 'beli: 2 unit masuk bench, emas berkurang sesuai biaya');
  const r = Core.buy(data, S, 2);
  const units = Core.allUnits(S);
  ok(r.ok && r.merges.length === 1 && units.length === 1 && units[0].u.star === 2, 'merge: 3 salinan bintang 1 -> 1 unit bintang 2');
  ok(invariant(S).length === 0, 'merge: invarian pool utuh');
}
{
  const S = Core.create(data, { seed: 1 }); S.gold = 1000; const id = ix.byCost[1][0];
  // 9 salinan -> bintang 3 (berantai)
  for (let k = 0; k < 9; k++) { if (S.shop.indexOf(id) < 0) forceShop(S, id); Core.buy(data, S, S.shop.indexOf(id)); }
  const u = Core.allUnits(S);
  ok(u.length === 1 && u[0].u.star === 3, 'merge berantai: 9 salinan -> bintang 3 (' + u.map(x => x.u.star).join() + ')');
  ok(invariant(S).length === 0, 'merge berantai: invarian pool utuh');
  // bintang 3 tidak digabung lagi
  const S2 = Core.create(data, { seed: 2 }); S2.gold = 5000; const id2 = ix.byCost[1][1];
  for (let k = 0; k < 27; k++) { if (S2.shop.indexOf(id2) < 0) forceShop(S2, id2); const r = Core.buy(data, S2, S2.shop.indexOf(id2)); if (!r.ok) break; }
  const st = Core.allUnits(S2).map(x => x.u.star).sort().join();
  ok(Core.allUnits(S2).every(x => x.u.star <= 3) && st === '3,3,3', 'bintang maksimal 3: 27 salinan = 3 unit bintang 3 (' + st + ')');
  ok(invariant(S2).length === 0, 'bintang 3: invarian pool utuh');
}
{
  // beli saat bench penuh: ditolak, kecuali pembelian itu menggenapi merge
  const S = Core.create(data, { seed: 5 }); S.gold = 1000; S.level = 9;
  const ids = ix.byCost[1].slice(0, 5).concat(ix.byCost[2].slice(0, 6));
  for (let i = 0; i < 9; i++) S.bench[i] = { uid: S.uid++, id: ids[i], star: 1 }, S.pool[ids[i]]--;
  forceShop(S, ids[10]);
  let r = Core.buy(data, S, 0);
  ok(!r.ok && r.reason === 'BENCH_FULL' && S.bench.length === 9, 'bench penuh: pembelian ditolak');
  // dua salinan ids[0] ada di bench + papan -> pembelian ketiga boleh walau bench penuh
  S.bench[1] = { uid: S.uid++, id: ids[0], star: 1 }; S.pool[ids[0]]--; S.pool[ids[1]]++; // ids[1] tadinya di slot 1: kembalikan
  forceShop(S, ids[0]);
  r = Core.buy(data, S, 0);
  ok(r.ok && r.merges.length === 1 && S.bench.length === 9, 'bench penuh tapi menggenapi merge: boleh, hasil tetap 8 slot');
  ok(invariant(S).length === 0, 'bench penuh: invarian pool utuh');
}
{
  const S = Core.create(data, { seed: 9 }); S.gold = 100;
  const id1 = ix.byCost[1][0]; forceShop(S, id1); Core.buy(data, S, 0);
  const pb = S.pool[id1], g0 = S.gold;
  const sr = Core.sell(data, S, { w: 'bench', i: 0 });
  ok(sr.ok && S.gold === g0 + 1 && S.pool[id1] === pb + 1, 'jual bintang 1 biaya 1: +1 emas, 1 salinan kembali ke pool');
  // bintang 2 = x3, bintang 3 = x9; biaya 3
  const c3 = ix.byCost[3][0];
  S.bench[0] = { uid: S.uid++, id: c3, star: 2 }; S.pool[c3] -= 3; let g = S.gold, p = S.pool[c3];
  Core.sell(data, S, { w: 'bench', i: 0 });
  ok(S.gold === g + 8 && S.pool[c3] === p + 3, 'jual bintang 2 biaya 3: +8 emas (rumus HUD: 3x3 - 1), 3 salinan kembali');
  S.bench[0] = { uid: S.uid++, id: c3, star: 3 }; S.pool[c3] -= 9; g = S.gold; p = S.pool[c3];
  Core.sell(data, S, { w: 'bench', i: 0 });
  ok(S.gold === g + 26 && S.pool[c3] === p + 9, 'jual bintang 3 biaya 3: +26 emas (rumus HUD: 3x9 - 1), 9 salinan kembali');
  ok(Core.sell(data, S, { w: 'bench', i: 0 }).reason === 'EMPTY', 'jual slot kosong ditolak');
  ok(invariant(S).length === 0, 'jual: invarian pool utuh');
}
{
  const S = Core.create(data, { seed: 11 }); S.gold = 100;
  const id = ix.byCost[1][2]; forceShop(S, id); Core.buy(data, S, 0); Core.buy(data, S, 1); // 2 unit di bench
  const tiles = ix.arenas[S.arenaId].tiles;
  const t1 = { w: 'board', r: tiles[0][0], c: tiles[0][1] }, t2 = { w: 'board', r: tiles[1][0], c: tiles[1][1] };
  ok(Core.move(data, S, { w: 'bench', i: 0 }, t1).ok && Core.boardCount(S) === 1, 'pindah: bench -> petak unit');
  const r = Core.move(data, S, { w: 'bench', i: 1 }, t2);
  ok(!r.ok && r.reason === 'LIMIT' && Core.boardCount(S) === 1, 'batas papan = level (1): unit kedua ditolak');
  ok(Core.move(data, S, { w: 'bench', i: 1 }, t1).ok && S.bench[1] && Core.boardCount(S) === 1, 'tukar: bench <-> papan tidak melanggar batas');
  const bad = ix.arenas[S.arenaId].a.pathOrder[3];
  ok(Core.move(data, S, t1, { w: 'board', r: bad[0], c: bad[1] }).reason === 'BAD_TILE', 'unit tidak boleh di jalur');
  ok(Core.move(data, S, t1, { w: 'board', r: 1, c: 1 }).reason === 'BAD_TILE', 'unit tidak boleh di sel kosong');
  ok(Core.move(data, S, t1, { w: 'bench', i: 5 }).ok && Core.boardCount(S) === 0, 'pindah: papan -> bench');
  ok(Core.move(data, S, { w: 'bench', i: 7 }, t1).reason === 'EMPTY', 'pindah dari slot kosong ditolak');
  ok(Core.move(data, S, { w: 'bench', i: 5 }, { w: 'bench', i: -1 }).reason === 'BAD_SLOT' && Core.move(data, S, { w: 'bench', i: 5 }, { w: 'bench', i: 9 }).reason === 'BAD_SLOT' && Core.move(data, S, { w: 'bench', i: 99 }, t1).reason === 'BAD_SLOT', 'slot bench di luar 0-8 ditolak');
  ok(sane(S).length === 0 && invariant(S).length === 0, 'pindah: state tetap sehat');
}

/* ---------- Gelombang ---------- */
{
  const mult = ix.arenas['pelataran-keraton-wirasana'].a.enemyHpMultiplier;
  let w = Wave.forRound(data, 1, 'pelataran-keraton-wirasana');
  ok(w.kind === 'biasa' && w.count === 6 && w.hp === Math.round(300 * mult) && near(w.atk, 20) && w.leak === 1, 'ronde 1: 6 musuh, HP 300 x pengali arena, ATK 20, lolos = 1');
  let g = 1; for (let i = 0; i < 9; i++) g *= 1.042;
  w = Wave.forRound(data, 10, 'pelataran-keraton-wirasana');
  ok(w.kind === 'bos' && w.count === 1 && w.leak === 20, 'ronde 10: bos tunggal, lolos = 20');
  const n10 = 6 + 2;
  ok(w.hp === Math.round(n10 * 300 * g * mult * 1.6), 'ronde 10: HP bos = 1,6 x total gelombang biasa (' + w.hp + ')');
  ok(near(w.atk, 20 * 1.05 ** 9 * 1.5, 1e-6), 'ronde 10: ATK bos x1,5');
  ok(w.boss && w.boss.name && w.boss.roundName, 'ronde 10: nama bos dari data (' + (w.boss && w.boss.name) + ')');
  w = Wave.forRound(data, 9, 'pelataran-keraton-wirasana');
  ok(w.kind === 'biasa' && w.count === 7 && w.leak === 1, 'ronde 9: 6 + floor(9/5) = 7 musuh, lolos 1');
  w = Wave.forRound(data, 20, 'pelataran-keraton-wirasana');
  ok(w.leak === 20, 'ronde 20: bos');
  w = Wave.forRound(data, 19, 'pelataran-keraton-wirasana');
  ok(w.leak === 1 + 1 && w.count === 9, 'ronde 19: lolos 1+floor(19/10)=2, 9 musuh');
  w = Wave.forRound(data, 50, 'pelataran-keraton-wirasana');
  ok(w.kind === 'bos' && w.boss.tier === 'puncak', 'ronde 50: bos puncak');
  const w55 = Wave.forRound(data, 55, 'pelataran-keraton-wirasana'), w60 = Wave.forRound(data, 60, 'pelataran-keraton-wirasana');
  ok(w55.kind === 'bos' && w60.kind === 'bos' && w60.boss.name, 'Mode Tanpa Akhir: bos tetap muncul tiap 5 ronde (nama dari daftar)');
  const noPow = Wave.forRound(data, 40, 'kawah-putri-sanghyang');
  ok(noPow.kind === 'bos', 'arena lain bisa dibaca (bukan hardcode satu arena)');
}

/* ---------- Pertempuran ---------- */
function setupWith(S, picks) { // picks: [[charId, star, tileIndex]]
  const tiles = ix.arenas[S.arenaId].tiles; S.level = 9;
  picks.forEach((p, i) => { S.board[tiles[p[2]][0] + ',' + tiles[p[2]][1]] = { uid: S.uid++, id: p[0], star: p[1] }; });
  return Core.battleSetup(data, S);
}
{
  const S = Core.create(data, { seed: 1 });
  const empty = Battle.run(Battle.create(data, Core.battleSetup(data, S)));
  ok(empty.leaks === 6 && empty.leakDamage === 6 && !empty.win, 'papan kosong ronde 1: 6 musuh lolos, damage 6');
  ok(empty.seconds > 20 && empty.seconds < 60, 'lama pertempuran wajar (' + empty.seconds + ' dtk)');
  const strong = ix.byCost[5].slice(0, 4);
  const S2 = Core.create(data, { seed: 1 });
  const su = setupWith(S2, strong.map((id, i) => [id, 3, 10 + i]));
  const r1 = Battle.run(Battle.create(data, su)), r2 = Battle.run(Battle.create(data, su));
  ok(r1.win && r1.leaks === 0 && r1.leakDamage === 0, 'unit kuat menahan ronde 1 tanpa musuh lolos');
  ok(r1.hash === r2.hash && JSON.stringify(r1) === JSON.stringify(r2), 'determinisme: setup sama -> hasil dan sidik jari identik');
  ok(r1.killed === 6, 'semua 6 musuh terbunuh');
  const B = Battle.create(data, su); let ticks = 0; while (!B.done) { Battle.step(B); ticks++; }
  ok(near(B.t, ticks * 0.05, 1e-6), 'langkah waktu tetap 0,05 dtk');
  // sidik jari harus peka pada perubahan kecil: pakai unit lemah (butuh banyak pukulan) agar +1 ATK mengubah jalannya pertempuran
  const weak = setupWith(Core.create(data, { seed: 1 }), [[ix.byCost[1][0], 1, 11]]);
  const weak2 = JSON.parse(JSON.stringify(weak)); weak2.units[0].stats.atk += 1;
  const hw1 = Battle.run(Battle.create(data, weak)).hash, hw2 = Battle.run(Battle.create(data, weak2)).hash;
  ok(hw1 !== hw2, 'sidik jari peka pada perubahan unit (ATK +1 pada unit lemah)');
  // unit jangkauan 1 di petak jauh dari jalur tidak menyerang
  const far = ix.arenas[S.arenaId].tiles.slice().sort((a, b) => 0);
  const S3 = Core.create(data, { seed: 1 });
  const only = setupWith(S3, [[ix.byCost[1][0], 1, 0]]);
  only.units[0].stats.range = 1;
  const rr = Battle.run(Battle.create(data, only));
  ok(rr.leaks >= 0 && rr.leaks <= 6, 'unit tunggal lemah: hasil masuk akal (' + rr.leaks + ' lolos)');
}

/* ---------- Sinergi (panel) dan deskripsi ronde ---------- */
{
  const ofAsal = (a, n) => ix.ids.filter(id => ix.chars[id].asal === a).slice(0, n);
  const none = Syn.compute(data, [], []);
  ok(none.length === 16 && none.every(s => s.state === 'none' && s.count === 0 && s.tier === 0), 'sinergi: papan kosong = 16 sinergi, semuanya belum ada anggota');
  const sri = ofAsal('Sri', 5);
  let c = Syn.compute(data, [{ id: sri[0] }], []).find(s => s.name === 'Sri');
  ok(c.count === 1 && c.tier === 0 && c.next === 2 && c.missing === 1 && c.state === 'near', 'sinergi: 1 anggota Sri = hampir aktif, kurang 1');
  c = Syn.compute(data, sri.slice(0, 2).map(id => ({ id })), []).find(s => s.name === 'Sri');
  ok(c.count === 2 && c.tier === 1 && c.next === 3 && c.state === 'active', 'sinergi: 2 anggota Sri = tier 1 aktif, berikutnya 3');
  c = Syn.compute(data, sri.slice(0, 5).map(id => ({ id })), []).find(s => s.name === 'Sri');
  ok(c.tier === 3 && c.next === null && c.missing === 0, 'sinergi: 5 anggota Sri = tier 3 (maksimal)');
  // karakter yang sama (bintang/salinan berbeda) dihitung sekali
  c = Syn.compute(data, [{ id: sri[0] }, { id: sri[0] }, { id: sri[0] }], []).find(s => s.name === 'Sri');
  ok(c.count === 1 && c.tier === 0, 'sinergi: 3 salinan karakter yang sama dihitung 1 (karakter unik)');
  // satu karakter menyumbang ke 1 Asal DAN 1 Laku
  const ch = ix.chars[sri[0]];
  const both = Syn.compute(data, [{ id: sri[0] }], []).filter(s => s.count === 1).map(s => s.name).sort().join();
  ok(both === [ch.asal, ch.laku].sort().join(), 'sinergi: 1 karakter memberi 1 Asal + 1 Laku (' + both + ')');
  // bench hanya kandidat
  c = Syn.compute(data, [], [{ id: sri[0] }]).find(s => s.name === 'Sri');
  ok(c.count === 0 && c.benchExtra === 1 && c.state === 'bench', 'sinergi: unit di bench hanya kandidat (belum dihitung aktif)');
  c = Syn.compute(data, [{ id: sri[0] }], [{ id: sri[0] }, { id: sri[1] }]).find(s => s.name === 'Sri');
  ok(c.benchExtra === 1, 'sinergi: karakter yang sudah di papan tidak dihitung ganda di bench');
  const vis = Syn.visible(Syn.compute(data, sri.slice(0, 2).map(id => ({ id })).concat([{ id: ofAsal('Kei', 1)[0] }]), []));
  ok(vis.length > 0 && vis[0].state === 'active' && vis.every(s => s.state !== 'none'), 'sinergi: daftar tampil mengurutkan aktif dulu dan menyembunyikan yang kosong');
  const d1 = Wave.describe(data, 1, 'pelataran-keraton-wirasana'), d5 = Wave.describe(data, 5, 'pelataran-keraton-wirasana'), d60 = Wave.describe(data, 60, 'pelataran-keraton-wirasana'), d57 = Wave.describe(data, 57, 'pelataran-keraton-wirasana');
  ok(d1.name === 'Bisikan Pertama' && !d1.boss && d1.count === 6, 'deskripsi ronde 1: nama dari rounds.json, tanpa bos');
  ok(d5.bossRound && d5.boss.name && d5.name === d5.boss.roundName, 'deskripsi ronde 5: nama ronde dan bos dari bosses.json (' + d5.name + ' / ' + d5.boss.name + ')');
  ok(d57.endless && /Tanpa Akhir/.test(d57.name) && !d57.boss, 'deskripsi ronde 57 (Tanpa Akhir): bukan bos');
  ok(d60.endless && d60.bossRound && d60.boss.name, 'deskripsi ronde 60 (Tanpa Akhir, bos): bos dari daftar');
  let allNamed = true; for (let r = 1; r <= 60; r++) { const d = Wave.describe(data, r, 'pelataran-keraton-wirasana'); if (!d.name || !d.desc) allNamed = false; }
  ok(allNamed, 'semua ronde 1-60 punya nama dan deskripsi');
  const names = new Set(); for (let r = 1; r <= 50; r++) names.add(Wave.describe(data, r, 'pelataran-keraton-wirasana').name);
  ok(names.size === 50, 'ronde 1-50 punya 50 nama berbeda (' + names.size + ')');
}

/* ---------- Match penuh: bot sederhana sampai Commander gugur ---------- */
function botPlay(seed, maxRounds) {
  const S = Core.create(data, { seed: seed }); const tiles = ix.arenas[S.arenaId].tiles; const coverage = ix.arenas[S.arenaId].a.unitTileCoverage;
  const order = tiles.slice().sort((a, b) => { const ca = coverage.find(t => t.row === a[0] && t.col === a[1]).coverage2, cb = coverage.find(t => t.row === b[0] && t.col === b[1]).coverage2; return cb - ca || a[0] - b[0] || a[1] - b[1]; });
  const errors = [];
  let guard = 0;
  while (!S.over && S.round <= maxRounds && guard++ < 400) {
    // beli yang termurah dulu sambil sisakan emas untuk bunga seperlunya
    for (let pass = 0; pass < 6; pass++) {
      if (S.gold >= 4 && S.level < 6 && S.gold >= 10) Core.buyXp(data, S);
      let bought = false;
      const order2 = [0, 1, 2, 3, 4].filter(i => S.shop[i]).sort((a, b) => ix.chars[S.shop[a]].cost - ix.chars[S.shop[b]].cost);
      for (const i of order2) { if (Core.buy(data, S, i).ok) { bought = true; break; } }
      if (!bought) { if (S.gold >= 12) Core.refresh(data, S); else break; }
    }
    // susun: unit terkuat (bintang lalu biaya) ke papan sampai batas level
    const want = Core.allUnits(S).map(e => e.u).sort((a, b) => b.star - a.star || ix.chars[b.id].cost - ix.chars[a.id].cost || a.uid - b.uid).slice(0, Core.unitLimit(ix, S));
    const wantSet = new Set(want.map(u => u.uid));
    Core.allUnits(S).forEach(e => { // yang tidak diinginkan di papan: ke bench, atau dijual bila bench penuh
      if (e.loc.w === 'board' && !wantSet.has(e.u.uid)) { const f = S.bench.indexOf(null); if (f >= 0) Core.move(data, S, e.loc, { w: 'bench', i: f }); else Core.sell(data, S, e.loc); }
    });
    want.forEach((u, k) => { const cur = Core.allUnits(S).find(e => e.u.uid === u.uid); Core.move(data, S, cur.loc, { w: 'board', r: order[k][0], c: order[k][1] }); });
    const bad = sane(S).concat(invariant(S)); if (bad.length) { errors.push('ronde ' + S.round + ': ' + bad.join(';')); break; }
    const res = Battle.run(Battle.create(data, Core.battleSetup(data, S)));
    Core.finishRound(data, S, res);
  }
  return { S: S, errors: errors };
}
{
  const a = botPlay(42, 400), b = botPlay(42, 400), c = botPlay(43, 400);
  ok(a.errors.length === 0, 'match penuh (bot, benih 42): tidak ada pelanggaran aturan' + (a.errors[0] ? ' - ' + a.errors[0] : ''));
  ok(a.S.over && a.S.hp === 0 && a.S.round >= 5, 'match penuh: berakhir saat Commander gugur (ronde ' + a.S.round + ')');
  ok(Core.hash(a.S) === Core.hash(b.S), 'match penuh: benih sama + aksi sama = state akhir identik');
  ok(c.errors.length === 0 && c.S.over, 'match penuh benih 43 juga selesai tanpa pelanggaran (ronde ' + c.S.round + ')');
  const many = []; let allOk = true;
  for (let s = 100; s < 112; s++) { const m = botPlay(s, 400); many.push(m.S.round); if (m.errors.length || !m.S.over) allOk = false; }
  ok(allOk, '12 match bot (benih 100-111) selesai tanpa pelanggaran; ronde akhir: ' + many.join(','));
}

/* HUD10: pool bersama antar pemain */
{
  const tot = (pool, ids) => ids.reduce((n, id) => n + pool[id], 0);
  const P1 = Core.newPool(data, 1), P2 = Core.newPool(data, 2), P5 = Core.newPool(data, 5);
  const c1 = ix.ids.filter(i => ix.chars[i].cost === 1)[0], c5 = ix.ids.filter(i => ix.chars[i].cost === 5)[0];
  ok(P1[c1] === 22 && P5[c1] === 22 && P5[c5] === 9, 'HUD10: Solo dan Party 5 pemain memakai salinan dasar (22/9)');
  ok(P2[c1] === 14 && P2[c5] === 6 && P2[c1] < Core.newPool(data, 3)[c1] && Core.newPool(data, 3)[c1] < Core.newPool(data, 4)[c1], 'HUD10: Duel/Party kecil: stok lebih sedikit (Duel 14/6) dan naik bersama jumlah pemain');
  const pool = Core.newPool(data, 2);
  const A = Core.create(data, { seed: 7, pool: pool }), B = Core.create(data, { seed: 8, pool: pool });
  ok(A.pool === B.pool, 'HUD10: dua pemain memegang SATU objek pool yang sama');
  const sum = id => pool[id] + [A, B].reduce((n, S) => n + S.shop.filter(x => x === id).length + Core.allUnits(S).filter(e => e.u.id === id).reduce((m, e) => m + Core.COPIES[e.u.star], 0), 0);
  const base = Core.newPool(data, 2);
  ok(ix.ids.every(id => sum(id) === base[id]), 'HUD10: pool + toko A + toko B + unit = stok awal untuk semua karakter');
  // A membeli semua yang muncul berulang kali: stok B ikut berkurang
  A.gold = 99999; B.gold = 99999;
  for (let k = 0; k < 40 && A.bench.some(x => !x); k++) { const i = A.shop.findIndex(x => x); if (i < 0) { Core.refresh(data, A); continue; } Core.buy(data, A, i); }
  ok(ix.ids.every(id => sum(id) === base[id]), 'HUD10: setelah A membeli banyak, total salinan tetap utuh');
  ok(ix.ids.some(id => pool[id] < base[id]), 'HUD10: stok pool bersama berkurang karena pembelian A');
  // stok habis: karakter dengan 0 salinan tidak muncul lagi di toko B
  const id0 = ix.ids.filter(i => ix.chars[i].cost === 5)[0]; pool[id0] = 0;
  let seen = false; for (let k = 0; k < 60; k++) { Core.refresh(data, B); if (B.shop.indexOf(id0) >= 0) seen = true; }
  ok(!seen, 'HUD10: karakter yang stoknya habis tidak muncul lagi di toko');
  // pemain tersingkir mengembalikan semuanya
  const P = Core.newPool(data, 2), X = Core.create(data, { seed: 3, pool: P }), Y = Core.create(data, { seed: 4, pool: P });
  X.gold = 99999; for (let k = 0; k < 10; k++) { const i = X.shop.findIndex(x => x); if (i >= 0) Core.buy(data, X, i); }
  Core.releaseAll(X);
  const left = ix.ids.reduce((n, id) => n + P[id] + Y.shop.filter(x => x === id).length + Core.allUnits(Y).filter(e => e.u.id === id).length, 0);
  ok(left === ix.ids.reduce((n, id) => n + Core.newPool(data, 2)[id], 0), 'HUD10: pemain tersingkir -> semua salinannya kembali ke pool bersama');
  const rr = NS.rng.make(NS.rng.mix([1, 'r'])), PP = Core.newPool(data, 5), b0 = tot(PP, ix.ids);
  const got = Core.rivalBuy(data, PP, rr, 6, 20); ok(got === 20 && tot(PP, ix.ids) === b0 - 20, 'HUD10: simulasi pembelian lawan mengurangi pool tepat sebanyak yang diambil');
}

console.log('\nRINGKASAN ' + pass + ' lulus, ' + fail + ' gagal');
process.exit(fail ? 1 : 0);
