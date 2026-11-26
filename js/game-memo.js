/* =========================================================
   Game Hub v2 · G4 Memo Mayhem: Cosmic Recall
   Host rebuild dengan inti ZIP-authoritative (GH.memoCore) dan
   data/payload ZIP (GH.memoData). UI, router, identitas, dan
   penyimpanan tetap memakai infrastruktur rebuild.
   ========================================================= */
(function () {
  'use strict';

  var GH = window.GH = window.GH || {};
  var U = GH.util;
  var S = GH.store;
  var R = GH.router;
  var UI = GH.ui;
  var Core = GH.memoCore || window.MemoCore || null;
  var MemoData = GH.memoData || null;

  var MODE_STYLE = {
    snapshot: { glyph: '◫', color: '#ffd479' },
    sequence: { glyph: '⌁', color: '#62c9ff' },
    glitch: { glyph: '◈', color: '#5de0c2' },
    copycat: { glyph: '☄', color: '#ff79c6' },
    echo: { glyph: '◉', color: '#b18cff' },
    mindtrap: { glyph: '✦', color: '#ff8a5b' }
  };

  var MODE_ORDER = Core && Core.MODES ? Core.MODES.slice() : ['snapshot', 'sequence', 'glitch', 'copycat', 'echo', 'mindtrap'];
  var DIFF_ORDER = Core && Core.DIFFS ? Core.DIFFS.slice() : ['easy', 'normal', 'hard', 'expert'];
  var DIFF_NAME = { easy: 'Mudah', normal: 'Normal', hard: 'Sulit', expert: 'Ahli' };

  var MODES = {};
  MODE_ORDER.forEach(function (id) {
    var info = (Core && Core.MODE_INFO && Core.MODE_INFO[id]) || {};
    var style = MODE_STYLE[id] || { glyph: '✦', color: '#9d8cff' };
    MODES[id] = {
      id: id,
      name: info.name || id.toUpperCase(),
      sub: info.sub || '',
      glyph: style.glyph,
      color: style.color,
      desc: info.desc || '',
      prompt: info.desc || ''
    };
  });

  var DIFFICULTY = {};
  DIFF_ORDER.forEach(function (id) {
    var info = (Core && Core.DIFF_INFO && Core.DIFF_INFO[id]) || {};
    DIFFICULTY[id] = {
      id: id,
      name: DIFF_NAME[id] || id,
      label: (DIFF_NAME[id] || id) + ' ×' + Number(info.mult || 1).toFixed(1).replace('.', ',')
    };
  });

  var MOD_ORDER = Core && Core.MODIFIERS ? Object.keys(Core.MODIFIERS) : [];
  var MOD_GLYPH = {
    reverse: '↺', doubleRecall: '⑂', distraction: '✳',
    falseFamiliarity: '◐', interference: '≈'
  };
  var MODIFIERS = MOD_ORDER.map(function (id) {
    var info = Core.MODIFIERS[id] || {};
    return { id: id, name: info.name || id, glyph: MOD_GLYPH[id] || '✦', desc: info.desc || '' };
  });

  var BOSS_PHASES = ((Core && Core.BOSS_PHASES) || []).map(function (phase) {
    return Object.assign({}, phase, {
      name: String(phase.title || '').replace(/^Fase \d+\s*·\s*/, ''),
      glyph: (MODES[phase.mode] || {}).glyph || '✦'
    });
  });

  var ROUND_OPTIONS = [10, 20, 30];

  var state = {
    screen: 'lobby',
    mode: MODE_ORDER[0],
    difficulty: 'normal',
    modifiers: [],
    rounds: 10,
    run: null,
    duel: null,
    duelResult: null,
    result: null,
    room: null,
    roomCountChoice: 10,
    autoDaily: false,
    paintToken: 0
  };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(value) { return U.esc(value == null ? '' : value); }
  function fmt(n) { return U.formatNumber(n); }

  function identitySnapshot() {
    if (!GH.identity || typeof GH.identity.getIdentity !== 'function') return null;
    return GH.identity.getIdentity();
  }
  function isRegistered() {
    if (!GH.identity || typeof GH.identity.isRegistered === 'function') {
      if (typeof GH.identity.isRegistered === 'function') return !!GH.identity.isRegistered();
    }
    var snap = identitySnapshot();
    return !!(snap && snap.registered);
  }
  function currentUid() {
    if (GH.identity && typeof GH.identity.getUid === 'function') return GH.identity.getUid();
    var snap = identitySnapshot();
    return snap && snap.uid;
  }
  function player() {
    var p = S.getProfile();
    return { name: p.name || 'Pemain', avatar: p.avatar || '🦊' };
  }
  function cloud() { return GH.cloud || null; }
  function dateKey() { return Core && Core.dateKey ? Core.dateKey() : U.dateKey(); }
  function localBoardKey(session) { return session && session.type === 'daily' ? 'memo:daily' : 'memo'; }
  function dailySeed() { return 'memo-daily-' + dateKey(); }
  function modeLabel(id) { return MODES[id] ? MODES[id].name : String(id || '').toUpperCase(); }
  function styleLabel(style) {
    return {
      practice: 'Latihan', standard: 'Latihan', daily: 'Tantangan harian',
      endless: 'Endless', boss: 'Boss', duel: 'Duel online'
    }[style] || 'Latihan';
  }

  function modifierNote() {
    var active = MODIFIERS.filter(function (m) { return state.modifiers.indexOf(m.id) >= 0; });
    if (!active.length) return 'Tanpa modifier. Pilih satu atau lebih untuk menambah tekanan.';
    return active.map(function (m) { return m.name + ': ' + m.desc; }).join(' · ');
  }

  /* ---------------- Run lifecycle ---------------- */

  function clearTimers(run) {
    if (!run) return;
    (run.timers || []).forEach(function (id) { clearTimeout(id); clearInterval(id); });
    run.timers = [];
    if (run.tick) { clearInterval(run.tick); run.tick = null; }
    if (run.phase) run.phase = null;
  }

  function schedule(run, fn, ms) {
    if (!run) return null;
    var id = setTimeout(function () {
      if (state.run !== run) return;
      fn();
    }, Math.max(0, ms));
    run.timers = run.timers || [];
    run.timers.push(id);
    return id;
  }

  function makeConfig(style, opts) {
    opts = opts || {};
    var type = style === 'practice' ? 'standard' : style;
    var special = ['daily', 'endless', 'boss'].indexOf(type) >= 0;
    var seed = opts.seed || ('memo-' + type + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8));
    return {
      type: type,
      practice: style === 'practice',
      mode: special ? null : (opts.mode || state.mode),
      diff: opts.difficulty || state.difficulty,
      rounds: opts.totalRounds || state.rounds,
      seed: seed,
      mods: style === 'practice' ? (opts.modifiers || state.modifiers || []).slice() : (type === 'duel' ? 'auto' : 'auto')
    };
  }

  function startRun(opts) {
    opts = opts || {};
    if (state.run) stopRun();
    var style = opts.style || 'practice';
    var cfg = opts.cfg || makeConfig(style, opts);
    var totalRounds = Core && typeof Core.totalRounds === 'function' ? Core.totalRounds(cfg) : cfg.rounds;
    if (!isFinite(totalRounds)) totalRounds = Infinity;
    var noLives = !!cfg.practice || cfg.type === 'duel';
    var run = {
      cfg: cfg,
      style: style,
      type: cfg.type,
      practice: !!cfg.practice,
      mode: cfg.mode || 'mix',
      difficulty: cfg.diff,
      modifiers: Array.isArray(cfg.mods) ? cfg.mods.slice() : [],
      seed: cfg.seed,
      roundIndex: 0,
      totalRounds: totalRounds,
      score: 0,
      combo: 0,
      bestCombo: 0,
      correct: 0,
      wrong: 0,
      lives: noLives ? Infinity : 3,
      livesLost: 0,
      hintsLeft: cfg.practice ? Infinity : (cfg.type === 'duel' ? 0 : 3),
      hintsUsed: 0,
      roundHints: 0,
      miniWrong: false,
      hintBusy: false,
      stopped: false,
      results: [],
      recent: [],
      player: opts.player || player(),
      startedAt: Date.now(),
      timers: [],
      tick: null,
      last: 0,
      phase: null,
      token: 0,
      stage: 'brief',
      round: null,
      input: null,
      result: null,
      duel: opts.duel || null,
      online: !!opts.online,
      questions: opts.questions || null,
      side: opts.side || null,
      startTimer: null,
      skip: null
    };
    if (style === 'duel' && opts.duel) {
      run.player = opts.player || player();
      run.seed = opts.duel.seed;
      run.cfg.seed = opts.duel.seed;
      run.cfg.mode = opts.duel.mode;
      run.cfg.diff = opts.duel.difficulty;
      run.cfg.rounds = opts.duel.rounds;
      run.totalRounds = opts.duel.rounds;
    }
    state.run = run;
    state.screen = 'play';
    state.result = null;
    state.duelResult = null;
    R.setGuard({
      title: run.online ? 'Keluar dari duel online?' : (style === 'duel' ? 'Keluar dari duel?' : 'Keluar dari sesi Memo?'),
      body: 'Skor dan ronde yang sedang berjalan belum disimpan.',
      confirmLabel: 'Ya, keluar',
      cancelLabel: 'Lanjut bermain',
      onAbort: function () {
        if (run.online) leaveRoom();
        stopRun();
        state.screen = 'lobby';
        paintHost();
      }
    });

    // Duel online menunggu startAtMillis room supaya kedua perangkat
    // memulai ronde identik pada waktu yang sama.
    if (run.online && opts.autoStartAt && Number(opts.autoStartAt) > Date.now()) {
      var startAt = Number(opts.autoStartAt);
      paintHost();
      var stage = document.querySelector('[data-view="memo"] .game-shell') || document.querySelector('[data-view="memo"]');
      UI.countdown(stage || document.body, {
        from: Math.max(1, Math.ceil((startAt - Date.now()) / 1000)),
        hint: 'Duel online dimulai…',
        finalLabel: 'Mulai!'
      }).then(function () {
        if (state.run !== run) return;
        var rest = Math.max(0, startAt - Date.now());
        if (rest > 0) {
          run.startTimer = setTimeout(function () {
            run.startTimer = null;
            if (state.run === run) beginRound();
          }, rest);
          run.timers.push(run.startTimer);
        } else beginRound();
      });
      return;
    }
    beginRound();
  }

  function stopRun() {
    if (state.run) clearTimers(state.run);
    document.removeEventListener('keydown', runKeyboard);
    state.run = null;
    state.screen = 'lobby';
  }

  function beginRound() {
    var run = state.run;
    if (!run || !Core) return;
    var round;
    if (run.online && run.questions && run.questions[run.roundIndex]) {
      // Ronde online berasal dari dokumen room host, identik di dua perangkat.
      round = JSON.parse(JSON.stringify(run.questions[run.roundIndex]));
    } else {
      var plan = Core.planRound(run.cfg, run.roundIndex, run.recent);
      round = Core.generateRound(Object.assign({}, plan, { recent: run.recent }));
      round.phase = plan.phase;
      round.phaseTitle = plan.phaseTitle;
    }
    run.recent.push(round.kind);
    if (run.recent.length > 4) run.recent.shift();
    run.round = round;
    run.stage = 'brief';
    run.input = { sel: [], seq: [], taps: [], choice: null, corrections: 0, eliminated: [], hinted: [], hintCells: [] };
    run.roundHints = 0;
    run.miniWrong = false;
    run.hintBusy = false;
    run.result = null;
    run.observeEvents = [];
    startTicker();
    paintHost();
    run.skip = function () { if (run.phase && run.phase.name === 'brief') run.phase.t = run.phase.dur; };
    startPhase('brief', round.mods.length || round.phaseTitle ? 2400 : 1500, { onEnd: observe });
  }

  function startTicker() {
    var run = state.run;
    if (!run) return;
    stopTicker();
    run.last = performance.now();
    run.tick = setInterval(function () {
      if (state.run !== run || !run.phase) return;
      var now = performance.now();
      var dt = Math.min(100, now - run.last);
      run.last = now;
      var phase = run.phase;
      phase.t += dt;
      (phase.events || []).forEach(function (ev) {
        if (!ev.done && phase.t >= ev.at) {
          ev.done = true;
          ev.fn();
        }
      });
      if (state.run !== run || run.phase !== phase) return;
      if (phase.onTick) phase.onTick(phase.t, phase.dur);
      if (state.run !== run || run.phase !== phase) return;
      if (phase.t >= phase.dur) {
        run.phase = null;
        updateTimerUi();
        if (phase.onEnd) phase.onEnd();
      }
    }, 40);
  }

  function stopTicker() {
    if (state.run && state.run.tick) {
      clearInterval(state.run.tick);
      state.run.tick = null;
    }
  }

  function startPhase(name, dur, opts) {
    var run = state.run;
    if (!run) return;
    opts = opts || {};
    run.phase = {
      name: name,
      dur: dur,
      t: 0,
      events: (opts.events || []).map(function (ev) { return { at: ev.at, fn: ev.fn, done: false }; }),
      onEnd: opts.onEnd,
      onTick: opts.onTick
    };
    renderStage();
    updateTimerUi();
  }

  function observe() {
    var run = state.run;
    if (!run || !run.round) return;
    var round = run.round;
    run.stage = 'observe';
    run.observeEvents = makeObserveEvents(run, round);
    run.skip = function () { if (run.phase && run.phase.name === 'observe') run.phase.t = run.phase.dur; };
    startPhase('observe', round.observeMs || 5000, {
      events: run.observeEvents,
      onEnd: afterObserve
    });
  }

  function makeObserveEvents(run, round) {
    var events = [];
    var scene = round.scene || {};
    if (round.mode === 'sequence') {
      (scene.items || []).forEach(function (item, i) {
        var at = 500 + i * ((scene.step || 700) + (scene.gap || 220));
        events.push({ at: at, fn: function () { showBigStim(item); markDot(i); } });
        events.push({ at: at + (scene.step || 700), fn: clearBigStim });
      });
    } else if (round.mode === 'copycat') {
      (scene.items || []).forEach(function (item, i) {
        var extra = scene.second && i >= scene.second.start ? 800 : 0;
        var at = 600 + i * ((scene.step || 800) + (scene.gap || 260)) + extra;
        if (scene.second && i === scene.second.start) {
          events.push({ at: Math.max(0, at - 600), fn: function () { setStageText('[data-memo-act]', 'Tayangan ke-2'); } });
        }
        events.push({ at: at, fn: function () { showBigStim(item); markDot(i); setStageText('[data-memo-act]', (item.g || '') + ' ' + (item.n || '')); } });
        events.push({ at: at + (scene.step || 800), fn: clearBigStim });
      });
    } else if (round.mode === 'echo' && scene.rhythm) {
      var t = 600;
      events.push({ at: t, fn: function () { pulsePad(); addTimeline(0); } });
      var total = (scene.rhythm || []).reduce(function (a, b) { return a + b; }, 0) || 1;
      var acc = 0;
      (scene.rhythm || []).forEach(function (iv) {
        t += iv;
        acc += iv;
        events.push({ at: t, fn: function () { pulsePad(); addTimeline(acc / total); } });
      });
    } else if (round.mode === 'echo') {
      (scene.items || []).forEach(function (item, i) {
        var at = 600 + i * ((scene.step || 700) + (scene.gap || 200));
        events.push({ at: at, fn: function () { litPad(item.id, true); } });
        events.push({ at: at + (scene.step || 700) * 0.75, fn: function () { litPad(item.id, false); } });
      });
    } else if (round.mode === 'mindtrap') {
      var elapsed = 0;
      (scene.phases || []).forEach(function (phase) {
        var at = elapsed;
        events.push({ at: at, fn: function () { showFacts(phase); } });
        elapsed += phase.ms || 0;
      });
    }
    return events;
  }

  function setStageText(sel, text) {
    var el = $(sel);
    if (el) el.textContent = text;
  }
  function markDot(i) {
    var dot = $$('[data-memo-dot]')[i];
    if (dot) dot.classList.add('is-now');
  }
  function showBigStim(item) {
    var stage = $('[data-memo-stage]');
    var big = stage && $('[data-memo-big]', stage);
    if (!big) return;
    big.className = 'memo-big-stim';
    big.style.setProperty('--stim', item.color || '#ffd479');
    big.innerHTML = '<span aria-hidden="true">' + esc(item.g) + '</span><strong>' + esc(item.n || item.id || '') + '</strong>';
  }
  function clearBigStim() {
    var big = $('[data-memo-big]');
    if (big) big.innerHTML = '<span>· · ·</span>';
  }
  function litPad(id, on) {
    $$('[data-memo-pad]').forEach(function (el) {
      if (el.dataset.memoPad === id) el.classList.toggle('is-lit', !!on);
    });
  }
  function pulsePad() {
    var pad = $('[data-memo-pulse-pad]');
    if (!pad) return;
    pad.classList.add('is-hit');
    setTimeout(function () { pad.classList.remove('is-hit'); }, 140);
  }
  function addTimeline(pos) {
    var line = $('[data-memo-timeline]');
    if (!line) return;
    var tick = document.createElement('i');
    tick.style.left = Math.max(0, Math.min(100, pos * 100)) + '%';
    line.appendChild(tick);
  }
  function showFacts(phase) {
    var box = $('[data-memo-facts]');
    if (!box) return;
    box.innerHTML = '<h3>' + esc(phase.title) + '</h3>' + (phase.lines || []).map(function (line) {
      if (line.update) return '<div class="memo-fact is-update">' + esc(line.update) + '</div>';
      return '<div class="memo-fact"><span>' + esc(line.name) + '</span><strong>' + esc(line.item) + '</strong>' +
        (line.room ? '<small>' + esc(line.room) + '</small>' : '') +
        (line.color ? '<small><i style="background:' + esc(line.colorHex) + '"></i> ' + esc(line.color) + '</small>' : '') + '</div>';
    }).join('');
  }

  function afterObserve() {
    var run = state.run;
    if (!run || !run.round) return;
    var round = run.round;
    var steps = [];
    steps.push(round.mode === 'glitch' ? 'scan' : 'hide');
    if (round.interference) steps.push('interference');
    if (round.delayMs) steps.push('delay');
    if (round.mini) steps.push('mini');
    run.stage = 'transition';
    run.skip = null;
    run.stepQueue = steps;
    run.stepIndex = 0;
    runNextStep();
  }

  function runNextStep() {
    var run = state.run;
    if (!run) return;
    if (run.stepIndex >= (run.stepQueue || []).length) {
      startRecall();
      return;
    }
    var step = run.stepQueue[run.stepIndex];
    var next = function () {
      if (state.run !== run) return;
      run.stepIndex += 1;
      runNextStep();
    };
    if (step === 'hide') {
      run.stepName = 'hide';
      startPhase('hide', (run.stepQueue.length === 1 ? 600 : 500), { onEnd: next });
    } else if (step === 'scan') {
      run.stepName = 'scan';
      startPhase('scan', run.round.scanMs || 1400, { onEnd: next });
    } else if (step === 'interference') {
      run.stepName = 'interference';
      startPhase('interference', (run.round.interference && run.round.interference.ms) || 2200, { onEnd: next });
    } else if (step === 'delay') {
      run.stepName = 'delay';
      startPhase('delay', run.round.delayMs || 3500, { onEnd: next });
    } else if (step === 'mini') {
      run.stepName = 'mini';
      run.miniDone = false;
      run.resolveMini = function (ok) {
        if (run.miniDone || state.run !== run) return;
        run.miniDone = true;
        run.miniWrong = !ok;
        run.phase = null;
        next();
      };
      startPhase('mini', (run.round.mini && run.round.mini.ms) || 7000, { onEnd: function () { run.resolveMini(false); } });
    } else {
      next();
    }
  }

  function startRecall() {
    var run = state.run;
    if (!run) return;
    run.stage = 'recall';
    run.skip = null;
    run.hintBusy = false;
    startPhase('recall', run.round.recallMs || 15000, {
      onEnd: function () { submit(true); }
    });
  }

  function updateTimerUi() {
    var run = state.run;
    if (!run) return;
    var phase = run.phase;
    var text = '—';
    var pct = 100;
    if (phase) {
      var left = Math.max(0, phase.dur - phase.t);
      pct = phase.dur ? (left / phase.dur) * 100 : 0;
      text = phase.name === 'recall' ? (left / 1000).toFixed(1) : String(Math.ceil(left / 1000));
    }
    $$('[data-memo-time]').forEach(function (el) { el.textContent = text; });
    var ring = $('[data-memo-ring]');
    if (ring) {
      ring.style.setProperty('--left', pct + '%');
      ring.classList.toggle('is-low', !!phase && phase.name === 'recall' && pct <= 25);
    }
    var bar = $('[data-memo-timebar]');
    if (bar) bar.style.width = pct + '%';
  }

  function collectInput(run) {
    var rc = run.round && run.round.recall;
    var input = run.input || {};
    if (!rc) return null;
    if (rc.type === 'choice') return input.choice;
    if (rc.type === 'cells') return input.sel.slice();
    if (rc.type === 'seq') return input.seq.slice();
    if (rc.type === 'rhythm') {
      var base = input.taps[0] || 0;
      return input.taps.map(function (t) { return t - base; });
    }
    return null;
  }

  function submit(timedOut, choiceIdx) {
    var run = state.run;
    if (!run || run.stage !== 'recall' || !run.round) return;
    var round = run.round;
    var elapsed = run.phase ? Math.min(run.phase.t, round.recallMs) : round.recallMs;
    run.phase = null;
    if (round.recall.type === 'choice' && choiceIdx != null) run.input.choice = choiceIdx;
    var input = collectInput(run);
    var val = Core.validate(round, input);
    var score = Core.scoreRound({
      diff: round.diff,
      prevCombo: run.combo,
      correct: val.correct,
      elapsedMs: timedOut ? round.recallMs : elapsed,
      recallMs: round.recallMs,
      hints: run.roundHints,
      corrections: run.input.corrections,
      miniWrong: run.miniWrong,
      practice: run.practice
    });
    run.score += score.total;
    if (val.correct) {
      run.combo += 1;
      if (run.combo > run.bestCombo) run.bestCombo = run.combo;
      run.correct += 1;
      if (GH.audio) GH.audio.correct();
    } else {
      run.combo = 0;
      run.wrong += 1;
      if (run.lives !== Infinity) {
        run.lives -= 1;
        run.livesLost += 1;
      }
      if (GH.audio) GH.audio.wrong();
    }
    var res = {
      i: run.roundIndex,
      mode: round.mode,
      kind: round.kind,
      diff: round.diff,
      mods: round.mods.slice(),
      correct: val.correct,
      accuracy: val.accuracy,
      ms: Math.round(timedOut ? round.recallMs : elapsed),
      timeout: !!timedOut,
      score: score.total,
      hints: run.roundHints,
      detail: val.detail,
      phase: round.phase,
      seqLen: round.recall.type === 'seq' ? round.recall.need : 0,
      comboAfter: run.combo,
      scoreParts: score,
      input: input
    };
    run.results.push(res);
    run.result = res;
    run.stage = 'feedback';
    run.skip = null;
    syncMemoRoom(false, run);
    updateTimerUi();
    paintHost();
  }

  function nextRound() {
    var run = state.run;
    if (!run || run.stage !== 'feedback') return;
    if (run.lives !== Infinity && run.lives <= 0) { finish('failed'); return; }
    run.roundIndex += 1;
    if (isFinite(run.totalRounds) && run.roundIndex >= run.totalRounds) { finish('completed'); return; }
    beginRound();
  }

  function buildSession(run, status) {
    var results = run.results || [];
    var answered = results.filter(function (r) { return !r.timeout; });
    var correct = results.filter(function (r) { return r.correct; }).length;
    var perRound = results.map(function (r) {
      return { c: r.correct ? 1 : 0, a: Number(r.accuracy.toFixed(2)), ms: r.ms, s: r.score, k: r.kind, m: r.mode, d: r.diff, p: r.phase };
    });
    var done = status === 'completed';
    if (run.type === 'endless') done = true;
    if (run.type === 'boss') done = status === 'completed';
    var snap = identitySnapshot();
    return {
      type: run.type,
      practice: !!run.practice,
      mode: run.cfg.mode || null,
      diff: run.cfg.diff || null,
      plannedRounds: isFinite(run.totalRounds) ? run.totalRounds : 0,
      rounds: results.length,
      total: results.length,
      correct: correct,
      score: run.score,
      bestCombo: run.bestCombo,
      hints: run.hintsUsed || 0,
      accuracy: results.length ? correct / results.length : 0,
      avgMs: answered.length ? Math.round(answered.reduce(function (a, b) { return a + b.ms; }, 0) / answered.length) : 0,
      totalMs: results.reduce(function (a, b) { return a + b.ms; }, 0),
      failed: status === 'failed',
      done: done,
      stopped: !!run.stopped,
      livesLost: run.livesLost,
      seed: run.cfg.seed,
      dateKey: run.type === 'daily' ? dateKey() : null,
      profileId: currentUid() || null,
      name: (snap && snap.name) || run.player.name,
      icon: (snap && snap.avatar) || run.player.avatar,
      maxSeqLen: results.reduce(function (m, r) { return r.correct && r.seqLen > m ? r.seqLen : m; }, 0),
      modesSeen: Array.from(new Set(results.map(function (r) { return r.mode; }))),
      player: run.player,
      perRound: perRound
    };
  }

  function saveMemoSession(session, won) {
    if (!MemoData || typeof MemoData.buildItem !== 'function') return Promise.resolve({ ok: false, skipped: true, reason: 'Data Memo belum dimuat.' });
    var item = MemoData.buildItem(session, { won: !!won });
    if (!item) return Promise.resolve({ ok: false, skipped: true, reason: session.practice ? 'Mode latihan tidak disimpan.' : 'Profil pemain belum terdaftar.' });
    var C = cloud();
    if (!C || typeof C.memoSaveSession !== 'function') return Promise.resolve({ ok: false, skipped: true, reason: 'Layanan Memo belum tersedia.' });
    return Promise.resolve(C.memoSaveSession(item)).catch(function (err) {
      return { ok: false, code: (err && err.code) || 'error', message: (err && err.message) || String(err) };
    });
  }

  function finish(status) {
    var run = state.run;
    if (!run) return;
    clearTimers(run);
    stopTicker();
    document.removeEventListener('keydown', runKeyboard);
    R.clearGuard();
    var session = buildSession(run, status);
    run.session = session;

    if (run.online && state.room) {
      // Duel online: kirim hasil ke slot room, lalu tunggu lawan selesai.
      // Pemenang dihitung lokal di kedua perangkat setelah slot lengkap.
      syncMemoRoom(true, run);
      var room = state.room;
      room.mySession = session;
      room.awaiting = true;
      state.duel = run.duel;
      state.screen = 'roomWaiting';
      paintHost();
      return;
    }

    var local = null;
    if (!session.practice) {
      var key = localBoardKey(session);
      local = S.addScore(key, {
        name: session.player.name,
        avatar: session.player.avatar,
        primary: false,
        score: session.score,
        correct: session.correct,
        total: session.total,
        accP: session.total ? Math.round(session.accuracy * 100) : 0,
        meta: {
          label: styleLabel(run.style) + ' · ' + modeLabel(run.mode) +
            ' · ' + (DIFFICULTY[run.difficulty] ? DIFFICULTY[run.difficulty].name : run.difficulty) +
            ' · ' + session.total + ' ronde'
        }
      });
      if (session.type === 'daily') S.markDaily(dateKey(), session.score);
    }
    S.recordActivity({
      game: 'memo',
      label: 'Memo Mayhem · ' + styleLabel(run.style),
      value: fmt(session.score) + ' poin'
    });

    state.result = { session: session, save: null, local: local, runStyle: run.style };
    state.run = null;
    state.screen = 'result';
    if (session.done && session.correct >= Math.ceil(session.total * 0.75)) {
      UI.confetti({ colors: ['#9d8cff', '#6cf5c8', '#ffd479', '#ff79c6', '#ffffff'] });
    }
    paintHost();
    saveMemoSession(session, false).then(function (res) {
      if (state.result && state.result.session === session) {
        state.result.save = res;
        paintHost();
      }
    });
  }

  /* ---------------- Online room duel (G4 Memo) ---------------- */

  function roomError(err) {
    var C = cloud();
    return C && typeof C.describeError === 'function'
      ? C.describeError(err)
      : String((err && err.message) || err || 'Gagal mengakses room.');
  }

  function roomSlotPlayer(slot) {
    return { name: (slot && slot.name) || 'Pemain', avatar: (slot && slot.avatar) || '🦊' };
  }

  function closeRoom() {
    var room = state.room;
    if (!room) return;
    if (GH.room && typeof GH.room.close === 'function') GH.room.close(room);
    if (room.startTimer) { clearTimeout(room.startTimer); room.startTimer = null; }
    state.room = null;
  }

  function leaveRoom() {
    var room = state.room;
    var wasHost = room && room.side === 'host';
    var code = room && room.code;
    closeRoom();
    if (wasHost && code && GH.room && typeof GH.room.abandon === 'function') {
      GH.room.abandon('memo', code);
    }
    state.duel = null;
    state.duelResult = null;
    state.screen = 'lobby';
  }

  function buildMemoRounds(cfg, count) {
    var recent = [];
    var out = [];
    for (var i = 0; i < count; i++) {
      var plan = Core.planRound(cfg, i, recent);
      var round = Core.generateRound(Object.assign({}, plan, { recent: recent }));
      // Firestore menolak field undefined; buang nilai kosong lewat JSON.
      out.push(JSON.parse(JSON.stringify(round)));
      recent.push(round.kind);
      if (recent.length > 4) recent.shift();
    }
    return out;
  }

  function syncMemoRoom(force, run) {
    var room = state.room;
    if (!room || !run || !GH.room || typeof GH.room.patchSlot !== 'function') return;
    var now = Date.now();
    if (!force && room.lastSync && now - room.lastSync < 1000) return;
    room.lastSync = now;
    var patch = {
      progress: Math.min(run.results.length, run.totalRounds),
      score: Math.round(run.score),
      correct: run.correct,
      mistakes: run.wrong,
      bestCombo: run.bestCombo
    };
    if (force) patch.finishedAt = now;
    GH.room.patchSlot('memo', room.code, room.side, patch).catch(function () {});
  }

  function resultFromSlot(slot) {
    slot = slot || {};
    return {
      score: Number(slot.score) || 0,
      correct: Number(slot.correct) || 0,
      mistakes: Number(slot.mistakes) || 0,
      bestCombo: Number(slot.bestCombo) || 0,
      progress: Number(slot.progress) || 0,
      player: roomSlotPlayer(slot),
      duel: true
    };
  }

  function memoWinnerSide(a, b) {
    var as = Number(a.score) || 0;
    var bs = Number(b.score) || 0;
    if (as !== bs) return as > bs ? 'host' : 'guest';
    return null;
  }

  function startOnlineSession(doc, room) {
    var first = (doc.questions && doc.questions[0]) || {};
    var players = [roomSlotPlayer(doc.host), roomSlotPlayer(doc.guest)];
    var duel = {
      players: players,
      seed: 'memo-room-' + room.code,
      rounds: doc.count || (doc.questions ? doc.questions.length : 10),
      difficulty: first.diff || state.difficulty,
      mode: first.mode || state.mode,
      results: [],
      online: true
    };
    state.duel = duel;
    state.duelResult = null;
    startRun({
      style: 'duel',
      mode: duel.mode,
      difficulty: duel.difficulty,
      totalRounds: duel.rounds,
      seed: duel.seed,
      player: roomSlotPlayer(doc[room.side]),
      duel: duel,
      questions: doc.questions,
      online: true,
      side: room.side,
      autoStartAt: doc.startAtMillis
    });
  }

  function finalizeOnlineDuel(doc) {
    var room = state.room;
    if (!room || room.finalized) return;
    room.finalized = true;
    var a = resultFromSlot(doc.host);
    var b = resultFromSlot(doc.guest);
    var side = memoWinnerSide(a, b);
    var players = [roomSlotPlayer(doc.host), roomSlotPlayer(doc.guest)];
    if (!state.duel) state.duel = { players: players, rounds: doc.count, results: [] };
    state.duel.players = players;
    state.duel.results = [a, b];
    var winner = side ? players[side === 'host' ? 0 : 1] : null;
    state.duelResult = { a: a, b: b, winner: winner, online: true, saves: [] };
    if (room.side === 'host' && GH.room && typeof GH.room.finish === 'function') {
      GH.room.finish('memo', room.code, side || 'draw').catch(function () {});
    }
    if (winner) S.addDuelWin('memo', winner.name, winner.avatar, { primary: false });
    S.recordActivity({
      game: 'memo',
      label: 'Duel online Memo · ' + players[0].name + ' vs ' + players[1].name,
      value: winner ? winner.name + ' menang' : 'Seri'
    });
    var mine = room.mySession;
    state.duelResult.saves = [mine
      ? saveMemoSession(mine, side === room.side)
      : Promise.resolve({ skipped: true, reason: 'Sesi tidak tersedia.' })];
    Promise.all(state.duelResult.saves).then(function (saves) {
      if (state.duelResult && state.duelResult.online) state.duelResult.saves = saves;
      paintHost();
    });
    if (side && GH.audio) GH.audio.win();
    if (side) UI.confetti({ colors: ['#9d8cff', '#6cf5c8', '#ffd479', '#ff79c6'] });
    state.screen = 'duelResult';
    paintHost();
  }

  function handleRoomDoc(doc) {
    var room = state.room;
    if (!room || !doc) return;
    room.doc = doc;
    if (doc.status === 'abandoned') {
      if (state.screen === 'roomLobby' || state.screen === 'roomWaiting') {
        UI.toast({ title: 'Room dibatalkan', msg: 'Tuan room menutup pertandingan.', type: 'warning' });
        closeRoom();
        state.duel = null;
        state.duelResult = null;
        state.screen = 'lobby';
        paintHost();
      }
      return;
    }
    if (doc.status === 'countdown' && doc.guest && room.side === 'host' && !room.started && GH.room) {
      room.started = true;
      GH.room.start('memo', room.code, Date.now() + 3000).catch(function (err) {
        room.started = false;
        UI.toast({ title: 'Gagal memulai', msg: roomError(err), type: 'error' });
      });
      return;
    }
    if (doc.status === 'playing' && doc.startAtMillis && !room.sessionStarted) {
      room.sessionStarted = true;
      startOnlineSession(doc, room);
      return;
    }
    if (room.awaiting && doc.host && doc.guest && doc.host.finishedAt && doc.guest.finishedAt) {
      finalizeOnlineDuel(doc);
      return;
    }
    if (state.screen === 'roomLobby' || state.screen === 'roomWaiting') paintHost();
  }

  function attachRoom(side, doc) {
    closeRoom();
    var room = {
      code: doc.code,
      side: side,
      doc: doc,
      unsub: null,
      started: false,
      sessionStarted: false,
      awaiting: false,
      finalized: false,
      lastSync: 0,
      startTimer: null,
      mySession: null
    };
    state.room = room;
    if (GH.room && typeof GH.room.watch === 'function') {
      room.unsub = GH.room.watch('memo', room.code, function (next) {
        handleRoomDoc(next);
      }, function (err) {
        UI.toast({ title: 'Room terputus', msg: roomError(err), type: 'error' });
      });
    }
    handleRoomDoc(doc);
  }

  function openRoomDialog() {
    if (!isRegistered()) {
      UI.toast({ title: 'Profil diperlukan', msg: 'Buat profil terdaftar dulu untuk duel online.', type: 'warning' });
      if (GH.app && typeof GH.app.openCreateProfile === 'function') GH.app.openCreateProfile();
      return Promise.resolve(false);
    }
    if (!GH.room || typeof GH.room.create !== 'function') {
      UI.toast({ title: 'Belum tersedia', msg: 'Layanan room belum dimuat. Muat ulang halaman.', type: 'error' });
      return Promise.resolve(false);
    }

    var mode = 'create';
    var count = state.roomCountChoice;
    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="segmented" role="group" aria-label="Mode room">' +
        '<button class="segmented__btn" type="button" data-room-mode="create" aria-pressed="true">Buat room</button>' +
        '<button class="segmented__btn" type="button" data-room-mode="join" aria-pressed="false">Gabung room</button>' +
      '</div>' +
      '<div class="room-create-pane">' +
        '<p class="label">Jumlah ronde</p><div class="segmented segmented--wide" role="group" aria-label="Jumlah ronde">' +
          ROUND_OPTIONS.map(function (n) {
            return '<button class="segmented__btn" type="button" data-room-count="' + n + '" aria-pressed="' + (n === count ? 'true' : 'false') + '">' + n + ' ronde</button>';
          }).join('') +
        '</div>' +
        '<p class="tiny muted">Kamu mendapat kode 5 karakter untuk dibagikan ke lawan. Mode, kesulitan, dan modifier mengikuti aturan ZIP.</p>' +
      '</div>' +
      '<div class="room-join-pane" hidden>' +
        '<label class="label" for="roomCodeInput">Kode room</label>' +
        '<input class="input input--code" id="roomCodeInput" maxlength="6" autocomplete="off" spellcheck="false" placeholder="AB12C" aria-describedby="roomError">' +
        '<p class="input-error" id="roomError" role="alert"></p>' +
        '<p class="tiny muted">Masukkan kode dari tuan room. Keduanya harus memakai profil terdaftar.</p>' +
      '</div>' +
      '<div class="notice notice--warning"><p>Duel online memakai profil terdaftar dan menulis ronde serta progres ke room Firestore. Mode tamu tetap tidak menulis data.</p></div>';

    var createPane = wrap.querySelector('.room-create-pane');
    var joinPane = wrap.querySelector('.room-join-pane');
    var input = wrap.querySelector('#roomCodeInput');
    var errorEl = wrap.querySelector('#roomError');
    var submitBtn = null;
    var busy = false;

    function setError(msg) { errorEl.textContent = msg || ''; }
    function switchMode(next) {
      mode = next;
      Array.prototype.forEach.call(wrap.querySelectorAll('[data-room-mode]'), function (b) {
        b.setAttribute('aria-pressed', b.dataset.roomMode === mode ? 'true' : 'false');
      });
      createPane.hidden = mode !== 'create';
      joinPane.hidden = mode !== 'join';
      setError('');
      if (mode === 'join') input.focus();
    }

    return UI.modal({
      title: 'Duel online · Memo Mayhem',
      subtitle: 'Dua perangkat, satu kode room, ronde identik.',
      body: wrap,
      actions: [
        { label: 'Batal', value: false, variant: 'ghost' },
        { label: 'Buat room', value: false, variant: 'primary', id: 'roomSubmit', onClick: function (modal, close) {
            if (busy) return false;
            if (mode === 'join' && !/^[A-Z0-9]{4,6}$/.test(String(input.value || '').trim().toUpperCase())) {
              setError('Kode harus 4–6 huruf/angka.');
              input.focus();
              return false;
            }
            busy = true;
            submitBtn.disabled = true;
            var previousLabel = submitBtn.textContent;
            submitBtn.textContent = 'Menyiapkan…';
            var task;
            if (mode === 'create') {
              var cfg = {
                type: 'duel',
                mode: state.mode,
                diff: state.difficulty,
                rounds: count,
                seed: 'memo-duel-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
                mods: 'auto'
              };
              task = Promise.resolve().then(function () {
                return buildMemoRounds(cfg, count);
              }).then(function (questions) {
                return GH.room.create('memo', count, questions, function (doc) {
                  attachRoom('host', doc);
                });
              });
            } else {
              task = GH.room.join('memo', input.value).then(function (doc) {
                attachRoom('guest', doc);
              });
            }
            task.then(function (code) {
              close(true);
              if (state.screen === 'lobby') state.screen = mode === 'create' ? 'roomLobby' : 'roomWaiting';
              UI.toast({
                title: mode === 'create' ? 'Room dibuat' : 'Bergabung',
                msg: mode === 'create' ? 'Bagikan kode ' + code + ' ke lawan.' : ('Kode ' + code + '. Menunggu tuan room memulai.'),
                type: 'success'
              });
              paintHost();
            }).catch(function (err) {
              busy = false;
              submitBtn.disabled = false;
              submitBtn.textContent = previousLabel;
              setError(roomError(err));
            });
            return false;
          }}
      ],
      onMount: function (modal) {
        submitBtn = modal.querySelector('#roomSubmit');
        Array.prototype.forEach.call(wrap.querySelectorAll('[data-room-mode]'), function (b) {
          b.addEventListener('click', function () { switchMode(b.dataset.roomMode); });
        });
        Array.prototype.forEach.call(wrap.querySelectorAll('[data-room-count]'), function (b) {
          b.addEventListener('click', function () {
            count = Number(b.dataset.roomCount) || 10;
            state.roomCountChoice = count;
            Array.prototype.forEach.call(wrap.querySelectorAll('[data-room-count]'), function (x) {
              x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
            });
          });
        });
        input.addEventListener('input', function () { setError(''); });
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' && submitBtn && !submitBtn.disabled) {
            e.preventDefault();
            submitBtn.click();
          }
        });
      }
    });
  }

  /* ---------------- Render helpers ---------------- */

  function objHtml(o, small) {
    var shape = Core && Core.shapeById ? Core.shapeById(o.shape) : { g: '●', n: o.shape };
    var color = Core && Core.colorById ? Core.colorById(o.color) : { hex: '#9d8cff', n: o.color };
    return '<span class="memo-obj' + (small ? ' memo-obj--sm' : '') + '" style="--cell:' + esc(color.hex) + '">' +
      '<b aria-hidden="true">' + esc(shape.g) + '</b><small>' + esc(shape.n + ' ' + color.n) + '</small></span>';
  }

  function gridHtml(cols, rows, cellFn, cls, tag) {
    var t = tag || 'div';
    var html = '<div class="memo-grid ' + (cls || '') + '" style="--cols:' + Number(cols || 3) + ';--rows:' + Number(rows || 3) + '">';
    for (var c = 0; c < cols * rows; c++) {
      html += '<' + t + ' class="memo-cell" data-memo-cell-index="' + c + '">' + cellFn(c) + '</' + t + '>';
    }
    return html + '</div>';
  }

  function optionLabel(o) {
    return o.label || o.text || o.n || '';
  }

  function phaseHead(title, sub) {
    return '<div class="memo-stimulus__head"><span class="eyebrow">' + esc(sub || 'Fase ingat') + '</span><h2>' + esc(title) + '</h2></div>';
  }

  function observeHtml(run) {
    var round = run.round;
    var scene = round.scene || {};
    var caption = scene.caption || 'Amati baik-baik';
    if (round.mode === 'snapshot') {
      var byCell = {};
      (scene.items || []).forEach(function (item) { byCell[item.cell] = item; });
      return '<div class="memo-stimulus">' + phaseHead(caption, 'Snapshot · amati') +
        gridHtml(scene.cols, scene.rows, function (c) { return byCell[c] ? objHtml(byCell[c]) : ''; }, 'memo-grid--scene') +
        '</div>';
    }
    if (round.mode === 'glitch') {
      return '<div class="memo-stimulus">' + phaseHead(caption, 'Glitch Hunter · amati') +
        gridHtml(scene.cols, scene.rows, function (c) { return scene.A[c] ? objHtml(scene.A[c]) : ''; }, 'memo-grid--scene') +
        '</div>';
    }
    if (round.mode === 'mindtrap') {
      return '<div class="memo-stimulus"><div class="memo-facts" data-memo-facts>' +
        '<h3>' + esc((scene.phases && scene.phases[0] && scene.phases[0].title) || 'Data awak stasiun') + '</h3>' +
        ((scene.phases && scene.phases[0] && scene.phases[0].lines) || []).map(function (line) {
          return '<div class="memo-fact"><span>' + esc(line.name) + '</span><strong>' + esc(line.item) + '</strong>' +
            (line.room ? '<small>' + esc(line.room) + '</small>' : '') +
            (line.color ? '<small><i style="background:' + esc(line.colorHex) + '"></i> ' + esc(line.color) + '</small>' : '') + '</div>';
        }).join('') + '</div></div>';
    }
    if (round.mode === 'echo' && scene.rhythm) {
      return '<div class="memo-stimulus memo-rhythm-stage">' + phaseHead(caption, 'Echo Chamber · dengarkan') +
        '<button class="memo-rhythm-pad" type="button" disabled data-memo-pulse-pad aria-hidden="true">🥁</button>' +
        '<div class="memo-timeline" data-memo-timeline></div></div>';
    }
    if (round.mode === 'echo' && !scene.rhythm) {
      var pool = round.recall.pool || [];
      return '<div class="memo-stimulus">' + phaseHead(caption, 'Echo Chamber · dengarkan') +
        '<div class="memo-pads">' + pool.map(function (p) {
          return '<div class="memo-pad" data-memo-pad="' + esc(p.id) + '" style="--sym:' + esc(p.color || '#9d8cff') + '">' +
            '<span aria-hidden="true">' + esc(p.g) + '</span><small>' + esc(p.n) + '</small></div>';
        }).join('') + '</div></div>';
    }
    return '<div class="memo-stimulus memo-sequence-preview">' + phaseHead(caption, modeLabel(round.mode) + ' · amati') +
      '<div class="memo-preview-dots">' + (scene.items || []).map(function (_, i) { return '<i data-memo-dot="' + i + '"></i>'; }).join('') + '</div>' +
      '<div class="memo-big-stim" data-memo-big><span>· · ·</span></div>' +
      '<p class="tiny muted" data-memo-act>' + (round.mode === 'copycat' ? 'Perhatikan gerakan Mimo.' : 'Stimulus tampil satu per satu.') + '</p>' +
      '</div>';
  }

  function transitionHtml(run) {
    var step = run.stepName;
    var round = run.round || {};
    if (step === 'scan') {
      return '<div class="memo-stimulus memo-scan"><span>📡 MEMINDAI…</span><div class="memo-scan-bar"></div><p class="tiny muted">Adegan sedang diubah sistem.</p></div>';
    }
    if (step === 'interference') {
      return '<div class="memo-stimulus"><div class="memo-noise"><strong>📡 Sinyal asing masuk — abaikan!</strong>' +
        '<div class="memo-noise-row">' + ((round.interference && round.interference.items) || []).map(function (o) { return objHtml(o, true); }).join('') + '</div>' +
        '<p class="tiny muted">Ini bukan bagian yang perlu diingat.</p></div></div>';
    }
    if (step === 'mini') {
      var mini = round.mini || {};
      return '<div class="memo-stimulus memo-mini"><span class="eyebrow">Double Recall</span><h2>' + esc(mini.text) + ' = ?</h2>' +
        '<div class="memo-choices memo-choices--mini">' + (mini.options || []).map(function (opt, i) {
          return '<button class="memo-choice" type="button" data-memo-mini="' + i + '"><span class="memo-choice__key">' + (i + 1) + '</span><span class="memo-choice__text">' + esc(opt) + '</span></button>';
        }).join('') + '</div></div>';
    }
    return '<div class="memo-going"><span>Menyimpan memori…</span><small>' + (step === 'delay' ? 'Tahan ingatanmu' : 'Bersiap menjawab') + '</small></div>';
  }

  function recallHtml(run) {
    var round = run.round;
    var rc = round.recall || {};
    var input = run.input || {};
    var head = '<div class="memo-recall__head"><span class="eyebrow">Fase jawab · ' + esc(round.title || modeLabel(round.mode)) + '</span>' +
      '<h2>' + esc(round.prompt) + '</h2><p class="tiny muted">Waktu terus berjalan. Jawab dengan teliti.</p></div>';
    var body = '';

    if (rc.type === 'choice') {
      body = '<div class="memo-choices memo-choices--' + Number(rc.cols || 2) + '">' + (rc.options || []).map(function (opt, i) {
        var removed = input.eliminated.indexOf(i) >= 0;
        return '<button class="memo-choice' + (removed ? ' is-removed' : '') + '" type="button" data-memo-choice="' + i + '"' + (removed ? ' disabled' : '') + '>' +
          '<span class="memo-choice__key">' + String.fromCharCode(65 + i) + '</span>' +
          '<span class="memo-choice__text">' + esc(optionLabel(opt)) + '</span></button>';
      }).join('') + '</div>';
    } else if (rc.type === 'cells') {
      var byCell = {};
      if (rc.base === 'B') (round.scene.B || []).forEach(function (o, c) { if (o) byCell[c] = o; });
      body = gridHtml(rc.cols, rc.rows, function (c) { return byCell[c] ? objHtml(byCell[c]) : ''; }, 'memo-grid--click', 'button') +
        '<div class="memo-recall-bar"><span data-memo-count>' + input.sel.length + ' / ' + rc.pick + ' dipilih</span>' +
        '<button class="btn btn--ghost btn--sm" type="button" data-memo-clear-select>Ulang</button>' +
        '<button class="btn btn--primary btn--sm" type="button" data-memo-submit-cell' + (input.sel.length === rc.pick ? '' : ' disabled') + '>Kirim</button></div>';
    } else if (rc.type === 'seq') {
      var find = function (id) { return (rc.pool || []).filter(function (p) { return p.id === id; })[0]; };
      var slots = '';
      if (rc.slots) {
        rc.slots.forEach(function (given, i) {
          var picked = i === 0 && input.seq[0] ? find(input.seq[0]) : null;
          slots += '<div class="memo-slot' + (given ? ' is-given' : ' is-hole') + '">' +
            (given ? esc(given.g) : (picked ? esc(picked.g) : '<i>' + (i + 1) + '</i>')) + '</div>';
        });
      } else {
        for (var i = 0; i < rc.need; i++) {
          var item = find(input.seq[i]);
          slots += '<div class="memo-slot' + (item ? ' is-filled' : (i === input.seq.length ? ' is-next' : '')) + (input.hinted.indexOf(i) >= 0 ? ' is-hinted' : '') + '">' +
            (item ? esc(item.g) : '<i>' + (i + 1) + '</i>') + '</div>';
        }
      }
      body = '<div class="memo-slots" data-memo-slots>' + slots + '</div>' +
        '<div class="memo-palette">' + (rc.pool || []).map(function (p) {
          var eliminated = input.eliminated.indexOf(p.id) >= 0;
          return '<button class="memo-symbol' + (eliminated ? ' is-removed' : '') + '" type="button" data-memo-symbol="' + esc(p.id) + '" style="--sym:' + esc(p.color || '#9d8cff') + '"' + (eliminated ? ' disabled' : '') + '>' +
            '<span aria-hidden="true">' + esc(p.g) + '</span><small>' + esc(p.n) + '</small></button>';
        }).join('') + '</div>' +
        '<div class="memo-recall-bar"><button class="btn btn--ghost btn--sm" type="button" data-memo-undo>Undo</button>' +
        '<button class="btn btn--ghost btn--sm" type="button" data-memo-clear-seq>Ulang</button>' +
        '<button class="btn btn--primary btn--sm" type="button" data-memo-submit-seq' + (input.seq.length === rc.need ? '' : ' disabled') + '>Kirim</button></div>';
      if (round.legend) {
        var ids = {};
        (rc.pool || []).forEach(function (p) { ids[p.id] = true; });
        var pairs = (Core && Core.MIRROR_PAIRS || []).filter(function (pair) { return ids[pair[0]] && ids[pair[1]]; }).map(function (pair) {
          var a = (Core && Core.ACTIONS || []).filter(function (x) { return x.id === pair[0]; })[0] || { g: pair[0] };
          var b = (Core && Core.ACTIONS || []).filter(function (x) { return x.id === pair[1]; })[0] || { g: pair[1] };
          return esc(a.g + ' ↔ ' + b.g);
        }).join(' · ');
        body = '<div class="memo-legend">Aturan cermin: ' + pairs + '</div>' + body;
      }
    } else if (rc.type === 'rhythm') {
      body = '<div class="memo-rhythm-stage">' +
        '<button class="memo-rhythm-pad" type="button" data-memo-tap>🥁<small>KETUK</small></button>' +
        '<div class="memo-beat-dots">' + Array.from({ length: rc.beats }, function (_, i) {
          return '<i' + (i < input.taps.length ? ' class="is-on"' : '') + '></i>';
        }).join('') + '</div>' +
        '<button class="btn btn--ghost btn--sm" type="button" data-memo-clear-taps>Ulangi ketukan</button></div>';
    }

    return '<div class="memo-recall">' + head + body + '</div>';
  }

  function feedbackHtml(run) {
    var res = run.result;
    var round = run.round;
    if (!res || !round) return '';
    var sc = res.scoreParts || {};
    var parts = [];
    if (res.correct) {
      parts.push('Dasar ' + (sc.base || 0) + ' ×' + Number(sc.diffMult || 1).toFixed(1).replace('.', ','));
      if (sc.speed) parts.push('Kecepatan +' + sc.speed);
      if (sc.accuracy) parts.push('Akurasi +' + sc.accuracy);
      if (sc.perfect) parts.push('Sempurna +' + sc.perfect);
      if (sc.penalty) parts.push('Penalti −' + sc.penalty);
    }
    var status = res.correct ? ['is-success', '✓ Recall benar'] : res.timeout ? ['is-fail', 'Waktu habis'] : ['is-fail', 'Belum tepat'];
    var detail = res.correct ? '+' + fmt(res.score) + ' poin' : 'Combo putus';
    var explain = '';
    if (run.type !== 'duel') {
      explain = round.explain || '';
      if (round.mods.indexOf('doubleRecall') >= 0 && run.miniWrong) explain += ' Hitungan singkat salah, penalti −10.';
      if (!res.correct) {
        var correctText = solutionText(run, res);
        if (correctText) explain = 'Jawaban benar: ' + correctText + '. ' + explain;
      }
    } else {
      explain = 'Detail jawaban disembunyikan di mode duel agar adil.';
    }
    var last = isFinite(run.totalRounds) && run.roundIndex + 1 >= run.totalRounds;
    return '<div class="memo-feedback ' + status[0] + '">' +
      '<span class="memo-feedback__glyph" aria-hidden="true">' + (res.correct ? '✓' : '✕') + '</span>' +
      '<h2>' + status[1] + '</h2><strong>' + detail + '</strong>' +
      (parts.length ? '<p class="memo-feedback__math">' + esc(parts.join(' · ')) + '</p>' : '') +
      (explain ? '<p>' + esc(explain) + '</p>' : '') +
      '<div class="memo-feedback__actions">' +
        (run.type === 'endless' ? '<button class="btn btn--ghost btn--sm" type="button" data-memo-stop-endless>🏁 Berhenti</button>' : '') +
        '<button class="btn btn--primary btn--sm" type="button" data-memo-next>' + (last || (run.lives !== Infinity && run.lives <= 0) ? 'Lihat hasil' : 'Lanjut ▶') + '</button>' +
      '</div></div>';
  }

  function solutionText(run, res) {
    var round = run.round;
    var rc = round.recall || {};
    if (rc.type === 'choice') {
      var opt = (rc.options || [])[round.answer];
      return opt ? optionLabel(opt) : '';
    }
    if (rc.type === 'cells') {
      return (round.answer || []).map(function (c) {
        return 'baris ' + (Math.floor(c / rc.cols) + 1) + ', kolom ' + (c % rc.cols + 1);
      }).join(' · ');
    }
    if (rc.type === 'seq') {
      return (rc.pool || []).filter(function (p) { return (round.answer || []).indexOf(p.id) >= 0; })
        .map(function (p) { return p.g; }).join(' → ');
    }
    if (rc.type === 'rhythm') return (rc.intervals || []).join(' ms · ') + ' ms';
    return '';
  }

  function stageHtml(run) {
    if (run.stage === 'brief') {
      var round = run.round || {};
      return '<div class="memo-stimulus memo-brief"><span class="memo-brief-ico" aria-hidden="true">' + esc((MODES[round.mode] || {}).glyph || '✦') + '</span>' +
        '<span class="eyebrow">Bersiap</span><h2>' + esc(round.title || modeLabel(round.mode)) + '</h2>' +
        '<p class="tiny muted">' + esc(modeLabel(round.mode)) + ' · ' + esc((DIFFICULTY[round.diff] || {}).name || round.diff) + '</p>' +
        (round.mods && round.mods.length ? '<div class="memo-active-mods">' + round.mods.map(function (id) {
          var m = MODIFIERS.filter(function (x) { return x.id === id; })[0] || { glyph: '✦', name: id };
          return '<span class="badge">' + esc(m.glyph) + ' ' + esc(m.name) + '</span>';
        }).join('') + '</div>' : '') +
        (round.phaseTitle ? '<p class="memo-phase-note">👾 ' + esc(round.phaseTitle) + '</p>' : '') + '</div>';
    }
    if (run.stage === 'observe') return observeHtml(run);
    if (run.stage === 'transition') return transitionHtml(run);
    if (run.stage === 'recall') return recallHtml(run);
    if (run.stage === 'feedback') return feedbackHtml(run);
    return '<div class="memo-going"><span>Menyiapkan…</span></div>';
  }

  function distractionHtml(round) {
    var text = String(round.seed || '') + ':' + (round.index || 0) + ':' + String(round.mode || '');
    var hash = 2166136261;
    for (var i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = (hash * 16777619) >>> 0;
    }
    var edges = ['top', 'right', 'bottom', 'left'];
    var glyphs = ['✦', '✧', '✳', '✺'];
    var stars = '';
    for (var s = 0; s < 8; s++) {
      var edge = edges[s % edges.length];
      var pos = 8 + ((hash >>> (s * 3)) & 31);
      var delay = (((hash >>> (s * 2 + 1)) & 15) / 10).toFixed(1);
      stars += '<i class="memo-distraction__star memo-distraction__star--' + edge +
        '" style="--pos:' + pos + '%;--delay:' + delay + 's">' + glyphs[s % glyphs.length] + '</i>';
    }
    return '<div class="memo-distraction" aria-hidden="true">' +
      '<span class="memo-distraction__label">Gangguan kosmik — abaikan bintang di tepi</span>' + stars + '</div>';
  }

  function renderStage() {
    var run = state.run;
    var stage = $('[data-memo-stage]');
    if (!run || !stage) return;
    stage.innerHTML = stageHtml(run);
    if (run.stage === 'observe' && run.round && run.round.distraction) stage.insertAdjacentHTML('beforeend', distractionHtml(run.round));
    bindStage(run, stage);
  }

  function bindStage(run, stage) {
    if (run.phase && run.phase.name === 'mini') {
      $$('[data-memo-mini]', stage).forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (!run.resolveMini) return;
          run.resolveMini(Number(btn.dataset.memoMini) === run.round.mini.answer);
        });
      });
    }
    if (run.stage === 'recall') {
      $$('[data-memo-choice]', stage).forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (btn.disabled) return;
          submit(false, Number(btn.dataset.memoChoice));
        });
      });
      $$('[data-memo-cell-index]', stage).forEach(function (btn) {
        btn.addEventListener('click', function () { toggleCell(run, Number(btn.dataset.memoCellIndex)); });
      });
      var clearSelect = $('[data-memo-clear-select]', stage);
      if (clearSelect) clearSelect.addEventListener('click', function () {
        if (!run.input.sel.length) return;
        run.input.sel = [];
        run.input.corrections += 1;
        refreshCellsUi(stage);
      });
      var submitCell = $('[data-memo-submit-cell]', stage);
      if (submitCell) submitCell.addEventListener('click', function () {
        if (run.input.sel.length === run.round.recall.pick) submit(false);
      });
      $$('[data-memo-symbol]', stage).forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (btn.disabled || run.input.seq.length >= run.round.recall.need && run.round.recall.need !== 1) return;
          var id = btn.dataset.memoSymbol;
          if (run.round.recall.need === 1) run.input.seq = [id];
          else run.input.seq.push(id);
          refreshSeqUi(stage);
          if (run.input.seq.length >= run.round.recall.need) submit(false);
        });
      });
      var undo = $('[data-memo-undo]', stage);
      if (undo) undo.addEventListener('click', function () {
        if (!run.input.seq.length) return;
        run.input.seq.pop();
        run.input.corrections += 1;
        refreshSeqUi(stage);
      });
      var clearSeq = $('[data-memo-clear-seq]', stage);
      if (clearSeq) clearSeq.addEventListener('click', function () {
        if (!run.input.seq.length) return;
        run.input.seq = [];
        run.input.corrections += 1;
        refreshSeqUi(stage);
      });
      var submitSeq = $('[data-memo-submit-seq]', stage);
      if (submitSeq) submitSeq.addEventListener('click', function () {
        if (run.input.seq.length === run.round.recall.need) submit(false);
      });
      var tap = $('[data-memo-tap]', stage);
      if (tap) {
        var hit = function (ev) {
          if (run.stage !== 'recall' || run.input.taps.length >= run.round.recall.beats) return;
          if (ev && ev.repeat) return;
          run.input.taps.push(ev && ev.timeStamp ? ev.timeStamp : performance.now());
          tap.classList.add('is-hit');
          setTimeout(function () { tap.classList.remove('is-hit'); }, 120);
          $$('[data-memo-beat]', stage).forEach(function (dot, i) { dot.classList.toggle('is-on', i < run.input.taps.length); });
          if (run.input.taps.length === run.round.recall.beats) {
            schedule(run, function () { if (state.run === run && run.stage === 'recall') submit(false); }, 350);
          }
        };
        run.tapPad = hit;
        tap.addEventListener('pointerdown', function (ev) { ev.preventDefault(); hit(ev); });
        tap.addEventListener('keydown', function (ev) {
          if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); hit(ev); }
        });
      }
      var clearTaps = $('[data-memo-clear-taps]', stage);
      if (clearTaps) clearTaps.addEventListener('click', function () {
        run.input.taps = [];
        run.input.corrections += 1;
        $$('[data-memo-beat]', stage).forEach(function (dot) { dot.classList.remove('is-on'); });
      });
    }
    if (run.stage === 'feedback') {
      var next = $('[data-memo-next]', stage);
      if (next) next.addEventListener('click', nextRound);
      var stop = $('[data-memo-stop-endless]', stage);
      if (stop) stop.addEventListener('click', function () { run.stopped = true; finish('completed'); });
    }
  }

  function toggleCell(run, cell) {
    var sel = run.input.sel;
    var at = sel.indexOf(cell);
    if (at >= 0) sel.splice(at, 1);
    else {
      if (sel.length >= run.round.recall.pick) {
        sel.shift();
        run.input.corrections += 1;
      }
      sel.push(cell);
    }
    refreshCellsUi($('[data-memo-stage]'));
  }

  function refreshCellsUi(stage) {
    if (!stage) return;
    var run = state.run;
    if (!run) return;
    var sel = run.input.sel || [];
    var hints = run.input.hintCells || [];
    $$('[data-memo-cell-index]', stage).forEach(function (btn) {
      var c = Number(btn.dataset.memoCellIndex);
      btn.classList.toggle('is-sel', sel.indexOf(c) >= 0);
      btn.classList.toggle('is-hinted', hints.indexOf(c) >= 0 && sel.indexOf(c) < 0);
    });
    var count = $('[data-memo-count]', stage);
    if (count) count.textContent = sel.length + ' / ' + run.round.recall.pick + ' dipilih';
    var submit = $('[data-memo-submit-cell]', stage);
    if (submit) submit.disabled = sel.length !== run.round.recall.pick;
  }

  function refreshSeqUi(stage) {
    if (!stage) return;
    var run = state.run;
    if (!run) return;
    var rc = run.round.recall;
    var find = function (id) { return (rc.pool || []).filter(function (p) { return p.id === id; })[0]; };
    var slots = $('[data-memo-slots]', stage);
    if (slots) {
      if (rc.slots) {
        slots.innerHTML = rc.slots.map(function (given, i) {
          var picked = i === 0 && run.input.seq[0] ? find(run.input.seq[0]) : null;
          return '<div class="memo-slot' + (given ? ' is-given' : ' is-hole') + '">' +
            (given ? esc(given.g) : (picked ? esc(picked.g) : '<i>' + (i + 1) + '</i>')) + '</div>';
        }).join('');
      } else {
        slots.innerHTML = Array.from({ length: rc.need }, function (_, i) {
          var item = find(run.input.seq[i]);
          return '<div class="memo-slot' + (item ? ' is-filled' : (i === run.input.seq.length ? ' is-next' : '')) + (run.input.hinted.indexOf(i) >= 0 ? ' is-hinted' : '') + '">' +
            (item ? esc(item.g) : '<i>' + (i + 1) + '</i>') + '</div>';
        }).join('');
      }
    }
    var submit = $('[data-memo-submit-seq]', stage);
    if (submit) submit.disabled = run.input.seq.length !== rc.need;
  }

  function useHint() {
    var run = state.run;
    if (!run || run.stage !== 'recall' || run.hintBusy || run.hintsLeft <= 0) return;
    var round = run.round;
    var rc = round.recall;
    var input = run.input;
    var used = false;
    if (rc.type === 'choice') {
      var wrongs = rc.options.map(function (_, i) { return i; }).filter(function (i) { return i !== round.answer && input.eliminated.indexOf(i) < 0; });
      var n = Math.min(Math.max(0, wrongs.length - 1), Math.max(1, Math.floor(rc.options.length / 2)));
      if (n > 0) {
        Core.makeRng('h' + Date.now()).shuffle(wrongs).slice(0, n).forEach(function (i) {
          input.eliminated.push(i);
          var btn = $$('[data-memo-choice]')[i];
          if (btn) { btn.disabled = true; btn.classList.add('is-removed'); }
        });
        used = true;
      }
    } else if (rc.type === 'cells') {
      var left = round.answer.filter(function (c) { return input.sel.indexOf(c) < 0 && input.hintCells.indexOf(c) < 0; });
      if (left.length) { input.hintCells.push(left[0]); used = true; refreshCellsUi($('[data-memo-stage]')); }
    } else if (rc.type === 'seq') {
      if (rc.need === 1) {
        var poolWrong = rc.pool.filter(function (p) { return p.id !== round.answer[0]; })
          .map(function (p) { return p.id; }).filter(function (id) { return input.eliminated.indexOf(id) < 0; });
        var remove = Math.floor(poolWrong.length / 2);
        if (remove > 0) {
          Core.makeRng('h' + Date.now()).shuffle(poolWrong).slice(0, remove).forEach(function (id) {
            input.eliminated.push(id);
            var btn = $$('[data-memo-symbol]').filter(function (b) { return b.dataset.memoSymbol === id; })[0];
            if (btn) { btn.disabled = true; btn.classList.add('is-removed'); }
          });
          used = true;
        }
      } else {
        var k = 0;
        while (k < input.seq.length && input.seq[k] === round.answer[k]) k += 1;
        if (k < rc.need) {
          input.seq = round.answer.slice(0, k + 1);
          input.hinted = Array.from({ length: k + 1 }, function (_, i) { return i; });
          refreshSeqUi($('[data-memo-stage]'));
          used = true;
        }
      }
    } else if (rc.type === 'rhythm') {
      run.hintBusy = true;
      used = true;
      var pad = $('[data-memo-tap]');
      var pulse = function () {
        if (!pad) return;
        pad.classList.add('is-hit');
        setTimeout(function () { pad.classList.remove('is-hit'); }, 140);
      };
      pulse();
      var t = 0;
      (rc.intervals || []).forEach(function (iv) {
        t += iv;
        schedule(run, pulse, t);
      });
      schedule(run, function () {
        run.hintBusy = false;
        updateHintUi();
      }, t + 200);
    }
    if (!used) return;
    run.roundHints += 1;
    run.hintsUsed += 1;
    if (run.hintsLeft !== Infinity) run.hintsLeft -= 1;
    updateHintUi();
    if (GH.audio) GH.audio.hint();
  }

  function updateHintUi() {
    var run = state.run;
    var btn = $('[data-memo-hint]');
    if (!run || !btn) return;
    var left = run.hintsLeft === Infinity ? '∞' : run.hintsLeft;
    btn.disabled = run.stage !== 'recall' || run.hintBusy || run.hintsLeft <= 0;
    btn.innerHTML = '✧ Petunjuk <span class="hint-cost">' + esc(left) + '</span>';
  }

  var runKeyboard = null;

  function bindKeyboard(run) {
    document.removeEventListener('keydown', runKeyboard);
    runKeyboard = function (e) {
      if (state.run !== run || run.stage !== 'recall') return;
      if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].indexOf(e.target.tagName) >= 0) return;
      var rc = run.round.recall;
      if (rc.type === 'choice') {
        var map = { '1': 0, '2': 1, '3': 2, '4': 3, a: 0, b: 1, c: 2, d: 3, A: 0, B: 1, C: 2, D: 3 };
        if (map[e.key] !== undefined) {
          e.preventDefault();
          var btn = $$('[data-memo-choice]')[map[e.key]];
          if (btn && !btn.disabled) btn.click();
        }
      } else if (rc.type === 'seq') {
        var num = parseInt(e.key, 10);
        if (!isNaN(num) && num >= 1 && num <= (rc.pool || []).length) {
          e.preventDefault();
          var sym = $$('[data-memo-symbol]')[num - 1];
          if (sym && !sym.disabled) sym.click();
        }
      } else if (rc.type === 'rhythm' && (e.key === ' ' || e.key === 'Enter')) {
        if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-memo-tap')) return;
        e.preventDefault();
        if (typeof run.tapPad === 'function') run.tapPad(e);
      }
    };
    document.addEventListener('keydown', runKeyboard);
  }

  /* ---------------- Lobby ---------------- */

  function boardPreview(key, limit) {
    var rows = S.getBoard(key).slice(0, limit || 5);
    if (!rows.length) return UI.emptyState('◇', 'Belum ada skor', 'Selesaikan satu sesi untuk mengisi papan ini.');
    return UI.leaderboard(rows, {
      value: function (r) { return fmt(r.score) + '<small>poin</small>'; },
      sub: function (r) { return (r.meta && r.meta.label) ? r.meta.label : U.formatDate(r.date); }
    });
  }

  function renderLobby(host) {
    var p = player();
    var best = S.bestScore('memo');
    var bestDaily = S.bestScore('memo:daily');
    var dailyDone = S.getDaily(dateKey());
    var seed = dailySeed();
    var registered = isRegistered();

    host.innerHTML = '<div class="game-shell memo-shell">' +
      UI.gameHeader({ title: 'Memo Mayhem', subtitle: 'Cosmic Recall', glyph: '✧', backLabel: 'Hub' }) +
      '<div class="game-wrap">' +
        '<section class="memo-hero">' +
          '<div class="memo-hero__copy">' +
            '<span class="eyebrow">Memori kosmik · 6 mode</span>' +
            '<h1>Ingat. Kenali.<br><span class="text-gradient">Kalahkan lupa.</span></h1>' +
            '<p>Inti tantangan mengikuti aturan ZIP: enam mode, modifier, Daily, Endless, dan Boss lima fase. Tampilan tetap memakai desain rebuild.</p>' +
            '<div class="row"><span class="badge badge--theme">6 mode</span><span class="badge">5 modifier</span><span class="badge">Seed deterministik</span></div>' +
          '</div>' +
          '<div class="mimo-stage" aria-hidden="true"><div class="mimo-orbit mimo-orbit--a"></div><div class="mimo-orbit mimo-orbit--b"></div>' +
            '<div class="mimo"><span class="mimo__antenna"></span><span class="mimo__body"><i class="mimo__eye"></i><i class="mimo__eye"></i><i class="mimo__mouth"></i></span><span class="mimo__badge">MIMO</span></div>' +
            '<span class="memo-float memo-float--a">✦</span><span class="memo-float memo-float--b">◉</span><span class="memo-float memo-float--c">☄</span></div>' +
        '</section>' +
        '<div class="memo-stats">' +
          '<div class="stat"><div class="stat__label">Rekor lokal</div><div class="stat__value">' + (best ? fmt(best.score) : '—') + ' <small>poin</small></div></div>' +
          '<div class="stat"><div class="stat__label">Harian lokal</div><div class="stat__value">' + (bestDaily ? fmt(bestDaily.score) : '—') + ' <small>poin</small></div></div>' +
          '<div class="stat"><div class="stat__label">Seed hari ini</div><div class="stat__value mono memo-seed-mini">' + esc(seed.slice(-12)) + '</div></div>' +
        '</div>' +
        '<div class="memo-dash">' +
          '<section class="panel memo-config">' +
            '<div class="panel__head"><div><span class="eyebrow">Konfigurasi</span><h2>Pilih mode dan ritme</h2></div><span class="badge badge--theme"><span data-gh-identity-avatar>' + esc(p.avatar) + '</span> <span data-gh-identity-name>' + esc(p.name) + '</span></span></div>' +
            '<div class="panel__body stack">' +
              '<div class="memo-mode-grid" role="group" aria-label="Mode memori">' + MODE_ORDER.map(function (id) {
                var m = MODES[id];
                return '<button class="memo-mode' + (state.mode === id ? ' is-active' : '') + '" type="button" data-memo-mode="' + id + '" aria-pressed="' + (state.mode === id ? 'true' : 'false') + '">' +
                  '<span class="memo-mode__glyph" style="--memo-c:' + m.color + '">' + m.glyph + '</span>' +
                  '<span class="memo-mode__name">' + esc(m.name) + '</span><span class="memo-mode__desc">' + esc(m.desc) + '</span></button>';
              }).join('') + '</div>' +
              '<div class="memo-options">' +
                '<div class="field"><span class="label">Kesulitan</span><div class="segmented segmented--wide" role="group" aria-label="Kesulitan">' +
                  DIFF_ORDER.map(function (id) {
                    return '<button class="segmented__btn" type="button" data-memo-diff="' + id + '" aria-pressed="' + (state.difficulty === id ? 'true' : 'false') + '">' + DIFFICULTY[id].name + '</button>';
                  }).join('') + '</div></div>' +
                '<div class="field"><span class="label">Ronde standar</span><div class="segmented segmented--wide" role="group" aria-label="Jumlah ronde">' +
                  ROUND_OPTIONS.map(function (n) {
                    return '<button class="segmented__btn" type="button" data-memo-rounds="' + n + '" aria-pressed="' + (state.rounds === n ? 'true' : 'false') + '">' + n + '</button>';
                  }).join('') + '</div></div>' +
                '<div class="field"><span class="label">Modifier (latihan)</span><div class="memo-mods" role="group" aria-label="Modifier">' +
                  MODIFIERS.map(function (m) {
                    var on = state.modifiers.indexOf(m.id) >= 0;
                    return '<button class="memo-mod" type="button" data-memo-mod="' + m.id + '" aria-pressed="' + on + '"><span aria-hidden="true">' + m.glyph + '</span> ' + esc(m.name) + '</button>';
                  }).join('') + '</div></div>' +
              '</div>' +
              '<p class="tiny muted" data-memo-mod-note>' + esc(modifierNote()) + '</p>' +
              '<div class="memo-actions">' +
                '<button class="btn btn--primary btn--lg" type="button" data-memo-start>▶ Mulai latihan</button>' +
                '<button class="btn btn--accent" type="button" data-memo-daily>◈ Tantangan harian</button>' +
                '<button class="btn btn--ghost" type="button" data-memo-endless>∞ Endless</button>' +
                '<button class="btn btn--ghost" type="button" data-memo-boss>☠ Boss 5 fase</button>' +
                '<button class="btn btn--accent" type="button" data-memo-online>◈ Duel online</button>' +
              '</div>' +
              '<div class="notice"><strong>Aturan ZIP.</strong> Daily 10 ronde, Boss 5 fase × 2 ronde, Endless naik tiap 4 ronde. Modifier otomatis muncul sesuai aturan core.</div>' +
            '</div>' +
          '</section>' +
          '<aside class="memo-side">' +
            '<section class="panel">' +
              '<div class="panel__head"><div><span class="eyebrow">Hari ini</span><h3>Tantangan harian</h3></div></div>' +
              '<div class="panel__body stack">' +
                '<div><span class="label">Status</span><strong>' + (dailyDone ? 'Sudah dimainkan · ' + fmt(dailyDone.score) + ' poin' : 'Belum dimainkan') + '</strong></div>' +
                '<div class="daily-seed"><span class="daily-seed__label">Seed</span><strong class="mono memo-seed">' + esc(seed) + '</strong><span class="daily-seed__note">10 ronde · Normal then Hard</span></div>' +
                '<button class="btn btn--theme btn--block" type="button" data-memo-daily>Mainkan tantangan</button>' +
              '</div>' +
            '</section>' +
            '<section class="panel">' +
              '<div class="panel__head"><div><span class="eyebrow">Profil Memo</span><h3 data-memo-profile>' + (registered ? 'Terhubung dengan profil pemain' : 'Mode tamu') + '</h3></div>' +
                (registered ? '<button class="text-btn" type="button" data-memo-register>Ubah nama</button>' : '') + '</div>' +
              '<div class="panel__body"><p class="tiny muted">Profil Memo memakai UID pemain yang sama dengan game lain. Tamu tidak menulis data permanen.</p></div>' +
            '</section>' +
            '<section class="panel">' +
              '<div class="panel__head"><div><span class="eyebrow">Papan lokal</span><h3>5 teratas</h3></div><button class="text-btn" type="button" data-open="leaderboards">Semua</button></div>' +
              '<div class="panel__body">' + boardPreview('memo', 5) + '</div>' +
            '</section>' +
            '<section class="panel">' +
              '<div class="panel__head"><div><span class="eyebrow">Papan ZIP</span><h3>Global standar</h3></div></div>' +
              '<div class="panel__body" data-memo-global><div class="lb-global__state">Memuat papan global…</div></div>' +
            '</section>' +
          '</aside>' +
        '</div>' +
      '</div>' +
    '</div>';

    bindLobby(host);
    loadLobbyExtras(host);
  }

  function currentBoardDescriptor() {
    return {
      type: 'standard',
      mode: state.mode,
      diff: state.difficulty,
      plannedRounds: state.rounds,
      dateKey: dateKey()
    };
  }

  function loadLobbyExtras(host) {
    var token = state.paintToken;
    var C = cloud();
    var uid = currentUid();
    var globalHost = $('[data-memo-global]', host);
    if (globalHost && C && typeof C.memoGetBoard === 'function') {
      Promise.resolve(C.memoGetBoard(currentBoardDescriptor(), 5)).then(function (res) {
        if (token !== state.paintToken || !globalHost.isConnected) return;
        if (!res || !res.ok) {
          globalHost.innerHTML = '<p class="tiny muted">Papan global belum tersedia: ' + esc((res && res.message) || 'offline') + '</p>';
          return;
        }
        globalHost.innerHTML = res.rows.length ? UI.leaderboard(res.rows, {
          compact: true,
          value: function (r) { return fmt(r.score) + '<small>poin</small>'; },
          sub: function (r) { return (r.meta && r.meta.label) || U.formatDate(r.date); }
        }) : UI.emptyState('◇', 'Kosong', 'Belum ada skor global untuk kategori ini.');
      });
    } else if (globalHost) {
      globalHost.innerHTML = '<p class="tiny muted">Layanan papan ZIP tidak aktif.</p>';
    }
    var profileLabel = $('[data-memo-profile]', host);
    if (profileLabel && uid && C && typeof C.memoGetProfile === 'function') {
      Promise.resolve(C.memoGetProfile(uid)).then(function (res) {
        if (token !== state.paintToken || !profileLabel.isConnected || !res || !res.ok) return;
        profileLabel.textContent = res.profile.name + ' · ' + (res.profile.st.sessions || 0) + ' sesi';
      });
    }
  }

  function bindLobby(host) {
    var back = $('[data-game-back]', host);
    if (back) back.addEventListener('click', function () { R.go('hub'); });
    var sound = $('[data-sound-toggle]', host);
    if (sound) sound.addEventListener('click', UI.toggleSound);
    var settings = $('[data-open="settings"]', host);
    if (settings) settings.addEventListener('click', function () { GH.app.openSettings(); });
    var boardBtn = $('[data-open="leaderboards"]', host);
    if (boardBtn) boardBtn.addEventListener('click', function () { GH.app.openLeaderboards('memo'); });

    $$('[data-memo-mode]', host).forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.mode = btn.dataset.memoMode;
        if (GH.audio) GH.audio.click();
        paintHost();
      });
    });
    $$('[data-memo-diff]', host).forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.difficulty = btn.dataset.memoDiff;
        if (GH.audio) GH.audio.click();
        paintHost();
      });
    });
    $$('[data-memo-rounds]', host).forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.rounds = Number(btn.dataset.memoRounds) || 10;
        if (GH.audio) GH.audio.click();
        paintHost();
      });
    });
    $$('[data-memo-mod]', host).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.dataset.memoMod;
        var idx = state.modifiers.indexOf(id);
        if (idx >= 0) state.modifiers.splice(idx, 1);
        else state.modifiers.push(id);
        if (GH.audio) GH.audio.click();
        paintHost();
      });
    });
    $$('[data-memo-start]', host).forEach(function (b) { b.addEventListener('click', function () { startRun({ style: 'practice' }); }); });
    $$('[data-memo-daily]', host).forEach(function (b) { b.addEventListener('click', function () { startRun({ style: 'daily', seed: dailySeed() }); }); });
    $$('[data-memo-endless]', host).forEach(function (b) { b.addEventListener('click', function () { startRun({ style: 'endless' }); }); });
    $$('[data-memo-boss]', host).forEach(function (b) { b.addEventListener('click', function () { startRun({ style: 'boss' }); }); });
    $$('[data-memo-online]', host).forEach(function (b) { b.addEventListener('click', function () { openRoomDialog(); }); });
    var register = $('[data-memo-register]', host);
    if (register) register.addEventListener('click', openMemoRegister);
  }

  function openMemoRegister() {
    var C = cloud();
    if (!isRegistered() || !C || typeof C.memoRegisterProfile !== 'function') {
      UI.toast({ type: 'info', title: 'Profil diperlukan', msg: 'Buat profil pemain dulu untuk mendaftarkan nama Memo.' });
      return;
    }
    UI.modal({
      title: 'Nama profil Memo Mayhem',
      subtitle: '3–14 karakter · huruf, angka, spasi, _ . atau -',
      body: '<div class="stack"><div class="field"><label for="memoRegName">Nama Memo</label><input class="input" id="memoRegName" maxlength="14" value="' + esc((identitySnapshot() || {}).name || '') + '"></div>' +
        '<p class="input-error" data-memo-reg-error></p><p class="tiny muted">Nama ini dipakai di papan Memo. Identitas pemain utama tidak berubah.</p></div>',
      actions: [
        { label: 'Batal', value: false, variant: 'ghost' },
        { label: 'Daftarkan', value: true, variant: 'primary' }
      ]
    }).then(function (ok) {
      if (!ok) return;
      var input = $('#memoRegName');
      var raw = input ? input.value : '';
      var name = U.cleanName(raw);
      var check = C.memoCheckName ? C.memoCheckName(name, currentUid()) : Promise.resolve({ ok: true, name: name });
      Promise.resolve(check).then(function (res) {
        if (!res.ok) throw res;
        if (res.free === false) {
          throw { message: 'Nama itu sudah dipakai pemain lain. Pilih nama Memo lain.' };
        }
        return C.memoRegisterProfile(res.name || name, { icon: player().avatar });
      }).then(function (res) {
        if (!res.ok) throw res;
        UI.toast({ type: 'success', title: 'Profil Memo tersimpan', msg: 'Nama Memo: ' + res.name });
        paintHost();
      }).catch(function (err) {
        var msg = (err && (err.message || err.error)) || 'Nama tidak bisa didaftarkan.';
        UI.toast({ type: 'warning', title: 'Nama Memo', msg: msg });
      });
    });
  }

  /* ---------------- Play rendering ---------------- */

  function renderPlay(host) {
    var run = state.run;
    if (!run) { state.screen = 'lobby'; renderLobby(host); return; }
    var round = run.round;
    if (!round) {
      host.innerHTML = '<div class="game-shell memo-shell memo-shell--play">' +
        UI.gameHeader({ title: 'Memo Mayhem', subtitle: 'Duel online', glyph: '◈', backLabel: 'Keluar' }) +
        '<div class="game-wrap game-wrap--narrow"><section class="room-screen room-screen--waiting">' +
          '<div class="room-badge" aria-hidden="true">◈</div>' +
          '<span class="eyebrow">Duel online</span>' +
          '<h1>Ronde identik <span class="text-gradient">siap dimulai</span></h1>' +
          '<p>Kedua perangkat akan memulai ronde bersamaan.</p>' +
        '</section></div></div>';
      var waitingBack = $('[data-game-back]', host);
      if (waitingBack) waitingBack.addEventListener('click', function () {
        if (run.online) leaveRoom();
        stopRun();
        state.screen = 'lobby';
        paintHost();
      });
      return;
    }
    var meta = MODES[round.mode] || { glyph: '✦', name: modeLabel(round.mode) };
    var phaseBadge = '';
    if (run.type === 'boss') phaseBadge = '<span class="badge badge--theme">Fase ' + ((round.phase != null ? round.phase : 0) + 1) + ' · ' + esc((BOSS_PHASES[round.phase] || {}).name || '') + '</span>';
    else if (run.type === 'endless') phaseBadge = '<span class="badge badge--theme">Gelombang ' + (run.roundIndex + 1) + '</span>';
    else if (run.type === 'daily') phaseBadge = '<span class="badge badge--theme">Harian</span>';
    else if (run.type === 'duel') phaseBadge = '<span class="badge badge--theme">Duel · ' + esc(run.player.name) + '</span>';
    else phaseBadge = '<span class="badge badge--theme">Latihan</span>';

    var title = run.type === 'boss' && BOSS_PHASES[round.phase]
      ? BOSS_PHASES[round.phase].name
      : meta.name;
    var subtitle = round.title || modeLabel(round.mode);
    var lives = run.lives !== Infinity ? '<div class="memo-mini-stat"><span class="label">Nyawa</span><strong class="' + (run.lives <= 1 ? 'text-danger' : '') + '">' + run.lives + '</strong></div>' : '';

    host.innerHTML = '<div class="game-shell memo-shell memo-shell--play">' +
      UI.gameHeader({ title: 'Memo Mayhem', subtitle: title + ' · ' + subtitle + ' · Ronde ' + (run.roundIndex + 1) + (isFinite(run.totalRounds) ? '/' + run.totalRounds : ''), glyph: meta.glyph, backLabel: 'Keluar' }) +
      '<div class="game-wrap game-wrap--play">' +
        '<div class="memo-hud">' +
          '<div class="memo-hud__left">' + phaseBadge +
            '<span class="badge">' + esc(meta.name) + '</span>' +
            '<span class="badge">' + esc((DIFFICULTY[round.diff] || {}).label || round.diff) + '</span>' +
          '</div>' +
          '<div class="memo-hud__center">' +
            '<div class="memo-combo"><span>Kombo</span><strong>' + run.combo + '×</strong></div>' +
            '<div class="memo-score"><span>Skor</span><strong>' + fmt(run.score) + '</strong></div>' +
          '</div>' +
          '<div class="memo-hud__right"><div class="memo-ring" data-memo-ring style="--left:100%"><div class="memo-ring__inner"><strong data-memo-time>—</strong><small>detik</small></div></div></div>' +
        '</div>' +
        '<div class="progress progress--thin memo-timebar"><div class="progress__bar" data-memo-timebar style="width:100%"></div></div>' +
        '<div class="memo-play">' +
          '<div class="panel memo-stage' + (run.stage === 'observe' || run.stage === 'brief' ? ' is-preview' : '') + (run.stage === 'feedback' ? ' is-feedback' : '') + '" data-memo-stage></div>' +
          '<aside class="memo-play-side">' +
            '<div class="panel"><div class="panel__head"><div><span class="eyebrow">Ronde</span><h3>' + (run.roundIndex + 1) + (isFinite(run.totalRounds) ? ' / ' + run.totalRounds : '') + '</h3></div></div><div class="panel__body">' +
              '<div class="memo-round-stats">' +
                '<div><span class="label">Benar</span><strong class="text-success">' + run.correct + '</strong></div>' +
                '<div><span class="label">Salah</span><strong class="text-danger">' + run.wrong + '</strong></div>' +
                '<div><span class="label">Terbaik</span><strong>' + run.bestCombo + '×</strong></div>' + lives +
              '</div>' +
              '<div class="progress progress--thin" style="margin-top:.7rem"><div class="progress__bar" style="width:' + (isFinite(run.totalRounds) ? (run.roundIndex / run.totalRounds) * 100 : Math.min(100, run.roundIndex * 5)) + '%"></div></div>' +
            '</div></div>' +
            '<div class="panel"><div class="panel__head"><div><span class="eyebrow">Modifier aktif</span><h3>' + (round.mods.length || 'Otomatis') + '</h3></div></div><div class="panel__body">' +
              (round.mods.length ? '<div class="memo-active-mods">' + round.mods.map(function (id) {
                var m = MODIFIERS.filter(function (x) { return x.id === id; })[0] || { glyph: '✦', name: id };
                return '<span class="badge">' + esc(m.glyph) + ' ' + esc(m.name) + '</span>';
              }).join('') + '</div>' : '<p class="tiny muted">Tidak ada modifier ronde ini.</p>') +
            '</div></div>' +
            '<div class="panel memo-hint-panel"><div class="panel__body">' +
              '<button class="btn btn--ghost btn--block btn--sm" type="button" data-memo-hint' + (run.hintsLeft <= 0 || run.stage !== 'recall' ? ' disabled' : '') + '>✧ Petunjuk <span class="hint-cost">' + (run.hintsLeft === Infinity ? '∞' : run.hintsLeft) + '</span></button>' +
              '<p class="tiny muted">Petunjuk membuang pilongan salah, menyorot target, atau mengisi awal urutan. Mode duel tidak memakai hint.</p>' +
            '</div></div>' +
          '</aside>' +
        '</div>' +
      '</div>' +
    '</div>';

    var back = $('[data-game-back]', host);
    if (back) back.addEventListener('click', function () { R.go('hub'); });
    var sound = $('[data-sound-toggle]', host);
    if (sound) sound.addEventListener('click', UI.toggleSound);
    var settings = $('[data-open="settings"]', host);
    if (settings) settings.addEventListener('click', function () { GH.app.openSettings(); });
    var hint = $('[data-memo-hint]', host);
    if (hint) hint.addEventListener('click', useHint);
    bindKeyboard(run);
    renderStage();
    updateTimerUi();
  }

  /* ---------------- Duel result ---------------- */

  function renderDuelResult(host) {
    var d = state.duel;
    var result = state.duelResult;
    if (!d || !result) { state.screen = 'lobby'; renderLobby(host); return; }
    host.innerHTML = '<div class="game-shell memo-shell">' +
      UI.gameHeader({ title: 'Memo Mayhem', subtitle: 'Hasil duel', glyph: '⚔', backLabel: 'Hub' }) +
      '<div class="game-wrap game-wrap--narrow"><section class="duel-result">' +
        '<span class="eyebrow">Duel online selesai</span>' +
        '<h1>' + (result.winner ? '<span class="text-gradient">' + esc(result.winner.name) + '</span> menang!' : 'Duel berakhir seri') + '</h1>' +
        '<p>' + d.rounds + ' ronde dengan ronde room yang identik.</p>' +
        '<div class="duel-cards">' +
          '<div class="duel-card ' + (result.winner === d.players[1] ? 'is-loser' : '') + '"><span class="duel-card__name">' + esc(d.players[0].name) + '</span><strong>' + fmt(result.a.score) + '</strong>' +
            '<div class="duel-card__meta">' + result.a.correct + ' benar · kombo ' + result.a.bestCombo + '×</div>' +
            (result.winner === d.players[0] ? '<span class="badge badge--success">Pemenang</span>' : '') + '</div>' +
          '<div class="duel-card ' + (result.winner === d.players[0] ? 'is-loser' : '') + '"><span class="duel-card__name">' + esc(d.players[1].name) + '</span><strong>' + fmt(result.b.score) + '</strong>' +
            '<div class="duel-card__meta">' + result.b.correct + ' benar · kombo ' + result.b.bestCombo + '×</div>' +
            (result.winner === d.players[1] ? '<span class="badge badge--success">Pemenang</span>' : '') + '</div>' +
        '</div>' +
        '<div class="result-actions">' +
          '<button class="btn btn--primary btn--lg" type="button" data-memo-new-room>Buat room baru</button>' +
          '<button class="btn btn--ghost" type="button" data-memo-dashboard>Dashboard</button></div>' +
      '</section></div></div>';
    function exitDuelResult() {
      closeRoom();
      state.screen = 'lobby';
      state.duel = null;
      state.duelResult = null;
      paintHost();
    }
    $('[data-game-back]', host).addEventListener('click', exitDuelResult);
    var newRoom = $('[data-memo-new-room]', host);
    if (newRoom) newRoom.addEventListener('click', function () {
      closeRoom();
      state.duel = null;
      state.duelResult = null;
      state.screen = 'lobby';
      paintHost();
      openRoomDialog();
    });
    $('[data-memo-dashboard]', host).addEventListener('click', exitDuelResult);
    $('[data-sound-toggle]', host).addEventListener('click', UI.toggleSound);
  }

  /* ---------------- Online room screens ---------------- */

  function roomSlotMarkup(doc, side) {
    var slots = [roomSlotPlayer(doc.host), doc.guest ? roomSlotPlayer(doc.guest) : null];
    return slots.map(function (p, i) {
      var who = i === 0 ? 'host' : 'guest';
      return '<div class="room-slot' + (who === side ? ' is-me' : '') + (p && (who === 'host' || doc.guest) ? '' : ' is-empty') + '">' +
        '<span class="room-slot__avatar" aria-hidden="true">' + esc(p ? p.avatar : '·') + '</span>' +
        '<span class="room-slot__name">' + esc(p ? p.name : 'Menunggu lawan…') + '</span>' +
        '<span class="room-slot__tag">' + (who === side ? 'Kamu' : (who === 'host' ? 'Tuan room' : 'Lawan')) + '</span>' +
      '</div>';
    }).join('');
  }

  function bindRoomScreen(host) {
    var back = $('[data-game-back]', host);
    if (back) back.addEventListener('click', leaveRoom);
    var cancel = $('[data-room-back]', host);
    if (cancel) cancel.addEventListener('click', leaveRoom);
    var sound = $('[data-sound-toggle]', host);
    if (sound) sound.addEventListener('click', UI.toggleSound);
    var settings = $('[data-open="settings"]', host);
    if (settings) settings.addEventListener('click', function () { GH.app.openSettings(); });
  }

  function renderRoomLobby(host) {
    var room = state.room;
    if (!room) { state.screen = 'lobby'; renderLobby(host); return; }
    var doc = room.doc || {};
    var me = roomSlotPlayer(doc[room.side]);
    var first = (doc.questions && doc.questions[0]) || {};
    var count = doc.count || ROUND_OPTIONS[0];
    host.innerHTML = '<div class="game-shell memo-shell">' +
      UI.gameHeader({ title: 'Memo Mayhem', subtitle: 'Duel online', glyph: '◈', backLabel: 'Keluar' }) +
      '<div class="game-wrap game-wrap--narrow"><section class="room-screen">' +
        '<div class="room-badge" aria-hidden="true">◈</div>' +
        '<span class="eyebrow">Room dibuat</span>' +
        '<h1>Bagikan kode <span class="text-gradient room-code">' + esc(room.code) + '</span></h1>' +
        '<p>Lawan memasukkan kode ini di perangkatnya. Keduanya harus memakai profil terdaftar. Duel dimulai otomatis setelah lawan bergabung.</p>' +
        '<div class="notice"><strong>' + count + ' ronde.</strong> Mode ' + esc(modeLabel(first.mode || state.mode)) +
          ' · kesulitan ' + esc((DIFFICULTY[first.diff || state.difficulty] || {}).name || first.diff || state.difficulty) +
          '. Ronde identik untuk kedua perangkat.</div>' +
        '<div class="room-code-actions">' +
          '<button class="btn btn--primary btn--lg" type="button" data-room-copy>Salin kode</button>' +
          '<button class="btn btn--ghost" type="button" data-room-back>Batalkan room</button>' +
        '</div>' +
        '<div class="room-slots">' + roomSlotMarkup(doc, room.side) + '</div>' +
        '<p class="tiny muted">' + esc(me.name) + ' · menunggu lawan bergabung…</p>' +
      '</section></div></div>';
    $('[data-room-copy]', host).addEventListener('click', function () {
      U.copyText(room.code).then(function () {
        UI.toast({ title: 'Kode disalin', msg: room.code, type: 'success' });
      }).catch(function () {
        UI.toast({ title: 'Salin manual', msg: room.code, type: 'warning' });
      });
    });
    bindRoomScreen(host);
  }

  function renderRoomWaiting(host) {
    var room = state.room;
    if (!room) { state.screen = 'lobby'; renderLobby(host); return; }
    var doc = room.doc || {};
    var meSlot = doc[room.side] || {};
    var mine = room.mySession || (state.duel && state.duel.results[room.side === 'host' ? 0 : 1]);
    var label = mine ? fmt(mine.score) + ' poin' : fmt(meSlot.score || 0) + ' poin';
    host.innerHTML = '<div class="game-shell memo-shell">' +
      UI.gameHeader({ title: 'Memo Mayhem', subtitle: 'Duel online', glyph: '◈', backLabel: 'Keluar' }) +
      '<div class="game-wrap game-wrap--narrow"><section class="room-screen room-screen--waiting">' +
        '<div class="room-badge" aria-hidden="true">◈</div>' +
        '<span class="eyebrow">Ronde selesai</span>' +
        '<h1>Hasilmu <span class="text-gradient">' + esc(label) + '</span></h1>' +
        '<p>Menunggu lawan menyelesaikan ronde. Hasil akhir muncul otomatis di kedua perangkat.</p>' +
        '<div class="room-slots">' + roomSlotMarkup(doc, room.side) + '</div>' +
        '<button class="btn btn--ghost" type="button" data-room-back>Keluar room</button>' +
      '</section></div></div>';
    bindRoomScreen(host);
  }

  /* ---------------- Result ---------------- */

  function achievementHtml(save) {
    if (!save || !save.ok || !save.newAch || !save.newAch.length) return '';
    var ids = save.newAch.map(String);
    var found = (MemoData && MemoData.ACH || []).filter(function (a) { return ids.indexOf(a.id) >= 0; });
    if (!found.length) return '';
    return '<div class="memo-ach"><span class="label">Pencapaian baru</span><div class="memo-ach__list">' +
      found.map(function (a) { return '<span class="badge badge--theme" title="' + esc(a.desc) + '">' + esc(a.icon) + ' ' + esc(a.name) + '</span>'; }).join('') +
      '</div></div>';
  }

  function saveStatusHtml(result) {
    var save = result.save;
    if (!isRegistered()) return '<p class="tiny muted">Mode tamu: skor tidak ditulis ke profil permanen.</p>';
    if (!save) return '<p class="tiny muted">Menyimpan sesi ke profil Memo…</p>';
    if (save.skipped) return '<p class="tiny muted">' + esc(save.reason || 'Sesi ini tidak disimpan.') + '</p>';
    if (!save.ok) {
      return '<div class="notice notice--warn"><span>Gagal menyimpan: ' + esc(save.message || save.code || 'unknown') + '</span> ' +
        '<button class="text-btn" type="button" data-memo-save-retry>Coba lagi</button></div>';
    }
    if (save.dup) return '<p class="tiny muted">Sesi ini sudah tersimpan sebelumnya.</p>';
    return '<p class="tiny muted">Tersimpan di profil Memo' + (save.entered ? ' dan masuk papan ZIP.' : '.') + '</p>' + achievementHtml(save);
  }

  function renderResult(host) {
    var data = state.result;
    if (!data) { state.screen = 'lobby'; renderLobby(host); return; }
    var s = data.session;
    var accuracy = s.total ? Math.round(s.accuracy * 100) : 0;
    host.innerHTML = '<div class="game-shell memo-shell">' +
      UI.gameHeader({ title: 'Memo Mayhem', subtitle: 'Hasil sesi', glyph: '✧', backLabel: 'Hub' }) +
      '<div class="game-wrap game-wrap--narrow"><section class="result-screen">' +
        '<div class="result-hero"><span class="result-hero__badge">' + (s.done ? (data.local && data.local.isBest ? '★ Rekor lokal' : 'Selesai') : 'Sesi berhenti') + '</span>' +
          '<h1><span class="text-gradient">' + fmt(s.score) + '</span> poin</h1>' +
          '<p>' + esc(s.player.name) + ' · ' + esc(styleLabel(data.runStyle)) + ' · ' + esc((DIFFICULTY[s.diff] || {}).name || s.diff || '—') + '. ' + s.correct + ' dari ' + s.total + ' ronde benar.</p>' +
        '</div>' +
        '<div class="result-metrics">' +
          '<div class="result-metric"><span>Benar</span><strong class="text-success">' + s.correct + '</strong></div>' +
          '<div class="result-metric"><span>Salah</span><strong class="text-danger">' + (s.total - s.correct) + '</strong></div>' +
          '<div class="result-metric"><span>Kombo terbaik</span><strong>' + s.bestCombo + '×</strong></div>' +
          '<div class="result-metric"><span>Akurasi</span><strong>' + accuracy + '%</strong></div>' +
          '<div class="result-metric"><span>Hint</span><strong>' + (s.hints || 0) + '</strong></div>' +
        '</div>' +
        '<div class="memo-save-status" data-memo-save-status>' + saveStatusHtml(data) + '</div>' +
        '<div class="result-actions">' +
          '<button class="btn btn--primary btn--lg" type="button" data-memo-again>Main lagi</button>' +
          '<button class="btn btn--ghost" type="button" data-memo-dashboard>Dashboard</button>' +
          '<button class="btn btn--quiet" type="button" data-open="leaderboards">Papan skor</button>' +
        '</div>' +
        '<div class="panel result-lb"><div class="panel__head"><div><span class="eyebrow">Peringkat lokal</span><h3>' + (s.type === 'daily' ? 'Tantangan harian' : 'Memo Mayhem') + '</h3></div></div>' +
          '<div class="panel__body">' + boardPreview(localBoardKey(s), 8) + '</div></div>' +
      '</section></div></div>';

    $('[data-game-back]', host).addEventListener('click', function () { state.screen = 'lobby'; state.result = null; paintHost(); });
    $('[data-memo-again]', host).addEventListener('click', function () {
      startRun({ style: data.runStyle === 'practice' ? 'practice' : data.runStyle, mode: s.mode || state.mode, difficulty: s.diff || state.difficulty, totalRounds: s.plannedRounds || state.rounds });
    });
    $('[data-memo-dashboard]', host).addEventListener('click', function () { state.screen = 'lobby'; state.result = null; paintHost(); });
    var lb = $('[data-open="leaderboards"]', host);
    if (lb) lb.addEventListener('click', function () { GH.app.openLeaderboards('memo'); });
    var sound = $('[data-sound-toggle]', host);
    if (sound) sound.addEventListener('click', UI.toggleSound);
    var settings = $('[data-open="settings"]', host);
    if (settings) settings.addEventListener('click', function () { GH.app.openSettings(); });
    var retry = $('[data-memo-save-retry]', host);
    if (retry) retry.addEventListener('click', function () {
      data.save = null;
      paintHost();
      saveMemoSession(s, false).then(function (res) {
        if (state.result === data) { data.save = res; paintHost(); }
      });
    });
  }

  /* ---------------- Paint + registration ---------------- */

  function paintHost() {
    var host = document.querySelector('[data-view="memo"]');
    if (!host) return;
    paint(host);
  }

  function paint(host) {
    document.removeEventListener('keydown', runKeyboard);
    runKeyboard = null;
    state.paintToken += 1;
    if (state.autoDaily && state.screen === 'lobby') {
      state.autoDaily = false;
      startRun({ style: 'daily', seed: dailySeed() });
      return;
    }
    if (state.screen === 'play') renderPlay(host);
    else if (state.screen === 'result') renderResult(host);
    else if (state.screen === 'duelResult') renderDuelResult(host);
    else if (state.screen === 'roomLobby') renderRoomLobby(host);
    else if (state.screen === 'roomWaiting') renderRoomWaiting(host);
    else renderLobby(host);
  }

  function patchMemoPlayer(target, snap, previous) {
    if (!target || !snap || !previous || previous.registered) return;
    if (previous.name === target.name) target.name = snap.name;
    if (previous.avatar === target.avatar) target.avatar = snap.avatar;
  }

  function patchActiveIdentity(snap, previous) {
    if (!snap || !snap.registered || !previous || previous.registered) return;
    if (state.run) patchMemoPlayer(state.run.player, snap, previous);
    if (state.result && state.result.session) patchMemoPlayer(state.result.session.player, snap, previous);
    if (state.duel) {
      (state.duel.players || []).forEach(function (p) { patchMemoPlayer(p, snap, previous); });
      (state.duel.results || []).forEach(function (r) { patchMemoPlayer(r.player, snap, previous); });
    }
  }

  function registerGame() {
    R.register('memo', {
      title: 'Memo Mayhem',
      render: function (host) {
        if (!Core || !MemoData) {
          host.innerHTML = '<div class="game-shell memo-shell"><div class="game-wrap"><div class="notice notice--warn">Data inti Memo belum termuat. Muat ulang halaman setelah skrip data tersedia.</div></div></div>';
          return;
        }
        paint(host);
      },
      cleanup: function () {
        if (state.run) clearTimers(state.run);
        stopTicker();
        document.removeEventListener('keydown', runKeyboard);
        runKeyboard = null;
        closeRoom();
        state.run = null;
        state.duel = null;
        state.result = null;
        state.duelResult = null;
        state.screen = 'lobby';
      }
    });
  }

  GH.memo = {
    init: function () {
      if (GH.identity && typeof GH.identity.onChange === 'function') GH.identity.onChange(patchActiveIdentity);
      registerGame();
    },
    startDaily: function () {
      state.screen = 'lobby';
      state.duel = null;
      state.result = null;
      state.autoDaily = true;
      R.go('memo');
    },
    openRoom: function () { openRoomDialog(); },
    modes: MODES,
    difficulty: DIFFICULTY,
    modifiers: MODIFIERS,
    state: state
  };
})();
