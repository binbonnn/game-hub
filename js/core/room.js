/* =========================================================
   Game Hub v2 · Room duel adapter (G1–G4)
   ---------------------------------------------------------
   Room lintas-perangkat memakai kode pendek dan Firestore.
   Peserta wajib profil terdaftar: UID Auth dipakai sebagai
   pemilik slot, bukan nama tampilan. Tamu tidak menulis room.
   ========================================================= */
(function () {
  'use strict';

  var GH = window.GH = window.GH || {};
  var U = GH.util || {};
  var C = GH.cloud;
  var I = GH.identity;
  var S = GH.store;
  var ROOM = GH.room = {};

  var COLLECTIONS = {
    multiply: 'duels',
    knowledge: 'knowledge_duels',
    advmath: 'advmath_duels',
    memo: 'memo_duels'
  };
  var CODE_RE = /^[A-Z0-9]{4,6}$/;

  ROOM.COLLECTIONS = COLLECTIONS;

  function makeError(message, code) {
    var err = new Error(message);
    if (code) err.code = code;
    return err;
  }

  function describe(err) {
    return C && typeof C.describeError === 'function'
      ? C.describeError(err)
      : String((err && err.message) || err || 'Gagal mengakses room.');
  }

  function withTimeout(promise, ms, message) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        reject(makeError(message, 'deadline-exceeded'));
      }, ms);
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

  function database() {
    if (!C || typeof C.init !== 'function') {
      return Promise.reject(makeError('Layanan cloud tidak tersedia.', 'cloud-unavailable'));
    }
    return C.init().then(function (ok) {
      if (!ok || !window.firebase || typeof window.firebase.firestore !== 'function') {
        throw makeError('Firestore tidak tersedia. Periksa koneksi lalu coba lagi.', 'cloud-unavailable');
      }
      return window.firebase.firestore();
    });
  }

  function collectionFor(game) {
    var coll = COLLECTIONS[game];
    if (!coll) throw makeError('Game ini belum mendukung duel online.', 'unsupported-game');
    return coll;
  }

  function refFor(game, code) {
    return database().then(function (db) {
      return db.collection(collectionFor(game)).doc(code);
    });
  }

  function normalizeCode(value) {
    return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  }

  function validCode(code) {
    return CODE_RE.test(code);
  }

  function me() {
    if (!I || typeof I.isRegistered !== 'function' || !I.isRegistered()) {
      throw makeError('Buat profil pemain dulu untuk bermain duel online.', 'profile-required');
    }
    var uid = typeof I.getUid === 'function' ? I.getUid() : null;
    if (!uid) throw makeError('Sesi profil belum siap. Coba lagi sebentar.', 'profile-required');
    var profile = (S && typeof S.getProfile === 'function') ? S.getProfile() : {};
    var name = U.cleanName ? U.cleanName(profile.name || (I.getName && I.getName())) : String(profile.name || 'Pemain');
    if (!name) name = 'Pemain';
    return {
      uid: uid,
      name: name,
      avatar: profile.avatar || (I.getAvatar && I.getAvatar()) || '🦊'
    };
  }

  function slotFor(game, player) {
    var slot = {
      uid: player.uid,
      name: player.name,
      avatar: player.avatar,
      finishedAt: null,
      lastSeen: Date.now()
    };
    if (game === 'knowledge') {
      slot.score = 0;
      slot.correct = 0;
      slot.burned = 0;
      slot.hints = 0;
      slot.accuracy = 0;
    } else if (game === 'memo') {
      slot.progress = 0;
      slot.score = 0;
      slot.correct = 0;
      slot.mistakes = 0;
      slot.bestCombo = 0;
    } else {
      slot.progress = 0;
      slot.mistakes = 0;
      slot.correct = 0;
      slot.burned = 0;
      slot.hints = 0;
      slot.penaltySec = 0;
      slot.time = null;
    }
    return slot;
  }

  function normalizeDoc(snap, game, code) {
    var data = snap && typeof snap.exists !== 'undefined' && snap.exists ? snap.data() : null;
    if (!data) return null;
    return Object.assign({}, data, { code: code || snap.id, game: game });
  }

  ROOM.create = function (game, count, questions, onDoc) {
    var player;
    try {
      player = me();
      collectionFor(game);
    } catch (err) {
      return Promise.reject(err);
    }

    var list = Array.isArray(questions) ? questions : [];
    if (game === 'knowledge') {
      if (list.length < 1 || list.length > 120) {
        return Promise.reject(makeError('Jumlah soal room tidak valid.', 'invalid-room'));
      }
    } else {
      if ([10, 20, 30].indexOf(Number(count)) < 0 || list.length !== Number(count)) {
        return Promise.reject(makeError('Jumlah soal room tidak valid.', 'invalid-room'));
      }
    }

    var payload = {
      status: 'waiting',
      createdAt: Date.now(),
      startAtMillis: null,
      winner: null,
      rematch: null,
      questions: list,
      host: slotFor(game, player),
      guest: null
    };
    if (game !== 'knowledge') payload.count = Number(count);

    function attempt(tries) {
      if (tries <= 0) {
        return Promise.reject(makeError('Gagal membuat kode room. Coba lagi.', 'room-code-busy'));
      }
      var code = U.roomCode && U.roomCode();
      if (!validCode(code)) {
        return Promise.reject(makeError('Pembuat kode room tidak tersedia.', 'room-code-error'));
      }
      return refFor(game, code).then(function (ref) {
        return withTimeout(ref.get(), 10000, 'Pemeriksaan kode melebihi 10 detik.').then(function (snap) {
          if (snap && snap.exists) return attempt(tries - 1);
          return withTimeout(ref.set(payload), 15000, 'Pembuatan room melebihi 15 detik.').then(function () {
            return { code: code, doc: normalizeDoc({ exists: true, id: code, data: function () { return payload; } }, game, code) };
          });
        });
      });
    }

    return attempt(8).then(function (result) {
      if (typeof onDoc === 'function') onDoc(result.doc);
      return result.code;
    }).catch(function (err) {
      throw makeError(describe(err), err && err.code);
    });
  };

  ROOM.join = function (game, rawCode) {
    var code = normalizeCode(rawCode);
    if (!validCode(code)) {
      return Promise.reject(makeError('Kode room harus 4–6 huruf/angka.', 'invalid-code'));
    }
    var player;
    try {
      player = me();
      collectionFor(game);
    } catch (err) {
      return Promise.reject(err);
    }

    return refFor(game, code).then(function (ref) {
      return withTimeout(ref.get(), 10000, 'Pencarian room melebihi 10 detik.').then(function (snap) {
        if (!snap || !snap.exists) throw makeError('Kode room tidak ditemukan.', 'room-not-found');
        var data = snap.data() || {};
        if (data.status !== 'waiting') throw makeError('Room ini sudah tidak menerima pemain.', 'room-not-waiting');
        if (data.guest) throw makeError('Room ini sudah terisi dua pemain.', 'room-full');
        if (data.host && data.host.uid === player.uid) throw makeError('Kamu sudah menjadi tuan room ini.', 'same-player');
        var guest = slotFor(game, player);
        return withTimeout(ref.update({ status: 'countdown', guest: guest }), 15000, 'Gabung room melebihi 15 detik.')
          .then(function () {
            var joined = Object.assign({}, data, { status: 'countdown', guest: guest });
            return normalizeDoc({ exists: true, id: code, data: function () { return joined; } }, game, code);
          });
      });
    }).catch(function (err) {
      throw makeError(describe(err), err && err.code);
    });
  };

  ROOM.watch = function (game, rawCode, onDoc, onError) {
    var code = normalizeCode(rawCode);
    if (!validCode(code)) return function () {};
    var stop = function () {};
    var closed = false;
    refFor(game, code).then(function (ref) {
      if (closed) return;
      stop = ref.onSnapshot(function (snap) {
        if (closed) return;
        if (typeof onDoc === 'function') onDoc(normalizeDoc(snap, game, code));
      }, function (err) {
        if (closed) return;
        if (typeof onError === 'function') onError(makeError(describe(err), err && err.code));
      });
    }).catch(function (err) {
      if (closed) return;
      if (typeof onError === 'function') onError(makeError(describe(err), err && err.code));
    });
    return function () {
      if (closed) return;
      closed = true;
      stop();
      stop = function () {};
    };
  };

  ROOM.patchSlot = function (game, rawCode, side, patch) {
    var code = normalizeCode(rawCode);
    if (side !== 'host' && side !== 'guest') return Promise.reject(makeError('Slot pemain tidak valid.', 'invalid-slot'));
    if (!validCode(code)) return Promise.reject(makeError('Kode room tidak valid.', 'invalid-code'));
    var updates = {};
    Object.keys(patch || {}).forEach(function (key) {
      if (patch[key] !== undefined) updates[side + '.' + key] = patch[key];
    });
    updates[side + '.lastSeen'] = Date.now();
    return refFor(game, code).then(function (ref) {
      return withTimeout(ref.update(updates), 12000, 'Pengiriman progres melebihi 12 detik.');
    }).catch(function (err) {
      throw makeError(describe(err), err && err.code);
    });
  };

  ROOM.start = function (game, rawCode, startAtMillis) {
    var code = normalizeCode(rawCode);
    return refFor(game, code).then(function (ref) {
      return withTimeout(ref.update({
        status: 'playing',
        startAtMillis: Number(startAtMillis) || Date.now() + 3000
      }), 12000, 'Mulai duel melebihi 12 detik.');
    }).catch(function (err) {
      throw makeError(describe(err), err && err.code);
    });
  };

  ROOM.finish = function (game, rawCode, winner) {
    var code = normalizeCode(rawCode);
    return refFor(game, code).then(function (ref) {
      return withTimeout(ref.update({
        status: 'finished',
        winner: winner || null
      }), 12000, 'Penutupan duel melebihi 12 detik.');
    }).catch(function (err) {
      throw makeError(describe(err), err && err.code);
    });
  };

  ROOM.abandon = function (game, rawCode) {
    var code = normalizeCode(rawCode);
    if (!validCode(code)) return Promise.resolve();
    return refFor(game, code).then(function (ref) {
      return withTimeout(ref.update({ status: 'abandoned' }), 8000, 'Pembatalan room melebihi 8 detik.');
    }).catch(function () { /* room sudah ditutup atau bukan tuan room */ });
  };

  ROOM.close = function (room) {
    if (!room) return;
    if (room.unsub) {
      try { room.unsub(); } catch (e) { /* abaikan */ }
      room.unsub = null;
    }
    if (room.startTimer) {
      clearTimeout(room.startTimer);
      room.startTimer = null;
    }
  };
})();
