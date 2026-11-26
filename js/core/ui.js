/* =========================================================
   Game Hub v2 · UI primitives
   ========================================================= */
(function () {
  'use strict';
  var GH = window.GH = window.GH || {};
  var U = GH.util;
  var UI = GH.ui = {};

  /* ---------------- Toast ---------------- */
  var TOAST_ICONS = { info: 'i', success: '✓', danger: '!', warning: '!' };
  UI.toast = function (opts) {
    opts = typeof opts === 'string' ? { title: opts } : (opts || {});
    var stack = document.getElementById('toastStack');
    if (!stack) return;
    while (stack.children.length >= 3) stack.removeChild(stack.firstElementChild);
    var type = opts.type || 'info';
    var el = document.createElement('div');
    el.className = 'toast toast--' + type;
    el.innerHTML =
      '<span class="toast__icon" aria-hidden="true">' + TOAST_ICONS[type] + '</span>' +
      '<div class="toast__body">' +
        '<div class="toast__title">' + U.esc(opts.title || '') + '</div>' +
        (opts.msg ? '<div class="toast__msg">' + U.esc(opts.msg) + '</div>' : '') +
      '</div>' +
      '<button class="toast__close" type="button" aria-label="Tutup notifikasi">×</button>';
    var timer = null;
    function close() {
      if (!el.isConnected) return;
      clearTimeout(timer);
      el.classList.add('is-leaving');
      setTimeout(function () { el.remove(); }, 200);
    }
    el.querySelector('.toast__close').addEventListener('click', close);
    stack.appendChild(el);
    timer = setTimeout(close, opts.duration || 4200);
    return close;
  };

  /* ---------------- Modal ---------------- */
  var openModals = [];
  var scrollLocks = 0;

  function focusable(root) {
    return Array.prototype.slice.call(root.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(function (el) { return el.offsetParent !== null || el === document.activeElement; });
  }

  UI.modal = function (opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var root = document.getElementById('modalRoot');
      if (!root) { resolve(null); return; }
      var previousFocus = document.activeElement;
      var backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.dataset.modal = '1';
      var wideClass = opts.wide ? ' modal--wide' : (opts.narrow ? ' modal--narrow' : '');
      backdrop.innerHTML =
        '<div class="modal' + wideClass + '" role="dialog" aria-modal="true" aria-labelledby="modalTitle_' + openModals.length + '">' +
          '<div class="modal__head">' +
            '<div>' +
              '<h2 id="modalTitle_' + openModals.length + '">' + U.esc(opts.title || '') + '</h2>' +
              (opts.subtitle ? '<p>' + U.esc(opts.subtitle) + '</p>' : '') +
            '</div>' +
            (opts.dismissible === false ? '' : '<button class="modal__close" type="button" aria-label="Tutup dialog">×</button>') +
          '</div>' +
          '<div class="modal__body"></div>' +
          '<div class="modal__foot"></div>' +
        '</div>';
      var modal = backdrop.querySelector('.modal');
      var body = backdrop.querySelector('.modal__body');
      if (opts.body instanceof Node) body.appendChild(opts.body);
      else body.innerHTML = opts.body || '';

      var foot = backdrop.querySelector('.modal__foot');
      var actions = opts.actions || [];
      if (!actions.length && !opts.hideFooter) {
        actions = [{ label: 'Tutup', value: null, variant: 'ghost' }];
      }
      actions.forEach(function (act) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn--' + (act.variant || 'ghost');
        btn.innerHTML = U.esc(act.label || 'OK');
        if (act.id) btn.id = act.id;
        btn.addEventListener('click', function () {
          if (typeof act.onClick === 'function') {
            var result = act.onClick(modal, close);
            if (result === false) return;
          }
          close(act.value === undefined ? act.label : act.value);
        });
        foot.appendChild(btn);
      });

      function close(value) {
        var idx = openModals.indexOf(backdrop);
        if (idx < 0) return;
        openModals.splice(idx, 1);
        backdrop.style.animation = 'fadeIn 120ms reverse both';
        modal.style.animation = 'modalIn 120ms reverse both';
        setTimeout(function () {
          backdrop.remove();
          scrollLocks = Math.max(0, scrollLocks - 1);
          document.body.style.overflow = scrollLocks ? 'hidden' : '';
          if (previousFocus && previousFocus.focus) {
            try { previousFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
          }
        }, 120);
        resolve(value === undefined ? null : value);
      }

      function onKey(e) {
        if (e.key === 'Escape' && opts.dismissible !== false) {
          e.preventDefault();
          close(null);
        }
        if (e.key === 'Tab') {
          var items = focusable(modal);
          if (!items.length) return;
          var first = items[0], last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }

      backdrop.addEventListener('keydown', onKey);
      if (opts.dismissible !== false) {
        var closeBtn = backdrop.querySelector('.modal__close');
        if (closeBtn) closeBtn.addEventListener('click', function () { close(null); });
        backdrop.addEventListener('click', function (e) {
          if (e.target === backdrop && opts.backdropClose !== false) close(null);
        });
      }

      root.appendChild(backdrop);
      openModals.push(backdrop);
      scrollLocks++;
      document.body.style.overflow = 'hidden';
      setTimeout(function () {
        var items = focusable(modal);
        if (opts.initialFocus && typeof opts.initialFocus === 'string') {
          var target = modal.querySelector(opts.initialFocus);
          if (target) target.focus();
        } else if (items.length) {
          items[0].focus();
        } else {
          modal.setAttribute('tabindex', '-1');
          modal.focus();
        }
      }, 30);

      if (typeof opts.onMount === 'function') opts.onMount(modal, close);
      backdrop._close = close;
    });
  };

  UI.confirm = function (opts) {
    opts = opts || {};
    return UI.modal({
      title: opts.title || 'Konfirmasi',
      subtitle: opts.subtitle || '',
      body: '<p class="small muted" style="line-height:1.6">' + U.esc(opts.body || '') + '</p>',
      narrow: true,
      dismissible: opts.dismissible !== false,
      actions: [
        { label: opts.cancelLabel || 'Batal', value: false, variant: 'ghost' },
        { label: opts.confirmLabel || 'Ya, lanjutkan', value: true, variant: opts.danger ? 'danger' : 'primary' }
      ]
    }).then(function (v) { return v === true; });
  };

  UI.alert = function (opts) {
    opts = typeof opts === 'string' ? { body: opts } : (opts || {});
    return UI.modal({
      title: opts.title || 'Informasi',
      body: '<p class="small muted" style="line-height:1.65">' + U.esc(opts.body || '') + '</p>',
      narrow: true,
      actions: [{ label: opts.okLabel || 'Mengerti', value: true, variant: 'primary' }]
    });
  };

  UI.closeTopModal = function () {
    var top = openModals[openModals.length - 1];
    if (top && top._close) top._close(null);
  };

  /* ---------------- Leaderboard rendering ---------------- */
  UI.leaderboard = function (rows, opts) {
    opts = opts || {};
    if (!rows || !rows.length) {
      return '<div class="lb__empty">' + U.esc(opts.empty || 'Belum ada skor. Jadilah yang pertama.') + '</div>';
    }
    return '<div class="lb' + (opts.compact ? ' lb--compact' : '') + '">' + rows.map(function (row, i) {
      var value = opts.value ? opts.value(row, i) : (row.score != null ? row.score : '—');
      var sub = opts.sub ? opts.sub(row, i) : (row.meta && row.meta.label ? row.meta.label : U.formatDate(row.date));
      var avatar = opts.avatar === false ? '' :
        '<span class="lb__avatar" aria-hidden="true">' + U.esc(row.avatar || '•') + '</span>';
      return '<div class="lb__row">' +
        '<span class="lb__rank">' + (i + 1) + '</span>' +
        '<div class="lb__who">' + avatar +
          '<div style="min-width:0">' +
            '<div class="lb__name">' + U.esc(row.name || 'Pemain') + '</div>' +
            '<div class="lb__sub">' + U.esc(sub || '') + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="lb__value">' + value + '</div>' +
      '</div>';
    }).join('') + '</div>';
  };

  UI.emptyState = function (icon, title, text, actionHtml) {
    return '<div class="empty-state">' +
      '<div class="empty-state__art" aria-hidden="true">' + icon + '</div>' +
      '<strong>' + U.esc(title) + '</strong>' +
      '<p>' + U.esc(text) + '</p>' +
      (actionHtml || '') +
    '</div>';
  };

  /* ---------------- Confetti ---------------- */
  UI.confetti = function (opts) {
    opts = opts || {};
    if (U.prefersReducedMotion() || document.documentElement.getAttribute('data-reduced-motion') === 'true') return;
    var canvas = document.createElement('canvas');
    canvas.className = 'confetti-canvas';
    document.body.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    function size() {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    var colors = opts.colors || ['#ffd479', '#ff8c5b', '#8d7bff', '#5de0c2', '#ff79c6', '#62c9ff'];
    var count = opts.count || 90;
    var pieces = [];
    for (var i = 0; i < count; i++) {
      pieces.push({
        x: window.innerWidth / 2 + (Math.random() - 0.5) * 120,
        y: window.innerHeight * 0.35 + (Math.random() - 0.5) * 80,
        vx: (Math.random() - 0.5) * 11,
        vy: -Math.random() * 10 - 3,
        w: 5 + Math.random() * 7,
        h: 4 + Math.random() * 6,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.3,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1
      });
    }
    var start = performance.now();
    function frame(t) {
      var elapsed = t - start;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      pieces.forEach(function (p) {
        p.vy += 0.26;
        p.vx *= 0.992;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.life = Math.max(0, 1 - elapsed / 2600);
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      if (elapsed < 2700) requestAnimationFrame(frame);
      else canvas.remove();
    }
    requestAnimationFrame(frame);
  };

  /* ---------------- Countdown ---------------- */
  UI.countdown = function (host, opts) {
    opts = opts || {};
    var from = opts.from == null ? 3 : opts.from;
    var cancel = null;
    var promise = new Promise(function (resolve) {
      var overlay = document.createElement('div');
      var timers = [];
      var settled = false;
      overlay.className = 'countdown';
      overlay.setAttribute('role', 'status');
      overlay.setAttribute('aria-live', 'assertive');
      overlay.innerHTML = '<span class="countdown__num">' + from + '</span>' +
        '<span class="countdown__hint">' + U.esc(opts.hint || 'Siap-siap…') + '</span>';
      host.appendChild(overlay);

      function later(fn, ms) {
        var id = setTimeout(function () {
          timers = timers.filter(function (t) { return t !== id; });
          fn();
        }, ms);
        timers.push(id);
        return id;
      }

      function finish(value) {
        if (settled) return;
        settled = true;
        timers.forEach(clearTimeout);
        timers = [];
        if (overlay.parentNode) overlay.remove();
        promise.cancel = null;
        resolve(value);
      }

      cancel = function () { finish(false); };

      var n = from;
      function step() {
        if (settled) return;
        if (n <= 0) {
          overlay.querySelector('.countdown__num').textContent = opts.finalLabel || 'Mulai!';
          overlay.classList.add('is-final');
          if (opts.onTick) opts.onTick(0);
          if (GH.audio) GH.audio.countdown(true);
          later(function () {
            if (settled) return;
            overlay.classList.add('is-leaving');
            later(function () { finish(true); }, 260);
          }, opts.finalHold || 450);
          return;
        }
        overlay.querySelector('.countdown__num').textContent = n;
        overlay.classList.remove('is-pop');
        void overlay.offsetWidth;
        overlay.classList.add('is-pop');
        if (opts.onTick) opts.onTick(n);
        if (GH.audio) GH.audio.countdown(n === 1);
        n--;
        later(step, opts.interval || 750);
      }
      step();
    });
    promise.cancel = cancel;
    return promise;
  };

  /* ---------------- Starfield ---------------- */
  UI.initStarfield = function (canvas) {
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var stars = [];
    var w = 0, h = 0;
    var reduced = U.prefersReducedMotion() || document.documentElement.getAttribute('data-reduced-motion') === 'true';
    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var count = Math.min(150, Math.round((w * h) / 12000));
      stars = [];
      for (var i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: Math.random() * 1.25 + 0.35,
          a: Math.random() * 0.6 + 0.2,
          tw: Math.random() * Math.PI * 2,
          speed: Math.random() * 0.15 + 0.03
        });
      }
    }
    function draw(t) {
      ctx.clearRect(0, 0, w, h);
      stars.forEach(function (s) {
        if (!reduced) {
          s.y += s.speed * 0.12;
          if (s.y > h) { s.y = 0; s.x = Math.random() * w; }
        }
        var alpha = s.a;
        if (!reduced) alpha = s.a * (0.65 + 0.35 * Math.sin(t / 1200 + s.tw));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(220, 230, 255, ' + alpha.toFixed(3) + ')';
        ctx.fill();
      });
      if (!reduced) requestAnimationFrame(draw);
    }
    resize();
    draw(0);
    window.addEventListener('resize', U.debounce(function () { resize(); draw(0); }, 180));
  };

  /* ---------------- Sound control ---------------- */
  UI.syncSoundButton = function () {
    var btn = document.getElementById('soundToggle');
    var store = GH.store;
    if (!btn || !store) return;
    var on = store.getSettings().sound;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.setAttribute('aria-label', on ? 'Matikan suara' : 'Nyalakan suara');
  };

  UI.toggleSound = function () {
    var store = GH.store;
    var on = !store.getSettings().sound;
    store.setSetting('sound', on);
    if (GH.audio) GH.audio.setEnabled(on);
    UI.syncSoundButton();
    if (on && GH.audio) GH.audio.click();
    UI.toast({
      type: 'info',
      title: on ? 'Suara aktif' : 'Suara dimatikan',
      msg: on ? 'Efek suara akan terdengar saat bermain.' : 'Preferensi tersimpan di Firestore untuk profil terdaftar.',
      duration: 2200
    });
  };

  /* ---------------- Shared game chrome ---------------- */
  var GUEST_MESSAGE = 'You\'re currently playing as a guest. Create a player profile to save your progress, scores, and achievements across all games.';

  function isGuest() {
    return !!(GH.identity && typeof GH.identity.isGuestLike === 'function' && GH.identity.isGuestLike());
  }

  UI.guestNotice = function () {
    if (!isGuest()) return '';
    return '<div class="guest-notice" data-gh-guest-notice role="status">' +
      '<span class="guest-notice__icon" aria-hidden="true">!</span>' +
      '<p>' + U.esc(GUEST_MESSAGE) + '</p>' +
      '<button class="btn btn--primary btn--sm" type="button" data-open="create-profile" data-gh-create-profile>Create Profile</button>' +
    '</div>';
  };

  UI.gameHeader = function (opts) {
    opts = opts || {};
    return '<div class="game-head">' +
      '<button class="back-btn" type="button" data-game-back aria-label="' + U.esc(opts.backLabel || 'Kembali ke hub') + '">' +
        '<span aria-hidden="true">←</span><span class="back-btn__text">' + U.esc(opts.backLabel || 'Hub') + '</span>' +
      '</button>' +
      '<div class="game-head__id">' +
        '<span class="game-head__mark" aria-hidden="true">' + (opts.glyph || '✦') + '</span>' +
        '<div><strong>' + U.esc(opts.title || '') + '</strong><small>' + U.esc(opts.subtitle || '') + '</small></div>' +
      '</div>' +
      '<div class="game-head__actions">' +
        (isGuest()
          ? '<button class="btn btn--ghost btn--sm game-head__profile" type="button" data-open="create-profile" data-gh-create-profile aria-label="Create Profile">Create Profile</button>'
          : '') +
        (opts.actions || '') +
        '<button class="icon-btn" type="button" data-sound-toggle aria-label="Suara" title="Suara">' +
          '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 010 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
        '</button>' +
        '<button class="icon-btn" type="button" data-open="settings" aria-label="Setelan" title="Setelan">⚙</button>' +
      '</div>' +
    '</div>' +
    UI.guestNotice();
  };

  UI.identityChip = function (name, avatar) {
    return '<span class="player-pill"><span class="player-pill__avatar" aria-hidden="true">' + U.esc(avatar || '🦊') + '</span><span class="player-pill__name">' + U.esc(name || 'Pemain') + '</span></span>';
  };

  UI.avatarPicker = function (selected, onPick) {
    var avatars = ['🦊', '🐼', '🐯', '🐸', '🦉', '🐙', '🦄', '🐳', '🦖', '🐝', '🌟', '👾'];
    var wrap = document.createElement('div');
    wrap.className = 'avatar-picker';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Pilih avatar');
    avatars.forEach(function (a) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'avatar-option';
      btn.textContent = a;
      btn.setAttribute('aria-label', 'Avatar ' + a);
      btn.setAttribute('aria-pressed', a === selected ? 'true' : 'false');
      btn.addEventListener('click', function () {
        Array.prototype.forEach.call(wrap.children, function (c) { c.setAttribute('aria-pressed', 'false'); });
        btn.setAttribute('aria-pressed', 'true');
        if (GH.audio) GH.audio.click();
        if (onPick) onPick(a);
      });
      wrap.appendChild(btn);
    });
    return wrap;
  };

  UI.pulseClass = function (el, className) {
    if (!el) return;
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
    setTimeout(function () { el.classList.remove(className); }, 600);
  };
})();
