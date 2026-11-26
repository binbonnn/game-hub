/* =====================================================================
   NUSANTARA SIRNA — sim-core: match multiplayer (Fase 6, langkah 1).
   LOGIKA MURNI (tanpa DOM, tanpa jaringan, tanpa Firebase). Dipakai nanti oleh lapisan transport (Firestore).
   Tiap pemain bermain di arena sendiri dengan seed sama; pertempuran tiap pemain deterministik dari formasi yang dikirim,
   jadi perangkat mana pun bisa menghitung ulang hasil semua pemain dari formasi yang sama (cek silang tanpa server).
   Mode: 'duel' (tepat 2), 'party' (3-5, kompetitif), 'coop' (3-5, HP Commander bersama).
===================================================================== */
(function (root) {
    'use strict';
    const GH = root.GH = root.GH || {};
    const NS = GH.ns = GH.ns || {};
    const R = NS.rng;
    const MODES = { duel: { min: 2, max: 2 }, party: { min: 3, max: 5 }, coop: { min: 3, max: 5 } };
    const MAX_PLAYERS = 5, MIN_SCORE_ROUND = 3;
    const keyOf = n => String(n || '').trim().toLowerCase();
    const cleanName = n => String(n || '').trim();
    /** Nama dipakai sebagai kunci kolom Firestore: tanpa titik, garis miring, kurung siku, bintang, tilde, backtick; 1-16 karakter. */
    const validName = n => { const t = cleanName(n); return t.length >= 1 && t.length <= 16 && !/[.\/\[\]*~`]/.test(t); };
    const validCode = c => /^[A-Z0-9]{4,6}$/.test(String(c || ''));

    /* ---------- lobi ---------- */
    function createRoom(opts) {
        if (!validCode(opts.code)) return { ok: false, reason: 'BAD_CODE' };
        if (!MODES[opts.mode]) return { ok: false, reason: 'BAD_MODE' };
        const host = cleanName(opts.host);
        if (!validName(host)) return { ok: false, reason: 'NO_NAME' };
        const room = { code: opts.code, mode: opts.mode, seed: (opts.seed === undefined ? 1 : opts.seed) >>> 0, speed: opts.speed === 2 ? 2 : 1, started: false, host: keyOf(host), order: [], players: {} };
        addPlayer(room, host);
        return { ok: true, room: room };
    }
    /** handicap per pemain diatur host: {gold, hp} tambahan (>= 0). */
    function addPlayer(room, name) {
        const nm = cleanName(name);
        if (room.started) return { ok: false, reason: 'STARTED' };
        if (!validName(nm)) return { ok: false, reason: 'NO_NAME' };
        if (room.players[keyOf(nm)]) return { ok: false, reason: 'DUP_NAME' }; // nama identik (tidak peka huruf besar-kecil) ditolak
        if (room.order.length >= MAX_PLAYERS || room.order.length >= MODES[room.mode].max) return { ok: false, reason: 'FULL' };
        room.players[keyOf(nm)] = { name: nm, ready: false, handicap: { gold: 0, hp: 0 }, senapatiId: null };
        room.order.push(keyOf(nm));
        return { ok: true };
    }
    function removePlayer(room, name) {
        const k = keyOf(name); if (!room.players[k]) return { ok: false, reason: 'NO_PLAYER' };
        delete room.players[k]; room.order = room.order.filter(x => x !== k);
        if (room.host === k && room.order.length) room.host = room.order[0];
        return { ok: true };
    }
    function setReady(room, name, v) { const p = room.players[keyOf(name)]; if (!p) return { ok: false, reason: 'NO_PLAYER' }; p.ready = !!v; return { ok: true }; }
    function setHandicap(room, byName, name, h) {
        if (keyOf(byName) !== room.host) return { ok: false, reason: 'NOT_HOST' };
        const p = room.players[keyOf(name)]; if (!p) return { ok: false, reason: 'NO_PLAYER' };
        p.handicap = { gold: Math.max(0, Math.min(20, Math.floor(h.gold || 0))), hp: Math.max(0, Math.min(100, Math.floor(h.hp || 0))) };
        return { ok: true };
    }
    function canStart(room) {
        const n = room.order.length, m = MODES[room.mode];
        if (room.started) return { ok: false, reason: 'STARTED' };
        if (n < m.min || n > m.max) return { ok: false, reason: 'COUNT' };
        if (!room.order.every(k => room.players[k].ready)) return { ok: false, reason: 'NOT_READY' };
        return { ok: true };
    }

    /* ---------- match ---------- */
    function start(data, room) {
        const c = canStart(room); if (!c.ok) return c;
        const ix = NS.Core.index(data), ids = Object.keys(ix.arenas);
        const arenaId = ids[R.make(R.mix([room.seed, 'arena'])).int(ids.length)]; // satu jenis arena per match, sama untuk semua
        const M = { code: room.code, mode: room.mode, seed: room.seed, arenaId: arenaId, speed: room.speed, round: 1, phase: 'prep', ended: false, extreme: false, extremeKeys: [],
            order: room.order.slice(), players: {}, sharedHp: 0, sharedMax: 0, outCount: 0, lastRound: 0, winners: [], reason: null, log: [] };
        const startHp = ix.rules.match.commanderStartHp;
        room.order.forEach(k => {
            const rp = room.players[k];
            M.players[k] = { name: rp.name, state: 'alive', connected: true, hp: startHp + rp.handicap.hp, maxHp: startHp + rp.handicap.hp, handicap: rp.handicap, senapatiId: rp.senapatiId, outRound: null, outOrder: null, lastRound: 0, bossSec55: null };
        });
        if (room.mode === 'coop') { M.sharedMax = startHp * room.order.length; M.sharedHp = M.sharedMax; room.order.forEach(k => { M.players[k].hp = M.sharedHp; M.players[k].maxHp = M.sharedMax; }); }
        room.started = true;
        return { ok: true, match: M };
    }

    /** Sesi Core untuk satu pemain: seed dan arena sama; handicap diterapkan; ukuran pool mengikuti jumlah pemain. */
    function playerSession(data, M, name) {
        const k = keyOf(name), p = M.players[k]; if (!p) throw new Error('pemain tidak ada: ' + name);
        const S = NS.Core.create(data, { seed: M.seed, arenaId: M.arenaId, senapatiId: p.senapatiId, players: M.order.length });
        S.gold += p.handicap.gold;
        if (M.mode !== 'coop') { S.hp = p.hp; S.maxHp = p.maxHp; }
        else { S.hp = M.sharedHp; S.maxHp = M.sharedMax; }
        return S;
    }

    /** Autopilot pemain terputus: beli unit termurah selagi mampu, taruh di petak default (urutan petak arena). Mengembalikan setup pertempuran. */
    function autopilot(data, S) {
        const ix = NS.Core.index(data), tiles = ix.arenas[S.arenaId].tiles;
        for (let guard = 0; guard < 60; guard++) {
            let best = -1, bc = 99;
            S.shop.forEach((id, i) => { if (id && ix.chars[id].cost < bc && ix.chars[id].cost <= S.gold) { bc = ix.chars[id].cost; best = i; } });
            if (best < 0 || !NS.Core.buy(data, S, best).ok) break;
        }
        const lim = NS.Core.unitLimit(ix, S);
        for (let i = 0; i < tiles.length && NS.Core.boardCount(S) < lim; i++) {
            const t = tiles[i]; if (S.board[t[0] + ',' + t[1]]) continue;
            const bi = S.bench.findIndex(u => u); if (bi < 0) break;
            NS.Core.move(data, S, { w: 'bench', i: bi }, { w: 'board', r: t[0], c: t[1] });
        }
        return NS.Core.battleSetup(data, S);
    }

    /* ---------- koneksi dan keluar ---------- */
    function setConnected(M, name, v) { const p = M.players[keyOf(name)]; if (!p || p.state === 'quit') return { ok: false }; p.connected = !!v; return { ok: true }; }
    const aliveKeys = M => M.order.filter(k => M.players[k].state === 'alive' && (!M.extreme || M.extremeKeys.indexOf(k) >= 0));
    /** Pemain yang harus dimainkan autopilot ronde ini. */
    const autopilotKeys = M => aliveKeys(M).filter(k => !M.players[k].connected);

    /** Keluar sukarela: skor match hangus. Match berhenti bila tersisa 1 pemain hidup (menang). */
    function leave(M, name) {
        const k = keyOf(name), p = M.players[k]; if (!p || p.state === 'quit') return { ok: false, reason: 'NO_PLAYER' };
        if (M.ended) { p.state = 'quit'; return { ok: true }; }
        const wasAlive = p.state === 'alive';
        p.state = 'quit'; p.connected = false; p.outRound = p.outRound || M.round;
        if (wasAlive) { p.outOrder = ++M.outCount; M.log.push({ round: M.round, k: 'quit', who: k }); }
        checkLast(M);
        return { ok: true };
    }
    function checkLast(M) {
        if (M.ended) return;
        const alive = M.order.filter(k => M.players[k].state === 'alive');
        if (alive.length <= 1) finish(M, alive.length ? alive : [], alive.length ? 'LAST_STANDING' : 'ALL_OUT');
    }
    function finish(M, winners, reason) { M.ended = true; M.phase = 'over'; M.winners = winners.slice(); M.reason = reason; }

    /* ---------- ronde ---------- */
    function emptySetup(M) { return { round: M.round, seed: M.seed, arenaId: M.arenaId, units: [], fx: null, extreme: M.extreme }; }

    /**
     * Hitung hasil satu ronde untuk semua pemain yang berlaga. setups = { kunciPemain: battleSetup }.
     * Pemain tanpa setup (belum kirim) dianggap papan kosong. Mengembalikan {results, events}.
     */
    function resolveRound(data, M, setups) {
        if (M.ended) return { ok: false, reason: 'ENDED' };
        const ix = NS.Core.index(data), rules = ix.rules.match, final = rules.finalBossRound;
        const play = aliveKeys(M), results = {}, events = [];
        play.forEach(k => {
            const s = Object.assign({}, setups[k] || emptySetup(M), { round: M.round, seed: M.seed, arenaId: M.arenaId, extreme: M.extreme });
            const B = NS.Battle.create(data, s); NS.Battle.run(B);
            const res = NS.Battle.result(B); results[k] = res;
            M.players[k].lastRound = M.round;
            if (M.extreme && M.round === rules.extremeRounds[rules.extremeRounds.length - 1]) M.players[k].bossSec55 = res.boss && res.boss.killed ? res.seconds : Infinity;
        });
        M.lastRound = M.round;
        if (M.mode === 'coop') {
            let dmg = 0; play.forEach(k => { dmg += results[k].leakDamage; });
            M.sharedHp = Math.max(0, M.sharedHp - dmg);
            M.order.forEach(k => { M.players[k].hp = M.sharedHp; });
            if (M.sharedHp <= 0) { play.forEach(k => { const p = M.players[k]; p.state = 'out'; p.outRound = M.round; p.outOrder = M.outCount + 1; }); M.outCount++; finish(M, [], 'SHARED_HP_ZERO'); }
        } else {
            let any = 0;
            play.forEach(k => { const p = M.players[k]; p.hp = Math.max(0, p.hp - results[k].leakDamage); if (p.hp <= 0) { p.state = 'out'; p.outRound = M.round; any++; } });
            if (any) { M.outCount++; play.forEach(k => { const p = M.players[k]; if (p.state === 'out' && p.outOrder === null) p.outOrder = M.outCount; }); } // gugur bersamaan = urutan sama
            const alive = M.order.filter(k => M.players[k].state === 'alive' && (!M.extreme || M.extremeKeys.indexOf(k) >= 0));
            if (!M.ended) {
                if (alive.length === 0) { // semua yang tersisa gugur bersamaan: juara bersama
                    finish(M, play, 'ALL_OUT');
                } else if (alive.length === 1 && !M.extreme) finish(M, alive, 'LAST_STANDING');
                else if (M.extreme && alive.length === 1) finish(M, alive, 'LAST_STANDING');
                else if (!M.extreme && M.round >= final) endAtFinal(M, alive, rules);
                else if (M.extreme && M.round >= rules.extremeRounds[rules.extremeRounds.length - 1]) endExtreme(M, alive);
            }
        }
        if (!M.ended) { M.round++; }
        return { ok: true, results: results, events: events };
    }
    function endAtFinal(M, alive, rules) { // akhir ronde 50: HP tertinggi menang; seri puncak (2+) -> Ronde Ekstrem
        let top = 0; alive.forEach(k => { top = Math.max(top, M.players[k].hp); });
        const tied = alive.filter(k => M.players[k].hp === top);
        if (tied.length >= 2) { M.extreme = true; M.extremeKeys = tied; M.log.push({ round: M.round, k: 'extreme', who: tied.slice() }); }
        else finish(M, tied, 'HP_AT_FINAL');
    }
    function endExtreme(M, alive) { // setelah ronde 55: HP tertinggi; seri -> tercepat membunuh bos ronde 55; masih seri -> bersama
        let top = 0; alive.forEach(k => { top = Math.max(top, M.players[k].hp); });
        let w = alive.filter(k => M.players[k].hp === top);
        if (w.length > 1) { let best = Infinity; w.forEach(k => { best = Math.min(best, M.players[k].bossSec55); }); w = w.filter(k => M.players[k].bossSec55 === best); }
        finish(M, w, 'EXTREME_END');
    }

    /* ---------- peringkat dan skor ---------- */
    /** Peringkat akhir: pemain keluar sukarela paling bawah (skor hangus); sisanya menurut ronde dicapai, lalu HP, lalu pemenang di atas. */
    function ranking(M) {
        const reach = p => p.state === 'quit' ? -1 : (p.outRound || p.lastRound || M.lastRound);
        const rows = M.order.map(k => { const p = M.players[k]; return { key: k, name: p.name, state: p.state, round: reach(p), hp: p.hp, win: M.winners.indexOf(k) >= 0 }; });
        rows.sort((a, b) => (b.win - a.win) || (b.round - a.round) || (b.hp - a.hp));
        let rank = 0, prev = null;
        rows.forEach((r, i) => { const sig = (r.win ? 'w' : 'n') + r.round + ':' + r.hp; if (sig !== prev) rank = i + 1; r.rank = rank; prev = sig; }); // sama persis = peringkat dibagi
        return rows;
    }
    /** Skor match: ronde x 100 + HP x 5 + bonus. null bila hangus (keluar sukarela) atau match belum mencapai ronde 3. */
    function score(M, name) {
        const k = keyOf(name), p = M.players[k]; if (!p || p.state === 'quit') return null;
        const rows = ranking(M), me = rows.find(r => r.key === k);
        const reached = me.round;
        if (M.lastRound < MIN_SCORE_ROUND || reached < 1) return null;
        let bonus = 0;
        if (M.mode === 'duel' && me.win) bonus = 200;
        else if (M.mode === 'party') bonus = ({ 1: 400, 2: 250, 3: 150 })[me.rank] || 0;
        return reached * 100 + p.hp * 5 + bonus;
    }

    NS.Match = { MODES: MODES, createRoom: createRoom, addPlayer: addPlayer, removePlayer: removePlayer, setReady: setReady, setHandicap: setHandicap, canStart: canStart, start: start,
        playerSession: playerSession, autopilot: autopilot, setConnected: setConnected, autopilotKeys: autopilotKeys, aliveKeys: aliveKeys, leave: leave, resolveRound: resolveRound,
        ranking: ranking, score: score, keyOf: keyOf, validCode: validCode, validName: validName };
    GH.ns = NS;
    GH.nsMatch = NS.Match;
    if (typeof module !== 'undefined' && module.exports) module.exports = NS;
})(typeof window !== 'undefined' ? window : globalThis);
