/* Uji ns-match (Fase 6 langkah 1): lobi, match Duel/Party/Co-op, autopilot, keluar, Ronde Ekstrem, skor, determinisme.
   Jalankan dari folder proyek: node tests/nusantara-match.test.js */
const fs = require('fs'), path = require('path');
const S0 = require('../js/data/ns-schema.js');
const NS = require('../js/data/ns-rng.js');
['ns-core', 'ns-battle', 'ns-synergy', 'ns-match'].forEach(f => require('../js/data/' + f + '.js'));
const Mt = NS.Match, Core = NS.Core;
const data = {}; S0.FILES.forEach(f => data[f] = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/nusantara', f + '.json'), 'utf8')));
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };
function room(mode, names, seed, hp) {
    const r = Mt.createRoom({ code: 'AB12', mode: mode, host: names[0], seed: seed || 5 }).room;
    names.slice(1).forEach(n => Mt.addPlayer(r, n));
    names.forEach(n => { Mt.setReady(r, n, true); if (hp) Mt.setHandicap(r, names[0], n, { hp: hp }); });
    return r;
}

/* ---------- lobi ---------- */
{
    ok(!Mt.createRoom({ code: 'AB', mode: 'duel', host: 'A' }).ok && !Mt.createRoom({ code: 'ABCDEFG', mode: 'duel', host: 'A' }).ok && Mt.createRoom({ code: 'ab12', mode: 'duel', host: 'A' }).reason === 'BAD_CODE', 'Kode room harus 4-6 huruf besar/angka');
    ok(Mt.createRoom({ code: 'AB12', mode: 'x', host: 'A' }).reason === 'BAD_MODE', 'Mode tidak dikenal ditolak');
    const r = Mt.createRoom({ code: 'AB12', mode: 'duel', host: ' Budi ' }).room;
    ok(Mt.addPlayer(r, 'BUDI').reason === 'DUP_NAME' && Mt.addPlayer(r, '  budi').reason === 'DUP_NAME', 'Nama identik (tanpa peka huruf besar-kecil, spasi pinggir dibuang) ditolak');
    ok(Mt.addPlayer(r, 'Sari').ok && Mt.addPlayer(r, 'Dewi').reason === 'FULL', 'Duel tepat 2 pemain: ketiga ditolak');
    ok(Mt.addPlayer(r, 'a.b').reason === 'NO_NAME' && Mt.addPlayer(r, 'x'.repeat(17)).reason === 'NO_NAME' && Mt.addPlayer(r, '   ').reason === 'NO_NAME', 'Nama harus 1-16 karakter tanpa . / [ ] * ~ `');
    ok(Mt.canStart(r).reason === 'NOT_READY', 'Belum siap = belum bisa mulai');
    const p = Mt.createRoom({ code: 'PARTY', mode: 'party', host: 'A' }).room; Mt.addPlayer(p, 'B'); Mt.setReady(p, 'A', true); Mt.setReady(p, 'B', true);
    ok(Mt.canStart(p).reason === 'COUNT', 'Party butuh minimal 3 pemain');
    ['C', 'D', 'E'].forEach(n => Mt.addPlayer(p, n)); ok(Mt.addPlayer(p, 'F').reason === 'FULL' && p.order.length === 5, 'Pemain keenam ditolak');
    ok(Mt.setHandicap(p, 'B', 'C', { gold: 3 }).reason === 'NOT_HOST' && Mt.setHandicap(p, 'A', 'C', { gold: 3, hp: 20 }).ok, 'Handicap hanya host');
}

/* ---------- mulai match ---------- */
{
    const a = Mt.start(data, room('party', ['A', 'B', 'C'], 7)).match, b = Mt.start(data, room('party', ['A', 'B', 'C'], 7)).match, c = Mt.start(data, room('party', ['A', 'B', 'C'], 8)).match;
    ok(a.arenaId === b.arenaId && !!NS.Core.index(data).arenas[a.arenaId], 'Arena dipilih dari seed room: sama untuk seed sama');
    const seen = new Set(); for (let s = 1; s <= 40; s++) seen.add(Mt.start(data, room('duel', ['A', 'B'], s)).match.arenaId);
    ok(seen.size >= 5, 'Seed berbeda memberi arena beragam (' + seen.size + ' dari 9 dalam 40 seed)');
    const r = room('duel', ['A', 'B'], 3); Mt.setHandicap(r, 'A', 'B', { gold: 4, hp: 30 }); const M = Mt.start(data, r).match;
    const SA = Mt.playerSession(data, M, 'a'), SB = Mt.playerSession(data, M, 'B');
    ok(SB.gold === SA.gold + 4 && SB.hp === SA.hp + 30 && SB.maxHp === SB.hp, 'Handicap: emas awal dan HP Commander tambahan');
    ok(SA.seed === SB.seed && SA.arenaId === SB.arenaId && SA.shop.join() === SB.shop.join(), 'Seed dan arena sama = toko awal sama');
    ok(Mt.start(data, r).reason === 'STARTED', 'Room yang sudah mulai tidak bisa dimulai lagi');
}

/* ---------- autopilot ---------- */
{
    const M = Mt.start(data, room('duel', ['A', 'B'], 11)).match, S = Mt.playerSession(data, M, 'A');
    const g0 = S.gold, setup = Mt.autopilot(data, S);
    ok(S.gold < g0 && setup.units.length >= 1 && setup.units.every(u => !!Core.index(data).arenas[M.arenaId].tileSet[u.r + ',' + u.c]), 'Autopilot membeli dan menaruh unit hanya di petak unit');
    const S2 = Mt.playerSession(data, M, 'A');
    ok(JSON.stringify(Mt.autopilot(data, S2)) === JSON.stringify(setup), 'Autopilot deterministik');
    ok(Core.hash(S) === Core.hash(S2), 'Hash state sama setelah autopilot');
}

/* ---------- Duel penuh: yang punya autopilot vs papan kosong ---------- */
function playDuel(seed) {
    const M = Mt.start(data, room('duel', ['A', 'B'], seed)).match, SA = Mt.playerSession(data, M, 'A');
    let guard = 0;
    while (!M.ended && guard++ < 70) {
        const setups = { a: Mt.autopilot(data, SA) }; // B tak pernah kirim = papan kosong
        const res = Mt.resolveRound(data, M, setups);
        Core.finishRound(data, SA, res.results.a);
        if (SA.pusakaOffer) Core.choosePusaka(data, SA, SA.pusakaOffer[0]);
    }
    return M;
}
{
    const M = playDuel(21), M2 = playDuel(21);
    ok(M.ended && M.winners.join() === 'a' && M.reason === 'LAST_STANDING', 'Duel: pemain papan kosong gugur, pemain aktif menang (ronde ' + M.lastRound + ')');
    ok(JSON.stringify(M) === JSON.stringify(M2), 'Match deterministik: dua kali main = state sama persis');
    const rk = Mt.ranking(M); ok(rk[0].name === 'A' && rk[0].rank === 1 && rk[1].rank === 2, 'Peringkat: pemenang 1, yang gugur 2');
    const sa = Mt.score(M, 'A'), sb = Mt.score(M, 'B');
    ok(sa === rk[0].round * 100 + M.players.a.hp * 5 + 200 && sb === rk[1].round * 100 + 0, 'Skor = ronde x100 + HP x5 + bonus Duel menang +200 (' + sa + ' vs ' + sb + ')');
    ok(M.players.b.outRound >= 1 && M.players.b.hp === 0, 'Pemain yang gugur tercatat ronde gugurnya');
}

/* ---------- keluar sukarela dan koneksi ---------- */
{
    let M = Mt.start(data, room('duel', ['A', 'B'], 9)).match;
    Mt.leave(M, 'B');
    ok(M.ended && M.winners.join() === 'a' && M.reason === 'LAST_STANDING', 'Duel: lawan keluar = pemain tersisa menang');
    ok(Mt.score(M, 'A') === null && Mt.score(M, 'B') === null, 'Lawan keluar sebelum ronde 3: tanpa skor/bonus menang');
    M = Mt.start(data, room('duel', ['A', 'B'], 9)).match; const SA = Mt.playerSession(data, M, 'A');
    for (let i = 0; i < 4; i++) { const r = Mt.resolveRound(data, M, { a: Mt.autopilot(data, SA), b: Mt.autopilot(data, Mt.playerSession(data, M, 'B')) }); Core.finishRound(data, SA, r.results.a); }
    Mt.leave(M, 'B');
    ok(M.ended && M.lastRound === 4 && Mt.score(M, 'A') >= 400 + 200 && Mt.score(M, 'B') === null, 'Keluar setelah ronde 3: pemenang dapat skor + bonus; yang keluar hangus');
    const rk = Mt.ranking(M); ok(rk[rk.length - 1].name === 'B' && rk[rk.length - 1].state === 'quit', 'Pemain yang keluar di dasar peringkat');
    M = Mt.start(data, room('party', ['A', 'B', 'C'], 4)).match;
    Mt.setConnected(M, 'B', false); ok(Mt.autopilotKeys(M).join() === 'b', 'Pemain terputus diambil alih autopilot');
    Mt.setConnected(M, 'B', true); ok(Mt.autopilotKeys(M).length === 0, 'Masuk kembali: autopilot berhenti');
    Mt.leave(M, 'C'); ok(!M.ended && M.order.filter(k => M.players[k].state === 'alive').length === 2, 'Party tetap jalan walau pemain < 3');
    Mt.leave(M, 'B'); ok(M.ended && M.winners.join() === 'a', 'Party berhenti saat tersisa 1 pemain (menang)');
}

/* ---------- Party: peringkat dan bonus ---------- */
{
    const M = Mt.start(data, room('party', ['A', 'B', 'C', 'D'], 6)).match; let g = 0;
    M.players.a.hp = 100; M.players.b.hp = 130; M.players.c.hp = 170; M.players.d.hp = 250; // HP diatur langsung supaya selisih ronde gugur jelas
    while (!M.ended && g++ < 60) Mt.resolveRound(data, M, {}); // semua papan kosong: yang HP-nya lebih besar bertahan lebih lama
    const rk = Mt.ranking(M);
    ok(M.ended && rk.map(x => x.name).join('') === 'DCBA', 'Party: HP awal lebih besar bertahan lebih lama (urutan ' + rk.map(x => x.name).join('') + ')');
    ok(Mt.score(M, 'D') - rk[0].round * 100 - M.players.d.hp * 5 === 400 && Mt.score(M, 'C') - rk[1].round * 100 === 250 && Mt.score(M, 'B') - rk[2].round * 100 === 150, 'Bonus Party juara 1/2/3 = +400/+250/+150');
    ok(Mt.score(M, 'A') - rk[3].round * 100 === 0, 'Peringkat 4 tanpa bonus');
}

/* ---------- Ronde Ekstrem ---------- */
{
    const r = room('duel', ['A', 'B'], 13); const M = Mt.start(data, r).match; M.players.a.hp = M.players.b.hp = 5000;
    const SA = Mt.playerSession(data, M, 'A');
    M.round = 50; const rr = Mt.resolveRound(data, M, {});
    ok(M.extreme && M.extremeKeys.length === 2 && M.round === 51 && !M.ended, 'Seri HP di akhir ronde 50 memicu Ronde Ekstrem untuk yang seri');
    const w51 = NS.Battle.create(data, Object.assign(Core.battleSetup(data, SA), { round: 51, extreme: true })).wave, n51 = NS.Battle.create(data, Object.assign(Core.battleSetup(data, SA), { round: 51 })).wave;
    ok(w51.kind === 'bos' && w51.boss.tier === 'ekstrem' && w51.leak === 35 && n51.kind === 'biasa', 'Ronde 51 Ekstrem = Penjaga tier ekstrem (leak 35); tanpa penanda tetap gelombang biasa');
    const hp0 = Object.assign({}, { a: M.players.a.hp, b: M.players.b.hp });
    const seen = [51]; let g = 0; while (!M.ended && g++ < 8) { Mt.resolveRound(data, M, {}); seen.push(M.round); }
    ok(M.ended && M.reason === 'EXTREME_END' && M.lastRound === 55, 'Kelima ronde Ekstrem (51-55) dimainkan lalu match selesai');
    ok(M.winners.length === 2 && Mt.ranking(M).every(x => x.rank === 1), 'Seri HP dan waktu bos: peringkat dibagi');
    ok(Mt.score(M, 'A') === 55 * 100 + M.players.a.hp * 5 + 200, 'Ronde 51-55 dihitung dalam skor');
}
{
    const M = Mt.start(data, room('duel', ['A', 'B'], 13)).match; M.players.a.hp = 5040; M.players.b.hp = 5000; M.round = 50; Mt.resolveRound(data, M, {});
    ok(M.ended && M.reason === 'HP_AT_FINAL' && M.winners.join() === 'a', 'Akhir ronde 50 tanpa seri: HP tertinggi menang, tanpa Ronde Ekstrem');
}

/* ---------- Co-op ---------- */
{
    const M = Mt.start(data, room('coop', ['A', 'B', 'C'], 2)).match;
    ok(M.sharedHp === 300 && M.players.b.hp === 300, 'Co-op: HP Commander bersama = 100 x jumlah pemain');
    Mt.resolveRound(data, M, {});
    ok(M.sharedHp < 300 && M.players.a.hp === M.sharedHp && M.players.c.hp === M.sharedHp, 'Co-op: kebocoran semua pemain mengurangi HP bersama');
    let g = 0; while (!M.ended && g++ < 40) Mt.resolveRound(data, M, {});
    ok(M.ended && M.reason === 'SHARED_HP_ZERO' && M.winners.length === 0, 'Co-op: HP bersama habis = match berakhir tanpa pemenang');
    ok(Mt.score(M, 'A') !== null && Mt.score(M, 'A') === M.lastRound * 100, 'Co-op: skor tanpa bonus peringkat');
}

console.log('RINGKASAN ' + pass + ' lulus, ' + fail + ' gagal');
process.exit(fail ? 1 : 0);
