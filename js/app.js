/* =========================================================
   Game Hub v2 · App bootstrap, hub, and global dialogs
   ========================================================= */
(function () {
  'use strict';
  var GH = window.GH = window.GH || {};
  var U = GH.util;
  var S = GH.store;
  var R = GH.router;
  var UI = GH.ui;
  var I = GH.identity;
  var PU = GH.profileUI;
  var NS = GH.nsLegacyData || GH.nsData;

  var GAMES = {
    multiply: {
      name: 'Perkalian 1–10', short: 'Perkalian', icon: '✕', href: 'multiply',
      stat: function () {
        var best = null;
        [10, 20, 30].forEach(function (n) {
          var row = S.bestScore('multiply:' + n);
          if (row && (!best || (row.timeMs != null && (best.timeMs == null || row.timeMs < best.timeMs)))) {
            best = row; best._count = n;
          }
        });
        return best ? best._count + ' soal · ' + U.formatMs(best.timeMs) : 'Belum dimainkan';
      }
    },
    knowledge: {
      name: 'Pengetahuan Dasar', short: 'Pengetahuan', icon: '?', href: 'knowledge',
      stat: function () {
        var row = S.bestScore('knowledge');
        return row ? U.formatNumber(row.score) + ' poin' : 'Belum dimainkan';
      }
    },
    advmath: {
      name: 'Perkalian Lanjutan', short: 'Perkalian+', icon: '∑', href: 'advmath',
      stat: function () {
        var best = null;
        [10, 20, 30].forEach(function (n) {
          var row = S.bestScore('advmath:' + n);
          if (row && (!best || (row.timeMs != null && (best.timeMs == null || row.timeMs < best.timeMs)))) {
            best = row; best._count = n;
          }
        });
        return best ? best._count + ' soal · ' + U.formatMs(best.timeMs) : 'Belum dimainkan';
      }
    },
    memo: {
      name: 'Memo Mayhem', short: 'Memo', icon: '✦', href: 'memo',
      stat: function () {
        var row = S.bestScore('memo');
        return row ? U.formatNumber(row.score) + ' poin' : 'Belum dimainkan';
      }
    },
    nusantara: {
      name: 'Nusantara Sirna', short: 'Nusantara', icon: '♜', href: 'nusantara',
      stat: function () {
        var row = S.bestScore('nusantara:solo');
        return row ? U.formatNumber(row.score) + ' poin' : 'Belum dimainkan';
      }
    }
  };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(v) { return U.esc(v); }
  function fmt(n) { return U.formatNumber(n); }

  /* ---------------- Hub ---------------- */
  function updateHeroStats() {
    var stats = $$('#heroStats dd');
    if (stats.length < 3) return;
    stats[0].textContent = fmt(S.getSessions());
    stats[1].textContent = S.gamesPlayed() + ' / 5';
    stats[2].textContent = S.streak() + ' hari';
  }

  function updateCards() {
    Object.keys(GAMES).forEach(function (id) {
      var el = $('[data-stat="' + id + '"]');
      if (el) el.textContent = GAMES[id].stat();
    });
  }

  function updateResume() {
    var btn = $('[data-resume]');
    var label = $('[data-resume-label]');
    if (!btn || !label) return;
    var last = S.lastGame();
    if (last && GAMES[last]) label.textContent = 'Lanjutkan ' + GAMES[last].short;
    else label.textContent = 'Mulai bermain';
  }

  var ACTIVITY_ICONS = { multiply: '✕', knowledge: '?', advmath: '∑', memo: '✦', nusantara: '♜' };

  function updateRecent() {
    var list = $('#recentList');
    if (!list) return;
    var rows = S.getActivity().slice(0, 6);
    if (!rows.length) {
      list.innerHTML = '<li class="empty-inline">Belum ada sesi. Pilih satu dunia di atas untuk mulai.</li>';
      return;
    }
    list.innerHTML = rows.map(function (item) {
      return '<li class="recent-item">' +
        '<span class="recent-item__icon" aria-hidden="true">' + (ACTIVITY_ICONS[item.game] || '✦') + '</span>' +
        '<span class="recent-item__body"><span class="recent-item__title">' + esc(item.label || 'Sesi') + '</span><span class="recent-item__meta">' + esc(item.value || '') + '</span></span>' +
        '<time class="recent-item__time" datetime="' + esc(item.date) + '">' + U.formatDateTime(item.date) + '</time>' +
      '</li>';
    }).join('');
  }

  function updateDaily() {
    var dateEl = $('#dailyDate');
    var seedEl = $('#dailySeed');
    var btn = $('[data-daily-memo]');
    var dateKey = U.dateKey();
    if (dateEl) dateEl.textContent = U.todayLong();
    if (seedEl) seedEl.textContent = 'memo-daily-' + dateKey;
    if (btn) {
      var daily = S.getDaily(dateKey);
      btn.innerHTML = daily ? 'Main lagi · skor ' + fmt(daily.score) + ' <span aria-hidden="true">→</span>' : 'Mainkan tantangan <span aria-hidden="true">→</span>';
    }
  }

  function updateHub() {
    updateHeroStats();
    updateCards();
    updateResume();
    updateRecent();
    updateDaily();
    applyIdentityUI();
  }

  /* ---------------- Identity-aware chrome ----------------
     Perubahan profil langsung tercermin di beranda dan game yang sedang
     terbuka. Tidak ada repaint/paint ulang, jadi timer dan ronde aman. */
  function applyIdentityUI(snap) {
    if (!snap) {
      snap = I && typeof I.getIdentity === 'function'
        ? I.getIdentity()
        : { registered: false, name: (S.getProfile() || {}).name || 'Pemain', avatar: (S.getProfile() || {}).avatar || '🦊' };
    }
    var registered = !!snap.registered;
    var name = snap.name || 'Pemain';
    var avatar = snap.avatar || '🦊';

    var avatarEl = $('#profileAvatar');
    if (avatarEl) avatarEl.textContent = avatar;
    var profileBtn = $('#profileButton');
    if (profileBtn) {
      profileBtn.title = registered ? 'Profil: ' + name : 'Buat profil pemain';
      profileBtn.setAttribute('aria-label', registered ? 'Profil pemain: ' + name : 'Buat profil pemain');
    }

    var guestBanner = $('[data-guest-banner]');
    if (guestBanner) guestBanner.hidden = registered;
    var registeredBanner = $('[data-registered-banner]');
    if (registeredBanner) registeredBanner.hidden = !registered;

    $$('[data-gh-identity-name]').forEach(function (el) { el.textContent = name; });
    $$('[data-gh-identity-avatar]').forEach(function (el) { el.textContent = avatar; });

    if (registered) {
      $$('[data-gh-guest-notice], [data-gh-create-profile]').forEach(function (el) {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
    }
  }

  function bindHub() {
    $$('.game-card[data-game]').forEach(function (card) {
      card.addEventListener('click', function () {
        var id = card.dataset.game;
        if (GAMES[id]) R.go(GAMES[id].href);
      });
    });
    $$('[data-filter]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var filter = btn.dataset.filter;
        $$('[data-filter]').forEach(function (b) {
          var on = b === btn;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        $$('.game-card[data-game]').forEach(function (card) {
          var show = filter === 'all' || card.dataset.category === filter;
          card.classList.toggle('is-filtered', !show);
        });
      });
    });
    var resume = $('[data-resume]');
    if (resume) resume.addEventListener('click', function () {
      var last = S.lastGame();
      if (last && GAMES[last]) R.go(GAMES[last].href);
      else {
        var grid = $('#gameGrid');
        if (grid) grid.scrollIntoView({ behavior: U.prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
      }
    });
    var daily = $('[data-daily-memo]');
    if (daily) daily.addEventListener('click', function () {
      if (GH.memo) GH.memo.startDaily();
      else R.go('memo');
    });
  }

  /* ---------------- Cloud status ---------------- */
  function cloudSnap() {
    return (GH.cloud && typeof GH.cloud.getStatus === 'function') ? GH.cloud.getStatus() : null;
  }

  function relativeTime(ts) {
    if (!ts) return 'belum diperiksa';
    var diff = Math.round((Date.now() - ts) / 1000);
    if (diff < 5) return 'baru saja';
    if (diff < 60) return diff + ' detik lalu';
    if (diff < 3600) return Math.round(diff / 60) + ' menit lalu';
    return U.formatDateTime(new Date(ts).toISOString());
  }

  var CLOUD_CHIP = {
    idle: 'Menyiapkan…',
    connecting: 'Menghubungkan…',
    online: 'Global aktif',
    degraded: 'Global terganggu',
    offline: 'Offline · lokal',
    disabled: 'Mode lokal',
    error: 'Global gagal'
  };

  var CLOUD_BANNER = {
    idle: {
      title: 'Penyimpanan Firestore: menunggu',
      desc: 'Koneksi Firebase akan diperiksa otomatis. Data pemain hanya tersimpan di Firestore.'
    },
    connecting: {
      title: 'Penyimpanan Firestore: menghubungkan…',
      desc: 'Sedang memuat Firebase dan memeriksa izin baca. Permainan bisa dimulai sekarang juga.'
    },
    online: {
      title: 'Penyimpanan Firestore aktif',
      desc: 'Profil, preferensi, riwayat, rekor solo, kemenangan duel online, room duel G1–G4, Memo, dan Nusantara tersimpan di Firestore.'
    },
    degraded: {
      title: 'Firestore belum terjangkau',
      desc: 'Data pemain belum bisa dikirim. Permainan tetap berjalan, tetapi perubahan hanya ada di memori tab ini.'
    },
    offline: {
      title: 'Perangkat sedang offline',
      desc: 'Kamu masih bisa bermain. Data belum bisa dikirim ke Firestore sampai internet kembali.'
    },
    disabled: {
      title: 'Firestore tidak tersedia',
      desc: 'Konfigurasi Firebase tidak ditemukan. Pendaftaran profil tidak bisa dilakukan; permainan tamu hanya berlangsung di memori tab.'
    },
    error: {
      title: 'Koneksi Firebase gagal',
      desc: 'Data pemain tidak tersimpan permanen. Buka detail untuk melihat penyebabnya.'
    }
  };

  function applyCloudStatus(snap) {
    snap = snap || cloudSnap();
    if (!snap) return;
    var phase = snap.phase || 'idle';
    var copy = CLOUD_BANNER[phase] || CLOUD_BANNER.idle;

    var chip = $('#cloudChip');
    if (chip) {
      chip.setAttribute('data-state', phase);
      var chipLabel = $('[data-cloud-label]', chip);
      if (chipLabel) chipLabel.textContent = CLOUD_CHIP[phase] || snap.label;
      chip.title = 'Status penyimpanan global: ' + (snap.label || phase);
      chip.setAttribute('aria-label', 'Status penyimpanan global: ' + (snap.label || phase) + '. Buka detail.');
    }

    var banner = $('[data-cloud-banner]');
    if (banner) {
      banner.setAttribute('data-state', phase);
      var title = $('[data-cloud-title]', banner);
      var desc = $('[data-cloud-desc]', banner);
      var meta = $('[data-cloud-meta]', banner);
      if (title) title.textContent = copy.title;
      if (desc) desc.textContent = copy.desc;
      if (meta) {
        var bits = ['Proyek ' + (snap.projectId || '—'), 'Firestore'];
        if (phase === 'online' && snap.latencyMs != null) bits.push(snap.latencyMs + ' ms');
        if (snap.auth === 'anonymous') bits.push('Auth anonim');
        bits.push('Diperiksa ' + relativeTime(snap.checkedAt));
        meta.textContent = bits.join(' · ');
      }
    }

    document.documentElement.setAttribute('data-cloud', phase);
  }

  function cloudStat(label, value, hint) {
    return '<div class="stat">' +
      '<span class="stat__label">' + esc(label) + '</span>' +
      '<div class="stat__value stat__value--sm">' + esc(value) + '</div>' +
      (hint ? '<p class="tiny muted">' + esc(hint) + '</p>' : '') +
    '</div>';
  }

  function openCloudStatus() {
    var body = document.createElement('div');
    body.className = 'cloud-status';

    function render() {
      var snap = cloudSnap();
      if (!snap) {
        body.innerHTML = '<div class="notice"><strong>Modul Firestore tidak dimuat.</strong> Data pemain tidak tersimpan permanen.</div>';
        return;
      }
      var phase = snap.phase || 'idle';
      var copy = CLOUD_BANNER[phase] || CLOUD_BANNER.idle;
      var storageLabel = phase === 'online' ? 'Firestore aktif' : 'Firestore tertunda';
      var authText = snap.authLabel || 'Belum dipakai';
      if (snap.uid) authText += ' · ' + snap.uid.slice(0, 8) + '…';
      var writes = snap.writes
        ? snap.writes + ' kiriman' + (snap.writeErrors ? ' · ' + snap.writeErrors + ' gagal' : '')
        : 'Belum ada';

      body.innerHTML =
        '<div class="cloud-hero" data-state="' + esc(phase) + '">' +
          '<span class="cloud-hero__dot" aria-hidden="true"></span>' +
          '<div class="cloud-hero__body">' +
            '<strong>' + esc(snap.label) + '</strong>' +
            '<p>' + esc(copy.desc) + '</p>' +
            (snap.detail ? '<p class="tiny muted">' + esc(snap.detail) + '</p>' : '') +
          '</div>' +
        '</div>' +
        '<div class="stat-grid">' +
          cloudStat('Penyimpanan data user', 'Firestore', 'user_data/{uid} · satu-satunya tempat') +
          cloudStat('Profil & rekor', storageLabel, snap.enabled ? 'Proyek ' + (snap.projectId || '—') : 'Firebase tidak dikonfigurasi') +
          cloudStat('Identitas pemain', authText, 'UID unik untuk profil dan papan Memo') +
          cloudStat('Latensi baca', snap.latencyMs != null ? snap.latencyMs + ' ms' : '—', 'Diperiksa ' + relativeTime(snap.checkedAt)) +
          cloudStat('Kiriman', writes, snap.lastWriteLabel ? 'Terakhir: ' + snap.lastWriteLabel : 'Belum ada kiriman') +
          cloudStat('SDK', snap.sdk || '—', 'Firebase JS compat') +
        '</div>' +
        '<div class="cloud-cols">' +
          '<section class="cloud-col"><h3>Data permanen</h3><ul class="cloud-list">' +
            '<li>Profil pemain (players/{uid})</li>' +
            '<li>Preferensi, riwayat sesi, streak, penanda harian, papan pribadi (user_data/{uid})</li>' +
            '<li>Statistik per game (players/{uid}/gameStats)</li>' +
            '<li>Rekor solo Perkalian 1–10, Pengetahuan Dasar, dan Perkalian Lanjutan</li>' +
            '<li>Kemenangan duel online G1–G3</li>' +
            '<li>Room duel online G1–G4 (progres sementara, kode 5 karakter)</li>' +
            '<li>Papan Memo semua mode + tantangan harian</li>' +
            '<li>Nama, PIN, skor, dan papan Nusantara Sirna</li>' +
          '</ul></section>' +
          '<section class="cloud-col"><h3>Hanya di memori tab</h3><ul class="cloud-list">' +
            '<li>Semua data pemain tamu (tidak disimpan sama sekali)</li>' +
            '<li>Status koneksi dan antrean tulisan sebelum terkirim</li>' +
            '<li>Keadaan sesi permainan yang sedang berjalan</li>' +
          '</ul></section>' +
        '</div>' +
        (snap.error || snap.authError
          ? '<div class="notice notice--warning"><strong>Catatan koneksi.</strong> ' + esc(snap.error || snap.authError) + '</div>'
          : '') +
        '<div class="cloud-foot">' +
          '<button class="btn btn--ghost btn--sm" type="button" data-cloud-refresh>Periksa ulang koneksi</button>' +
          '<p class="tiny muted">Firestore adalah satu-satunya tempat penyimpanan data user. Tidak ada iklan, Analytics, atau pelacakan pihak ketiga. Tidak ada penyimpanan lokal untuk profil, skor, riwayat, atau preferensi.</p>' +
        '</div>';
    }

    render();
    var unsub = null;
    UI.modal({
      title: 'Penyimpanan global',
      subtitle: 'Status koneksi Firebase Firestore',
      body: body,
      wide: true,
      onMount: function (modal) {
        modal.addEventListener('click', function (e) {
          var btn = e.target.closest ? e.target.closest('[data-cloud-refresh]') : null;
          if (!btn || !GH.cloud || btn.disabled) return;
          btn.disabled = true;
          btn.textContent = 'Memeriksa…';
          GH.cloud.refresh().then(function (ok) {
            render();
            UI.toast({
              type: ok ? 'success' : 'warning',
              title: ok ? 'Firestore tersambung' : 'Belum tersambung',
              msg: ok ? 'Skor baru akan dikirim ke papan global.' : 'Skor tetap aman di perangkat ini.',
              duration: 2600
            });
          });
        });
        if (GH.cloud) unsub = GH.cloud.onChange(function () { render(); });
      },
      actions: [{ label: 'Tutup', value: null, variant: 'primary' }]
    }).then(function () {
      if (unsub) unsub();
    });
  }

  /* ---------------- Shared modal helpers ---------------- */
  function boardValue(key, row) {
    var cfg = S.getBoardConfig(key);
    if (cfg.sort === 'time') return U.formatMs(row.timeMs);
    return '<strong>' + fmt(row.score) + '</strong>';
  }

  function cloudKeySupported(key) {
    return !!(GH.cloud && typeof GH.cloud.supportsBoard === 'function' && GH.cloud.supportsBoard(key));
  }

  function boardSub(row) {
    var label = row.meta && row.meta.label ? row.meta.label : '';
    if (row.global) return label || 'Papan global';
    return (label ? label + ' · ' : '') + U.formatDate(row.date);
  }

  function boardSection(key, limit) {
    var cfg = S.getBoardConfig(key);
    var rows = S.getBoard(key).slice(0, limit || 7);
    return '<section class="lb-block">' +
      '<div class="lb-block__head"><h3>' + esc(cfg.label) + '</h3><span class="badge">Lokal · ' + (cfg.sort === 'time' ? 'Waktu' : 'Skor') + '</span></div>' +
      UI.leaderboard(rows, {
        compact: true,
        empty: 'Belum ada skor untuk papan ini.',
        value: function (row) { return boardValue(key, row); },
        sub: boardSub
      }) +
      globalBoardBlock(key) +
    '</section>';
  }

  function globalBoardBlock(key) {
    if (!cloudKeySupported(key)) {
      return '<div class="lb-global lb-global--static">' +
        '<div class="lb-global__head"><span class="lb-global__tag">Global</span><span class="tiny muted">Tidak tersedia</span></div>' +
        '<p class="tiny muted lb-global__note">Papan ini hanya tersimpan di perangkat ini.</p>' +
      '</div>';
    }
    return '<div class="lb-global" data-global-board="' + esc(key) + '">' +
      '<div class="lb-global__head"><span class="lb-global__tag">Global</span><span class="tiny muted" data-global-meta>Firestore</span></div>' +
      '<div class="lb-global__body" data-global-body><div class="lb-global__state">Memuat papan global…</div></div>' +
    '</div>';
  }

  var LB_GROUPS = {
    multiply: { label: 'Perkalian', keys: ['multiply:10', 'multiply:20', 'multiply:30', 'multiply:duel'] },
    knowledge: { label: 'Pengetahuan', keys: ['knowledge', 'knowledge:duel'] },
    advmath: { label: 'Perkalian+', keys: ['advmath:10', 'advmath:20', 'advmath:30', 'advmath:duel'] },
    memo: { label: 'Memo', keys: ['memo', 'memo:daily'] },
    nusantara: { label: 'Nusantara', keys: ['nusantara:solo', 'nusantara:duel', 'nusantara:week'] }
  };

  var GLOBAL_CACHE = {};
  var GLOBAL_CACHE_MS = 60000;

  function showGlobalLoading(host, text) {
    var bodyHost = $('[data-global-body]', host);
    var meta = $('[data-global-meta]', host);
    if (meta) meta.textContent = 'Memuat…';
    if (bodyHost) bodyHost.innerHTML = '<div class="lb-global__state">' + esc(text || 'Memuat papan global…') + '</div>';
    host.setAttribute('data-state', 'loading');
  }

  function paintGlobal(host, key, res) {
    var bodyHost = $('[data-global-body]', host);
    var meta = $('[data-global-meta]', host);
    if (!bodyHost) return;
    var cfg = S.getBoardConfig(key);

    if (!res || !res.ok) {
      host.setAttribute('data-state', 'error');
      if (meta) meta.textContent = 'Tidak tersambung';
      bodyHost.innerHTML = '<div class="lb-global__state lb-global__state--warn">' +
        esc((res && res.error) || 'Papan global belum bisa dimuat.') +
        ' <button class="text-btn" type="button" data-global-retry>Coba lagi</button>' +
      '</div>';
      return;
    }

    host.setAttribute('data-state', 'online');
    if (meta) meta.textContent = res.rows.length ? res.rows.length + ' rekor · ' + relativeTime(Date.now()) : 'Kosong';

    if (!res.rows.length) {
      bodyHost.innerHTML = '<div class="lb-global__state">Belum ada skor global di papan ini. Skor pertamamu akan muncul di sini.</div>';
      return;
    }

    bodyHost.innerHTML = UI.leaderboard(res.rows, {
      compact: true,
      value: function (row) {
        if (cfg.sort === 'time') return U.formatMs(row.timeMs);
        return '<strong>' + fmt(row.score) + '</strong>';
      },
      sub: boardSub
    });
  }

  function loadGlobalBoards(body, token) {
    var ownToken = token;
    var snap = cloudSnap();
    $$('[data-global-board]', body).forEach(function (host) {
      var key = host.dataset.globalBoard;
      if (!key) return;
      if (!snap || snap.phase === 'disabled') {
        host.setAttribute('data-state', 'disabled');
        var meta = $('[data-global-meta]', host);
        if (meta) meta.textContent = 'Tidak aktif';
        var bodyHost = $('[data-global-body]', host);
        if (bodyHost) bodyHost.innerHTML = '<div class="lb-global__state">Penyimpanan global tidak aktif. Skor tetap tersimpan di perangkat ini.</div>';
        return;
      }
      var cached = GLOBAL_CACHE[key];
      if (cached && Date.now() - cached.at < GLOBAL_CACHE_MS) {
        paintGlobal(host, key, cached.res);
        return;
      }
      GH.cloud.fetchBoard(key).then(function (res) {
        GLOBAL_CACHE[key] = { res: res, at: Date.now() };
        if (ownToken !== modalToken) return;
        paintGlobal(host, key, res);
      });
    });
  }

  var modalToken = 0;

  function openLeaderboards(game) {
    var active = LB_GROUPS[game] ? game : 'multiply';
    var body = document.createElement('div');
    body.className = 'lb-modal';
    modalToken += 1;
    var ownToken = modalToken;

    function render() {
      modalToken += 1;
      ownToken = modalToken;
      body.innerHTML = '<div class="lb-tabs" role="tablist" aria-label="Pilih game">' +
        Object.keys(LB_GROUPS).map(function (id) {
          return '<button class="lb-tab' + (id === active ? ' is-active' : '') + '" type="button" role="tab" data-lb-game="' + id + '" aria-selected="' + (id === active) + '">' + GAMES[id].icon + ' ' + esc(LB_GROUPS[id].label) + '</button>';
        }).join('') + '</div>' +
        '<div class="lb-modal__body">' + LB_GROUPS[active].keys.map(function (key) { return boardSection(key, 7); }).join('') + '</div>' +
        '<p class="tiny muted lb-modal__note">' + (active === 'nusantara' && GH.cloud && typeof GH.cloud.nsWeekInfo === 'function'
          ? 'Papan mingguan Nusantara berganti setiap Senin 00:00 UTC. Berikutnya: ' + esc(new Date(GH.cloud.nsWeekInfo().nextAtMs).toLocaleString()) + '. '
          : '') +
        '“Lokal” adalah penyimpanan di perangkat ini. “Global” dimuat langsung dari Firestore saat terhubung; bila offline, hanya rekor lokal yang tampil.</p>';
      $$('[data-lb-game]', body).forEach(function (btn) {
        btn.addEventListener('click', function () {
          active = btn.dataset.lbGame;
          render();
        });
      });
      loadGlobalBoards(body, ownToken);
    }

    // Delegated retry: survives re-render of the modal body.
    body.addEventListener('click', function (e) {
      var retry = e.target.closest ? e.target.closest('[data-global-retry]') : null;
      if (!retry) return;
      var host = retry.closest('[data-global-board]');
      if (!host || !GH.cloud) return;
      var key = host.dataset.globalBoard;
      delete GLOBAL_CACHE[key];
      modalToken += 1;
      var retryToken = modalToken;
      showGlobalLoading(host, 'Memuat ulang papan global…');
      GH.cloud.fetchBoard(key).then(function (res) {
        GLOBAL_CACHE[key] = { res: res, at: Date.now() };
        if (retryToken !== modalToken || !host.isConnected) return;
        paintGlobal(host, key, res);
      });
    });

    render();

    var lastPhase = cloudSnap() ? cloudSnap().phase : '';
    var unsub = null;
    if (GH.cloud) {
      unsub = GH.cloud.onChange(function (snap) {
        if (snap.phase === lastPhase) return;
        lastPhase = snap.phase;
        if (!body.isConnected) return;
        loadGlobalBoards(body, ownToken);
      });
    }

    UI.modal({
      title: 'Papan skor',
      subtitle: 'Rekor lokal dan papan global Firestore',
      body: body,
      wide: true,
      actions: [{ label: 'Tutup', value: null, variant: 'ghost' }]
    }).then(function () {
      if (unsub) unsub();
    });
  }

  function openProfile() {
    if (PU && typeof PU.open === 'function') return PU.open({ mode: 'auto' });
    return Promise.resolve(false);
  }

  function openCreateProfile() {
    if (PU && typeof PU.open === 'function') return PU.open({ mode: 'create' });
    return Promise.resolve(false);
  }

  function applySettings() {
    var s = S.getSettings();
    document.documentElement.setAttribute('data-reduced-motion', s.reducedMotion ? 'true' : 'false');
    if (GH.audio) GH.audio.setEnabled(!!s.sound);
    UI.syncSoundButton();
  }

  function openSettings() {
    var body = document.createElement('div');
    body.className = 'settings-form';
    var s = S.getSettings();
    var cloud = cloudSnap();
    var cloudLine = cloud
      ? (cloud.phase === 'online'
          ? 'Terhubung ke Firestore ' + (cloud.projectId || '') + '. Semua data pemain tersimpan di cloud.'
          : cloud.label + '. Perubahan hanya tersedia di memori tab ini sampai Firestore pulih.')
      : 'Modul Firestore tidak dimuat.';
    body.innerHTML =
      '<div class="settings-row"><div><strong>Efek suara</strong><p>Nada sintetis untuk jawaban, tembakan, dan kemenangan.</p></div><button class="segmented__btn settings-toggle" type="button" data-set-sound aria-pressed="' + (s.sound ? 'true' : 'false') + '">' + (s.sound ? 'Aktif' : 'Mati') + '</button></div>' +
      '<div class="settings-row"><div><strong>Kurangi animasi</strong><p>Matikan gerak latar, transisi, dan animasi berulang.</p></div><button class="segmented__btn settings-toggle" type="button" data-set-motion aria-pressed="' + (s.reducedMotion ? 'true' : 'false') + '">' + (s.reducedMotion ? 'Aktif' : 'Mati') + '</button></div>' +
      '<div class="divider"></div>' +
      '<div class="settings-row"><div><strong>Penyimpanan global</strong><p>' + esc(cloudLine) + '</p></div><button class="btn btn--ghost btn--sm" type="button" data-open="cloud-status">Detail</button></div>' +
      '<div class="settings-row"><div><strong>Reset data pemain</strong><p>Hapus data user di Firestore, lalu akhiri sesi profil.</p></div><button class="btn btn--danger btn--sm" type="button" data-reset-data>Reset</button></div>' +
      '<p class="tiny muted">Semua data pemain tersimpan di Firestore. Reset menghapus data UID ini dan keluar dari profil. Data tamu hanya berada di tab ini.</p>';
    UI.modal({
      title: 'Setelan',
      subtitle: 'Suara, gerak, dan penyimpanan',
      body: body,
      narrow: false,
      onMount: function (modal) {
        var sound = $('[data-set-sound]', modal);
        var motion = $('[data-set-motion]', modal);
        if (sound) sound.addEventListener('click', function () {
          var on = !S.getSettings().sound;
          S.setSetting('sound', on);
          if (GH.audio) GH.audio.setEnabled(on);
          sound.setAttribute('aria-pressed', on ? 'true' : 'false');
          sound.textContent = on ? 'Aktif' : 'Mati';
          UI.syncSoundButton();
        });
        if (motion) motion.addEventListener('click', function () {
          var on = !S.getSettings().reducedMotion;
          S.setSetting('reducedMotion', on);
          applySettings();
          motion.setAttribute('aria-pressed', on ? 'true' : 'false');
          motion.textContent = on ? 'Aktif' : 'Mati';
        });
        var reset = $('[data-reset-data]', modal);
        if (reset) reset.addEventListener('click', function () {
          UI.confirm({
            title: 'Reset semua data?',
            body: 'Data pemain di Firestore (profil, papan skor, riwayat sesi, preferensi, dan identitas game) akan dihapus. Tindakan tidak bisa dibatalkan.',
            confirmLabel: 'Ya, hapus semua',
            cancelLabel: 'Batal',
            danger: true
          }).then(function (ok) {
            if (!ok) return;
            var clearing = I && typeof I.resetLocal === 'function' ? I.resetLocal() : Promise.resolve(S.resetAll());
            clearing.then(function () {
              window.location.hash = '#/';
              window.location.reload();
            });
          });
        });
      },
      actions: [{ label: 'Selesai', value: null, variant: 'primary' }]
    });
  }

  function openLontar() {
    var live = GH.nusantara;
    var terms = (live && live.terms && live.terms.length) ? live.terms : (NS ? NS.terms : []);
    var chapters = (live && live.lontar && live.lontar.length) ? live.lontar : (NS ? NS.lontar : []);
    var body = document.createElement('div');
    body.className = 'lontar';
    body.innerHTML =
      '<div class="notice"><strong>Penyimpanan.</strong> Firestore adalah satu-satunya tempat data user: profil di <code>players/{uid}</code>, preferensi dan riwayat di <code>user_data/{uid}</code>, rekor solo, kemenangan duel online, room G1–G4, Memo, serta nama dan skor Nusantara (papan mingguan berganti Senin 00:00 UTC) di proyek <code>multgame-9f7e6</code>. Tidak ada localStorage/sessionStorage. Data tamu hanya ada di memori tab ini.</div>' +
      '<div class="lontar-grid">' +
        '<section class="lontar-block"><h3>Kuis · G1–G3</h3><ul>' +
          '<li>Perkalian dan Perkalian Lanjutan: 10/20/30 soal, waktu per soal, keypad, dan hint berbayar.</li>' +
          '<li>Jawaban salah menambah penalti waktu; hint menambah penalti dan menandai soal terkunci.</li>' +
          '<li>Pengetahuan Dasar: ronde 60 detik. Benar +10, salah −10 dan soal terkunci; streak memberi bonus.</li>' +
          '<li>Duel online: dua perangkat cukup dengan kode room; kedua pemain balapan bersamaan dengan soal identik. Wajib profil terdaftar.</li>' +
        '</ul></section>' +
        '<section class="lontar-block"><h3>Memo Mayhem · G4</h3><ul>' +
          '<li>Enam mode: Snapshot, Sequence, Glitch, Copycat, Echo, dan Mind Trap.</li>' +
          '<li>Empat tingkat kesulitan dan lima modifier. Tantangan harian memakai seed tanggal.</li>' +
          '<li>Skor = 100 × kesulitan × combo + bonus kecepatan + tanpa hint + sempurna − hint − kesalahan.</li>' +
        '</ul></section>' +
        '<section class="lontar-block lontar-block--wide"><h3>Nusantara Sirna · G5</h3>' +
          '<p class="small muted">Pilih Senapati, beli Titisan, susun Warisan, lalu bertahan melawan Sunyi. Semua istilah di bawah mengikuti Lontar Sangkala.</p>' +
          '<ol class="lontar-nums">' + chapters.map(function (ch) {
            return '<li><strong>' + esc(ch.title) + '</strong><span>' + esc(ch.body) + '</span></li>';
          }).join('') + '</ol>' +
        '</section>' +
        '<section class="lontar-block lontar-block--wide"><h3>Istilah Nusantara</h3><div class="terms-grid">' +
          terms.map(function (t) {
            return '<div class="term"><strong>' + esc(t.term) + '</strong><span class="term__old">' + esc(t.old) + '</span><p>' + esc(t.desc) + '</p></div>';
          }).join('') + '</div></section>' +
        '<section class="lontar-block"><h3>Kontrol</h3><ul>' +
          '<li>Semua tombol dapat dijangkau keyboard dengan indikator fokus yang terlihat.</li>' +
          '<li>Ketuk Titisan di bangku, lalu ketuk petak unit untuk menempatkan.</li>' +
          '<li>Tombol Siap mempercepat akhir fase persiapan. Fase berjalan otomatis pada waktunya.</li>' +
        '</ul></section>' +
        '<section class="lontar-block"><h3>Aksesibilitas</h3><ul>' +
          '<li>Target sentuh utama minimal 44 px. Sasana dapat digeser mendatar pada layar sangat sempit.</li>' +
          '<li>Setelan “Kurangi animasi” mematikan animasi latar dan transisi.</li>' +
          '<li>Warna bukan satu-satunya penanda: status memakai teks, ikon, dan label.</li>' +
        '</ul></section>' +
      '</div>';
    UI.modal({
      title: 'Lontar Sangkala',
      subtitle: 'Panduan lengkap lima dunia',
      body: body,
      wide: true,
      actions: [{ label: 'Tutup', value: null, variant: 'ghost' }]
    });
  }

  function openAbout() {
    UI.modal({
      title: 'Tentang Game Hub',
      subtitle: 'Rebuild v2.0 · Bahasa Indonesia',
      body: '<div class="about-copy">' +
        '<p>Game Hub adalah ruang main privat berisi lima game: tiga kuis edukasi, satu game memori kosmik, dan satu auto-battler Nusantara. Tampilan dirancang ulang untuk layar 320–1280 px, tanpa iklan, tanpa pembelian, dan tanpa mekanik pay-to-win.</p>' +
        '<p>Build ini adalah implementasi statis tanpa langkah build: HTML, CSS, dan JavaScript biasa dengan jalur relatif. Game 1–3 memakai bank soal lokal yang dihasilkan untuk 2.000 soal per bank; Game 5 memakai data aturan yang disusun ulang dari PRD.</p>' +
        '<div class="notice"><strong>Penyimpanan.</strong> Satu profil terdaftar dipakai di seluruh game dengan UID Firebase yang sama. Firestore adalah satu-satunya penyimpanan data user: profil, preferensi, riwayat, statistik game, rekor solo, kemenangan duel online, papan Memo, dan data Nusantara di proyek <code>multgame-9f7e6</code>. Pemain tamu tidak menghasilkan rekor permanen.</div>' +
        '<p>Duel G1–G4 dimainkan online dengan satu kode room (dua perangkat, balapan langsung; kedua pemain wajib memakai profil terdaftar). Nusantara Sirna tersedia dalam mode solo.</p>' +
        '<p class="tiny muted">Tanpa iklan dan tanpa Firebase Analytics. Untuk menghapus data pemain di Firestore, buka Setelan → Reset data pemain.</p>' +
      '</div>',
      wide: false,
      actions: [{ label: 'Tutup', value: null, variant: 'ghost' }]
    });
  }

  // Nama lama dipertahankan agar tombol Nusantara tetap berfungsi.
  function openLocalMode() { openCloudStatus(); }

  /* ---------------- Global events ---------------- */
  function bindGlobal() {
    var soundBtn = $('#soundToggle');
    if (soundBtn) soundBtn.addEventListener('click', UI.toggleSound);
    var profileBtn = $('#profileButton');
    if (profileBtn) profileBtn.addEventListener('click', openProfile);

    // Intercept hash links so the History router stays authoritative.
    document.addEventListener('click', function (e) {
      var link = e.target.closest ? e.target.closest('a[href^="#/"]') : null;
      if (!link) return;
      e.preventDefault();
      var route = link.getAttribute('href').replace(/^#\/?/, '') || 'hub';
      if (route === 'hub') R.go('hub');
      else R.go(route.split('?')[0]);
    });

    // Global dialog trigger. Captured before game-local bindings so that
    // settings/leaderboard buttons open exactly one dialog.
    document.addEventListener('click', function (e) {
      var trigger = e.target.closest ? e.target.closest('[data-open]') : null;
      if (!trigger) return;
      e.preventDefault();
      e.stopPropagation();
      var key = trigger.dataset.open;
      if (key === 'leaderboards') openLeaderboards(trigger.dataset.game || currentGame());
      else if (key === 'settings') openSettings();
      else if (key === 'lontar') openLontar();
      else if (key === 'about') openAbout();
      else if (key === 'local-mode') openLocalMode();
      else if (key === 'cloud-status') openCloudStatus();
      else if (key === 'profile') openProfile();
      else if (key === 'create-profile') openCreateProfile();
    }, true);

    // Keyboard shortcut: Escape closes the top dialog (modal handles it too).
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') UI.closeTopModal();
    });

    // First interaction unlocks WebAudio on iOS.
    document.addEventListener('pointerdown', function once() {
      if (GH.audio) GH.audio.unlock();
      document.removeEventListener('pointerdown', once);
    });
  }

  function currentGame() {
    var route = R.current().route;
    return LB_GROUPS[route] ? route : 'multiply';
  }

  /* ---------------- Boot ---------------- */
  function boot() {
    if (GH.audio) GH.audio.setEnabled(S.getSettings().sound);
    applySettings();
    UI.initStarfield($('#starfield'));

    if (GH.quiz) GH.quiz.init();
    if (GH.memo) GH.memo.init();
    if (GH.nusantara) GH.nusantara.init();

    R.register('hub', {
      title: '',
      render: function () { updateHub(); }
    });

    bindHub();
    bindGlobal();
    updateHub();

    applyIdentityUI();

    // Identitas terpusat: perubahan langsung disebarkan ke seluruh game.
    // Data user di Firestore dibaca ulang begitu UID profil tersedia.
    var hydratedUid = null;
    function hydrateIdentity(snap) {
      if (!snap || !snap.registered || !snap.uid) {
        hydratedUid = null;
        return;
      }
      if (hydratedUid === snap.uid) return;
      hydratedUid = snap.uid;
      if (S.hydrate) S.hydrate().then(function () { updateHub(); });
    }
    if (I && typeof I.onChange === 'function') I.onChange(function (snap) {
      applyIdentityUI(snap);
      hydrateIdentity(snap);
    });
    if (I && typeof I.init === 'function') {
      I.init().then(function (snap) {
        applyIdentityUI(snap);
        hydrateIdentity(snap);
        if (I.consumeLegacyPrompt && I.consumeLegacyPrompt() && PU && typeof PU.open === 'function') {
          PU.open({ mode: 'activate' });
        }
      });
    }

    // Status penyimpanan global: chip + banner diperbarui langsung.
    if (GH.cloud) {
      GH.cloud.onChange(applyCloudStatus);
      applyCloudStatus(GH.cloud.getStatus());
      GH.cloud.start().then(function () { applyCloudStatus(GH.cloud.getStatus()); });
    } else {
      applyCloudStatus({ phase: 'disabled', label: 'Mode lokal', enabled: false, projectId: '', authLabel: '', sdk: '', writes: 0, writeErrors: 0 });
    }

    R.start();
  }

  GH.app = {
    openSettings: openSettings,
    openLeaderboards: openLeaderboards,
    openProfile: openProfile,
    openCreateProfile: openCreateProfile,
    refreshIdentityUI: applyIdentityUI,
    openLontar: openLontar,
    openAbout: openAbout,
    openLocalMode: openLocalMode,
    refreshHub: updateHub,
    games: GAMES
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
