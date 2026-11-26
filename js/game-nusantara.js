/* =========================================================
   Game Hub v2 · Nusantara Sirna (G5)
   Auto-battler + lane defense. Semua aturan berasal dari
   js/data/nusantara-data.js; modul ini hanya mesin + tampilan.
   ========================================================= */
(function () {
  'use strict';
  var GH = window.GH = window.GH || {};
  var U = GH.util;
  var S = GH.store;
  var R = GH.router;
  var UI = GH.ui;
  // NS akhirnya adalah view ZIP yang dibangun GH.nsView.load(); legacy hanya placeholder
  // sampai data ZIP selesai divalidasi. Semua angka/aturan dibaca dari view itu.
  var NS = GH.nsLegacyData || null;
  var ECON = {};
  var PREP_SECONDS = 30;
  var TICK_MS = 360;
  var viewReady = false;
  var viewError = null;

  function Core() { return (GH.ns && GH.ns.Core) || GH.nsCore || null; }
  function Battle() { return (GH.ns && GH.ns.Battle) || GH.nsBattle || null; }
  function Synergy() { return (GH.ns && GH.ns.Synergy) || GH.nsSynergy || null; }
  function Match() { return GH.nsMatch || (GH.ns && GH.ns.Match) || null; }
  function zipData() { return (NS && NS.data) || null; }

  var api = null;
  var viewPromise = null;

  function hasId(list, id) {
    return (list || []).some(function (row) { return row && row.id === id; });
  }

  function viewStatusHtml() {
    if (viewReady) return '';
    if (viewError) {
      return '<div class="notice notice--warning"><strong>Data Nusantara belum siap.</strong> ' + esc(viewError) +
        ' <button class="text-btn" type="button" data-ns-view-retry>Coba lagi</button></div>';
    }
    return '<div class="notice"><strong>Memuat aturan Nusantara…</strong> Menunggu validasi data resmi ZIP.</div>';
  }

  function applyView(view) {
    NS = view;
    ECON = view.econ || {};
    viewReady = true;
    viewError = null;
    var prefs = S.getNusantaraPrefs() || {};
    if (!hasId(view.senapati, state.setup.senapati)) {
      state.setup.senapati = hasId(view.senapati, prefs.lastSenapati)
        ? prefs.lastSenapati
        : ((view.senapati || [])[0] || {}).id;
    }
    if (!hasId(view.arenas, state.setup.arena)) {
      state.setup.arena = hasId(view.arenas, prefs.lastArena)
        ? prefs.lastArena
        : ((view.arenas || [])[0] || {}).id;
    }
    if (api) {
      api.view = view;
      api.terms = view.terms || [];
      api.lontar = view.lontar || [];
    }
  }

  function loadView(force) {
    if (!GH.nsView || typeof GH.nsView.load !== 'function') {
      viewReady = false;
      viewError = 'Modul GH.nsView tidak ditemukan.';
      paint();
      return Promise.resolve(false);
    }
    viewReady = false;
    viewError = null;
    paint();
    viewPromise = Promise.resolve(GH.nsView.load(!!force)).then(function (res) {
      if (!res || !res.ok || !res.view) {
        viewReady = false;
        viewError = ((res && res.errors) || []).join(' ') || 'Data Nusantara gagal dimuat.';
        paint();
        return false;
      }
      applyView(res.view);
      paint();
      return true;
    }, function (err) {
      viewReady = false;
      viewError = (err && err.message) || 'Data Nusantara gagal dimuat.';
      paint();
      return false;
    });
    return viewPromise;
  }

  var state = {
    screen: 'lobby',
    mode: 'solo',
    setup: { senapati: 'sen', arena: 'wirasana' },
    run: null,
    result: null,
    rewardReturn: null,
    cloudToken: 0,
    nsIdentity: { checked: false, proof: null, player: null, message: '' },
    nsGlobal: { solo: null, week: null, loaded: false }
  };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(v) { return U.esc(v); }
  function fmt(n) { return U.formatNumber(n); }
  function player() { return S.getProfile(); }

  /* Identitas cloud: aturan main tetap dari modul ZIP, jembatan memakai UID rebuild. */
  var GUEST_NOTICE = "You're currently playing as a guest. Create a player profile to save your progress, scores, and achievements across all games.";
  var NS_BOARD_KEYS = ['nusantara:solo', 'nusantara:week'];

  function hashText(text) {
    var h = 2166136261;
    var s = String(text || '');
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h.toString(36);
  }

  function currentUid() {
    var I = GH.identity;
    if (!I || typeof I.isRegistered !== 'function' || !I.isRegistered()) return null;
    return typeof I.getUid === 'function' ? I.getUid() : null;
  }

  /** Skor final dari aturan ZIP (GH.nsMatch.score), bukan dari angka di host. */
  function nsScoreFor(mode, rounds, hp, name, other, won) {
    var C = GH.cloud;
    if (mode === 'solo' && C && typeof C.nsSoloScore === 'function') {
      var solo = C.nsSoloScore(rounds, hp, name);
      if (solo != null) return solo;
    }
    var Match = GH.nsMatch || (GH.ns && GH.ns.Match);
    if (!Match || typeof Match.score !== 'function') return null;
    var key = Match.keyOf ? Match.keyOf(name) : String(name || '').trim().toLowerCase();
    var otherKey = Match.keyOf ? Match.keyOf(other || 'Lawan') : String(other || 'Lawan').trim().toLowerCase();
    if (otherKey === key) otherKey = key + '~';
    var M = {
      mode: mode,
      lastRound: rounds,
      ended: true,
      phase: 'over',
      order: [key, otherKey],
      players: {},
      winners: won == null ? [] : [won ? key : otherKey],
      reason: 'LOCAL'
    };
    M.players[key] = { name: name, state: 'alive', hp: hp, lastRound: rounds, outRound: null };
    M.players[otherKey] = { name: other || 'Lawan', state: 'alive', hp: 0, lastRound: rounds, outRound: null };
    var value = Match.score(M, name);
    return value == null ? null : value;
  }

  function submitNsScore(payload, done) {
    var C = GH.cloud;
    if (!C || typeof C.nsRecordScore !== 'function') {
      done({ ok: false, skipped: true, reason: 'Layanan cloud tidak tersedia.' });
      return;
    }
    Promise.resolve(C.nsRecordScore(payload)).then(done, function (err) {
      done({ ok: false, reason: (err && err.message) || 'Gagal menyimpan skor.' });
    });
  }

  function cloudStatusHtml(status) {
    if (!status) return '';
    if (status.status === 'pending') return '<div class="notice ns-cloud-notice" data-ns-cloud>Menyimpan skor ke profil global…</div>';
    if (status.status === 'saved') return '<div class="notice notice--success ns-cloud-notice" data-ns-cloud>Skor tersimpan ke profil global' + (status.rank ? ' · peringkat #' + status.rank : '') + '.</div>';
    if (status.status === 'skipped') return '<div class="notice ns-cloud-notice" data-ns-cloud>' + esc(status.reason || 'Skor tidak disimpan ke cloud.') + '</div>';
    if (status.status === 'error') return '<div class="notice notice--warning ns-cloud-notice" data-ns-cloud>Gagal menyimpan ke cloud: ' + esc(status.reason || '') + '. Skor lokal tetap tersimpan.</div>';
    return '';
  }

  function loadNsGlobal(force) {
    var C = GH.cloud;
    if (!C || typeof C.fetchBoard !== 'function') return;
    if (state.nsGlobal.loaded && !force) return;
    state.nsGlobal.loaded = true;
    NS_BOARD_KEYS.forEach(function (key) {
      Promise.resolve(C.fetchBoard(key)).then(function (res) {
        if (!res || !res.ok) return;
        state.nsGlobal[key.split(':')[1]] = res;
        if (state.screen === 'lobby' || state.screen === 'result') paint();
      });
    });
  }

  function nsGlobalHtml(key, label) {
    var res = state.nsGlobal[key];
    if (!res || !res.ok || !res.rows || !res.rows.length) return '';
    return '<div class="ns-global-row"><span class="eyebrow">' + esc(label) + '</span>' +
      res.rows.slice(0, 3).map(function (row, i) {
        return '<span><strong>#' + (i + 1) + '</strong> ' + esc(row.name) + ' · ' + fmt(row.score) + '</span>';
      }).join('') + '</div>';
  }

  function refreshNsIdentity() {
    var C = GH.cloud;
    if (!C || typeof C.nsGetProof !== 'function') {
      state.nsIdentity.checked = true;
      return Promise.resolve(null);
    }
    return Promise.resolve(C.nsGetProof()).then(function (res) {
      state.nsIdentity.checked = true;
      state.nsIdentity.proof = res && res.ok ? res.proof : null;
      state.nsIdentity.player = res && res.ok ? res.player : null;
      if (state.screen === 'lobby') paint();
      return res;
    });
  }

  function setNsIdMessage(host, text) {
    var msg = $('[data-ns-id-msg]', host);
    if (!msg) {
      var body = $('[data-ns-identity] .panel__body', host);
      if (!body) return;
      msg = document.createElement('p');
      msg.className = 'tiny ns-id-msg';
      msg.setAttribute('data-ns-id-msg', '');
      body.appendChild(msg);
    }
    msg.textContent = text;
  }

  function senapatiById(id) {
    var list = (NS && NS.senapati) || [];
    return list.filter(function (s) { return s.id === id; })[0] || list[0] || null;
  }
  function arenaById(id) {
    var list = (NS && NS.arenas) || [];
    return list.filter(function (a) { return a.id === id; })[0] || list[0] || null;
  }
  function charById(id) {
    var list = (NS && NS.characters) || [];
    return list.filter(function (c) { return c.id === id; })[0] || null;
  }
  function arenaZipId(arena) {
    return arena && (arena.zipId || arena.id);
  }
  /** Status sinergi dihitung modul ZIP GH.ns.Synergy, bukan hitungan manual host. */
  function activeWarisan(run) {
    var synergyMod = Synergy();
    if (!run || !synergyMod || !zipData()) return [];
    var board = run.units.map(function (u) { return { id: u.charId }; });
    var bench = run.bench.map(function (u) { return { id: u.charId }; });
    return synergyMod.visible(synergyMod.compute(zipData(), board, bench)).map(function (s) {
      var w = (NS && NS.warisan && NS.warisan[s.id]) || {};
      var thresholds = s.thresholds || [];
      return {
        id: s.id, name: s.name, type: s.kind, icon: w.icon || '✦', color: w.color || 'var(--g5)',
        count: s.count, next: s.next, missing: s.missing, state: s.state, tier: s.tier,
        threshold: s.next || thresholds[thresholds.length - 1] || 0,
        desc: w.desc || (s.effectsText || []).join(' · '), mods: w.mods || {}
      };
    });
  }

  /** Efek ekonomi/global untuk HUD dihitung modul ZIP GH.ns.Synergy dari state Core. */
  function computeMods(run) {
    var mods = { gold: 0, interestCap: 0, unitCap: 0, shopSlot: 0, commanderHeal: 0 };
    var core = Core(), synergyMod = Synergy(), data = zipData();
    if (!run || !run.core || !core || !synergyMod || !data) return mods;
    var fx = synergyMod.fxCompile(data, run.core) || {};
    mods.gold = (fx.eco && fx.eco.gold) || 0;
    mods.interestCap = (fx.eco && fx.eco.interestCap) || 0;
    if (fx.sen && fx.sen.kind === 'shopSlot') mods.shopSlot = fx.sen.value || 0;
    var global = synergyMod.pusakaSum(core.index(data), run.core) || {};
    mods.unitCap = global.unitLimit || 0;
    mods.commanderHeal = global.hpPlus || 0;
    return mods;
  }

  function unitStats(run, unit) {
    var c = charById(unit.charId) || { name: unit.charId, icon: '◇', color: 'var(--g5)', range: 1, manaStart: 0, skill: {} };
    var core = Core(), data = zipData();
    var raw = core && data
      ? core.unitStats(core.index(data), { id: unit.charId, star: unit.star })
      : { hp: c.hp || 1, atk: c.atk || 1, range: c.range || 1, armor: 0, attackSpeed: 0.7 };
    var shield = 0, crit = 0, asPct = 0;
    (unit.relicIds || []).forEach(function (rid) {
      var relic = ((NS && NS.pusaka) || []).filter(function (p) { return p.id === rid; })[0];
      var fx = relic && relic.fx ? relic.fx : {};
      shield += (fx.shield || 0) * raw.hp;
      crit += fx.crit || 0;
      asPct += fx.as || 0;
    });
    return {
      char: c,
      star: unit.star,
      maxHp: raw.hp,
      atk: raw.atk,
      range: raw.range,
      skillPct: 0,
      crit: U.clamp(crit, 0, 0.85),
      asPct: asPct,
      dodge: 0,
      armor: 0,
      shield: Math.round(shield),
      interval: Math.max(0.4, Math.round(1 / (raw.attackSpeed || 0.7) * 10) / 10),
      startMana: c.manaStart || 0,
      manaRegen: 0,
      regen: 0
    };
  }

  function recomputeRun(run) {
    if (!run) return;
    run.mods = computeMods(run);
    run.units.forEach(function (u) { u.stats = unitStats(run, u); });
    run.bench.forEach(function (u) { u.stats = unitStats(run, u); });
  }

  function unitCount(run) { return run ? run.units.length : 0; }
  function unitCap(run) {
    var core = Core(), data = zipData();
    if (!run || !run.core || !core || !data) return ECON.maxLevel || 9;
    return core.unitLimit(core.index(data), run.core);
  }

  function xpInfo(run) {
    var levels = (ECON && ECON.levels) || [];
    var level = Math.max(1, Math.min(levels.length || 9, run ? run.level : 1));
    var need = levels[level - 1] ? levels[level - 1].xpToNext : 0;
    return { level: level, need: need, xp: run ? run.xp : 0, max: level >= ((ECON && ECON.maxLevel) || 9) };
  }
  function xpToNext(run) {
    var info = xpInfo(run);
    return info.max ? 0 : Math.max(0, info.need - info.xp);
  }

  function relicIdsFor(S, uid) {
    var out = [];
    Object.keys((S && S.equip) || {}).forEach(function (rid) {
      if (S.equip[rid] === uid) out.push(rid);
    });
    return out;
  }

  function hostUnit(run, unit, tile, slot) {
    var prev = (run.transient || {})[unit.uid] || {};
    return {
      uid: unit.uid,
      charId: unit.id,
      star: unit.star,
      tile: tile || null,
      slot: typeof slot === 'number' ? slot : null,
      relicIds: relicIdsFor(run.core, unit.uid),
      hp: prev.hp == null ? null : prev.hp,
      maxHp: prev.maxHp == null ? null : prev.maxHp,
      mana: prev.mana || 0,
      shield: prev.shield || 0,
      alive: prev.alive !== false,
      cooldown: 0,
      buffAtk: 0
    };
  }

  /** Samakan run host dengan state Core ZIP: emas, XP, toko, bangku, papan, dan Pusaka. */
  function syncFromCore(run) {
    var core = Core(), data = zipData();
    if (!run || !run.core || !core || !data) return;
    var S = run.core;
    run.round = S.round;
    run.hp = S.hp;
    run.maxHp = S.maxHp;
    run.gold = S.gold;
    run.xp = S.xp;
    run.level = S.level;
    run.shop = S.shop.slice();
    run.relics = S.pusaka.slice();
    run.roundWins = S.roundsWon;
    run.streak = Math.max(S.winStreak || 0, S.loseStreak || 0);
    if (S.phase === 'over') run.phase = 'done';
    else if (run.phase !== 'battle' && run.phase !== 'clear' && run.phase !== 'reward') run.phase = S.phase;
    run.bench = [];
    S.bench.forEach(function (u, i) { if (u) run.bench.push(hostUnit(run, u, null, i)); });
    run.units = [];
    core.boardKeys(S).forEach(function (key) {
      var parts = key.split(',').map(Number);
      run.units.push(hostUnit(run, S.board[key], { x: parts[1] - 1, y: parts[0] - 1 }));
    });
    recomputeRun(run);
  }

  function coreLocation(run, uid) {
    var core = Core();
    if (!run || !run.core || !core) return null;
    var keys = core.boardKeys(run.core);
    for (var i = 0; i < keys.length; i++) {
      var parts = keys[i].split(',').map(Number);
      var u = run.core.board[keys[i]];
      if (u && u.uid === uid) return { w: 'board', r: parts[0], c: parts[1] };
    }
    for (var b = 0; b < run.core.bench.length; b++) {
      if (run.core.bench[b] && run.core.bench[b].uid === uid) return { w: 'bench', i: b };
    }
    if (run.core.pending && run.core.pending.uid === uid) return { w: 'pending' };
    return null;
  }

  function createRun(opts) {
    opts = opts || {};
    var core = Core(), data = zipData();
    var arena = arenaById(opts.arena || state.setup.arena);
    var sen = senapatiById(opts.senapati || state.setup.senapati);
    if (!core || !data || !arena || !sen) return null;
    var seedText = opts.seed || ('ns-' + U.uid('run'));
    var rngMod = GH.ns && GH.ns.rng;
    var numericSeed = rngMod && rngMod.mix ? rngMod.mix([seedText]) : hashText(seedText);
    var S = core.create(data, {
      seed: numericSeed,
      arenaId: arenaZipId(arena),
      senapatiId: sen.id,
      players: 1,
      autoUpgrade: true
    });
    var run = {
      mode: opts.mode || 'solo',
      seed: seedText,
      core: S,
      matchId: opts.matchId || ('ns-' + hashText([seedText, opts.mode || 'solo', opts.playerName || '', currentUid() || 'guest'].join('|'))),
      arena: arena,
      senapati: sen,
      playerName: opts.playerName || 'Pemain',
      playerAvatar: opts.playerAvatar || '🦉',
      round: S.round,
      hp: S.hp,
      maxHp: S.maxHp,
      gold: S.gold,
      level: S.level,
      xp: S.xp,
      roundWins: 0,
      streak: 0,
      units: [],
      bench: [],
      relics: [],
      shop: [],
      phase: 'prep',
      timer: PREP_SECONDS,
      timerId: null,
      tickId: null,
      battle: null,
      battleEngine: null,
      transient: {},
      log: [],
      roundsCleared: 0,
      totalLeaks: 0,
      defeated: false,
      selected: null,
      rewardChoices: [],
      rewardOpen: false,
      paused: false,
      startedAt: Date.now(),
      roundsAtStart: 0
    };
    syncFromCore(run);
    addLog(run, 'Pupuh 1 dimulai. Pilih Tawaran di Toko.');
    return run;
  }

  function addLog(run, text) {
    run.log.unshift({ text: text });
    run.log = run.log.slice(0, 6);
  }

  /* ---------------- Lobby ---------------- */
  function bestFor(key) { return S.bestScore(key); }

  function senapatiCard(s, selected) {
    var origin = NS.origins[s.origin];
    return '<button class="ns-pick' + (selected ? ' is-selected' : '') + '" type="button" data-senapati="' + s.id + '" aria-pressed="' + (selected ? 'true' : 'false') + '">' +
      '<span class="ns-pick__icon" style="--pick:' + s.color + '">' + s.icon + '</span>' +
      '<span class="ns-pick__body"><strong>' + esc(s.name) + '</strong><small>' + esc(s.title) + '</small><span>' + esc(s.passive) + '</span></span>' +
      '<span class="ns-pick__origin" style="--pick:' + (origin ? origin.color : s.color) + '">' + (origin ? origin.icon + ' ' + origin.name : '') + '</span>' +
    '</button>';
  }

  function nsIdentityHtml() {
    var id = state.nsIdentity;
    var body;
    if (!currentUid()) {
      body = '<p class="tiny muted">' + esc(GUEST_NOTICE) + '</p>';
    } else if (id.proof) {
      body = '<p class="ns-id-name"><span class="badge badge--theme">' + esc(id.proof.name) + '</span>' +
        '<span class="tiny muted">' + fmt((id.player && id.player.tot && id.player.tot.score) || 0) + ' poin</span></p>' +
        '<button class="btn btn--ghost btn--block btn--sm" type="button" data-ns-id-action="clear">Keluar dari nama Nusantara</button>';
    } else {
      body = '<div class="ns-id-fields">' +
          '<label class="field"><span class="label">Nama Nusantara</span><input class="input" data-ns-id-name maxlength="16" placeholder="Nama panggilan"></label>' +
          '<label class="field"><span class="label">PIN 4 digit</span><input class="input" data-ns-id-pin inputmode="numeric" maxlength="4" placeholder="1234"></label>' +
        '</div>' +
        '<div class="row"><button class="btn btn--primary btn--sm" type="button" data-ns-id-action="register">Daftar</button>' +
        '<button class="btn btn--ghost btn--sm" type="button" data-ns-id-action="login">Masuk</button></div>' +
        '<p class="tiny muted">Nama dan PIN dipakai untuk skor Nusantara. Bukti tersimpan pada UID profil ini.</p>';
    }
    return '<section class="panel ns-identity" data-ns-identity>' +
      '<div class="panel__head"><div><span class="eyebrow">Identitas Nusantara</span><h3>Nama &amp; PIN</h3></div><span class="badge">Cloud</span></div>' +
      '<div class="panel__body">' + body +
        (id.message ? '<p class="tiny ns-id-msg" data-ns-id-msg>' + esc(id.message) + '</p>' : '') +
      '</div></section>';
  }

  function renderLobby(host) {
    var p = player();
    if (!state.nsIdentity.checked) {
      state.nsIdentity.checked = true;
      refreshNsIdentity();
    }
    loadNsGlobal();
    var best = bestFor('nusantara:solo');
    var setup = state.setup;
    var arena = arenaById(setup.arena);
    var sen = senapatiById(setup.senapati);
    var mode = state.mode;
    var startDisabled = viewReady ? '' : ' disabled';

    host.innerHTML = '<div class="game-shell">' +
      UI.gameHeader({ title: 'Nusantara Sirna', subtitle: 'Solo', glyph: '♜', backLabel: 'Hub' }) +
      '<div class="game-wrap game-wrap--play">' +
        viewStatusHtml() +
        '<section class="game-hero game-hero--nusantara ns-hero">' +
          '<div class="game-hero__copy">' +
            '<span class="eyebrow">Auto-battler &amp; pertahanan jalur</span>' +
            '<h1>Nusantara Sirna</h1>' +
            '<p>Pilih Senapati, kumpulkan Titisan, dan susun Warisan sebelum Sunyi menembus Lawang. Setiap pupuh adalah taruhan antara emas, formasi, dan nyawa.</p>' +
            '<div class="row">' +
              '<span class="badge badge--theme">9 × 7 Sasana</span>' +
              '<span class="badge">Penjaga tiap 5 pupuh</span>' +
            '</div>' +
            '<div class="row">' +
              '<button class="btn btn--primary btn--lg" type="button" data-ns-start' + startDisabled + '><span class="btn__icon" aria-hidden="true">⚔</span> Mulai pertandingan</button>' +
              '<button class="btn btn--ghost" type="button" data-open="lontar">Buka Lontar</button>' +
            '</div>' +
          '</div>' +
          '<div class="game-hero__art ns-hero-art" aria-hidden="true">' +
            '<span class="gate gate--lobby"><span class="gate__roof gate__roof--top"></span><span class="gate__roof gate__roof--mid"></span><span class="gate__pillar gate__pillar--l"></span><span class="gate__pillar gate__pillar--r"></span><span class="gate__door"></span></span>' +
            '<span class="ns-hero-rune ns-hero-rune--a">✦</span><span class="ns-hero-rune ns-hero-rune--b">◈</span><span class="ns-hero-rune ns-hero-rune--c">⛨</span>' +
            '<span class="ns-hero-caption">' + esc(arena.name) + '</span>' +
          '</div>' +
        '</section>' +

        '<div class="ns-mode-tabs" role="tablist" aria-label="Mode Nusantara Sirna">' +
          '<button class="ns-mode-tab' + (mode === 'solo' ? ' is-active' : '') + '" type="button" role="tab" data-ns-mode="solo" aria-selected="' + (mode === 'solo') + '">' +
            '<strong>Solo</strong><small>Bertahan sejauh mungkin</small></button>' +
          '<button class="ns-mode-tab' + (mode === 'party' ? ' is-active' : '') + '" type="button" role="tab" data-ns-mode="party" aria-selected="' + (mode === 'party') + '">' +
            '<strong>Party</strong><small>Perlu koneksi online</small></button>' +
        '</div>' +

        '<div class="ns-lobby-grid">' +
          '<section class="panel ns-setup">' +
            '<div class="panel__head"><div><span class="eyebrow">Persiapan</span><h2>Pilih Senapati</h2></div><span class="badge badge--theme"><span data-gh-identity-avatar>' + p.avatar + '</span> <span data-gh-identity-name>' + esc(p.name) + '</span></span></div>' +
            '<div class="panel__body stack">' +
              (mode === 'party' ?
                '<div class="notice notice--warning"><strong>Party belum tersedia.</strong> Mode Party pada PRD memakai Firebase untuk menyatukan empat pemain. Paket ini tidak menyertakan konfigurasi Firebase, jadi build lokal hanya membuka Solo.</div>' +
                '<div class="row"><button class="btn btn--primary" type="button" data-ns-mode="solo">Mainkan Solo</button><button class="btn btn--ghost" type="button" data-open="local-mode">Detail penyimpanan</button></div>'
              :
                '<div class="ns-senapati-grid">' + NS.senapati.map(function (s) { return senapatiCard(s, setup.senapati === s.id); }).join('') + '</div>' +
                '<div class="ns-setup-row">' +
                  '<label class="field grow"><span class="label">Sasana</span>' +
                    '<select class="select" data-ns-arena>' + NS.arenas.map(function (a) {
                      return '<option value="' + a.id + '"' + (a.id === setup.arena ? ' selected' : '') + '>' + esc(a.name) + '</option>';
                    }).join('') + '</select>' +
                  '</label>' +
                  '<div class="ns-arena-meta">' +
                    '<span class="badge">HP Sunyi ×' + arena.hpMult.toFixed(2) + '</span>' +
                    '<span class="badge">Afinitas ' + esc((NS.origins[arena.affinity] || {}).name || arena.affinity) + '</span>' +
                  '</div>' +
                '</div>' +
                '<p class="tiny muted">Solo berlangsung sampai Senapati gugur. Skor disimpan setelah mencapai minimal pupuh 3.</p>' +
                '<div class="ns-start-row">' +
                  '<div class="ns-start-summary">' +
                    '<span class="ns-summary__sen">' + sen.icon + ' ' + esc(sen.name) + '</span>' +
                    '<small>' + esc(sen.passive) + '</small>' +
                  '</div>' +
                  '<button class="btn btn--primary btn--lg" type="button" data-ns-start' + startDisabled + '><span class="btn__icon" aria-hidden="true">▶</span> Mulai solo</button>' +
                '</div>'
              ) +
            '</div>' +
          '</section>' +

          '<aside class="ns-lobby-side">' +
            '<section class="panel best-card">' +
              '<div class="panel__head"><div><span class="eyebrow">Rekor</span><h3>Solo terbaik</h3></div></div>' +
              '<div class="panel__body">' +
                (best ? '<div class="best-card__main"><span class="best-card__value">' + fmt(best.score) + '</span><div class="best-card__meta">' + esc(best.name) + ' · ' + U.formatDate(best.date) + '</div></div>' : '<div class="best-card__main"><span class="best-card__value">—</span><div class="best-card__meta">Belum ada skor solo.</div></div>') +
                nsGlobalHtml('solo', 'Global solo') + nsGlobalHtml('week', 'Global mingguan') +
                '<button class="btn btn--ghost btn--block btn--sm" type="button" data-open="leaderboards">Papan skor</button>' +
              '</div>' +
            '</section>' +
            nsIdentityHtml() +
            '<section class="panel ns-side-guide">' +
              '<div class="panel__head"><div><span class="eyebrow">Lontar singkat</span><h3>Alur satu pupuh</h3></div></div>' +
              '<div class="panel__body"><ol class="ns-steps">' +
                '<li><span>1</span><div><strong>Persiapan</strong><small>Beli Titisan, atur formasi, beli XP.</small></div></li>' +
                '<li><span>2</span><div><strong>Pertempuran</strong><small>Sunyi berjalan menuju Senapati. Skill keluar saat mana penuh.</small></div></li>' +
                '<li><span>3</span><div><strong>Upah</strong><small>Emas, bunga, dan XP pasif masuk. Penjaga jatuh memberi Pusaka.</small></div></li>' +
              '</ol>' +
              '<button class="text-btn" type="button" data-open="lontar">Baca Lontar Sangkala</button></div>' +
            '</section>' +
          '</aside>' +
        '</div>' +

        '<section class="rule-cards ns-rule-cards">' +
          '<article class="rule-card"><span class="rule-card__icon">◈</span><h3>Warisan Asal</h3><p>Aktif pada 2 / 3 / 5 Titisan unik dengan Asal sama. Dwi memperkuat semua Warisan lain.</p></article>' +
          '<article class="rule-card"><span class="rule-card__icon">⚒</span><h3>Warisan Laku</h3><p>Aktif pada 2 / 3 / 4 Titisan unik dengan Laku sama. Formasi menentukan kekuatan akhir.</p></article>' +
          '<article class="rule-card"><span class="rule-card__icon">♜</span><h3>Pusaka</h3><p>Penjaga menjatuhkan Pusaka. Maksimal 12 dimiliki, 3 terpasang per Titisan.</p></article>' +
          '<article class="rule-card"><span class="rule-card__icon">✦</span><h3>Bintang</h3><p>Tiga Titisan sama bergabung otomatis. Bintang 2 ×1,8 dan bintang 3 ×3,24.</p></article>' +
        '</section>' +
      '</div>' +
    '</div>';

    $$('[data-senapati]', host).forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.setup.senapati = btn.dataset.senapati;
        S.setNusantaraPrefs({ lastSenapati: state.setup.senapati });
        if (GH.audio) GH.audio.click();
        renderLobby(host);
      });
    });
    $$('[data-ns-mode]', host).forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.mode = btn.dataset.nsMode;
        renderLobby(host);
      });
    });
    var arenaSelect = $('[data-ns-arena]', host);
    if (arenaSelect) {
      arenaSelect.addEventListener('change', function () {
        state.setup.arena = arenaSelect.value;
        S.setNusantaraPrefs({ lastArena: state.setup.arena });
        renderLobby(host);
      });
    }
    $$('[data-ns-start]', host).forEach(function (startBtn) {
      startBtn.addEventListener('click', function () { startSolo(); });
    });
    $$('[data-ns-id-action]', host).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var action = btn.dataset.nsIdAction;
        var C = GH.cloud;
        if (!C) return;
        var op = null;
        if (action === 'register') {
          var nameEl = $('[data-ns-id-name]', host);
          var pinEl = $('[data-ns-id-pin]', host);
          op = C.nsRegister(nameEl ? nameEl.value : '', pinEl ? pinEl.value : '');
        } else if (action === 'login') {
          var loginName = $('[data-ns-id-name]', host);
          var loginPin = $('[data-ns-id-pin]', host);
          op = C.nsLogin(loginName ? loginName.value : '', loginPin ? loginPin.value : '');
        } else if (action === 'clear') {
          op = C.nsClearProof();
        }
        if (!op) return;
        setNsIdMessage(host, 'Memproses identitas Nusantara…');
        Promise.resolve(op).then(function (res) {
          state.nsIdentity.message = '';
          if (res && res.ok) {
            return refreshNsIdentity().then(function () {
              state.nsIdentity.message = action === 'clear' ? 'Identitas Nusantara dihapus.' : 'Identitas Nusantara tersimpan.';
              if (state.screen === 'lobby') paint();
            });
          }
          state.nsIdentity.message = (res && (res.reason || res.error)) || 'Gagal memproses identitas.';
          if (state.screen === 'lobby') paint();
        }, function (err) {
          state.nsIdentity.message = (err && err.message) || 'Gagal memproses identitas.';
          if (state.screen === 'lobby') paint();
        });
      });
    });
    var retry = $('[data-ns-view-retry]', host);
    if (retry) retry.addEventListener('click', function () { loadView(true); });
    var back = $('[data-game-back]', host);
    if (back) back.addEventListener('click', function () { R.go('hub'); });
    var sound = $('[data-sound-toggle]', host);
    if (sound) sound.addEventListener('click', UI.toggleSound);
    var settings = $('[data-open="settings"]', host);
    if (settings) settings.addEventListener('click', function () { GH.app.openSettings(); });
  }

  function startSolo() {
    if (!viewReady) {
      UI.toast({ type: 'warning', title: 'Data belum siap', msg: viewError || 'Aturan Nusantara masih dimuat.' });
      return;
    }
    state.run = createRun({
      mode: 'solo',
      playerName: player().name,
      playerAvatar: player().avatar
    });
    if (!state.run) {
      UI.toast({ type: 'warning', title: 'Pertandingan batal', msg: 'Data Nusantara belum siap dipakai.' });
      return;
    }
    state.screen = 'play';
    state.result = null;
    setGuard();
    paint();
  }

  /* ---------------- Runtime shell ---------------- */
  function stopPrepTimer(run) {
    if (run && run.timerId) {
      clearInterval(run.timerId);
      run.timerId = null;
    }
  }

  function stopBattleTicker(run) {
    if (run && run.tickId) {
      clearInterval(run.tickId);
      run.tickId = null;
    }
  }

  function clearRunTimeouts(run) {
    if (!run || !run._timeouts) return;
    run._timeouts.forEach(function (id) { clearTimeout(id); });
    run._timeouts = [];
  }

  function later(run, fn, ms) {
    if (!run) return null;
    run._timeouts = run._timeouts || [];
    var id = setTimeout(function () {
      run._timeouts = (run._timeouts || []).filter(function (t) { return t !== id; });
      fn();
    }, ms);
    run._timeouts.push(id);
    return id;
  }

  function setGuard() {
    R.setGuard({
      title: 'Keluar dari Nusantara Sirna?',
      body: 'Pertandingan yang sedang berjalan akan hilang. Emas, formasi, dan skor sementara tidak disimpan.',
      confirmLabel: 'Ya, keluar',
      cancelLabel: 'Lanjut bermain',
      onAbort: abandonRun
    });
  }

  function clearGuard() {
    if (R.guardActive()) R.clearGuard();
  }

  function abandonRun() {
    if (state.run) {
      stopPrepTimer(state.run);
      stopBattleTicker(state.run);
      clearRunTimeouts(state.run);
    }
    state.run = null;
    state.result = null;
    state.screen = 'lobby';
    clearGuard();
    var host = document.querySelector('[data-view="nusantara"]');
    if (host && !host.hidden) renderLobby(host);
  }

  function currentHost() { return document.querySelector('[data-view="nusantara"]'); }

  function paint() {
    var host = currentHost();
    if (!host) return;
    if (state.screen === 'play' && state.run) renderPlay(host);
    else if (state.screen === 'result' && state.result) renderResult(host);
    else renderLobby(host);
  }

  function hudHtml(run) {
    var hpPct = U.pct(run.hp, run.maxHp);
    var xpNeed = xpToNext(run);
    var xpMeta = xpInfo(run);
    var xpPct = xpMeta.max ? 100 : U.pct(xpMeta.xp, Math.max(1, xpMeta.need));
    var wave = run.waveInfo || NS.wave(run.round, run.arena.hpMult);
    var waveTotal = (run.battle && run.battle.total) || wave.count;
    var isPrep = run.phase === 'prep';
    var timerText = isPrep ? run.timer + 's' : (run.phase === 'battle' ? 'Tempur' : '—');
    var enemiesLeft = run.battle ? run.battle.enemies.filter(function (e) { return e.hp > 0; }).length : waveTotal;
    return '<div class="ns-hud">' +
      '<div class="ns-hud__cmd">' +
        '<span class="ns-cmd-face" style="--pick:' + run.senapati.color + '">' + run.senapati.icon + '</span>' +
        '<div class="ns-cmd-body">' +
          '<span class="ns-hud__label">Senapati · ' + esc(run.playerName) + '</span>' +
          '<strong>' + esc(run.senapati.name) + '</strong>' +
          '<div class="ns-hpbar' + (hpPct < 35 ? ' is-danger' : '') + '"><i style="width:' + hpPct + '%"></i></div>' +
          '<small class="ns-hud__sub">' + fmt(run.hp) + ' / ' + fmt(run.maxHp) + ' HP</small>' +
        '</div>' +
      '</div>' +
      '<div class="ns-hud__stat"><span class="ns-hud__label">Pupuh</span><strong>' + run.round + '</strong><small>bertahan</small></div>' +
      '<div class="ns-hud__stat"><span class="ns-hud__label">Emas</span><strong class="text-warning">' + fmt(run.gold) + '</strong><small>+bunga ' + fmt(Math.min(Math.floor(run.gold / (ECON.interestPer || 10)), ECON.interestCap + (run.mods.interestCap || 0))) + '</small></div>' +
      '<div class="ns-hud__stat"><span class="ns-hud__label">Level ' + run.level + '</span><strong>' + (xpMeta.max ? 'MAX' : run.xp + ' XP') + '</strong><div class="ns-xpbar"><i style="width:' + xpPct + '%"></i></div><small>' + (xpMeta.max ? 'Batas ' + unitCap(run) + ' unit' : (xpNeed + ' XP lagi')) + '</small></div>' +
      '<div class="ns-hud__stat ns-hud__timer' + (isPrep && run.timer <= 8 ? ' is-urgent' : '') + '"><span class="ns-hud__label">' + (isPrep ? 'Persiapan' : 'Pertempuran') + '</span><strong data-ns-timer>' + timerText + '</strong><small>' + (run.phase === 'battle' ? enemiesLeft + ' Sunyi tersisa' : wave.boss ? 'Penjaga berikutnya' : waveTotal + ' Sunyi') + '</small></div>' +
      '<div class="ns-hud__actions">' +
        (isPrep ? '<button class="btn btn--primary" type="button" data-ns-ready><span class="btn__icon" aria-hidden="true">⚔</span> Siap</button>' : '') +
        '<button class="btn btn--ghost btn--sm" type="button" data-open="lontar">Lontar</button>' +
      '</div>' +
    '</div>';
  }

  function starsHtml(star) {
    var out = '';
    for (var i = 0; i < star; i++) out += '<i>★</i>';
    return '<span class="ns-stars" aria-label="Bintang ' + star + '">' + out + '</span>';
  }

  function unitTokenHtml(run, unit, opts) {
    var stats = unit.stats || unitStats(run, unit);
    var c = stats.char;
    var isSelected = run.selected && run.selected.uid === unit.uid;
    var dead = unit.alive === false;
    var hp = unit.hp == null ? stats.maxHp : unit.hp;
    var hpPct = U.pct(hp, stats.maxHp);
    var manaMax = unit.manaMax || stats.manaMax || 100;
    var manaPct = U.pct(unit.mana || 0, manaMax);
    opts = opts || {};
    return '<span class="ns-token ns-token--unit' + (isSelected ? ' is-selected' : '') + (dead ? ' is-dead' : '') + '" style="--unit-color:' + c.color + '" data-uid="' + unit.uid + '">' +
      '<span class="ns-token__icon">' + esc(c.icon) + '</span>' +
      starsHtml(unit.star) +
      (unit.relicIds && unit.relicIds.length ? '<span class="ns-token__relic" title="Pusaka terpasang">◆' + unit.relicIds.length + '</span>' : '') +
      '<span class="ns-token__bars"><i class="ns-bar ns-bar--hp" style="width:' + hpPct + '%"></i><i class="ns-bar ns-bar--mana" style="width:' + manaPct + '%"></i></span>' +
    '</span>';
  }

  function enemyAtCell(run, pathIndex) {
    if (!run.battle) return [];
    return run.battle.enemies.filter(function (e) {
      if (e.hp <= 0 || e.progress < -0.15) return false;
      var idx = Math.min(run.arena.path.length - 1, Math.max(0, Math.round(e.progress)));
      return idx === pathIndex;
    });
  }

  function enemyTokenHtml(enemy) {
    var hpPct = U.pct(enemy.hp, enemy.maxHp);
    return '<span class="ns-enemy' + (enemy.boss ? ' is-boss' : '') + '">' +
      '<span class="ns-enemy__face" aria-hidden="true">' + (enemy.boss ? '☠' : '◍') + '</span>' +
      '<i class="ns-enemy__hp" style="width:' + hpPct + '%"></i>' +
      (enemy.stun > 0 ? '<span class="ns-enemy__stun" aria-hidden="true">✧</span>' : '') +
    '</span>';
  }

  function boardCellsHtml(run) {
    var arena = run.arena;
    var unitsByTile = {};
    run.units.forEach(function (u) {
      if (u.tile) unitsByTile[u.tile.x + ',' + u.tile.y] = u;
    });
    var selected = run.selected;
    var out = '';
    for (var y = 0; y <= 6; y++) {
      for (var x = 0; x <= 8; x++) {
        var k = x + ',' + y;
        var isPath = !!arena.pathKeys[k];
        var isCommander = arena.commander.x === x && arena.commander.y === y;
        var isPortal = arena.portal.x === x && arena.portal.y === y;
        var isUnitTile = !!arena.unitKeys[k];
        var unit = unitsByTile[k];
        if (isCommander) {
          var hpPct = U.pct(run.hp, run.maxHp);
          out += '<div class="ns-cell ns-cell--commander" title="Senapati"><span class="ns-cmd-token" style="--pick:' + run.senapati.color + '">' + run.senapati.icon + '</span><i class="ns-cmd-hp" style="width:' + hpPct + '%"></i></div>';
        } else if (isPortal) {
          var atPortal = enemyAtCell(run, 0);
          out += '<div class="ns-cell ns-cell--portal" title="Lawang Sunyi"><span class="ns-portal" aria-hidden="true">✦</span>' +
            atPortal.slice(0, 2).map(enemyTokenHtml).join('') + (atPortal.length > 2 ? '<b class="ns-stack-count">+' + (atPortal.length - 2) + '</b>' : '') + '</div>';
        } else if (isPath) {
          var pathIndex = arena.path.findIndex(function (p) { return p.x === x && p.y === y; });
          var list = pathIndex >= 0 ? enemyAtCell(run, pathIndex) : [];
          var show = list.slice(0, 2);
          out += '<div class="ns-cell ns-cell--path">' + show.map(enemyTokenHtml).join('') +
            (list.length > 2 ? '<b class="ns-stack-count">+' + (list.length - 2) + '</b>' : '') + '</div>';
        } else if (isUnitTile) {
          var canPlace = selected && (selected.type === 'bench' || (selected.type === 'board' && !unit));
          out += '<button class="ns-cell ns-cell--tile' + (unit ? ' has-unit' : '') + (canPlace ? ' can-place' : '') + '" type="button" data-tile="' + x + ',' + y + '" aria-label="Petak unit ' + (x + 1) + ',' + (y + 1) + (unit ? ', ' + esc(charById(unit.charId).name) : ', kosong') + '">' +
            (unit ? unitTokenHtml(run, unit) : (canPlace ? '<span class="ns-place-hint">+</span>' : '<span class="ns-tile-dot" aria-hidden="true"></span>')) +
          '</button>';
        } else {
          out += '<div class="ns-cell ns-cell--decor"></div>';
        }
      }
    }
    return out;
  }

  function boardGridHtml(run) {
    return '<div class="ns-board" role="grid" aria-label="Sasana ' + esc(run.arena.name) + ', 9 kolom 7 baris">' + boardCellsHtml(run) + '</div>';
  }

  function boardHtml(run) {
    return '<div class="ns-board-wrap">' + boardGridHtml(run) + '</div>';
  }

  function shopCardHtml(run, charId, index) {
    if (!charId) {
      return '<div class="ns-shop-card is-sold"><span class="ns-shop-card__sold">Terjual</span><small>Refresh untuk tawaran baru</small></div>';
    }
    var c = charById(charId);
    var origin = NS.origins[c.origin];
    var path = NS.paths[c.path];
    var afford = run.gold >= c.cost && (run.phase === 'prep' || run.phase === 'battle');
    return '<button class="ns-shop-card ns-shop-card--c' + c.cost + '" type="button" data-buy="' + index + '"' + (afford ? '' : ' disabled') + ' aria-label="Beli ' + esc(c.name) + ', ' + c.cost + ' emas">' +
      '<span class="ns-shop-card__top"><span class="ns-shop-card__cost">' + c.cost + '</span><span class="ns-shop-card__icons">' + origin.icon + path.icon + '</span></span>' +
      '<span class="ns-shop-card__name">' + esc(c.name) + '</span>' +
      '<span class="ns-shop-card__trait">' + esc(origin.name) + ' · ' + esc(path.name) + '</span>' +
      '<span class="ns-shop-card__skill">' + esc(c.skill.name) + '</span>' +
    '</button>';
  }

  function benchHtml(run) {
    var slots = '';
    for (var i = 0; i < ECON.benchSize; i++) {
      var unit = run.bench.filter(function (u) { return u.slot === i; })[0];
      if (unit) {
        var sel = run.selected && run.selected.uid === unit.uid;
        slots += '<button class="ns-bench-slot has-unit' + (sel ? ' is-selected' : '') + '" type="button" data-bench="' + unit.uid + '" aria-label="' + esc(charById(unit.charId).name) + ' di bangku">' + unitTokenHtml(run, unit) + '</button>';
      } else {
        slots += '<span class="ns-bench-slot" aria-hidden="true"></span>';
      }
    }
    return '<div class="ns-bench">' + slots + '</div>';
  }

  function selectedUnit(run) {
    if (!run.selected) return null;
    return findUnit(run, run.selected.uid);
  }

  function unitDetailHtml(run) {
    var unit = selectedUnit(run);
    if (!unit) {
      return '<div class="ns-detail-empty"><span aria-hidden="true">◇</span><p>Pilih Titisan di bangku atau Sasana untuk melihat statistik, memasang Pusaka, atau menjual.</p></div>';
    }
    var stats = unit.stats || unitStats(run, unit);
    var c = stats.char;
    var origin = NS.origins[c.origin];
    var path = NS.paths[c.path];
    var sell = NS.sellValue[unit.star] || 1;
    var relicChips = (unit.relicIds || []).map(function (rid) {
      var relic = NS.pusaka.filter(function (p) { return p.id === rid; })[0];
      return relic ? '<button class="ns-relic-chip" type="button" data-unequip="' + rid + '" title="Lepas ' + esc(relic.name) + '">' + relic.icon + ' <span>' + esc(relic.name) + '</span> ✕</button>' : '';
    }).join('');
    return '<div class="ns-detail">' +
      '<div class="ns-detail__head"><span class="ns-detail__icon" style="--pick:' + c.color + '">' + c.icon + '</span><div><strong>' + esc(c.name) + '</strong><small>' + esc(origin.name) + ' · ' + esc(path.name) + ' · ' + starsHtml(unit.star) + '</small></div></div>' +
      '<div class="ns-detail__stats">' +
        '<div><span>HP</span><strong>' + fmt(stats.maxHp) + '</strong></div>' +
        '<div><span>ATK</span><strong>' + fmt(stats.atk) + '</strong></div>' +
        '<div><span>Jangkauan</span><strong>' + stats.range + '</strong></div>' +
        '<div><span>Skill</span><strong class="ns-detail__skill">' + esc(c.skill.name) + '</strong></div>' +
      '</div>' +
      '<p class="tiny muted">' + esc(c.skill.desc) + ' Kekuatan ' + c.skill.power + '.</p>' +
      '<div class="ns-detail__relics">' + (relicChips || '<small class="muted">Belum ada Pusaka terpasang (' + (unit.relicIds || []).length + '/3).</small>') + '</div>' +
      '<div class="row ns-detail__actions">' +
        '<button class="btn btn--danger btn--sm" type="button" data-sell="' + unit.uid + '">Jual +' + sell + ' emas</button>' +
        '<button class="btn btn--ghost btn--sm" type="button" data-deselect>Batal pilih</button>' +
      '</div>' +
    '</div>';
  }

  function warisanHtml(run) {
    var list = activeWarisan(run);
    var cards = list.filter(function (w) { return w.state === 'active'; }).map(function (w) {
      return '<div class="ns-warisan is-active" style="--pick:' + w.color + '"><span class="ns-warisan__icon">' + w.icon + '</span><div><strong>' + esc(w.name) + ' <small>' + (w.type === 'asal' ? 'Asal' : 'Laku') + ' · ' + w.count + '/' + w.threshold + '</small></strong><p>' + esc(w.desc) + '</p></div></div>';
    }).join('');
    if (!cards) cards = '<p class="tiny muted ns-warisan-empty">Belum ada Warisan aktif. Kumpulkan 2 Titisan dengan Asal atau Laku yang sama.</p>';
    var near = list.filter(function (w) { return w.state !== 'active'; }).map(function (w) {
      return '<span class="ns-near">' + w.icon + ' ' + w.name + ' ' + w.count + (w.next ? '/' + w.next : '') + '</span>';
    }).join('');
    return '<div class="ns-warisan-list">' + cards + '</div>' + (near ? '<div class="ns-near-row">' + near + '</div>' : '');
  }

  function relicsHtml(run) {
    if (!run.relics.length) return '<p class="tiny muted">Belum ada Pusaka. Kalahkan Penjaga pada pupuh kelipatan 5.</p>';
    var cards = run.relics.map(function (rid) {
      var relic = NS.pusaka.filter(function (p) { return p.id === rid; })[0];
      if (!relic) return '';
      var owner = relicOwner(run, rid);
      return '<button class="ns-relic" type="button" data-equip="' + rid + '">' +
        '<span class="ns-relic__icon">' + relic.icon + '</span>' +
        '<span class="ns-relic__body"><strong>' + esc(relic.name) + '</strong><small>' + esc(relic.desc) + '</small></span>' +
        '<span class="ns-relic__owner">' + (owner ? esc(charById(owner.charId).name) : 'Pasang') + '</span>' +
      '</button>';
    }).join('');
    return '<div class="ns-relic-grid">' + cards + '</div>' +
      '<div class="row"><button class="btn btn--ghost btn--sm" type="button" data-auto-relic>Pasang otomatis</button><span class="tiny muted">' + run.relics.length + '/' + ECON.maxRelics + ' dimiliki</span></div>';
  }

  function sideHtml(run) {
    var wave = NS.wave(run.round, run.arena.hpMult);
    var log = run.log.slice(0, 4).map(function (l) { return '<li>' + esc(l.text) + '</li>'; }).join('');
    return '<aside class="ns-side">' +
      '<section class="panel ns-shop-panel">' +
        '<div class="panel__head ns-shop-head"><div><span class="eyebrow">Toko</span><h3>Tawaran Titisan</h3></div>' +
          '<button class="btn btn--ghost btn--sm" type="button" data-refresh' + (run.gold >= ECON.refreshCost && (run.phase === 'prep' || run.phase === 'battle') ? '' : ' disabled') + '>↻ ' + ECON.refreshCost + ' emas</button>' +
        '</div>' +
        '<div class="panel__body ns-shop-body">' +
          '<div class="ns-shop">' + run.shop.map(function (id, i) { return shopCardHtml(run, id, i); }).join('') + '</div>' +
          '<div class="ns-shop-foot"><span>Level ' + run.level + ' · peluang biaya 1–5</span><button class="btn btn--ghost btn--sm" type="button" data-buy-xp' + (run.gold >= ECON.xpCost && run.level < ECON.maxLevel && (run.phase === 'prep' || run.phase === 'battle') ? '' : ' disabled') + '>+4 XP · ' + ECON.xpCost + ' emas</button></div>' +
        '</div>' +
      '</section>' +
      '<section class="panel ns-bench-panel">' +
        '<div class="panel__head"><div><span class="eyebrow">Bangku</span><h3>Titisan cadangan</h3></div><span class="badge">' + run.bench.length + ' / ' + ECON.benchSize + '</span></div>' +
        '<div class="panel__body">' + benchHtml(run) + '<p class="tiny muted">Ketuk Titisan lalu ketuk petak Sasana untuk menempatkan.</p></div>' +
      '</section>' +
      '<section class="panel ns-detail-panel"><div class="panel__head"><div><span class="eyebrow">Terpilih</span><h3>Detail Titisan</h3></div></div><div class="panel__body">' + unitDetailHtml(run) + '</div></section>' +
      '<section class="panel ns-warisan-panel"><div class="panel__head"><div><span class="eyebrow">Sinergi</span><h3>Warisan</h3></div><span class="badge">' + activeWarisan(run).length + '</span></div><div class="panel__body">' + warisanHtml(run) + '</div></section>' +
      '<section class="panel ns-relic-panel"><div class="panel__head"><div><span class="eyebrow">Pusaka</span><h3>Benda Penjaga</h3></div><span class="badge">' + run.relics.length + '/' + ECON.maxRelics + '</span></div><div class="panel__body">' + relicsHtml(run) + '</div></section>' +
      '<section class="panel ns-log-panel"><div class="panel__head"><div><span class="eyebrow">Catatan</span><h3>Jalannya pertempuran</h3></div></div><div class="panel__body"><ul class="ns-log">' + (log || '<li>Belum ada catatan.</li>') + '</ul>' +
        '<div class="ns-wave-note"><span class="badge ' + (wave.boss ? 'badge--danger' : 'badge--theme') + '">' + esc(wave.label) + '</span><span>' + (wave.boss ? 'HP besar · hadiah Pusaka' : wave.count + ' Sunyi · bocor ' + wave.leak + ' HP') + '</span></div>' +
      '</div></section>' +
    '</aside>';
  }

  function renderPlay(host) {
    var run = state.run;
    if (!run) { state.screen = 'lobby'; renderLobby(host); return; }
    host.dataset.game = 'nusantara';
    host.innerHTML = '<div class="game-shell ns-shell">' +
      UI.gameHeader({ title: 'Nusantara Sirna', subtitle: 'Pupuh ' + run.round + ' · ' + (run.phase === 'battle' ? 'Pertempuran' : 'Persiapan'), glyph: '♜', backLabel: 'Keluar' }) +
      '<div class="game-wrap game-wrap--play ns-play-wrap">' +
        hudHtml(run) +
        '<div class="ns-stage">' +
          '<div class="ns-board-col">' +
            '<div class="ns-board-head"><span class="ns-board-title">' + esc(run.arena.name) + '</span><span class="tiny muted">Ketuk petak untuk menempatkan · 9 × 7</span></div>' +
            boardHtml(run) +
            (run.phase === 'clear' ? '<div class="ns-phase-banner is-clear"><strong>Pupuh selesai</strong><span>Menyiapkan upah dan tawaran berikutnya…</span></div>' : '') +
            (run.phase === 'reward' ? '<div class="ns-phase-banner is-reward"><strong>Penjaga runtuh</strong><span>Pilih satu Pusaka untuk melanjutkan.</span></div>' : '') +
            '<div class="ns-board-legend"><span><i class="ns-legend ns-legend--path"></i>Jalur Sunyi</span><span><i class="ns-legend ns-legend--tile"></i>Petak unit</span><span><i class="ns-legend ns-legend--cmd"></i>Senapati</span><span><i class="ns-legend ns-legend--portal"></i>Lawang Sunyi</span></div>' +
            '<div class="ns-mobile-side">' + sideHtml(run) + '</div>' +
          '</div>' +
          '<div class="ns-desktop-side">' + sideHtml(run) + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

    bindPlay(host);
    ensurePrepTimer(run);
    updateTimerUi(run);
  }

  function ensurePrepTimer(run) {
    if (run.phase !== 'prep' || run.timerId) return;
    run.timerId = setInterval(function () {
      if (!state.run || state.run !== run || run.phase !== 'prep') {
        stopPrepTimer(run);
        return;
      }
      run.timer = Math.max(0, run.timer - 1);
      updateTimerUi(run);
      if (run.timer <= 0) startBattle();
    }, 1000);
  }

  function updateTimerUi(run) {
    var host = currentHost();
    if (!host) return;
    var el = $('[data-ns-timer]', host);
    if (el) el.textContent = run.phase === 'prep' ? run.timer + 's' : (run.phase === 'battle' ? 'Tempur' : '—');
    var timerBox = $('.ns-hud__timer', host);
    if (timerBox) timerBox.classList.toggle('is-urgent', run.phase === 'prep' && run.timer <= 8);
  }

  function findUnit(run, uid) {
    var key = String(uid);
    var hit = run.units.filter(function (u) { return String(u.uid) === key; })[0];
    if (hit) return hit;
    return run.bench.filter(function (u) { return String(u.uid) === key; })[0] || null;
  }

  function relicOwner(run, rid) {
    return run.units.filter(function (u) { return (u.relicIds || []).indexOf(rid) >= 0; })[0] || null;
  }

  function selectUnit(uid) {
    var run = state.run;
    if (!run) return;
    if (run.selected && run.selected.uid === uid) run.selected = null;
    else {
      var u = findUnit(run, uid);
      if (!u) return;
      run.selected = { uid: uid, type: run.units.indexOf(u) >= 0 ? 'board' : 'bench' };
    }
    if (GH.audio) GH.audio.click();
    paint();
  }

  var CORE_REASON = {
    PHASE: 'Aksi ini hanya tersedia saat persiapan atau pertempuran.',
    GOLD: 'Emas tidak cukup.',
    EMPTY: 'Tawaran atau Titisan tidak tersedia.',
    BENCH_FULL: 'Bangku penuh. Tempatkan atau jual Titisan sebelum membeli.',
    BAD_SLOT: 'Slot bangku tidak valid.',
    BAD_TILE: 'Petak itu bukan petak Titisan.',
    LIMIT: 'Batas unit Sasana tercapai. Naikkan level untuk menambah slot.',
    MAXLEVEL: 'Level sudah maksimal.',
    NO_UPGRADE: 'Tidak ada tiga Titisan sama untuk digabung.',
    NO_PUSAKA: 'Pusaka tidak dimiliki.',
    GLOBAL: 'Pusaka ini bersifat global dan tidak bisa dipasang ke Titisan.',
    NO_UNIT: 'Pilih Titisan di Sasana atau bangku terlebih dahulu.',
    FULL: 'Titisan ini sudah memakai 3 Pusaka.',
    NOT_EQUIPPED: 'Pusaka belum terpasang.',
    NO_OFFER: 'Pusaka tidak tersedia dalam tawaran Penjaga.'
  };
  function coreToast(reason, title) {
    UI.toast({ type: 'warning', title: title || 'Aksi ditolak', msg: CORE_REASON[reason] || reason || 'Aksi tidak dapat dilakukan.' });
  }

  function placeUnit(run, unit, x, y) {
    var core = Core(), data = zipData();
    if (!core || !data || !run || !run.core) return false;
    var from = coreLocation(run, unit.uid);
    if (!from) return false;
    var res = core.move(data, run.core, from, { w: 'board', r: y + 1, c: x + 1 });
    if (!res.ok) { coreToast(res.reason, 'Tidak bisa menempatkan'); return false; }
    syncFromCore(run);
    run.selected = null;
    if (GH.audio) GH.audio.click();
    paint();
    return true;
  }

  function autoMerge(run) {
    var core = Core(), data = zipData();
    if (!core || !data || !run || !run.core) return;
    var events = core.mergeAll(run.core, run.core.phase === 'battle') || [];
    events.forEach(function (ev) {
      var c = charById(ev.id);
      addLog(run, (c ? c.name : ev.id) + ' naik ke bintang ' + ev.star + '.');
      if (state.run === run) UI.toast({ type: 'success', title: 'Gabung bintang ' + ev.star, msg: (c ? c.name : ev.id) + ' menjadi lebih kuat.', duration: 2600 });
    });
    if (events.length) syncFromCore(run);
  }

  function buyShop(index) {
    var run = state.run;
    var core = Core(), data = zipData();
    if (!run || !run.core || !core || !data) return;
    var charId = run.shop[index];
    var c = charById(charId);
    var res = core.buy(data, run.core, index);
    if (!res.ok) {
      if (res.reason === 'GOLD' && c) UI.toast({ type: 'warning', title: 'Emas kurang', msg: 'Butuh ' + c.cost + ' emas untuk ' + c.name + '.' });
      else coreToast(res.reason, 'Gagal membeli');
      return;
    }
    syncFromCore(run);
    if (GH.audio) GH.audio.buy();
    if (c) addLog(run, c.name + ' dibeli (' + c.cost + ' emas).');
    paint();
  }

  function refreshShop() {
    var run = state.run;
    var core = Core(), data = zipData();
    if (!run || !run.core || !core || !data) return;
    var res = core.refresh(data, run.core);
    if (!res.ok) { coreToast(res.reason, 'Gagal menyegarkan toko'); return; }
    syncFromCore(run);
    if (GH.audio) GH.audio.click();
    paint();
  }

  function buyXp() {
    var run = state.run;
    var core = Core(), data = zipData();
    if (!run || !run.core || !core || !data) return;
    var oldLevel = run.level;
    var res = core.buyXp(data, run.core);
    if (!res.ok) { coreToast(res.reason, 'Gagal membeli XP'); return; }
    syncFromCore(run);
    if (run.level > oldLevel) UI.toast({ type: 'success', title: 'Level ' + run.level, msg: 'Batas unit menjadi ' + unitCap(run) + '.' });
    if (GH.audio) GH.audio.buy();
    paint();
  }

  function sellUnit(uid) {
    var run = state.run;
    var core = Core(), data = zipData();
    if (!run || !run.core || !core || !data) return;
    var loc = coreLocation(run, uid);
    if (!loc) return;
    var unit = core.getAt(run.core, loc);
    if (!unit) return;
    var value = core.sellValue(core.index(data), unit);
    var res = core.sell(data, run.core, loc);
    if (!res.ok) { coreToast(res.reason, 'Gagal menjual'); return; }
    syncFromCore(run);
    run.selected = null;
    if (GH.audio) GH.audio.buy();
    addLog(run, (charById(unit.id) ? charById(unit.id).name : unit.id) + ' dijual (+' + value + ' emas).');
    paint();
  }

  function autoEquipRelics(run) {
    var core = Core(), data = zipData();
    if (!core || !data || !run || !run.core) return;
    var res = core.autoEquip(data, run.core);
    if (!res.ok) { coreToast(res.reason, 'Gagal memasang Pusaka'); return; }
    syncFromCore(run);
    return res.n;
  }

  function equipRelic(rid) {
    var run = state.run;
    var core = Core(), data = zipData();
    if (!run || !run.core || !core || !data) return;
    var S = run.core;
    var ownerUid = (S.equip || {})[rid];
    var unit = selectedUnit(run);
    var res;
    if (unit && ownerUid === unit.uid) res = core.unequipPusaka(S, rid);
    else if (unit) res = core.equipPusaka(data, S, rid, unit.uid);
    else if (ownerUid) res = core.unequipPusaka(S, rid);
    else {
      UI.toast({ type: 'info', title: 'Pilih Titisan', msg: 'Pilih Titisan di Sasana atau bangku sebelum memasang Pusaka.' });
      return;
    }
    if (!res.ok) { coreToast(res.reason, 'Pusaka'); return; }
    syncFromCore(run);
    if (GH.audio) GH.audio.click();
    paint();
  }

  function bindPlay(host) {
    var run = state.run;
    var back = $('[data-game-back]', host);
    if (back) back.addEventListener('click', function () {
      if (run.phase === 'prep' || run.phase === 'battle' || run.phase === 'reward') {
        R.confirmGuard().then(function (ok) { if (ok) { /* onAbort sudah merender */ } });
      } else {
        R.go('hub');
      }
    });
    var ready = $('[data-ns-ready]', host);
    if (ready) ready.addEventListener('click', function () { if (run.phase === 'prep') startBattle(); });
    $$('[data-buy]', host).forEach(function (btn) {
      btn.addEventListener('click', function () { buyShop(Number(btn.dataset.buy)); });
    });
    var refresh = $('[data-refresh]', host);
    if (refresh) refresh.addEventListener('click', refreshShop);
    var xp = $('[data-buy-xp]', host);
    if (xp) xp.addEventListener('click', buyXp);
    $$('[data-bench]', host).forEach(function (btn) {
      btn.addEventListener('click', function () { selectUnit(btn.dataset.bench); });
    });
    $$('[data-tile]', host).forEach(function (cell) {
      cell.addEventListener('click', function () {
        if (!run.selected) {
          var fromTile = cell.querySelector('.ns-token--unit');
          if (fromTile) selectUnit(fromTile.dataset.uid);
          return;
        }
        var unit = findUnit(run, run.selected.uid);
        if (!unit) { run.selected = null; paint(); return; }
        var parts = cell.dataset.tile.split(',');
        placeUnit(run, unit, Number(parts[0]), Number(parts[1]));
      });
    });
    var sell = $('[data-sell]', host);
    if (sell) sell.addEventListener('click', function () { sellUnit(sell.dataset.sell); });
    var deselect = $('[data-deselect]', host);
    if (deselect) deselect.addEventListener('click', function () { run.selected = null; paint(); });
    $$('[data-equip]', host).forEach(function (btn) {
      btn.addEventListener('click', function () { equipRelic(btn.dataset.equip); });
    });
    $$('[data-unequip]', host).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var uid = run.selected && run.selected.uid;
        var unit = uid ? findUnit(run, uid) : null;
        if (!unit) return;
        unit.relicIds = unit.relicIds.filter(function (id) { return id !== btn.dataset.unequip; });
        recomputeRun(run);
        paint();
      });
    });
    var auto = $('[data-auto-relic]', host);
    if (auto) auto.addEventListener('click', function () {
      autoEquipRelics(run);
      UI.toast({ type: 'success', title: 'Pusaka terpasang', msg: 'Pembagian otomatis mengikuti peran Titisan.' });
      paint();
    });
    var sound = $('[data-sound-toggle]', host);
    if (sound) sound.addEventListener('click', UI.toggleSound);
    var settings = $('[data-open="settings"]', host);
    if (settings) settings.addEventListener('click', function () { GH.app.openSettings(); });
  }

  /* ---------------- Round flow ---------------- */
  function beginPrep(run) {
    var core = Core(), data = zipData();
    if (!run || !run.core || !core || !data) return;
    stopPrepTimer(run);
    stopBattleTicker(run);
    run.phase = 'prep';
    run.timer = PREP_SECONDS;
    run.selected = null;
    run.battle = null;
    run.battleEngine = null;
    run.pendingOffer = null;
    run.waveInfo = null;
    run.transient = {};
    syncFromCore(run);
    addLog(run, 'Pupuh ' + run.core.round + ' · fase persiapan.');
    if (state.run === run) paint();
    ensurePrepTimer(run);
  }

  function nextRound() {
    var run = state.run;
    if (!run) return;
    beginPrep(run);
  }

  /* ---------------- Battle engine (ZIP NS.Battle) ---------------- */
  function battleEnemyView(B, e) {
    var mod = Battle();
    var pos = mod && mod.enemyPos ? mod.enemyPos(B, e.p) : [1, 1];
    var idx = Math.min(B.path.length - 1, Math.max(0, Math.floor(e.p)));
    return {
      id: 'e' + e.id,
      hp: e.hp,
      maxHp: e.maxHp,
      boss: !!e.boss,
      stun: e.stunT > B.t ? 1 : 0,
      slow: e.slowT > B.t ? 1 : 0,
      progress: idx,
      row: pos[0],
      col: pos[1],
      leak: e.leak
    };
  }

  function battleUnitName(B, uid) {
    var bu = (B.units || []).filter(function (u) { return u.uid === uid; })[0];
    var c = bu ? charById(bu.id) : null;
    return c ? c.name : 'Titisan';
  }

  function drainBattleEvents(run) {
    var B = run.battleEngine;
    if (!B || !B.ev || !B.ev.length) return;
    var lines = [];
    B.ev.forEach(function (ev) {
      if (ev.k === 'cast') lines.push(battleUnitName(B, ev.uid) + ' melepas ' + (ev.name || 'skill') + '.');
      else if (ev.k === 'boss') lines.push('Penjaga muncul di Lawang.');
      else if (ev.k === 'bossfx') lines.push('Penjaga menjalankan ' + ev.n + '.');
      else if (ev.k === 'quake') lines.push('Senapati mengguncang Sasana.');
      else if (ev.k === 'lir') lines.push('Lir menahan Sunyi.');
      else if (ev.k === 'boom') lines.push(battleUnitName(B, ev.uid) + ' gugur dan meledak.');
    });
    B.ev.length = 0;
    lines.slice(-3).forEach(function (line) { addLog(run, line); });
  }

  /** Cerminkan unit dan musuh NS.Battle ke token `.ns-*` tanpa mengubah aturan sim. */
  function syncBattleUnits(run) {
    var B = run.battleEngine;
    if (!B || !run.battle) return;
    var byUid = {};
    B.units.forEach(function (u) { byUid[u.uid] = u; });
    run.units.forEach(function (u) {
      var bu = byUid[u.uid];
      if (!bu) return;
      u.hp = Math.max(0, Math.round(bu.hp));
      u.maxHp = bu.maxHp;
      u.mana = Math.round(bu.mana);
      u.manaMax = bu.manaMax || 100;
      u.shield = Math.round((bu.sh0 || 0) + (bu.sh1 || 0));
      u.alive = !!bu.alive;
      if (u.stats) u.stats.manaMax = u.manaMax;
    });
    run.battle.enemies = B.enemies.filter(function (e) { return e.hp > 0; }).map(function (e) {
      return battleEnemyView(B, e);
    });
    run.battle.leaked = B.leaks;
    run.hp = Math.max(0, Math.min(run.maxHp, run.core.hp - B.leakDamage));
  }

  function startBattle() {
    var run = state.run;
    var core = Core(), mod = Battle(), data = zipData();
    if (!run || run.phase !== 'prep' || !run.core || !core || !mod || !data) return;
    stopPrepTimer(run);
    run.phase = 'battle';
    run.selected = null;
    var setup = core.battleSetup(data, run.core);
    var B;
    try {
      B = mod.create(data, setup);
    } catch (err) {
      run.phase = 'prep';
      UI.toast({ type: 'warning', title: 'Pertempuran batal', msg: (err && err.message) || 'Data pertempuran tidak valid.' });
      return;
    }
    run.battleEngine = B;
    run.waveInfo = NS.wave(run.core.round, run.arena) || NS.wave(run.core.round, run.arena.hpMult);
    run.battle = {
      enemies: [],
      wave: run.waveInfo,
      total: ((run.waveInfo.zip && run.waveInfo.zip.pre) ? run.waveInfo.zip.pre.count : 0) + run.waveInfo.count,
      tick: 0,
      leaked: 0
    };
    syncBattleUnits(run);
    addLog(run, 'Pertempuran pupuh ' + run.core.round + ' dimulai. ' +
      (B.wave.boss ? 'Penjaga muncul!' : B.wave.count + ' Sunyi mendekat.'));
    if (GH.audio) GH.audio.countdown(true);
    paint();
    run.tickId = setInterval(function () { battleTick(run); }, TICK_MS);
  }

  function battleTick(run) {
    if (!state.run || state.run !== run || run.phase !== 'battle' || !run.battleEngine) {
      stopBattleTicker(run);
      return;
    }
    var mod = Battle();
    if (!mod) { stopBattleTicker(run); return; }
    var B = run.battleEngine;
    var steps = Math.max(1, Math.round((TICK_MS / 1000) / mod.DT));
    for (var i = 0; i < steps && !B.done; i++) mod.step(B);
    run.battle.tick += steps;
    drainBattleEvents(run);
    syncBattleUnits(run);
    paintBattle(run);
    if (B.done) endBattle(run, mod.result(B));
  }

  function paintBattle(run) {
    var host = currentHost();
    if (!host) return;
    var board = $('.ns-board', host);
    if (board) board.outerHTML = boardGridHtml(run);
    var hud = $('.ns-hud', host);
    if (hud) hud.outerHTML = hudHtml(run);
    var timerBox = $('.ns-hud__timer', host);
    if (timerBox) timerBox.classList.toggle('is-urgent', false);
  }

  /** Tutup pupuh lewat Core ZIP: HP, streak, upah, XP, toko, dan tawaran Pusaka. */
  function endBattle(run, result) {
    stopBattleTicker(run);
    var core = Core(), data = zipData();
    if (!run || !run.core || !core || !data || !result) return;
    var clearedRound = run.core.round;
    var closing = core.finishRound(data, run.core, result);
    if (!closing.ok) {
      coreToast(closing.reason, 'Pertempuran batal');
      run.phase = 'prep';
      paint();
      return;
    }
    var summary = closing.summary || {};
    var income = summary.income || {};
    run.lastSummary = summary;
    run.totalLeaks += result.leaks || 0;
    if (!summary.over) run.roundsCleared = clearedRound;
    run.phase = 'clear';
    run.battle = null;
    run.battleEngine = null;
    run.waveInfo = null;
    syncFromCore(run);
    if (summary.over) {
      run.defeated = true;
      addLog(run, 'Senapati gugur. Pertandingan berakhir pada pupuh ' + clearedRound + '.');
      if (GH.audio) GH.audio.lose();
      paint();
      later(run, function () { finishRun(false); }, 900);
      return;
    }
    if (result.leaks === 0) {
      addLog(run, 'Pupuh ' + clearedRound + ' bertahan. Streak ' + run.streak + '.');
      if (GH.audio) GH.audio.win();
    } else {
      addLog(run, 'Pupuh ' + clearedRound + ' membiarkan ' + result.leaks + ' Sunyi lolos. Senapati −' + result.leakDamage + ' HP.');
      if (GH.audio) GH.audio.wrong();
    }
    addLog(run, 'Upah +' + (income.total || 0) + ' emas (bunga +' + (income.interest || 0) + ', streak +' + (income.streak || 0) + ').');
    if (summary.goldLost) addLog(run, 'Penjaga mencuri ' + summary.goldLost + ' emas.');
    if (summary.pusakaOffer && summary.pusakaOffer.length) {
      run.pendingOffer = summary.pusakaOffer.slice();
      paint();
      later(run, function () { offerReward(run); }, 650);
      return;
    }
    paint();
    later(run, nextRound, 1500);
  }

  function offerReward(run) {
    if (!run || state.run !== run || !run.pendingOffer) return;
    var core = Core(), data = zipData();
    if (!core || !data || !run.core) { nextRound(); return; }
    var pool = run.pendingOffer.map(function (id) {
      return (NS.pusaka || []).filter(function (p) { return p.id === id; })[0];
    }).filter(Boolean);
    var cleared = run.roundsCleared;
    run.pendingOffer = null;
    if (!pool.length) { nextRound(); return; }
    run.phase = 'reward';
    var body = document.createElement('div');
    body.className = 'ns-reward-pick';
    body.innerHTML = '<p class="small muted">Penjaga runtuh dan meninggalkan tiga pusaka. Pilih satu untuk ditempatkan otomatis pada Titisan yang sesuai.</p><div class="ns-reward-grid">' +
      pool.map(function (relic) {
        return '<button class="ns-reward-card" type="button" data-reward="' + relic.id + '">' +
          '<span class="ns-reward-card__icon">' + relic.icon + '</span>' +
          '<strong>' + esc(relic.name) + '</strong>' +
          '<span>' + esc(relic.desc) + '</span>' +
          '<em>Pilih</em>' +
        '</button>';
      }).join('') + '</div>';
    UI.modal({
      title: 'Pusaka Penjaga',
      subtitle: 'Pupuh ' + cleared + ' · hadiah bertahan',
      body: body,
      wide: true,
      dismissible: false,
      actions: [{ label: 'Lewati hadiah', value: 'skip', variant: 'ghost' }],
      onMount: function (modal, close) {
        $$('[data-reward]', modal).forEach(function (btn) {
          btn.addEventListener('click', function () { close(btn.dataset.reward); });
        });
      }
    }).then(function (value) {
      if (value && value !== 'skip') {
        var chosen = core.choosePusaka(data, run.core, value);
        if (chosen.ok) {
          syncFromCore(run);
          autoEquipRelics(run);
          var relic = (NS.pusaka || []).filter(function (p) { return p.id === value; })[0];
          addLog(run, 'Pusaka diperoleh: ' + (relic ? relic.name : value) + '.');
          if (relic) UI.toast({ type: 'success', title: 'Pusaka diperoleh', msg: relic.name + ' · ' + relic.desc });
        } else {
          coreToast(chosen.reason, 'Pusaka');
        }
      } else {
        addLog(run, 'Hadiah Penjaga dilewati.');
      }
      run.phase = 'clear';
      nextRound();
    });
  }

  /* ---------------- Results ---------------- */
  function teamChips(run) {
    if (!run.units.length) return '<span class="tiny muted">Belum ada Titisan di Sasana.</span>';
    return run.units.map(function (u) {
      var c = charById(u.charId);
      return '<span class="ns-team-chip" style="--pick:' + c.color + '">' + c.icon + ' ' + esc(c.name) + ' <i>' + new Array(u.star + 1).join('★') + '</i></span>';
    }).join('');
  }

  function saveSoloResult(run, score) {
    var saved = null;
    if (run.roundsCleared >= 3) {
      var entry = {
        name: run.playerName,
        avatar: run.playerAvatar,
        score: score,
        primary: true,
        meta: { label: run.senapati.name + ' · ' + run.arena.name, rounds: run.roundsCleared, hp: run.hp }
      };
      saved = S.addScore('nusantara:solo', entry);
      S.addScore('nusantara:week', entry);
      S.recordActivity({
        game: 'nusantara',
        label: 'Nusantara Sirna · Solo',
        value: 'Pupuh ' + run.roundsCleared + ' · ' + fmt(score) + ' poin',
        meta: { senapati: run.senapati.name, arena: run.arena.name }
      });
    }
    return saved;
  }

  function finishRun(victory) {
    var run = state.run;
    if (!run) return;
    stopPrepTimer(run);
    stopBattleTicker(run);
    clearRunTimeouts(run);
    run.phase = 'done';
    var baseScore = NS.score(run.roundsCleared, run.hp, 0);
    var authoritative = nsScoreFor('solo', run.roundsCleared, run.hp, run.playerName, null, null);
    var score = authoritative == null ? baseScore : authoritative;
    var saved = saveSoloResult(run, score);
    var cloud = {
      status: run.roundsCleared >= 3 ? 'pending' : 'skipped',
      reason: run.roundsCleared >= 3 ? '' : 'Capai minimal pupuh 3 agar skor dihitung.'
    };
    state.result = {
      mode: 'solo',
      score: score,
      rounds: run.roundsCleared,
      reachedRound: run.round,
      hp: run.hp,
      maxHp: run.maxHp,
      leaks: run.totalLeaks,
      victory: victory,
      saved: saved,
      isBest: saved ? saved.isBest : false,
      rank: saved ? saved.rank : null,
      matchId: run.matchId,
      cloud: cloud,
      senapati: run.senapati,
      arena: run.arena,
      relics: run.relics.length,
      units: run.units.map(function (u) { return { charId: u.charId, star: u.star }; }),
      playerName: run.playerName,
      playerAvatar: run.playerAvatar
    };
    state.run = null;
    state.screen = 'result';
    clearGuard();
    paint();
    if (cloud.status === 'pending') {
      var soloToken = ++state.cloudToken;
      submitNsScore({
        matchId: run.matchId, mode: 'solo', round: run.roundsCleared, hp: run.hp, score: score
      }, function (res) {
        if (soloToken !== state.cloudToken || state.screen !== 'result' || !state.result) return;
        state.result.cloud = res && res.ok
          ? { status: 'saved', reason: '' }
          : { status: res && res.skipped ? 'skipped' : 'error', reason: (res && res.reason) || 'Gagal menyimpan skor.' };
        loadNsGlobal(true);
        refreshNsIdentity();
        paint();
      });
    }
  }

  function resultBreakdownHtml(r) {
    return '<div class="ns-breakdown">' +
      '<span><i>Pupuh</i><strong>' + r.rounds + ' × 100</strong></span>' +
      '<span><i>HP Senapati</i><strong>' + r.hp + ' × 5</strong></span>' +
      '<span><i>Bonus</i><strong>' + (r.bonus || 0) + '</strong></span>' +
      '<span class="ns-breakdown__total"><i>Skor</i><strong>' + fmt(r.score) + '</strong></span>' +
    '</div>';
  }

  function renderResult(host) {
    var r = state.result;
    var key = 'nusantara:solo';
    var rows = S.getBoard(key).slice(0, 8);
    host.dataset.game = 'nusantara';
    host.innerHTML = '<div class="game-shell ns-shell">' +
      UI.gameHeader({ title: 'Nusantara Sirna', subtitle: 'Hasil pertandingan', glyph: '♜', backLabel: 'Hub' }) +
      '<div class="game-wrap game-wrap--play">' +
        '<section class="result-screen ns-result">' +
          '<div class="result-hero">' +
            '<span class="result-hero__badge">' + (r.saved ? (r.isBest ? '★ Rekor baru' : r.rank ? 'Peringkat #' + r.rank : 'Tersimpan') : 'Belum masuk papan skor') + '</span>' +
            '<h1>' + (r.victory ? 'Senapati bertahan.' : 'Senapati gugur.') + '</h1>' +
            '<p>' + esc(r.senapati.name) + ' memimpin ' + esc(r.arena.name) + ' hingga pupuh ' + r.rounds + '. ' + (r.saved ? 'Skor tersimpan di perangkat ini.' : 'Skor disimpan setelah mencapai minimal pupuh 3.') + '</p>' +
          '</div>' +
          '<div class="result-metrics">' +
            '<div class="result-metric"><span>Skor</span><strong>' + fmt(r.score) + '</strong></div>' +
            '<div class="result-metric"><span>Pupuh tercapai</span><strong>' + r.rounds + '</strong></div>' +
            '<div class="result-metric"><span>HP tersisa</span><strong>' + r.hp + ' / ' + r.maxHp + '</strong></div>' +
            '<div class="result-metric"><span>Kebocoran</span><strong>' + r.leaks + '</strong></div>' +
          '</div>' +
          resultBreakdownHtml(r) +
          cloudStatusHtml(r.cloud) +
          nsGlobalHtml('solo', 'Papan global') +
          '<div class="ns-result-team">' +
            '<div class="ns-result-team__head"><span class="eyebrow">Formasi akhir</span><span class="badge">' + r.relics + ' Pusaka</span></div>' +
            '<div class="ns-team-row">' + (r.units.length ? r.units.map(function (u) {
              var c = charById(u.charId);
              return '<span class="ns-team-chip" style="--pick:' + c.color + '">' + c.icon + ' ' + esc(c.name) + ' <i>' + new Array(u.star + 1).join('★') + '</i></span>';
            }).join('') : '<span class="tiny muted">Tidak ada Titisan tersisa.</span>') + '</div>' +
            '<div class="row"><span class="badge">' + r.senapati.icon + ' ' + esc(r.senapati.name) + '</span><span class="badge">' + esc(r.arena.name) + '</span><span class="badge">' + r.rounds + ' pupuh</span></div>' +
          '</div>' +
          '<div class="result-actions">' +
            '<button class="btn btn--primary" type="button" data-ns-again>Main lagi</button>' +
            '<button class="btn btn--ghost" type="button" data-ns-lobby>Ubah formasi</button>' +
            '<button class="btn btn--ghost" type="button" data-open="leaderboards">Papan skor</button>' +
          '</div>' +
          (r.saved ? '' : '<div class="notice notice--warning"><strong>Belum tersimpan.</strong> Capai minimal pupuh 3 agar skor masuk papan peringkat. Pertandingan tetap bisa diulang.</div>') +
          '<section class="panel result-lb"><div class="panel__head"><div><span class="eyebrow">Solo</span><h3>Peringkat teratas</h3></div><button class="text-btn" type="button" data-open="leaderboards">Semua</button></div><div class="panel__body">' +
            UI.leaderboard(rows, { empty: 'Belum ada skor solo.', value: function (row) { return fmt(row.score); }, sub: function (row) { return (row.meta && row.meta.label) || U.formatDate(row.date); } }) +
          '</div></section>' +
        '</section>' +
      '</div>' +
    '</div>';

    var back = $('[data-game-back]', host);
    if (back) back.addEventListener('click', function () { R.go('hub'); });
    var again = $('[data-ns-again]', host);
    if (again) again.addEventListener('click', function () {
      state.result = null;
      startSolo();
    });
    var lobby = $('[data-ns-lobby]', host);
    if (lobby) lobby.addEventListener('click', function () {
      state.result = null;
      state.screen = 'lobby';
      renderLobby(host);
    });
    var sound = $('[data-sound-toggle]', host);
    if (sound) sound.addEventListener('click', UI.toggleSound);
    var settings = $('[data-open="settings"]', host);
    if (settings) settings.addEventListener('click', function () { GH.app.openSettings(); });
  }

  function sameNsIdentity(name, avatar, previous) {
    return !!(previous && (name === previous.name || !previous.name) &&
      (avatar === previous.avatar || !previous.avatar));
  }

  function patchActiveIdentity(snap, previous) {
    if (!snap || !snap.registered || !previous || previous.registered) return;
    // Hanya sandi identitas yang diperbarui di sesi yang sedang berjalan.
    // Ronde, emas, formasi, timer, dan skor tidak disentuh sama sekali.
    var run = state.run;
    if (run && sameNsIdentity(run.playerName, run.playerAvatar, previous)) {
      run.playerName = snap.name;
      run.playerAvatar = snap.avatar;
    }
    if (state.result && sameNsIdentity(state.result.playerName, state.result.playerAvatar, previous)) {
      state.result.playerName = snap.name;
      state.result.playerAvatar = snap.avatar;
    }
    // Profil baru aktif: panel identitas Nusantara harus dibaca ulang dari UID ini.
    state.nsIdentity.checked = false;
    state.nsIdentity.proof = null;
    state.nsIdentity.player = null;
    state.nsIdentity.message = '';
    if (state.screen === 'lobby') {
      var host = currentHost();
      if (host) renderLobby(host);
    }
  }

  /* ---------------- Registration ---------------- */
  api = {
    init: function () {
      if (GH.identity && typeof GH.identity.onChange === 'function') {
        GH.identity.onChange(patchActiveIdentity);
      }
      // Placeholder sementara; applyView() memvalidasi ulang setelah data ZIP siap.
      var prefs = S.getNusantaraPrefs() || {};
      if (prefs.lastSenapati) state.setup.senapati = prefs.lastSenapati;
      if (prefs.lastArena) state.setup.arena = prefs.lastArena;
      if (!hasId(NS && NS.senapati, state.setup.senapati)) state.setup.senapati = (((NS && NS.senapati) || [])[0] || {}).id;
      if (!hasId(NS && NS.arenas, state.setup.arena)) state.setup.arena = (((NS && NS.arenas) || [])[0] || {}).id;
      R.register('nusantara', {
        title: 'Nusantara Sirna',
        render: function (host) {
          if (state.screen === 'play' && state.run) renderPlay(host);
          else if (state.screen === 'result' && state.result) renderResult(host);
          else renderLobby(host);
        },
        cleanup: function () {
          if (state.run) {
            stopPrepTimer(state.run);
            stopBattleTicker(state.run);
            clearRunTimeouts(state.run);
          }
          state.run = null;
          state.result = null;
          state.screen = 'lobby';
          clearGuard();
        }
      });
      return loadView(false);
    },
    state: state,
    startSolo: function () { state.mode = 'solo'; startSolo(); },
    terms: (NS && NS.terms) || [],
    lontar: (NS && NS.lontar) || []
  };
  GH.nusantara = api;
})();
