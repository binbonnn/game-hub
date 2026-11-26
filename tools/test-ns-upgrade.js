/* Uji upgrade bintang manual (G5-HUD): Upgrade Otomatis hidup (bawaan, sama seperti Game 5 lama) vs mati (tombol Upgrade + slot 'baru dibeli').
   Jalankan dari folder proyek: node tests/nusantara-upgrade.test.js */
const fs = require('fs'), path = require('path');
const S0 = require('../js/data/ns-schema.js');
const NS = require('../js/data/ns-rng.js');
['ns-core', 'ns-synergy', 'ns-battle'].forEach(f => require('../js/data/' + f + '.js'));
const Core = NS.Core;
const data = {}; S0.FILES.forEach(f => data[f] = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/nusantara', f + '.json'), 'utf8')));
const ix = Core.index(data);
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };
const ID = ix.byCost[1][0];
function put(S, id, n, w) { for (let i = 0; i < n; i++) { S.pool[id]--; const u = { uid: S.uid++, id: id, star: 1 }; if (w === 'bench') S.bench[S.bench.indexOf(null)] = u; else { const t = ix.arenas[S.arenaId].tiles[Object.keys(S.board).length]; S.board[t[0] + ',' + t[1]] = u; } } }
function shopWith(S, id, slot) { if (S.shop[slot]) S.pool[S.shop[slot]]++; S.shop[slot] = id; S.pool[id]--; }
const total = (S, id) => S.pool[id] + S.shop.filter(x => x === id).length + Core.allUnits(S).reduce((a, e) => a + (e.u.id === id ? [0, 1, 3, 9][e.u.star] : 0), 0);
const initial = id => ix.eco.poolByCost[ix.chars[id].cost].copiesPerCharacter;

// 1. bawaan: otomatis (perilaku Game 5 lama)
{ const S = Core.create(data, { seed: 1 }); ok(S.autoUpgrade === true && S.pending === null, 'bawaan: Upgrade Otomatis hidup, tidak ada Titisan "baru dibeli"');
  put(S, ID, 2, 'bench'); S.gold = 50; shopWith(S, ID, 0); const r = Core.buy(data, S, 0);
  ok(r.ok && r.merges.length === 1 && Core.allUnits(S).filter(e => e.u.id === ID && e.u.star === 2).length === 1, 'otomatis: membeli salinan ke-3 langsung jadi bintang 2'); }
// 2. manual: beli tidak menggabung, group tersedia
{ const S = Core.create(data, { seed: 1, autoUpgrade: false }); put(S, ID, 2, 'bench'); S.gold = 50; shopWith(S, ID, 0);
  const r = Core.buy(data, S, 0);
  ok(r.ok && r.merges.length === 0 && Core.allUnits(S).filter(e => e.u.id === ID && e.u.star === 1).length === 3, 'manual: membeli salinan ke-3 TIDAK langsung menggabung');
  const g = Core.upgradeGroups(S); ok(g.length === 1 && g[0].id === ID && g[0].star === 1 && g[0].locs.length === 3, 'manual: kelompok upgrade terdeteksi (3 salinan)');
  const u = Core.upgrade(data, S, ID, 1); ok(u.ok && u.merges[0].star === 2 && Core.allUnits(S).filter(e => e.u.id === ID).length === 1, 'manual: tombol Upgrade menggabung 3 jadi 1 bintang 2');
  ok(Core.upgrade(data, S, ID, 1).reason === 'NO_UPGRADE', 'upgrade lagi tanpa kelompok: ditolak (NO_UPGRADE)'); }
// 3. manual: bench penuh -> slot "baru dibeli"
{ const S = Core.create(data, { seed: 1, autoUpgrade: false });
  const others = ix.ids.filter(i => i !== ID); for (let i = 0; i < 7; i++) { S.bench[i] = { uid: S.uid++, id: others[i], star: 1 }; }
  put(S, ID, 2, 'bench'); ok(S.bench.indexOf(null) < 0, 'bench penuh (9)');
  S.gold = 50; shopWith(S, ID, 0); shopWith(S, others[10], 1);
  const bad = Core.buy(data, S, 1); ok(bad.ok === false && bad.reason === 'BENCH_FULL', 'bench penuh: pembelian yang tidak melengkapi upgrade ditolak');
  const r = Core.buy(data, S, 0); ok(r.ok && S.pending && S.pending.id === ID, 'bench penuh: pembelian yang melengkapi upgrade masuk slot "baru dibeli"');
  ok(Core.upgradeGroups(S).length === 1, 'titisan "baru dibeli" ikut terhitung dalam upgrade');
  shopWith(S, ID, 2); const r2 = Core.buy(data, S, 2); ok(r2.ok === false, 'hanya 1 slot "baru dibeli": pembelian kedua ditolak');
  const g = Core.upgrade(data, S, ID, 1); ok(g.ok && S.pending === null && S.bench.filter(b => b && b.id === ID && b.star === 2).length === 1, 'upgrade memakai Titisan "baru dibeli" dan mengosongkan slotnya');
  ok(total(S, ID) === initial(ID), 'pool + toko + milik = jumlah awal (' + total(S, ID) + ')'); }
// 4. pending otomatis pindah ke bench saat ada slot kosong; bisa dijual
{ const S = Core.create(data, { seed: 1, autoUpgrade: false }); const others = ix.ids.filter(i => i !== ID);
  for (let i = 0; i < 7; i++) S.bench[i] = { uid: S.uid++, id: others[i], star: 1 }; put(S, ID, 2, 'bench'); S.gold = 50; shopWith(S, ID, 0); Core.buy(data, S, 0);
  const gold0 = S.gold; const sl = Core.sell(data, S, { w: 'bench', i: 0 }); ok(sl.ok && S.pending === null && S.bench[0] && S.bench[0].id === ID, 'jual Titisan Bench: "baru dibeli" otomatis pindah ke slot kosong');
  const S2 = Core.create(data, { seed: 1, autoUpgrade: false }); for (let i = 0; i < 7; i++) S2.bench[i] = { uid: S2.uid++, id: others[i], star: 1 }; put(S2, ID, 2, 'bench'); S2.gold = 50; shopWith(S2, ID, 0); Core.buy(data, S2, 0);
  const g0 = S2.gold; const sp = Core.sell(data, S2, { w: 'pending' }); ok(sp.ok && S2.pending === null && S2.gold === g0 + ix.chars[ID].cost, 'jual Titisan "baru dibeli" memberi harga jual yang sama'); }
// 5. saklar: menyalakan otomatis menjalankan upgrade tertunda
{ const S = Core.create(data, { seed: 1, autoUpgrade: false }); put(S, ID, 3, 'bench'); ok(Core.upgradeGroups(S).length === 1 && S.autoUpgrade === false, 'manual: 3 salinan menunggu');
  const r = Core.setAutoUpgrade(data, S, true); ok(r.merges.length === 1 && S.autoUpgrade === true && Core.upgradeGroups(S).length === 0, 'menyalakan Upgrade Otomatis langsung menjalankan upgrade yang tertunda'); }
// 6. berantai: 9 salinan manual perlu 4 kali tekan (3 + lalu bintang 2)
{ const S = Core.create(data, { seed: 1, autoUpgrade: false }); put(S, ID, 3, 'bench'); put(S, ID, 3, 'bench'); const S2 = S;
  Core.upgrade(data, S2, ID, 1); Core.upgrade(data, S2, ID, 1); ok(Core.upgradeGroups(S2).length === 0 && Core.allUnits(S2).filter(e => e.u.id === ID && e.u.star === 2).length === 2, 'dua upgrade ★1 menghasilkan 2 Titisan ★2; belum ada kelompok baru (butuh 3 ★2)'); }
// 7. saat pupuh: manual hanya Bench; Sasana tidak disentuh
{ const S = Core.create(data, { seed: 1, autoUpgrade: false }); put(S, ID, 1, 'board'); put(S, ID, 2, 'bench'); S.phase = 'battle';
  ok(Core.upgradeGroups(S, true).length === 0, 'pupuh: Titisan Sasana tidak ikut kelompok upgrade'); ok(Core.upgrade(data, S, ID, 1).reason === 'NO_UPGRADE', 'pupuh: upgrade lintas Sasana ditolak');
  S.phase = 'prep'; ok(Core.upgrade(data, S, ID, 1).ok, 'persiapan: upgrade lintas Sasana dan Bench diterima'); }
// 8. akhir ronde: manual tidak menggabung otomatis
{ const S = Core.create(data, { seed: 1, autoUpgrade: false }); put(S, ID, 3, 'bench'); Core.finishRound(data, S, { leaks: 0, leakDamage: 0, killed: 6, seconds: 5, win: true });
  ok(Core.upgradeGroups(S).length === 1, 'manual: akhir ronde tidak menggabung sendiri');
  const A = Core.create(data, { seed: 1 }); put(A, ID, 3, 'bench'); A.phase = 'battle'; Core.finishRound(data, A, { leaks: 0, leakDamage: 0, killed: 6, seconds: 5, win: true }); ok(Core.upgradeGroups(A).length === 0, 'otomatis: akhir ronde menggabung yang tertunda (seperti sebelumnya)'); }
// 9. hash berubah menurut mode / pending
{ const a = Core.create(data, { seed: 1 }), b = Core.create(data, { seed: 1, autoUpgrade: false }); ok(Core.hash(a) !== Core.hash(b), 'hash state membedakan mode upgrade'); }
console.log('\nRINGKASAN ' + pass + ' lulus, ' + fail + ' gagal'); process.exit(fail ? 1 : 0);
