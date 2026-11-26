/* =========================================================
   Game Hub v2 · Cloud (Firestore) adapter + status
   ---------------------------------------------------------
   Firestore adalah SATU-SATUNYA tempat penyimpanan data user.
   Tidak ada localStorage/sessionStorage untuk data pemain:
     • profil & statistik  : players/{uid}
     • data hub pemain     : user_data/{uid}
     • rekor solo & duel   : records_*, *_duel_wins
     • room multiplayer    : duels, *_duels
     • Memo & Nusantara    : memo_*, ns_*

   Tamu hanya memakai memori tab selama halaman terbuka. SDK
   Firebase dimuat malas oleh init() saat dibutuhkan.
   ========================================================= */
(function () {
  'use strict';
  var GH = window.GH = window.GH || {};
  var U = GH.util || {};
  var C = GH.cloud = {};

  var CONFIG = GH.firebaseConfig || null;
  var OPTIONS = GH.firebaseOptions || {};
  var SDK_VERSION = OPTIONS.sdk || '10.14.1';
  var SDK_BASE = 'https://www.gstatic.com/firebasejs/' + SDK_VERSION + '/';
  var PROBE_COLLECTION = OPTIONS.probeCollection || 'records_10';

  var PHASE_LABEL = {
    idle: 'Belum dimulai',
    connecting: 'Menghubungkan…',
    online: 'Global aktif',
    degraded: 'Server tidak terjangkau',
    offline: 'Perangkat offline',
    disabled: 'Mode lokal',
    error: 'Koneksi gagal'
  };

  var AUTH_LABEL = {
    off: 'Belum dipakai',
    'signing-in': 'Menyiapkan sesi…',
    anonymous: 'Anonim aktif',
    error: 'Gagal'
  };

  var state = {
    enabled: !!(CONFIG && CONFIG.apiKey && CONFIG.projectId),
    phase: 'idle',
    auth: 'off',
    projectId: (CONFIG && CONFIG.projectId) || '',
    sdk: SDK_VERSION,
    detail: '',
    error: '',
    authError: '',
    latencyMs: null,
    checkedAt: null,
    writes: 0,
    writeErrors: 0,
    lastWriteAt: null,
    lastWriteLabel: '',
    uid: ''
  };

  var firebaseApp = null;
  var db = null;
  var initPromise = null;
  var authPromise = null;
  var authSdkPromise = null;
  var probePromise = null;
  var listeners = [];

  /* ---------------- Status ---------------- */
  function snapshot() {
    return {
      enabled: state.enabled,
      phase: state.phase,
      label: PHASE_LABEL[state.phase] || state.phase,
      auth: state.auth,
      authLabel: AUTH_LABEL[state.auth] || state.auth,
      projectId: state.projectId,
      sdk: state.sdk,
      detail: state.detail,
      error: state.error,
      authError: state.authError,
      latencyMs: state.latencyMs,
      checkedAt: state.checkedAt,
      writes: state.writes,
      writeErrors: state.writeErrors,
      lastWriteAt: state.lastWriteAt,
      lastWriteLabel: state.lastWriteLabel,
      uid: state.uid,
      online: state.phase === 'online'
    };
  }

  function emit() {
    var snap = snapshot();
    listeners.slice().forEach(function (fn) {
      try { fn(snap); } catch (e) { /* abaikan */ }
    });
  }

  function setPhase(phase, detail, error) {
    state.phase = phase;
    if (detail !== undefined) state.detail = detail;
    state.error = error || '';
    emit();
  }

  C.getStatus = snapshot;
  C.label = function () { return snapshot().label; };

  C.onChange = function (fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    try { fn(snapshot()); } catch (e) { /* abaikan */ }
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  };

  /* ---------------- Util internal ---------------- */
  // Potong per karakter Unicode agar emoji tidak terbelah di tengah.
  function truncate(value, max) {
    var chars = Array.from(String(value == null ? '' : value));
    return chars.slice(0, max).join('');
  }

  function cleanName(value, fallback, max) {
    var name = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    if (!name) name = fallback || 'Pemain';
    return truncate(name, max || 24) || (fallback || 'Pemain');
  }

  function cleanAvatar(value) {
    var av = String(value == null ? '' : value).trim();
    return av ? truncate(av, 16) : '🦊';
  }

  function clampInt(value, min, max, fallback) {
    var n = Math.round(Number(value));
    if (!isFinite(n)) n = fallback == null ? 0 : fallback;
    if (n < min) n = min;
    if (n > max) n = max;
    return n;
  }

  function clampNum(value, min, max, fallback) {
    var n = Number(value);
    if (!isFinite(n)) n = fallback == null ? 0 : fallback;
    if (n < min) n = min;
    if (n > max) n = max;
    return n;
  }

  function seconds(ms) {
    var n = Number(ms);
    if (!isFinite(n) || n < 0) return 0;
    return Math.round(n) / 1000;
  }

  function withTimeout(promise, ms, message) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        var err = new Error(message || 'Waktu koneksi habis.');
        err.code = 'timeout';
        reject(err);
      }, ms || 12000);
      promise.then(function (value) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(value);
      }, function (err) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  function describeError(err) {
    var code = (err && (err.code || err.name)) || '';
    var message = (err && err.message) || '';
    if (code === 'permission-denied' || /permission/i.test(code)) return 'Aturan Firestore menolak permintaan ini.';
    if (code === 'unavailable' || code === 'timeout' || /network|offline|failed to get document/i.test(message)) {
      return 'Server Firestore tidak terjangkau dari perangkat ini.';
    }
    if (code === 'unauthenticated') return 'Sesi login belum siap.';
    if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
      return 'Login anonim belum diaktifkan di Firebase Console.';
    }
    if (code === 'auth/unauthorized-domain') return 'Domain ini belum diizinkan untuk Firebase Auth.';
    if (code === 'resource-exhausted') return 'Kuota Firestore sedang penuh.';
    if (code === 'failed-precondition') return 'Firestore meminta indeks atau konfigurasi tambahan.';
    if (code === 'invalid-argument') return 'Data yang dikirim tidak diterima Firestore.';
    if (!navigator.onLine) return 'Perangkat sedang offline.';
    return message ? message.slice(0, 160) : 'Terjadi kesalahan yang tidak dikenal.';
  }

  // Rekor permanen hanya boleh dibuat oleh profil terdaftar. Bila modul
  // identitas belum dimuat (fallback lama), perilaku lama tetap dipakai.
  function canPersist() {
    var identity = GH.identity;
    if (!identity || typeof identity.isRegistered !== 'function') return true;
    return !!identity.isRegistered();
  }

  function scriptLoaded(src) {
    // Stub browser (tools/stub-cloud.js) sudah menyediakan Firestore/Auth.
    if (window.__stubFirestore) return true;
    return !!document.querySelector('script[data-gh-sdk="' + src + '"]');
  }

  function loadScript(src) {
    if (scriptLoaded(src)) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var el = document.createElement('script');
      el.src = src;
      el.async = true;
      el.setAttribute('data-gh-sdk', src);
      el.onload = function () { resolve(); };
      el.onerror = function () {
        var err = new Error('Gagal memuat ' + src);
        err.code = 'sdk-load-failed';
        if (el.parentNode) el.parentNode.removeChild(el);
        reject(err);
      };
      document.head.appendChild(el);
    });
  }

  /* ---------------- Init ---------------- */
  C.init = function () {
    if (initPromise) return initPromise;

    if (!state.enabled) {
      state.phase = 'disabled';
      state.detail = 'Konfigurasi Firebase tidak tersedia. Data pemain tidak disimpan permanen.';
      emit();
      initPromise = Promise.resolve(false);
      return initPromise;
    }

    setPhase('connecting', 'Menyiapkan SDK Firebase…');

    // Skenario uji lokal boleh menginjeksi SDK (window.firebase) lebih dulu,
    // misalnya lewat stub browser. Produksi tetap memuat SDK dari CDN.
    var sdkReady = (window.firebase && typeof window.firebase.firestore === 'function'
      && typeof window.firebase.initializeApp === 'function')
      ? Promise.resolve()
      : loadScript(SDK_BASE + 'firebase-app-compat.js')
        .then(function () { return loadScript(SDK_BASE + 'firebase-firestore-compat.js'); });

    initPromise = sdkReady
      .then(function () {
        if (!window.firebase) throw new Error('SDK Firebase tidak tersedia setelah dimuat.');
        firebaseApp = (window.firebase.apps && window.firebase.apps.length)
          ? window.firebase.app()
          : window.firebase.initializeApp(CONFIG);
        db = window.firebase.firestore();
        try { db.settings({ ignoreUndefinedProperties: true }); } catch (e) { /* sudah diatur */ }
        state.detail = 'Firestore siap. Memeriksa izin baca…';
        emit();
        return probe(true);
      })
      .then(function (ok) {
        if (!ok) {
          state.detail = state.detail || 'Firestore belum bisa dijangkau. Data pemain hanya tersedia di memori tab ini.';
        }
        // Inisialisasi SDK dianggap siap walau probe gagal; probe berikutnya
        // (atau tulisan pertama) akan mencoba koneksi lagi.
        return !!db;
      })
      .catch(function (err) {
        setPhase('error', 'Koneksi Firebase gagal. Data pemain hanya tersedia di memori tab ini.', describeError(err));
        return false;
      });

    return initPromise;
  };

  /* ---------------- Probe koneksi ---------------- */
  function probe(silent) {
    if (!db) return Promise.resolve(false);
    if (probePromise) return probePromise;

    var started = Date.now();
    if (!silent) {
      state.detail = 'Memeriksa koneksi Firestore…';
      emit();
    }

    probePromise = withTimeout(
      db.collection(PROBE_COLLECTION).limit(1).get(),
      12000,
      'Pemeriksaan koneksi Firestore melebihi 12 detik.'
    ).then(function () {
      state.latencyMs = Date.now() - started;
      state.checkedAt = Date.now();
      state.detail = 'Terhubung ke Firestore. Skor baru langsung dikirim ke papan global.';
      setPhase('online');
      return true;
    }).catch(function (err) {
      state.latencyMs = null;
      state.checkedAt = Date.now();
      var offline = (typeof navigator !== 'undefined' && navigator.onLine === false);
      state.detail = offline
        ? 'Perangkat sedang offline. Skor hanya tersimpan di memori tab ini dan tidak dikirim ke Firestore.'
        : 'Firestore belum bisa dijangkau. Skor hanya tersimpan di memori tab ini.';
      setPhase(offline ? 'offline' : 'degraded', state.detail, describeError(err));
      return false;
    }).then(function (ok) {
      probePromise = null;
      return ok;
    });

    return probePromise;
  }

  C.refresh = function () {
    if (!state.enabled) return Promise.resolve(false);
    return C.init().then(function () { return probe(false); });
  };

  /* ---------------- Auth anonim (UID profil terdaftar) ----------------
     restoreAuth() hanya membaca sesi yang sudah ada; tamu baru tidak
     mendapat UID sebelum ia secara eksplisit membuat profil. */
  function loadAuth() {
    if (authSdkPromise) return authSdkPromise;
    // auth-compat bergantung pada app-compat. Identity init bisa lebih dulu
    // berjalan daripada cloud.start(), jadi pastikan SDK inti siap dulu.
    authSdkPromise = C.init()
      .then(function () {
        if (window.firebase && typeof window.firebase.auth === 'function') return null;
        return loadScript(SDK_BASE + 'firebase-auth-compat.js');
      })
      .then(function () {
        if (!window.firebase || typeof window.firebase.auth !== 'function') {
          throw new Error('SDK Firebase Auth tidak tersedia.');
        }
        if (!firebaseApp) {
          firebaseApp = (window.firebase.apps && window.firebase.apps.length)
            ? window.firebase.app()
            : window.firebase.initializeApp(CONFIG);
        }
        return window.firebase.auth();
      })
      .catch(function (err) {
        authSdkPromise = null;
        throw err;
      });
    return authSdkPromise;
  }

  function noteAuthUser(user) {
    state.uid = (user && user.uid) || '';
    state.auth = user ? 'anonymous' : 'off';
    if (user) state.authError = '';
    emit();
    return user || null;
  }

  C.restoreAuth = function () {
    if (!state.enabled) return Promise.resolve(null);
    return loadAuth().then(function (auth) {
      return noteAuthUser(auth.currentUser || null);
    }).catch(function (err) {
      state.auth = 'error';
      state.authError = describeError(err);
      emit();
      throw err;
    });
  };

  C.ensureAuth = function () {
    if (!state.enabled) return Promise.reject(new Error('Firebase tidak aktif.'));
    if (authPromise) return authPromise;

    authPromise = loadAuth().then(function (auth) {
      if (auth.currentUser) return noteAuthUser(auth.currentUser);
      state.auth = 'signing-in';
      state.authError = '';
      emit();
      return withTimeout(auth.signInAnonymously(), 15000, 'Login anonim melebihi 15 detik.')
        .then(function (cred) {
          return noteAuthUser((cred && cred.user) || auth.currentUser);
        });
    }).catch(function (err) {
      authPromise = null;
      state.auth = 'error';
      state.authError = describeError(err);
      emit();
      throw err;
    }).then(function (user) {
      authPromise = null;
      if (!user || !user.uid) throw new Error('Sesi anonim tidak tersedia.');
      return user;
    }, function (err) {
      authPromise = null;
      throw err;
    });

    return authPromise;
  };

  // Nama lama dipertahankan untuk kompatibilitas pemanggil lama.
  C.signInAnon = C.ensureAuth;
  C.getAuthUser = function () {
    if (!window.firebase || !window.firebase.apps || !window.firebase.apps.length) return null;
    try { return window.firebase.auth().currentUser || null; } catch (e) { return null; }
  };
  C.getAuthUid = function () { return state.uid || (C.getAuthUser() || {}).uid || null; };

  C.onAuth = function (fn) {
    if (typeof fn !== 'function') return function () {};
    var detach = function () {};
    if (!state.enabled) return detach;
    loadAuth().then(function (auth) {
      detach = auth.onAuthStateChanged(function (user) {
        noteAuthUser(user || null);
        try { fn(user || null); } catch (e) { /* abaikan */ }
      });
    }).catch(function () { /* status sudah ditangani restoreAuth */ });
    return function () { detach(); };
  };

  C.signOut = function () {
    if (!state.enabled) return Promise.resolve();
    return loadAuth().then(function (auth) {
      return auth.signOut();
    }).then(function () {
      noteAuthUser(null);
      userDataMeta = null;
    });
  };

  /* ---------------- Profil pemain terpusat ----------------
     Satu dokumen players/{uid}. UID berasal dari Auth, bukan nama. */
  function normalizePlayerDoc(id, data) {
    data = data || {};
    return {
      uid: data.uid || id,
      displayName: data.displayName || data.name || 'Pemain',
      name: data.name || data.displayName || 'Pemain',
      avatar: data.avatar || '🦊',
      createdAt: data.createdAt || null,
      updatedAt: data.updatedAt || null
    };
  }

  function mapOrEmpty(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function finishWrite(label, promise) {
    return promise.then(function (result) {
      markWrite(label, true);
      return result;
    }, function (err) {
      markWrite(label, false, err);
      throw err;
    });
  }

  C.getPlayerProfile = function (uid) {
    if (!uid) return Promise.resolve(null);
    if (!state.enabled) return Promise.resolve(null);
    return C.init().then(function (ready) {
      if (!ready || !db) return null;
      return loadAuth().then(function (auth) {
        var user = auth.currentUser;
        if (!user || user.uid !== uid) return null;
        return withTimeout(db.collection('players').doc(uid).get(), 10000, 'Memuat profil melebihi 10 detik.')
          .then(function (snap) {
            return snap && snap.exists ? normalizePlayerDoc(snap.id, snap.data()) : null;
          })
          .catch(function (err) {
            // Profil lokal yang sudah terdaftar tetap dipakai bila Firestore
            // sementara tidak bisa dibaca (misalnya offline).
            if (err && err.code === 'unavailable') return null;
            throw err;
          });
      });
    });
  };

  C.createPlayerProfile = function (data) {
    data = data || {};
    if (!state.enabled) return Promise.reject(new Error('Firebase tidak aktif.'));

    return C.ensureAuth().then(function (user) {
      return C.init().then(function (ready) {
        if (!ready || !db) throw new Error('Firestore belum siap.');
        var uid = user.uid;
        var ref = db.collection('players').doc(uid);
        var name = cleanName(data.displayName || data.name, 'Pemain', 24);
        var avatar = cleanAvatar(data.avatar);
        var payload = {
          uid: uid,
          displayName: name,
          name: name,
          avatar: avatar,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        var write = withTimeout(ref.get(), 10000, 'Pemeriksaan profil melebihi 10 detik.')
          .then(function (snap) {
            if (snap && snap.exists) return normalizePlayerDoc(snap.id, snap.data());
            return withTimeout(ref.set(payload), 15000, 'Pembuatan profil melebihi 15 detik.')
              .then(function () { return normalizePlayerDoc(uid, payload); });
          })
          .catch(function (err) {
            // Klik ganda/koneksi lambat: bila dokumen sudah ada, itu profil
            // yang sama (UIDAuth yang sama) dan tidak boleh dibuat ulang.
            if (err && (err.code === 'permission-denied' || err.code === 'already-exists')) {
              return withTimeout(ref.get(), 8000, 'Pemeriksaan profil melebihi 8 detik.')
                .then(function (snap) {
                  if (snap && snap.exists) return normalizePlayerDoc(snap.id, snap.data());
                  throw err;
                });
            }
            throw err;
          });

        return finishWrite('Profil pemain', write);
      });
    });
  };

  C.updatePlayerProfile = function (data) {
    data = data || {};
    if (!state.enabled) return Promise.reject(new Error('Firebase tidak aktif.'));

    return C.ensureAuth().then(function (user) {
      return C.init().then(function (ready) {
        if (!ready || !db) throw new Error('Firestore belum siap.');
        var uid = user.uid;
        var ref = db.collection('players').doc(uid);
        var name = cleanName(data.displayName || data.name, 'Pemain', 24);
        var avatar = cleanAvatar(data.avatar);

        var write = withTimeout(ref.get(), 10000, 'Memuat profil melebihi 10 detik.')
          .then(function (snap) {
            if (!snap || !snap.exists) {
              return C.createPlayerProfile({ displayName: name, name: name, avatar: avatar });
            }
            var old = snap.data() || {};
            var payload = Object.assign({}, old, {
              uid: uid,
              displayName: name,
              name: name,
              avatar: avatar,
              createdAt: old.createdAt || Date.now(),
              updatedAt: Date.now()
            });
            return withTimeout(ref.set(payload), 15000, 'Pembaruan profil melebihi 15 detik.')
              .then(function () { return normalizePlayerDoc(uid, payload); });
          });

        return finishWrite('Pembaruan profil', write);
      });
    });
  };

  C.saveGameStat = function (gameId, stat) {
    gameId = String(gameId || '');
    if (!gameId || !state.enabled || !canPersist()) {
      return Promise.resolve({ ok: false, skipped: true, reason: 'Statistik game tidak disimpan untuk tamu.' });
    }

    var current = C.getAuthUser();
    return Promise.resolve(current || C.restoreAuth()).then(function (user) {
      if (!user || !user.uid) return { ok: false, skipped: true, reason: 'Pemain belum terdaftar.' };
      return C.init().then(function (ready) {
        if (!ready || !db) return { ok: false, skipped: true, reason: 'Firestore belum siap.' };
        var ref = db.collection('players').doc(user.uid).collection('gameStats').doc(gameId);
        return withTimeout(ref.get(), 10000, 'Memuat statistik game melebihi 10 detik.')
          .then(function (snap) {
            var old = (snap && snap.data()) || {};
            var now = Date.now();
            var score = Math.round(Number(stat && stat.score) || 0);
            var payload = {
              uid: user.uid,
              gameId: gameId,
              lastScore: score,
              bestScore: Math.max(Number(old.bestScore) || 0, score),
              plays: (Number(old.plays) || 0) + 1,
              progress: mapOrEmpty(old.progress),
              achievements: mapOrEmpty(old.achievements),
              statistics: mapOrEmpty(old.statistics),
              lastMeta: mapOrEmpty(stat && stat.meta),
              lastPlayedAt: now,
              createdAt: old.createdAt || now,
              updatedAt: now
            };
            return withTimeout(ref.set(payload), 15000, 'Penyimpanan statistik game melebihi 15 detik.')
              .then(function () { return { ok: true, docId: gameId }; });
          });
      });
    }).catch(function (err) {
      return { ok: false, error: describeError(err) };
    });
  };

  /* ---------------- Data hub milik pemain (Firestore-only) ----------------
     Satu dokumen privat per UID. Preferensi, riwayat sesi, penanda harian,
     dan cache papan yang dulu memakai localStorage kini hidup di sini.
     Pemain tamu tidak pernah membuat dokumen. */
  var USER_DATA_COLLECTION = 'user_data';
  var userDataMeta = null;

  function userDataContext() {
    if (!state.enabled || !canPersist()) return Promise.resolve(null);
    var current = C.getAuthUser && C.getAuthUser();
    return Promise.resolve(current || C.restoreAuth()).then(function (user) {
      if (!user || !user.uid) return null;
      return C.init().then(function (ready) { return ready && db ? user.uid : null; });
    }).catch(function () { return null; });
  }

  C.getUserData = function () {
    return userDataContext().then(function (uid) {
      if (!uid) return null;
      return withTimeout(db.collection(USER_DATA_COLLECTION).doc(uid).get(), 10000, 'Memuat data pemain melebihi 10 detik.')
        .then(function (snap) {
          if (!snap || !snap.exists) {
            userDataMeta = null;
            return null;
          }
          var data = snap.data() || {};
          userDataMeta = { uid: uid, createdAt: data.createdAt || Date.now() };
          return data;
        })
        .catch(function () { return null; });
    });
  };

  C.saveUserData = function (data) {
    return userDataContext().then(function (uid) {
      if (!uid) return { ok: false, skipped: true, reason: 'Hanya profil terdaftar yang menyimpan data.' };
      var ref = db.collection(USER_DATA_COLLECTION).doc(uid);
      var payload = Object.assign({}, data || {}, {
        uid: uid,
        version: 2,
        updatedAt: Date.now()
      });
      var ensureCreated = (userDataMeta && userDataMeta.uid === uid)
        ? Promise.resolve(userDataMeta.createdAt)
        : withTimeout(ref.get(), 10000, 'Memuat data pemain melebihi 10 detik.')
          .then(function (snap) {
            var old = (snap && snap.data()) || {};
            var createdAt = old.createdAt || Date.now();
            userDataMeta = { uid: uid, createdAt: createdAt };
            return createdAt;
          });
      return ensureCreated.then(function (createdAt) {
        payload.createdAt = createdAt;
        return withTimeout(ref.set(payload), 15000, 'Penyimpanan data pemain melebihi 15 detik.');
      }).then(function () {
        return { ok: true, docId: uid };
      }).catch(function (err) {
        return { ok: false, error: describeError(err) };
      });
    });
  };

  C.clearUserData = function () {
    return userDataContext().then(function (uid) {
      if (!uid) return { ok: false, skipped: true, reason: 'Tidak ada data pemain terdaftar.' };
      userDataMeta = null;
      return withTimeout(db.collection(USER_DATA_COLLECTION).doc(uid).delete(), 15000, 'Penghapusan data pemain melebihi 15 detik.')
        .then(function () { return { ok: true }; })
        .catch(function (err) { return { ok: false, error: describeError(err) }; });
    });
  };

  /* ---------------- Peta papan lokal → Firestore ---------------- */
  var SOLO_MAP = {
    // G1: records_* hanya menerima name, time, mistakes, avatar (bgColor opsional).
    'multiply:10': { coll: 'records_10', kind: 'timed1' },
    'multiply:20': { coll: 'records_20', kind: 'timed1' },
    'multiply:30': { coll: 'records_30', kind: 'timed1' },
    // G2: skor 60 detik.
    'knowledge': { coll: 'knowledge_records', kind: 'rapid' },
    // G3: advmath_records_* menerima hints + burned juga.
    'advmath:10': { coll: 'advmath_records_10', kind: 'timed3' },
    'advmath:20': { coll: 'advmath_records_20', kind: 'timed3' },
    'advmath:30': { coll: 'advmath_records_30', kind: 'timed3' },
    'memo': { coll: 'memo_boards/memo_all/entries', kind: 'memo' },
    'memo:daily': { coll: 'memo_boards/memo_daily/entries', kind: 'memo' }
  };

  var WIN_MAP = {
    multiply: 'multiply_duel_wins',
    knowledge: 'knowledge_duel_wins',
    advmath: 'advmath_duel_wins'
  };

  var BOARD_QUERY = {
    'multiply:10': { coll: 'records_10', field: 'time', dir: 'asc', kind: 'timed', limit: 7 },
    'multiply:duel': { coll: 'multiply_duel_wins', field: 'wins', dir: 'desc', kind: 'wins', limit: 10 },
    'multiply:20': { coll: 'records_20', field: 'time', dir: 'asc', kind: 'timed', limit: 7 },
    'multiply:30': { coll: 'records_30', field: 'time', dir: 'asc', kind: 'timed', limit: 7 },
    'knowledge': { coll: 'knowledge_records', field: 'score', dir: 'desc', kind: 'rapid', limit: 10 },
    'advmath:10': { coll: 'advmath_records_10', field: 'time', dir: 'asc', kind: 'timed', limit: 7 },
    'advmath:20': { coll: 'advmath_records_20', field: 'time', dir: 'asc', kind: 'timed', limit: 7 },
    'advmath:30': { coll: 'advmath_records_30', field: 'time', dir: 'asc', kind: 'timed', limit: 7 },
    'knowledge:duel': { coll: 'knowledge_duel_wins', field: 'wins', dir: 'desc', kind: 'wins', limit: 10 },
    'advmath:duel': { coll: 'advmath_duel_wins', field: 'wins', dir: 'desc', kind: 'wins', limit: 10 },
    'memo': { coll: 'memo_boards/memo_all/entries', field: 'score', dir: 'desc', kind: 'memo', limit: 20 },
    'memo:daily': { coll: 'memo_boards/memo_daily/entries', field: 'score', dir: 'desc', kind: 'memo', limit: 20 },
    'nusantara:solo': { coll: 'ns_players', field: 'tot.score', dir: 'desc', kind: 'ns', path: 'tot', limit: 20 },
    'nusantara:duel': { coll: 'ns_players', field: 'mode.duel.score', dir: 'desc', kind: 'ns', path: 'mode.duel', limit: 20 },
    'nusantara:week': { coll: 'ns_players', field: 'wk.score', dir: 'desc', kind: 'ns', path: 'wk', limit: 20 }
  };

  C.supportsBoard = function (key) { return !!SOLO_MAP[key] || !!BOARD_QUERY[key]; };

  function nameToDocId(name) {
    var id = String(name == null ? '' : name).trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60);
    return id || 'anon';
  }

  // Pemilik entri papan Memo selalu UID Auth. Tidak ada lagi clientId
  // berbasis localStorage: pemain tamu tidak menulis data permanen.
  var sessionClientId = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  function getClientId() {
    var auth = C.getAuthUser && C.getAuthUser();
    if (auth && auth.uid) return auth.uid;
    var identityUid = GH.identity && typeof GH.identity.getUid === 'function' ? GH.identity.getUid() : null;
    return identityUid || sessionClientId;
  }

  function memoName(name) {
    var clean = cleanName(name, 'Pemain', 14);
    if (clean.length < 3) clean = ('Pemain ' + clean).slice(0, 14);
    return clean;
  }

  /* ---------------- Bangun payload sesuai Firestore Rules ---------------- */
  function buildSoloPayload(key, record) {
    var map = SOLO_MAP[key];
    if (!map) return null;
    var name = cleanName(record.name, 'Pemain', 24);
    var avatar = cleanAvatar(record.avatar);

    if (map.kind === 'timed1' || map.kind === 'timed3') {
      var data = {
        name: name,
        time: seconds(record.timeMs),
        mistakes: clampInt(
          record.mistakes != null ? record.mistakes
            : Math.max(0, Number(record.count || 0) - Number(record.score || 0)),
          0, 9999, 0
        ),
        avatar: avatar
      };
      if (record.uid) data.uid = record.uid;
      if (map.kind === 'timed3') {
        data.hints = clampInt(record.hints, 0, 9999, 0);
        data.burned = clampInt(record.burned, 0, 9999, 0);
      }
      return { coll: map.coll, docId: docIdOf(record.id), data: data };
    }

    if (map.kind === 'rapid') {
      var rapid = {
        name: name,
        score: Math.round(clampNum(record.score, -100000, 100000, 0) * 10) / 10,
        correct: clampInt(record.correct, 0, 9999, 0),
        hints: clampInt(record.hints, 0, 9999, 0),
        burned: clampInt(record.burned, 0, 9999, 0),
        avatar: avatar
      };
      if (record.uid) rapid.uid = record.uid;
      return { coll: map.coll, docId: docIdOf(record.id), data: rapid };
    }

    // Memo: dokumen per pemilik per papan (hanya skor terbaik).
    var score = clampInt(record.score, 0, 1000000, 0);
    if (score < 1) {
      return { skip: true, reason: 'Skor 0 belum bisa masuk papan global Memo (aturan minimum 1).' };
    }
    var played = clampInt(record.total != null ? record.total : record.count, 0, 100000, 0);
    var correct = clampInt(record.correct, 0, 100000, 0);
    var accP = record.accP != null
      ? clampInt(record.accP, 0, 100000, 0)
      : (played ? clampInt(Math.round((correct / played) * 100), 0, 100000, 0) : 0);
    var memo = {
      pid: getClientId(),
      name: memoName(record.name),
      icon: avatar,
      score: score,
      accP: accP,
      total: played,
      sid: docIdOf(record.id).slice(0, 40),
      ts: Date.now()
    };
    if (record.uid) memo.uid = record.uid;
    return { coll: map.coll, memo: true, docId: getClientId(), data: memo };
  }

  function docIdOf(value) {
    var id = String(value == null ? '' : value).replace(/[\/\\]/g, '_').trim();
    return id || ('r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
  }

  /* ---------------- Tulis skor ---------------- */
  function markWrite(label, ok, err) {
    state.writes += 1;
    state.lastWriteAt = Date.now();
    state.lastWriteLabel = label;
    if (ok) {
      if (state.phase !== 'online') setPhase('online', 'Terhubung ke Firestore. Skor baru langsung dikirim ke papan global.');
      else emit();
    } else {
      state.writeErrors += 1;
      state.lastWriteLabel = label + ' · gagal';
      setPhase(state.phase === 'offline' ? 'offline' : 'degraded', state.detail || 'Sebagian tulisan gagal dikirim ke Firestore.', describeError(err));
    }
  }

  C.saveScore = function (key, record) {
    if (!canPersist()) {
      return Promise.resolve({ ok: false, skipped: true, reason: 'Tamu belum menyimpan rekor permanen.' });
    }
    var payload = buildSoloPayload(key, record || {});
    if (!payload) return Promise.resolve({ ok: false, skipped: true, reason: 'Papan ini belum tersedia di Firestore.' });
    if (payload.skip) return Promise.resolve({ ok: false, skipped: true, reason: payload.reason });

    return C.init().then(function (ready) {
      if (!ready || !db) {
        return { ok: false, skipped: true, reason: 'Penyimpanan global tidak aktif.' };
      }

      var label = 'Skor ' + key;
      var write = payload.memo ? writeMemo(payload) : writeSolo(payload);

      return write.then(function (result) {
        markWrite(label, true);
        return result;
      }).catch(function (err) {
        markWrite(label, false, err);
        return { ok: false, error: describeError(err) };
      });
    });
  };

  function writeSolo(payload) {
    var ref = db.collection(payload.coll).doc(payload.docId);
    return withTimeout(ref.set(payload.data), 15000, 'Pengiriman skor melebihi 15 detik.')
      .then(function () { return { ok: true, docId: payload.docId }; })
      .catch(function (err) {
        // Kiriman ulang untuk dokumen yang sudah ada akan ditolak rules
        // (update tidak diizinkan). Anggap sukses bila dokumennya memang ada.
        if (err && (err.code === 'permission-denied' || err.code === 'already-exists')) {
          return withTimeout(ref.get(), 8000, 'Pemeriksaan dokumen melebihi 8 detik.')
            .then(function (snap) {
              if (snap && snap.exists) return { ok: true, duplicate: true, docId: payload.docId };
              throw err;
            });
        }
        throw err;
      });
  }

  function writeMemo(payload) {
    return C.signInAnon().then(function (user) {
      if (!user || !user.uid) throw new Error('Sesi anonim tidak tersedia.');
      payload.data.owner = user.uid;
      var ref = db.collection(payload.coll).doc(payload.docId);
      return withTimeout(ref.get(), 10000, 'Pemeriksaan skor Memo melebihi 10 detik.')
        .then(function (snap) {
          if (snap && snap.exists) {
            var old = snap.data() || {};
            if (old.owner && old.owner !== user.uid) {
              return { ok: false, skipped: true, reason: 'Dokumen papan milik sesi lain.' };
            }
            if (Number(old.score) > Number(payload.data.score)) {
              return { ok: false, skipped: true, reason: 'Bukan rekor terbaik; papan menyimpan skor tertinggi.' };
            }
          }
          return withTimeout(ref.set(payload.data), 15000, 'Pengiriman skor Memo melebihi 15 detik.')
            .then(function () { return { ok: true, docId: payload.docId }; });
        });
    });
  }

  /* ---------------- Memo Mayhem (perilaku ZIP, identitas rebuild) ----------------
     Semua tulisan memakai GH.identity (satu identitas dengan game lain) dan
     Firebase Auth yang sama. Tidak ada identitas/profile store kedua. */
  var MEMO_COL = {
    names: 'memo_names',
    profiles: 'memo_profiles',
    boards: 'memo_boards'
  };

  function memoNormName(raw) {
    var name = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
    var problem = '';
    if (name.length < 3) problem = 'Namanya minimal 3 karakter.';
    else if (name.length > 14) problem = 'Namanya maksimal 14 karakter.';
    else if (!/^[A-Za-z0-9][A-Za-z0-9 _.-]*$/.test(name)) {
      problem = 'Pakai huruf, angka, spasi, _ . atau - aja (tanpa emoji), dan mulai dengan huruf/angka.';
    }
    if (problem) return { ok: false, code: 'format', error: problem, message: problem };
    return { ok: true, name: name, key: name.toLowerCase().replace(/ /g, '_') };
  }

  function memoFallbackName(uid) {
    var raw = 'P' + String(uid == null ? '' : uid).replace(/[^A-Za-z0-9]/g, '').slice(0, 11);
    if (raw.length < 3) raw = (raw + 'Player').slice(0, 14);
    var nn = memoNormName(raw);
    return nn.ok ? nn.name : 'Pemain';
  }

  function memoIcon(value) {
    return String(value == null ? '' : value).trim().slice(0, 16) || '👽';
  }

  function memoStamp() {
    var firestore = window.firebase && window.firebase.firestore;
    var fieldValue = firestore && firestore.FieldValue;
    if (fieldValue && typeof fieldValue.serverTimestamp === 'function') {
      return fieldValue.serverTimestamp();
    }
    return Date.now();
  }

  function memoMillis(value) {
    if (value && typeof value.toMillis === 'function') return Number(value.toMillis()) || 0;
    return typeof value === 'number' && isFinite(value) ? value : 0;
  }

  function memoInt(value) {
    return clampInt(value, -2147483648, 2147483647, 0);
  }

  function memoEmptyStats() {
    return {
      sessions: 0, bestScore: 0, accSumP: 0, totalMs: 0, bestCombo: 0, maxSeqLen: 0,
      duels: 0, duelWins: 0, bossClears: 0, endlessBest: 0, modes: {}
    };
  }

  // Helper yang sama dipakai game Memo; fallback menjaga adapter tetap bisa
  // dipakai bila skrip data belum termuat.
  function memoBoardKey(s) {
    var D = GH.memoData;
    if (D && typeof D.boardKey === 'function') return D.boardKey(s);
    s = s || {};
    if (s.type === 'standard') return ['std', s.mode, s.diff, s.plannedRounds].join('|');
    if (s.type === 'daily') return 'daily|' + s.dateKey;
    return s.type || '';
  }

  function memoRemoteKey(s) {
    var D = GH.memoData;
    if (D && typeof D.remoteKey === 'function') return D.remoteKey(s);
    return String(memoBoardKey(s)).replace(/\|/g, '_');
  }

  function memoActor() {
    var identity = GH.identity;
    var snap = identity && typeof identity.getIdentity === 'function' ? identity.getIdentity() : null;
    var registered = identity && typeof identity.isRegistered === 'function'
      ? identity.isRegistered() : !!(snap && snap.registered);
    if (!registered) return { skipped: true, reason: 'Profil pemain belum terdaftar.' };
    var pid = identity && typeof identity.getUid === 'function' ? identity.getUid() : (snap && snap.uid);
    if (!pid) return { skipped: true, reason: 'Identitas pemain belum tersedia.' };
    return { pid: pid, name: (snap && snap.name) || 'Pemain', icon: (snap && snap.avatar) || '👽' };
  }

  // UID Auth adalah owner yang ditulis ke Firestore. pid profil diambil dari
  // identitas rebuild, hanya dipakai bila sama persis dengan UID Auth.
  function memoWriteContext() {
    var actor = memoActor();
    if (actor.skipped) return Promise.resolve({ skipped: true, reason: actor.reason });
    return C.ensureAuth().then(function (user) {
      var owner = user && user.uid;
      if (!owner) return { error: 'Sesi login anonim belum siap.' };
      if (actor.pid !== owner) {
        return { error: 'Identitas pemain tidak cocok dengan sesi login yang aktif.' };
      }
      return { pid: owner, owner: owner, actor: actor };
    }, function (err) {
      return { error: describeError(err) };
    });
  }

  function memoResultError(err, fallbackCode) {
    return {
      ok: false,
      code: (err && err.code) || fallbackCode || 'error',
      message: describeError(err)
    };
  }

  C.memoNormName = memoNormName;
  C.memoBoardKey = memoBoardKey;
  C.memoRemoteKey = memoRemoteKey;

  /* ---------- Nama: ketersediaan (baca publik) ---------- */
  C.memoCheckName = function (raw, ownPid) {
    var nn = memoNormName(raw);
    if (!nn.ok) return Promise.resolve(memoResultError(nn, 'format'));
    return C.init().then(function (ready) {
      if (!ready || !db) return { ok: false, code: 'offline', message: 'Firestore belum siap.' };
      var ref = db.collection(MEMO_COL.names).doc(nn.key);
      return withTimeout(ref.get(), 10000, 'Pemeriksaan nama Memo melebihi 10 detik.')
        .then(function (snap) {
          var data = snap && snap.exists ? (snap.data() || {}) : null;
          var mine = !!(data && ownPid && data.pid === ownPid);
          return { ok: true, free: !data || mine, name: nn.name, key: nn.key };
        });
    }).catch(function (err) {
      return memoResultError(err);
    });
  };

  /* ---------- Registrasi nama + profil (transaksi atomik) ---------- */
  C.memoRegisterProfile = function (rawName, opts) {
    opts = opts || {};
    return memoWriteContext().then(function (ctx) {
      if (ctx.skipped) return { ok: false, skipped: true, reason: ctx.reason };
      if (ctx.error) return { ok: false, error: ctx.error, message: ctx.error };
      if (opts.pid && opts.pid !== ctx.pid) {
        return { ok: false, code: 'foreign', message: 'Profil ini bukan milik pemain saat ini.' };
      }

      var pid = ctx.pid;
      var owner = ctx.owner;
      var desired = memoNormName(rawName);
      var fallback = memoNormName(memoFallbackName(pid));
      var candidates = [];
      if (desired.ok) candidates.push(desired);
      if (!candidates.some(function (c) { return c.key === fallback.key; })) candidates.push(fallback);
      var icon = memoIcon(opts.icon || ctx.actor.icon);
      var chosen = null;

      return C.init().then(function (ready) {
        if (!ready || !db) return { ok: false, code: 'offline', message: 'Firestore belum siap.' };
        var nameRefs = candidates.map(function (c) { return db.collection(MEMO_COL.names).doc(c.key); });
        var profRef = db.collection(MEMO_COL.profiles).doc(pid);

        var write = withTimeout(db.runTransaction(function (tx) {
          // Semua get() harus terjadi sebelum write di dalam transaksi Firestore.
          var reads = nameRefs.map(function (ref) { return tx.get(ref); });
          reads.push(tx.get(profRef));
          return Promise.all(reads).then(function (snaps) {
            var pSnap = snaps[snaps.length - 1];
            var existing = pSnap && pSnap.exists ? (pSnap.data() || {}) : null;
            if (existing) {
              if (existing.owner !== owner) return 'foreign';
              var currentName = memoNormName(existing.name);
              chosen = {
                name: existing.name,
                key: existing.nameKey || (currentName.ok ? currentName.key : memoFallbackName(pid))
              };
              return 'mine';
            }

            var mine = false;
            for (var i = 0; i < nameRefs.length; i++) {
              var snap = snaps[i];
              var data = snap && snap.exists ? (snap.data() || {}) : null;
              if (!data) {
                if (!chosen) chosen = candidates[i];
                continue;
              }
              if (data.pid === pid && data.owner === owner) {
                chosen = candidates[i];
                mine = true;
                break;
              }
            }
            if (!chosen) return 'taken';
            if (!mine) {
              tx.set(nameRefs[candidates.indexOf(chosen)], {
                pid: pid, owner: owner, name: chosen.name, createdAt: memoStamp()
              });
              tx.set(profRef, {
                v: 1,
                name: chosen.name,
                nameKey: chosen.key,
                owner: owner,
                icon: icon,
                createdAt: memoStamp(),
                updatedAt: memoStamp(),
                lastSid: '',
                st: memoEmptyStats(),
                ach: {}
              });
            }
            return mine ? 'mine' : 'created';
          });
        }), 15000, 'Pendaftaran nama Memo melebihi 15 detik.')
          .then(function (result) {
            if (result === 'foreign') {
              return { ok: false, code: 'foreign', message: 'Profil ini bukan milik pemain saat ini.' };
            }
            if (result === 'taken' || !chosen) {
              return { ok: false, code: 'taken', message: 'Nama ini sudah dipakai di Memo Mayhem.' };
            }
            if (result === 'created') markWrite('Registrasi Memo', true);
            return { ok: true, pid: pid, owner: owner, name: chosen.name, key: chosen.key };
          })
          .catch(function (err) {
            // Transaksi bisa ditolak rules saat ada pendaftar lain yang menang.
            return Promise.all(nameRefs.map(function (ref) {
              return withTimeout(ref.get(), 8000, 'Pemeriksaan nama Memo melebihi 8 detik.');
            })).then(function (snaps) {
              for (var i = 0; i < snaps.length; i++) {
                var snap = snaps[i];
                if (snap && snap.exists) {
                  var data = snap.data() || {};
                  if (data.pid === pid && data.owner === owner) {
                    return { ok: true, pid: pid, owner: owner, name: candidates[i].name, key: candidates[i].key };
                  }
                }
              }
              markWrite('Registrasi Memo', false, err);
              return memoResultError(err, 'taken');
            }, function () {
              markWrite('Registrasi Memo', false, err);
              return memoResultError(err);
            });
          });
        return write;
      });
    });
  };

  /* ---------- Simpan sesi (1 sid = 1 sesi, anti-duplikat) ---------- */
  C.memoSaveSession = function (item) {
    item = item || {};
    return memoWriteContext().then(function (ctx) {
      if (ctx.skipped) return { ok: false, skipped: true, reason: ctx.reason };
      if (ctx.error) return { ok: false, error: ctx.error, message: ctx.error };
      if (item.pid && item.pid !== ctx.pid) {
        return {
          ok: false, code: 'foreign', permanent: true,
          message: 'Sesi ini milik profil lain, jadi tidak bisa disimpan dari sini.'
        };
      }

      var pid = ctx.pid;
      var owner = ctx.owner;
      var session = item.session || {};
      var payload = item.payload || {};
      var sid = String(item.sid || (GH.memoData && typeof GH.memoData.newSid === 'function'
        ? GH.memoData.newSid() : 's' + Date.now().toString(36))).replace(/[\/\\]/g, '_').slice(0, 40);
      var bk = payload.bk == null ? memoRemoteKey(session) : String(payload.bk);
      var identityName = memoNormName(ctx.actor.name);
      if (!identityName.ok) identityName = memoNormName(memoFallbackName(pid));

      return C.init().then(function (ready) {
        if (!ready || !db) return { ok: false, code: 'offline', message: 'Firestore belum siap.' };
        var profRef = db.collection(MEMO_COL.profiles).doc(pid);
        var sessRef = profRef.collection('sessions').doc(sid);
        var entryRef = bk ? db.collection(MEMO_COL.boards).doc(bk).collection('entries').doc(pid) : null;

        var write = withTimeout(db.runTransaction(function (tx) {
          // Bacaan dulu, tulisan kemudian (ketentuan transaksi Firestore).
          return tx.get(sessRef).then(function (sSnap) {
            if (sSnap && sSnap.exists) return { dup: true };
            return Promise.all([tx.get(profRef), entryRef ? tx.get(entryRef) : Promise.resolve(null)])
              .then(function (reads) {
                var pSnap = reads[0];
                var eSnap = reads[1];
                var prof = pSnap && pSnap.exists ? (pSnap.data() || {}) : null;
                var profName = prof ? memoNormName(prof.name) : null;
                if (!profName || !profName.ok) profName = identityName;
                var icon = memoIcon(prof && prof.icon ? prof.icon : ctx.actor.icon);

                var st = Object.assign(memoEmptyStats(), prof && prof.st && typeof prof.st === 'object' ? prof.st : {});
                var modes = st.modes && typeof st.modes === 'object' ? Object.assign({}, st.modes) : {};
                (payload.modesSeen || []).slice(0, 6).forEach(function (m) {
                  var key = String(m);
                  modes[key] = (Number(modes[key]) || 0) + 1;
                });
                var score = memoInt(payload.score);
                var won = payload.won != null ? !!payload.won : !!item.won;
                var maxSeqLen = Math.max(memoInt(st.maxSeqLen), memoInt(payload.maxSeqLen));
                var nst = {
                  sessions: memoInt(st.sessions) + 1,
                  bestScore: Math.max(memoInt(st.bestScore), score),
                  accSumP: memoInt(st.accSumP) + memoInt(payload.accP),
                  totalMs: memoInt(st.totalMs) + memoInt(payload.totalMs),
                  bestCombo: Math.max(memoInt(st.bestCombo), memoInt(payload.bestCombo)),
                  maxSeqLen: maxSeqLen,
                  duels: memoInt(st.duels) + (payload.type === 'duel' ? 1 : 0),
                  duelWins: memoInt(st.duelWins) + (payload.type === 'duel' && won ? 1 : 0),
                  bossClears: memoInt(st.bossClears) + (payload.type === 'boss' && !!payload.done ? 1 : 0),
                  endlessBest: payload.type === 'endless'
                    ? Math.max(memoInt(st.endlessBest), memoInt(payload.total)) : memoInt(st.endlessBest),
                  modes: modes
                };

                var D = GH.memoData || {};
                var newAch = typeof D.evalAch === 'function'
                  ? D.evalAch(session, { modes: modes, maxSeqLen: maxSeqLen }, (prof && prof.ach) || {}, !!item.won)
                  : [];
                var ach = Object.assign({}, prof && prof.ach && typeof prof.ach === 'object' ? prof.ach : {});
                newAch.forEach(function (a) { ach[a.id] = Date.now(); });

                var sessionDoc = {
                  pid: pid,
                  owner: owner,
                  name: profName.name,
                  type: String(payload.type || ''),
                  mode: String(payload.mode || ''),
                  diff: String(payload.diff || ''),
                  plannedRounds: memoInt(payload.plannedRounds),
                  total: memoInt(payload.total),
                  correct: memoInt(payload.correct),
                  score: score,
                  accP: memoInt(payload.accP),
                  totalMs: memoInt(payload.totalMs),
                  bestCombo: memoInt(payload.bestCombo),
                  livesLost: memoInt(payload.livesLost),
                  maxSeqLen: memoInt(payload.maxSeqLen),
                  done: !!payload.done,
                  failed: !!payload.failed,
                  won: won,
                  dateKey: String(payload.dateKey || ''),
                  bk: bk,
                  modesSeen: (payload.modesSeen || []).slice(0, 6).map(String),
                  ts: memoStamp()
                };

                tx.set(sessRef, sessionDoc);
                if (!prof) {
                  tx.set(profRef, {
                    v: 1,
                    name: profName.name,
                    nameKey: profName.key,
                    owner: owner,
                    icon: icon,
                    createdAt: memoStamp(),
                    updatedAt: memoStamp(),
                    lastSid: sid,
                    st: nst,
                    ach: ach
                  });
                } else {
                  tx.update(profRef, { st: nst, ach: ach, lastSid: sid, updatedAt: memoStamp() });
                }

                var entered = false;
                var oldScore = eSnap && eSnap.exists ? memoInt((eSnap.data() || {}).score) : -1;
                if (entryRef && score > 0 && score > oldScore) {
                  tx.set(entryRef, {
                    pid: pid,
                    owner: owner,
                    name: profName.name,
                    icon: icon,
                    score: score,
                    accP: clampInt(payload.accP, 0, 100000, 0),
                    total: clampInt(payload.total, 0, 100000, 0),
                    sid: sid,
                    ts: memoStamp(),
                    uid: owner
                  });
                  entered = true;
                }
                return {
                  saved: true,
                  entered: entered,
                  newAch: newAch.map(function (a) { return a.id; })
                };
              });
          });
        }), 15000, 'Penyimpanan sesi Memo melebihi 15 detik.')
          .then(function (res) {
            markWrite('Sesi Memo', true);
            if (res.dup) {
              return { ok: true, saved: false, dup: true, entered: false, newAch: [] };
            }
            return { ok: true, saved: true, dup: false, entered: !!res.entered, newAch: res.newAch || [] };
          }, function (err) {
            markWrite('Sesi Memo', false, err);
            var result = memoResultError(err);
            result.permanent = result.code === 'permission-denied' || result.code === 'profile-missing';
            return result;
          });
        return write;
      });
    });
  };

  /* ---------- Bacaan publik / profil ---------- */
  C.memoGetBoard = function (boardKey, limit) {
    var bk = boardKey && typeof boardKey === 'object' ? memoRemoteKey(boardKey) : String(boardKey || '');
    if (!bk) return Promise.resolve({ ok: false, message: 'Kunci papan Memo tidak valid.' });
    var max = clampInt(limit, 1, 100, 10);

    return C.init().then(function (ready) {
      if (!ready || !db) return { ok: false, message: 'Firestore belum siap.' };
      var query = db.collection(MEMO_COL.boards).doc(bk).collection('entries')
        .orderBy('score', 'desc').limit(max);
      return withTimeout(query.get(), 12000, 'Memuat papan Memo melebihi 12 detik.')
        .then(function (snap) {
          var rows = [];
          snap.forEach(function (doc) {
            var x = doc.data() || {};
            var accP = Number(x.accP) || 0;
            var total = Number(x.total) || 0;
            var ms = memoMillis(x.ts);
            rows.push({
              id: doc.id,
              global: true,
              name: x.name || 'Pemain',
              avatar: x.icon || '🦊',
              uid: x.uid || x.owner || null,
              score: Number(x.score) || 0,
              accP: accP,
              total: total,
              sid: x.sid || '',
              date: ms > 0 ? new Date(ms).toISOString() : null,
              meta: {
                label: (Math.round(accP / 10)) + '% akurasi · ' + total + ' ronde'
              }
            });
          });
          return { ok: true, rows: rows, source: 'global', board: bk };
        });
    }).catch(function (err) {
      return memoResultError(err);
    });
  };

  C.memoGetProfile = function (pid) {
    if (!pid) return Promise.resolve({ ok: false, missing: true, message: 'Profil tidak ditemukan.' });
    return C.init().then(function (ready) {
      if (!ready || !db) return { ok: false, message: 'Firestore belum siap.' };
      var ref = db.collection(MEMO_COL.profiles).doc(pid);
      return withTimeout(ref.get(), 10000, 'Memuat profil Memo melebihi 10 detik.')
        .then(function (snap) {
          if (!snap || !snap.exists) return { ok: false, missing: true, message: 'Profil tidak ditemukan.' };
          var d = snap.data() || {};
          var st = Object.assign(memoEmptyStats(), d.st && typeof d.st === 'object' ? d.st : {});
          return {
            ok: true,
            profile: {
              pid: pid,
              name: d.name || 'Pemain',
              icon: memoIcon(d.icon),
              createdAt: memoMillis(d.createdAt),
              st: st,
              ach: d.ach && typeof d.ach === 'object' ? d.ach : {}
            }
          };
        });
    }).catch(function (err) {
      return memoResultError(err);
    });
  };

  C.memoGetHistory = function (pid, n) {
    if (!pid) return Promise.resolve({ ok: false, message: 'Profil tidak ditemukan.' });
    return C.ensureAuth().then(function (user) {
      if (!user || !user.uid) return { ok: false, message: 'Sesi login belum siap.' };
      if (user.uid !== pid) return { ok: false, message: 'Riwayat ini bukan milik pemain saat ini.' };
      return C.init().then(function (ready) {
        if (!ready || !db) return { ok: false, message: 'Firestore belum siap.' };
        var query = db.collection(MEMO_COL.profiles).doc(pid).collection('sessions')
          .orderBy('ts', 'desc').limit(clampInt(n, 1, 100, 15));
        return withTimeout(query.get(), 12000, 'Memuat riwayat Memo melebihi 12 detik.')
          .then(function (snap) {
            var rows = [];
            snap.forEach(function (doc) {
              var data = doc.data() || {};
              rows.push(Object.assign({ id: doc.id }, data, { ts: memoMillis(data.ts) }));
            });
            return { ok: true, rows: rows };
          });
      });
    }).catch(function (err) {
      return memoResultError(err);
    });
  };

  C.memoUpdateIcon = function (pid, icon) {
    return memoWriteContext().then(function (ctx) {
      if (ctx.skipped) return { ok: false, skipped: true, reason: ctx.reason };
      if (ctx.error) return { ok: false, error: ctx.error, message: ctx.error };
      if (pid && pid !== ctx.pid) {
        return { ok: false, message: 'Profil ini bukan milik pemain saat ini.' };
      }
      return C.init().then(function (ready) {
        if (!ready || !db) return { ok: false, message: 'Firestore belum siap.' };
        var ref = db.collection(MEMO_COL.profiles).doc(ctx.pid);
        var write = withTimeout(ref.update({ icon: memoIcon(icon), updatedAt: memoStamp() }), 15000,
          'Pembaruan ikon Memo melebihi 15 detik.')
          .then(function () {
            markWrite('Ikon Memo', true);
            return { ok: true };
          }, function (err) {
            markWrite('Ikon Memo', false, err);
            return memoResultError(err);
          });
        return write;
      });
    });
  };

  /* ---------------- Tulis kemenangan duel ---------------- */
  C.saveDuelWin = function (game, name, avatar, opts) {
    opts = opts || {};
    if (!canPersist()) {
      return Promise.resolve({ ok: false, skipped: true, reason: 'Tamu belum menyimpan rekor permanen.' });
    }
    var coll = WIN_MAP[game];
    if (!coll) return Promise.resolve({ ok: false, skipped: true, reason: 'Kemenangan duel game ini belum tersedia di Firestore.' });

    return C.init().then(function (ready) {
      if (!ready || !db) return { ok: false, skipped: true, reason: 'Penyimpanan global tidak aktif.' };

      var docId = nameToDocId(name);
      var ref = db.collection(coll).doc(docId);
      var clean = cleanName(name, 'Pemain', 24);
      var av = cleanAvatar(avatar);
      var label = 'Kemenangan duel ' + game;

      return withTimeout(ref.get(), 10000, 'Pemeriksaan papan duel melebihi 10 detik.')
        .then(function (snap) {
          var data = snap && snap.exists ? (snap.data() || {}) : null;
          if (data) {
            // Nama/avatar tidak boleh berubah setelah dokumen dibuat.
            clean = cleanName(data.name, clean, 24);
            av = cleanAvatar(data.avatar || av);
          }
          var data = {
            name: clean,
            avatar: av,
            wins: window.firebase.firestore.FieldValue.increment(1),
            updatedAt: Date.now()
          };
          if (opts.uid) data.uid = opts.uid;
          return withTimeout(ref.set(data, { merge: true }), 15000, 'Pengiriman kemenangan melebihi 15 detik.');
        })
        .then(function () {
          markWrite(label, true);
          return { ok: true, docId: docId };
        })
        .catch(function (err) {
          markWrite(label, false, err);
          return { ok: false, error: describeError(err) };
        });
    });
  };

  /* ---------------- Baca papan global ---------------- */
  function readPath(obj, path) {
    return String(path || '').split('.').reduce(function (value, part) {
      return value == null ? null : value[part];
    }, obj);
  }

  function normalizeGlobalRow(id, data, kind, query) {
    var row = {
      id: id,
      global: true,
      uid: data.uid || null,
      name: data.name || 'Pemain',
      avatar: data.icon || data.avatar || '🦊',
      score: Number(data.score) || 0,
      timeMs: null,
      mistakes: clampInt(data.mistakes, 0, 9999, 0),
      hints: clampInt(data.hints, 0, 9999, 0),
      burned: clampInt(data.burned, 0, 9999, 0),
      date: null,
      meta: {}
    };
    var stamp = data.updatedAt || data.ts || data.finishedAt || null;
    if (stamp) {
      var ms = typeof stamp === 'object' && stamp.toMillis ? stamp.toMillis() : Number(stamp);
      if (isFinite(ms) && ms > 0) row.date = new Date(ms).toISOString();
    }
    if (kind === 'timed') {
      row.timeMs = Math.max(0, Math.round((Number(data.time) || 0) * 1000));
      row.score = Number(data.mistakes) || 0;
      row.meta.label = (Number(data.mistakes) || 0) + ' kesalahan' +
        (row.hints ? ' · ' + row.hints + ' hint' : '') +
        (row.burned ? ' · ' + row.burned + ' hangus' : '');
    } else if (kind === 'rapid') {
      row.meta.label = (Number(data.correct) || 0) + ' benar · ' + row.hints + ' hint · ' + row.burned + ' hangus';
    } else if (kind === 'wins') {
      row.score = Number(data.wins) || 0;
      row.meta.label = (Number(data.wins) || 0) + ' kemenangan';
    } else if (kind === 'memo') {
      row.meta.label = (Number(data.accP) || 0) + '% akurasi · ' + (Number(data.total) || 0) + ' ronde';
    } else if (kind === 'ns') {
      var bucket = readPath(data, query && query.path) || {};
      var best = Math.max(0, Math.floor(Number(bucket.best) || 0));
      var matches = Math.max(0, Math.floor(Number(bucket.matches) || 0));
      row.score = Math.max(0, Math.floor(Number(bucket.score) || 0));
      row.ns = { best: best, matches: matches, week: readPath(data, 'wk.w') || null };
      row.meta.label = best + ' pupuh · ' + matches + ' pertandingan';
    }
    return row;
  }

  C.fetchBoard = function (key) {
    var q = BOARD_QUERY[key];
    if (!q) return Promise.resolve({ ok: false, skipped: true, error: 'Papan ini belum tersedia di Firestore.' });

    return C.init().then(function (ready) {
      if (!ready || !db) {
        return { ok: false, error: state.enabled ? 'Penyimpanan global belum tersambung.' : 'Penyimpanan global tidak aktif.' };
      }
      var query = db.collection(q.coll).orderBy(q.field, q.dir).limit(q.limit || 10);
      return withTimeout(query.get(), 12000, 'Memuat papan global melebihi 12 detik.')
        .then(function (snap) {
          var rows = [];
          snap.forEach(function (doc) {
            rows.push(normalizeGlobalRow(doc.id, doc.data() || {}, q.kind, q));
          });
          if (q.kind === 'ns') rows = rows.filter(function (row) { return !!(row.ns && row.ns.matches > 0); });
          return { ok: true, rows: rows, source: 'global', board: key };
        })
        .catch(function (err) {
          return { ok: false, error: describeError(err) };
        });
    });
  };

  /* =====================================================================
     NUSANTARA SIRNA — identitas, skor, dan papan lewat UID rebuild
     Aturan gameplay tetap dari GH.nsId / GH.nsMatch (port ZIP). Lapisan ini
     hanya mengikat bukti nama+PIN ke UID Auth rebuild dan menolak tamu.
     ===================================================================== */
  var NS_COL = {
    players: 'ns_players',
    secrets: 'ns_secrets',
    scores: 'ns_scores',
    profiles: 'ns_profiles',
    rooms: 'ns_rooms'
  };
  var nsClock = function () { return Date.now(); };

  C.nsSetClock = function (fn) {
    if (typeof fn === 'function') nsClock = fn;
  };

  function nsActor() {
    var identity = GH.identity;
    var snap = identity && typeof identity.getIdentity === 'function' ? identity.getIdentity() : null;
    var registered = identity && typeof identity.isRegistered === 'function'
      ? identity.isRegistered() : !!(snap && snap.registered);
    if (!registered) return { skipped: true, reason: 'Profil pemain belum terdaftar.' };
    var uid = identity && typeof identity.getUid === 'function' ? identity.getUid() : (snap && snap.uid);
    if (!uid) return { skipped: true, reason: 'Identitas pemain belum tersedia.' };
    return { uid: uid, name: (snap && snap.name) || 'Pemain' };
  }

  function nsWriteContext() {
    var actor = nsActor();
    if (actor.skipped) return Promise.resolve({ skipped: true, reason: actor.reason });
    return C.ensureAuth().then(function (user) {
      var owner = user && user.uid;
      if (!owner) return { error: 'Sesi login anonim belum siap.' };
      if (actor.uid !== owner) return { error: 'Identitas pemain tidak cocok dengan sesi login yang aktif.' };
      return { uid: owner, owner: owner, actor: actor };
    }, function (err) {
      return { error: describeError(err) };
    });
  }

  function nsClient(ctx) {
    var Id = GH.nsId || (GH.ns && GH.ns.Id);
    if (!Id || typeof Id.create !== 'function') return null;
    return Id.create(db, nsClock, ctx && ctx.uid ? ctx.uid : null);
  }

  function nsProofRef(uid) {
    return db.collection(NS_COL.profiles).doc(uid);
  }

  function nsProofFrom(data, ctx) {
    if (!data || data.uid !== ctx.uid || !data.key || !data.ph) return null;
    return {
      uid: ctx.uid,
      key: String(data.key),
      name: String(data.name || ctx.actor.name || 'Pemain'),
      ph: String(data.ph)
    };
  }

  function nsLoadProof(ctx) {
    return C.init().then(function (ready) {
      if (!ready || !db) return { ok: false, code: 'offline', reason: 'Firestore belum siap.' };
      var client = nsClient(ctx);
      if (!client) return { ok: false, code: 'module', reason: 'Modul identitas Nusantara belum dimuat.' };
      return withTimeout(nsProofRef(ctx.uid).get(), 10000, 'Memuat identitas Nusantara melebihi 10 detik.')
        .then(function (snap) {
          if (!snap || !snap.exists) {
            return { ok: false, code: 'missing', reason: 'Nama Nusantara belum terdaftar untuk profil ini.' };
          }
          var proof = nsProofFrom(snap.data() || {}, ctx);
          if (!proof) return { ok: false, code: 'foreign', reason: 'Bukti Nusantara bukan milik pemain ini.' };
          return Promise.resolve(client.check(proof)).then(function (checked) {
            if (!checked || !checked.ok) return checked || { ok: false, reason: 'Bukti Nusantara tidak valid.' };
            return { ok: true, proof: proof, player: checked.player, client: client };
          });
        });
    }).catch(function (err) {
      return { ok: false, error: describeError(err), reason: describeError(err) };
    });
  }

  function nsContextResult(ctx) {
    if (ctx.skipped) return { ok: false, skipped: true, reason: ctx.reason };
    if (ctx.error) return { ok: false, error: ctx.error, reason: ctx.error };
    return null;
  }

  C.nsDb = function () {
    return C.init().then(function (ready) {
      if (!ready || !db) throw new Error('Firestore belum siap.');
      return db;
    });
  };

  C.nsWeekInfo = function () {
    var Id = GH.nsId || (GH.ns && GH.ns.Id);
    var now = nsClock();
    var week = Id && typeof Id.weekOf === 'function' ? Id.weekOf(now) : Math.floor(now / 604800000);
    var start = week * 604800000 - 3 * 86400000;
    return { week: week, startsAtMs: start, nextAtMs: start + 604800000, atMs: now };
  };

  C.nsGetProof = function () {
    return nsWriteContext().then(function (ctx) {
      var blocked = nsContextResult(ctx);
      if (blocked) return blocked;
      return nsLoadProof(ctx).then(function (loaded) {
        if (!loaded.ok) return loaded;
        return { ok: true, proof: loaded.proof, player: loaded.player };
      });
    });
  };

  C.nsRegister = function (name, pin, opts) {
    opts = opts || {};
    return nsWriteContext().then(function (ctx) {
      var blocked = nsContextResult(ctx);
      if (blocked) return blocked;
      return C.init().then(function (ready) {
        if (!ready || !db) return { ok: false, code: 'offline', reason: 'Firestore belum siap.' };
        var client = nsClient(ctx);
        if (!client) return { ok: false, code: 'module', reason: 'Modul identitas Nusantara belum dimuat.' };
        var ref = nsProofRef(ctx.uid);
        return withTimeout(ref.get(), 10000, 'Pemeriksaan identitas Nusantara melebihi 10 detik.')
          .then(function (snap) {
            if (snap && snap.exists && !opts.replace) {
              return { ok: false, code: 'PROOF_EXISTS', reason: 'Profil ini sudah memiliki nama Nusantara.' };
            }
            return Promise.resolve(client.register(name, pin)).then(function (res) {
              if (!res || !res.ok) return res;
              var proof = Object.assign({ uid: ctx.uid }, res.proof);
              var payload = {
                uid: ctx.uid,
                key: proof.key,
                name: proof.name,
                ph: proof.ph,
                createdAt: nsClock(),
                updatedAt: nsClock()
              };
              return withTimeout(ref.set(payload), 15000, 'Penyimpanan identitas Nusantara melebihi 15 detik.')
                .then(function () {
                  markWrite('Nusantara daftar', true);
                  return { ok: true, proof: proof, player: Object.assign({ name: proof.name }, res.player || {}) };
                }, function (err) {
                  markWrite('Nusantara daftar', false, err);
                  return { ok: false, error: describeError(err), reason: describeError(err) };
                });
            });
          });
      });
    }).catch(function (err) {
      return { ok: false, error: describeError(err), reason: describeError(err) };
    });
  };

  C.nsLogin = function (name, pin, opts) {
    opts = opts || {};
    return nsWriteContext().then(function (ctx) {
      var blocked = nsContextResult(ctx);
      if (blocked) return blocked;
      return C.init().then(function (ready) {
        if (!ready || !db) return { ok: false, code: 'offline', reason: 'Firestore belum siap.' };
        var client = nsClient(ctx);
        if (!client) return { ok: false, code: 'module', reason: 'Modul identitas Nusantara belum dimuat.' };
        var ref = nsProofRef(ctx.uid);
        return withTimeout(ref.get(), 10000, 'Pemeriksaan identitas Nusantara melebihi 10 detik.')
          .then(function (snap) {
            if (snap && snap.exists && !opts.replace) {
              return { ok: false, code: 'PROOF_EXISTS', reason: 'Profil ini sudah memiliki nama Nusantara. Keluar dulu untuk berganti nama.' };
            }
            return Promise.resolve(client.login(name, pin)).then(function (res) {
              if (!res || !res.ok) return res;
              var proof = Object.assign({ uid: ctx.uid }, res.proof);
              var payload = {
                uid: ctx.uid,
                key: proof.key,
                name: proof.name,
                ph: proof.ph,
                createdAt: (snap && snap.exists && snap.data() && snap.data().createdAt) || nsClock(),
                updatedAt: nsClock()
              };
              return withTimeout(ref.set(payload), 15000, 'Penyimpanan bukti Nusantara melebihi 15 detik.')
                .then(function () {
                  markWrite('Nusantara masuk', true);
                  return { ok: true, proof: proof };
                }, function (err) {
                  markWrite('Nusantara masuk', false, err);
                  return { ok: false, error: describeError(err), reason: describeError(err) };
                });
            });
          });
      });
    }).catch(function (err) {
      return { ok: false, error: describeError(err), reason: describeError(err) };
    });
  };

  C.nsClearProof = function () {
    return nsWriteContext().then(function (ctx) {
      var blocked = nsContextResult(ctx);
      if (blocked) return blocked;
      return C.init().then(function (ready) {
        if (!ready || !db) return { ok: false, code: 'offline', reason: 'Firestore belum siap.' };
        return withTimeout(nsProofRef(ctx.uid).delete(), 10000, 'Menghapus bukti Nusantara melebihi 10 detik.')
          .then(function () {
            markWrite('Nusantara keluar', true);
            return { ok: true };
          }, function (err) {
            markWrite('Nusantara keluar', false, err);
            return { ok: false, error: describeError(err), reason: describeError(err) };
          });
      });
    });
  };

  C.nsRecordScore = function (entry) {
    entry = entry || {};
    return nsWriteContext().then(function (ctx) {
      var blocked = nsContextResult(ctx);
      if (blocked) return blocked;
      var mode = String(entry.mode || '');
      var Id = GH.nsId || (GH.ns && GH.ns.Id);
      var modes = Id && Id.MODES ? Id.MODES : ['solo', 'duel', 'party', 'coop'];
      if (modes.indexOf(mode) < 0) return Promise.resolve({ ok: false, reason: 'BAD_MODE' });
      var score = Math.floor(Number(entry.score));
      var round = Math.floor(Number(entry.round));
      var matchId = String(entry.matchId || '').replace(/[\\\/]/g, '_').slice(0, 80);
      var minRound = Id && Id.MIN_ROUND ? Id.MIN_ROUND : 3;
      if (!matchId || !(score > 0) || round < minRound) {
        return Promise.resolve({ ok: false, skipped: true, reason: 'NOT_COUNTED' });
      }
      var clean = {
        matchId: matchId,
        mode: mode,
        round: round,
        hp: Math.max(0, Math.floor(Number(entry.hp) || 0)),
        score: score
      };
      return nsLoadProof(ctx).then(function (loaded) {
        if (!loaded.ok) return loaded;
        return Promise.resolve(loaded.client.recordScore(loaded.proof, clean)).then(function (res) {
          if (res && res.ok) markWrite('Nusantara skor', true);
          return Object.assign({}, res || {}, {
            proof: loaded.proof,
            mode: mode,
            score: clean.score,
            round: clean.round
          });
        }, function (err) {
          markWrite('Nusantara skor', false, err);
          return { ok: false, error: describeError(err), reason: describeError(err) };
        });
      });
    });
  };

  C.nsLeaderboard = function (mode, limit) {
    var requested = String(mode || 'all');
    var board = requested === 'week' ? 'week'
      : ((GH.nsId && GH.nsId.MODES && GH.nsId.MODES.indexOf(requested) >= 0) ? requested : 'all');
    return C.init().then(function (ready) {
      if (!ready || !db) return { ok: false, reason: 'Firestore belum siap.' };
      var client = nsClient(null);
      if (!client) return { ok: false, reason: 'Modul identitas Nusantara belum dimuat.' };
      return Promise.resolve(client.leaderboard(board, clampInt(limit, 1, 100, 20))).then(function (rows) {
        var out = (rows || []).map(function (row) {
          return {
            global: true,
            name: row.name || 'Pemain',
            score: Number(row.score) || 0,
            matches: Number(row.matches) || 0,
            best: Number(row.best) || 0,
            date: null,
            meta: { label: (Number(row.best) || 0) + ' pupuh · ' + (Number(row.matches) || 0) + ' pertandingan' }
          };
        });
        return { ok: true, rows: out, source: 'global', mode: board, week: board === 'week' ? C.nsWeekInfo() : null };
      });
    }).catch(function (err) {
      return { ok: false, error: describeError(err), reason: describeError(err) };
    });
  };

  C.nsVerifyEntry = function (entry) {
    entry = entry || {};
    return C.init().then(function (ready) {
      if (!ready || !db) return { ok: null, reason: 'NO_FIRESTORE' };
      var client = nsClient(null);
      if (!client) return { ok: null, reason: 'NO_MODULE' };
      var identity = GH.identity;
      var name = entry.name || (identity && typeof identity.getName === 'function' ? identity.getName() : '');
      return Promise.resolve(client.verifyEntry({
        mode: String(entry.mode || ''),
        matchId: String(entry.matchId || ''),
        name: name,
        score: Number(entry.score) || 0
      }));
    }).catch(function (err) {
      return { ok: null, reason: describeError(err) };
    });
  };

  C.nsSoloScore = function (round, hp, name) {
    var Match = GH.nsMatch || (GH.ns && GH.ns.Match);
    if (!Match || typeof Match.score !== 'function') return null;
    var nm = String(name || 'Solo');
    var key = Match.keyOf ? Match.keyOf(nm) : nm.toLowerCase();
    var reached = Math.max(0, Math.floor(Number(round) || 0));
    var M = {
      mode: 'solo',
      lastRound: reached,
      ended: true,
      winners: [],
      order: [key],
      players: {}
    };
    M.players[key] = {
      name: nm,
      state: 'alive',
      hp: Math.max(0, Math.floor(Number(hp) || 0)),
      lastRound: reached,
      outRound: null
    };
    return Match.score(M, nm);
  };

  /* ---------------- Status jaringan otomatis ---------------- */
  var started = false;

  C.start = function () {
    if (started) return C.init();
    started = true;

    if (typeof window !== 'undefined') {
      window.addEventListener('online', function () {
        probe(false);
      });
      window.addEventListener('offline', function () {
        state.detail = 'Perangkat sedang offline. Data tidak bisa dikirim ke Firestore sampai koneksi kembali.';
        setPhase('offline');
      });
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState !== 'visible') return;
        var last = state.checkedAt || 0;
        if (Date.now() - last > 45000) probe(false);
      });
    }

    // Jangan menahan render pertama: mulai setelah frame pertama.
    var kick = function () { C.init(); };
    if (window.requestIdleCallback) window.requestIdleCallback(kick, { timeout: 2500 });
    else setTimeout(kick, 60);

    return C.init();
  };

  /* Interval ringan: hanya saat tab terlihat. */
  if (typeof window !== 'undefined') {
    setInterval(function () {
      if (document.visibilityState !== 'visible') return;
      if (state.phase === 'connecting' || state.phase === 'idle') return;
      probe(true);
    }, 90000);
  }

  C.describeError = describeError;
  C.nameToDocId = nameToDocId;
  C.getClientId = getClientId;
})();
