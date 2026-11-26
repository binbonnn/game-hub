/* =========================================================
   Game Hub v2 · Centralized player identity
   ---------------------------------------------------------
   Satu identitas untuk seluruh hub. Modul ini menjadi satu-satunya
   sumber keadaan "tamu / terdaftar", memilikinya Firebase UID, dan
   menyiarkan perubahan ke seluruh game tanpa refresh atau restart.
   ========================================================= */
(function () {
  'use strict';
  var GH = window.GH = window.GH || {};
  var U = GH.util || {};
  var S = GH.store;
  var C = GH.cloud;
  var I = GH.identity = {};

  var NAME_ERROR = 'Nama 1–16 karakter tanpa . / [ ] * ~ ` \' ".';
  var listeners = [];
  var initPromise = null;
  var opPromise = null;

  var state = {
    phase: 'loading', // loading | guest | legacy | registered | error
    registered: false,
    legacy: false,
    uid: null,
    name: 'Pemain',
    avatar: '🦊',
    error: ''
  };

  function copy(value) {
    return Object.assign({}, value);
  }

  function snapshot() {
    return copy(state);
  }

  function emit(previous) {
    var current = snapshot();
    listeners.slice().forEach(function (fn) {
      try { fn(current, previous); } catch (e) { /* abaikan */ }
    });
  }

  function set(patch) {
    var previous = snapshot();
    state = Object.assign({}, state, patch || {});
    emit(previous);
  }

  function errorText(err) {
    if (C && typeof C.describeError === 'function') return C.describeError(err);
    return U.niceError ? U.niceError(err) : String((err && err.message) || err || 'Kesalahan tidak diketahui.');
  }

  function validName(name) {
    return !!(U.nameValid ? U.nameValid(name) : String(name || '').trim().length > 0);
  }

  function cleanName(name) {
    return U.cleanName ? U.cleanName(name) : String(name || '').replace(/\s+/g, ' ').trim().slice(0, 16);
  }

  function profileIdentity(profile) {
    profile = profile || S.getProfile() || {};
    return {
      name: profile.name || 'Pemain',
      avatar: profile.avatar || '🦊'
    };
  }

  function guestState(base, legacy, error) {
    return {
      phase: legacy ? 'legacy' : (error ? 'error' : 'guest'),
      registered: false,
      legacy: !!legacy,
      uid: null,
      name: base.name,
      avatar: base.avatar,
      error: error || ''
    };
  }

  function adoptRegistered(profile, legacy) {
    var adopted = S.adoptIdentity({
      uid: profile.uid,
      name: profile.name,
      avatar: profile.avatar,
      legacy: !!legacy,
      createdAt: profile.createdAt
    });
    set({
      phase: 'registered',
      registered: true,
      legacy: false,
      uid: adopted.uid,
      name: adopted.name,
      avatar: adopted.avatar,
      error: ''
    });
  }

  function recoverCloudIdentity(uid, base) {
    return C.getPlayerProfile(uid).then(function (cloud) {
      if (!cloud) {
        set(guestState(base, base.legacy));
        return snapshot();
      }
      adoptRegistered({
        uid: uid,
        name: cloud.displayName || cloud.name || base.name,
        avatar: cloud.avatar || base.avatar,
        createdAt: cloud.createdAt
      }, false);
      return snapshot();
    }).catch(function (err) {
      // Firestore adalah satu-satunya sumber identitas. Bila gagal dibaca,
      // pemain tidak boleh diakui sebagai profil terdaftar.
      set(guestState(base, base.legacy, errorText(err)));
      return snapshot();
    });
  }

  function doInit() {
    var base = profileIdentity(S.getProfile());
    set(Object.assign({ phase: 'loading', registered: false, error: '' }, base, { legacy: false }));

    if (!C || typeof C.restoreAuth !== 'function') {
      set(guestState(base, false));
      return Promise.resolve(snapshot());
    }

    return C.restoreAuth().then(function (user) {
      var uid = user && user.uid ? user.uid : null;
      if (uid) return recoverCloudIdentity(uid, base);
      set(guestState(base, false));
      return snapshot();
    }).catch(function (err) {
      set(guestState(base, false, errorText(err)));
      return snapshot();
    });
  }

  I.init = function () {
    if (!initPromise) initPromise = doInit();
    return initPromise;
  };

  I.refresh = function () {
    initPromise = null;
    return I.init();
  };

  I.getIdentity = snapshot;
  I.isRegistered = function () { return !!state.registered; };
  I.isGuestLike = function () { return !state.registered; };
  I.isLegacy = function () { return !!state.legacy; };
  I.getUid = function () { return state.registered ? state.uid : null; };
  I.getName = function () { return state.name || 'Pemain'; };
  I.getAvatar = function () { return state.avatar || '🦊'; };

  I.onChange = function (fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    try { fn(snapshot(), null); } catch (e) { /* abaikan */ }
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  };

  I.register = function (opts) {
    opts = opts || {};
    if (state.registered) return Promise.resolve(true);
    if (opPromise) return opPromise;

    var name = cleanName(opts.name);
    if (!validName(name)) return Promise.reject(new Error(NAME_ERROR));
    var avatar = String(opts.avatar || state.avatar || '🦊').trim().slice(0, 16) || '🦊';
    var legacy = state.legacy;

    if (!C || typeof C.createPlayerProfile !== 'function') {
      return Promise.reject(new Error('Layanan profil cloud belum tersedia.'));
    }

    opPromise = C.createPlayerProfile({
      displayName: name,
      name: name,
      avatar: avatar,
      legacy: legacy
    }).then(function (cloud) {
      adoptRegistered({
        uid: cloud.uid,
        name: cloud.displayName || cloud.name || name,
        avatar: cloud.avatar || avatar,
        createdAt: cloud.createdAt
      }, legacy);
      return true;
    }).then(function (value) {
      opPromise = null;
      return value;
    }, function (err) {
      opPromise = null;
      throw err;
    });

    return opPromise;
  };

  I.updateProfile = function (opts) {
    opts = opts || {};
    if (!state.registered || !state.uid) {
      return Promise.reject(new Error('Profil belum terdaftar.'));
    }
    if (opPromise) return opPromise;

    var name = cleanName(opts.name);
    if (!validName(name)) return Promise.reject(new Error(NAME_ERROR));
    var avatar = String(opts.avatar || state.avatar || '🦊').trim().slice(0, 16) || '🦊';

    if (!C || typeof C.updatePlayerProfile !== 'function') {
      return Promise.reject(new Error('Layanan profil cloud belum tersedia.'));
    }

    opPromise = C.updatePlayerProfile({
      displayName: name,
      name: name,
      avatar: avatar
    }).then(function () {
      S.setProfile({ name: name, avatar: avatar, updatedAt: Date.now() });
      set({ name: name, avatar: avatar, error: '' });
      return true;
    }).then(function (value) {
      opPromise = null;
      return value;
    }, function (err) {
      opPromise = null;
      throw err;
    });

    return opPromise;
  };

  I.consumeLegacyPrompt = function () {
    // Tidak ada prompt lama: profil selalu berasal dari Firestore.
    return false;
  };

  I.resetLocal = function () {
    // Tunggu penghapusan Firestore sebelum caller melakukan reload/sign-out.
    var clearing = S && typeof S.resetAll === 'function'
      ? Promise.resolve(S.resetAll()).catch(function () { /* status ditangani cloud */ })
      : Promise.resolve();

    set({
      phase: 'guest',
      registered: false,
      legacy: false,
      uid: null,
      name: 'Pemain',
      avatar: '🦊',
      error: ''
    });

    return clearing.then(function () {
      return C && typeof C.signOut === 'function'
        ? C.signOut().catch(function () { /* abaikan */ })
        : undefined;
    });
  };
})();
