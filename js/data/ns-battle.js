/* =====================================================================
   NUSANTARA SIRNA — sim-core: gelombang musuh dan simulasi pertempuran.
   LOGIKA MURNI (tanpa DOM), deterministik: langkah waktu tetap 0,05 dtk, acak hanya dari NS.rng
   (benih = benih match + ronde), tanpa Math.pow/sin (pangkat dihitung dengan perkalian berulang)
   supaya hasil identik di semua perangkat. Dipakai UI (animasi) dan Node (uji, bot).

   FASE 3: bila setup.fx ada (hasil NS.Synergy.fxCompile), pertempuran memakai mana + skill Titisan,
   efek Warisan, pasif Senapati, Pusaka, pertahanan musuh, dan mekanik Penjaga (kategori generik).
   Bila setup.fx TIDAK ada, perilakunya identik dengan simulator Fase 2 (dipakai uji lama).
   Semua angka efek dibaca dari data (rules.fx, characters.skill.fx, bosses.fx).
===================================================================== */
(function (root) {
    'use strict';
    const GH = root.GH = root.GH || {};
    const NS = GH.ns = GH.ns || {};
    const DT = 0.05;
    const MAX_TIME = 180;          // pengaman: sisa musuh dianggap lolos
    const ENDLESS_BOSS_STEP = 0.1; // Mode Tanpa Akhir: pengali HP bos naik 0,1 tiap bos setelah ronde 50 (keputusan terbuka, lihat DECISIONS.md)
    const EV_CAP = 300;

    function powi(base, n) { let x = 1; for (let i = 0; i < n; i++) x *= base; return x; }
    const cheb = (ar, ac, br, bc) => Math.max(Math.abs(ar - br), Math.abs(ac - bc));

    /* ---------- gelombang ---------- */
    function waveFor(data, round, arenaId, extreme) { // extreme = Ronde Ekstrem 51-55 (Duel/Party): satu Penjaga tier 'ekstrem' tiap ronde
        const ix = NS.Core.index(data);
        const w = ix.rules.waves, arena = ix.arenas[arenaId].a;
        const r = round;
        const n = w.baseCreepCount + Math.floor(r / 5) * w.extraCreepEvery5Rounds; // 6 + floor(r/5)
        const hpEach = w.creepBaseHp * powi(w.creepHpGrowthPerRound, r - 1) * arena.enemyHpMultiplier;
        const atk = w.creepBaseAtk * powi(w.creepAtkGrowthPerRound, r - 1);
        const isExt = !!extreme && ix.rules.match.extremeRounds.indexOf(r) >= 0;
        const boss = isExt || r % ix.rules.match.bossEveryRounds === 0;
        const sp = w.speedCellsPerSecondDraft;
        const normal = { count: n, hp: Math.round(hpEach), atk: atk, speed: sp.creep, gap: w.spawnGapSecondsDraft, leak: 1 + Math.floor(r / 10) };
        if (!boss) {
            return { kind: 'biasa', count: n, hp: normal.hp, atk: atk, speed: sp.creep, gap: w.spawnGapSecondsDraft, leak: normal.leak, boss: null };
        }
        let mult = isExt ? w.extremeTotalHpMultiplierVsNormalWave : w.bossTotalHpMultiplierVsNormalWave;
        if (!isExt && r > ix.rules.match.finalBossRound) mult += ENDLESS_BOSS_STEP * Math.floor((r - ix.rules.match.finalBossRound) / ix.rules.match.bossEveryRounds);
        const list = ix.bosses[arena.name].filter(b => b.round <= ix.rules.match.finalBossRound);
        const entry = isExt ? ix.bosses[arena.name].find(b => b.round === r && b.tier === 'ekstrem') : (list.find(b => b.round === r) || list[(r / 5 - 1) % list.length]);
        return {
            kind: 'bos', count: 1, hp: Math.round(n * hpEach * mult), atk: atk * w.bossAtkMultiplier, speed: sp.boss, gap: 0,
            pre: normal, // gelombang Sunyi yang keluar lebih dulu; Penjaga keluar sebagai musuh terakhir tepat setelah Sunyi terakhir
            leak: isExt ? w.leakDamage.extreme : w.leakDamage.boss, boss: { name: entry.boss, roundName: entry.roundName, mechanic: entry.mechanic, weakAgainst: entry.weakAgainst.slice(), tier: entry.tier, fx: (entry.fx || []).slice() }
        };
    }

    /* ---------- pertempuran ---------- */
    /** setup = NS.Core.battleSetup(...) -> {round, arenaId, seed, units:[{uid,id,star,r,c,stats,asal,laku,cost,manaStart,manaMax,skill}], fx} */
    function create(data, setup) {
        const ix = NS.Core.index(data);
        const arena = ix.arenas[setup.arenaId].a;
        const fx = setup.fx || null;
        const F = fx ? fx.F : null;
        const B = {
            t: 0, tick: 0, round: setup.round, arenaId: setup.arenaId, path: arena.pathOrder, fx: fx, F: F,
            rng: NS.rng.make(NS.rng.mix([setup.seed === undefined ? 1 : setup.seed, 'battle', setup.round])),
            wave: waveFor(data, setup.round, setup.arenaId, setup.extreme),
            units: [], enemies: [], spawned: 0, bossOut: false, bossT: null, bossDeadT: null, bossKilled: false, nextEnemyId: 1,
            leaks: 0, leakDamage: 0, killed: 0, done: false, h: 2166136261, ev: [], next: {}, shadows: 0, summoned: 0,
            bossK: {}, bossScale: 1, weakMul: 1, gateMul: 1, curse: 0, slowAs: 0, bossDmg: 0, leakDown: 0, quakeVal: 0, stole: 0
        };
        B.units = setup.units.map(u => makeUnit(B, u));
        if (fx) initFx(B, data, ix, setup);
        return B;
    }

    function makeUnit(B, u) {
        const sk = u.skill || null;
        return {
            uid: u.uid, id: u.id, star: u.star, r: u.r, c: u.c, hp: u.stats.hp, maxHp: u.stats.hp, atk: u.stats.atk, as: u.stats.attackSpeed,
            range: u.stats.range, armor: u.stats.armor, resist: u.stats.resist || 0, cd: 0, alive: true,
            asal: u.asal || '', laku: u.laku || '', cost: u.cost || 1,
            mana: u.manaStart || 0, manaMax: u.manaMax || 0, skill: sk,
            sh0: 0, sh1: 0, sh1T: 0, asMul: 0, atkMul: 0, crit: 0, critDmg: 0, pen: 0, dr: 0, reflect: 0, dodge: 0, regen: 0,
            pierce: 0, rearFirst: false, exec: 0, boom: 0, splash: 0, magicBasic: false, area: 0, areaDmg: 0, resShred: 0, magicMul: 0,
            dealt: 0, taken: 0, healBonus: 0, cleanse: false, share: 0, ccImmuneT: 0, stunT: 0, silT: 0, noShieldT: 0, reflectT: 0, reflectV: 0,
            buffs: [], echoT: 0, echoM: 0, hot: [], rear: u.stats.range >= 2, healer: !!(sk && /Heal/.test(sk.type)), attacker: !!(sk && /^Damage/.test(sk.type))
        };
    }

    function matches(un, name, kind) { return String(kind === 'asal' ? un.asal : un.laku).toLowerCase() === name.toLowerCase(); }

    function initFx(B, data, ix, setup) {
        const fx = B.fx, F = B.F;
        const P = fx.pusaka || {};
        let anyImmune = 0;
        fx.syn.forEach(e => { if (e.p.ccImmune) anyImmune = Math.max(anyImmune, e.p.ccImmune); });
        B.units.forEach(u => {
            // Pusaka (semua Titisan)
            const Q = (P.byUid && P.byUid[u.uid]) || {}; // HUD8: hanya Pusaka yang DIPAKAI Titisan ini
            u.atkMul += Q.atk || 0; u.asMul += Q.as || 0; u.armor += Q.def || 0; u.resist += Q.def || 0;
            u.maxHp = Math.round(u.maxHp * (1 + (Q.hp || 0))); u.hp = u.maxHp;
            u.crit += Q.crit || 0; u.dr += Q.dr || 0; u.regen += Q.regen || 0; u.mana += Q.mana || 0;
            u.sh0 += (Q.shield || 0) * u.maxHp;
            fx.syn.forEach(e => {
                const p = e.p, sc = e.scope;
                const mem = sc === 'all' ? true : sc === 'members' ? matches(u, e.name, e.kind) : false;
                if (e.id === 'rim' && u.rear) u.dodge += p.dodge || 0; // barisan belakang = Titisan berjangkauan >= 2
                if (!mem) return;
                if (p.shield) u.sh0 += p.shield * u.maxHp;
                if (p.def) { u.armor += p.def; u.resist += p.def; }
                u.regen += p.regen || 0; u.asMul += p.as || 0; u.atkMul += p.atk || 0;
                u.crit += p.crit || 0; u.critDmg += p.critDmg || 0; u.pen += p.pen || 0; u.dr += p.dr || 0; u.reflect += p.reflect || 0;
                u.mana += p.mana || 0; u.pierce = Math.max(u.pierce, p.pierce || 0); u.share += p.share || 0;
                if (p.exec) u.exec = p.exec;
                if (p.rear) u.rearFirst = true;
                if (p.boom) u.boom = p.boom;
                if (p.splash) u.splash = p.splash;
                if (p.resShred) { u.magicBasic = true; u.area = p.area; u.areaDmg = F.synergy.wang.areaDamage; u.resShred = p.resShred; u.magicMul += p.magic || 0; }
                if (p.heal) u.healBonus += p.heal;
                if (p.cleanse) u.cleanse = true;
            });
            if (anyImmune) u.ccImmuneT = anyImmune;
            u.dodge = u.dodge; // diselesaikan di bawah (Senapati)
        });
        // Senapati
        const sn = fx.sen;
        if (sn) {
            const cr = F.senapati.centerRows, cc = F.senapati.centerCols;
            B.units.forEach(u => {
                if (sn.kind === 'centerShield' && u.r >= cr[0] && u.r <= cr[1] && u.c >= cc[0] && u.c <= cc[1]) u.sh0 += sn.value * u.maxHp;
                if (sn.kind === 'healBonus' && u.healer) u.healBonus += sn.value;
                if (sn.kind === 'rearDodge' && u.rear) u.dodge += sn.value;
                if (sn.kind === 'share') u.share += sn.value;
            });
            if (sn.kind === 'quake') { B.quakeVal = sn.value; B.next.quake = F.senapati.quakeEverySec; }
        }
        // berbagi tameng awal dengan unit bersebelahan (Kei / Pit)
        const add0 = B.units.map(u => u.sh0);
        B.units.forEach((u, i) => {
            if (!(u.share > 0) || add0[i] <= 0) return;
            B.units.forEach(o => { if (o !== u && cheb(o.r, o.c, u.r, u.c) <= 1) o.sh0 += add0[i] * u.share; });
        });
        B.units.forEach(u => { u.dodge = Math.min(F.caps.dodge, u.dodge); u.dr = Math.min(F.caps.dr, u.dr); u.pen = Math.min(F.caps.pen, u.pen); });
        // Lir
        const lir = fx.syn.find(e => e.id === 'lir');
        if (lir) { B.lir = lir.p; B.next.lir = lir.p.every; B.shadows = lir.p.shadows || 0; if (B.shadows) B.next.shadow = F.synergy.lir.shadowEvery; }
        // Pusaka lain
        B.bossDmg = P.bossDmg || 0; B.leakDown = P.leakDown || 0;
        // Penjaga
        const wb = B.wave.boss;
        if (wb) {
            const scale = F.boss.scaleByTier[wb.tier] || 1;
            B.bossScale = scale;
            wb.fx.forEach(k => { B.bossK[k] = true; });
            let wk = 0; wb.weakAgainst.forEach(n => { if (fx.active[n]) wk++; });
            B.weakMul = 1 + wk * F.weakBonusPerWarisan;
            if (B.bossK.asalGate) { const need = F.boss.asalGate[wb.tier] || 3; if (fx.asalActive < need) B.gateMul = F.boss.asalGate.damageMult; B.gateNeed = need; }
        }
    }

    // posisi sel (baris, kolom, boleh pecahan) sebuah musuh dari kemajuan p (0..24 sepanjang pathOrder)
    function enemyPos(B, p) {
        const last = B.path.length - 1;
        if (p >= last) return [B.path[last][0], B.path[last][1]];
        const i = Math.floor(p), f = p - i, a = B.path[i], b = B.path[i + 1];
        return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }

    function ev(B, o) { if (B.ev.length < EV_CAP) { o.t = Math.round(B.t * 100) / 100; B.ev.push(o); } }

    /* ---------- statistik efektif ---------- */
    function uAtk(B, u) {
        let m = 1 + u.atkMul;
        for (let i = 0; i < u.buffs.length; i++) if (u.buffs[i].stat === 'atk' && u.buffs[i].until > B.t) m += u.buffs[i].amt;
        return u.atk * m * (1 - B.curse);
    }
    function uAs(B, u) {
        let m = 1 + u.asMul;
        for (let i = 0; i < u.buffs.length; i++) if (u.buffs[i].stat === 'as' && u.buffs[i].until > B.t) m += u.buffs[i].amt;
        return u.as * m * (1 - B.slowAs);
    }
    const eDist = (B, e, r, c) => { const p = enemyPos(B, e.p); return Math.max(Math.abs(p[0] - r), Math.abs(p[1] - c)); };

    /* ---------- serangan ke musuh ---------- */
    function hurtEnemy(B, e, raw, o) {
        o = o || {};
        let dmg = raw;
        if (B.fx) {
            const base = e.boss ? B.F.enemyDefense.bos : B.F.enemyDefense.normal;
            let eff;
            if (o.magic) eff = Math.max(0, base.resist + (e.armorBonus || 0) - (e.resShred || 0));
            else eff = Math.max(0, (base.armor + (e.armorBonus || 0) - (e.shredT > B.t ? e.shred : 0)) * (1 - Math.min(B.F.caps.pen, (o.pen || 0))));
            dmg = raw * 100 / (100 + eff);
            if (e.boss) {
                dmg *= (1 + B.bossDmg) * B.weakMul * B.gateMul;
                if (!o.dot && B.bossK.evade && B.rng.next() < Math.min(B.F.caps.dodge, B.F.boss.evade.dodge * B.bossScale)) { ev(B, { k: 'dodge', eid: e.id }); return 0; }
            }
            if (e.shield > 0) { const a = Math.min(e.shield, dmg); e.shield -= a; dmg -= a; }
        }
        e.hp -= dmg;
        if (o.u) o.u.dealt += dmg; // untuk panel Damage (diberikan)
        return dmg;
    }

    function livingEnemies(B) { return B.enemies.filter(e => e.hp > 0); }
    // musuh dalam jangkauan, urut terdepan dulu (p besar), lalu id
    function inRange(B, u) {
        const out = [];
        for (let k = 0; k < B.enemies.length; k++) { const e = B.enemies[k]; if (e.hp > 0 && eDist(B, e, u.r, u.c) <= u.range) out.push(e); }
        out.sort((a, b) => b.p - a.p || a.id - b.id);
        return out;
    }
    function enemiesNear(B, e0, R) {
        const p0 = enemyPos(B, e0.p), out = [];
        for (let k = 0; k < B.enemies.length; k++) { const e = B.enemies[k]; if (e.hp <= 0) continue; if (e === e0 || eDist(B, e, p0[0], p0[1]) <= R) out.push(e); }
        return out;
    }

    function critRoll(B, u, extra) {
        const ch = Math.min(1, u.crit + (extra || 0));
        if (ch > 0 && B.rng.next() < ch) return B.F.critDamage + u.critDmg;
        return 1;
    }

    function basicAttack(B, u, tg, list, pre) {
        const F = B.F;
        let raw = uAtk(B, u) * (pre || 1);
        const o = { magic: u.magicBasic, pen: u.pen, u: u };
        raw *= critRoll(B, u, 0);
        let targets = [tg];
        if (B.fx && u.pierce > 0) targets = (u.rearFirst ? list.slice().reverse() : list).slice(0, 1 + u.pierce);
        if (B.fx && u.pierce > 0 && !targets.includes(tg)) targets[0] = tg;
        for (let i = 0; i < targets.length; i++) {
            const e = targets[i];
            let dm = raw * (u.magicBasic ? 1 + u.magicMul : 1);
            hurtEnemy(B, e, dm, o);
            if (B.fx) afterHit(B, u, e, raw);
        }
        if (B.fx && u.magicBasic) {
            enemiesNear(B, tg, u.area).forEach(e => { if (e !== tg) { hurtEnemy(B, e, raw * u.areaDmg * (1 + u.magicMul), o); } e.resShred = Math.max(e.resShred || 0, u.resShred); });
        }
        if (B.fx && u.splash > 0) enemiesNear(B, tg, 1).forEach(e => { if (e !== tg) hurtEnemy(B, e, raw * u.splash, o); });
        if (B.fx && u.echoT > B.t) { const second = list.find(e => e !== tg); if (second) hurtEnemy(B, second, uAtk(B, u) * u.echoM, o); }
    }
    function afterHit(B, u, e, raw) {
        if (u.exec > 0 && !e.boss && e.hp > 0 && e.hp <= u.exec * e.maxHp) e.hp = 0;
    }

    /* ---------- kerusakan ke Titisan ---------- */
    function hurtUnit(B, u, raw, e, noDodge) {
        if (!u.alive) return 0;
        if (B.fx && !noDodge && u.dodge > 0 && B.rng.next() < u.dodge) { ev(B, { k: 'dodge', uid: u.uid }); return 0; }
        let dmg = raw * 100 / (100 + u.armor);
        if (B.fx) dmg *= (1 - u.dr);
        const total = dmg;
        if (B.fx) {
            if (u.sh1 > 0 && u.sh1T <= B.t) u.sh1 = 0;
            if (u.sh1 > 0) { const a = Math.min(u.sh1, dmg); u.sh1 -= a; dmg -= a; }
            if (dmg > 0 && u.sh0 > 0) { const a = Math.min(u.sh0, dmg); u.sh0 -= a; dmg -= a; }
        }
        u.hp -= dmg;
        u.taken += total; // untuk panel Damage (diterima, sebelum tameng)
        if (B.fx && e && e.hp > 0) {
            const rf = u.reflect + (u.reflectT > B.t ? u.reflectV : 0);
            if (rf > 0) e.hp -= total * rf;
            if (e.boss && B.bossK.drain) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * B.F.boss.drain.healPct * B.bossScale);
        }
        if (u.hp <= 0) { u.hp = 0; die(B, u); }
        return dmg;
    }
    function die(B, u) {
        u.alive = false;
        if (B.fx && u.boom > 0) {
            const raw = uAtk(B, u) * u.boom;
            ev(B, { k: 'boom', uid: u.uid });
            for (let k = 0; k < B.enemies.length; k++) { const e = B.enemies[k]; if (e.hp > 0 && eDist(B, e, u.r, u.c) <= 1.5) hurtEnemy(B, e, raw, { pen: u.pen, u: u }); }
        }
    }

    /* ---------- tameng / penyembuhan / bantuan ---------- */
    function grantShield(B, u, amt, dur) {
        if (u.noShieldT > B.t || !u.alive) return;
        u.sh1 += amt; u.sh1T = Math.max(u.sh1T > B.t ? u.sh1T : 0, B.t + dur);
        if (u.share > 0) B.units.forEach(o => { if (o !== u && o.alive && cheb(o.r, o.c, u.r, u.c) <= 1 && o.noShieldT <= B.t) { o.sh1 += amt * u.share; o.sh1T = Math.max(o.sh1T > B.t ? o.sh1T : 0, B.t + dur); } });
    }
    function healUnit(B, u, amt) { if (u.alive) u.hp = Math.min(u.maxHp, u.hp + amt); }
    function allies(B) { return B.units.filter(u => u.alive); }
    function allyTargets(B, u, t) {
        const al = allies(B);
        if (t === 'self') return [u];
        if (t === 'allAllies') return al;
        if (t === 'adj') return al.filter(o => cheb(o.r, o.c, u.r, u.c) <= 1);
        if (t.indexOf('radius:') === 0) { const R = Number(t.slice(7)); return al.filter(o => cheb(o.r, o.c, u.r, u.c) <= R); }
        if (t === 'nearAlly') {
            let best = null, bd = 1e9;
            al.forEach(o => { if (o === u) return; const d = cheb(o.r, o.c, u.r, u.c); if (d < bd || (d === bd && best && o.uid < best.uid)) { bd = d; best = o; } });
            return [best || u];
        }
        if (t === 'lowest') {
            let best = null;
            al.forEach(o => { if (!best || o.hp / o.maxHp < best.hp / best.maxHp || (o.hp / o.maxHp === best.hp / best.maxHp && o.uid < best.uid)) best = o; });
            return best ? [best] : [];
        }
        return [u];
    }
    function enemyTargets(B, u, t, list) {
        if (!list.length) return [];
        const front = list[0];
        if (t === 'near') {
            let best = list[0], bd = eDist(B, best, u.r, u.c);
            for (let i = 1; i < list.length; i++) { const d = eDist(B, list[i], u.r, u.c); if (d < bd - 1e-9) { bd = d; best = list[i]; } }
            return [best];
        }
        if (t === 'weak') { let b = list[0]; list.forEach(e => { if (e.hp < b.hp) b = e; }); return [b]; }
        if (t === 'rear') return [list[list.length - 1]];
        if (t.indexOf('multi:') === 0) return list.slice(0, Number(t.slice(6)));
        if (t.indexOf('aoe:') === 0) return enemiesNear(B, front, Number(t.slice(4)));
        if (t.indexOf('selfaoe:') === 0) { const R = Number(t.slice(8)); return B.enemies.filter(e => e.hp > 0 && eDist(B, e, u.r, u.c) <= R); }
        if (t === 'line') return list.filter(e => { const p = enemyPos(B, e.p); return Math.abs(p[0] - u.r) <= 0.5 || Math.abs(p[1] - u.c) <= 0.5; }).concat([]);
        return [front];
    }
    function stunEnemy(B, e, dur) { e.stunT = Math.max(e.stunT || 0, B.t + (e.boss ? dur * 0.5 : dur)); }
    function stunUnit(B, u, dur) { if (u.alive && u.ccImmuneT <= B.t) u.stunT = Math.max(u.stunT, B.t + dur); }

    function cast(B, u, list) {
        const F = B.F, sk = u.skill, out = [];
        const base = uAtk(B, u);
        sk.fx.forEach(a => {
            if (a.k === 'dmg') {
                let tg = enemyTargets(B, u, a.t, list);
                if (a.t === 'line' && !tg.length) tg = [list[0]];
                const raw = base * a.m * (a.magic ? 1 + u.magicMul : 1);
                const o = { magic: !!a.magic, pen: u.pen + (a.pierce || 0), u: u };
                let dealt = 0;
                tg.forEach(e => {
                    if (a.dot) { e.dots = e.dots || []; e.dots.push({ dps: raw / a.dot, until: B.t + a.dot, magic: !!a.magic, pen: o.pen }); }
                    else {
                        const x = raw * critRoll(B, u, a.crit || 0);
                        dealt += hurtEnemy(B, e, x, o);
                        afterHit(B, u, e, x);
                    }
                    if (a.slow) { e.slowAmt = a.slow; e.slowT = B.t + (a.slowDur || 3); }
                    if (a.shred) { e.shred = Math.max(e.shred || 0, a.shred); e.shredT = B.t + (a.shredDur || 5); }
                    if (u.magicBasic || (a.magic && u.resShred)) e.resShred = Math.max(e.resShred || 0, u.resShred);
                });
                if (a.lifesteal && dealt > 0) healUnit(B, u, dealt * a.lifesteal);
            } else if (a.k === 'cc') {
                enemyTargets(B, u, a.t, list).forEach(e => stunEnemy(B, e, a.dur));
            } else if (a.k === 'shield') {
                const amt = base * a.m * F.supportAtkScale;
                allyTargets(B, u, a.t).forEach(o => {
                    grantShield(B, o, amt, a.dur);
                    if (a.reflect) { o.reflectT = B.t + a.dur; o.reflectV = a.reflect; }
                    if (a.ccImmune) o.ccImmuneT = Math.max(o.ccImmuneT, B.t + a.ccImmune);
                    if (a.cleanse) o.stunT = 0;
                });
            } else if (a.k === 'heal') {
                const amt = base * a.m * F.supportAtkScale * (1 + u.healBonus);
                allyTargets(B, u, a.t).forEach(o => {
                    healUnit(B, o, amt);
                    if (a.regen) o.hot.push({ pct: a.regen, until: B.t + (a.dur || 4) });
                    if (a.cleanse || u.cleanse) o.stunT = 0;
                });
            } else if (a.k === 'buff') {
                allyTargets(B, u, a.t).forEach(o => { o.buffs.push({ stat: a.stat, amt: a.amt, until: B.t + a.dur * B.fx.durMul }); });
            } else if (a.k === 'mana') {
                allyTargets(B, u, a.t).forEach(o => { if (o !== u || a.t === 'self') o.mana += a.n; });
            } else if (a.k === 'echo') {
                u.echoT = B.t + a.dur * B.fx.durMul; u.echoM = a.m;
            } else if (a.k === 'swap') {
                const l = livingEnemies(B).filter(e => !e.boss).sort((x, y) => y.p - x.p || x.id - y.id);
                if (l.length >= 2) { const f = l[0], b = l[l.length - 1], t = f.p; f.p = b.p; b.p = t; }
            }
        });
        ev(B, { k: 'cast', uid: u.uid, name: sk.name });
    }

    function pushEnemy(B, hp, atk, speed, leak, boss, p) {
        const e = { id: B.nextEnemyId++, p: p || 0, hp: hp, maxHp: hp, atk: atk, speed: speed, cd: 1, boss: boss, leak: leak };
        B.enemies.push(e); return e;
    }

    /* ---------- mekanik Penjaga (kategori generik; angka dari rules.fx.boss) ---------- */
    function onBossSpawn(B, e) {
        const F = B.F, K = F.boss, s = B.bossScale;
        if (B.bossK.armor) e.armorBonus = (e.armorBonus || 0) + K.armor.armor * s;
        if (B.bossK.fast) e.speed *= 1 + (K.fast.speed - 1) * s;
        if (B.bossK.linger) { e.speed *= K.linger.speed; e.atk *= 1 + K.linger.atk * s; }
        if (B.bossK.copy) { let m = 0; B.units.forEach(u => { if (u.atk > m) m = u.atk; }); e.atk += m * K.copy.atkOfStrongest * s; }
        if (B.bossK.slow) B.slowAs = K.slow.asDebuff * s; // debuff hanya selama Penjaga ada di arena
        if (B.bossK.curse) B.curse = K.curse.atkDebuff * s;
        ['aoe', 'focus', 'silence', 'stun', 'summon', 'grow', 'shield', 'strip'].forEach(k => { if (B.bossK[k]) B.next['b_' + k] = B.t + K[k].every; });
        ev(B, { k: 'boss', eid: e.id });
    }
    function nearestUnits(B, e, n) {
        const p = enemyPos(B, e.p);
        return B.units.filter(u => u.alive).map(u => ({ u: u, d: cheb(u.r, u.c, p[0], p[1]) })).sort((a, b) => a.d - b.d || a.u.uid - b.u.uid).slice(0, n).map(x => x.u);
    }
    function bossMech(B, e) {
        const F = B.F, K = F.boss, s = B.bossScale;
        const due = k => B.next['b_' + k] !== undefined && B.t >= B.next['b_' + k] - 1e-9 && (B.next['b_' + k] += K[k].every, true);
        if (B.bossK.aoe && due('aoe')) { nearestUnits(B, e, K.aoe.targets).forEach(u => hurtUnit(B, u, e.atk * K.aoe.atk * s, e)); ev(B, { k: 'bossfx', n: 'aoe' }); }
        if (B.bossK.focus && due('focus')) {
            let t = null; B.units.forEach(u => { if (u.alive && (!t || u.cost < t.cost || (u.cost === t.cost && u.uid < t.uid))) t = u; });
            if (t) hurtUnit(B, t, e.atk * K.focus.atk * s, e);
            ev(B, { k: 'bossfx', n: 'focus' });
        }
        if (B.bossK.silence && due('silence')) {
            B.units.filter(u => u.alive).sort((a, b) => b.mana - a.mana || a.uid - b.uid).slice(0, 2).forEach(u => { u.silT = B.t + K.silence.dur; });
            ev(B, { k: 'bossfx', n: 'silence' });
        }
        if (B.bossK.stun && due('stun')) { nearestUnits(B, e, K.stun.targets).forEach(u => stunUnit(B, u, K.stun.dur)); ev(B, { k: 'bossfx', n: 'stun' }); }
        if (B.bossK.summon && due('summon')) {
            const pre = B.wave.pre;
            for (let i = 0; i < K.summon.count && B.summoned < K.summon.max; i++) { const m = pushEnemy(B, pre.hp, pre.atk, pre.speed, pre.leak, false, e.p); m.summon = true; B.summoned++; }
            ev(B, { k: 'bossfx', n: 'summon' });
        }
        if (B.bossK.grow && due('grow')) { e.atk *= 1 + K.grow.atk * s; ev(B, { k: 'bossfx', n: 'grow' }); }
        if (B.bossK.shield && due('shield')) { e.shield = (e.shield || 0) + e.maxHp * K.shield.pct * s; ev(B, { k: 'bossfx', n: 'shield' }); }
        if (B.bossK.strip && due('strip')) { B.units.forEach(u => { u.sh0 = 0; u.sh1 = 0; u.noShieldT = B.t + K.strip.dur; }); ev(B, { k: 'bossfx', n: 'strip' }); }
    }

    function step(B) {
        if (B.done) return B;
        const w = B.wave, last = B.path.length - 1, FX = !!B.fx;
        B.t += DT; B.tick++;

        // 1) muncul
        if (w.pre) {
            // pupuh Penjaga: Sunyi keluar dulu dengan selang biasa; Penjaga menjadi musuh TERAKHIR dalam antrean,
            // keluar tepat di slot sesudah Sunyi terakhir (tanpa menunggu Sunyi mati). Jumlah Sunyi dan Penjaga tidak berubah.
            const pre = w.pre;
            while (B.spawned < pre.count && B.t >= B.spawned * pre.gap + DT * 0.5) {
                pushEnemy(B, pre.hp, pre.atk, pre.speed, pre.leak, false, 0);
                B.spawned++;
            }
            if (!B.bossOut && B.spawned >= pre.count && B.t >= pre.count * pre.gap + DT * 0.5) {
                B.bossOut = true; B.bossT = B.t;
                const be = pushEnemy(B, w.hp, w.atk, w.speed, w.leak, true, 0);
                B.spawned++;
                if (FX) onBossSpawn(B, be);
            }
        } else {
            while (B.spawned < w.count && B.t >= B.spawned * w.gap + DT * 0.5) {
                pushEnemy(B, w.hp, w.atk, w.speed, w.leak, false, 0);
                B.spawned++;
            }
        }
        const total = w.pre ? w.pre.count + w.count : w.count;

        // 1b) efek berkala (hanya Fase 3)
        if (FX) {
            const alive = B.units.filter(u => u.alive);
            for (let i = 0; i < alive.length; i++) {
                const u = alive[i];
                if (u.regen > 0) healUnit(B, u, u.maxHp * u.regen * DT);
                for (let k = 0; k < u.hot.length; k++) if (u.hot[k].until > B.t) healUnit(B, u, u.maxHp * u.hot[k].pct * DT);
                if (u.sh1 > 0 && u.sh1T <= B.t) u.sh1 = 0;
            }
            for (let k = 0; k < B.enemies.length; k++) {
                const e = B.enemies[k];
                if (e.hp <= 0 || !e.dots) continue;
                for (let d = 0; d < e.dots.length; d++) { const x = e.dots[d]; if (x.until > B.t) hurtEnemy(B, e, x.dps * DT, { magic: x.magic, pen: x.pen, dot: true }); }
            }
            if (B.lir && B.t >= B.next.lir - 1e-9) {
                B.next.lir += B.lir.every;
                const l = livingEnemies(B);
                if (l.length) { const e = l[B.rng.int(l.length)]; stunEnemy(B, e, B.lir.stun); ev(B, { k: 'lir', eid: e.id }); }
            }
            if (B.shadows && B.t >= B.next.shadow - 1e-9) {
                B.next.shadow += B.F.synergy.lir.shadowEvery;
                const al = alive;
                if (al.length) {
                    let sum = 0; al.forEach(u => { sum += uAtk(B, u); });
                    const avg = sum / al.length, l = livingEnemies(B).sort((a, b) => b.p - a.p || a.id - b.id);
                    for (let s = 0; s < B.shadows && l.length; s++) hurtEnemy(B, l[0], avg * B.F.synergy.lir.shadowAtk, {});
                }
            }
            if (B.quakeVal && B.t >= B.next.quake - 1e-9) {
                B.next.quake += B.F.senapati.quakeEverySec;
                ev(B, { k: 'quake' });
                alive.forEach(u => {
                    if (!u.attacker || u.stunT > B.t) return;
                    const li = inRange(B, u);
                    if (li.length) basicAttack(B, u, li[0], li, 1 + B.quakeVal);
                });
            }
        }

        // 2) unit bertindak: skill bila mana penuh, kalau tidak menyerang musuh terdepan dalam jangkauan (jarak kotak / Chebyshev)
        for (let i = 0; i < B.units.length; i++) {
            const u = B.units[i];
            if (!u.alive) continue;
            if (FX && u.stunT > B.t) continue;
            u.cd -= DT;
            if (u.cd > 1e-9) continue;
            if (!FX) {
                let tg = null;
                for (let k = 0; k < B.enemies.length; k++) {
                    const e = B.enemies[k];
                    if (e.hp <= 0) continue;
                    const pos = enemyPos(B, e.p);
                    const d = Math.max(Math.abs(pos[0] - u.r), Math.abs(pos[1] - u.c));
                    if (d <= u.range && (!tg || e.p > tg.p)) tg = e;
                }
                if (tg) { tg.hp -= u.atk; u.cd = 1 / u.as; }
                else u.cd = 0;
                continue;
            }
            const list = inRange(B, u);
            const canCast = u.skill && u.manaMax > 0 && u.mana >= u.manaMax && u.silT <= B.t && u.skill.fx && u.skill.fx.length;
            const needsEnemy = canCast && u.skill.fx.some(a => a.k === 'dmg' || a.k === 'cc' || a.k === 'swap');
            if (canCast && (!needsEnemy || list.length)) {
                if (needsEnemy && !list.length) { u.cd = 0; continue; }
                u.mana = 0; cast(B, u, list); u.cd = 1 / uAs(B, u);
                continue;
            }
            if (list.length) {
                const tg = u.rearFirst ? list[list.length - 1] : list[0];
                basicAttack(B, u, tg, list, 1);
                u.mana += B.F.mana.perAttack;
                u.cd = 1 / uAs(B, u);
            } else u.cd = 0;
        }
        for (let k = 0; k < B.enemies.length; k++) { const e = B.enemies[k]; if (e.hp <= 0 && e.boss && !B.bossKilled) { B.bossKilled = true; B.bossDeadT = B.t; } }
        if (B.bossKilled) { B.slowAs = 0; B.curse = 0; }
        const before = B.enemies.length;
        B.enemies = B.enemies.filter(e => e.hp > 0);
        B.killed += before - B.enemies.length;

        // 3) musuh berjalan dan menyerang unit terdekat dalam jarak kotak <= 1 tiap 1 dtk
        for (let k = 0; k < B.enemies.length; k++) {
            const e = B.enemies[k];
            if (FX && e.stunT > B.t) continue;
            let sp = e.speed;
            if (FX && e.slowT > B.t) sp *= 1 - e.slowAmt;
            e.p += sp * DT;
            e.cd -= DT;
            if (e.cd <= 1e-9 && e.p < last) {
                const pos = enemyPos(B, e.p);
                let near = null, nd = 1e9;
                for (let i = 0; i < B.units.length; i++) {
                    const u = B.units[i];
                    if (!u.alive) continue;
                    const d = Math.max(Math.abs(pos[0] - u.r), Math.abs(pos[1] - u.c));
                    if (d <= 1 && d < nd) { nd = d; near = u; }
                }
                if (near) {
                    if (!FX) {
                        near.hp -= e.atk * 100 / (100 + near.armor);
                        if (near.hp <= 0) { near.hp = 0; near.alive = false; }
                    } else hurtUnit(B, near, e.atk, e);
                    e.cd += 1;
                } else e.cd = 0;
            }
        }
        if (FX) for (let k = 0; k < B.enemies.length; k++) { const e = B.enemies[k]; if (e.boss && e.hp > 0) bossMech(B, e); }
        const keep = [];
        for (let k = 0; k < B.enemies.length; k++) {
            const e = B.enemies[k];
            if (e.hp <= 0) { B.killed++; if (e.boss && !B.bossKilled) { B.bossKilled = true; B.bossDeadT = B.t; } continue; } // tewas oleh pantulan/efek saat giliran musuh
            if (e.p >= last) {
                B.leaks++;
                B.leakDamage += (FX && !e.boss) ? Math.max(1, e.leak - B.leakDown) : e.leak;
            } else keep.push(e);
        }
        B.enemies = keep;

        // sidik jari berjalan: merangkum keadaan SETIAP langkah, bukan hanya akhir pertempuran
        let s = B.enemies.length * 7 + B.leaks * 13 + B.killed * 17;
        for (let k = 0; k < B.enemies.length; k++) s += Math.round(B.enemies[k].p * 1000) + Math.round(B.enemies[k].hp);
        for (let i = 0; i < B.units.length; i++) { const u = B.units[i]; s += Math.round(u.hp * 10) + (u.alive ? 1 : 0); if (FX) s += Math.round(u.mana) + Math.round(u.sh0 + u.sh1); }
        B.h = Math.imul(B.h ^ (s >>> 0), 16777619) >>> 0;

        // 4) selesai?
        if (B.spawned >= total && B.enemies.length === 0) B.done = true;
        else if (B.t >= MAX_TIME) { // pengaman waktu: yang masih ada dianggap lolos; Penjaga yang belum sempat muncul tidak dihitung
            for (let k = 0; k < B.enemies.length; k++) { B.leaks++; B.leakDamage += B.enemies[k].leak; }
            if (w.pre && !B.bossOut) { B.leaks++; B.leakDamage += w.leak; } // Penjaga yang belum sempat muncul dihitung lolos, bukan gratis
            B.enemies = []; B.done = true;
        }
        return B;
    }

    function run(B) { while (!B.done) step(B); return result(B); }

    function result(B) {
        const r = { leaks: B.leaks, leakDamage: B.leakDamage, killed: B.killed, seconds: Math.round(B.t * 100) / 100, win: B.leaks === 0, hash: hash(B) };
        if (B.wave.boss) {
            const alive = B.bossOut ? (B.bossKilled ? B.bossDeadT : B.t) - B.bossT : 0;
            r.boss = { out: B.bossOut, killed: B.bossKilled, aliveSec: Math.round(alive * 100) / 100 };
            if (B.fx && B.bossK.steal) { const K = B.F.boss.steal; r.goldLoss = K.gold * Math.floor(alive / K.slowSec); }
        }
        return r;
    }

    function hash(B) {
        const parts = [B.tick, B.spawned, B.leaks, B.killed, B.h];
        B.enemies.forEach(e => parts.push(e.id, Math.round(e.p * 1000), Math.round(e.hp * 1000)));
        B.units.forEach(u => parts.push(u.uid, Math.round(u.hp * 1000), u.alive ? 1 : 0));
        if (B.fx) B.units.forEach(u => parts.push(Math.round(u.mana), Math.round((u.sh0 + u.sh1) * 10)));
        return NS.rng.mix(parts);
    }

    /** Nama, deskripsi singkat, dan bos sebuah ronde untuk layar transisi (nama ronde biasa dari rounds.json, ronde bos dari bosses.json). */
    function describe(data, round, arenaId) {
        const ix = NS.Core.index(data);
        const w = waveFor(data, round, arenaId);
        const cfg = data.rounds;
        const endless = round > ix.rules.match.finalBossRound;
        if (w.kind === 'bos') {
            return { round: round, name: w.boss.roundName, desc: w.boss.mechanic, boss: w.boss, bossRound: true, endless: endless, count: w.count, escort: w.pre.count };
        }
        if (endless) return { round: round, name: cfg.endless.name + ' · Pupuh ' + round, desc: cfg.endless.desc, boss: null, bossRound: false, endless: true, count: w.count };
        const e = cfg.normalRounds[round];
        return { round: round, name: e.name, desc: e.desc, boss: null, bossRound: false, endless: false, count: w.count };
    }

    NS.Wave = { forRound: waveFor, describe: describe };
    NS.Battle = { create: create, step: step, run: run, result: result, hash: hash, enemyPos: enemyPos, DT: DT, MAX_TIME: MAX_TIME };
    GH.ns = NS;
    GH.nsBattle = NS.Battle;
    if (typeof module !== 'undefined' && module.exports) module.exports = NS;
})(typeof window !== 'undefined' ? window : globalThis);
