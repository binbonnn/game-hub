/* =========================================================
   Game Hub v2 · Utilities
   ========================================================= */
(function () {
  'use strict';
  var GH = window.GH = window.GH || {};
  var U = GH.util = {};

  U.esc = function (value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  U.attr = function (value) {
    return U.esc(value);
  };

  U.clamp = function (n, min, max) {
    return Math.min(max, Math.max(min, n));
  };

  U.lerp = function (a, b, t) {
    return a + (b - a) * t;
  };

  U.pct = function (value, total) {
    if (!total) return 0;
    return U.clamp((value / total) * 100, 0, 100);
  };

  U.sum = function (arr, fn) {
    return arr.reduce(function (acc, item, i) { return acc + (fn ? fn(item, i) : item); }, 0);
  };

  U.range = function (n, start) {
    var out = [];
    start = start || 0;
    for (var i = 0; i < n; i++) out.push(start + i);
    return out;
  };

  U.pick = function (arr, rng) {
    if (!arr.length) return null;
    var i = Math.floor((rng ? rng() : Math.random()) * arr.length);
    return arr[Math.min(i, arr.length - 1)];
  };

  U.shuffle = function (arr, rng) {
    var a = arr.slice();
    var rand = rng || Math.random;
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };

  U.sample = function (arr, n, rng) {
    return U.shuffle(arr, rng).slice(0, n);
  };

  U.unique = function (arr) {
    return arr.filter(function (v, i) { return arr.indexOf(v) === i; });
  };

  U.groupBy = function (arr, fn) {
    return arr.reduce(function (acc, item) {
      var key = fn(item);
      (acc[key] = acc[key] || []).push(item);
      return acc;
    }, {});
  };

  U.hashString = function (str) {
    var h = 2166136261 >>> 0;
    str = String(str);
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };

  U.mulberry32 = function (seed) {
    var a = (typeof seed === 'string' ? U.hashString(seed) : seed) >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  U.rngInt = function (rng, min, max) {
    return min + Math.floor(rng() * (max - min + 1));
  };

  U.rngPick = function (rng, arr) {
    return arr[Math.floor(rng() * arr.length)];
  };

  U.uid = function (prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  };

  U.formatNumber = function (n, decimals) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toLocaleString('id-ID', {
      minimumFractionDigits: decimals || 0,
      maximumFractionDigits: decimals || 0
    });
  };

  U.formatClock = function (seconds) {
    seconds = Math.max(0, Number(seconds) || 0);
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return (m > 0 ? m + ':' + String(s).padStart(2, '0') : String(s));
  };

  U.formatMs = function (ms, opts) {
    opts = opts || {};
    ms = Math.max(0, Number(ms) || 0);
    var totalSec = ms / 1000;
    var m = Math.floor(totalSec / 60);
    var s = totalSec - m * 60;
    if (opts.precise) {
      return (m > 0 ? m + ':' : '') + s.toFixed(1).padStart(m > 0 ? 4 : 1, '0') + (m > 0 ? '' : ' dtk');
    }
    if (m > 0) return m + ':' + String(Math.floor(s)).padStart(2, '0');
    return s.toFixed(1) + ' dtk';
  };

  U.formatDate = function (input, opts) {
    var d = input ? new Date(input) : new Date();
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('id-ID', opts || { day: 'numeric', month: 'short', year: 'numeric' });
  };

  U.formatDateTime = function (input) {
    var d = input ? new Date(input) : new Date();
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) + ', ' +
      d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  };

  U.dateKey = function (date) {
    var d = date ? new Date(date) : new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  };

  U.dayDiff = function (a, b) {
    var d1 = new Date(a); var d2 = new Date(b);
    return Math.round((d2 - d1) / 86400000);
  };

  U.streakFromDates = function (dates) {
    var keys = U.unique(dates.map(function (d) { return U.dateKey(d); })).sort().reverse();
    if (!keys.length) return 0;
    var today = U.dateKey(new Date());
    var yesterday = U.dateKey(new Date(Date.now() - 86400000));
    if (keys[0] !== today && keys[0] !== yesterday) return 0;
    var streak = 0;
    var cursor = new Date(keys[0] + 'T12:00:00');
    for (var i = 0; i < keys.length; i++) {
      if (U.dateKey(cursor) === keys[i]) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  };

  U.todayLong = function () {
    return new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  U.weekStart = function (date) {
    var d = date ? new Date(date) : new Date();
    var day = d.getUTCDay();
    var diff = (day + 6) % 7;
    var start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff, 0, 0, 0, 0));
    return start;
  };

  U.safeParse = function (str, fallback) {
    try { return JSON.parse(str); } catch (e) { return fallback; }
  };

  U.debounce = function (fn, wait) {
    var t;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  };

  U.throttle = function (fn, wait) {
    var last = 0, timer;
    return function () {
      var now = Date.now(), ctx = this, args = arguments;
      var remaining = wait - (now - last);
      if (remaining <= 0) {
        clearTimeout(timer);
        last = now;
        fn.apply(ctx, args);
      } else if (!timer) {
        timer = setTimeout(function () {
          last = Date.now();
          timer = null;
          fn.apply(ctx, args);
        }, remaining);
      }
    };
  };

  U.sleep = function (ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  };

  U.raf = function (fn) {
    var id = null;
    function loop(t) {
      fn(t);
      id = requestAnimationFrame(loop);
    }
    id = requestAnimationFrame(loop);
    return function () { if (id) cancelAnimationFrame(id); id = null; };
  };

  U.copyText = function (text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        resolve();
      } catch (e) { reject(e); }
    });
  };

  U.roomCode = function () {
    var chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    var out = '';
    for (var i = 0; i < 5; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  };

  U.pinValid = function (pin) {
    return /^\d{4}$/.test(String(pin || ''));
  };

  U.nameValid = function (name) {
    var n = String(name || '').trim();
    if (n.length < 1 || n.length > 16) return false;
    if (/[.\/\[\]*~`'"]/.test(n)) return false;
    return true;
  };

  U.cleanName = function (name) {
    return String(name || '').replace(/\s+/g, ' ').trim().slice(0, 16);
  };

  U.roman = function (n) {
    var map = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    return map.reduce(function (acc, pair) {
      while (n >= pair[0]) { acc += pair[1]; n -= pair[0]; }
      return acc;
    }, '');
  };

  U.ordinal = function (n) {
    return '#' + n;
  };

  U.toHex = function (buffer) {
    return Array.prototype.map.call(new Uint8Array(buffer), function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  };

  U.deg = function (n) { return n + '°'; };

  U.niceError = function (err) {
    if (!err) return 'Terjadi kesalahan yang tidak diketahui.';
    if (err.message) return err.message;
    return String(err);
  };

  U.compactNumber = function (n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + 'jt';
    if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'rb';
    return String(n);
  };

  U.parseSearch = function () {
    var out = {};
    var search = window.location.search.replace(/^\?/, '');
    if (!search) return out;
    search.split('&').forEach(function (pair) {
      var kv = pair.split('=');
      out[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    });
    return out;
  };

  U.prefersReducedMotion = function () {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  };

  U.isTouch = function () {
    return window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  };

  U.shortSide = function () {
    return Math.min(window.innerWidth, window.innerHeight);
  };

  U.isPhoneOrTablet = function () {
    return U.shortSide() <= 700 || (U.shortSide() <= 1100 && U.isTouch());
  };

  U.portrait = function () {
    return window.innerHeight > window.innerWidth;
  };

  U.on = function (target, type, handler, opts) {
    target.addEventListener(type, handler, opts);
    return function () { target.removeEventListener(type, handler, opts); };
  };
})();
