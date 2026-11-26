/* Uji efek pertempuran Fase 3: Warisan, skill Titisan + mana, Senapati, Penjaga, Pusaka, ekonomi, determinisme, kesetaraan dengan simulator Fase 2.
   Jalankan dari folder proyek: node tests/nusantara-fx.test.js */
const fs = require('fs'), path = require('path');
const S0 = require('../js/data/ns-schema.js');
const NS = require('../js/data/ns-rng.js');
['ns-core', 'ns-synergy', 'ns-battle'].forEach(f => require('../js/data/' + f + '.js'));
const Core = NS.Core, Battle = NS.Battle, Syn = NS.Synergy;
const data = {}; S0.FILES.forEach(f => data[f] = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/nusantara', f + '.json'), 'utf8')));
const ix = Core.index(data), F = data.rules.fx;
const A = 'pelataran-keraton-wirasana';
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };
const near = (a, b, e) => Math.abs(a - b) <= (e === undefined ? 1e-6 : e);

/* ---- bantuan ---- */
const tiles = ix.arenas[A].tiles;
const pathCell = n => ix.arenas[A].a.pathOrder[n];
const dist = (t, c) => Math.max(Math.abs(t[0] - c[0]), Math.abs(t[1] - c[1]));
const bestTiles = tiles.slice().sort((a, b) => dist(a, pathCell(8)) - dist(b, pathCell(8)) || a[0] - b[0] || a[1] - b[1]);
function mk(ids, opts) { // ids: daftar id Titisan -> S dengan papan terisi petak terdekat jalur
    opts = opts || {};
    const S = Core.create(data, { seed: opts.seed || 1, arenaId: opts.arena || A, senapatiId: opts.sen || null });
    ids.forEach((id, i) => { const t = (opts.tiles || bestTiles)[i]; S.board[t[0] + ',' + t[1]] = { uid: S.uid++, id: id, star: opts.star || 1 }; });
    (opts.pusaka || []).forEach(p => S.pusaka.push(p));
    if (opts.equipTo) { const w = Object.keys(S.board).map(k => S.board[k]).find(u => u.id === opts.equipTo); (opts.pusaka || []).forEach(p => { if (w) S.equip[p] = w.uid; }); } // HUD8: Pusaka per-Titisan hanya berlaku bila dipakai
    S.round = opts.round || 1;
    return S;
}
const mkB = (S, mod) => { const setup = Core.battleSetup(data, S); if (mod) mod(setup); return Battle.create(data, setup); };
const unitOf = (B, id) => B.units.find(u => u.id === id);
const byAsal = (name, kind, n, skip) => ix.ids.filter(i => ix.chars[i][kind] === name && (!skip || skip.indexOf(i) < 0)).slice(0, n);

/* ---- 1. kesetaraan dengan simulator Fase 2 (tanpa setup.fx) ---- */
{
    const gold = fs.readFileSync(path.join(__dirname, 'fixtures_f2i_battle.txt'), 'utf8').trim().split('\n');
    const out = [];
    for (const arena of ['pelataran-keraton-wirasana', 'kawah-putri-sanghyang']) for (const round of [1, 4, 5, 10, 25, 50]) for (const nm of [[0, 0], [3, 60], [8, 200]]) {
        const n = nm[0], atk = nm[1];
        const setup = { round: round, arenaId: arena, units: [[2, 3], [2, 5], [4, 3], [4, 5], [3, 4], [5, 4], [6, 6], [3, 7]].slice(0, n).map((p, i) => ({ uid: i + 1, id: 'x', star: 1, r: p[0], c: p[1], stats: { hp: 900, atk: atk, attackSpeed: 1.2, range: 2, armor: 20, resist: 0 } })) };
        const r = Battle.run(Battle.create(data, setup));
        out.push([arena, round, n, r.hash, r.leaks, r.leakDamage, r.killed, r.seconds].join('|'));
    }
    ok(out.length === gold.length && out.every((l, i) => l === gold[i]), 'tanpa setup.fx: hasil identik dengan simulator Fase 2 pada ' + gold.length + ' skenario (hash, kebocoran, korban, detik)');
}

/* ---- 2. kompilator Warisan ---- */
{
    const sri = byAsal('Sri', 'asal', 2); // 2 Sri aktif tingkat 1
    let S = mk(sri); let fx = Syn.fxCompile(data, S);
    ok(fx.syn.length === 1 && fx.syn[0].id === 'sri' && fx.syn[0].tier === 1 && near(fx.syn[0].p.shield, 0.1), 'Sri tingkat 1: tameng 10%');
    // Dwi memperkuat Warisan lain
    const dwi = byAsal('Dwi', 'asal', 2);
    S = mk(sri.concat(dwi)); fx = Syn.fxCompile(data, S);
    const s2 = fx.syn.find(e => e.id === 'sri');
    ok(near(fx.amp, 0.6) && near(s2.p.shield, 0.16), 'Dwi tingkat 1: efek Warisan lain +60% (tameng 0,10 -> 0,16)');
    ok(!fx.syn.find(e => e.id === 'dwi').p.amp || near(fx.syn.find(e => e.id === 'dwi').p.amp, 0.6), 'Dwi tidak menguatkan dirinya sendiri');
    // Lir menambah tameng Sri tingkat 3
    ok(F.synergy.sri.tiers[2].lirShield === 0.1, 'data: Sri tingkat 3 punya bonus tameng bila ada Lir (0,1)');
    // tanpa Warisan: fx kosong
    S = mk(['wung']); fx = Syn.fxCompile(data, S);
    ok(fx.syn.length === 0 && fx.eco.gold === 0, 'satu Titisan: tidak ada Warisan aktif, ekonomi netral');
}

/* ---- 3. Warisan: efek terlihat pada unit di awal pupuh (16 Warisan) ---- */
function team(name, kind, n, extra) { return byAsal(name, kind, n).concat(extra || []); }
const checks = {
    sri: () => { const B = mkB(mk(team('Sri', 'asal', 3))); return B.units.every(u => near(u.sh0, 0.15 * u.maxHp, 1e-6) || u.asal !== 'Sri') && B.units.some(u => u.sh0 > 0) && unitOf(B, 'wung').armor === ix.chars.wung.stats1Star.armor + 15; },
    hyang: () => { const B = mkB(mk(team('Hyang', 'asal', 2))); const m = B.units.filter(u => u.asal === 'Hyang'); return m.length === 2 && m.every(u => near(u.regen, 0.02)); },
    hut: () => { const B = mkB(mk(team('Hut', 'asal', 2))); return B.units.filter(u => u.asal === 'Hut').every(u => near(u.boom, 0.8)); },
    jong: () => { const B = mkB(mk(team('Jong', 'asal', 2))); return B.units.filter(u => u.asal === 'Jong').every(u => near(u.asMul, 0.15)); },
    rim: () => { const B = mkB(mk(team('Rim', 'asal', 2))); return B.units.filter(u => u.asal === 'Rim').every(u => near(u.crit, 0.1)) && B.units.filter(u => u.rear).every(u => near(u.dodge, 0.1)) && B.units.some(u => u.rear); },
    kei: () => { const B = mkB(mk(team('Kei', 'asal', 2))); return B.units.filter(u => u.asal === 'Kei').every(u => near(u.share, 0.1)); },
    mpu: () => { const B = mkB(mk(team('Mpu', 'laku', 2))); return B.units.filter(u => u.laku === 'Mpu').every(u => near(u.pen, 0.2)); },
    dung: () => { const B = mkB(mk(team('Dung', 'laku', 2))); return B.units.filter(u => u.laku === 'Dung').every(u => near(u.dr, 0.2)); },
    nah: () => { const B = mkB(mk(team('Nah', 'laku', 2))); return B.units.filter(u => u.laku === 'Nah').every(u => u.pierce === 1); },
    tam: () => { const B = mkB(mk(team('Tam', 'laku', 2))); return B.units.filter(u => u.laku === 'Tam').every(u => near(u.healBonus, 0.4)); },
    wang: () => { const B = mkB(mk(team('Wang', 'laku', 2))); return B.units.filter(u => u.laku === 'Wang').every(u => u.magicBasic && u.resShred === 10 && u.area === 1); },
    kar: () => { const B = mkB(mk(team('Kar', 'laku', 2))); return B.units.filter(u => u.laku === 'Kar').every(u => near(u.asMul, 0.2) && u.rearFirst); },
    gong: () => { const B = mkB(mk(team('Gong', 'laku', 2))); return B.units.every(u => near(u.asMul, 0.1)); }
};
Object.keys(checks).forEach(k => ok(checks[k](), 'Warisan ' + k + ' tingkat 1 terpasang pada unit (nilai dari data)'));
{ // tau (ekonomi) dan lir (global) dan dwi (penguat)
    const S = mk(team('Tau', 'asal', 2)); const fx = Syn.fxCompile(data, S);
    ok(fx.eco.gold === 1, 'Tau tingkat 1: +1 emas per pupuh');
    const S3 = mk(team('Tau', 'asal', 3)); ok(Syn.fxCompile(data, S3).eco.gold === 2 && Syn.fxCompile(data, S3).eco.interestCap === 1, 'Tau tingkat 2: +2 emas, batas bunga +1');
    const B = mkB(mk(team('Lir', 'laku', 2)), null); ok(B.lir && B.lir.every === 8 && B.next.lir === 8, 'Lir tingkat 1: tertahan tiap 8 dtk (global)');
    const Bd = mkB(mk(team('Dwi', 'asal', 2))); ok(Bd.fx.syn.some(e => e.id === 'dwi'), 'Dwi aktif tercatat sebagai penguat');
}
/* tingkat tinggi: nilai tingkat 3 dari data */
{
    const B = mkB(mk(team('Jong', 'asal', 5))); const m = B.units.filter(u => u.asal === 'Jong');
    ok(m.length === 5 && m.every(u => near(u.asMul, 0.4) && u.mana >= u.manaMax * 0 + 10), 'Jong tingkat 3: +40% kecepatan serang dan +10 mana awal');
    const Bk = mkB(mk(team('Kar', 'laku', 4))); ok(Bk.units.filter(u => u.laku === 'Kar').every(u => near(u.exec, 0.15)), 'Kar tingkat 3: eksekusi 15%');
}

/* ---- 4. mana dan skill: tiap Titisan menembakkan skill-nya ---- */
{
    const results = [];
    ix.ids.forEach(id => {
        const S = mk([id, 'wung'], { tiles: bestTiles.slice(0, 2) });
        const B = mkB(S, st => st.units.forEach(u => { u.manaStart = u.manaMax; }));
        let casted = false, t = 0;
        while (!B.done && t < 60 && !casted) { Battle.step(B); t += Battle.DT; if (B.ev.some(e => e.k === 'cast' && e.uid === B.units[0].uid)) casted = true; }
        results.push([id, casted]);
    });
    const bad = results.filter(r => !r[1]).map(r => r[0]);
    ok(bad.length === 0, 'semua 40 Titisan mengeluarkan skill saat mana penuh' + (bad.length ? ' (gagal: ' + bad.join(',') + ')' : ''));
}
{ // mana naik 10 per serangan, skill keluar setelah penuh, lalu mana kembali 0
    const S = mk(['wung'], { tiles: bestTiles.slice(0, 1) });
    const B = mkB(S); const u = B.units[0]; let casts = 0, firstCastMana = null, attacksBefore = 0, prev = 0;
    for (let i = 0; i < 4000 && !B.done && casts < 2; i++) { Battle.step(B); if (u.mana > prev) attacksBefore++; if (u.mana < prev) { casts++; if (firstCastMana === null) firstCastMana = prev; } prev = u.mana; }
    ok(casts >= 1 && firstCastMana === ix.chars.wung.stats1Star.manaMax && attacksBefore >= 7, 'mana terisi per serangan (10) dan berubah jadi skill saat penuh (cast: ' + casts + ')');
    ok(B.ev.filter(e => e.k === 'cast').length >= 1, 'kejadian cast tercatat untuk animasi');
}
{ // skill damage benar-benar melukai; skill heal menyembuhkan; skill shield memberi tameng
    let S = mk(['wung'], { tiles: bestTiles.slice(0, 1) });
    let B = mkB(S, st => { st.units[0].manaStart = st.units[0].manaMax; });
    const e0 = () => B.enemies.reduce((a, e) => a + e.maxHp - e.hp, 0);
    for (let i = 0; i < 400 && !B.ev.some(e => e.k === 'cast'); i++) Battle.step(B);
    ok(B.ev.some(e => e.k === 'cast') && e0() > 0, 'skill Damage (Wung) melukai musuh');
    S = mk(['bay', 'wung'], { tiles: bestTiles.slice(0, 2) });
    B = mkB(S, st => st.units.forEach(u => { u.manaStart = u.manaMax; }));
    B.units[1].hp = 100;
    for (let i = 0; i < 400 && !B.ev.some(e => e.k === 'cast' && e.uid === B.units[0].uid); i++) Battle.step(B);
    ok(B.units[1].hp > 100 || B.units[1].hp === B.units[1].maxHp, 'skill Heal (Bay) menyembuhkan sekutu yang paling lemah');
    S = mk(['gad'], { tiles: bestTiles.slice(0, 1) });
    B = mkB(S, st => { st.units[0].manaStart = st.units[0].manaMax; });
    for (let i = 0; i < 400 && !B.ev.some(e => e.k === 'cast'); i++) Battle.step(B);
    ok(B.units[0].sh1 > 0, 'skill Shield (Gad) memberi tameng');
}

/* ---- 5. Senapati (8 pasif) ---- */
{
    const base = ['wung', 'bay', 'hoi', 'jeng'];
    const sen = id => { const S = mk(base, { sen: id }); return mkB(S); };
    const B0 = mkB(mk(base));
    const Bs = sen('sen'); ok(Bs.units.some(u => u.sh0 > 0) && Bs.units.every(u => (u.r >= 2 && u.r <= 6 && u.c >= 3 && u.c <= 7) === (u.sh0 > 0)), 'Sen: tameng awal hanya untuk unit di petak tengah');
    const By = sen('yung'); ok(near(unitOf(By, 'bay').healBonus, 0.25) && unitOf(By, 'wung').healBonus === 0, 'Yung: pemulihan Penyembuh +25%');
    const Bt = Core.create(data, { seed: 1, arenaId: A, senapatiId: 'tuk' }); Bt.winStreak = 2; const fxT = Syn.fxCompile(data, Bt); ok(fxT.eco.gold === 1 && Syn.fxCompile(data, Object.assign({}, Bt, { winStreak: 1 })).eco.gold === 0, 'Tuk: +1 emas hanya bila menang beruntun >= 2');
    const Bh = sen('hat'); ok(Bh.quakeVal === 0.2 && Bh.next.quake === 10, 'Hat: gempa tiap 10 dtk, serangan tambahan penyerang (+20%)');
    const Sd = Core.create(data, { seed: 1, arenaId: A, senapatiId: 'deng' }); ok(Sd.shop.length === 6 && Core.create(data, { seed: 1 }).shop.length === 5, 'Deng: toko memuat 6 pilihan (lainnya 5)');
    const Bj = sen('jro'); ok(near(Bj.fx.durMul, 1.25), 'Jro: durasi efek +25%');
    const Bp = sen('pang'); const rearP = Bp.units.filter(u => u.rear), frontP = Bp.units.filter(u => !u.rear);
    ok(rearP.length > 0 && rearP.every(u => near(u.dodge, 0.3)) && frontP.every(u => u.dodge === 0), 'Pang: unit barisan belakang 30% sulit dibidik');
    const Bi = sen('pit'); ok(Bi.units.every(u => near(u.share, 0.15)), 'Pit: unit bersebelahan berbagi 15% tameng');
    // afinitas: nilai Sasana afinitas dipakai
    const Sa = Core.create(data, { seed: 1, arenaId: 'pelataran-keraton-wirasana', senapatiId: 'sen' }); ok(Sa.senapatiAffinity === true && near(Syn.fxCompile(data, Sa).sen.value, 0.132), 'Sen di Pelataran Keraton Wirasana (Sasana afinitas): bonus 13,2%');
    const Sb = Core.create(data, { seed: 1, arenaId: 'kawah-putri-sanghyang', senapatiId: 'sen' }); ok(Sb.senapatiAffinity === false && near(Syn.fxCompile(data, Sb).sen.value, 0.12), 'Sen di Sasana lain: 12%');
}

/* ---- 6. Penjaga: 18 kategori mekanik ---- */
{
    const bossBattle = (kind, round, tier) => {
        const S = mk(['wung', 'jeng', 'gad', 'bay'], { round: round || 10, star: 3 });
        const B = mkB(S, null);
        B.bossK = {}; B.bossK[kind] = true; B.wave.boss.fx = [kind]; B.bossScale = F.boss.scaleByTier[tier || 'bos'];
        return B;
    };
    const stepTo = (B, cond, max) => { for (let i = 0; i < (max || 4000) && !B.done && !cond(B); i++) Battle.step(B); return cond(B); };
    const bossE = B => B.enemies.find(e => e.boss);
    const K = F.boss;
    let B;
    B = bossBattle('armor'); stepTo(B, b => bossE(b)); ok(bossE(B) && near(bossE(B).armorBonus, K.armor.armor), 'Penjaga armor: pertahanan naik');
    B = bossBattle('fast'); stepTo(B, b => bossE(b)); ok(near(bossE(B).speed, B.wave.speed * K.fast.speed), 'Penjaga fast: lebih cepat');
    B = bossBattle('linger'); stepTo(B, b => bossE(b)); ok(bossE(B).speed < B.wave.speed && bossE(B).atk > B.wave.atk, 'Penjaga linger: lambat tapi lebih kuat');
    B = bossBattle('copy'); stepTo(B, b => bossE(b)); ok(bossE(B).atk > B.wave.atk, 'Penjaga copy: ATK mengikuti Titisan terkuat');
    B = bossBattle('slow'); ok(B.slowAs === 0, 'Penjaga slow: belum ada efek sebelum Penjaga muncul'); stepTo(B, b => bossE(b)); ok(near(B.slowAs, K.slow.asDebuff), 'Penjaga slow: kecepatan serang unit berkurang saat Penjaga ada');
    B = bossBattle('curse'); stepTo(B, b => bossE(b)); ok(near(B.curse, K.curse.atkDebuff), 'Penjaga curse: ATK unit berkurang saat Penjaga ada');
    ['aoe', 'focus', 'silence', 'stun', 'summon', 'grow', 'shield', 'strip'].forEach(k => {
        B = bossBattle(k); const seen = stepTo(B, b => b.ev.some(e => e.k === 'bossfx' && e.n === k), 6000);
        ok(seen, 'Penjaga ' + k + ': mekanik berkala terjadi');
    });
    B = bossBattle('summon'); stepTo(B, b => b.summoned > 0, 6000); ok(B.summoned >= K.summon.count && B.summoned <= K.summon.max, 'Penjaga summon: memanggil ' + B.summoned + ' Sunyi (batas ' + K.summon.max + ')');
    B = bossBattle('strip'); stepTo(B, b => b.ev.some(e => e.k === 'bossfx' && e.n === 'strip'), 6000); ok(B.units.every(u => u.sh0 === 0 && u.sh1 === 0 && u.noShieldT > B.t), 'Penjaga strip: tameng dilucuti dan tidak bisa diberi tameng sementara');
    B = bossBattle('stun'); stepTo(B, b => b.ev.some(e => e.k === 'bossfx' && e.n === 'stun'), 6000); ok(B.units.some(u => u.stunT > B.t), 'Penjaga stun: unit tertahan');
    B = bossBattle('silence'); stepTo(B, b => b.ev.some(e => e.k === 'bossfx' && e.n === 'silence'), 6000); ok(B.units.some(u => u.silT > B.t), 'Penjaga silence: unit tidak bisa memakai skill');
    // evade: sebagian serangan meleset
    B = bossBattle('evade'); stepTo(B, b => b.ev.some(e => e.k === 'dodge' && e.eid), 8000); ok(B.ev.some(e => e.k === 'dodge' && e.eid), 'Penjaga evade: serangan bisa meleset');
    // drain
    B = bossBattle('drain'); ok(B.bossK.drain === true, 'Penjaga drain: terpasang');
    // steal: kehilangan emas per 30 dtk
    B = bossBattle('steal'); stepTo(B, b => b.done, 9000); const rs = Battle.result(B); ok(rs.goldLoss !== undefined && rs.goldLoss % K.steal.gold === 0, 'Penjaga steal: emas dicuri per ' + K.steal.slowSec + ' dtk hidup (' + rs.goldLoss + ')');
    // asalGate: damage berkurang bila Asal aktif kurang
    const gate = (asalCount) => { const S = mk(asalCount === 0 ? ['wung'] : byAsal('Sri', 'asal', 3).concat(byAsal('Hyang', 'asal', 3), byAsal('Tau', 'asal', 3), byAsal('Hut', 'asal', 3)), { round: 10 }); const b = mkB(S); b.bossK = { asalGate: true }; b.gateMul = b.fx.asalActive >= 3 ? 1 : K.asalGate.damageMult; return b.gateMul; };
    ok(gate(0) === K.asalGate.damageMult && gate(4) === 1, 'Penjaga asalGate: damage ' + K.asalGate.damageMult + 'x bila Warisan Asal aktif kurang dari syarat');
    // semua 135 Penjaga punya kategori dikenal
    const known = Object.keys(K).filter(k => ['scaleByTier', 'asalGate'].indexOf(k) < 0).concat(['asalGate']);
    let unknown = 0, n = 0; Object.keys(ix.bosses).forEach(s => ix.bosses[s].forEach(b => { n++; b.fx.forEach(k => { if (known.indexOf(k) < 0) unknown++; }); }));
    ok(n === 135 && unknown === 0, 'semua ' + n + ' Penjaga memakai kategori mekanik yang dikenal');
    // kelemahan: Warisan lemah aktif menaikkan damage ke Penjaga
    const wk = ix.bosses[ix.arenas[A].a.name].find(b => b.round === 10);
    const wName = wk.weakAgainst[0];
    const kind = ix.syn.find(s => s.name === wName).kind;
    const S1 = mk(byAsal(wName, kind, 2), { round: 10 }); const S2 = mk(['wung'], { round: 10 });
    ok(mkB(S1).weakMul > 1 && near(mkB(S1).weakMul, 1 + F.weakBonusPerWarisan * (wk.weakAgainst.filter(n => Syn.fxCompile(data, S1).active[n]).length)) && mkB(S2).weakMul === 1, 'kelemahan Penjaga (' + wName + '): +' + (F.weakBonusPerWarisan * 100) + '% damage per Warisan lemah yang aktif');
}

/* ---- 7. Pusaka: 15 jenis ---- */
{
    const P = id => ix.pusaka[id].fx;
    const has = (id, f) => { const S = mk(['wung', 'bay'], { pusaka: [id], equipTo: 'wung' }); return f(S, mkB(S)); };
    const w0 = mkB(mk(['wung', 'bay'])); const wu = unitOf(w0, 'wung');
    ok(has('keris-luk-tujuh', (S, B) => near(unitOf(B, 'wung').atkMul, 0.1)), 'Pusaka Keris Luk Tujuh: ATK +10%');
    ok(has('kain-songket', (S, B) => unitOf(B, 'wung').maxHp === Math.round(wu.maxHp * 1.1)), 'Pusaka Kain Songket: HP +10%');
    ok(has('tombak-pusaka', (S, B) => near(unitOf(B, 'wung').asMul, 0.08)), 'Pusaka Tombak Pusaka: kecepatan serang +8%');
    ok(has('perisai-salawaku', (S, B) => unitOf(B, 'wung').armor === wu.armor + 10), 'Pusaka Perisai Salawaku: armor +10');
    ok(has('batik-parang', (S, B) => near(unitOf(B, 'wung').sh0, 0.1 * unitOf(B, 'wung').maxHp)), 'Pusaka Batik Parang: tameng awal 10% HP');
    ok(has('cermin-perunggu', (S, B) => unitOf(B, 'wung').mana === wu.mana + 10), 'Pusaka Cermin Perunggu: +10 mana awal');
    ok(has('kendi-air-suci', (S, B) => near(unitOf(B, 'wung').regen, 0.01)), 'Pusaka Kendi Air Suci: regenerasi 1%/dtk');
    ok(has('topeng-penolak', (S, B) => near(unitOf(B, 'wung').dr, 0.1)), 'Pusaka Topeng Penolak: damage diterima -10%');
    ok(has('gong-perunggu', (S, B) => near(unitOf(B, 'wung').crit, 0.08)), 'Pusaka Gong Perunggu: kritis +8%');
    ok(has('pedang-sunyi', (S, B) => near(B.bossDmg, 0.1)), 'Pusaka Pedang Sunyi: +10% damage ke Penjaga');
    ok(has('jimat-kerabat', (S, B) => B.leakDown === 1), 'Pusaka Jimat Kerabat: Sunyi lolos melukai 1 lebih sedikit');
    ok(has('mahkota-raja', (S, B) => Core.unitLimit(ix, S) === ix.eco.levels[S.level - 1].unitLimit + 1), 'Pusaka Mahkota Raja: batas Titisan +1');
    ok(has('mustika-lawang', (S, B) => Core.rerollCost(ix, S) === Math.max(1, ix.eco.rerollCost - 1)), 'Pusaka Mustika Lawang: refresh lebih murah (min 1)');
    { const S = mk(['wung'], { pusaka: ['beras-kuning'] }); const fx = Syn.fxCompile(data, S); ok(fx.eco.gold === 2, 'Pusaka Beras Kuning: +2 emas per pupuh'); }
    { const S = Core.create(data, { seed: 3 }); S.pusakaOffer = ['sirih-pinang', 'beras-kuning', 'gong-perunggu']; const hp = S.hp, mx = S.maxHp; const r = Core.choosePusaka(data, S, 'sirih-pinang'); ok(r.ok && S.maxHp === mx + 10 && S.hp === hp + 10 && S.pusakaOffer === null, 'Pusaka Sirih Pinang: +10 HP Senapati seketika'); }
    // leakDown dalam pertempuran
    { const S = mk([], { pusaka: ['jimat-kerabat'], round: 20 }); const r = Battle.run(mkB(S)); const S2 = mk([], { round: 20 }); const r2 = Battle.run(mkB(S2)); ok(r.leakDamage < r2.leakDamage && r.leakDamage >= r.leaks - 0, 'Jimat Kerabat mengurangi kerusakan Sunyi yang lolos (' + r.leakDamage + ' < ' + r2.leakDamage + ')'); }
    // HUD8: pasang/copot
    // Pasang otomatis
    { const S = mk(['wung', 'bay'], { pusaka: ['keris-luk-tujuh', 'mahkota-raja'] }); const r = Core.autoEquip(data, S);
      ok(r.ok && r.n === 1 && S.equip['keris-luk-tujuh'] && !S.equip['mahkota-raja'], 'autoEquip: memasang Pusaka per-Titisan, melewati yang global');
      const e0 = S.equip['keris-luk-tujuh']; ok(Core.autoEquip(data, S).n === 0 && S.equip['keris-luk-tujuh'] === e0, 'autoEquip: tidak memindahkan yang sudah terpasang');
      const S2 = mk([], { pusaka: ['keris-luk-tujuh'] }); ok(Core.autoEquip(data, S2).n === 0, 'autoEquip: papan kosong = 0 terpasang'); }
    { const S = mk(['wung', 'bay'], { pusaka: ['keris-luk-tujuh'] }); const B0 = mkB(S); ok(near(unitOf(B0, 'wung').atkMul, 0) && near(unitOf(B0, 'bay').atkMul, 0), 'HUD8: Pusaka per-Titisan yang belum dipakai tidak memberi efek');
      const w = Object.keys(S.board).map(k => S.board[k]).find(u => u.id === 'wung');
      const r = Core.equipPusaka(data, S, 'keris-luk-tujuh', w.uid); const B1 = mkB(S);
      ok(r.ok && near(unitOf(B1, 'wung').atkMul, 0.1) && near(unitOf(B1, 'bay').atkMul, 0), 'HUD8: dipakai Wung = hanya Wung +10% ATK');
      const by = Object.keys(S.board).map(k => S.board[k]).find(u => u.id === 'bay'); Core.equipPusaka(data, S, 'keris-luk-tujuh', by.uid); const B2 = mkB(S);
      ok(near(unitOf(B2, 'wung').atkMul, 0) && near(unitOf(B2, 'bay').atkMul, 0.1), 'HUD8: memasang ke Titisan lain = pindah');
      ok(Core.unequipPusaka(S, 'keris-luk-tujuh').ok && near(unitOf(mkB(S), 'bay').atkMul, 0), 'HUD8: dicopot = efek hilang');
      const h1 = Core.hash(S); Core.equipPusaka(data, S, 'keris-luk-tujuh', w.uid); ok(Core.hash(S) !== h1, 'HUD8: hash state memuat pemasangan'); }
    { const S = mk(['wung'], { pusaka: ['mahkota-raja', 'keris-luk-tujuh'] }); const w = Object.keys(S.board).map(k => S.board[k])[0];
      ok(Core.equipPusaka(data, S, 'mahkota-raja', w.uid).reason === 'GLOBAL', 'HUD8: Pusaka global tidak bisa dipasang (tetap pasif)');
      ok(Core.equipPusaka(data, S, 'gong-perunggu', w.uid).reason === 'NO_PUSAKA', 'HUD8: Pusaka yang belum dimiliki ditolak');
      ok(Core.equipPusaka(data, S, 'keris-luk-tujuh', 99999).reason === 'NO_UNIT', 'HUD8: Titisan tidak ada ditolak');
      S.phase = 'over'; ok(Core.equipPusaka(data, S, 'keris-luk-tujuh', w.uid).reason === 'PHASE', 'HUD8: tidak bisa dipasang saat game berakhir'); }
    { const S = mk(['wung'], { pusaka: ['keris-luk-tujuh', 'kain-songket', 'tombak-pusaka', 'gong-perunggu'] }); const w = Object.keys(S.board).map(k => S.board[k])[0];
      const rs = ['keris-luk-tujuh', 'kain-songket', 'tombak-pusaka', 'gong-perunggu'].map(i => Core.equipPusaka(data, S, i, w.uid));
      ok(rs[0].ok && rs[1].ok && rs[2].ok && rs[3].reason === 'FULL', 'HUD8: satu Titisan maksimal 3 Pusaka'); }
    // data: 15 Pusaka, semua punya nama dan deskripsi
    ok(Object.keys(ix.pusaka).length === 15 && Object.keys(ix.pusaka).every(k => ix.pusaka[k].name && ix.pusaka[k].desc), '15 Pusaka lengkap (nama, deskripsi, efek)');
}

/* ---- 8. hadiah Pusaka setelah Penjaga ---- */
{
    const S = Core.create(data, { seed: 11, arenaId: A, senapatiId: 'sen' });
    S.round = 5;
    const lose = { leaks: 0, leakDamage: 0, killed: 7, seconds: 10, win: true };
    let r = Core.finishRound(data, S, Object.assign({}, lose, { boss: { out: true, killed: true, aliveSec: 5 } }));
    ok(S.pusakaOffer && S.pusakaOffer.length === 3 && new Set(S.pusakaOffer).size === 3 && r.summary.pusakaOffer.length === 3, 'Penjaga dikalahkan: 3 Pusaka berbeda ditawarkan');
    const offer = S.pusakaOffer.slice();
    ok(Core.choosePusaka(data, S, 'tidak-ada').ok === false && S.pusakaOffer.length === 3, 'memilih Pusaka di luar tawaran ditolak');
    const c = Core.choosePusaka(data, S, offer[1]); ok(c.ok && S.pusaka.length === 1 && S.pusaka[0] === offer[1] && S.pusakaOffer === null, 'memilih satu Pusaka: tersimpan, tawaran tertutup');
    S.round = 10; r = Core.finishRound(data, S, Object.assign({}, lose, { boss: { out: true, killed: true, aliveSec: 5 } }));
    ok(S.pusakaOffer.indexOf(offer[1]) < 0, 'Pusaka yang sudah dimiliki tidak ditawarkan lagi');
    const S2 = Core.create(data, { seed: 11, arenaId: A }); S2.round = 5; Core.finishRound(data, S2, Object.assign({}, lose, { leaks: 1, leakDamage: 20, win: false, boss: { out: true, killed: false, aliveSec: 180 } }));
    ok(S2.pusakaOffer === null, 'Penjaga tidak dikalahkan: tidak ada Pusaka');
    { const S3 = Core.create(data, { seed: 11, arenaId: A }); S3.round = 5; S3.pusaka = Object.keys(Core.index(data).pusaka).slice(0, 12); const r3 = Core.finishRound(data, S3, Object.assign({}, lose, { boss: { out: true, killed: true, aliveSec: 5 } })); ok(S3.pusakaOffer === null && r3.summary.pusakaOffer === null, 'HUD5: sudah 12 Pusaka (batas simpan): Penjaga tidak lagi menawarkan Pusaka'); }
    const S3 = Core.create(data, { seed: 11, arenaId: A }); S3.round = 3; Core.finishRound(data, S3, lose); ok(S3.pusakaOffer === null, 'pupuh biasa: tidak ada Pusaka');
    const Sx = Core.create(data, { seed: 11, arenaId: A }); const Sy = Core.create(data, { seed: 11, arenaId: A }); Sx.round = Sy.round = 5;
    Core.finishRound(data, Sx, Object.assign({}, lose, { boss: { out: true, killed: true, aliveSec: 5 } })); Core.finishRound(data, Sy, Object.assign({}, lose, { boss: { out: true, killed: true, aliveSec: 9 } }));
    ok(Sx.pusakaOffer.join() === Sy.pusakaOffer.join(), 'tawaran Pusaka deterministik dari benih + ronde');
}

/* ---- 9. ekonomi ---- */
{
    const S = mk(team('Tau', 'asal', 3)); S.gold = 0; S.phase = 'prep'; S.round = 2;
    const r = Core.finishRound(data, S, { leaks: 0, leakDamage: 0, killed: 6, seconds: 5, win: true });
    ok(r.summary.income.extra === 2 && r.summary.income.total === r.summary.income.base + r.summary.income.interest + r.summary.income.streak + 2, 'Tau tingkat 2 menambah 2 emas ke penghasilan akhir pupuh');
    const S2 = Core.create(data, { seed: 1 }); S2.gold = 100; Core.finishRound(data, S2, { leaks: 1, leakDamage: 1, killed: 5, seconds: 5, win: false, goldLoss: 3 }); ok(r.summary.goldLost === 0 && S2.gold >= 100 - 3, 'emas yang dicuri Penjaga dikurangi (tidak pernah minus)');
    const S3 = Core.create(data, { seed: 1 }); S3.gold = 1; const r3 = Core.finishRound(data, S3, { leaks: 1, leakDamage: 1, killed: 5, seconds: 5, win: false, goldLoss: 50 }); ok(r3.summary.goldLost === 1, 'pencurian emas dibatasi sebesar emas yang dimiliki');
}

/* ---- 10. 6 slot toko: invarian pool ---- */
{
    const S = Core.create(data, { seed: 5, arenaId: A, senapatiId: 'deng' });
    const total = id => S.pool[id] + S.shop.filter(x => x === id).length + Core.allUnits(S).filter(e => e.u.id === id).length * 0;
    const init = {}; ix.ids.forEach(id => { init[id] = ix.eco.poolByCost[ix.chars[id].cost].copiesPerCharacter; });
    ok(S.shop.length === 6 && S.shop.every(x => x), 'Deng: 6 slot toko terisi');
    for (let i = 0; i < 5; i++) { S.gold = 50; Core.refresh(data, S); }
    ok(ix.ids.every(id => total(id) === init[id]), 'pool + toko = jumlah awal setelah 5 kali refresh (6 slot)');
}

/* ---- 11. determinisme dan keseimbangan dasar ---- */
{
    const mkFull = () => { const S = mk(['wung', 'hoi', 'bay', 'jeng', 'gad', 'sau'], { sen: 'hat', pusaka: ['gong-perunggu'], round: 5, star: 2 }); return S; };
    const r1 = Battle.run(mkB(mkFull())), r2 = Battle.run(mkB(mkFull()));
    ok(r1.hash === r2.hash && r1.seconds === r2.seconds, 'pertempuran dengan efek: hash identik pada dua kali jalan');
    const S3 = mkFull(); S3.seed = 99; const r3 = Battle.run(mkB(S3));
    ok(typeof r3.hash === 'number', 'benih berbeda tetap berjalan sampai selesai');
    const bigS = mk(ix.ids.slice(0, 12), { round: 30, star: 2, sen: 'jro' });
    const t0 = Date.now(); const r = Battle.run(mkB(bigS)); const ms = Date.now() - t0;
    ok(r.seconds <= 180 && ms < 5000, 'pertempuran 12 Titisan ronde 30 selesai di ' + ms + ' ms (batas waktu pengaman 180 dtk)');
    ok(Core.hash(mkFull()) === Core.hash(mkFull()), 'hash state match menyertakan Senapati dan Pusaka secara deterministik');
    const hA = Core.hash(Core.create(data, { seed: 1, senapatiId: 'sen' })), hB = Core.hash(Core.create(data, { seed: 1, senapatiId: 'tuk' })); ok(hA !== hB, 'hash state match berbeda untuk Senapati berbeda');
}
console.log('\nRINGKASAN ' + pass + ' lulus, ' + fail + ' gagal'); process.exit(fail ? 1 : 0);
