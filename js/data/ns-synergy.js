/* =====================================================================
   NUSANTARA SIRNA — sim-core: hitungan sinergi untuk panel Sinergi.
   LOGIKA MURNI (tanpa DOM). Anggota dihitung sebagai karakter UNIK di papan.
   Fase 2: menghitung status (aktif / hampir aktif). Fase 3: fxCompile mengubah status itu jadi efek pertempuran.
===================================================================== */
(function (root) {
    'use strict';
    const GH = root.GH = root.GH || {};
    const NS = GH.ns = GH.ns || {};

    /**
     * Status semua sinergi dari unit di papan (dan bench, sebagai kandidat).
     * Hasil per sinergi: {id,name,kind,thresholds,count,benchExtra,tier,next,missing,state}
     *  - count: karakter unik di papan; benchExtra: karakter unik di bench yang BELUM ada di papan
     *  - tier: berapa ambang yang sudah tercapai (0..3); next: ambang berikutnya (null bila sudah maksimal)
     *  - state: 'active' (tier >= 1) | 'near' (belum aktif, ada anggota di papan) | 'bench' (hanya di bench) | 'none'
     */
    function compute(data, boardUnits, benchUnits) {
        const ix = NS.Core.index(data);
        const onBoard = {}, onBench = {};
        (boardUnits || []).forEach(u => { onBoard[u.id] = true; });
        (benchUnits || []).forEach(u => { if (!onBoard[u.id]) onBench[u.id] = true; });
        const out = ix.syn.map(s => {
            const key = s.kind === 'asal' ? 'asal' : 'laku';
            const member = id => String(ix.chars[id][key]).toLowerCase() === s.name.toLowerCase();
            const count = Object.keys(onBoard).filter(member).length;
            const benchExtra = Object.keys(onBench).filter(member).length;
            let tier = 0;
            s.thresholds.forEach(t => { if (count >= t) tier++; });
            const next = tier < s.thresholds.length ? s.thresholds[tier] : null;
            const state = tier >= 1 ? 'active' : count > 0 ? 'near' : benchExtra > 0 ? 'bench' : 'none';
            return { id: s.id, name: s.name, kind: s.kind, thresholds: s.thresholds.slice(), count: count, benchExtra: benchExtra, tier: tier, next: next, missing: next === null ? 0 : next - count, state: state };
        });
        return out;
    }

    /** Urutan tampil panel: aktif (tier tinggi dulu), lalu hampir aktif (kurang sedikit dulu), lalu hanya di bench. 'none' tidak ditampilkan. */
    function visible(list) {
        const rank = { active: 0, near: 1, bench: 2 };
        return list.filter(s => rank[s.state] !== undefined).sort((a, b) =>
            rank[a.state] - rank[b.state] || b.tier - a.tier || a.missing - b.missing || b.count - a.count || (a.kind === b.kind ? 0 : a.kind === 'asal' ? -1 : 1) || a.name.localeCompare(b.name));
    }

    /* =================================================================
       FASE 3: pengompilasi efek pertempuran. Membaca rules.fx (data) + status Warisan di papan + Senapati + Pusaka.
       Hasilnya dipakai ns-battle.js (setup.fx) dan ns-core.js (ekonomi). Semua angka berasal dari data.
    ================================================================= */
    /* HUD8: Pusaka efek-per-Titisan (atk, hp, as, def, shield, mana, regen, dr, crit) hanya berlaku pada Titisan yang
       MEMAKAINYA (S.equip[idPusaka] = uid). Pusaka berefek global (emas, batas unit, dst.) tetap pasif. */
    const UNIT_KEYS = ['atk', 'hp', 'as', 'def', 'shield', 'mana', 'regen', 'dr', 'crit'];
    function pusakaSum(ix, S) {
        const t = { byUid: {} };
        (S.pusaka || []).forEach(id => {
            const p = ix.pusaka && ix.pusaka[id]; if (!p) return;
            Object.keys(p.fx).forEach(k => {
                if (UNIT_KEYS.indexOf(k) < 0) { t[k] = (t[k] || 0) + p.fx[k]; return; }
                const uid = S.equip && S.equip[id]; if (!uid) return;
                const m = t.byUid[uid] || (t.byUid[uid] = {}); m[k] = (m[k] || 0) + p.fx[k];
            });
        });
        return t;
    }

    function fxCompile(data, S) {
        const ix = NS.Core.index(data), F = ix.rules.fx;
        if (!F) return null;
        const boardUnits = Object.keys(S.board).map(k => S.board[k]);
        const st = compute(data, boardUnits, []);
        const sen = S.senapatiId && ix.cmd[S.senapatiId] ? ix.cmd[S.senapatiId] : null;
        const senKind = sen ? F.senapati.kinds[sen.id] : null;
        const senVal = sen ? (S.senapatiAffinity ? sen.passiveValueOnAffinityArena : sen.passiveValue) : 0;
        const P = pusakaSum(ix, S);
        // jumlah Warisan Dwi (penguat) dan bonus durasi (Dwi tingkat 3 + Senapati Jro)
        const dwi = st.find(x => x.id === 'dwi');
        const dwiP = dwi && dwi.tier ? F.synergy.dwi.tiers[dwi.tier - 1] : null;
        const amp = dwiP ? dwiP.amp : 0;
        const durMul = 1 + (dwiP && dwiP.dur ? dwiP.dur : 0) + (senKind === 'durAmp' ? senVal : 0);
        const active = {};
        const syn = [];
        st.forEach(x => {
            if (!x.tier) return;
            const def = F.synergy[x.id]; if (!def) return;
            active[x.name] = x.tier;
            const p = Object.assign({}, def.tiers[x.tier - 1]);
            if (x.id !== 'dwi') F.ampKeys.forEach(k => { if (typeof p[k] === 'number') p[k] = p[k] * (1 + amp); });
            ['stun', 'ccImmune'].forEach(k => { if (typeof p[k] === 'number') p[k] = p[k] * durMul; });
            Object.keys(F.caps).forEach(k => { if (typeof p[k] === 'number' && p[k] > F.caps[k]) p[k] = F.caps[k]; });
            syn.push({ id: x.id, name: x.name, kind: x.kind, tier: x.tier, scope: def.scope, p: p, def: def });
        });
        const lir = syn.find(e => e.id === 'lir'), sri = syn.find(e => e.id === 'sri');
        if (sri && lir && sri.p.lirShield) sri.p.shield += sri.p.lirShield * (1 + amp);
        const asalActive = st.filter(x => x.kind === 'asal' && x.tier > 0).length;
        // ekonomi
        const tau = syn.find(e => e.id === 'tau');
        const eco = {
            gold: (tau ? tau.p.gold : 0) + (P.gold || 0) + (senKind === 'streakGold' && S.winStreak >= 2 ? senVal : 0),
            goldParts: { tau: tau ? tau.p.gold : 0, pusaka: P.gold || 0, sen: senKind === 'streakGold' && S.winStreak >= 2 ? senVal : 0 },
            interestCap: tau ? tau.p.interestCap || 0 : 0
        };
        return {
            syn: syn, active: active, asalActive: asalActive, amp: amp, durMul: durMul,
            sen: sen ? { id: sen.id, kind: senKind, value: senVal } : null,
            pusaka: P, eco: eco, defense: F.enemyDefense, F: F
        };
    }

    NS.Synergy = { compute: compute, visible: visible, fxCompile: fxCompile, pusakaSum: pusakaSum, UNIT_KEYS: UNIT_KEYS };
    GH.ns = NS;
    GH.nsSynergy = NS.Synergy;
    if (typeof module !== 'undefined' && module.exports) module.exports = NS;
})(typeof window !== 'undefined' ? window : globalThis);
