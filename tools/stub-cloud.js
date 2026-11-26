/* Browser-only Firestore/Auth stub. Tidak menulis data produksi. */
(function () {
  'use strict';

  var GH = window.GH = window.GH || {};
  var params = new URLSearchParams(location.search);
  var registered = params.get('registered') === '1';
  var uid = params.get('uid') || 'stub-' + Math.random().toString(36).slice(2, 8);
  var docs = window.__stubDocs = Object.create(null);
  var writes = window.__stubWrites = [];
  var listeners = [];
  var shared = params.get('shared') === '1';
  var channel = null;

  // Sinkron antar-tab memakai BroadcastChannel (memori), bukan localStorage.
  if (shared && window.BroadcastChannel) {
    channel = new BroadcastChannel('gh-stub-cloud');
    channel.onmessage = function (event) {
      var msg = event.data || {};
      if (msg.type === 'sync' && msg.docs) {
        Object.keys(docs).forEach(function (key) { delete docs[key]; });
        Object.assign(docs, clone(msg.docs));
        if (Array.isArray(msg.writes)) writes = window.__stubWrites = msg.writes.slice();
        listeners.slice().forEach(function (item) {
          if (item.path === '*') return;
          item.fn(snapshot(!!docs[item.path], item.path.split('/').pop(), docs[item.path]));
        });
      }
      if (msg.type === 'hello') {
        channel.postMessage({ type: 'sync', docs: clone(docs), writes: writes.slice() });
      }
    };
    channel.postMessage({ type: 'hello' });
  }

  window.__stubAuthUser = registered ? { uid: uid } : null;

  var STAMP_FLAG = '__stubServerTimestamp';
  var INCREMENT_FLAG = '__stubIncrement';

  function stamp(ms) {
    var value = ms == null ? Date.now() : Number(ms) || 0;
    return {
      __stubServerTimestamp: true,
      value: value,
      toMillis: function () { return value; }
    };
  }

  function increment(n) {
    return { __stubIncrement: true, value: Number(n) || 0 };
  }

  // DB menyimpan penanda JSON; revive mengembalikan toMillis() setelah clone.
  function revive(value) {
    if (!value || typeof value !== 'object') return value;
    if (value[STAMP_FLAG]) return stamp(value.value);
    Object.keys(value).forEach(function (key) { value[key] = revive(value[key]); });
    return value;
  }

  function clone(value) {
    return revive(JSON.parse(JSON.stringify(value == null ? null : value)));
  }

  function applyWriteValue(current, value) {
    if (value && typeof value === 'object' && value[INCREMENT_FLAG]) {
      return (Number(current) || 0) + Number(value.value || 0);
    }
    return clone(value);
  }

  function persist() {
    if (!shared || !channel) return;
    try {
      channel.postMessage({ type: 'sync', docs: clone(docs), writes: writes.slice() });
    } catch (e) { /* abaikan */ }
  }

  function pushWrite(entry) {
    entry.actor = uid;
    writes.push(entry);
    window.__stubWrites = writes;
    persist();
  }

  function snapshot(exists, id, data) {
    return {
      exists: !!exists,
      id: id,
      data: function () { return clone(data); }
    };
  }

  function refFor(path, id) {
    return {
      id: id,
      path: path,
      get: function () { return Promise.resolve(snapshot(!!docs[path], id, docs[path])); },
      collection: function (sub) { return queryFor(path + '/' + sub); },
      set: function (data, options) {
        pushWrite({ op: 'set', path: path, data: clone(data), merge: !!(options && options.merge) });
        var previous = docs[path];
        var next = options && options.merge && previous
          ? Object.assign({}, clone(previous), clone(data)) : clone(data);
        Object.keys(next).forEach(function (key) {
          next[key] = applyWriteValue(previous && previous[key], next[key]);
        });
        docs[path] = next;
        persist();
        listeners.slice().forEach(function (item) {
          if (item.path === path || item.path === '*') item.fn(snapshot(true, id, docs[path]));
        });
        return Promise.resolve();
      },
      update: function (data) {
        pushWrite({ op: 'update', path: path, data: clone(data) });
        if (!docs[path]) docs[path] = {};
        Object.keys(data || {}).forEach(function (key) {
          var parts = key.split('.');
          var target = docs[path];
          while (parts.length > 1) {
            var part = parts.shift();
            if (!target[part] || typeof target[part] !== 'object') target[part] = {};
            target = target[part];
          }
          target[parts[0]] = applyWriteValue(target[parts[0]], data[key]);
        });
        persist();
        listeners.slice().forEach(function (item) {
          if (item.path === path || item.path === '*') item.fn(snapshot(true, id, docs[path]));
        });
        return Promise.resolve();
      },
      delete: function () {
        pushWrite({ op: 'delete', path: path });
        delete docs[path];
        persist();
        listeners.slice().forEach(function (item) {
          if (item.path === path || item.path === '*') item.fn(snapshot(false, id, null));
        });
        return Promise.resolve();
      },
      onSnapshot: function (fn) {
        var item = { path: path, fn: fn };
        listeners.push(item);
        fn(snapshot(!!docs[path], id, docs[path]));
        return function () {
          var i = listeners.indexOf(item);
          if (i >= 0) listeners.splice(i, 1);
        };
      }
    };
  }

  function sortValue(data, field) {
    var value = data;
    String(field || '').split('.').forEach(function (part) {
      value = value && value[part];
    });
    if (value && typeof value.toMillis === 'function') return value.toMillis();
    return value;
  }

  // Query stub: cukup untuk orderBy(...).limit(...) yang dipakai adapter Memo.
  function queryFor(name) {
    var q = {
      path: name,
      orderField: '',
      orderDir: 'asc',
      limitTo: null
    };

    q.doc = function (id) { return refFor(name + '/' + id, id); };

    q.orderBy = function (field, dir) {
      q.orderField = String(field || '');
      q.orderDir = String(dir || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
      return q;
    };

    q.limit = function (n) {
      q.limitTo = Math.max(0, Number(n) || 0);
      return q;
    };

    q.get = function () {
      var prefix = name.replace(/\/$/, '') + '/';
      var rows = Object.keys(docs).filter(function (path) {
        if (path.indexOf(prefix) !== 0) return false;
        return path.slice(prefix.length).indexOf('/') < 0;
      }).map(function (path) {
        return snapshot(true, path.slice(prefix.length), docs[path]);
      });

      if (q.orderField) {
        var sign = q.orderDir === 'desc' ? -1 : 1;
        rows.sort(function (a, b) {
          var av = sortValue(a.data(), q.orderField);
          var bv = sortValue(b.data(), q.orderField);
          if (av === bv) return 0;
          return (av > bv ? 1 : -1) * sign;
        });
      }
      if (q.limitTo !== null) rows = rows.slice(0, q.limitTo);

      return Promise.resolve({
        docs: rows,
        empty: rows.length === 0,
        size: rows.length,
        forEach: function (fn) { rows.forEach(fn); }
      });
    };

    return q;
  }

  // Transaksi stub: bacaan memakai docs lama, mutasi baru ditulis setelah
  // callback selesai (pushWrite tetap dipakai agar actor tag terjaga).
  function runTransaction(fn) {
    var pending = [];
    var tx = {
      get: function (ref) { return ref.get(); },
      set: function (ref, data) {
        pending.push(function () { return ref.set(data); });
        return tx;
      },
      update: function (ref, data) {
        pending.push(function () { return ref.update(data); });
        return tx;
      }
    };
    return Promise.resolve().then(function () { return fn(tx); }).then(function (result) {
      return pending.reduce(function (chain, task) {
        return chain.then(task);
      }, Promise.resolve()).then(function () { return result; });
    });
  }

  var stubDb = {
    settings: function () {},
    collection: function (name) { return queryFor(name); },
    runTransaction: runTransaction
  };

  var stubAuth = {
    currentUser: window.__stubAuthUser || null,
    signInAnonymously: function () { return Promise.resolve({ user: window.__stubAuthUser || null }); },
    onAuthStateChanged: function (fn) {
      if (typeof fn === 'function') Promise.resolve().then(function () { fn(window.__stubAuthUser || null); });
      return function () {};
    },
    signOut: function () {
      window.__stubAuthUser = null;
      stubAuth.currentUser = null;
      status.authLabel = 'Stub guest';
      return Promise.resolve();
    }
  };

  window.firebase = {
    apps: [{ name: '[DEFAULT]' }],
    app: function () { return window.firebase.apps[0]; },
    initializeApp: function () { return window.firebase.apps[0]; },
    auth: function () {
      stubAuth.currentUser = window.__stubAuthUser || null;
      return stubAuth;
    },
    firestore: function () { return stubDb; }
  };
  window.firebase.firestore.FieldValue = {
    serverTimestamp: function () { return stamp(); },
    increment: function (n) { return increment(n); }
  };
  window.__stubFirestore = stubDb;

  var status = {
    phase: 'ready',
    label: 'Stub cloud',
    enabled: true,
    projectId: 'stub-project',
    authLabel: registered ? 'Stub registered' : 'Stub guest',
    sdk: 'stub',
    writes: 0,
    writeErrors: 0
  };

  function record(kind, detail) {
    pushWrite(Object.assign({ op: kind }, detail || {}));
    status.writes = writes.length;
    return Promise.resolve(true);
  }

  var C = GH.cloud = {
    init: function () { return Promise.resolve(true); },
    start: function () { return Promise.resolve(true); },
    refresh: function () { return Promise.resolve(true); },
    getStatus: function () { return Object.assign({}, status); },
    supportsBoard: function () { return false; },
    fetchBoard: function (key) { return Promise.resolve({ ok: true, rows: [], source: 'stub', board: key }); },
    onChange: function (fn) {
      if (typeof fn !== 'function') return function () {};
      listeners.push({ path: '*', fn: fn });
      fn(Object.assign({}, status));
      return function () {
        var i = listeners.findIndex(function (item) { return item.fn === fn; });
        if (i >= 0) listeners.splice(i, 1);
      };
    },
    describeError: function (err) { return String((err && err.message) || err || 'Stub error'); },
    restoreAuth: function () { return Promise.resolve(window.__stubAuthUser); },
    // Tamu tetap tamu: stub tidak pernah membuat sesi Auth baru secara otomatis.
    ensureAuth: function () { return Promise.resolve(window.__stubAuthUser); },
    signInAnon: function () { return Promise.resolve(window.__stubAuthUser); },
    getPlayerProfile: function (profileUid) {
      if (!window.__stubAuthUser || profileUid !== uid) return Promise.resolve(null);
      return Promise.resolve({
        uid: uid,
        displayName: 'Uji Pemain',
        name: 'Uji Pemain',
        avatar: '🦊',
        createdAt: new Date().toISOString()
      });
    },
    createPlayerProfile: function (input) {
      window.__stubAuthUser = { uid: uid };
      status.authLabel = 'Stub registered';
      return Promise.resolve({
        uid: uid,
        displayName: input.displayName,
        name: input.name,
        avatar: input.avatar,
        createdAt: new Date().toISOString()
      });
    },
    updatePlayerProfile: function () { return Promise.resolve(true); },
    signOut: function () {
      window.__stubAuthUser = null;
      status.authLabel = 'Stub guest';
      return Promise.resolve(true);
    },
    saveScore: function (key, payload) { return record('saveScore', { key: key, payload: clone(payload) }); },
    saveGameStat: function (game, payload) { return record('saveGameStat', { game: game, payload: clone(payload) }); },
    saveDuelWin: function (game, name, avatar, opts) {
      return record('saveDuelWin', { game: game, name: name, avatar: avatar, opts: clone(opts) });
    }
  };
})();
