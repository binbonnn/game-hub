/* =====================================================================
   MEMO MAYHEM — PENGATURAN LOKAL, PENUNJUK PROFIL, PENCAPAIAN, SUARA
   Pemain TERDAFTAR: semua data (sesi, statistik, pencapaian, peringkat)
   hanya disimpan di Firebase lewat memo-cloud.js. Pemain TAMU: tidak ada
   yang disimpan. Di perangkat hanya ada pengaturan (suara dsb.) dan penunjuk
   profil terdaftar (id, nama, ikon). Tidak ada antrean sesi.
===================================================================== */
(function () {
    'use strict';
    const C = MemoCore;
    const KEY = 'memoMayhemCosmicRecall_v1';   // kunci tetap; isinya kini skema 2
    const KEY_LAMA = KEY + '_v1_lama';          // cadangan data skema 1 (statistik lokal, antrean) sebelum dibersihkan
    const SCHEMA = 2;

    function defaults() {
        return {
            v: SCHEMA,
            profiles: [],   // hanya profil TERDAFTAR: { id, name, icon, pid, owner }
            active: null,   // null = tamu
            settings: { sound: true, volume: 0.7, reduceMotion: false, last: { mode: 'snapshot', diff: 'normal', rounds: 10, play: 'standard' } }
        };
    }

    let memoryOnly = false, migrated = false;
    let data = load();
    if (migrated) save();

    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { memoryOnly = true; }
        if (!raw) return defaults();
        try {
            const d = JSON.parse(raw);
            if (!d || typeof d !== 'object' || (d.v !== SCHEMA && d.v !== 1) || !Array.isArray(d.profiles)) throw new Error('skema');
            const out = defaults();
            out.settings = Object.assign(out.settings, d.settings || {});
            out.settings.last = Object.assign(defaults().settings.last, (d.settings || {}).last || {});
            out.profiles = d.profiles.filter(p => p && p.pid && p.owner).map(p => ({ id: String(p.id), name: String(p.name || ''), icon: p.icon || '👽', pid: String(p.pid), owner: String(p.owner) }));
            const ok = out.profiles.some(p => p.id === d.active);
            if (d.v === 1) {
                // Skema lama: statistik lokal, antrean sesi, dan profil lokal dibuang. Hanya profil terdaftar yang jadi penunjuk.
                migrated = true;
                out.active = ok ? d.active : (out.profiles[0] ? out.profiles[0].id : null);
                if ((d.sessions && d.sessions.length) || (d.outbox && d.outbox.length) || out.profiles.length) {
                    try { localStorage.setItem(KEY_LAMA, raw); } catch (e) { console.warn('[Memo] gagal menyimpan cadangan data lama', e); }
                }
            } else out.active = ok ? d.active : null;
            return out;
        } catch (e) {
            try { localStorage.setItem(KEY + '_corrupt', raw); } catch (_) { console.warn('[Memo] gagal menyimpan cadangan data rusak', _); /* abaikan */ }
            return defaults();
        }
    }
    function save() {
        if (memoryOnly) return false;
        try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { memoryOnly = true; return false; }
    }

    /* ---------- Pemain: terdaftar (penunjuk) atau tamu ---------- */
    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const guest = n => n ? { id: 'guest' + n, name: 'Tamu ' + n, icon: '👤', guest: true } : { id: 'guest', name: 'Tamu', icon: '👤', guest: true };
    const activeProfile = () => data.profiles.find(p => p.id === data.active) || guest();
    const profileById = id => data.profiles.find(p => p.id === id) || (/^guest[12]?$/.test(String(id)) ? guest(String(id).slice(5)) : null);
    function addRegistered(info) { // info = { pid, owner, name } hasil pendaftaran di server
        const p = { id: 'p' + uid(), name: info.name, icon: '👽', pid: info.pid, owner: info.owner };
        data.profiles.push(p); data.active = p.id; save(); return p;
    }
    function setActive(id) {
        if (id == null || id === 'guest') { data.active = null; save(); }
        else if (data.profiles.some(p => p.id === id)) { data.active = id; save(); }
    }
    function removeProfile(id) {
        const i = data.profiles.findIndex(p => p.id === id); if (i < 0) return null;
        const p = data.profiles.splice(i, 1)[0];
        if (data.active === id) data.active = data.profiles[0] ? data.profiles[0].id : null;
        save(); return p;
    }
    function setIcon(id, icon) { const p = data.profiles.find(x => x.id === id); if (p && icon) { p.icon = icon; save(); } }

    /* ---------- Pencapaian & makhluk memori (kosmetik, tanpa efek gameplay) ---------- */
    const ACH = [
        { id: 'first', icon: '🌱', name: 'First Recall', desc: 'Selesaikan sesi pertamamu.', creature: '🐙', test: x => x.s.done },
        { id: 'sharp', icon: '👁️', name: 'Sharp Eyes', desc: 'Akurasi ≥ 90% pada sesi Snapshot (≥ 10 ronde).', creature: '🦉', test: x => x.s.mode === 'snapshot' && x.s.type === 'standard' && x.s.done && x.s.total >= 10 && x.s.accuracy >= 0.9 },
        { id: 'seqmaster', icon: '🔢', name: 'Sequence Master', desc: 'Jawab benar sebuah urutan sepanjang 7 elemen atau lebih.', creature: '🐢', test: x => x.data.counters.maxSeqLen >= 7 },
        { id: 'nomistakes', icon: '💎', name: 'No Mistakes', desc: 'Selesaikan sesi (≥ 10 ronde) tanpa satu pun kesalahan.', creature: '🦊', test: x => x.s.type === 'standard' && x.s.done && x.s.total >= 10 && x.s.correct === x.s.total },
        { id: 'comeback', icon: '🔥', name: 'Comeback', desc: 'Selesaikan sesi setelah kehilangan 2 stability point.', creature: '🦅', test: x => x.s.type === 'standard' && x.s.done && x.s.livesLost >= 2 },
        { id: 'combo10', icon: '⚡', name: 'Combo 10', desc: 'Capai combo 10 jawaban benar beruntun.', creature: '🦄', test: x => x.s.bestCombo >= 10 },
        { id: 'expert', icon: '🧠', name: 'Expert Clear', desc: 'Selesaikan sesi standar tingkat Expert.', creature: '🐲', test: x => x.s.type === 'standard' && x.s.diff === 'expert' && x.s.done },
        { id: 'marathon', icon: '🏃', name: 'Marathon', desc: 'Selesaikan sesi 30 ronde.', creature: '🦖', test: x => x.s.type === 'standard' && x.s.done && x.s.plannedRounds >= 30 },
        { id: 'allmodes', icon: '🗺️', name: 'Penjelajah', desc: 'Mainkan keenam mode inti sedikitnya sekali.', creature: '🦉', test: x => C.MODES.every(m => (x.data.counters.modes[m] || 0) > 0) },
        { id: 'daily', icon: '📅', name: 'Rutin Harian', desc: 'Selesaikan sebuah Daily Challenge.', creature: '🐝', test: x => x.s.type === 'daily' && x.s.done },
        { id: 'mindcore', icon: '🛠️', name: 'Mindcore Breaker', desc: 'Taklukkan Boss Experiment.', creature: '👾', test: x => x.s.type === 'boss' && x.s.done },
        { id: 'duelwin', icon: '⚔️', name: 'Pemenang Duel', desc: 'Menangkan satu duel lokal.', creature: '🦁', test: x => x.duelWin }
    ];
    const CREATURES = ['👽'].concat(ACH.map(a => a.creature).filter((v, i, a) => a.indexOf(v) === i));

    /* Dipakai server (memo-cloud.js) untuk menentukan pencapaian baru dari statistik di server + sesi ini. */
    function evalAch(s, counters, have, duelWin) {
        const ctx = { s, data: { counters }, duelWin: !!duelWin }, out = [];
        ACH.forEach(a => { if (!have[a.id] && a.test(ctx)) out.push(a); });
        return out;
    }

    /* ---------- Papan peringkat: kunci kategori ---------- */
    function boardKey(s) {
        if (s.type === 'standard') return ['std', s.mode, s.diff, s.plannedRounds].join('|');
        if (s.type === 'daily') return 'daily|' + s.dateKey;
        return s.type; // endless | boss
    }
    const remoteKey = s => boardKey(s).replace(/\|/g, '_'); // kunci kategori di Firebase (tanpa karakter khusus)

    /* ---------- Sesi untuk disimpan ke Firebase ----------
       Sekali coba, TANPA antrean dan tanpa salinan lokal. Objek ini hanya hidup di memori selama
       layar hasil terbuka (agar tombol "Coba lagi" bisa mengirim ulang dengan id yang sama). */
    const items = new WeakMap();
    function buildItem(s, extra) {
        const pr = data.profiles.find(p => p.id === s.profileId);
        if (!pr || !pr.pid || s.practice) return null;
        if (items.has(s)) return items.get(s);
        extra = extra || {};
        const bk = (s.type === 'standard' || s.type === 'daily' || s.type === 'endless' || s.type === 'boss') && !extra.noBoard ? remoteKey(s) : '';
        const item = {
            sid: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12), pid: pr.pid, localId: pr.id, t: Date.now(),
            won: !!extra.won, session: s,
            payload: {
                type: s.type, mode: s.mode || '', diff: s.diff || '', plannedRounds: s.plannedRounds || 0, total: s.total, correct: s.correct, score: s.score,
                accP: Math.round(s.accuracy * 1000), totalMs: s.totalMs || 0, bestCombo: s.bestCombo || 0, livesLost: s.livesLost || 0, maxSeqLen: s.maxSeqLen || 0,
                done: !!s.done, failed: !!s.failed, won: !!extra.won, dateKey: s.dateKey || '', bk, modesSeen: s.modesSeen || []
            }
        };
        items.set(s, item);
        return item;
    }

    function resetAll() {
        const keepSettings = data.settings;
        data = defaults(); data.settings = keepSettings; save();
        try { localStorage.removeItem(KEY_LAMA); } catch (e) { console.warn('[Memo] gagal menghapus cadangan lama', e); }
    }

    /* =====================================================================
       SUARA (Web Audio) — dapat dimatikan, volume diatur di pengaturan
    ===================================================================== */
    let actx = null;
    function ctx() {
        if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } }
        if (actx && actx.state === 'suspended') actx.resume().catch(() => {});
        return actx;
    }
    function tone(freq, dur, wave, vol, delay) {
        if (!data.settings.sound || data.settings.volume <= 0) return;
        const c = ctx(); if (!c) return;
        const t0 = c.currentTime + (delay || 0);
        const o = c.createOscillator(), g = c.createGain();
        o.type = wave || 'sine'; o.frequency.setValueAtTime(freq, t0);
        const peak = Math.max(0.0001, (vol == null ? 0.2 : vol) * data.settings.volume);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g); g.connect(c.destination);
        o.start(t0); o.stop(t0 + dur + 0.03);
    }
    const sfx = {
        unlock() { ctx(); },
        tone,
        pad(p) { tone(p.freq, 0.34, p.wave, p.wave === 'sine' ? 0.28 : 0.14); },
        tick() { tone(880, 0.05, 'triangle', 0.08); },
        correct() { tone(523, 0.12, 'sine', 0.2); tone(659, 0.12, 'sine', 0.2, 0.1); tone(784, 0.2, 'sine', 0.2, 0.2); },
        wrong() { tone(220, 0.22, 'sawtooth', 0.12); tone(165, 0.3, 'sawtooth', 0.12, 0.15); },
        combo(n) { const b = 600 + Math.min(n, 12) * 40; tone(b, 0.08, 'square', 0.1); tone(b * 1.25, 0.08, 'square', 0.1, 0.07); tone(b * 1.5, 0.14, 'square', 0.1, 0.14); },
        phase() { tone(440, 0.1, 'triangle', 0.15); tone(660, 0.16, 'triangle', 0.15, 0.09); },
        win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'sine', 0.2, i * 0.13)); },
        lose() { [392, 330, 262].forEach((f, i) => tone(f, 0.3, 'sine', 0.18, i * 0.18)); }
    };

    window.MemoData = {
        get data() { return data; }, get memoryOnly() { return memoryOnly; },
        save, activeProfile, profileById, guest, addRegistered, setActive, removeProfile, setIcon, remoteKey, boardKey,
        ACH, CREATURES, evalAch, buildItem, resetAll, sfx
    };
})();
