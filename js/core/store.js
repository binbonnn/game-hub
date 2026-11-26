/* =========================================================
   Game Hub v2 · Store (memori + Firestore)
   ---------------------------------------------------------
   TIDAK ADA localStorage / sessionStorage untuk data user.
   State di sini hanya hidup selama tab terbuka. Bila profil
   terdaftar, seluruh data user disalin ke Firestore lewat
   GH.cloud (user_data/{uid}) dan dibaca ulang saat identitas
   dipulihkan. Pemain tamu tidak meninggalkan data permanen.
   ========================================================= */
(function () {
  'use strict';
  var GH = window.GH = window.GH || {};
  var U = GH.util;
  var S = GH.store = {};

  var VERSION = 2;

  // Urutan tie-break mengikuti aturan ZIP. Fungsi ini sengaja dipakai bersama
  // oleh simpan skor, tampilan papan, dan perhitungan rank insight.
  var COMPARATORS = {
    speed: function (a, b) {
      var at = a.timeMs == null ? Infinity : a.timeMs;
      var bt = b.timeMs == null ? Infinity : b.timeMs;
      if (at !== bt) return at - bt;
      if ((a.mistakes || 0) !== (b.mistakes || 0)) return (a.mistakes || 0) - (b.mistakes || 0);
      return new Date(a.date || 0) - new Date(b.date || 0);
    },
    rapid: function (a, b) {
      if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
      if ((a.hints || 0) !== (b.hints || 0)) return (a.hints || 0) - (b.hints || 0);
      if ((a.burned || 0) !== (b.burned || 0)) return (a.burned || 0) - (b.burned || 0);
      return new Date(a.date || 0) - new Date(b.date || 0);
    },
    advanced: function (a, b) {
      var at = a.timeMs == null ? Infinity : a.timeMs;
      var bt = b.timeMs == null ? Infinity : b.timeMs;
      if (at !== bt) return at - bt;
      if ((a.burned || 0) !== (b.burned || 0)) return (a.burned || 0) - (b.burned || 0);
      if ((a.hints || 0) !== (b.hints || 0)) return (a.hints || 0) - (b.hints || 0);
      if ((a.mistakes || 0) !== (b.mistakes || 0)) return (a.mistakes || 0) - (b.mistakes || 0);
      return new Date(a.date || 0) - new Date(b.date || 0);
    }
  };

  // Versi ranking tanpa fallback tanggal. Baris yang benar-benar identik tetap
  // dihitung lebih dulu, mengikuti perilaku "beatenBy" pada ZIP.
  var RANK_COMPARATORS = {
    speed: function (a, b) {
      var at = a.timeMs == null ? Infinity : a.timeMs;
      var bt = b.timeMs == null ? Infinity : b.timeMs;
      if (at !== bt) return at - bt;
      if ((a.mistakes || 0) !== (b.mistakes || 0)) return (a.mistakes || 0) - (b.mistakes || 0);
      return -1;
    },
    rapid: function (a, b) {
      if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
      if ((a.hints || 0) !== (b.hints || 0)) return (a.hints || 0) - (b.hints || 0);
      if ((a.burned || 0) !== (b.burned || 0)) return (a.burned || 0) - (b.burned || 0);
      return -1;
    },
    advanced: function (a, b) {
      var at = a.timeMs == null ? Infinity : a.timeMs;
      var bt = b.timeMs == null ? Infinity : b.timeMs;
      if (at !== bt) return at - bt;
      if ((a.burned || 0) !== (b.burned || 0)) return (a.burned || 0) - (b.burned || 0);
      if ((a.hints || 0) !== (b.hints || 0)) return (a.hints || 0) - (b.hints || 0);
      if ((a.mistakes || 0) !== (b.mistakes || 0)) return (a.mistakes || 0) - (b.mistakes || 0);
      return -1;
    }
  };

  var BOARDS = {
    'multiply:10': { sort: 'time', compare: 'speed', max: 7, label: 'Perkalian 1–10 · 10 soal' },
    'multiply:20': { sort: 'time', compare: 'speed', max: 7, label: 'Perkalian 1–10 · 20 soal' },
    'multiply:30': { sort: 'time', compare: 'speed', max: 7, label: 'Perkalian 1–10 · 30 soal' },
    'knowledge': { sort: 'score', compare: 'rapid', max: 10, label: 'Pengetahuan Dasar · 60 detik' },
    'advmath:10': { sort: 'time', compare: 'advanced', max: 7, label: 'Perkalian Lanjutan · 10 soal' },
    'advmath:20': { sort: 'time', compare: 'advanced', max: 7, label: 'Perkalian Lanjutan · 20 soal' },
    'advmath:30': { sort: 'time', compare: 'advanced', max: 7, label: 'Perkalian Lanjutan · 30 soal' },
    'memo': { sort: 'score', max: 20, label: 'Memo Mayhem · Semua mode' },
    'memo:daily': { sort: 'score', max: 10, label: 'Memo Mayhem · Tantangan harian' },
    'nusantara:solo': { sort: 'score', max: 20, label: 'Nusantara Sirna · Solo' },
    'nusantara:week': { sort: 'score', max: 20, label: 'Nusantara Sirna · Minggu ini' },
    'multiply:duel': { sort: 'score', max: 10, label: 'Perkalian 1–10 · Kemenangan duel' },
    'knowledge:duel': { sort: 'score', max: 10, label: 'Pengetahuan Dasar · Kemenangan duel' },
    'advmath:duel': { sort: 'score', max: 10, label: 'Perkalian Lanjutan · Kemenangan duel' }
  };

  function defaults() {
    return {
      version: VERSION,
      createdAt: Date.now(),
      profile: { name: 'Pemain', avatar: '🦊', guest: false },
      settings: { sound: true, reducedMotion: false, motionAuto: true },
      boards: {},
      activity: [],
      sessions: 0,
      lastPlayed: {},
      daily: {},
      duelWins: {},
      introSeen: false,
      memo: { lastMode: 'snapshot', lastStyle: 'practice', lastDifficulty: 'normal' },
      nusantara: { lastArena: 'wirasana', lastSenapati: 'sen', identity: null }
    };
  }

  var state = defaults();
  var cloudUid = null;
  var saveTimer = null;
  var savePromise = Promise.resolve();

  function isMap(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function currentUid() {
    var id = GH.identity;
    if (!id || typeof id.isRegistered !== 'function' || !id.isRegistered()) return null;
    return typeof id.getUid === 'function' ? id.getUid() : null;
  }

  function gameIdForBoard(key) {
    var k = String(key || '');
    if (k.indexOf('multiply') === 0) return 'multiply';
    if (k.indexOf('knowledge') === 0) return 'knowledge';
    if (k.indexOf('advmath') === 0) return 'advmath';
    if (k.indexOf('memo') === 0) return 'memo';
    if (k.indexOf('nusantara') === 0) return 'nusantara';
    return k.split(':')[0] || 'hub';
  }

  /* ---------------- Firestore: baca/tulis data hub ---------------- */
  function cloudPayload() {
    return {
      version: VERSION,
      settings: Object.assign({}, state.settings),
      boards: Object.assign({}, state.boards),
      activity: state.activity.slice(),
      sessions: Number(state.sessions) || 0,
      lastPlayed: Object.assign({}, state.lastPlayed),
      daily: Object.assign({}, state.daily),
      duelWins: Object.assign({}, state.duelWins),
      memo: Object.assign({}, state.memo),
      nusantara: Object.assign({}, state.nusantara)
    };
  }

  function applyCloudData(data) {
    if (!isMap(data)) return;
    ['settings', 'boards', 'lastPlayed', 'daily', 'duelWins'].forEach(function (key) {
      if (isMap(data[key])) state[key] = Object.assign({}, data[key]);
    });
    if (Array.isArray(data.activity)) state.activity = data.activity.slice(0, 14);
    if (isFinite(Number(data.sessions))) state.sessions = Math.max(0, Math.floor(Number(data.sessions)));
    if (isMap(data.memo)) {
      state.memo = Object.assign({ lastMode: 'snapshot', lastStyle: 'practice', lastDifficulty: 'normal' }, data.memo);
    }
    if (isMap(data.nusantara)) {
      state.nusantara = Object.assign({ lastArena: 'wirasana', lastSenapati: 'sen', identity: null }, data.nusantara);
    }
    state.version = VERSION;
  }

  function flush() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    var uid = currentUid();
    if (!uid || !GH.cloud || typeof GH.cloud.saveUserData !== 'function') {
      return Promise.resolve({ ok: false, skipped: true });
    }
    cloudUid = uid;
    savePromise = savePromise.catch(function () { /* abaikan */ }).then(function () {
      return GH.cloud.saveUserData(cloudPayload());
    }).catch(function () {
      return { ok: false };
    });
    return savePromise;
  }

  function scheduleSave() {
    var uid = currentUid();
    if (!uid || !GH.cloud || typeof GH.cloud.saveUserData !== 'function') return;
    cloudUid = uid;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 150);
  }

  function hydrate(uid) {
    uid = uid || currentUid();
    if (!uid || !GH.cloud || typeof GH.cloud.getUserData !== 'function') {
      return Promise.resolve(false);
    }
    var target = uid;
    return GH.cloud.getUserData().then(function (data) {
      var active = currentUid();
      if (active && active !== target) return false;
      if (data) applyCloudData(data);
      cloudUid = target;
      return !!data;
    }).catch(function () { return false; });
  }

  S.get = function () { return state; };
  S.save = flush;
  S.flush = flush;
  S.hydrate = hydrate;
  S.boards = BOARDS;
  S.version = VERSION;

  // Kompatibilitas API lama. Tidak ada penyimpanan lokal lagi.
  S.hasLocalState = function () { return false; };
  S.getPersistence = function () { return 'memory'; };
  S.setPersistence = function () { return 'memory'; };
  S.clearGuestSession = function () { /* tidak ada sesi lokal */ };

  /* ---------------- Cloud hooks ----------------
     Rekor permanen hanya untuk profil terdaftar dan ditulis
     langsung ke Firestore oleh modul cloud. */
  function pushScoreToCloud(key, record) {
    var uid = currentUid();
    if (!uid || !GH.cloud || typeof GH.cloud.saveScore !== 'function') return;
    if (record && record.primary === false) return;
    var payload = Object.assign({}, record || {}, { uid: uid, primary: true });
    try {
      GH.cloud.saveScore(key, payload).catch(function () { /* status ditangani cloud */ });
    } catch (e) { /* abaikan */ }

    if (typeof GH.cloud.saveGameStat !== 'function') return;
    try {
      GH.cloud.saveGameStat(gameIdForBoard(key), {
        uid: uid,
        score: Number(record && record.score) || 0,
        meta: (record && record.meta) || {}
      }).catch(function () { /* status ditangani cloud */ });
    } catch (e) { /* abaikan */ }
  }

  function pushDuelWinToCloud(game, name, avatar, opts) {
    var uid = currentUid();
    if (!uid || !GH.cloud || typeof GH.cloud.saveDuelWin !== 'function') return;
    if (opts && opts.primary === false) return;
    try {
      GH.cloud.saveDuelWin(game, name, avatar, { uid: uid }).catch(function () { /* abaikan */ });
    } catch (e) { /* abaikan */ }
  }

  S.getProfile = function () { return state.profile; };
  S.setProfile = function (patch) {
    state.profile = Object.assign({}, state.profile, patch || {});
    return state.profile;
  };

  S.adoptIdentity = function (info) {
    info = info || {};
    if (!info.uid) return state.profile;

    var keepHistory = !!info.legacy || (state.profile.uid === info.uid && !!state.profile.registered);
    var next = keepHistory ? state : defaults();
    if (!keepHistory) {
      next.settings = Object.assign({}, state.settings);
      next.memo = Object.assign({}, state.memo);
      next.nusantara = Object.assign({}, state.nusantara);
    }

    next.profile = Object.assign({}, next.profile, {
      uid: info.uid,
      registered: true,
      guest: false,
      legacy: false,
      name: info.name || state.profile.name || 'Pemain',
      avatar: info.avatar || state.profile.avatar || '🦊',
      createdAt: info.createdAt || state.profile.createdAt || Date.now(),
      updatedAt: Date.now()
    });

    state = next;
    cloudUid = info.uid;
    // Identitas baru: data lama tamu tidak pernah dipindahkan ke UID ini.
    // Riwayat profil lama sudah ikut adioptasi bila info.legacy = true.
    hydrate(info.uid);
    return state.profile;
  };

  S.getSettings = function () { return state.settings; };
  S.setSetting = function (key, value) {
    state.settings[key] = value;
    scheduleSave();
  };

  S.getBoardConfig = function (key) {
    return BOARDS[key] || { sort: 'score', max: 10, label: key };
  };

  S.compareBoardEntries = function (key, a, b) {
    var config = S.getBoardConfig(key);
    var compare = COMPARATORS[config.compare];
    if (compare) return compare(a || {}, b || {});
    if (config.sort === 'time') {
      var at = a && a.timeMs != null ? a.timeMs : Infinity;
      var bt = b && b.timeMs != null ? b.timeMs : Infinity;
      return at - bt;
    }
    return ((b && b.score) || 0) - ((a && a.score) || 0);
  };

  S.compareForRank = function (key, a, b) {
    var config = S.getBoardConfig(key);
    var compare = RANK_COMPARATORS[config.compare];
    if (compare) return compare(a || {}, b || {});
    return S.compareBoardEntries(key, a, b);
  };

  S.rankFor = function (key, candidate, rows) {
    var list = Array.isArray(rows) ? rows : S.getBoard(key);
    var better = list.filter(function (row) {
      return S.compareForRank(key, row, candidate) < 0;
    }).length;
    return better + 1;
  };

  S.getBoard = function (key) {
    var list = state.boards[key];
    return Array.isArray(list) ? list.slice() : [];
  };

  S.addScore = function (key, entry, opts) {
    opts = opts || {};
    var config = S.getBoardConfig(key);
    var list = S.getBoard(key);
    var uid = currentUid();
    var record = Object.assign({
      id: U.uid('sc'),
      name: state.profile.name || 'Pemain',
      avatar: state.profile.avatar || '🦊',
      date: new Date().toISOString(),
      score: 0,
      timeMs: null,
      meta: {}
    }, entry || {});
    if (uid && record.primary !== false) record.uid = uid;
    list.push(record);
    list.sort(function (a, b) {
      var compared = S.compareBoardEntries(key, a, b);
      if (compared) return compared;
      return new Date(a.date || 0) - new Date(b.date || 0);
    });
    var max = opts.max || config.max || 10;
    var trimmed = list.slice(0, max);
    state.boards[key] = trimmed;
    scheduleSave();
    pushScoreToCloud(key, record);
    var rank = trimmed.findIndex(function (r) { return r.id === record.id; }) + 1;
    return {
      rank: rank || null,
      total: trimmed.length,
      isBest: rank === 1,
      entry: record,
      board: trimmed.slice()
    };
  };

  S.bestScore = function (key) {
    var board = S.getBoard(key);
    return board.length ? board[0] : null;
  };

  S.recordActivity = function (item) {
    var entry = Object.assign({
      id: U.uid('act'),
      game: 'hub',
      label: 'Sesi',
      value: '',
      date: new Date().toISOString()
    }, item || {});
    state.activity.unshift(entry);
    state.activity = state.activity.slice(0, 14);
    state.sessions = (state.sessions || 0) + 1;
    if (entry.game && entry.game !== 'hub') state.lastPlayed[entry.game] = entry.date;
    scheduleSave();
    return entry;
  };

  S.getActivity = function () { return state.activity.slice(); };
  S.getSessions = function () { return state.sessions || 0; };
  S.getLastPlayed = function (game) { return state.lastPlayed[game] || null; };
  S.lastGame = function () {
    var entries = Object.keys(state.lastPlayed).sort(function (a, b) {
      return new Date(state.lastPlayed[b]) - new Date(state.lastPlayed[a]);
    });
    return entries[0] || null;
  };

  S.streak = function () {
    return U.streakFromDates(state.activity.map(function (a) { return a.date; }));
  };

  S.gamesPlayed = function () {
    return U.unique(state.activity.map(function (a) { return a.game; }).filter(function (g) {
      return g && g !== 'hub';
    })).length;
  };

  S.markDaily = function (dateKey, score) {
    state.daily[dateKey] = { score: score, date: new Date().toISOString() };
    scheduleSave();
  };
  S.getDaily = function (dateKey) { return state.daily[dateKey] || null; };

  S.setMemoPrefs = function (patch) {
    state.memo = Object.assign({}, state.memo, patch || {});
    scheduleSave();
  };
  S.getMemoPrefs = function () { return state.memo; };

  /* ---------------- Kemenangan duel online ---------------- */
  S.addDuelWin = function (game, name, avatar, opts) {
    var clean = U.cleanName(name) || 'Pemain';
    var key = String(game || 'duel') + ':' + clean.toLowerCase();
    var rec = state.duelWins[key] || {
      id: key,
      game: game || 'duel',
      name: clean,
      avatar: avatar || '🦊',
      wins: 0,
      updatedAt: null
    };
    rec.name = clean;
    rec.avatar = avatar || rec.avatar || '🦊';
    rec.wins = (rec.wins || 0) + 1;
    rec.updatedAt = new Date().toISOString();
    state.duelWins[key] = rec;
    scheduleSave();
    pushDuelWinToCloud(game, rec.name, rec.avatar, opts);
    return rec;
  };

  S.getDuelWins = function (game) {
    var all = Object.keys(state.duelWins).map(function (k) { return state.duelWins[k]; });
    var rows = all.filter(function (r) { return r && (!game || r.game === game); });
    rows.sort(function (a, b) {
      if ((b.wins || 0) !== (a.wins || 0)) return (b.wins || 0) - (a.wins || 0);
      return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    });
    return rows;
  };

  S.getNusantaraPrefs = function () {
    if (!state.nusantara || typeof state.nusantara !== 'object') state.nusantara = {};
    return state.nusantara;
  };
  S.setNusantaraPrefs = function (patch) {
    state.nusantara = Object.assign({}, S.getNusantaraPrefs(), patch || {});
    scheduleSave();
  };

  S.resetAll = function () {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    state = defaults();
    cloudUid = null;
    var uid = currentUid();
    if (uid && GH.cloud && typeof GH.cloud.clearUserData === 'function') {
      GH.cloud.clearUserData().catch(function () { /* status ditangani cloud */ });
    }
  };
})();
