/* =====================================================================
   Game Hub v2 · Nusantara data loader (ZIP-authoritative rules)
   ---------------------------------------------------------
   Mengambil data/nusantara/*.json yang disalin utuh dari ZIP, memvalidasi
   memakai GH.nsSchema, lalu menyajikan satu jalur GH.nsData.load().
   Tidak ada angka atau konten game yang ditulis ulang di kode.
   ===================================================================== */
(function () {
  'use strict';
  var GH = window.GH = window.GH || {};
  var BASE = 'data/nusantara/';

  var ver = (function () {
    try {
      var script = document.currentScript;
      var m = script && /[?&]v=([^&]+)/.exec(script.src);
      return m ? m[1] : '';
    } catch (e) { return ''; }
  })();

  var cache = null;
  var inflight = null;

  function fetchJson(name) {
    var url = BASE + name + '.json' + (ver ? '?v=' + ver : '');
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error(name + '.json gagal dimuat (HTTP ' + res.status + ')');
      return res.json().catch(function () { throw new Error(name + '.json bukan JSON yang valid'); });
    });
  }

  /** Hasil: { ok, data, errors[], warnings[], summary }. Tidak pernah melempar; kegagalan jadi ok:false. */
  function load(force) {
    if (cache && !force) return Promise.resolve(cache);
    if (inflight) return inflight;
    var schema = GH.nsSchema || window.NSSchema;
    if (!schema) {
      return Promise.resolve({
        ok: false, data: null, errors: ['GH.nsSchema belum dimuat (urutan skrip salah)'],
        warnings: [], summary: null
      });
    }
    inflight = Promise.all(schema.FILES.map(fetchJson)).then(function (list) {
      var data = {};
      schema.FILES.forEach(function (name, i) { data[name] = list[i]; });
      var v = schema.validate(data);
      var res = { ok: v.ok, data: v.ok ? data : null, errors: v.errors, warnings: v.warnings, summary: v.summary };
      if (v.ok) cache = res;
      return res;
    }).catch(function (err) {
      return {
        ok: false, data: null, warnings: [], summary: null,
        errors: [(err && err.message) || 'Data tidak bisa dimuat (periksa file data/nusantara/)']
      };
    }).then(function (res) { inflight = null; return res; });
    return inflight;
  }

  GH.nsData = { load: load, get: function () { return cache ? cache.data : null; } };
  window.NSData = GH.nsData;
})();
