/* =========================================================
   Game Hub v2 · Router + exit guard
   ========================================================= */
(function () {
  'use strict';
  var GH = window.GH = window.GH || {};
  var U = GH.util;
  var R = GH.router = {};

  var routes = {};
  var current = { route: 'hub', params: {} };
  var lastRoute = 'hub';
  var guard = null;
  var rendering = false;

  function parseHash() {
    var hash = window.location.hash.replace(/^#\/?/, '');
    if (!hash) return { route: 'hub', params: {} };
    var parts = hash.split('?');
    var route = parts[0].split('/')[0] || 'hub';
    var params = {};
    if (parts[1]) {
      parts[1].split('&').forEach(function (pair) {
        var kv = pair.split('=');
        params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
      });
    }
    return { route: route, params: params };
  }

  R.register = function (name, config) {
    routes[name] = config || {};
  };

  R.current = function () { return current; };
  R.guardActive = function () { return !!(guard && guard.active); };
  R.getGuard = function () { return guard; };

  R.setGuard = function (opts) {
    guard = Object.assign({ active: true }, opts || {});
  };

  R.clearGuard = function () {
    guard = null;
  };

  R.confirmGuard = function () {
    if (!guard || !guard.active) return Promise.resolve(true);
    if (guard.dialogOpen) return Promise.resolve(false);
    guard.dialogOpen = true;
    var title = guard.title || 'Keluar dari permainan?';
    var body = guard.body || 'Progres sesi ini akan hilang. Kamu bisa memulai lagi kapan saja.';
    return GH.ui.confirm({
      title: title,
      body: body,
      confirmLabel: guard.confirmLabel || 'Ya, keluar',
      cancelLabel: guard.cancelLabel || 'Lanjut bermain',
      danger: true
    }).then(function (ok) {
      guard.dialogOpen = false;
      if (!ok) return false;
      var abort = guard.onAbort;
      guard = null;
      if (typeof abort === 'function') {
        try { abort(); } catch (e) { console.warn('[Game Hub] Gagal menghentikan sesi:', e); }
      }
      return true;
    });
  };

  function apply(route, params) {
    var config = routes[route];
    if (!config || typeof config.render !== 'function') {
      if (route !== 'hub') {
        console.warn('[Game Hub] Rute tidak ditemukan:', route);
        route = 'hub';
        params = {};
        config = routes[route];
      }
    }
    if (!config) return;
    if (rendering) return;
    rendering = true;

    // cleanup previous
    var prev = routes[lastRoute];
    if (prev && typeof prev.cleanup === 'function' && lastRoute !== route) {
      try { prev.cleanup(); } catch (e) { console.warn('[Game Hub] Cleanup gagal:', e); }
    }

    var views = document.querySelectorAll('.view');
    for (var i = 0; i < views.length; i++) {
      views[i].hidden = views[i].dataset.view !== route;
    }
    var target = document.querySelector('[data-view="' + route + '"]');
    if (target) target.hidden = false;

    var isHub = route === 'hub';
    var head = document.getElementById('siteHead');
    var foot = document.querySelector('.site-foot');
    if (head) head.hidden = !isHub;
    if (foot) foot.hidden = !isHub;
    document.body.dataset.route = route;
    document.documentElement.setAttribute('data-theme', isHub ? 'hub' : route);

    var navLinks = document.querySelectorAll('.site-nav__link[data-nav]');
    for (var j = 0; j < navLinks.length; j++) {
      navLinks[j].classList.toggle('is-active', navLinks[j].dataset.nav === route);
    }

    current = { route: route, params: params || {} };
    lastRoute = route;
    document.title = (config.title ? config.title + ' · ' : '') + 'Game Hub';

    try {
      config.render(target, params || {});
    } catch (e) {
      console.error('[Game Hub] Render gagal:', e);
      if (target) {
        target.innerHTML = '<div class="wrap" style="padding-top:2rem">' +
          GH.ui.emptyState('⚠', 'Halaman gagal dimuat', U.niceError(e) || 'Terjadi kesalahan.', '') +
          '<div class="row" style="justify-content:center"><button class="btn btn--primary" type="button" onclick="location.reload()">Muat ulang</button></div></div>';
      }
      if (target) target.hidden = false;
    }

    window.scrollTo({ top: 0, behavior: 'auto' });
    rendering = false;
  }

  R.render = function (route, params) {
    apply(route, params);
  };

  R.refresh = function () {
    apply(current.route, current.params);
  };

  R.go = async function (route, params, opts) {
    opts = opts || {};
    if (route === current.route && !opts.force) {
      if (opts.scrollTop !== false) window.scrollTo({ top: 0, behavior: 'smooth' });
      return true;
    }
    if (R.guardActive() && route !== current.route) {
      var ok = await R.confirmGuard();
      if (!ok) return false;
    }
    params = params || {};
    var state = { route: route, params: params };
    var url = '#/' + route;
    try {
      if (opts.replace) window.history.replaceState(state, '', url);
      else window.history.pushState(state, '', url);
    } catch (e) {
      // file:// fallback
      window.location.hash = '#/' + route;
    }
    apply(route, params);
    return true;
  };

  function handlePop(event) {
    var state = event.state;
    if (!state || !state.route) {
      state = parseHash();
    }
    if (R.guardActive()) {
      var target = state;
      R.confirmGuard().then(function (ok) {
        if (!ok) {
          try {
            window.history.pushState({ route: current.route, params: current.params }, '', '#/' + current.route);
          } catch (e) { /* ignore */ }
          return;
        }
        apply(target.route || 'hub', target.params || {});
      });
      return;
    }
    apply(state.route || 'hub', state.params || {});
  }

  R.start = function () {
    var initial = parseHash();
    if (!routes[initial.route]) initial = { route: 'hub', params: {} };
    try {
      window.history.replaceState({ route: initial.route, params: initial.params }, '', '#/' + initial.route);
    } catch (e) { /* ignore */ }
    apply(initial.route, initial.params);
    window.addEventListener('popstate', handlePop);
  };

  R.onLinkClick = function (route) {
    return function (e) {
      if (e) e.preventDefault();
      R.go(route);
    };
  };
})();
