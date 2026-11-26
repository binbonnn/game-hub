/* =========================================================
   Game Hub v2 · Memo data helpers (ZIP-authoritative rules)
   ---------------------------------------------------------
   Pencapaian, kunci papan, dan payload sesi diambil dari
   memo-data.js ZIP. Profil lokal ZIP sengaja tidak dipakai:
   identitas memakai GH.identity/UID rebuild, dan antrean
   lokal tidak dipakai — item hanya hidup di memori.
   ========================================================= */
(function () {
  'use strict';
  var GH = window.GH = window.GH || {};
  var Core = GH.memoCore || window.MemoCore || null;

  var ACH = [
    { id: 'first', icon: '🌱', name: 'First Recall', desc: 'Selesaikan sesi pertamamu.', creature: '🐙', test: function (x) { return !!x.s.done; } },
    { id: 'sharp', icon: '👁️', name: 'Sharp Eyes', desc: 'Akurasi ≥ 90% pada sesi Snapshot (≥ 10 ronde).', creature: '🦉', test: function (x) { return x.s.mode === 'snapshot' && x.s.type === 'standard' && !!x.s.done && x.s.total >= 10 && x.s.accuracy >= 0.9; } },
    { id: 'seqmaster', icon: '🔢', name: 'Sequence Master', desc: 'Jawab benar sebuah urutan sepanjang 7 elemen atau lebih.', creature: '🐢', test: function (x) { return (x.data.counters.maxSeqLen || 0) >= 7; } },
    { id: 'nomistakes', icon: '💎', name: 'No Mistakes', desc: 'Selesaikan sesi (≥ 10 ronde) tanpa satu pun kesalahan.', creature: '🦊', test: function (x) { return x.s.type === 'standard' && !!x.s.done && x.s.total >= 10 && x.s.correct === x.s.total; } },
    { id: 'comeback', icon: '🔥', name: 'Comeback', desc: 'Selesaikan sesi setelah kehilangan 2 stability point.', creature: '🦅', test: function (x) { return x.s.type === 'standard' && !!x.s.done && (x.s.livesLost || 0) >= 2; } },
    { id: 'combo10', icon: '⚡', name: 'Combo 10', desc: 'Capai combo 10 jawaban benar beruntun.', creature: '🦄', test: function (x) { return (x.s.bestCombo || 0) >= 10; } },
    { id: 'expert', icon: '🧠', name: 'Expert Clear', desc: 'Selesaikan sesi standar tingkat Expert.', creature: '🐲', test: function (x) { return x.s.type === 'standard' && x.s.diff === 'expert' && !!x.s.done; } },
    { id: 'marathon', icon: '🏃', name: 'Marathon', desc: 'Selesaikan sesi 30 ronde.', creature: '🦖', test: function (x) { return x.s.type === 'standard' && !!x.s.done && (x.s.plannedRounds || 0) >= 30; } },
    { id: 'allmodes', icon: '🗺️', name: 'Penjelajah', desc: 'Mainkan keenam mode inti sedikitnya sekali.', creature: '🦉', test: function (x) {
      var modes = Core && Core.MODES ? Core.MODES : ['snapshot', 'sequence', 'glitch', 'copycat', 'echo', 'mindtrap'];
      return modes.every(function (m) { return (x.data.counters.modes[m] || 0) > 0; });
    } },
    { id: 'daily', icon: '📅', name: 'Rutin Harian', desc: 'Selesaikan sebuah Daily Challenge.', creature: '🐝', test: function (x) { return x.s.type === 'daily' && !!x.s.done; } },
    { id: 'mindcore', icon: '🛠️', name: 'Mindcore Breaker', desc: 'Taklukkan Boss Experiment.', creature: '👾', test: function (x) { return x.s.type === 'boss' && !!x.s.done; } },
    { id: 'duelwin', icon: '⚔️', name: 'Pemenang Duel', desc: 'Menangkan satu duel online.', creature: '🦁', test: function (x) { return !!x.duelWin; } }
  ];

  var CREATURES = ['👽'].concat(ACH.map(function (a) { return a.creature; }).filter(function (v, i, a) { return a.indexOf(v) === i; }));

  function evalAch(s, counters, have, duelWin) {
    var ctx = { s: s, data: { counters: counters || { modes: {}, maxSeqLen: 0 } }, duelWin: !!duelWin };
    var out = [];
    ACH.forEach(function (a) {
      if (!have || !have[a.id]) {
        try { if (a.test(ctx)) out.push(a); } catch (e) { /* abaikan */ }
      }
    });
    return out;
  }

  function boardKey(s) {
    if (s.type === 'standard') return ['std', s.mode, s.diff, s.plannedRounds].join('|');
    if (s.type === 'daily') return 'daily|' + s.dateKey;
    return s.type; // endless | boss
  }
  function remoteKey(s) { return boardKey(s).replace(/\|/g, '_'); }

  function rnd(n) {
    var s = '';
    var a = new Uint8Array(n);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(a);
    else for (var i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 256);
    for (var j = 0; j < a.length; j++) s += (a[j] % 36).toString(36);
    return s;
  }
  function newSid() { return 's' + Date.now().toString(36) + rnd(10); }

  function identitySnapshot() {
    if (!GH.identity || typeof GH.identity.getIdentity !== 'function') return null;
    return GH.identity.getIdentity();
  }

  var items = new WeakMap();
  function buildItem(s, extra) {
    var snap = identitySnapshot();
    if (!snap || !snap.registered || !snap.uid || s.practice) return null;
    if (items.has(s)) return items.get(s);
    extra = extra || {};
    var bk = (s.type === 'standard' || s.type === 'daily' || s.type === 'endless' || s.type === 'boss') && !extra.noBoard ? remoteKey(s) : '';
    var item = {
      sid: newSid(),
      pid: snap.uid,
      localId: snap.uid,
      t: Date.now(),
      won: !!extra.won,
      session: s,
      payload: {
        type: s.type,
        mode: s.mode || '',
        diff: s.diff || '',
        plannedRounds: s.plannedRounds || 0,
        total: s.total || 0,
        correct: s.correct || 0,
        score: s.score || 0,
        accP: Math.round((s.accuracy || 0) * 1000),
        totalMs: s.totalMs || 0,
        bestCombo: s.bestCombo || 0,
        livesLost: s.livesLost || 0,
        maxSeqLen: s.maxSeqLen || 0,
        done: !!s.done,
        failed: !!s.failed,
        won: !!extra.won,
        dateKey: s.dateKey || '',
        bk: bk,
        modesSeen: (s.modesSeen || []).slice(0, 6)
      }
    };
    items.set(s, item);
    return item;
  }

  GH.memoData = {
    ACH: ACH,
    CREATURES: CREATURES,
    evalAch: evalAch,
    boardKey: boardKey,
    remoteKey: remoteKey,
    buildItem: buildItem,
    newSid: newSid
  };
})();
