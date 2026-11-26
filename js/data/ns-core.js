/* =====================================================================
   NUSANTARA SIRNA — sim-core: aturan match (ekonomi, toko, pool, bench, papan, merge).
   LOGIKA MURNI (tanpa DOM). Semua angka dibaca dari data/nusantara/*.json.
   Semua aksi hanya boleh di fase 'prep'. Aksi mengembalikan {ok:true,...} atau {ok:false, reason:KODE}.
   Toko memesan salinan dari pool saat ditampilkan; yang tidak dibeli dikembalikan saat refresh/ronde baru.
   Invarian yang diuji: pool + toko + unit yang dimiliki (1/3/9 salinan per bintang) = jumlah awal.
===================================================================== */
(function (root) {
    'use strict';
    const GH = root.GH = root.GH || {};
    const NS = GH.ns = GH.ns || {};
    const R = NS.rng;

    const COPIES = [0, 1, 3, 9]; // salinan per bintang 1/2/3 (indeks = bintang)
    const BENCH = 9;
    const PUSAKA_MAX = 12; // HUD5: tiap pemain menyimpan paling banyak 12 Pusaka (Penjaga berikutnya tidak lagi menawarkan Pusaka bila penuh)

    /* ---------- indeks data (dihitung sekali per bundel data) ---------- */
    const cacheIx = new WeakMap();
    function index(data) {
        if (cacheIx.has(data)) return cacheIx.get(data);
        const chars = {}, ids = [], byCost = { 1: [], 2: [], 3: [], 4: [], 5: [] };
        data.characters.characters.forEach(c => { chars[c.id] = c; ids.push(c.id); byCost[c.cost].push(c.id); });
        const arenas = {};
        data.arenas.arenas.forEach(a => {
            const tiles = [], tileSet = {};
            a.layout.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === 'U') { tiles.push([r + 1, c + 1]); tileSet[(r + 1) + ',' + (c + 1)] = true; } }));
            arenas[a.id] = { a: a, tiles: tiles, tileSet: tileSet };
        });
        const cmd = {}; (data.commanders && data.commanders.commanders || []).forEach(c => { cmd[c.id] = c; });
        const pusaka = {}; ((data.rules.fx && data.rules.fx.pusaka) || []).forEach(p => { pusaka[p.id] = p; });
        const ix = { data: data, chars: chars, ids: ids, byCost: byCost, arenas: arenas, cmd: cmd, pusaka: pusaka, eco: data.economy, rules: data.rules, bosses: data.bosses.bosses, syn: data.synergies.synergies };
        cacheIx.set(data, ix);
        return ix;
    }

    const starMult = (ix, star) => star === 1 ? ix.eco.starMultiplier.star1 : star === 2 ? ix.eco.starMultiplier.star2 : ix.eco.starMultiplier.star3;
    /* Harga jual (keputusan pemilik, HUD): harga x 3^(bintang-1), dikurangi 1 bila bintang > 1 (bintang1 = harga, bintang2 = 3h-1, bintang3 = 9h-1). */
    const sellValue = (ix, unit) => { const c = ix.chars[unit.id].cost, m = Math.pow(3, unit.star - 1); return c * m - (unit.star > 1 ? 1 : 0); };

    /** Statistik unit pada bintang tertentu (HP dan ATK dikali pengali bintang). */
    function unitStats(ix, unit) {
        const c = ix.chars[unit.id], s = c.stats1Star, m = starMult(ix, unit.star);
        return { hp: Math.round(s.hp * m), atk: Math.round(s.atk * m), attackSpeed: s.attackSpeed, range: s.range, armor: s.armor, resist: s.resist };
    }

    /* ---------- pembuatan match ---------- */
    /* HUD10: stok Shop Pool bersama. Acuan: TFT/Auto Chess/Magic Chess memakai satu pool terbatas untuk semua pemain
       (sekitar 29/22/18/12/10 salinan per karakter untuk 8 pemain); salinan unit yang dijual atau pemain yang tersingkir
       kembali ke pool. Karena lobi kita 2-5 pemain, jumlah salinan diskalakan lewat economy.poolScaleByPlayers. */
    function createPool(ix, players) {
        const sc = ix.eco.poolScaleByPlayers || {}, f = sc[Math.max(1, Math.min(5, players || 1))] || 1, pool = {};
        ix.ids.forEach(id => { pool[id] = Math.round(ix.eco.poolByCost[ix.chars[id].cost].copiesPerCharacter * f); });
        return pool;
    }
    /* Simulasi pembelian lawan (Mode Contoh, sebelum Duel/Party online ada): lawan mengambil n salinan dari pool bersama
       menurut peluang toko levelnya; deterministik terhadap rng. */
    function rivalBuy(data, pool, rng, level, n) {
        const ix = index(data), odds = oddsFor(ix, Math.max(1, Math.min(ix.eco.levels.length, level))); let got = 0;
        for (let k = 0; k < n; k++) {
            let x = rng.next() * 100, cost = 1;
            for (let c = 0; c < 5; c++) { x -= odds[c]; if (x < 0) { cost = c + 1; break; } cost = c + 1; }
            const cand = ix.byCost[cost].filter(id => pool[id] > 0); if (!cand.length) continue;
            const id = cand[rng.int(cand.length)]; pool[id]--; got++;
        }
        return got;
    }
    function newPool(data, players) { return createPool(index(data), players); }
    /* Pemain tersingkir: semua salinan miliknya (toko, bench, Sasana) kembali ke pool bersama. */
    function releaseAll(S) {
        returnShop(S);
        Object.keys(S.board).forEach(k => { const u = S.board[k]; if (u) S.pool[u.id] += COPIES[u.star]; delete S.board[k]; });
        S.bench.forEach((u, i) => { if (u) { S.pool[u.id] += COPIES[u.star]; S.bench[i] = null; } });
        if (S.pending) { S.pool[S.pending.id] += COPIES[S.pending.star]; S.pending = null; }
    }
    function create(data, opts) {
        const ix = index(data);
        opts = opts || {};
        const seed = (opts.seed === undefined ? 1 : opts.seed) >>> 0;
        const arenaId = opts.arenaId || 'pelataran-keraton-wirasana';
        if (!ix.arenas[arenaId]) throw new Error('arena tidak dikenal: ' + arenaId);
        const sid = opts.senapatiId || null;
        if (sid && !ix.cmd[sid]) throw new Error('Senapati tidak dikenal: ' + sid);
        const affinity = !!(sid && ix.arenas[arenaId].a.affinityCommander === ix.cmd[sid].name);
        const dengSlots = sid && ix.rules.fx && ix.rules.fx.senapati.kinds[sid] === 'shopSlot' ? Math.round(affinity ? ix.cmd[sid].passiveValueOnAffinityArena : ix.cmd[sid].passiveValue) : 0;
        const pool = opts.pool || createPool(ix, opts.players || 1); // HUD10: Duel/Party membagi SATU pool (opts.pool) antar pemain
        const S = {
            seed: seed, arenaId: arenaId, round: 1, phase: 'prep', over: false,
            gold: ix.eco.startingGold, xp: 0, level: 1, winStreak: 0, loseStreak: 0,
            hp: ix.rules.match.commanderStartHp, maxHp: ix.rules.match.commanderStartHp,
            shop: new Array(5 + dengSlots).fill(null), senapatiId: sid, senapatiAffinity: affinity, pusaka: [], equip: {}, pusakaOffer: null, autoUpgrade: opts.autoUpgrade !== false, pending: null, bench: new Array(BENCH).fill(null), board: {},
            pool: pool, uid: 1, refreshCount: 0, endless: false, roundsWon: 0
        };
        drawShop(ix, S);
        return S;
    }

    /* ---------- toko dan pool ---------- */
    function oddsFor(ix, level) { return ix.eco.levels[level - 1].shopOddsPercent; }

    function drawOne(ix, S, rng) {
        const odds = oddsFor(ix, S.level);
        for (let attempt = 0; attempt < 12; attempt++) {
            let x = rng.next() * 100, cost = 1;
            for (let c = 0; c < 5; c++) { x -= odds[c]; if (x < 0) { cost = c + 1; break; } cost = c + 1; }
            const cand = []; let tot = 0;
            ix.byCost[cost].forEach(id => { if (S.pool[id] > 0) { cand.push(id); tot += S.pool[id]; } });
            if (!tot) continue;
            let y = rng.next() * tot;
            for (let i = 0; i < cand.length; i++) { y -= S.pool[cand[i]]; if (y < 0) return cand[i]; }
            return cand[cand.length - 1];
        }
        for (let cost = 1; cost <= 5; cost++) { const id = ix.byCost[cost].find(i => S.pool[i] > 0); if (id) return id; }
        return null;
    }

    function returnShop(S) {
        for (let i = 0; i < S.shop.length; i++) { if (S.shop[i]) S.pool[S.shop[i]]++; S.shop[i] = null; }
    }

    // Benih toko = (benih match, ronde, nomor refresh): pemain dengan benih sama melihat toko yang sama.
    function drawShop(ix, S) {
        returnShop(S);
        const rng = R.make(R.mix([S.seed, 'shop', S.round, S.refreshCount]));
        for (let i = 0; i < S.shop.length; i++) {
            const id = drawOne(ix, S, rng);
            S.shop[i] = id;
            if (id) S.pool[id]--;
        }
        S.refreshCount++;
    }

    // Shop dan Bench boleh dikelola saat persiapan DAN saat pupuh berlangsung (phase 'battle').
    // Saat pupuh: tidak ada yang menyentuh Sasana (tidak ada drop Bench -> Sasana, tidak ada menjual/memindah unit Sasana),
    // supaya pasukan yang sedang bertarung tidak berubah.
    const canManage = S => S.phase === 'prep' || S.phase === 'battle';

    function refresh(data, S) {
        const ix = index(data);
        if (!canManage(S)) return { ok: false, reason: 'PHASE' };
        const rc = rerollCost(ix, S);
        if (S.gold < rc) return { ok: false, reason: 'GOLD' };
        S.gold -= rc;
        drawShop(ix, S);
        return { ok: true };
    }

    /* ---------- XP dan level ---------- */
    function addXp(ix, S, n) {
        S.xp += n;
        while (S.level < ix.eco.maxLevel && S.xp >= ix.eco.levels[S.level - 1].xpToNext) { S.xp -= ix.eco.levels[S.level - 1].xpToNext; S.level++; }
        if (S.level >= ix.eco.maxLevel) S.xp = 0;
    }

    function buyXp(data, S) {
        const ix = index(data);
        if (!canManage(S)) return { ok: false, reason: 'PHASE' };
        if (S.level >= ix.eco.maxLevel) return { ok: false, reason: 'MAXLEVEL' };
        if (S.gold < ix.eco.buyXpCost) return { ok: false, reason: 'GOLD' };
        S.gold -= ix.eco.buyXpCost;
        addXp(ix, S, ix.eco.xpPerPurchase);
        return { ok: true };
    }

    const pusakaFx = (ix, S, k) => { let t = 0; (S.pusaka || []).forEach(id => { const p = ix.pusaka[id]; if (p && p.fx[k]) t += p.fx[k]; }); return t; };
    const rerollCost = (ix, S) => Math.max(1, ix.eco.rerollCost - pusakaFx(ix, S, 'rerollDown'));
    const unitLimit = (ix, S) => ix.eco.levels[S.level - 1].unitLimit + pusakaFx(ix, S, 'unitLimit');
    const boardCount = S => Object.keys(S.board).length;

    /* ---------- daftar unit dan merge ---------- */
    function boardKeys(S) { // urutan tetap: baris lalu kolom
        return Object.keys(S.board).sort((a, b) => { const pa = a.split(',').map(Number), pb = b.split(',').map(Number); return pa[0] - pb[0] || pa[1] - pb[1]; });
    }
    function allUnits(S) { // papan dulu (urut), lalu bench
        const out = [];
        boardKeys(S).forEach(k => { const p = k.split(',').map(Number); out.push({ u: S.board[k], loc: { w: 'board', r: p[0], c: p[1] } }); });
        S.bench.forEach((u, i) => { if (u) out.push({ u: u, loc: { w: 'bench', i: i } }); });
        if (S.pending) out.push({ u: S.pending, loc: { w: 'pending' } }); // 'baru dibeli': 1 Titisan ditahan saat Bench penuh (mode upgrade manual)
        return out;
    }
    const getAt = (S, loc) => loc.w === 'bench' ? S.bench[loc.i] : loc.w === 'pending' ? S.pending : S.board[loc.r + ',' + loc.c];
    function setAt(S, loc, u) {
        if (loc.w === 'bench') S.bench[loc.i] = u || null;
        else if (loc.w === 'pending') S.pending = u || null;
        else if (u) S.board[loc.r + ',' + loc.c] = u; else delete S.board[loc.r + ',' + loc.c];
    }

    /** Kelompok yang bisa digabung: 3 Titisan sama (id + bintang < 3) dari Sasana, Bench, dan 'baru dibeli' (urutan prioritas itu). */
    function upgradeGroups(S, benchOnly) {
        const groups = {}, order = [];
        allUnits(S).forEach(e => {
            if (benchOnly && e.loc.w === 'board') return; // saat pupuh, Sasana tidak disentuh: gabungan lintas Sasana ditunda sampai pupuh selesai
            if (e.u.star >= 3) return;
            const k = e.u.id + '|' + e.u.star;
            if (!groups[k]) { groups[k] = { id: e.u.id, star: e.u.star, entries: [] }; order.push(k); }
            groups[k].entries.push(e);
        });
        return order.filter(k => groups[k].entries.length >= 3).map(k => { const g = groups[k]; return { id: g.id, star: g.star, locs: g.entries.slice(0, 3).map(e => e.loc), count: g.entries.length }; });
    }
    function doMerge(S, g) {
        const t = g.locs.map(l => ({ loc: l, u: getAt(S, l) }));
        t.forEach(e => setAt(S, e.loc, null));
        const merged = { uid: S.uid++, id: t[0].u.id, star: t[0].u.star + 1 };
        setAt(S, t[0].loc, merged);
        return { id: merged.id, star: merged.star, loc: t[0].loc };
    }
    /** Pindahkan Titisan 'baru dibeli' ke slot Bench kosong pertama bila ada. */
    function settlePending(S) {
        if (!S.pending) return;
        const free = S.bench.indexOf(null);
        if (free >= 0) { S.bench[free] = S.pending; S.pending = null; }
    }
    /** Gabungkan 3 unit sama (id + bintang) jadi 1 bintang berikutnya, berantai. Mengembalikan daftar kejadian. */
    function mergeAll(S, benchOnly) {
        const events = [];
        for (;;) {
            const g = upgradeGroups(S, benchOnly)[0];
            if (!g) return events;
            events.push(doMerge(S, g));
        }
    }
    /** Upgrade manual satu kelompok (hanya bila Upgrade Otomatis mati). */
    function upgrade(data, S, id, star) {
        if (!canManage(S)) return { ok: false, reason: 'PHASE' };
        const g = upgradeGroups(S, S.phase === 'battle').find(x => x.id === id && x.star === star);
        if (!g) return { ok: false, reason: 'NO_UPGRADE' };
        const ev = doMerge(S, g);
        settlePending(S);
        if (S.bench.length > BENCH) S.bench.length = BENCH;
        return { ok: true, merges: [ev] };
    }
    function setAutoUpgrade(data, S, on) {
        S.autoUpgrade = !!on;
        const ev = S.autoUpgrade && canManage(S) ? mergeAll(S, S.phase === 'battle') : [];
        settlePending(S);
        return { ok: true, merges: ev };
    }

    function ownedCount(S, id, star) { return allUnits(S).filter(e => e.u.id === id && e.u.star === star).length; }

    /* ---------- beli, jual, pindah ---------- */
    function buy(data, S, slot) {
        const ix = index(data);
        if (!canManage(S)) return { ok: false, reason: 'PHASE' };
        const inBattle = S.phase === 'battle';
        const id = S.shop[slot];
        if (!id) return { ok: false, reason: 'EMPTY' };
        const cost = ix.chars[id].cost;
        if (S.gold < cost) return { ok: false, reason: 'GOLD' };
        const free = S.bench.indexOf(null);
        const pend = S.pending && S.pending.id === id && S.pending.star === 1 ? 1 : 0;
        const copies = inBattle ? S.bench.filter(b => b && b.id === id && b.star === 1).length + pend : ownedCount(S, id, 1); // ownedCount sudah memuat 'baru dibeli'
        if (free < 0 && copies < 2) return { ok: false, reason: 'BENCH_FULL' };
        if (free < 0 && !S.autoUpgrade && S.pending) return { ok: false, reason: 'BENCH_FULL' }; // slot 'baru dibeli' hanya satu
        S.gold -= cost;
        S.shop[slot] = null; // salinan sudah dipesan dari pool saat toko digambar
        const unit = { uid: S.uid++, id: id, star: 1 };
        let events = [];
        if (free >= 0) S.bench[free] = unit;
        else if (S.autoUpgrade) S.bench.push(unit); // slot sementara; pasti habis oleh merge (2 + 1)
        else S.pending = unit; // mode manual: ditahan di slot 'baru dibeli' sampai pemain menekan Upgrade
        if (S.autoUpgrade) events = mergeAll(S, inBattle);
        if (S.bench.length > BENCH) S.bench.length = BENCH;
        return { ok: true, merges: events };
    }

    function sell(data, S, loc) {
        const ix = index(data);
        if (!canManage(S)) return { ok: false, reason: 'PHASE' };
        if (S.phase === 'battle' && (!loc || (loc.w !== 'bench' && loc.w !== 'pending'))) return { ok: false, reason: 'BATTLE_BOARD' };
        const u = getAt(S, loc);
        if (!u) return { ok: false, reason: 'EMPTY' };
        const gain = sellValue(ix, u);
        S.gold += gain;
        S.pool[u.id] += COPIES[u.star];
        setAt(S, loc, null);
        settlePending(S);
        return { ok: true, gold: gain };
    }

    function move(data, S, from, to) {
        const ix = index(data);
        if (!canManage(S)) return { ok: false, reason: 'PHASE' };
        if (S.phase === 'battle' && (!from || !to || (from.w !== 'bench' && from.w !== 'pending') || to.w !== 'bench')) return { ok: false, reason: 'BATTLE_BOARD' }; // saat pupuh hanya Bench <-> Bench
        const badBench0 = l => l.w === 'bench' && !(Number.isInteger(l.i) && l.i >= 0 && l.i < BENCH);
        if (badBench0(from)) return { ok: false, reason: 'BAD_SLOT' };
        const a = getAt(S, from);
        if (!a) return { ok: false, reason: 'EMPTY' };
        const badBench = l => l.w === 'bench' && !(Number.isInteger(l.i) && l.i >= 0 && l.i < BENCH);
        if (badBench(from) || badBench(to)) return { ok: false, reason: 'BAD_SLOT' };
        if (to.w === 'board' && !ix.arenas[S.arenaId].tileSet[to.r + ',' + to.c]) return { ok: false, reason: 'BAD_TILE' };
        if (from.w === to.w && (from.w === 'pending' || (from.w === 'bench' ? from.i === to.i : from.r === to.r && from.c === to.c))) return { ok: true };
        const b = getAt(S, to);
        if (from.w !== 'board' && to.w === 'board' && !b && boardCount(S) >= unitLimit(ix, S)) return { ok: false, reason: 'LIMIT' };
        setAt(S, from, b || null);
        setAt(S, to, a);
        settlePending(S);
        return { ok: true };
    }

    /* ---------- pertempuran dan akhir ronde ---------- */
    function battleSetup(data, S) {
        const ix = index(data);
        const fx = NS.Synergy && NS.Synergy.fxCompile ? NS.Synergy.fxCompile(data, S) : null; // null = simulator Fase 2 (tanpa efek)
        const units = boardKeys(S).map(k => {
            const p = k.split(',').map(Number), u = S.board[k], c = ix.chars[u.id];
            return { uid: u.uid, id: u.id, star: u.star, r: p[0], c: p[1], stats: unitStats(ix, u), asal: c.asal, laku: c.laku, cost: c.cost, manaStart: c.stats1Star.manaStart, manaMax: c.stats1Star.manaMax, skill: { name: c.skill.name, type: c.skill.type, fx: c.skill.fx || [] } };
        });
        return { round: S.round, seed: S.seed, arenaId: S.arenaId, units: units, fx: fx, extreme: !!S.extreme }; // extreme: Ronde Ekstrem Duel/Party (diset oleh ns-match)
    }

    function streakGold(ix, streak) {
        let g = 0;
        ix.eco.streakBonus.forEach(b => { if (streak >= b.minStreak) g = b.gold; });
        return g;
    }

    /** 3 Pusaka acak (belum dimiliki) setelah Penjaga dikalahkan. Benih = benih match + ronde. */
    function offerPusaka(ix, S) {
        const rng = R.make(R.mix([S.seed, 'pusaka', S.round]));
        const pool = Object.keys(ix.pusaka).filter(id => S.pusaka.indexOf(id) < 0);
        const out = [];
        while (out.length < 3 && pool.length) out.push(pool.splice(rng.int(pool.length), 1)[0]);
        return out;
    }
    /* HUD8: pasang/copot Pusaka efek-per-Titisan. Hanya Titisan di Sasana/Bench; Pusaka global tidak bisa dipasang. */
    function equipPusaka(data, S, id, uid) {
        const ix = index(data), p = ix.pusaka[id];
        if (!p || S.pusaka.indexOf(id) < 0) return { ok: false, reason: 'NO_PUSAKA' };
        if (!canManage(S)) return { ok: false, reason: 'PHASE' };
        if (!Object.keys(p.fx).some(k => NS.Synergy.UNIT_KEYS.indexOf(k) >= 0)) return { ok: false, reason: 'GLOBAL' };
        const all = Object.keys(S.board).map(k => S.board[k]).concat(S.bench.filter(Boolean), S.pending ? [S.pending] : []);
        if (!all.some(u => u && u.uid === uid)) return { ok: false, reason: 'NO_UNIT' };
        if (!S.equip) S.equip = {};
        if (S.equip[id] !== uid && S.pusaka.filter(x => S.equip[x] === uid).length >= 3) return { ok: false, reason: 'FULL' };
        S.equip[id] = uid; // satu Pusaka hanya di satu Titisan; memasang ke Titisan lain = pindah
        return { ok: true };
    }
    /** HUD: "Pasang otomatis". Memasang tiap Pusaka per-Titisan yang belum dipakai ke Titisan di Sasana yang paling cocok:
        jarak dekat (range <= 1) cocok dengan hp/def/shield/dr/regen/atk, jarak jauh dengan atk/as/crit/mana; bintang lebih tinggi lebih diutamakan;
        beban dibagi rata (maks 3 per Titisan). Mengembalikan jumlah yang terpasang. Tidak memindahkan Pusaka yang sudah terpasang. */
    function autoEquip(data, S) {
        const ix = index(data); if (!canManage(S)) return { ok: false, reason: 'PHASE', n: 0 };
        if (!S.equip) S.equip = {};
        const units = Object.keys(S.board).map(k => S.board[k]).filter(Boolean); if (!units.length) return { ok: true, n: 0 };
        const load = u => S.pusaka.filter(x => S.equip[x] === u.uid).length;
        let n = 0;
        S.pusaka.filter(id => !S.equip[id] || !units.concat(S.bench.filter(Boolean)).some(u => u.uid === S.equip[id])).forEach(id => {
            const p = ix.pusaka[id]; if (!Object.keys(p.fx).some(k => NS.Synergy.UNIT_KEYS.indexOf(k) >= 0)) return;
            let best = null, bs = -1e9;
            units.forEach(u => {
                if (load(u) >= 3) return;
                const c = ix.chars[u.id], melee = c.stats1Star.range <= 1, fk = melee ? ['hp', 'def', 'shield', 'dr', 'regen', 'atk'] : ['atk', 'as', 'crit', 'mana'];
                const sc = (Object.keys(p.fx).some(k => fk.indexOf(k) >= 0) ? 10 : 0) + u.star * 2 + c.cost * 0.3 - load(u) * 3;
                if (sc > bs) { bs = sc; best = u; }
            });
            if (best && equipPusaka(data, S, id, best.uid).ok) n++;
        });
        return { ok: true, n: n };
    }
    function unequipPusaka(S, id) { if (S.equip && S.equip[id]) { delete S.equip[id]; return { ok: true }; } return { ok: false, reason: 'NOT_EQUIPPED' }; }
    function choosePusaka(data, S, id) {
        const ix = index(data);
        if (!S.pusakaOffer || S.pusakaOffer.indexOf(id) < 0) return { ok: false, reason: 'NO_OFFER' };
        S.pusaka.push(id);
        S.pusakaOffer = null;
        const fx = ix.pusaka[id].fx;
        if (fx.hpPlus) { S.maxHp += fx.hpPlus; S.hp += fx.hpPlus; }
        return { ok: true, pusaka: ix.pusaka[id] };
    }

    /** Terapkan hasil pertempuran ke match: damage Commander, streak, emas, XP, ronde berikutnya. */
    function finishRound(data, S, res) {
        const ix = index(data);
        if (S.phase !== 'prep' && S.phase !== 'battle') return { ok: false, reason: 'PHASE' };
        S.phase = 'battle';
        const win = res.leaks === 0;
        S.hp -= res.leakDamage;
        if (win) { S.winStreak++; S.loseStreak = 0; S.roundsWon++; } else { S.loseStreak++; S.winStreak = 0; }
        const summary = { round: S.round, win: win, leaks: res.leaks, leakDamage: res.leakDamage, income: null, over: false, goldLost: 0, pusakaOffer: null };
        if (S.hp <= 0) {
            S.hp = 0; S.over = true; S.phase = 'over'; summary.over = true;
            return { ok: true, summary: summary };
        }
        const fxc = NS.Synergy && NS.Synergy.fxCompile ? NS.Synergy.fxCompile(data, S) : null;
        if (res.goldLoss > 0) { summary.goldLost = Math.min(S.gold, res.goldLoss); S.gold -= summary.goldLost; } // Penjaga 'steal': emas dicuri
        const interest = Math.min(ix.eco.interest.maxBonus + (fxc ? fxc.eco.interestCap : 0), Math.floor(S.gold / ix.eco.interest.goldPerBonus));
        const streak = streakGold(ix, Math.max(S.winStreak, S.loseStreak));
        const base = ix.eco.baseIncomePerRound;
        const extra = fxc ? fxc.eco.gold : 0; // Warisan Tau + Pusaka + Senapati Tuk
        S.gold += base + interest + streak + extra;
        summary.income = { base: base, interest: interest, streak: streak, extra: extra, parts: fxc ? fxc.eco.goldParts : null, streakKind: S.winStreak > 0 ? 'win' : 'lose', streakN: Math.max(S.winStreak, S.loseStreak), total: base + interest + streak + extra };
        if (res.boss && res.boss.killed && ix.rules.fx && S.pusaka.length < PUSAKA_MAX) { S.pusakaOffer = offerPusaka(ix, S); summary.pusakaOffer = S.pusakaOffer.slice(); }
        addXp(ix, S, ix.eco.passiveXpPerRound);
        if (S.round >= ix.rules.match.finalBossRound) S.endless = true;
        S.round++;
        S.refreshCount = 0;
        S.phase = 'prep';
        if (S.autoUpgrade) mergeAll(S); // gabungan yang tertunda karena pembelian saat pupuh (Titisan di Sasana ikut dihitung sekarang)
        settlePending(S);
        drawShop(ix, S);
        return { ok: true, summary: summary };
    }

    /** Sidik jari state match (untuk uji determinisme dan, nanti, deteksi selisih antar perangkat). */
    function hash(S) {
        const parts = [S.seed, S.arenaId, S.round, S.phase, S.gold, S.xp, S.level, S.hp, S.winStreak, S.loseStreak, S.shop.join(','), S.uid, S.refreshCount, S.senapatiId || '-', (S.pusaka || []).join('+'), JSON.stringify(S.equip || {}), (S.pusakaOffer || []).join('+'), S.maxHp, S.autoUpgrade ? 1 : 0, S.pending ? S.pending.id + ':' + S.pending.star : '-'];
        parts.push(S.bench.map(u => u ? u.id + ':' + u.star : '-').join(','));
        parts.push(boardKeys(S).map(k => k + '=' + S.board[k].id + ':' + S.board[k].star).join(';'));
        parts.push(Object.keys(S.pool).sort().map(k => k + S.pool[k]).join(','));
        return R.mix(parts);
    }

    NS.Core = {
        index: index, create: create, refresh: refresh, buy: buy, sell: sell, sellValue: sellValue, move: move, buyXp: buyXp,
        battleSetup: battleSetup, finishRound: finishRound, unitStats: unitStats, mergeAll: mergeAll,
        allUnits: allUnits, getAt: getAt, boardKeys: boardKeys, unitLimit: unitLimit, boardCount: boardCount,
        streakGold: streakGold, hash: hash, choosePusaka: choosePusaka, newPool: newPool, rivalBuy: rivalBuy, releaseAll: releaseAll, equipPusaka: equipPusaka, autoEquip: autoEquip, unequipPusaka: unequipPusaka, rerollCost: rerollCost, upgrade: upgrade, upgradeGroups: upgradeGroups, setAutoUpgrade: setAutoUpgrade, settlePending: settlePending, COPIES: COPIES, BENCH: BENCH
    };
    GH.ns = NS;
    GH.nsCore = NS.Core;
    if (typeof module !== 'undefined' && module.exports) module.exports = NS;
})(typeof window !== 'undefined' ? window : globalThis);
