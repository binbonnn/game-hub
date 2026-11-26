/* =====================================================================
   NUSANTARA SIRNA — identitas pemain dan leaderboard (Fase 7).
   Nama (tidak peka huruf besar-kecil) dilindungi PIN 4 digit. Hash PIN (PBKDF2-SHA256 + garam acak) disimpan di Firestore.
   BATAS YANG JUJUR: tanpa server sendiri, batas percobaan salah dan pemeriksaan skor dijalankan oleh KLIEN. Pemain yang sengaja
   memodifikasi klien dapat melewatinya; Firestore Rules tanpa login tidak bisa mencegahnya. Mitigasi: tiap skor menyimpan matchId
   sehingga siapa pun dapat memeriksa ulang skor Duel/Party dari dokumen room (verifyEntry). Skor Solo tidak dapat diverifikasi ulang.
   Dokumen: ns_players/{kunciNama} dan ns_scores/{matchId}_{kunciNama}. Tidak memakai koleksi game lain.
===================================================================== */
(function (root) {
    'use strict';
    const GH = root.GH = root.GH || {};
    const NS = GH.ns = GH.ns || {};
    const MODES = ['solo', 'duel', 'party', 'coop'], MAX_FAILS = 5, LOCK_MS = 15 * 60 * 1000, ITER = 60000, MIN_ROUND = 3;
    const keyOf = n => String(n || '').trim().toLowerCase();
    const hex = buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    const subtle = () => (root.crypto && root.crypto.subtle) || null;

    async function hashPin(pin, saltHex) {
        const s = subtle(); if (!s) throw new Error('NO_CRYPTO');
        const salt = new Uint8Array(saltHex.match(/../g).map(h => parseInt(h, 16)));
        const km = await s.importKey('raw', new TextEncoder().encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
        return hex(await s.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: ITER }, km, 256));
    }
    function newSalt() { const a = new Uint8Array(16); root.crypto.getRandomValues(a); return hex(a); }
    /** Nomor minggu (berganti Senin 00:00 UTC; 1 Jan 1970 hari Kamis, jadi digeser 3 hari). */
    const weekOf = t => Math.floor((t + 3 * 86400000) / 604800000);
    const emptyTot = () => ({ score: 0, matches: 0, best: 0 });

    function create(db, clock, uid) {
        const now = clock || (() => Date.now()), err = reason => ({ ok: false, reason: reason });
        const ownerUid = uid || null;
        const sameUid = proof => !ownerUid || !proof || !proof.uid || proof.uid === ownerUid;
        const pref = k => db.collection('ns_players').doc(k), sref = id => db.collection('ns_scores').doc(id), xref = k => db.collection('ns_secrets').doc(k);
        const validPin = p => /^\d{4}$/.test(String(p));
        const validName = n => NS.Match ? NS.Match.validName(n) : (String(n).trim().length >= 1 && String(n).trim().length <= 16 && !/[.\/\[\]*~`]/.test(String(n)));

        async function register(name, pin) {
            if (!validName(name)) return err('BAD_NAME');
            if (!validPin(pin)) return err('BAD_PIN');
            const k = keyOf(name), ex = await pref(k).get(); if (ex.exists) return err('NAME_TAKEN');
            const salt = newSalt(), ph = await hashPin(pin, salt), mode = {}; MODES.forEach(m => { mode[m] = emptyTot(); });
            // Rahasia (garam, hash PIN, hitungan salah) di dokumen terpisah: dokumen pemain + papan peringkat tidak membawa hash.
            // uid adalah penyesuaian rebuild: setiap tulisan ditautkan ke UID Auth pemain yang sedang masuk.
            const secret = { salt: salt, pinHash: ph, fails: 0, lockUntil: 0 };
            const player = { v: 2, name: String(name).trim(), createdAt: now(), tot: emptyTot(), mode: mode, wk: { w: weekOf(now()), score: 0, matches: 0, best: 0 } };
            if (ownerUid) { secret.uid = ownerUid; player.uid = ownerUid; }
            await xref(k).set(secret);
            await pref(k).set(player);
            return { ok: true, proof: { key: k, name: String(name).trim(), ph: ph, uid: ownerUid } };
        }
        async function login(name, pin) {
            if (!validPin(pin)) return err('BAD_PIN');
            const k = keyOf(name), pl = await pref(k).get(), s = await xref(k).get(); if (!pl.exists || !s.exists) return err('NO_NAME');
            const d = s.data(), t = now();
            if (d.lockUntil > t) return { ok: false, reason: 'LOCKED', waitMs: d.lockUntil - t };
            const ph = await hashPin(pin, d.salt);
            if (ph !== d.pinHash) {
                const fails = (d.fails || 0) + 1, upd = { fails: fails };
                if (fails >= MAX_FAILS) { upd.lockUntil = t + LOCK_MS; upd.fails = 0; }
                await xref(k).update(upd);
                return { ok: false, reason: upd.lockUntil ? 'LOCKED' : 'WRONG_PIN', left: Math.max(0, MAX_FAILS - fails), waitMs: upd.lockUntil ? LOCK_MS : 0 };
            }
            if (d.fails) await xref(k).update({ fails: 0 });
            return { ok: true, proof: { key: k, name: pl.data().name, ph: ph, uid: ownerUid } };
        }
        /** Cek bukti masuk yang tersimpan di perangkat (nama + hash). */
        async function check(proof) {
            if (!proof || !proof.key) return err('NO_PROOF');
            if (!sameUid(proof)) return err('FOREIGN_UID');
            const pl = await pref(proof.key).get(), s = await xref(proof.key).get(); if (!pl.exists || !s.exists) return err('NO_NAME');
            const d = s.data();
            if (ownerUid && d.uid && d.uid !== ownerUid) return err('FOREIGN_UID');
            return d.pinHash === proof.ph ? { ok: true, player: pl.data() } : err('BAD_PROOF');
        }
        /**
         * Catat skor satu match. entry = { matchId, mode, round, hp, score }. Idempoten per (matchId, pemain).
         * Skor hangus (null/0) atau match < ronde 3 tidak dicatat.
         */
        async function recordScore(proof, entry) {
            if (MODES.indexOf(entry.mode) < 0) return err('BAD_MODE');
            if (!entry.matchId || !(entry.score > 0) || entry.round < MIN_ROUND) return err('NOT_COUNTED');
            const c = await check(proof); if (!c.ok) return c;
            const owner = proof.uid || c.player.uid || ownerUid;
            const sid = entry.matchId + '_' + proof.key, ex = await sref(sid).get(); if (ex.exists) return err('DUPLICATE');
            const row = { name: c.player.name, key: proof.key, mode: entry.mode, round: entry.round, hp: entry.hp || 0, score: entry.score, matchId: entry.matchId, at: now() };
            if (owner) row.uid = owner;
            await sref(sid).set(row);
            const d = c.player, tot = Object.assign(emptyTot(), d.tot), md = Object.assign(emptyTot(), (d.mode || {})[entry.mode]);
            tot.score += entry.score; tot.matches++; tot.best = Math.max(tot.best, entry.round);
            md.score += entry.score; md.matches++; md.best = Math.max(md.best, entry.round);
            const w = weekOf(now()), wk = Object.assign({ w: w, score: 0, matches: 0, best: 0 }, d.wk && d.wk.w === w ? d.wk : null);
            wk.score += entry.score; wk.matches++; wk.best = Math.max(wk.best, entry.round);
            const upd = { tot: tot, ['mode.' + entry.mode]: md, wk: wk };
            if (owner) upd.uid = owner;
            await pref(proof.key).update(upd);
            return { ok: true, tot: tot };
        }
        /** Papan peringkat: mode = 'all' atau salah satu MODES; urut skor total. */
        async function leaderboard(mode, limit) {
            if (mode === 'week') { // mingguan (Senin 00:00 UTC): urut skor minggu ini; baris dari minggu lain dibuang
                const w = weekOf(now()), q = await db.collection('ns_players').orderBy('wk.score', 'desc').limit(limit || 20).get(), rows = [];
                q.forEach(s => { const d = s.data(); if (d.wk && d.wk.w === w && d.wk.matches > 0) rows.push({ name: d.name, score: d.wk.score, matches: d.wk.matches, best: d.wk.best }); });
                return rows;
            }
            const field = (mode && mode !== 'all') ? 'mode.' + mode + '.score' : 'tot.score';
            const q = await db.collection('ns_players').orderBy(field, 'desc').limit(limit || 20).get();
            const rows = []; q.forEach(s => { const d = s.data(), t = (mode && mode !== 'all') ? (d.mode || {})[mode] : d.tot; if (t && t.matches > 0) rows.push({ name: d.name, score: t.score, matches: t.matches, best: t.best }); });
            return rows;
        }
        /** Periksa ulang satu entri skor Duel/Party/Co-op dari dokumen room (siapa pun boleh menjalankan). */
        async function verifyEntry(entry) {
            if (entry.mode === 'solo') return { ok: null, reason: 'SOLO_UNVERIFIABLE' };
            const code = String(entry.matchId).split('-')[0], s = await db.collection('ns_rooms').doc(code).get();
            if (!s.exists) return { ok: null, reason: 'NO_ROOM' };
            const M = JSON.parse(s.data().matchJson || 'null'); if (!M || !M.ended) return { ok: null, reason: 'NOT_ENDED' };
            const sc = NS.Match.score(M, entry.name); return { ok: sc === entry.score, expected: sc };
        }
        return { register: register, login: login, check: check, recordScore: recordScore, leaderboard: leaderboard, verifyEntry: verifyEntry, MAX_FAILS: MAX_FAILS, LOCK_MS: LOCK_MS };
    }
    NS.Id = { weekOf: weekOf, create: create, hashPin: hashPin, keyOf: keyOf, MODES: MODES, MIN_ROUND: MIN_ROUND };
    GH.ns = NS;
    GH.nsId = NS.Id;
    if (typeof module !== 'undefined' && module.exports) module.exports = NS;
})(typeof window !== 'undefined' ? window : globalThis);
