/* =====================================================================
   NUSANTARA SIRNA (Game 5) — validator data. LOGIKA MURNI (tanpa DOM).
   Bisa dimuat di browser (window.NSSchema) maupun Node (require).
   Memeriksa bahwa data/nusantara/*.json utuh dan saling cocok SEBELUM game dipakai,
   supaya salah ketik di data langsung ketahuan, bukan jadi bug aneh saat bermain.
===================================================================== */
(function (root) {
    'use strict';

    const isNum = v => typeof v === 'number' && isFinite(v);
    const isInt = v => Number.isInteger(v);
    const isStr = v => typeof v === 'string' && v.trim().length > 0;
    const low = s => String(s).trim().toLowerCase();

    /** data = { characters, synergies, commanders, arenas, bosses, economy, rules } (isi file JSON apa adanya) */
    function validate(data) {
        const errors = [];
        const warnings = [];
        const err = (where, msg) => errors.push(where + ': ' + msg);
        const need = (cond, where, msg) => { if (!cond) err(where, msg); return !!cond; };
        const d = data || {};

        const chars = d.characters && d.characters.characters;
        const syns = d.synergies && d.synergies.synergies;
        const cmds = d.commanders && d.commanders.commanders;
        const arenas = d.arenas && d.arenas.arenas;
        const bossMap = d.bosses && d.bosses.bosses;
        const eco = d.economy, rules = d.rules, rnd = d.rounds;

        if (!need(Array.isArray(chars), 'characters', 'harus berisi larik "characters"')) return finish();
        if (!need(Array.isArray(syns), 'synergies', 'harus berisi larik "synergies"')) return finish();
        if (!need(Array.isArray(cmds), 'commanders', 'harus berisi larik "commanders"')) return finish();
        if (!need(Array.isArray(arenas), 'arenas', 'harus berisi larik "arenas"')) return finish();
        if (!need(bossMap && typeof bossMap === 'object', 'bosses', 'harus berisi objek "bosses"')) return finish();
        if (!need(eco && typeof eco === 'object', 'economy', 'file tidak termuat')) return finish();
        if (!need(rules && typeof rules === 'object', 'rules', 'file tidak termuat')) return finish();

        /* ---------- sinergi ---------- */
        need(syns.length === 16, 'synergies', 'harus 16, ditemukan ' + syns.length);
        const synByName = {}; const synIds = new Set();
        syns.forEach((s, i) => {
            const w = 'synergies[' + i + ']';
            if (!need(isStr(s.id) && isStr(s.name), w, 'id/name kosong')) return;
            need(!synIds.has(s.id), w, 'id ganda "' + s.id + '"'); synIds.add(s.id);
            need(!/\s/.test(s.name.trim()), w, 'nama harus satu kata: "' + s.name + '"');
            need(s.kind === 'asal' || s.kind === 'laku', w, 'kind harus asal/laku');
            need(Array.isArray(s.thresholds) && s.thresholds.length === 3 && s.thresholds.every(isInt) && s.thresholds[0] < s.thresholds[1] && s.thresholds[1] < s.thresholds[2], w, 'thresholds harus 3 bilangan bulat menaik');
            need(Array.isArray(s.effectsText) && s.effectsText.length === 3 && s.effectsText.every(isStr), w, 'effectsText harus 3 teks');
            need(Array.isArray(s.effectsDraft) && s.effectsDraft.length === 3 && s.effectsDraft.every(e => e && typeof e === 'object'), w, 'effectsDraft harus 3 objek');
            synByName[low(s.name)] = s;
        });
        need(syns.filter(s => s.kind === 'asal').length === 8, 'synergies', 'harus 8 Asal');
        need(syns.filter(s => s.kind === 'laku').length === 8, 'synergies', 'harus 8 Laku');

        /* ---------- ekonomi (dibutuhkan untuk cek karakter) ---------- */
        ['startingGold', 'baseIncomePerRound', 'rerollCost', 'buyXpCost', 'xpPerPurchase', 'passiveXpPerRound', 'shopSlots', 'benchSlots', 'maxLevel'].forEach(k => need(isNum(eco[k]), 'economy.' + k, 'harus angka'));
        need(eco.shopSlots === 5, 'economy.shopSlots', 'harus 5');
        need(eco.benchSlots === 9, 'economy.benchSlots', 'harus 9');
        need(eco.maxLevel === 9, 'economy.maxLevel', 'harus 9');
        need(eco.interest && isNum(eco.interest.goldPerBonus) && isNum(eco.interest.maxBonus), 'economy.interest', 'tidak lengkap');
        need(Array.isArray(eco.streakBonus) && eco.streakBonus.length >= 1 && eco.streakBonus.every(x => isNum(x.minStreak) && isNum(x.gold)), 'economy.streakBonus', 'tidak lengkap');
        need(eco.starMultiplier && eco.starMultiplier.star1 === 1 && eco.starMultiplier.star2 === 1.8 && eco.starMultiplier.star3 === 3.24, 'economy.starMultiplier', 'harus 1 / 1,8 / 3,24');
        need(eco.sellMultiplierByStar && eco.sellMultiplierByStar.star1 === 1 && eco.sellMultiplierByStar.star2 === 3 && eco.sellMultiplierByStar.star3 === 9, 'economy.sellMultiplierByStar', 'harus 1 / 3 / 9');
        if (need(Array.isArray(eco.levels) && eco.levels.length === 9, 'economy.levels', 'harus 9 level')) {
            eco.levels.forEach((lv, i) => {
                const w = 'economy.levels[' + i + ']';
                need(lv.level === i + 1, w, 'nomor level harus ' + (i + 1));
                need(isInt(lv.xpToNext) && isInt(lv.unitLimit), w, 'xpToNext/unitLimit harus bilangan bulat');
                need(lv.unitLimit === i + 1, w, 'unitLimit harus sama dengan level (' + (i + 1) + ')');
                need(Array.isArray(lv.shopOddsPercent) && lv.shopOddsPercent.length === 5 && lv.shopOddsPercent.reduce((a, b) => a + b, 0) === 100, w, 'shopOddsPercent harus 5 angka berjumlah 100');
            });
        }
        const pool = eco.poolByCost || {};
        const psc = eco.poolScaleByPlayers || {}; // HUD10
        for (let n = 1; n <= 5; n++) need(typeof psc[n] === 'number' && psc[n] > 0 && psc[n] <= 1, 'economy.poolScaleByPlayers.' + n, 'skala pool harus angka 0-1 untuk 1-5 pemain');
        const wantCopies = { 1: 22, 2: 20, 3: 17, 4: 12, 5: 9 };
        for (let c = 1; c <= 5; c++) need(pool[c] && pool[c].copiesPerCharacter === wantCopies[c], 'economy.poolByCost.' + c, 'salinan per karakter harus ' + wantCopies[c]);

        /* ---------- karakter ---------- */
        need(chars.length === 40, 'characters', 'harus 40, ditemukan ' + chars.length);
        const charIds = new Set(), charNames = new Set(); const perCost = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0};
        const memberCount = {};
        chars.forEach((c, i) => {
            const w = 'characters[' + i + ']' + (c && c.id ? ' (' + c.id + ')' : '');
            if (!need(c && isStr(c.id) && isStr(c.name), w, 'id/name kosong')) return;
            need(!charIds.has(c.id), w, 'id ganda'); charIds.add(c.id);
            need(!charNames.has(low(c.name)), w, 'nama ganda "' + c.name + '"'); charNames.add(low(c.name));
            need(!/\s/.test(c.name.trim()), w, 'nama harus satu kata: "' + c.name + '"');
            need(isInt(c.cost) && c.cost >= 1 && c.cost <= 5, w, 'cost harus 1-5'); if (perCost[c.cost] !== undefined) perCost[c.cost]++;
            const sa = synByName[low(c.asal)], sl = synByName[low(c.laku)];
            need(sa && sa.kind === 'asal', w, 'asal "' + c.asal + '" tidak ada di sinergi Asal');
            need(sl && sl.kind === 'laku', w, 'laku "' + c.laku + '" tidak ada di sinergi Laku');
            if (sa) memberCount[sa.id] = (memberCount[sa.id] || 0) + 1;
            if (sl) memberCount[sl.id] = (memberCount[sl.id] || 0) + 1;
            const st = c.stats1Star || {};
            ['hp', 'atk', 'attackSpeed', 'range', 'armor', 'resist', 'manaStart', 'manaMax'].forEach(k => need(isNum(st[k]) && st[k] >= 0, w + '.stats1Star.' + k, 'harus angka >= 0'));
            need(st.hp > 0 && st.atk > 0 && st.attackSpeed > 0 && st.range >= 1 && st.manaMax > 0, w + '.stats1Star', 'hp/atk/attackSpeed/manaMax harus > 0 dan range >= 1');
            const sk = c.skill || {};
            need(isStr(sk.name) && isStr(sk.type) && isStr(sk.description) && isNum(sk.value) && isNum(sk.durationSec), w + '.skill', 'name/type/description/value/durationSec harus lengkap');
        });
        for (let c = 1; c <= 5; c++) if (pool[c]) need(perCost[c] === pool[c].characters, 'characters', 'jumlah karakter biaya ' + c + ' = ' + perCost[c] + ', economy mengatakan ' + pool[c].characters);
        syns.forEach((s, i) => { if (s.memberCount !== undefined) need((memberCount[s.id] || 0) === s.memberCount, 'synergies[' + i + '] (' + s.id + ')', 'memberCount ' + s.memberCount + ' tapi karakter yang memakainya ' + (memberCount[s.id] || 0)); });

        /* ---------- arena ---------- */
        need(arenas.length === 9, 'arenas', 'harus 9, ditemukan ' + arenas.length);
        const arenaNames = new Set(), arenaIds = new Set();
        arenas.forEach((a, i) => {
            const w = 'arenas[' + i + ']' + (a && a.id ? ' (' + a.id + ')' : '');
            if (!need(a && isStr(a.id) && isStr(a.name), w, 'id/name kosong')) return;
            need(!arenaIds.has(a.id), w, 'id ganda'); arenaIds.add(a.id); arenaNames.add(a.name);
            const lay = a.layout;
            if (!need(Array.isArray(lay) && lay.length === 7 && lay.every(r => typeof r === 'string' && r.length === 9), w + '.layout', 'harus 7 string x 9 karakter')) return;
            const cnt = { S: 0, E: 0, J: 0, U: 0 }; const pathSet = new Set(); const unitSet = new Set();
            lay.forEach((row, r) => [...row].forEach((ch, c) => {
                if (ch !== '.' && cnt[ch] === undefined) err(w + '.layout', 'karakter tidak dikenal "' + ch + '" di baris ' + (r + 1) + ' kolom ' + (c + 1));
                if (cnt[ch] !== undefined) cnt[ch]++;
                if (ch === 'S' || ch === 'E' || ch === 'J') pathSet.add((r + 1) + ',' + (c + 1));
                if (ch === 'U') unitSet.add((r + 1) + ',' + (c + 1));
            }));
            need(cnt.S === 1 && cnt.E === 1, w + '.layout', 'harus tepat 1 portal S dan 1 Commander E');
            need(pathSet.size === 25, w + '.layout', 'sel jalur harus 25, ditemukan ' + pathSet.size);
            need(unitSet.size === 24, w + '.layout', 'petak unit harus 24, ditemukan ' + unitSet.size);
            const po = a.pathOrder;
            if (need(Array.isArray(po) && po.length === 25 && po.every(p => Array.isArray(p) && p.length === 2), w + '.pathOrder', 'harus 25 pasangan [baris, kolom]')) {
                const seen = new Set();
                po.forEach((p, k) => {
                    const key = p[0] + ',' + p[1];
                    need(pathSet.has(key), w + '.pathOrder[' + k + ']', 'bukan sel jalur: ' + key);
                    need(!seen.has(key), w + '.pathOrder[' + k + ']', 'sel ganda: ' + key); seen.add(key);
                    if (k > 0) need(Math.abs(p[0] - po[k - 1][0]) + Math.abs(p[1] - po[k - 1][1]) === 1, w + '.pathOrder[' + k + ']', 'tidak bersebelahan dengan sel sebelumnya');
                });
                const sCell = lay.map((row, r) => row.indexOf('S') >= 0 ? [r + 1, row.indexOf('S') + 1] : null).find(Boolean);
                const eCell = lay.map((row, r) => row.indexOf('E') >= 0 ? [r + 1, row.indexOf('E') + 1] : null).find(Boolean);
                if (sCell) need(po[0][0] === sCell[0] && po[0][1] === sCell[1], w + '.pathOrder', 'sel pertama harus portal S');
                if (eCell) need(po[24][0] === eCell[0] && po[24][1] === eCell[1], w + '.pathOrder', 'sel terakhir harus Commander E');
                need(Array.isArray(a.portalS) && sCell && a.portalS[0] === sCell[0] && a.portalS[1] === sCell[1], w + '.portalS', 'tidak cocok dengan layout');
                need(Array.isArray(a.commanderE) && eCell && a.commanderE[0] === eCell[0] && a.commanderE[1] === eCell[1], w + '.commanderE', 'tidak cocok dengan layout');
            }
            const cov = a.unitTileCoverage;
            if (need(Array.isArray(cov) && cov.length === 24, w + '.unitTileCoverage', 'harus 24 petak')) cov.forEach((t, k) => need(unitSet.has(t.row + ',' + t.col), w + '.unitTileCoverage[' + k + ']', 'bukan petak unit: ' + t.row + ',' + t.col));
            need(isNum(a.enemyHpMultiplier) && a.enemyHpMultiplier >= 0.8 && a.enemyHpMultiplier <= 1.13, w + '.enemyHpMultiplier', 'harus 0,80-1,13');
            need(isStr(a.environmentEffectDraft), w, 'environmentEffectDraft kosong');
        });

        /* ---------- commander ---------- */
        need(cmds.length === 8, 'commanders', 'harus 8, ditemukan ' + cmds.length);
        const cmdIds = new Set(), cmdNames = new Set();
        cmds.forEach((c, i) => {
            const w = 'commanders[' + i + ']' + (c && c.id ? ' (' + c.id + ')' : '');
            if (!need(c && isStr(c.id) && isStr(c.name), w, 'id/name kosong')) return;
            need(!cmdIds.has(c.id), w, 'id ganda'); cmdIds.add(c.id); cmdNames.add(c.name);
            need(!/\s/.test(c.name.trim()), w, 'nama harus satu kata');
            need(synByName[low(c.asal)] && synByName[low(c.asal)].kind === 'asal', w, 'asal "' + c.asal + '" tidak ada');
            need(arenaNames.has(c.affinityArena), w, 'affinityArena "' + c.affinityArena + '" tidak ada di arena');
            need(isNum(c.passiveValue) && isNum(c.passiveValueOnAffinityArena) && isStr(c.passive), w, 'pasif tidak lengkap');
        });
        arenas.forEach((a, i) => { if (a.affinityCommander) need(cmdNames.has(a.affinityCommander), 'arenas[' + i + ']', 'affinityCommander "' + a.affinityCommander + '" tidak ada di Commander'); });

        /* ---------- bos ---------- */
        const bossKeys = Object.keys(bossMap);
        need(bossKeys.length === 9, 'bosses', 'harus 9 arena, ditemukan ' + bossKeys.length);
        let totalBoss = 0, emptyWeak = 0;
        bossKeys.forEach(k => {
            need(arenaNames.has(k), 'bosses', 'arena "' + k + '" tidak ada di arenas.json');
            const list = bossMap[k]; const w = 'bosses["' + k + '"]';
            if (!need(Array.isArray(list) && list.length === 15, w, 'harus 15 bos (10 utama + 5 Ekstrem)')) return;
            totalBoss += list.length;
            const want = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 51, 52, 53, 54, 55];
            list.forEach((b, j) => {
                const ww = w + '[' + j + ']';
                need(b.round === want[j], ww, 'ronde harus ' + want[j] + ', ditemukan ' + b.round);
                need(b.tier === (want[j] >= 51 ? 'ekstrem' : want[j] === 50 ? 'puncak' : 'bos'), ww, 'tier tidak sesuai ronde (harus bos / puncak untuk ronde 50 / ekstrem)');
                need(isStr(b.boss) && isStr(b.roundName) && isStr(b.mechanic), ww, 'boss/roundName/mechanic kosong');
                need(Array.isArray(b.weakAgainst) && b.weakAgainst.length <= 2 && b.weakAgainst.every(n => synByName[low(n)]), ww, 'weakAgainst harus 0-2 nama sinergi yang ada: ' + JSON.stringify(b.weakAgainst));
                if (Array.isArray(b.weakAgainst) && b.weakAgainst.length === 0) emptyWeak++;
            });
        });
        need(totalBoss === 135, 'bosses', 'total harus 135, ditemukan ' + totalBoss);
        if (emptyWeak > 0) warnings.push('bosses: ' + emptyWeak + ' dari ' + totalBoss + ' bos tidak punya kelemahan sinergi (weakAgainst kosong); spesifikasi bilang 1-2. Data yang menang: bos itu tanpa bonus kelemahan.');
        if (d.bosses.replacedBosses) {
            const sacred = Object.keys(d.bosses.replacedBosses);
            bossKeys.forEach(k => (bossMap[k] || []).forEach(b => { if (b && sacred.indexOf(b.boss) >= 0) err('bosses["' + k + '"]', 'bos sakral yang sudah diganti muncul lagi: ' + b.boss); }));
        }

        /* ---------- aturan ---------- */
        need(rules.match && rules.match.commanderStartHp === 100 && rules.match.finalBossRound === 50 && rules.match.bossEveryRounds === 5, 'rules.match', 'HP awal 100, bos tiap 5 ronde, bos akhir ronde 50');
        const wv = rules.waves || {};
        need(wv.creepBaseHp === 300 && wv.creepHpGrowthPerRound === 1.042 && wv.creepBaseAtk === 20 && wv.creepAtkGrowthPerRound === 1.05 && wv.baseCreepCount === 6, 'rules.waves', 'angka gelombang tidak sesuai spesifikasi');
        need(wv.bossTotalHpMultiplierVsNormalWave === 1.6 && wv.extremeTotalHpMultiplierVsNormalWave === 2.2 && wv.bossAtkMultiplier === 1.5, 'rules.waves', 'pengali bos tidak sesuai spesifikasi');
        need(wv.speedCellsPerSecondDraft && isNum(wv.speedCellsPerSecondDraft.creep) && isNum(wv.speedCellsPerSecondDraft.boss) && isNum(wv.spawnGapSecondsDraft), 'rules.waves', 'kecepatan/jarak spawn tidak lengkap');
        need(rules.scoring && rules.scoring.minRoundForScore === 3, 'rules.scoring', 'minRoundForScore harus 3');
        /* ---------- ronde (nama, deskripsi, waktu persiapan) ---------- */
        if (need(rnd && typeof rnd === 'object', 'rounds', 'file tidak termuat')) {
            need(isInt(rnd.prepSeconds) && rnd.prepSeconds >= 10 && rnd.prepSeconds <= 180, 'rounds.prepSeconds', 'harus bilangan bulat 10-180');
            need(isNum(rnd.transitionSeconds) && rnd.transitionSeconds >= 1 && rnd.transitionSeconds <= 10, 'rounds.transitionSeconds', 'harus 1-10 detik');
            need(rnd.endless && isStr(rnd.endless.name) && isStr(rnd.endless.desc), 'rounds.endless', 'name/desc kosong');
            const nr = rnd.normalRounds || {};
            for (let r = 1; r <= 49; r++) {
                if (r % 5 === 0) { need(nr[r] === undefined, 'rounds.normalRounds[' + r + ']', 'ronde bos memakai nama dari bosses.json, hapus dari sini'); continue; }
                const e = nr[r];
                if (!need(e && isStr(e.name) && isStr(e.desc), 'rounds.normalRounds[' + r + ']', 'name/desc kosong atau tidak ada')) continue;
                need(e.desc.length <= 80, 'rounds.normalRounds[' + r + ']', 'deskripsi terlalu panjang (maks 80 karakter)');
            }
        }
        need(rules.rooms && rules.rooms.partyMin === 3 && rules.rooms.partyMax === 5 && rules.rooms.duelPlayers === 2, 'rules.rooms', 'duel 2, party 3-5');

        return finish();

        function finish() {
            return {
                ok: errors.length === 0,
                errors: errors,
                warnings: warnings,
                summary: {
                    characters: Array.isArray(chars) ? chars.length : 0,
                    synergies: Array.isArray(syns) ? syns.length : 0,
                    commanders: Array.isArray(cmds) ? cmds.length : 0,
                    arenas: Array.isArray(arenas) ? arenas.length : 0,
                    bosses: bossMap && typeof bossMap === 'object' ? Object.keys(bossMap).reduce((n, k) => n + ((bossMap[k] || []).length || 0), 0) : 0
                }
            };
        }
    }

    const API = { validate: validate, FILES: ['characters', 'synergies', 'commanders', 'arenas', 'bosses', 'economy', 'rules', 'rounds'] };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    else { root.GH = root.GH || {}; root.GH.nsSchema = API; root.NSSchema = API; }
})(typeof window !== 'undefined' ? window : globalThis);
