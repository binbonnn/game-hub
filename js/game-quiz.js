/* =========================================================
   Game Hub v2 · G1–G3 quiz engine
   ========================================================= */
(function () {
  'use strict';
  var GH = window.GH = window.GH || {};
  var U = GH.util;
  var S = GH.store;
  var R = GH.router;
  var UI = GH.ui;

  var CONFIG = {
    multiply: {
      id: 'multiply', kind: 'timed', theme: 'multiply', glyph: '×',
      title: 'Perkalian 1–10', subtitle: 'Kuis',
      kicker: 'Kuis edukasi · dasar',
      tagline: 'Hitung secepat mungkin. Tidak ada penalti waktu—yang dikejar murni kecepatan dan ketelitian.',
      description: 'Pilih 10, 20, atau 30 soal. Jawab lewat keypad. Hint membuka tabel perkalian 1–10 tanpa penalti. Papan peringkat diurutkan dari waktu tercepat, lalu kesalahan paling sedikit.',
      counts: [10, 20, 30], defaultCount: 20,
      boardPrefix: 'multiply', bankLabel: 'Perkalian 1–10',
      accent: 'var(--g1)',
      rules: [
        'Waktu berhenti tepat saat soal terakhir terjawab benar. Tidak ada penalti untuk jawaban salah.',
        'Jawaban salah hanya menambah jumlah kesalahan; soal tetap bisa dijawab lagi.',
        'Peringatan muncul saat stopwatch mencapai 03:00.',
        'Hint membuka seluruh tabel perkalian 1–10 dan tidak menambah waktu. Papan terpisah untuk 10, 20, dan 30 soal.'
      ]
    },
    knowledge: {
      id: 'knowledge', kind: 'rapid', theme: 'knowledge', glyph: '?',
      title: 'Pengetahuan Dasar', subtitle: 'Ronde 60 detik',
      kicker: 'Kuis edukasi · cepat',
      tagline: 'Enam puluh detik. Empat pilihan. Setiap jawaban salah bisa jadi pembahasan.',
      description: 'Jawab sebanyak mungkin dalam 60 detik. Skor ditulis dalam desimal: benar di klik pertama 1,0; klik kedua 0,7; klik ketiga 0,3. Klik opsi salah untuk membaca penjelasannya.',
      counts: [1], defaultCount: 1,
      boardPrefix: 'knowledge', bankLabel: 'Bank 2.000 soal',
      accent: 'var(--g2)',
      duration: 60,
      rules: [
        'Benar pada klik ke-1 1,0; klik ke-2 0,7; klik ke-3 0,3. Hint membuat poin maksimum 0,3.',
        'Opsi salah tidak langsung hangus: klik lagi untuk membuka atau menutup penjelasan opsi tersebut.',
        'Hint menyisakan satu pengecoh; setelah dua klik salah hint tidak tersedia. Soal hangus hanya bila tidak ada pengecoh yang bisa dipilih lagi (−1,0).',
        'Bonus beruntun untuk benar di klik pertama tanpa hint: 5 +3,0; 10 +7,0; kelipatan 5 berikutnya +10,0. Papan menyimpan 10 skor teratas.'
      ]
    },
    advmath: {
      id: 'advmath', kind: 'timed', theme: 'advmath', glyph: '✦',
      title: 'Perkalian Lanjutan', subtitle: 'Kuis',
      kicker: 'Kuis edukasi · lanjutan',
      tagline: 'Angka lebih besar dan hint punya masa berlaku. Rencanakan kapan harus membuka petunjuk.',
      description: 'Dua ribu soal matematika lanjutan dalam empat pilihan. Pilih 10, 20, atau 30 soal. Penalti salah kumulatif dan tiap hint hanya bisa diakses selama jendela waktunya.',
      counts: [10, 20, 30], defaultCount: 20,
      boardPrefix: 'advmath', bankLabel: 'Bank 2.000 soal',
      accent: 'var(--g3)',
      rules: [
        'Jumlah soal 10/20/30, bawaan 20. Waktu akhir dikunci saat soal terakhir selesai: aktual + seluruh penalti.',
        'Penalti salah kumulatif per soal: +60, +180, +300 detik; kesalahan ketiga menghanguskan soal.',
        'Hint 1 +100 dtk (akses 30 dtk), hint 2 +200 dtk (30 dtk), hint 3 +300 dtk (45 dtk dan soal hangus). Buka ulang dalam jendela aktif tanpa penalti baru.',
        'Hint yang lewat masa aksesnya berstatus “Hangus 🔥”. Peringkat: waktu, lalu hangus, hint, lalu kesalahan.'
      ]
    }
  };

  var states = {};

  function getState(id) {
    if (!states[id]) {
      states[id] = {
        screen: 'dashboard',
        count: CONFIG[id].defaultCount,
        lbCount: CONFIG[id].defaultCount,
        countChoice: CONFIG[id].defaultCount,
        session: null,
        result: null,
        duel: null,
        rapid: null,
        rapidResult: null,
        room: null,
        phase: 'idle',
        abort: null,
        timerId: null,
        hintTimer: null,
        hintUiTimer: null,
        hintClose: null,
        keyHandler: null,
        lastRenderedQuestion: -1
      };
    }
    return states[id];
  }

  function cleanupState(st) {
    if (st.timerId) { clearInterval(st.timerId); st.timerId = null; }
    if (st.hintTimer) { clearTimeout(st.hintTimer); st.hintTimer = null; }
    if (st.hintUiTimer) { clearInterval(st.hintUiTimer); st.hintUiTimer = null; }
    if (st.advanceTimer) { clearTimeout(st.advanceTimer); st.advanceTimer = null; }
    if (st.gainTimer) { clearTimeout(st.gainTimer); st.gainTimer = null; }
    if (st.startTimer) { clearTimeout(st.startTimer); st.startTimer = null; }
    if (typeof st.hintClose === 'function') { st.hintClose(); st.hintClose = null; }
    if (st.abort) { st.abort.abort(); st.abort = null; }
    st.keyHandler = null;
  }

  function closeRoom(st) {
    if (!st || !st.room) return;
    if (GH.room && typeof GH.room.close === 'function') GH.room.close(st.room);
    st.room = null;
  }

  function player() {
    var p = S.getProfile();
    return { name: p.name || 'Pemain', avatar: p.avatar || '🦊' };
  }

  /* ---------------- Aturan ZIP yang dipakai bersama ---------------- */
  var G1_WARNING_MS = 180000;
  var G2_BUFFER = 80;
  var G3_WRONG_PENALTIES = [60, 180, 300];
  var G3_HINT_CONFIG = {
    1: { penalty: 100, durationSec: 30 },
    2: { penalty: 200, durationSec: 30 },
    3: { penalty: 300, durationSec: 45 }
  };

  var g1QuestionHistory = [];
  var g2UsedIds = [];
  var g3UsedIds = [];

  function tenthsToScore(tenths) {
    return Math.round(Number(tenths) || 0) / 10;
  }

  function formatScore(value) {
    var tenths = Math.round((Number(value) || 0) * 10);
    var text = (Math.abs(tenths) / 10).toFixed(1).replace('.', ',');
    return tenths < 0 ? '−' + text : text;
  }

  function formatDuration(seconds) {
    var total = Math.max(0, Math.floor(Number(seconds) || 0));
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    var mm = String(m).padStart(2, '0');
    var ss = String(s).padStart(2, '0');
    return h > 0 ? h + ':' + mm + ':' + ss : mm + ':' + ss;
  }

  function secondOf(entry) {
    return Math.floor(Number(entry && entry.timeMs || 0) / 1000);
  }

  function tenthOf(entry) {
    return Math.round(Number(entry && entry.score) || 0);
  }

  function gapToBeat(row, candidate) {
    return formatDuration(Math.max(1, secondOf(candidate) - secondOf(row) + 1));
  }

  function gapToBeatScore(row, candidate) {
    return formatScore(tenthsToScore(Math.max(1, tenthOf(row) - tenthOf(candidate) + 1)));
  }

  function difference(row, candidate, rapid) {
    if (rapid) return formatScore(tenthsToScore(Math.abs(tenthOf(row) - tenthOf(candidate))));
    return formatDuration(Math.abs(secondOf(row) - secondOf(candidate)));
  }

  function buildMultiplyQuestions(count) {
    if (g1QuestionHistory.length >= 100 - count) g1QuestionHistory = [];
    var used = {};
    g1QuestionHistory.forEach(function (key) { used[key] = true; });
    var pool = [];
    for (var a = 1; a <= 10; a++) {
      for (var b = 1; b <= 10; b++) {
        if (!used[a + 'x' + b]) pool.push({ a: a, b: b, answer: a * b });
      }
    }
    var picked = U.shuffle(pool).slice(0, count);
    picked.forEach(function (q) { g1QuestionHistory.push(q.a + 'x' + q.b); });
    return picked;
  }

  // Rotasi kategori mengikuti ZIP: 1,2,3,…,N,1,2,3,… dengan riwayat ID global
  // yang dikosongkan ketika pool mulai menipis.
  function buildCategoryQuestions(bank, count, history, rng) {
    var categories = [];
    var grouped = Object.create(null);
    bank.forEach(function (q) {
      var cat = q.category == null ? 'Umum' : q.category;
      if (!grouped[cat]) { grouped[cat] = []; categories.push(cat); }
      grouped[cat].push(q);
    });
    categories.sort(function (a, b) {
      var na = Number(a), nb = Number(b);
      if (isFinite(na) && isFinite(nb)) return na - nb;
      return String(a).localeCompare(String(b));
    });
    if (!categories.length) return [];
    if (history.length >= bank.length - count) history.length = 0;

    var out = [];
    var pointer = 0;
    var guard = 0;
    var limit = count * 50 + 500;
    while (out.length < count && guard++ < limit) {
      var cat = categories[pointer++ % categories.length];
      var pool = grouped[cat].filter(function (q) {
        return history.indexOf(q.id) < 0 && !out.some(function (p) { return p.id === q.id; });
      });
      if (!pool.length) continue;
      var pick = pool[Math.floor((rng ? rng() : Math.random()) * pool.length)];
      out.push(pick);
      history.push(pick.id);
    }
    return out;
  }

  function metricLabel(cfg, entry) {
    if (cfg.kind === 'rapid') return formatScore(entry.score) + ' poin';
    return formatDuration((entry.timeMs || 0) / 1000);
  }

  function buildRankInsight(cfg, key, candidate, rows) {
    var config = S.getBoardConfig(key);
    var max = config.max || 10;
    var rank = S.rankFor(key, candidate, rows);
    var qualifies = rank <= max;
    var rapid = cfg.kind === 'rapid';
    var tone = (rank === 1 || rank <= 3) ? 'top' : qualifies ? 'ok' : 'miss';

    if (!rows.length) {
      return {
        rank: 1, qualifies: true, tone: 'top',
        headline: '🏆 Kamu yang pertama di papan ini',
        details: [{ icon: '💾', text: 'Simpan hasilmu untuk langsung menempati peringkat 1.' }]
      };
    }

    var sorted = rows.slice().sort(function (a, b) { return S.compareBoardEntries(key, a, b); });
    var top = sorted[0];
    var third = sorted[Math.min(2, sorted.length - 1)];
    var last = sorted[Math.min(max - 1, sorted.length - 1)];
    var details = [];
    var unit = rapid ? ' poin' : '';

    function diff(row) {
      return difference(row, candidate, rapid);
    }

    function beat(row) {
      return rapid ? gapToBeatScore(row, candidate) : gapToBeat(row, candidate);
    }

    if (rank === 1) {
      return {
        rank: rank, qualifies: qualifies, tone: 'top',
        headline: '👑 Rekor baru, kamu peringkat 1',
        details: [{ icon: '⚡', text: diff(top) + unit + ' lebih ' + (rapid ? 'tinggi' : 'cepat') + ' dari rekor lama ' + top.name + '.' }]
      };
    }

    if (rank <= 3) {
      var above = sorted[rank - 2];
      details.push({ icon: '🐢', text: 'Tertinggal ' + diff(top) + unit + ' dari peringkat 1.' });
      details.push({ icon: '🚀', text: 'Butuh ' + beat(above) + unit + ' lagi untuk naik ke peringkat ' + (rank - 1) + '.' });
      return {
        rank: rank, qualifies: qualifies, tone: 'top',
        headline: (rank === 2 ? '🥈' : '🥉') + ' Masuk top 3! Peringkat ' + rank,
        details: details
      };
    }

    if (qualifies) {
      details.push({ icon: '🥉', text: 'Butuh ' + beat(third) + unit + ' lagi untuk masuk top 3.' });
      details.push({ icon: '🐢', text: 'Tertinggal ' + diff(top) + unit + ' dari peringkat 1.' });
      return {
        rank: rank, qualifies: qualifies, tone: 'ok',
        headline: '🎯 Kamu masuk leaderboard, peringkat ' + rank,
        details: details
      };
    }

    details.push({ icon: '📉', text: 'Papan ' + max + ' besar ditutup oleh ' + metricLabel(cfg, last) + '.' });
    details.push({ icon: '🎯', text: 'Butuh ' + beat(last) + unit + ' lagi untuk masuk leaderboard.' });
    return {
      rank: rank, qualifies: qualifies, tone: 'miss',
      headline: '💪 Belum masuk leaderboard, coba lagi yuk',
      details: details
    };
  }

  function rankInsightMarkup(insight, max, saved) {
    var note = saved
      ? '✓ Hasil ini sudah tersimpan di papan peringkat.'
      : insight.qualifies
        ? 'Hasil ini belum disimpan. Tekan tombol di bawah untuk menulisnya ke papan peringkat.'
        : 'Hasil ini tidak masuk ' + max + ' besar, sehingga tidak ditawarkan untuk disimpan.';
    return '<div class="rank-insight is-' + U.attr(insight.tone) + '" data-rank-insight>' +
      '<div class="rank-insight__head"><span class="rank-insight__badge">#' + insight.rank + '</span>' +
      '<strong>' + U.esc(insight.headline) + '</strong></div>' +
      '<ul>' + insight.details.map(function (d) {
        return '<li data-icon="' + U.attr(d.icon) + '">' + U.esc(d.text) + '</li>';
      }).join('') + '</ul>' +
      '<p class="tiny muted">' + note + '</p>' +
    '</div>';
  }

  function boardKey(cfg, count) {
    return cfg.kind === 'rapid' ? cfg.boardPrefix : cfg.boardPrefix + ':' + count;
  }

  function bestFor(cfg, count) {
    return S.bestScore(boardKey(cfg, count));
  }

  function sessionsFor(id) {
    return S.getActivity().filter(function (a) { return a.game === id; }).length;
  }

  function heroStats(cfg) {
    if (cfg.kind === 'rapid') {
      var best = bestFor(cfg, 1);
      return [
        { label: 'Skor terbaik', value: best ? formatScore(best.score) : '—', sub: best ? best.name : 'belum ada' },
        { label: 'Sesi', value: sessionsFor(cfg.id) },
        { label: 'Bank soal', value: U.formatNumber(GH.bank.knowledge.length), sub: 'soal' }
      ];
    }
    var bestCurrent = bestFor(cfg, getState(cfg.id).countChoice);
    return [
      { label: 'Waktu terbaik · ' + getState(cfg.id).countChoice + ' soal', value: bestCurrent ? U.formatMs(bestCurrent.timeMs) : '—', sub: bestCurrent ? bestCurrent.name : 'belum ada' },
      { label: 'Sesi', value: sessionsFor(cfg.id) },
      { label: 'Bank soal', value: cfg.id === 'advmath' ? U.formatNumber(GH.bank.advmath.length) : '10 × 10', sub: cfg.id === 'advmath' ? 'soal' : 'kombinasi' }
    ];
  }

  function statCards(items) {
    return '<div class="stat-grid">' + items.map(function (s) {
      return '<div class="stat"><div class="stat__label">' + U.esc(s.label) + '</div><div class="stat__value">' + s.value + (s.sub ? ' <small>' + U.esc(s.sub) + '</small>' : '') + '</div></div>';
    }).join('') + '</div>';
  }

  function identityPanel() {
    var p = player();
    var guest = !(GH.identity && GH.identity.isRegistered && GH.identity.isRegistered());
    return '<div class="identity-card identity-card--shared">' +
      '<div class="identity-card__avatar" aria-hidden="true" data-gh-identity-avatar>' + U.esc(p.avatar) + '</div>' +
      '<div class="identity-card__body">' +
        '<span class="label">Identitas pemain</span>' +
        '<strong class="identity-card__name" data-gh-identity-name>' + U.esc(p.name) + '</strong>' +
        '<p class="input-hint">' + (guest
          ? 'Identitas tamu hanya berlaku di sesi ini.'
          : 'Identitas terpusat dipakai di semua game.') + '</p>' +
      '</div>' +
      '<div class="identity-card__action">' +
        (guest
          ? '<button class="btn btn--primary btn--sm" type="button" data-open="create-profile" data-gh-create-profile>Create Profile</button>'
          : '<button class="btn btn--ghost btn--sm" type="button" data-open="profile">Kelola profil</button>') +
      '</div>' +
    '</div>';
  }

  function bindIdentity(host) {
    // Identitas kini dikelola komponen bersama. Tidak ada penulisan profil
    // dari dalam game; tombol memakai handler global [data-open].
  }

  /* ---------------- Dashboard ---------------- */
  function renderDashboard(cfg, host) {
    var state = getState(cfg.id);
    var p = player();
    var best = bestFor(cfg, cfg.kind === 'rapid' ? 1 : state.countChoice);
    var countPicker = '';
    if (cfg.kind === 'timed') {
      countPicker = '<div class="quiz-count">' +
        '<span class="label">Jumlah soal</span>' +
        '<div class="segmented segmented--wide" role="group" aria-label="Jumlah soal">' +
          cfg.counts.map(function (n) {
            return '<button class="segmented__btn" type="button" data-count="' + n + '" aria-pressed="' + (state.countChoice === n ? 'true' : 'false') + '">' + n + ' soal</button>';
          }).join('') +
        '</div>' +
      '</div>';
    } else {
      countPicker = '<div class="quiz-count">' +
        '<span class="label">Format ronde</span>' +
        '<div class="rapid-format"><span class="badge badge--theme">60 detik</span><span class="tiny muted">Soal berganti otomatis setelah dijawab. Waktu terus berjalan.</span></div>' +
      '</div>';
    }

    host.innerHTML = '<div class="game-shell" style="--theme-accent:' + cfg.accent + '">' +
      UI.gameHeader({ title: cfg.title, subtitle: cfg.subtitle, glyph: cfg.glyph, backLabel: 'Hub' }) +
      '<div class="game-wrap">' +
        '<section class="game-hero game-hero--' + cfg.id + '">' +
          '<div class="game-hero__copy">' +
            '<span class="eyebrow">' + U.esc(cfg.kicker) + '</span>' +
            '<h1>' + U.esc(cfg.title) + '</h1>' +
            '<p>' + U.esc(cfg.tagline) + '</p>' +
            '<div class="row">' +
              '<span class="badge badge--theme">' + U.esc(cfg.bankLabel) + '</span>' +
              '<span class="badge">' + (cfg.kind === 'rapid' ? 'Ronde 60 detik' : '10 / 20 / 30 soal') + '</span>' +
              '<span class="badge">Kuis & Duel online</span>' +
            '</div>' +
          '</div>' +
          '<div class="game-hero__art" aria-hidden="true">' +
            (cfg.id === 'multiply' ? '<div class="quiz-art quiz-art--multiply"><span>7</span><i>×</i><span>8</span><b>= ?</b></div>' :
             cfg.id === 'advmath' ? '<div class="quiz-art quiz-art--adv"><span>?</span><i>2.000</i><b>soal</b></div>' :
             '<div class="quiz-art quiz-art--rapid"><span>?</span><em>60</em></div>') +
          '</div>' +
        '</section>' +
        statCards(heroStats(cfg)) +
        '<div class="quiz-dash">' +
          '<section class="panel quiz-start">' +
            '<div class="panel__head"><div><span class="eyebrow">Siap bermain</span><h2>' + (cfg.kind === 'rapid' ? 'Mulai ronde 60 detik' : 'Mulai kuis') + '</h2></div><span class="badge badge--theme"><span data-gh-identity-avatar>' + (p.avatar) + '</span> <span data-gh-identity-name>' + U.esc(p.name) + '</span></span></div>' +
            '<div class="panel__body stack">' +
              identityPanel() +
              countPicker +
              '<div class="quiz-actions">' +
                '<button class="btn btn--primary btn--lg" type="button" data-start-quiz><span class="btn__icon" aria-hidden="true">▶</span> Mulai ' + (cfg.kind === 'rapid' ? 'ronde' : 'kuis') + '</button>' +
                '<button class="btn btn--ghost" type="button" data-start-room>◈ Duel online</button>' +
              '</div>' +
              '<p class="tiny muted">Duel online: dua perangkat, satu kode room, balapan langsung dengan soal identik. Memerlukan profil terdaftar.</p>' +
              '<details class="rules-details">' +
                '<summary>Aturan dan penalti</summary>' +
                '<ul>' + cfg.rules.map(function (r) { return '<li>' + U.esc(r) + '</li>'; }).join('') + '</ul>' +
              '</details>' +
            '</div>' +
          '</section>' +
          '<aside class="quiz-side">' +
            '<section class="panel best-card">' +
              '<div class="panel__head"><div><span class="eyebrow">Target berikutnya</span><h3>Rekor terbaik</h3></div></div>' +
              '<div class="panel__body">' +
                (best ?
                  '<div class="best-card__main"><span class="best-card__value">' + (cfg.kind === 'rapid' ? formatScore(best.score) : formatDuration(best.timeMs / 1000)) + '</span>' +
                  '<div class="best-card__meta">' + U.esc(best.name) + ' · ' + U.formatDate(best.date) + '</div></div>' :
                  '<div class="best-card__main"><span class="best-card__value">—</span><div class="best-card__meta">Belum ada rekor. Sesi pertamamu akan muncul di sini.</div></div>') +
                '<button class="btn btn--ghost btn--block btn--sm" type="button" data-open="leaderboards">Lihat semua papan skor</button>' +
              '</div>' +
            '</section>' +
            '<section class="panel lb-card">' +
              '<div class="panel__head"><div><span class="eyebrow">Peringkat</span><h3>' + (cfg.kind === 'rapid' ? '10 teratas' : '7 teratas') + '</h3></div></div>' +
              '<div class="panel__body">' +
                (cfg.kind === 'timed' ? '<div class="mini-tabs" role="tablist" aria-label="Jumlah soal">' +
                  cfg.counts.map(function (n) {
                    return '<button class="mini-tab" type="button" role="tab" data-lb-count="' + n + '" aria-selected="' + (state.lbCount === n ? 'true' : 'false') + '">' + n + ' soal</button>';
                  }).join('') + '</div>' : '') +
                '<div data-lb-body>' + leaderboardFor(cfg, state.lbCount) + '</div>' +
              '</div>' +
            '</section>' +
          '</aside>' +
        '</div>' +
        '<section class="rule-cards">' +
          (cfg.kind === 'timed' ? timedRuleCards(cfg) : rapidRuleCards()) +
        '</section>' +
      '</div>' +
    '</div>';

    bindIdentity(host);
    host.dataset.game = cfg.id;

    host.querySelector('[data-game-back]').addEventListener('click', function () { R.go('hub'); });
    host.querySelector('[data-start-quiz]').addEventListener('click', function () {
      saveIdentity(host);
      startTimedOrRapid(cfg, host);
    });
    host.querySelector('[data-start-room]').addEventListener('click', function () {
      saveIdentity(host);
      openRoomDialog(cfg, host);
    });
    Array.prototype.forEach.call(host.querySelectorAll('[data-count]'), function (btn) {
      btn.addEventListener('click', function () {
        state.countChoice = Number(btn.dataset.count);
        state.count = state.countChoice;
        Array.prototype.forEach.call(host.querySelectorAll('[data-count]'), function (b) {
          b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
        });
        var stats = host.querySelector('.stat-grid');
        if (stats) stats.outerHTML = statCards(heroStats(cfg));
      });
    });
    Array.prototype.forEach.call(host.querySelectorAll('[data-lb-count]'), function (btn) {
      btn.addEventListener('click', function () {
        state.lbCount = Number(btn.dataset.lbCount);
        Array.prototype.forEach.call(host.querySelectorAll('[data-lb-count]'), function (b) {
          b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
        });
        var body = host.querySelector('[data-lb-body]');
        if (body) body.innerHTML = leaderboardFor(cfg, state.lbCount);
      });
    });
    host.querySelector('[data-sound-toggle]').addEventListener('click', UI.toggleSound);
    host.querySelector('[data-open="settings"]').addEventListener('click', function () { GH.app.openSettings(); });
  }

  function saveIdentity(host) {
    // Disimpan sebagai no-op agar alur tombol lama tetap berfungsi tanpa
    // menimpa identitas terpusat.
  }

  function leaderboardFor(cfg, count) {
    var key = boardKey(cfg, count);
    var rows = S.getBoard(key);
    if (!rows.length) {
      return UI.emptyState('◇', 'Belum ada skor', 'Selesaikan satu sesi untuk mengisi papan peringkat ini.');
    }
    return UI.leaderboard(rows, {
      empty: 'Belum ada skor.',
      value: function (row) {
        return cfg.kind === 'rapid'
          ? formatScore(row.score) + '<small>poin</small>'
          : formatDuration((row.timeMs || 0) / 1000) + '<small>' + (row.meta && row.meta.label ? row.meta.label : (row.mistakes || 0) + ' salah') + '</small>';
      },
      sub: function (row) {
        return (row.meta && row.meta.label) ? row.meta.label : U.formatDate(row.date);
      }
    });
  }

  function timedRuleCards(cfg) {
    if (cfg.id === 'multiply') {
      return '<article class="rule-card"><span class="rule-card__icon">➜</span><div><h3>Murni kecepatan</h3><p>Tidak ada penalti waktu. Jawaban salah hanya menambah jumlah kesalahan dan soal tetap bisa dijawab lagi.</p></div></article>' +
        '<article class="rule-card"><span class="rule-card__icon">✦</span><div><h3>Tabel perkalian</h3><p>Hint membuka seluruh tabel 1–10 kapan saja tanpa penalti.</p></div></article>' +
        '<article class="rule-card"><span class="rule-card__icon">◷</span><div><h3>Waktu akhir</h3><p>Stopwatch berhenti saat soal terakhir benar. Peringkat: waktu, lalu kesalahan.</p></div></article>';
    }
    return '<article class="rule-card"><span class="rule-card__icon">➜</span><div><h3>Penalti kumulatif</h3><p>Salah ke-1 +60, ke-2 +180, ke-3 +300 detik dan soal hangus.</p></div></article>' +
      '<article class="rule-card"><span class="rule-card__icon">✦</span><div><h3>Hint berjendela</h3><p>Hint 1 +100/30 dtk, hint 2 +200/30 dtk, hint 3 +300/45 dtk. Buka ulang tanpa penalti baru selama jendela aktif.</p></div></article>' +
      '<article class="rule-card"><span class="rule-card__icon">◷</span><div><h3>Waktu akhir</h3><p>Dikunci saat soal terakhir selesai. Peringkat: waktu, hangus, hint, lalu kesalahan.</p></div></article>';
  }

  function rapidRuleCards() {
    return '<article class="rule-card rule-card--wide"><span class="rule-card__icon">▣</span><div><h3>Skor per jawaban</h3><p>Klik pertama 1,0; klik kedua 0,7; klik ketiga 0,3. Hint membatasi poin maksimum menjadi 0,3.</p></div></article>' +
      '<article class="rule-card"><span class="rule-card__icon">✧</span><div><h3>Pembahasan opsi</h3><p>Opsi salah bisa diklik lagi untuk membuka penjelasannya. Hint menyisakan satu pengecoh dan berhenti setelah dua klik salah.</p></div></article>' +
      '<article class="rule-card"><span class="rule-card__icon">⌁</span><div><h3>Hangus & bonus</h3><p>Soal hangus hanya bila tak ada pengecoh tersisa (−1,0). Bonus: 5 +3,0; 10 +7,0; kelipatan 5 berikutnya +10,0.</p></div></article>';
  }

  /* ---------------- Countdown / timer helpers ---------------- */
  function countdown(host, cfg, done) {
    var stage = host.querySelector('.game-shell') || host;
    UI.countdown(stage, {
      from: 3,
      hint: cfg.kind === 'rapid' ? 'Ronde 60 detik dimulai…' : 'Kuis dimulai…'
    }).then(done);
  }

  function startTimedOrRapid(cfg, host) {
    if (cfg.kind === 'timed') startTimedSession(cfg, host, {});
    else startRapidSession(cfg, host, {});
  }

  function startTimer(st, cfg, onTick, onEnd) {
    clearInterval(st.timerId);
    var start = (st.session && st.session.startedAt) || (st.rapid && st.rapid.startedAt) || st.startedAt;
    if (!start) start = st.startedAt = performance.now();
    st.timerId = setInterval(function () {
      var elapsed = performance.now() - start;
      if (onTick) onTick(elapsed);
      if (cfg.kind === 'rapid' && elapsed >= cfg.duration * 1000) {
        clearInterval(st.timerId);
        st.timerId = null;
        if (onEnd) onEnd();
      }
    }, 100);
  }

  /* ---------------- Timed game ---------------- */
  function startTimedSession(cfg, host, opts) {
    var st = getState(cfg.id);
    cleanupState(st);
    st.screen = 'play';
    st.phase = 'countdown';
    st.count = opts.count || st.countChoice;
    st.result = null;
    st.duel = opts.duel || null;
    st.session = {
      questions: opts.questions || buildTimedQuestions(cfg, st.count),
      index: 0,
      input: '',
      correct: 0,
      burned: 0,
      wrongAttempts: 0,
      mistakeCount: 0,
      hintsUsed: 0,
      hintLevel: 0,
      hintDeadlines: {},
      burnDeadline: 0,
      questionToken: 0,
      lockedTotalMs: null,
      warningShown: false,
      locked: false,
      penaltySec: 0,
      startedAt: 0,
      elapsedMs: 0,
      finished: false,
      player: opts.player || player(),
      isDuel: !!opts.duel
    };
    R.setGuard({
      title: st.duel ? 'Keluar dari duel?' : 'Keluar dari kuis?',
      body: 'Waktu dan progres sesi ini belum disimpan. Kamu bisa memulai lagi kapan saja.',
      confirmLabel: 'Ya, keluar',
      onAbort: function () { abortTimed(cfg, st); }
    });
    paint(cfg, host);

    var begin = function () {
      st.startTimer = null;
      st.phase = 'playing';
      st.session.startedAt = performance.now();
      paint(cfg, host);
      startTimer(st, cfg, function (elapsed) {
        st.session.elapsedMs = elapsed;
        updateTimedTimer(cfg, st);
        syncTimedRoom(cfg, st, false);
      });
      focusQuestion(host);
    };

    if (opts.autoStartAt) {
      var delay = Math.max(0, Number(opts.autoStartAt) - Date.now());
      var stage = host.querySelector('.game-shell') || host;
      UI.countdown(stage, {
        from: Math.max(1, Math.ceil(delay / 1000)),
        hint: 'Duel online dimulai…',
        finalLabel: 'Mulai!'
      }).then(function () {
        var rest = Math.max(0, Number(opts.autoStartAt) - Date.now());
        if (rest > 0) st.startTimer = setTimeout(begin, rest);
        else begin();
      });
      return;
    }

    countdown(host, cfg, begin);
  }

  function abortTimed(cfg, st) {
    cleanupState(st);
    closeRoom(st);
    st.phase = 'idle';
    st.session = null;
    st.duel = null;
    st.screen = 'dashboard';
    st.result = null;
    var host = document.querySelector('[data-view="' + cfg.id + '"]');
    if (host) paint(cfg, host);
  }

  function buildTimedQuestions(cfg, count) {
    if (cfg.id === 'multiply') return buildMultiplyQuestions(Number(count));
    var rng = U.mulberry32('advmath-' + Date.now() + '-' + Math.random());
    return buildCategoryQuestions(GH.bank.advmath, Number(count), g3UsedIds, rng);
  }

  function currentTimedQuestion(st) {
    return st.session && st.session.questions[st.session.index];
  }

  function timedTotalMs(st) {
    return Math.max(0, st.session.elapsedMs) + st.session.penaltySec * 1000;
  }

  function updateTimedTimer(cfg, st) {
    var host = document.querySelector('[data-view="' + cfg.id + '"]');
    if (!host || !st.session) return;
    var total = timedTotalMs(st);
    Array.prototype.forEach.call(host.querySelectorAll('[data-timer]'), function (el) {
      el.textContent = formatDuration(total / 1000);
      if (cfg.id === 'multiply') el.classList.toggle('is-warning', st.session.elapsedMs >= G1_WARNING_MS);
    });
    Array.prototype.forEach.call(host.querySelectorAll('[data-penalty]'), function (el) {
      el.textContent = st.session.penaltySec ? '+' + st.session.penaltySec + ' dtk' : '0 dtk';
    });
    var warning = host.querySelector('[data-time-warning]');
    if (warning) warning.hidden = cfg.id !== 'multiply' || st.session.elapsedMs < G1_WARNING_MS;
    var burn = host.querySelector('[data-burn-banner]');
    if (burn) {
      var remain = st.session.burnDeadline ? Math.max(0, Math.ceil((st.session.burnDeadline - Date.now()) / 1000)) : 0;
      burn.hidden = !st.session.burnDeadline || remain <= 0;
      var count = burn.querySelector('[data-burn-count]');
      if (count) count.textContent = String(remain);
    }
    var bar = host.querySelector('[data-time-bar]');
    if (bar) {
      var target = Math.min(100, (st.session.index / Math.max(1, st.session.questions.length)) * 100);
      bar.style.width = target + '%';
    }
  }

  function isChoiceQuestion(q) {
    return !!(q && Array.isArray(q.options) && q.options.length >= 2 && q.correctIndex != null);
  }

  function choiceAnswer(q) {
    return isChoiceQuestion(q) ? q.options[q.correctIndex] : q.answer;
  }

  function renderTimedPlay(cfg, host) {
    var st = getState(cfg.id);
    var ss = st.session;
    var q = currentTimedQuestion(st);
    if (!q) { finishTimed(cfg, host); return; }
    if (cfg.id === 'multiply') renderMultiplyPlay(cfg, host, st, st.session);
    else renderAdvmathPlay(cfg, host, st, st.session);
  }

  function timedDots(ss) {
    return ss.questions.map(function (_, i) {
      return '<span class="quiz-dot' + (i < ss.index ? ' is-done' : i === ss.index ? ' is-now' : '') + '"></span>';
    }).join('');
  }

  function renderMultiplyPlay(cfg, host, st, ss) {
    var q = currentTimedQuestion(st);
    var total = ss.questions.length;
    host.innerHTML = '<div class="game-shell">' +
      UI.gameHeader({ title: cfg.title, subtitle: 'Soal ' + (ss.index + 1) + ' dari ' + total, glyph: cfg.glyph, backLabel: 'Keluar' }) +
      '<div class="game-wrap game-wrap--play">' +
        '<div class="quiz-play-top">' +
          '<div class="quiz-progress"><span class="quiz-progress__label">Progres</span><div class="quiz-dots">' + timedDots(ss) + '</div><span class="quiz-progress__count">' + ss.index + '/' + total + '</span></div>' +
          '<div class="quiz-live-stats">' +
            '<div class="live-stat"><span class="live-stat__label">Waktu</span><strong data-timer>' + formatDuration(ss.elapsedMs / 1000) + '</strong></div>' +
            '<div class="live-stat"><span class="live-stat__label">Benar</span><strong class="text-success">' + ss.correct + '</strong></div>' +
            '<div class="live-stat"><span class="live-stat__label">Kesalahan</span><strong class="text-danger">' + ss.mistakeCount + '</strong></div>' +
          '</div>' +
        '</div>' +
        '<div class="progress progress--thin quiz-timebar"><div class="progress__bar" data-time-bar style="width:' + ((ss.index / total) * 100) + '%"></div></div>' +
        '<div class="quiz-play-grid">' +
          '<section class="panel question-panel">' +
            '<div class="question-panel__top"><span class="badge badge--theme">' + U.esc(cfg.bankLabel) + '</span>' +
              '<span class="question-panel__warn">Tanpa penalti waktu</span></div>' +
            '<div class="question-expression" tabindex="-1" data-question-focus>' +
              '<span>' + q.a + '</span><i>×</i><span>' + q.b + '</span><b>=</b><em class="question-answer" data-answer-display>' + (ss.input || '?') + '</em>' +
            '</div>' +
            '<div class="feedback-line" data-feedback aria-live="polite"></div>' +
            '<div class="notice notice--warning" data-time-warning hidden><p>Stopwatch sudah melewati 03:00. Tetap tenang, kecepatan tetap dihitung tanpa penalti.</p></div>' +
            '<div class="question-actions"><button class="btn btn--ghost btn--sm" type="button" data-g1-hint>✦ Buka tabel perkalian</button>' +
              '<span class="tiny muted">Hint tidak menambah waktu.</span></div>' +
          '</section>' +
          '<section class="keypad-panel">' +
            '<div class="keypad" role="group" aria-label="Keypad jawaban">' +
              [1,2,3,4,5,6,7,8,9].map(function (n) { return '<button class="key" type="button" data-key="' + n + '">' + n + '</button>'; }).join('') +
              '<button class="key key--soft" type="button" data-key="clear" aria-label="Hapus">⌫</button>' +
              '<button class="key" type="button" data-key="0">0</button>' +
              '<button class="key key--go" type="button" data-key="enter" aria-label="Kirim jawaban">↵</button>' +
            '</div>' +
            '<p class="keypad-note">Ketik angka, lalu tekan ↵. Bisa juga memakai keyboard.</p>' +
            '<div class="quiz-mini-side">' +
              '<div><span class="label">Soal</span><strong>' + (ss.index + 1) + ' / ' + total + '</strong></div>' +
              '<div><span class="label">Salah</span><strong>' + ss.mistakeCount + '</strong></div>' +
              '<div><span class="label">Waktu</span><strong data-timer>' + formatDuration(ss.elapsedMs / 1000) + '</strong></div>' +
            '</div>' +
          '</section>' +
        '</div>' +
      '</div>' +
    '</div>';
    bindTimedPlay(cfg, host);
  }

  function renderAdvmathPlay(cfg, host, st, ss) {
    var q = currentTimedQuestion(st);
    var total = ss.questions.length;
    var wrongDots = '';
    for (var i = 0; i < 3; i++) wrongDots += '<i class="' + (i < ss.wrongAttempts ? 'is-on' : '') + '"></i>';
    var optionLabels = ['A', 'B', 'C', 'D'];
    var optionsHtml = (q.options || []).map(function (opt, idx) {
      return '<button class="option" type="button" data-timed-option="' + idx + '">' +
        '<span class="option__key">' + (optionLabels[idx] || idx + 1) + '</span>' +
        '<span class="option__text">' + U.esc(opt) + '</span>' +
        '<span class="option__mark" aria-hidden="true"></span>' +
      '</button>';
    }).join('');
    var hintButtons = [1, 2, 3].map(function (level) {
      var cfgHint = G3_HINT_CONFIG[level];
      var deadline = ss.hintDeadlines[level] || 0;
      var left = deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : 0;
      var state = deadline ? (left > 0 ? 'is-active' : 'is-expired') : '';
      return '<button class="advmath-hint-btn ' + state + '" type="button" data-hint="' + level + '" ' + (left === 0 && deadline ? 'disabled' : '') + ' style="--p:' + (deadline && left ? (left / cfgHint.durationSec).toFixed(3) : '1') + '">' +
        '<strong>Hint ' + level + '</strong><span class="hint-cost">+' + cfgHint.penalty + ' dtk</span>' +
        '<span class="advmath-hint-status">' + (deadline ? (left > 0 ? left + ' dtk' : 'Hangus 🔥') : '') + '</span>' +
      '</button>';
    }).join('');
    host.innerHTML = '<div class="game-shell">' +
      UI.gameHeader({ title: cfg.title, subtitle: 'Soal ' + (ss.index + 1) + ' dari ' + total, glyph: cfg.glyph, backLabel: 'Keluar' }) +
      '<div class="game-wrap game-wrap--play">' +
        '<div class="quiz-play-top">' +
          '<div class="quiz-progress"><span class="quiz-progress__label">Progres</span><div class="quiz-dots">' + timedDots(ss) + '</div><span class="quiz-progress__count">' + ss.index + '/' + total + '</span></div>' +
          '<div class="quiz-live-stats">' +
            '<div class="live-stat"><span class="live-stat__label">Waktu</span><strong data-timer>' + formatDuration(timedTotalMs(st) / 1000) + '</strong></div>' +
            '<div class="live-stat"><span class="live-stat__label">Penalti</span><strong class="text-warning" data-penalty>' + (ss.penaltySec ? '+' + ss.penaltySec + ' dtk' : '0 dtk') + '</strong></div>' +
            '<div class="live-stat"><span class="live-stat__label">Benar</span><strong class="text-success">' + ss.correct + '</strong></div>' +
            '<div class="live-stat"><span class="live-stat__label">Hangus</span><strong class="text-danger">' + ss.burned + '</strong></div>' +
          '</div>' +
        '</div>' +
        '<div class="progress progress--thin quiz-timebar"><div class="progress__bar" data-time-bar style="width:' + ((ss.index / total) * 100) + '%"></div></div>' +
        '<div class="quiz-play-grid quiz-play-grid--choice">' +
          '<section class="panel question-panel question-panel--choice">' +
            '<div class="question-panel__top"><span class="badge badge--theme">' + U.esc(q.category || 'Umum') + '</span><span class="question-panel__warn">Kesalahan ' + wrongDots + '</span></div>' +
            '<div class="timed-question" tabindex="-1" data-question-focus><h2>' + U.esc(q.question) + '</h2></div>' +
            '<div class="options timed-options" role="group" aria-label="Pilihan jawaban">' + optionsHtml + '</div>' +
            '<div class="feedback-line" data-feedback aria-live="polite"></div>' +
            '<div class="notice notice--burn" data-burn-banner hidden><p>Soal hangus. Waktu hint masih berjalan · <strong data-burn-count>0</strong> dtk.</p>' +
              '<button class="btn btn--ghost btn--sm" type="button" data-advmath-next>Lanjut ↵</button></div>' +
            '<div class="hint-box' + (ss.hintLevel ? ' is-open' : '') + '" data-hint-box>' +
              (ss.hintLevel ? '<strong>Bantuan ' + ss.hintLevel + '</strong><span data-hint-text>' + U.esc(hintText(q, ss.hintLevel)) + '</span>' : '') +
            '</div>' +
            '<div class="hint-actions">' + hintButtons + '</div>' +
            '<p class="tiny muted hint-note">Hint bisa dibuka ulang selama masa aksesnya aktif tanpa penalti baru.</p>' +
          '</section>' +
        '</div>' +
      '</div>' +
    '</div>';
    bindTimedPlay(cfg, host);
  }

  function hintText(q, level) {
    if (isChoiceQuestion(q)) {
      var clue = q.clues && q.clues[level - 1];
      if (clue) return clue;
      if (level === 1) return 'Pilih satu jawaban yang paling masuk akal. Tersisa ' + q.options.length + ' pilihan.';
      if (level === 2) return 'Periksa kembali hitunganmu. Jawaban benar ada di antara pilihan yang tersedia.';
      return 'Jawaban benar: ' + choiceAnswer(q) + '. Soal ini hangus.';
    }
    if (level === 1) {
      var lo = Math.max(0, q.answer - 10);
      var hi = q.answer + 10;
      return 'Jawaban berada di antara ' + lo + ' dan ' + hi + '.';
    }
    if (level === 2) {
      if (q.b > 1) {
        return q.a + ' × ' + q.b + ' = (' + q.a + ' × ' + (q.b - 1) + ') + ' + q.a + ' = ' + (q.a * (q.b - 1)) + ' + ' + q.a + ' = ?';
      }
      return 'Kalikan ' + q.a + ' dengan ' + q.b + '. Coba uraikan menjadi penjumlahan berulang.';
    }
    return 'Jawabannya adalah ' + q.answer + '. Soal ini hangus.';
  }

  function focusQuestion(host) {
    var el = host.querySelector('[data-question-focus]');
    if (el) {
      try { el.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
  }

  function bindTimedPlay(cfg, host) {
    var st = getState(cfg.id);
    if (st.abort) st.abort.abort();
    st.abort = new AbortController();
    var signal = st.abort.signal;
    if (cfg.id === 'multiply') bindMultiplyPlay(cfg, host, st, signal);
    else bindAdvmathPlay(cfg, host, st, signal);
  }

  function bindMultiplyPlay(cfg, host, st, signal) {
    var ss = st.session;
    if (!ss) return;

    function typeDigit(d) {
      if (st.phase !== 'playing' || ss.locked || ss.finished) return;
      if (ss.input.length >= 6) return;
      if (ss.input === '0') ss.input = '';
      ss.input += d;
      var display = host.querySelector('[data-answer-display]');
      if (display) { display.textContent = ss.input; display.classList.add('is-pop'); }
      if (GH.audio) GH.audio.click();
    }

    function clearDigit() {
      if (st.phase !== 'playing' || ss.locked) return;
      ss.input = ss.input.slice(0, -1);
      var display = host.querySelector('[data-answer-display]');
      if (display) display.textContent = ss.input || '?';
      if (GH.audio) GH.audio.click();
    }

    function submit() {
      if (st.phase !== 'playing' || ss.locked || ss.finished) return;
      if (!ss.input) {
        UI.pulseClass(host.querySelector('[data-answer-display]'), 'is-shake');
        if (GH.audio) GH.audio.wrong();
        return;
      }
      var q = currentTimedQuestion(st);
      if (!q) return;
      var token = ss.questionToken;
      var display = host.querySelector('[data-answer-display]');
      if (Number(ss.input) === q.answer) {
        ss.correct++;
        ss.locked = true;
        if (GH.audio) GH.audio.correct();
        if (display) { display.textContent = q.answer; display.classList.add('is-correct'); }
        var fb = host.querySelector('[data-feedback]');
        if (fb) {
          fb.className = 'feedback-line is-correct';
          fb.innerHTML = '<strong>✓ Benar!</strong> ' + q.a + ' × ' + q.b + ' = ' + q.answer + '.';
        }
        setTimeout(function () { if (token === ss.questionToken) nextTimedQuestion(cfg, host); }, 480);
        return;
      }
      ss.mistakeCount++;
      ss.wrongAttempts++;
      if (GH.audio) GH.audio.wrong();
      UI.pulseClass(display, 'is-shake');
      ss.input = '';
      if (display) display.textContent = '?';
      var warnEl = host.querySelector('.question-panel__warn');
      if (warnEl) warnEl.textContent = ss.mistakeCount + ' kesalahan';
      var countEl = host.querySelector('.quiz-mini-side [data-timer]');
      var sideCount = host.querySelectorAll('.quiz-mini-side strong');
      if (sideCount.length > 1) sideCount[1].textContent = String(ss.mistakeCount);
      var statCount = host.querySelectorAll('.quiz-live-stats .live-stat strong');
      if (statCount.length > 2) statCount[2].textContent = String(ss.mistakeCount);
      if (countEl) countEl.textContent = formatDuration(ss.elapsedMs / 1000);
      var fb2 = host.querySelector('[data-feedback]');
      if (fb2) {
        fb2.className = 'feedback-line is-wrong';
        fb2.innerHTML = '<strong>Belum tepat.</strong> Tidak ada penalti waktu. Coba lagi.';
      }
    }

    function openTable() {
      var grid = document.createElement('div');
      grid.className = 'multiply-table';
      grid.innerHTML = U.range(10).map(function (i) {
        var n = i + 1;
        return '<section class="multiply-table__col"><strong>Tabel ' + n + '</strong>' +
          U.range(10).map(function (j) {
            var m = j + 1;
            return '<span>' + n + ' × ' + m + ' = <b>' + (n * m) + '</b></span>';
          }).join('') + '</section>';
      }).join('');
      UI.modal({
        title: 'Tabel perkalian 1–10',
        subtitle: 'Hint dibuka kapan saja tanpa penalti',
        body: grid,
        wide: true,
        actions: [{ label: 'Tutup', value: null, variant: 'ghost' }]
      });
      if (GH.audio) GH.audio.hint();
    }

    host.addEventListener('click', function (e) {
      var table = e.target.closest('[data-g1-hint]');
      if (table) { e.preventDefault(); openTable(); return; }
      var key = e.target.closest('[data-key]');
      if (key) {
        e.preventDefault();
        var k = key.dataset.key;
        if (k === 'clear') clearDigit();
        else if (k === 'enter') submit();
        else typeDigit(k);
      }
    }, { signal: signal });

    if (st.keyHandler) document.removeEventListener('keydown', st.keyHandler);
    st.keyHandler = function (e) {
      if (st.phase !== 'playing') return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (/^\d$/.test(e.key)) { e.preventDefault(); typeDigit(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); clearDigit(); }
      else if (e.key === 'Enter') { e.preventDefault(); submit(); }
    };
    document.addEventListener('keydown', st.keyHandler);
    signal.addEventListener('abort', function () {
      if (st.keyHandler) { document.removeEventListener('keydown', st.keyHandler); st.keyHandler = null; }
    });
  }

  function bindAdvmathPlay(cfg, host, st, signal) {
    var ss = st.session;
    if (!ss) return;

    function paintWrongDots() {
      var warn = host.querySelector('.question-panel__warn');
      if (!warn) return;
      var dots = '';
      for (var i = 0; i < 3; i++) dots += '<i class="' + (i < ss.wrongAttempts ? 'is-on' : '') + '"></i>';
      warn.innerHTML = 'Kesalahan ' + dots;
    }

    function revealAnswer(chosenIndex, revealClass) {
      var buttons = host.querySelectorAll('[data-timed-option]');
      Array.prototype.forEach.call(buttons, function (b) {
        b.disabled = true;
        var idx = Number(b.dataset.timedOption);
        if (idx === currentTimedQuestion(st).correctIndex) b.classList.add(revealClass || 'is-correct');
        else if (idx === chosenIndex) b.classList.add('is-wrong');
      });
    }

    function activeHintDeadline() {
      var now = Date.now();
      var best = null;
      [1, 2, 3].forEach(function (level) {
        var deadline = ss.hintDeadlines[level];
        if (deadline && deadline > now && (!best || deadline > best)) best = deadline;
      });
      return best;
    }

    function updateHintUI() {
      var now = Date.now();
      Array.prototype.forEach.call(host.querySelectorAll('[data-hint]'), function (btn) {
        var level = Number(btn.dataset.hint);
        var deadline = ss.hintDeadlines[level] || 0;
        var left = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;
        btn.classList.remove('is-active', 'is-expired');
        if (deadline && left > 0) {
          btn.classList.add('is-active');
          btn.disabled = false;
          btn.style.setProperty('--p', (left / G3_HINT_CONFIG[level].durationSec).toFixed(4));
        } else if (deadline) {
          btn.classList.add('is-expired');
          btn.disabled = true;
          btn.style.setProperty('--p', '0');
        } else {
          btn.disabled = !!(ss.locked || ss.burnedThisQuestion);
          btn.style.setProperty('--p', '1');
        }
        var status = btn.querySelector('.advmath-hint-status');
        if (status) status.textContent = deadline ? (left > 0 ? left + ' dtk' : 'Hangus 🔥') : '';
      });
      var modal = host.ownerDocument.querySelector('[data-hint-modal]');
      if (modal) {
        var level = Number(modal.dataset.level || 0);
        var deadline = ss.hintDeadlines[level] || 0;
        var left = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;
        var text = modal.querySelector('[data-hint-countdown]');
        if (text) text.textContent = left > 0 ? 'Sisa akses: ' + left + ' detik' : 'Akses hint sudah habis 🔥';
        var meter = modal.querySelector('[data-hint-meter]');
        if (meter) meter.style.width = (deadline ? Math.max(0, Math.min(100, (left / G3_HINT_CONFIG[level].durationSec) * 100)) : 100) + '%';
        var next = modal.querySelector('[data-hint-next]');
        if (next) next.hidden = !ss.burnedThisQuestion;
        if (deadline && left === 0 && typeof st.hintClose === 'function') {
          var close = st.hintClose;
          st.hintClose = null;
          close();
        }
      }
      updateTimedTimer(cfg, st);
    }

    function startHintUi() {
      if (st.hintUiTimer) clearInterval(st.hintUiTimer);
      st.hintUiTimer = setInterval(updateHintUI, 250);
    }

    function showHintModal(level) {
      var q = currentTimedQuestion(st);
      if (!q) return;
      if (typeof st.hintClose === 'function') { var old = st.hintClose; st.hintClose = null; old(); }
      var body = document.createElement('div');
      body.dataset.hintModal = '1';
      body.dataset.level = String(level);
      body.innerHTML = '<div class="hint-modal">' +
        '<p class="hint-modal__clue">' + U.esc((q.clues && q.clues[level - 1]) || 'Periksa kembali hitunganmu.') + '</p>' +
        '<p class="tiny muted">Penalti +' + G3_HINT_CONFIG[level].penalty + ' detik sudah masuk. Buka lagi dalam jendela aktif tanpa penalti baru.</p>' +
        '<div class="hint-modal__meter"><div data-hint-meter style="width:100%"></div></div>' +
        '<strong class="hint-modal__countdown" data-hint-countdown>Sisa akses: ' + G3_HINT_CONFIG[level].durationSec + ' detik</strong>' +
        '<button class="btn btn--ghost btn--sm" type="button" data-hint-next hidden>Lanjut ↵</button>' +
      '</div>';
      var closeRef = null;
      UI.modal({
        title: '💡 Hint ' + level,
        subtitle: q.question,
        body: body,
        actions: [{ label: 'Tutup', value: null, variant: 'ghost' }],
        onMount: function (modal, close) {
          closeRef = close;
          st.hintClose = close;
          startHintUi();
          updateHintUI();
        }
      }).then(function () {
        if (closeRef && st.hintClose === closeRef) st.hintClose = null;
      });
    }

    function lockFinalTime() {
      if (ss.lockedTotalMs == null) ss.lockedTotalMs = timedTotalMs(st);
    }

    function advance() {
      if (st.advanceTimer) { clearTimeout(st.advanceTimer); st.advanceTimer = null; }
      if (typeof st.hintClose === 'function') { var close = st.hintClose; st.hintClose = null; close(); }
      if (ss.index >= ss.questions.length - 1) { finishTimed(cfg, host); return; }
      nextTimedQuestion(cfg, host);
    }

    function burnQuestion() {
      if (ss.burnedThisQuestion) return;
      ss.burnedThisQuestion = true;
      ss.burned++;
      ss.locked = true;
      revealAnswer(-1, 'is-reveal');
      if (ss.index >= ss.questions.length - 1) lockFinalTime();
      ss.burnDeadline = activeHintDeadline() || 0;
      var wait = ss.burnDeadline ? Math.max(0, ss.burnDeadline - Date.now()) : 650;
      st.advanceTimer = setTimeout(advance, wait);
      var fb = host.querySelector('[data-feedback]');
      if (fb) {
        fb.className = 'feedback-line is-wrong';
        fb.innerHTML = '<strong>✕ Soal hangus.</strong> Jawaban benar: ' + U.esc(currentAnswer(st));
      }
      updateHintUI();
    }

    function choose(index) {
      if (st.phase !== 'playing' || ss.locked || ss.burnedThisQuestion) return;
      var q = currentTimedQuestion(st);
      if (!q) return;
      var btn = host.querySelector('[data-timed-option="' + index + '"]');
      if (!btn || btn.disabled) return;
      if (index === q.correctIndex) {
        ss.correct++;
        ss.locked = true;
        revealAnswer(index);
        if (GH.audio) GH.audio.correct();
        var fb = host.querySelector('[data-feedback]');
        if (fb) {
          fb.className = 'feedback-line is-correct';
          fb.innerHTML = '<strong>✓ Benar!</strong> ' + U.esc(q.options[index]) + '.';
        }
        if (ss.index >= ss.questions.length - 1) lockFinalTime();
        if (typeof st.hintClose === 'function') { var close = st.hintClose; st.hintClose = null; close(); }
        st.advanceTimer = setTimeout(advance, 450);
        return;
      }
      btn.disabled = true;
      btn.classList.add('is-wrong');
      ss.wrongAttempts++;
      ss.mistakeCount++;
      var penalty = G3_WRONG_PENALTIES[Math.min(ss.wrongAttempts - 1, G3_WRONG_PENALTIES.length - 1)];
      ss.penaltySec += penalty;
      if (GH.audio) GH.audio.wrong();
      paintWrongDots();
      updateTimedTimer(cfg, st);
      var fb2 = host.querySelector('[data-feedback]');
      if (fb2) {
        fb2.className = 'feedback-line is-wrong';
        fb2.innerHTML = ss.wrongAttempts >= 3
          ? '<strong>✕ Soal hangus.</strong> Penalti ketiga +' + penalty + ' detik.'
          : '<strong>Belum tepat.</strong> +' + penalty + ' detik. Kesempatan ' + (3 - ss.wrongAttempts) + ' lagi.';
      }
      if (ss.wrongAttempts >= 3) burnQuestion();
    }

    function openHint(level) {
      if (st.phase !== 'playing' || ss.locked || ss.burnedThisQuestion) return;
      var now = Date.now();
      var deadline = ss.hintDeadlines[level] || 0;
      if (deadline && now >= deadline) return;
      if (!deadline) {
        var cfgHint = G3_HINT_CONFIG[level];
        ss.hintDeadlines[level] = now + cfgHint.durationSec * 1000;
        ss.hintsUsed++;
        ss.penaltySec += cfgHint.penalty;
        ss.hintLevel = Math.max(ss.hintLevel, level);
        updateTimedTimer(cfg, st);
        if (GH.audio) GH.audio.hint();
      }
      showHintModal(level);
      if (level === 3) burnQuestion();
      updateHintUI();
    }

    host.addEventListener('click', function (e) {
      var opt = e.target.closest('[data-timed-option]');
      if (opt) { e.preventDefault(); choose(Number(opt.dataset.timedOption)); return; }
      var hint = e.target.closest('[data-hint]');
      if (hint && !hint.disabled) { e.preventDefault(); openHint(Number(hint.dataset.hint)); return; }
      var next = e.target.closest('[data-advmath-next]');
      if (next) { e.preventDefault(); advance(); }
    }, { signal: signal });

    if (st.keyHandler) document.removeEventListener('keydown', st.keyHandler);
    st.keyHandler = function (e) {
      if (st.phase !== 'playing') return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      var map = { '1': 0, '2': 1, '3': 2, '4': 3, a: 0, b: 1, c: 2, d: 3, A: 0, B: 1, C: 2, D: 3 };
      if (map[e.key] !== undefined) { e.preventDefault(); choose(map[e.key]); }
      else if ((e.key === 'Enter' || e.key === ' ') && ss.burnedThisQuestion) { e.preventDefault(); advance(); }
    };
    document.addEventListener('keydown', st.keyHandler);
    signal.addEventListener('abort', function () {
      if (st.keyHandler) { document.removeEventListener('keydown', st.keyHandler); st.keyHandler = null; }
    });
    startHintUi();
    updateHintUI();
  }

  function currentAnswer(st) {
    var q = currentTimedQuestion(st);
    return q ? choiceAnswer(q) : '';
  }

  function nextTimedQuestion(cfg, host) {
    var st = getState(cfg.id);
    var ss = st.session;
    if (!ss) return;
    if (st.advanceTimer) { clearTimeout(st.advanceTimer); st.advanceTimer = null; }
    if (typeof st.hintClose === 'function') { var close = st.hintClose; st.hintClose = null; close(); }
    ss.questionToken++;
    ss.index++;
    ss.input = '';
    ss.wrongAttempts = 0;
    ss.hintLevel = 0;
    ss.hintDeadlines = {};
    ss.burnDeadline = 0;
    ss.burnedThisQuestion = false;
    ss.finished = false;
    ss.locked = false;
    if (ss.index >= ss.questions.length) {
      finishTimed(cfg, host);
      return;
    }
    paint(cfg, host);
    focusQuestion(host);
  }

  function finishTimed(cfg, host) {
    var st = getState(cfg.id);
    var ss = st.session;
    if (!ss) return;
    cleanupState(st);
    st.phase = 'done';
    R.clearGuard();
    ss.elapsedMs = ss.elapsedMs || 0;
    var totalMs = cfg.id === 'multiply'
      ? ss.elapsedMs
      : (ss.lockedTotalMs == null ? timedTotalMs(st) : ss.lockedTotalMs);
    var key = boardKey(cfg, ss.questions.length);
    var candidate = {
      name: ss.player.name,
      avatar: ss.player.avatar,
      primary: true,
      timeMs: totalMs,
      score: ss.correct,
      count: ss.questions.length,
      mistakes: ss.mistakeCount,
      hints: ss.hintsUsed,
      burned: ss.burned,
      meta: {
        label: cfg.id === 'multiply'
          ? ss.mistakeCount + ' kesalahan'
          : ss.burned + ' hangus · ' + ss.hintsUsed + ' hint · ' + ss.mistakeCount + ' kesalahan'
      }
    };
    var insight = buildRankInsight(cfg, key, candidate, S.getBoard(key));
    var result = {
      totalMs: totalMs,
      actualMs: ss.elapsedMs,
      penaltySec: cfg.id === 'multiply' ? 0 : ss.penaltySec,
      correct: ss.correct,
      mistakes: ss.mistakeCount,
      burned: ss.burned,
      hints: ss.hintsUsed,
      count: ss.questions.length,
      avgMs: totalMs / Math.max(1, ss.questions.length),
      player: ss.player,
      duel: !!st.duel,
      key: key,
      candidate: candidate,
      insight: insight,
      saved: false,
      rank: insight.rank
    };
    if (st.room) {
      syncTimedRoom(cfg, st, true, result);
      st.duel.results[st.room.side === 'host' ? 0 : 1] = result;
      st.room.awaiting = true;
      st.screen = 'roomWaiting';
      st.phase = 'idle';
      paint(cfg, host);
      return;
    }
    S.recordActivity({
      game: cfg.id,
      label: cfg.title + ' · ' + ss.questions.length + ' soal',
      value: formatDuration(totalMs / 1000)
    });
    st.result = result;
    st.screen = 'result';
    st.phase = 'idle';
    if (GH.audio) GH.audio[insight.qualifies ? 'win' : 'lose']();
    if (insight.qualifies) UI.confetti({ colors: ['#ffd479', '#ff8c5b', '#5de0c2', '#b18cff'] });
    paint(cfg, host);
  }

  function saveTimedResult(cfg, host) {
    var st = getState(cfg.id);
    var r = st.result;
    if (!r || r.saved) return;
    var saved = S.addScore(r.key, r.candidate);
    r.saved = true;
    r.rank = saved.rank;
    r.isBest = saved.isBest;
    paint(cfg, host);
    UI.toast({ title: 'Skor tersimpan', msg: 'Peringkat #' + saved.rank + ' di papan ini.', type: 'success' });
  }

  function renderTimedResult(cfg, host) {
    var st = getState(cfg.id);
    var r = st.result;
    if (!r) { st.screen = 'dashboard'; paint(cfg, host); return; }
    var max = S.getBoardConfig(r.key).max || 7;
    var isMultiply = cfg.id === 'multiply';
    host.innerHTML = '<div class="game-shell">' +
      UI.gameHeader({ title: cfg.title, subtitle: 'Hasil sesi', glyph: cfg.glyph, backLabel: 'Hub' }) +
      '<div class="game-wrap game-wrap--narrow">' +
        '<section class="result-screen">' +
          '<div class="result-hero">' +
            '<span class="result-hero__badge">' + (r.saved ? (r.isBest ? '★ Rekor baru' : 'Peringkat #' + r.rank) : 'Belum disimpan') + '</span>' +
            '<h1>' + U.esc(r.player.name) + ', waktumu <span class="text-gradient">' + formatDuration(r.totalMs / 1000) + '</span></h1>' +
            '<p>' + (isMultiply
              ? 'Waktu murni tanpa penalti. ' + r.correct + ' dari ' + r.count + ' soal benar dengan ' + r.mistakes + ' kesalahan.'
              : 'Waktu aktual ' + formatDuration(r.actualMs / 1000) + ' + penalti ' + r.penaltySec + ' detik. ' + r.correct + ' dari ' + r.count + ' soal benar.') + '</p>' +
          '</div>' +
          '<div class="result-metrics">' +
            '<div class="result-metric"><span>Waktu aktual</span><strong>' + formatDuration(r.actualMs / 1000) + '</strong></div>' +
            (isMultiply ? '' : '<div class="result-metric"><span>Penalti</span><strong class="text-warning">+' + r.penaltySec + ' dtk</strong></div>') +
            '<div class="result-metric"><span>' + (isMultiply ? 'Kesalahan' : 'Benar') + '</span><strong class="' + (isMultiply ? 'text-danger' : 'text-success') + '">' + (isMultiply ? r.mistakes : r.correct + '/' + r.count) + '</strong></div>' +
            (isMultiply ? '' : '<div class="result-metric"><span>Hangus</span><strong class="text-danger">' + r.burned + '</strong></div>') +
            (isMultiply ? '' : '<div class="result-metric"><span>Hint</span><strong>' + r.hints + '</strong></div>') +
          '</div>' +
          rankInsightMarkup(r.insight, max, r.saved) +
          (r.insight.qualifies && !r.saved
            ? '<div class="result-save"><button class="btn btn--primary btn--lg" type="button" data-save-score>💾 Simpan skor</button><p class="tiny muted">Skor ditulis ke papan peringkat bila tombol ini ditekan.</p></div>'
            : (r.saved ? '<p class="save-status">✓ Skor sudah masuk papan peringkat.</p>' : '')) +
          '<div class="result-actions">' +
            '<button class="btn btn--ghost btn--lg" type="button" data-again>Main lagi</button>' +
            '<button class="btn btn--ghost" type="button" data-dashboard>Kembali ke dashboard</button>' +
            '<button class="btn btn--quiet" type="button" data-open="leaderboards">Papan skor</button>' +
          '</div>' +
          '<div class="panel result-lb"><div class="panel__head"><div><span class="eyebrow">Papan peringkat</span><h3>' + r.count + ' soal · ' + max + ' teratas</h3></div></div><div class="panel__body">' + leaderboardFor(cfg, r.count) + '</div></div>' +
        '</section>' +
      '</div>' +
    '</div>';
    host.querySelector('[data-game-back]').addEventListener('click', function () { st.screen = 'dashboard'; st.result = null; paint(cfg, host); });
    var saveBtn = host.querySelector('[data-save-score]');
    if (saveBtn) saveBtn.addEventListener('click', function () { saveTimedResult(cfg, host); });
    host.querySelector('[data-again]').addEventListener('click', function () { startTimedSession(cfg, host, { count: r.count }); });
    host.querySelector('[data-dashboard]').addEventListener('click', function () { st.screen = 'dashboard'; st.result = null; paint(cfg, host); });
    host.querySelector('[data-sound-toggle]').addEventListener('click', UI.toggleSound);
    host.querySelector('[data-open="settings"]').addEventListener('click', function () { GH.app.openSettings(); });
  }

  /* ---------------- Duel result (online) ---------------- */
  function exitDuelResult(cfg, host) {
    var st = getState(cfg.id);
    closeRoom(st);
    st.duel = null; st.duelResult = null; st.session = null; st.rapid = null;
    st.phase = 'idle'; st.screen = 'dashboard';
    paint(cfg, host);
  }

  function renderDuelResult(cfg, host) {
    var st = getState(cfg.id);
    var d = st.duel;
    var result = st.duelResult;
    if (!d || !result) { st.screen = 'dashboard'; paint(cfg, host); return; }
    host.innerHTML = '<div class="game-shell">' +
      UI.gameHeader({ title: cfg.title, subtitle: 'Duel online', glyph: cfg.glyph, backLabel: 'Hub' }) +
      '<div class="game-wrap game-wrap--narrow">' +
        '<section class="duel-result">' +
          '<span class="eyebrow">Duel online selesai</span>' +
          '<h1>' + (result.winner ? '<span class="text-gradient">' + U.esc(result.winner.name) + '</span> menang!' : 'Duel berakhir seri') + '</h1>' +
          '<p>' + (result.winner ? 'Penentu kemenangan mengikuti aturan permainan.' : 'Kedua pemain memiliki hasil yang setara menurut aturan permainan.') + '</p>' +
          '<div class="duel-cards">' +
            '<div class="duel-card ' + (result.winner === d.players[1] ? 'is-loser' : '') + '">' +
              '<span class="duel-card__name">' + U.esc(d.players[0].name) + '</span>' +
              '<strong>' + U.formatMs(result.a.totalMs) + '</strong>' +
              '<div class="duel-card__meta">' + U.formatMs(result.a.actualMs) + ' aktual · +' + result.a.penaltySec + ' dtk penalti</div>' +
              '<div class="duel-card__meta">' + result.a.correct + '/' + result.a.count + ' benar · ' + result.a.burned + ' hangus</div>' +
              (result.winner === d.players[0] ? '<span class="badge badge--success">Pemenang</span>' : '') +
            '</div>' +
            '<div class="duel-card ' + (result.winner === d.players[0] ? 'is-loser' : '') + '">' +
              '<span class="duel-card__name">' + U.esc(d.players[1].name) + '</span>' +
              '<strong>' + U.formatMs(result.b.totalMs) + '</strong>' +
              '<div class="duel-card__meta">' + U.formatMs(result.b.actualMs) + ' aktual · +' + result.b.penaltySec + ' dtk penalti</div>' +
              '<div class="duel-card__meta">' + result.b.correct + '/' + result.b.count + ' benar · ' + result.b.burned + ' hangus</div>' +
              (result.winner === d.players[1] ? '<span class="badge badge--success">Pemenang</span>' : '') +
            '</div>' +
          '</div>' +
          '<div class="result-actions">' +
            '<button class="btn btn--primary btn--lg" type="button" data-rematch>Buat room baru</button>' +
            '<button class="btn btn--ghost" type="button" data-dashboard>Kembali ke dashboard</button>' +
          '</div>' +
        '</section>' +
      '</div>' +
    '</div>';
    if (result.winner) UI.confetti();
    host.querySelector('[data-game-back]').addEventListener('click', function () { exitDuelResult(cfg, host); });
    host.querySelector('[data-rematch]').addEventListener('click', function () {
      closeRoom(st);
      openRoomDialog(cfg, host);
    });
    host.querySelector('[data-dashboard]').addEventListener('click', function () { exitDuelResult(cfg, host); });
    host.querySelector('[data-sound-toggle]').addEventListener('click', UI.toggleSound);
    host.querySelector('[data-open="settings"]').addEventListener('click', function () { GH.app.openSettings(); });
  }

  /* ---------------- Rapid game (G2) ---------------- */
  function buildRapidQuestions(cfg, seed) {
    var rng = U.mulberry32(seed || ('rapid-' + Date.now() + '-' + Math.random()));
    return buildCategoryQuestions(GH.bank.knowledge, G2_BUFFER, g2UsedIds, rng);
  }

  function rapidOptionText(q, i) {
    return q && q.options ? q.options[i] : '';
  }

  function rapidExplanation(q, i) {
    return (q && q.explanations && q.explanations[i]) || 'Penjelasan buat opsi ini belum tersedia.';
  }

  function rapidSelectableDistractors(st) {
    var rp = st.rapid;
    var q = rapidCurrent(st);
    if (!rp || !q) return [];
    return (q.options || []).map(function (_, i) { return i; }).filter(function (i) {
      return i !== q.correctIndex &&
        rp.wrongMarked.indexOf(i) < 0 &&
        rp.removedOptions.indexOf(i) < 0;
    });
  }

  function syncRapidScore(rp) {
    rp.score = tenthsToScore(rp.scoreTenths);
  }

  function startRapidSession(cfg, host, opts) {
    var st = getState(cfg.id);
    cleanupState(st);
    st.screen = 'play';
    st.phase = 'countdown';
    st.duel = opts.duel || null;
    st.rapid = {
      questions: opts.questions || buildRapidQuestions(cfg, 'session-' + Date.now() + '-' + Math.random()),
      index: 0,
      score: 0,
      scoreTenths: 0,
      correct: 0,
      burned: 0,
      hints: 0,
      hintCount: 0,
      wrongClicks: 0,
      wrongMarked: [],
      removedOptions: [],
      expanded: {},
      hintUsed: false,
      resolved: false,
      streak: 0,
      bestStreak: 0,
      milestone: 0,
      totalAnswered: 0,
      player: opts.player || player(),
      startedAt: 0,
      remaining: cfg.duration,
      result: null,
      isDuel: !!opts.duel,
      lastResolved: null,
      finishing: false
    };
    R.setGuard({
      title: st.duel ? 'Keluar dari duel?' : 'Keluar dari ronde?',
      body: 'Skor ronde 60 detik ini belum disimpan.',
      confirmLabel: 'Ya, keluar',
      onAbort: function () { abortRapid(cfg, st); }
    });
    paint(cfg, host);

    var begin = function () {
      st.startTimer = null;
      st.phase = 'playing';
      st.rapid.startedAt = performance.now();
      paint(cfg, host);
      startTimer(st, cfg, function (elapsed) {
        var remaining = Math.max(0, cfg.duration - elapsed / 1000);
        st.rapid.remaining = remaining;
        updateRapidTimer(cfg, st);
        syncRapidRoom(cfg, st, false);
      }, function () {
        finishRapid(cfg, host);
      });
    };

    if (opts.autoStartAt) {
      var delay = Math.max(0, Number(opts.autoStartAt) - Date.now());
      var stage = host.querySelector('.game-shell') || host;
      UI.countdown(stage, {
        from: Math.max(1, Math.ceil(delay / 1000)),
        hint: 'Duel online dimulai…',
        finalLabel: 'Mulai!'
      }).then(function () {
        var rest = Math.max(0, Number(opts.autoStartAt) - Date.now());
        if (rest > 0) st.startTimer = setTimeout(begin, rest);
        else begin();
      });
      return;
    }

    countdown(host, cfg, begin);
  }

  function abortRapid(cfg, st) {
    cleanupState(st);
    closeRoom(st);
    st.phase = 'idle';
    st.rapid = null;
    st.duel = null;
    st.screen = 'dashboard';
    var host = document.querySelector('[data-view="' + cfg.id + '"]');
    if (host) paint(cfg, host);
  }

  function rapidCurrent(st) {
    return st.rapid && st.rapid.questions[st.rapid.index];
  }

  function updateRapidTimer(cfg, st) {
    var host = document.querySelector('[data-view="' + cfg.id + '"]');
    if (!host || !st.rapid) return;
    var remaining = st.rapid.remaining;
    Array.prototype.forEach.call(host.querySelectorAll('[data-rapid-time]'), function (el) {
      el.textContent = formatDuration(Math.ceil(remaining));
    });
    var ring = host.querySelector('[data-rapid-ring]');
    if (ring) {
      ring.style.setProperty('--left', (remaining / cfg.duration) * 100 + '%');
      ring.classList.toggle('is-low', remaining <= 10);
    }
    var bar = host.querySelector('[data-rapid-bar]');
    if (bar) bar.style.width = (remaining / cfg.duration) * 100 + '%';
  }

  function rapidRecapMarkup(rp) {
    if (!rp.lastResolved) return '<p class="muted">Pembahasan muncul setelah kamu menyelesaikan satu soal.</p>';
    var q = rp.lastResolved.q;
    var status = rp.lastResolved.status === 'correct'
      ? '✅ Recap soal sebelumnya · jawabanmu benar'
      : '💀 Recap soal sebelumnya · soal hangus';
    return '<p class="rapid-recap__status">' + U.esc(status) + '</p>' +
      '<p><strong>' + U.esc(q.question) + '</strong></p>' +
      '<p class="rapid-recap__answer">Jawaban: <strong>' + U.esc(rapidOptionText(q, q.correctIndex)) + '</strong></p>' +
      '<p class="tiny">' + U.esc(rapidExplanation(q, q.correctIndex)) + '</p>';
  }

  function renderRapidPlay(cfg, host) {
    var st = getState(cfg.id);
    var rp = st.rapid;
    if (!rp) return;
    var q = rapidCurrent(st);
    if (!q) { finishRapid(cfg, host); return; }
    var optionLabels = ['A', 'B', 'C', 'D'];
    var hintDisabled = rp.resolved || rp.hintUsed || rp.wrongClicks >= 2 || rapidSelectableDistractors(st).length === 0;
    var optionsHtml = (q.options || []).map(function (_, i) {
      var cls = 'option';
      var state = '';
      var attrs = '';
      var extra = '';
      if (rp.removedOptions.indexOf(i) >= 0) {
        cls += ' is-removed';
        attrs = ' disabled aria-hidden="true"';
      } else if (rp.wrongMarked.indexOf(i) >= 0) {
        cls += ' is-wrong';
        state = ' data-state="wrong"';
        var open = !!rp.expanded[i];
        if (open) cls += ' is-open';
        attrs = ' aria-expanded="' + (open ? 'true' : 'false') + '"';
        extra = '<span class="option__cue">' + (open ? '▴ Tutup' : 'ⓘ Cek penjelasan') + '</span>' +
          '<span class="option__explain"' + (open ? '' : ' hidden') + '>' + U.esc(rapidExplanation(q, i)) + '</span>';
      }
      return '<button class="' + cls + '" type="button" data-option="' + i + '"' + state + attrs + '>' +
        '<span class="option__key">' + (optionLabels[i] || i + 1) + '</span>' +
        '<span class="option__text">' + U.esc(rapidOptionText(q, i)) + '</span>' +
        '<span class="option__mark" aria-hidden="true"></span>' + extra +
      '</button>';
    }).join('');
    var gainText = rp.gainText || '';
    host.innerHTML = '<div class="game-shell">' +
      UI.gameHeader({ title: cfg.title, subtitle: 'Ronde 60 detik', glyph: cfg.glyph, backLabel: 'Keluar' }) +
      '<div class="game-wrap game-wrap--play">' +
        '<div class="rapid-top">' +
          '<div class="rapid-timer" data-rapid-ring style="--left:100%">' +
            '<div class="rapid-timer__inner"><strong data-rapid-time>' + formatDuration(Math.ceil(rp.remaining)) + '</strong><small>detik</small></div>' +
          '</div>' +
          '<div class="rapid-scores">' +
            '<div class="live-stat"><span class="live-stat__label">Skor</span><strong>' + formatScore(rp.score) + '</strong></div>' +
            '<div class="live-stat"><span class="live-stat__label">Beruntun</span><strong class="' + (rp.streak >= 5 ? 'text-success' : '') + '">' + rp.streak + '×</strong></div>' +
            '<div class="live-stat"><span class="live-stat__label">Benar</span><strong>' + rp.correct + '</strong></div>' +
            '<div class="live-stat"><span class="live-stat__label">Hint</span><strong>' + rp.hints + '</strong></div>' +
            '<div class="live-stat"><span class="live-stat__label">Hangus</span><strong class="text-danger">' + rp.burned + '</strong></div>' +
          '</div>' +
          '<div class="rapid-progress">' +
            '<div class="progress progress--thin"><div class="progress__bar" data-rapid-bar style="width:' + ((rp.remaining / cfg.duration) * 100) + '%"></div></div>' +
            '<span class="tiny muted">Soal ' + (rp.totalAnswered + 1) + ' · ' + U.esc(q.category) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="rapid-gain ' + U.attr(rp.gainTone || '') + '" data-rapid-gain aria-live="polite">' + U.esc(gainText) + '</div>' +
        '<div class="rapid-grid">' +
          '<section class="panel rapid-question">' +
            '<div class="rapid-question__top">' +
              '<span class="badge badge--theme">' + U.esc(q.category) + '</span>' +
              '<span class="badge">' + U.formatNumber(GH.bank.knowledge.length) + ' soal</span>' +
            '</div>' +
            '<h2>' + U.esc(q.question) + '</h2>' +
            '<div class="rapid-options" role="group" aria-label="Pilihan jawaban">' + optionsHtml + '</div>' +
            '<div class="rapid-feedback" data-rapid-feedback aria-live="polite"></div>' +
            '<div class="rapid-helpers">' +
              '<button class="btn btn--ghost btn--sm" type="button" data-rapid-hint ' + (hintDisabled ? 'disabled' : '') + '>✧ Petunjuk <span class="hint-cost">maks. 0,3</span></button>' +
              '<span class="tiny muted">Opsi salah bisa diklik lagi untuk membuka penjelasan. Hint menyisakan satu pengecoh.</span>' +
            '</div>' +
          '</section>' +
          '<aside class="rapid-side">' +
            '<div class="panel streak-panel">' +
              '<div class="panel__head"><div><span class="eyebrow">Beruntun</span><h3>' + rp.streak + ' benar</h3></div></div>' +
              '<div class="panel__body">' +
                '<div class="streak-steps">' + U.range(25).map(function (i) {
                  var n = i + 1;
                  var reached = rp.streak >= n;
                  var milestone = n === 5 || n === 10 || n === 15 || n === 20 || n === 25;
                  var bonus = n === 5 ? 3 : n === 10 ? 7 : 10;
                  return '<i class="' + (reached ? 'is-on' : '') + (milestone ? ' is-milestone' : '') + '" title="' + (milestone ? '+' + bonus + ',0 poin' : n + ' beruntun') + '"></i>';
                }).join('') + '</div>' +
                '<p class="tiny muted">Bonus: 5 → +3,0; 10 → +7,0; kelipatan 5 berikutnya +10,0. Hanya benar klik pertama tanpa hint.</p>' +
              '</div>' +
            '</div>' +
            '<div class="panel explanation-panel" data-explanation>' +
              '<div class="panel__head"><div><span class="eyebrow">Pembahasan</span><h3>Jawaban terakhir</h3></div></div>' +
              '<div class="panel__body">' + rapidRecapMarkup(rp) + '</div>' +
            '</div>' +
            '<div class="panel rapid-tip"><div class="panel__body"><strong>Tip</strong><p class="tiny muted">Benar di klik pertama 1,0; klik kedua 0,7; klik ketiga 0,3. Kalau pakai hint, maksimalnya 0,3.</p></div></div>' +
          '</aside>' +
        '</div>' +
      '</div>' +
    '</div>';
    bindRapidPlay(cfg, host);
    updateRapidTimer(cfg, st);
  }

  function showRapidGain(st, host, tenths, bonusTenths) {
    var rp = st.rapid;
    if (!rp) return;
    var sign = tenths < 0 ? '−' : '+';
    var plain = U.formatNumber(Math.abs(tenths) / 10, 1);
    rp.gainText = sign + plain + ' poin' + (bonusTenths ? ' + bonus ' + U.formatNumber(bonusTenths / 10, 1) : '');
    rp.gainTone = tenths < 0 ? 'is-loss' : bonusTenths ? 'is-bonus' : 'is-gain';
    var chip = host.querySelector('[data-rapid-gain]');
    if (chip) {
      chip.className = 'rapid-gain ' + rp.gainTone;
      chip.textContent = rp.gainText;
      UI.pulseClass(chip, 'is-visible');
    }
    if (st.gainTimer) clearTimeout(st.gainTimer);
    st.gainTimer = setTimeout(function () {
      rp.gainText = '';
      rp.gainTone = '';
      var el = host.querySelector('[data-rapid-gain]');
      if (el) { el.textContent = ''; el.className = 'rapid-gain'; }
      st.gainTimer = null;
    }, 1800);
  }

  function breakRapidStreak(st, host) {
    var rp = st.rapid;
    if (!rp || rp.streak <= 0) return;
    rp.streak = 0;
    rp.gainText = 'Streak putus';
    rp.gainTone = 'is-break';
    var chip = host.querySelector('[data-rapid-gain]');
    if (chip) {
      chip.className = 'rapid-gain is-break';
      chip.textContent = rp.gainText;
      UI.pulseClass(chip, 'is-visible');
    }
    var streak = host.querySelector('.streak-panel h3');
    if (streak) streak.textContent = '0 benar';
    Array.prototype.forEach.call(host.querySelectorAll('.streak-steps i'), function (el) { el.classList.remove('is-on'); });
  }

  function bindRapidPlay(cfg, host) {
    var st = getState(cfg.id);
    if (st.abort) st.abort.abort();
    st.abort = new AbortController();
    var signal = st.abort.signal;
    var rp = st.rapid;
    if (!rp) return;

    function advanceQuestion() {
      if (st.advanceTimer) { clearTimeout(st.advanceTimer); st.advanceTimer = null; }
      rp.index++;
      rp.wrongClicks = 0;
      rp.wrongMarked = [];
      rp.removedOptions = [];
      rp.expanded = {};
      rp.hintUsed = false;
      rp.resolved = false;
      if (rp.index >= rp.questions.length && st.phase === 'playing') {
        rp.questions = rp.questions.concat(buildRapidQuestions(cfg, 'more-' + Date.now() + '-' + Math.random()));
      }
      paint(cfg, host);
    }

    function setFeedback(strong, text, tone) {
      var fb = host.querySelector('[data-rapid-feedback]');
      if (!fb) return;
      fb.className = 'rapid-feedback is-visible' + (tone ? ' ' + tone : '');
      fb.innerHTML = '<strong>' + U.esc(strong) + '</strong><span>' + U.esc(text) + '</span>';
    }

    function resolveQuestion(q, status, tenths, bonusTenths, chosenIndex) {
      rp.resolved = true;
      rp.totalAnswered++;
      syncRapidScore(rp);
      var options = host.querySelectorAll('[data-option]');
      Array.prototype.forEach.call(options, function (o, i) {
        o.disabled = true;
        if (i === q.correctIndex) o.classList.add('is-correct');
        else if (i === chosenIndex) o.classList.add('is-wrong');
      });
      rp.lastResolved = { q: q, status: status };
      var scoreEl = host.querySelector('.rapid-scores .live-stat strong');
      if (scoreEl) scoreEl.textContent = formatScore(rp.score);
      var recap = host.querySelector('[data-explanation] .panel__body');
      if (recap) recap.innerHTML = rapidRecapMarkup(rp);
      showRapidGain(st, host, tenths, bonusTenths);
      if (GH.audio) GH.audio[status === 'correct' ? 'correct' : 'wrong']();
      if (bonusTenths && UI.pulseClass) UI.pulseClass(host.querySelector('.rapid-question'), 'is-streak-shake');
      st.advanceTimer = setTimeout(advanceQuestion, status === 'correct' ? 450 : 650);
    }

    function choose(index) {
      if (st.phase !== 'playing' || rp.resolved) return;
      var q = rapidCurrent(st);
      if (!q) return;
      var btn = host.querySelector('[data-option="' + index + '"]');
      if (!btn || btn.disabled) return;
      if (btn.dataset.state === 'wrong') {
        var open = !rp.expanded[index];
        rp.expanded[index] = open;
        btn.classList.toggle('is-open', open);
        btn.setAttribute('aria-expanded', String(open));
        var cue = btn.querySelector('.option__cue');
        if (cue) cue.textContent = open ? '▴ Tutup' : 'ⓘ Cek penjelasan';
        var explain = btn.querySelector('.option__explain');
        if (explain) explain.hidden = !open;
        if (GH.audio) GH.audio.click();
        return;
      }
      if (index === q.correctIndex) {
        var gained = rp.wrongClicks === 0 ? 10 : rp.wrongClicks === 1 ? 7 : 3;
        if (rp.hintUsed) gained = Math.min(gained, 3);
        var clean = rp.wrongClicks === 0 && !rp.hintUsed;
        rp.streak = clean ? rp.streak + 1 : 0;
        if (rp.streak > rp.bestStreak) rp.bestStreak = rp.streak;
        var bonus = rp.streak > 0 && rp.streak % 5 === 0
          ? (rp.streak === 5 ? 30 : rp.streak === 10 ? 70 : 100)
          : 0;
        rp.scoreTenths += gained + bonus;
        rp.correct++;
        resolveQuestion(q, 'correct', gained, bonus, index);
        return;
      }
      rp.wrongClicks++;
      rp.wrongMarked.push(index);
      breakRapidStreak(st, host);
      if (GH.audio) GH.audio.wrong();
      if (rapidSelectableDistractors(st).length === 0) {
        rp.scoreTenths -= 10;
        rp.burned++;
        syncRapidScore(rp);
        paint(cfg, host);
        resolveQuestion(q, 'burned', -10, 0, index);
        setFeedback('Soal hangus · −1,0 poin', 'Tidak ada pengecoh yang bisa dipilih lagi. Jawaban benar: ' + rapidOptionText(q, q.correctIndex), 'is-wrong');
      } else {
        // Render ulang supaya opsi salah langsung menjadi toggle penjelasan.
        paint(cfg, host);
        setFeedback('Belum tepat.', 'Opsi ini jadi pembahasan. Klik lagi untuk membuka atau menutup penjelasan.', 'is-wrong');
        if (rp.wrongClicks >= 2) {
          var hintBtn = host.querySelector('[data-rapid-hint]');
          if (hintBtn) hintBtn.disabled = true;
        }
      }
    }

    function useHint() {
      if (st.phase !== 'playing' || rp.resolved || rp.hintUsed || rp.wrongClicks >= 2) return;
      var q = rapidCurrent(st);
      if (!q) return;
      var viable = rapidSelectableDistractors(st);
      if (!viable.length) return;
      rp.hintUsed = true;
      rp.hints++;
      rp.hintCount = rp.hints;
      breakRapidStreak(st, host);
      var keep = viable[Math.floor(Math.random() * viable.length)];
      viable.forEach(function (i) {
        if (i === keep) return;
        rp.removedOptions.push(i);
        var btn = host.querySelector('[data-option="' + i + '"]');
        if (btn) {
          btn.disabled = true;
          btn.classList.add('is-removed');
          btn.setAttribute('aria-hidden', 'true');
        }
      });
      var hintBtn = host.querySelector('[data-rapid-hint]');
      if (hintBtn) hintBtn.disabled = true;
      setFeedback('Petunjuk dipakai.', 'Satu pengecoh tersisa. Poin maksimum soal ini 0,3.', '');
      if (GH.audio) GH.audio.hint();
    }

    host.addEventListener('click', function (e) {
      var opt = e.target.closest('[data-option]');
      if (opt) { e.preventDefault(); choose(Number(opt.dataset.option)); return; }
      var hint = e.target.closest('[data-rapid-hint]');
      if (hint && !hint.disabled) { e.preventDefault(); useHint(); }
    }, { signal: signal });

    if (st.keyHandler) document.removeEventListener('keydown', st.keyHandler);
    st.keyHandler = function (e) {
      if (st.phase !== 'playing') return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      var map = { '1': 0, '2': 1, '3': 2, '4': 3, a: 0, b: 1, c: 2, d: 3, A: 0, B: 1, C: 2, D: 3 };
      if (map[e.key] !== undefined) { e.preventDefault(); choose(map[e.key]); }
      else if (e.key === 'h' || e.key === 'H') { e.preventDefault(); useHint(); }
    };
    document.addEventListener('keydown', st.keyHandler);
    signal.addEventListener('abort', function () {
      if (st.keyHandler) { document.removeEventListener('keydown', st.keyHandler); st.keyHandler = null; }
    });
  }

  function finishRapid(cfg, host) {
    var st = getState(cfg.id);
    var rp = st.rapid;
    if (!rp || rp.finishing) return;
    rp.finishing = true;
    cleanupState(st);
    st.phase = 'done';
    R.clearGuard();
    syncRapidScore(rp);
    var key = boardKey(cfg, 1);
    var candidate = {
      name: rp.player.name,
      avatar: rp.player.avatar,
      primary: true,
      score: rp.score,
      correct: rp.correct,
      hints: rp.hints,
      burned: rp.burned,
      count: rp.totalAnswered,
      meta: { label: rp.correct + ' benar · ' + rp.hints + ' hint · ' + rp.burned + ' hangus' }
    };
    var insight = buildRankInsight(cfg, key, candidate, S.getBoard(key));
    var result = {
      score: rp.score,
      rawScore: rp.score,
      correct: rp.correct,
      burned: rp.burned,
      hints: rp.hints,
      answered: rp.totalAnswered,
      bestStreak: rp.bestStreak,
      player: rp.player,
      accuracy: rp.totalAnswered ? Math.round((rp.correct / rp.totalAnswered) * 100) : 0,
      duration: cfg.duration,
      duel: !!st.duel,
      key: key,
      candidate: candidate,
      insight: insight,
      saved: false,
      rank: insight.rank
    };
    if (st.room) {
      syncRapidRoom(cfg, st, true, result);
      st.duel.results[st.room.side === 'host' ? 0 : 1] = result;
      st.room.awaiting = true;
      st.screen = 'roomWaiting';
      st.phase = 'idle';
      paint(cfg, host);
      return;
    }
    S.recordActivity({
      game: cfg.id,
      label: cfg.title + ' · 60 detik',
      value: formatScore(result.score) + ' poin'
    });
    st.rapidResult = result;
    st.screen = 'result';
    st.phase = 'idle';
    if (GH.audio) GH.audio[insight.qualifies ? 'win' : 'lose']();
    if (insight.qualifies) UI.confetti({ colors: ['#5de0c2', '#62c9ff', '#ffd479', '#ffffff'] });
    paint(cfg, host);
  }

  function saveRapidResult(cfg, host) {
    var st = getState(cfg.id);
    var r = st.rapidResult;
    if (!r || r.saved) return;
    var saved = S.addScore(r.key, r.candidate);
    r.saved = true;
    r.rank = saved.rank;
    r.isBest = saved.isBest;
    paint(cfg, host);
    UI.toast({ title: 'Skor tersimpan', msg: 'Peringkat #' + saved.rank + ' di papan ini.', type: 'success' });
  }

  function renderRapidResult(cfg, host) {
    var st = getState(cfg.id);
    var r = st.rapidResult;
    if (!r) { st.screen = 'dashboard'; paint(cfg, host); return; }
    var max = S.getBoardConfig(r.key).max || 10;
    host.innerHTML = '<div class="game-shell">' +
      UI.gameHeader({ title: cfg.title, subtitle: 'Hasil ronde', glyph: cfg.glyph, backLabel: 'Hub' }) +
      '<div class="game-wrap game-wrap--narrow">' +
        '<section class="result-screen">' +
          '<div class="result-hero result-hero--rapid">' +
            '<span class="result-hero__badge">' + (r.saved ? (r.isBest ? '★ Rekor baru' : 'Peringkat #' + r.rank) : 'Belum disimpan') + '</span>' +
            '<h1><span class="text-gradient">' + formatScore(r.score) + '</span> poin</h1>' +
            '<p>' + U.esc(r.player.name) + ' · ' + r.correct + ' benar · akurasi ' + r.accuracy + '% dalam 60 detik.</p>' +
          '</div>' +
          '<div class="result-metrics">' +
            '<div class="result-metric"><span>Benar</span><strong class="text-success">' + r.correct + '</strong></div>' +
            '<div class="result-metric"><span>Hint</span><strong>' + r.hints + '</strong></div>' +
            '<div class="result-metric"><span>Hangus</span><strong class="text-danger">' + r.burned + '</strong></div>' +
            '<div class="result-metric"><span>Terjawab</span><strong>' + r.answered + '</strong></div>' +
            '<div class="result-metric"><span>Streak terbaik</span><strong>' + r.bestStreak + '×</strong></div>' +
            '<div class="result-metric"><span>Akurasi</span><strong>' + r.accuracy + '%</strong></div>' +
          '</div>' +
          rankInsightMarkup(r.insight, max, r.saved) +
          (r.insight.qualifies && !r.saved
            ? '<div class="result-save"><button class="btn btn--primary btn--lg" type="button" data-save-score>💾 Simpan skor</button><p class="tiny muted">Skor ditulis ke papan peringkat bila tombol ini ditekan.</p></div>'
            : (r.saved ? '<p class="save-status">✓ Skor sudah masuk papan peringkat.</p>' : '')) +
          '<div class="result-actions">' +
            '<button class="btn btn--primary btn--lg" type="button" data-again>Ronde lagi</button>' +
            '<button class="btn btn--ghost" type="button" data-dashboard>Dashboard</button>' +
            '<button class="btn btn--quiet" type="button" data-open="leaderboards">Papan skor</button>' +
          '</div>' +
          '<div class="panel result-lb"><div class="panel__head"><div><span class="eyebrow">Papan peringkat</span><h3>10 teratas</h3></div></div><div class="panel__body">' + leaderboardFor(cfg, 1) + '</div></div>' +
        '</section>' +
      '</div>' +
    '</div>';
    host.querySelector('[data-game-back]').addEventListener('click', function () { st.screen = 'dashboard'; st.rapidResult = null; paint(cfg, host); });
    var saveBtn = host.querySelector('[data-save-score]');
    if (saveBtn) saveBtn.addEventListener('click', function () { saveRapidResult(cfg, host); });
    host.querySelector('[data-again]').addEventListener('click', function () { startRapidSession(cfg, host, {}); });
    host.querySelector('[data-dashboard]').addEventListener('click', function () { st.screen = 'dashboard'; st.rapidResult = null; paint(cfg, host); });
    host.querySelector('[data-sound-toggle]').addEventListener('click', UI.toggleSound);
    host.querySelector('[data-open="settings"]').addEventListener('click', function () { GH.app.openSettings(); });
  }

  /* ---------------- Duel rendering for rapid ---------------- */
  function renderRapidDuelResult(cfg, host) {
    var st = getState(cfg.id);
    var d = st.duel;
    var result = st.duelResult;
    if (!d || !result) { st.screen = 'dashboard'; paint(cfg, host); return; }
    host.innerHTML = '<div class="game-shell">' +
      UI.gameHeader({ title: cfg.title, subtitle: 'Duel online', glyph: cfg.glyph, backLabel: 'Hub' }) +
      '<div class="game-wrap game-wrap--narrow">' +
        '<section class="duel-result">' +
          '<span class="eyebrow">Duel online selesai</span>' +
          '<h1>' + (result.winner ? '<span class="text-gradient">' + U.esc(result.winner.name) + '</span> menang!' : 'Duel berakhir seri') + '</h1>' +
          '<p>Skor ronde 60 detik. Seri ditentukan dari hint, lalu soal hangus.</p>' +
          '<div class="duel-cards">' +
            '<div class="duel-card ' + (result.winner === d.players[1] ? 'is-loser' : '') + '">' +
              '<span class="duel-card__name">' + U.esc(d.players[0].name) + '</span>' +
              '<strong>' + formatScore(result.a.score) + '</strong>' +
              '<div class="duel-card__meta">' + result.a.correct + ' benar · ' + (result.a.hints || 0) + ' hint · ' + (result.a.burned || 0) + ' hangus</div>' +
              (result.winner === d.players[0] ? '<span class="badge badge--success">Pemenang</span>' : '') +
            '</div>' +
            '<div class="duel-card ' + (result.winner === d.players[0] ? 'is-loser' : '') + '">' +
              '<span class="duel-card__name">' + U.esc(d.players[1].name) + '</span>' +
              '<strong>' + formatScore(result.b.score) + '</strong>' +
              '<div class="duel-card__meta">' + result.b.correct + ' benar · ' + (result.b.hints || 0) + ' hint · ' + (result.b.burned || 0) + ' hangus</div>' +
              (result.winner === d.players[1] ? '<span class="badge badge--success">Pemenang</span>' : '') +
            '</div>' +
          '</div>' +
          '<div class="result-actions">' +
            '<button class="btn btn--primary btn--lg" type="button" data-rematch>Buat room baru</button>' +
            '<button class="btn btn--ghost" type="button" data-dashboard>Dashboard</button>' +
          '</div>' +
        '</section>' +
      '</div>' +
    '</div>';
    if (result.winner) UI.confetti();
    host.querySelector('[data-game-back]').addEventListener('click', function () { exitDuelResult(cfg, host); });
    host.querySelector('[data-rematch]').addEventListener('click', function () {
      closeRoom(st);
      openRoomDialog(cfg, host);
    });
    host.querySelector('[data-dashboard]').addEventListener('click', function () { exitDuelResult(cfg, host); });
    host.querySelector('[data-sound-toggle]').addEventListener('click', UI.toggleSound);
    host.querySelector('[data-open="settings"]').addEventListener('click', function () { GH.app.openSettings(); });
  }

  /* ---------------- Online room duel (G1–G3) ---------------- */
  function roomError(err) {
    return GH.cloud && typeof GH.cloud.describeError === 'function'
      ? GH.cloud.describeError(err)
      : String((err && err.message) || err || 'Gagal mengakses room.');
  }

  function roomSlotPlayer(slot) {
    return { name: (slot && slot.name) || 'Pemain', avatar: (slot && slot.avatar) || '🦊' };
  }

  function prepareRoomQuestions(cfg, count) {
    if (cfg.kind === 'timed') return Promise.resolve(buildTimedQuestions(cfg, Number(count)));
    return Promise.resolve(buildRapidQuestions(cfg, 'room-' + Date.now() + '-' + Math.random()));
  }

  function syncTimedRoom(cfg, st, force, result) {
    var room = st.room, ss = st.session;
    if (!room || !ss || !GH.room) return;
    var now = Date.now();
    if (!force && room.lastSync && now - room.lastSync < 1000) return;
    room.lastSync = now;
    var patch = {
      progress: Math.min(ss.index, ss.questions.length),
      mistakes: ss.mistakeCount || 0,
      correct: ss.correct,
      burned: ss.burned,
      hints: ss.hintsUsed,
      penaltySec: ss.penaltySec
    };
    if (force) {
      patch.progress = ss.questions.length;
      patch.time = Math.max(0, ss.elapsedMs) / 1000;
      patch.finishedAt = Date.now();
    }
    GH.room.patchSlot(cfg.id, room.code, room.side, patch).catch(function () {});
  }

  function syncRapidRoom(cfg, st, force, result) {
    var room = st.room, rp = st.rapid;
    if (!room || !rp || !GH.room) return;
    var now = Date.now();
    if (!force && room.lastSync && now - room.lastSync < 1000) return;
    room.lastSync = now;
    var patch = {
      score: result ? result.score : rp.score,
      correct: rp.correct,
      burned: rp.burned,
      hints: rp.hints || 0,
      accuracy: rp.totalAnswered ? Math.round((rp.correct / rp.totalAnswered) * 100) : 0
    };
    if (force) patch.finishedAt = Date.now();
    GH.room.patchSlot(cfg.id, room.code, room.side, patch).catch(function () {});
  }

  function resultFromSlot(cfg, slot, st) {
    slot = slot || {};
    var count = (st.room && st.room.doc && st.room.doc.questions)
      ? st.room.doc.questions.length
      : (st.duel ? st.duel.count : 0);
    count = Math.max(1, Number(count) || 1);
    if (cfg.kind === 'rapid') {
      return {
        score: Number(slot.score) || 0,
        correct: Number(slot.correct) || 0,
        burned: Number(slot.burned) || 0,
        hints: Number(slot.hints) || 0,
        accuracy: Number(slot.accuracy) || 0,
        player: roomSlotPlayer(slot),
        duel: true
      };
    }
    var actualMs = (Number(slot.time) || 0) * 1000;
    var penaltySec = Number(slot.penaltySec) || 0;
    var totalMs = actualMs + penaltySec * 1000;
    return {
      totalMs: totalMs,
      actualMs: actualMs,
      penaltySec: penaltySec,
      correct: Number(slot.correct) || 0,
      burned: Number(slot.burned) || 0,
      hints: Number(slot.hints) || 0,
      mistakes: Number(slot.mistakes) || 0,
      finishedAt: Number(slot.finishedAt) || 0,
      count: count,
      avgMs: totalMs / count,
      player: roomSlotPlayer(slot),
      duel: true
    };
  }

  function roomWinnerSide(a, b, cfg) {
    var at, bt;
    if (cfg.kind === 'rapid') {
      at = Math.round((Number(a.score) || 0) * 10);
      bt = Math.round((Number(b.score) || 0) * 10);
      if (at !== bt) return at > bt ? 'host' : 'guest';
      if ((a.hints || 0) !== (b.hints || 0)) return (a.hints || 0) < (b.hints || 0) ? 'host' : 'guest';
      if ((a.burned || 0) !== (b.burned || 0)) return (a.burned || 0) < (b.burned || 0) ? 'host' : 'guest';
      return null;
    }
    // G1 online: ZIP memberi kemenangan pada pemain pertama yang menyelesaikan.
    // Di rebuild, kedua klien menghitung lokal dan host yang menulis winner;
    // finishedAt di slot room menggantikan transaksi ZIP.
    if (cfg.id === 'multiply') {
      if ((a.finishedAt || 0) && (b.finishedAt || 0) && a.finishedAt !== b.finishedAt) {
        return a.finishedAt < b.finishedAt ? 'host' : 'guest';
      }
      if (a.totalMs !== b.totalMs) return a.totalMs < b.totalMs ? 'host' : 'guest';
      if ((a.mistakes || 0) !== (b.mistakes || 0)) return (a.mistakes || 0) < (b.mistakes || 0) ? 'host' : 'guest';
      return null;
    }
    at = Number(a.totalMs) || 0;
    bt = Number(b.totalMs) || 0;
    if (at !== bt) return at < bt ? 'host' : 'guest';
    if ((a.burned || 0) !== (b.burned || 0)) return (a.burned || 0) < (b.burned || 0) ? 'host' : 'guest';
    if ((a.hints || 0) !== (b.hints || 0)) return (a.hints || 0) < (b.hints || 0) ? 'host' : 'guest';
    if ((a.mistakes || 0) !== (b.mistakes || 0)) return (a.mistakes || 0) < (b.mistakes || 0) ? 'host' : 'guest';
    return null;
  }

  function startOnlineSession(cfg, host, doc, room) {
    var meSlot = doc[room.side] || {};
    var players = [roomSlotPlayer(doc.host), roomSlotPlayer(doc.guest)];
    var duelState = {
      players: players,
      count: doc.count || (doc.questions ? doc.questions.length : 0),
      questions: doc.questions,
      results: [],
      online: true
    };
    var opts = {
      questions: doc.questions,
      player: roomSlotPlayer(meSlot),
      duel: duelState,
      autoStartAt: doc.startAtMillis
    };
    if (cfg.kind === 'timed') {
      startTimedSession(cfg, host, Object.assign(opts, { count: duelState.count }));
    } else {
      startRapidSession(cfg, host, opts);
    }
  }

  function finalizeOnlineDuel(cfg, host, doc) {
    var st = getState(cfg.id);
    var room = st.room;
    if (!room || room.finalized) return;
    room.finalized = true;
    var a = resultFromSlot(cfg, doc.host, st);
    var b = resultFromSlot(cfg, doc.guest, st);
    var side = roomWinnerSide(a, b, cfg);
    var players = [roomSlotPlayer(doc.host), roomSlotPlayer(doc.guest)];
    if (!st.duel) st.duel = { players: players, count: doc.count, questions: doc.questions, results: [] };
    st.duel.players = players;
    st.duel.results = [a, b];
    var winner = side ? players[side === 'host' ? 0 : 1] : null;
    st.duelResult = { a: a, b: b, winner: winner, rapid: cfg.kind === 'rapid' };
    if (room.side === 'host' && GH.room) {
      GH.room.finish(cfg.id, room.code, side || 'draw').catch(function () {});
    }
    if (winner) {
      S.addDuelWin(cfg.id, winner.name, winner.avatar, { primary: side === room.side });
    }
    S.recordActivity({
      game: cfg.id,
      label: 'Duel online · ' + players[0].name + ' vs ' + players[1].name,
      value: winner ? winner.name + ' menang' : 'Seri'
    });
    st.screen = 'duelResult';
    st.phase = 'idle';
    if (side && GH.audio) GH.audio.win();
    paint(cfg, host);
  }

  function handleRoomDoc(cfg, host, doc) {
    var st = getState(cfg.id);
    var room = st.room;
    if (!room || !doc) return;
    room.doc = doc;
    if (doc.status === 'abandoned') {
      if (st.screen === 'roomLobby' || st.screen === 'roomWaiting') {
        UI.toast({ title: 'Room dibatalkan', msg: 'Tuan room menutup pertandingan.', type: 'warning' });
        closeRoom(st);
        st.duel = null; st.session = null; st.rapid = null; st.phase = 'idle';
        st.screen = 'dashboard';
        paint(cfg, host);
      }
      return;
    }
    if (doc.status === 'countdown' && doc.guest && room.side === 'host' && !room.started) {
      room.started = true;
      GH.room.start(cfg.id, room.code, Date.now() + 3000).catch(function (err) {
        room.started = false;
        UI.toast({ title: 'Gagal memulai', msg: roomError(err), type: 'error' });
      });
      return;
    }
    if (doc.status === 'playing' && doc.startAtMillis && !room.sessionStarted) {
      room.sessionStarted = true;
      startOnlineSession(cfg, host, doc, room);
      return;
    }
    if (room.awaiting && doc.host && doc.guest && doc.host.finishedAt && doc.guest.finishedAt) {
      finalizeOnlineDuel(cfg, host, doc);
      return;
    }
    if (st.screen === 'roomLobby' && doc.guest) paint(cfg, host);
    else if (st.screen === 'roomWaiting') paint(cfg, host);
  }

  function attachRoom(cfg, host, side, doc) {
    var st = getState(cfg.id);
    closeRoom(st);
    var room = {
      code: doc.code, side: side, doc: doc, unsub: null, lastSync: 0,
      started: false, sessionStarted: false, awaiting: false, finalized: false
    };
    st.room = room;
    room.unsub = GH.room.watch(cfg.id, room.code, function (next) {
      handleRoomDoc(cfg, host, next);
    }, function (err) {
      UI.toast({ title: 'Room terputus', msg: roomError(err), type: 'error' });
    });
    handleRoomDoc(cfg, host, doc);
  }

  function openRoomDialog(cfg, host) {
    var st = getState(cfg.id);
    var registered = GH.identity && typeof GH.identity.isRegistered === 'function' && GH.identity.isRegistered();
    if (!registered) {
      UI.toast({ title: 'Profil diperlukan', msg: 'Buat profil terdaftar dulu untuk duel online.', type: 'warning' });
      if (GH.app && typeof GH.app.openCreateProfile === 'function') GH.app.openCreateProfile();
      return Promise.resolve(false);
    }
    if (!GH.room || typeof GH.room.create !== 'function') {
      UI.toast({ title: 'Belum tersedia', msg: 'Layanan room belum dimuat. Muat ulang halaman.', type: 'error' });
      return Promise.resolve(false);
    }

    var mode = 'create';
    var count = st.countChoice;
    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="segmented" role="group" aria-label="Mode room">' +
        '<button class="segmented__btn" type="button" data-room-mode="create" aria-pressed="true">Buat room</button>' +
        '<button class="segmented__btn" type="button" data-room-mode="join" aria-pressed="false">Gabung room</button>' +
      '</div>' +
      '<div class="room-create-pane">' +
        (cfg.kind === 'timed'
          ? '<p class="label">Jumlah soal</p><div class="segmented segmented--wide" role="group" aria-label="Jumlah soal">' +
              cfg.counts.map(function (n) {
                return '<button class="segmented__btn" type="button" data-room-count="' + n + '" aria-pressed="' + (n === count ? 'true' : 'false') + '">' + n + ' soal</button>';
              }).join('') +
            '</div>'
          : '<div class="notice notice--info"><p>Ronde 60 detik dengan 80 soal identik. Keduanya mulai bersamaan.</p></div>') +
        '<p class="tiny muted">Kamu akan mendapat kode 5 karakter untuk dibagikan ke lawan.</p>' +
      '</div>' +
      '<div class="room-join-pane" hidden>' +
        '<label class="label" for="roomCodeInput">Kode room</label>' +
        '<input class="input input--code" id="roomCodeInput" maxlength="6" autocomplete="off" spellcheck="false" placeholder="AB12C" aria-describedby="roomError">' +
        '<p class="input-error" id="roomError" role="alert"></p>' +
        '<p class="tiny muted">Masukkan kode dari tuan room. Keduanya harus memakai profil terdaftar.</p>' +
      '</div>' +
      '<div class="notice notice--warning"><p>Duel online memakai profil terdaftar dan menulis progres ke room Firestore. Mode tamu tetap tidak menulis data.</p></div>';

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
      title: 'Duel online · ' + cfg.title,
      subtitle: 'Dua perangkat, satu kode room, balapan langsung.',
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
            var task = mode === 'create'
              ? prepareRoomQuestions(cfg, count).then(function (questions) {
                  return GH.room.create(cfg.id, cfg.kind === 'timed' ? Number(count) : questions.length, questions, function (doc) {
                    attachRoom(cfg, host, 'host', doc);
                  });
                })
              : GH.room.join(cfg.id, input.value).then(function (doc) {
                  attachRoom(cfg, host, 'guest', doc);
                });
            task.then(function (code) {
              close(true);
              if (mode === 'create') {
                st.screen = 'roomLobby';
                UI.toast({ title: 'Room dibuat', msg: 'Bagikan kode ' + code + ' ke lawan.', type: 'success' });
              } else {
                st.screen = 'roomWaiting';
                UI.toast({ title: 'Bergabung', msg: 'Kode ' + code + '. Menunggu tuan room memulai.', type: 'success' });
              }
              paint(cfg, host);
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
            count = Number(b.dataset.roomCount);
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

  function roomSlotMarkup(doc, side) {
    var slots = [roomSlotPlayer(doc.host), doc.guest ? roomSlotPlayer(doc.guest) : null];
    return slots.map(function (p, i) {
      var who = i === 0 ? 'host' : 'guest';
      return '<div class="room-slot' + (who === side ? ' is-me' : '') + (p && (who === 'host' || doc.guest) ? '' : ' is-empty') + '">' +
        '<span class="room-slot__avatar" aria-hidden="true">' + U.esc(p ? p.avatar : '·') + '</span>' +
        '<span class="room-slot__name">' + U.esc(p ? p.name : 'Menunggu lawan…') + '</span>' +
        '<span class="room-slot__tag">' + (who === side ? 'Kamu' : (who === 'host' ? 'Tuan room' : 'Lawan')) + '</span>' +
      '</div>';
    }).join('');
  }

  function leaveRoom(cfg, host) {
    var st = getState(cfg.id);
    var room = st.room;
    var wasHost = room && room.side === 'host';
    var code = room && room.code;
    closeRoom(st);
    if (wasHost && code && GH.room && typeof GH.room.abandon === 'function') GH.room.abandon(cfg.id, code);
    st.duel = null; st.session = null; st.rapid = null; st.phase = 'idle';
    st.screen = 'dashboard';
    paint(cfg, host);
  }

  function bindRoomScreen(cfg, host) {
    var back = host.querySelector('[data-game-back]');
    if (back) back.addEventListener('click', function () { leaveRoom(cfg, host); });
    var cancel = host.querySelector('[data-room-back]');
    if (cancel) cancel.addEventListener('click', function () { leaveRoom(cfg, host); });
    var sound = host.querySelector('[data-sound-toggle]');
    if (sound) sound.addEventListener('click', UI.toggleSound);
  }

  function renderRoomLobby(cfg, host) {
    var st = getState(cfg.id);
    var room = st.room;
    if (!room) { st.screen = 'dashboard'; paint(cfg, host); return; }
    var doc = room.doc || {};
    var me = roomSlotPlayer(doc[room.side]);
    host.innerHTML = '<div class="game-shell">' +
      UI.gameHeader({ title: cfg.title, subtitle: 'Duel online', glyph: cfg.glyph, backLabel: 'Keluar' }) +
      '<div class="game-wrap game-wrap--narrow">' +
        '<section class="room-screen">' +
          '<div class="room-badge" aria-hidden="true">◈</div>' +
          '<span class="eyebrow">Room dibuat</span>' +
          '<h1>Bagikan kode <span class="text-gradient room-code">' + U.esc(room.code) + '</span></h1>' +
          '<p>Lawan memasukkan kode ini di perangkatnya. Keduanya harus memakai profil terdaftar. Duel dimulai otomatis setelah lawan bergabung.</p>' +
          '<div class="room-code-actions">' +
            '<button class="btn btn--primary btn--lg" type="button" data-room-copy>Salin kode</button>' +
            '<button class="btn btn--ghost" type="button" data-room-back>Batalkan room</button>' +
          '</div>' +
          '<div class="room-slots">' + roomSlotMarkup(doc, room.side) + '</div>' +
          '<p class="tiny muted">' + U.esc(me.name) + ' · soal identik untuk kedua perangkat.</p>' +
        '</section>' +
      '</div>' +
    '</div>';
    host.querySelector('[data-room-copy]').addEventListener('click', function () {
      U.copyText(room.code).then(function () {
        UI.toast({ title: 'Kode disalin', msg: room.code, type: 'success' });
      }).catch(function () {
        UI.toast({ title: 'Salin manual', msg: room.code, type: 'warning' });
      });
    });
    bindRoomScreen(cfg, host);
  }

  function renderRoomWaiting(cfg, host) {
    var st = getState(cfg.id);
    var room = st.room;
    if (!room) { st.screen = 'dashboard'; paint(cfg, host); return; }
    var doc = room.doc || {};
    var meSlot = doc[room.side] || {};
    var mine = st.duel && st.duel.results[room.side === 'host' ? 0 : 1];
    var label = cfg.kind === 'rapid'
      ? formatScore(mine ? mine.score : (meSlot.score || 0)) + ' poin'
      : formatDuration((mine ? mine.totalMs : (((Number(meSlot.time) || 0) + (Number(meSlot.penaltySec) || 0)) * 1000)) / 1000);
    host.innerHTML = '<div class="game-shell">' +
      UI.gameHeader({ title: cfg.title, subtitle: 'Duel online', glyph: cfg.glyph, backLabel: 'Keluar' }) +
      '<div class="game-wrap game-wrap--narrow">' +
        '<section class="room-screen room-screen--waiting">' +
          '<div class="room-badge" aria-hidden="true">◈</div>' +
          '<span class="eyebrow">Ronde selesai</span>' +
          '<h1>Hasilmu <span class="text-gradient">' + U.esc(label) + '</span></h1>' +
          '<p>Menunggu lawan menyelesaikan ronde. Hasil akhir muncul otomatis di kedua perangkat.</p>' +
          '<div class="room-slots">' + roomSlotMarkup(doc, room.side) + '</div>' +
          '<button class="btn btn--ghost" type="button" data-room-back>Keluar room</button>' +
        '</section>' +
      '</div>' +
    '</div>';
    bindRoomScreen(cfg, host);
  }

  /* ---------------- Paint ---------------- */
  function paint(cfg, host) {
    var st = getState(cfg.id);
    host.dataset.game = cfg.id;
    if (st.screen === 'play') {
      if (cfg.kind === 'timed') renderTimedPlay(cfg, host);
      else renderRapidPlay(cfg, host);
    } else if (st.screen === 'result') {
      if (cfg.kind === 'timed') renderTimedResult(cfg, host);
      else renderRapidResult(cfg, host);
    } else if (st.screen === 'duelResult') {
      if (cfg.kind === 'timed') renderDuelResult(cfg, host);
      else renderRapidDuelResult(cfg, host);
    } else if (st.screen === 'roomLobby') {
      renderRoomLobby(cfg, host);
    } else if (st.screen === 'roomWaiting') {
      renderRoomWaiting(cfg, host);
    } else {
      renderDashboard(cfg, host);
    }
  }

  function sameIdentity(value, previous) {
    return !!(value && previous &&
      (value.name === previous.name || !previous.name) &&
      (value.avatar === previous.avatar || !previous.avatar));
  }

  function patchActiveIdentity(snap, previous) {
    if (!snap || !snap.registered || !previous || previous.registered) return;
    Object.keys(CONFIG).forEach(function (id) {
      var st = getState(id);
      [st.session, st.rapid].forEach(function (session) {
        if (sameIdentity(session && session.player, previous)) {
          session.player.name = snap.name;
          session.player.avatar = snap.avatar;
        }
      });
      if (st.duel && st.duel.players && st.duel.players[0] && sameIdentity(st.duel.players[0], previous)) {
        st.duel.players[0].name = snap.name;
        st.duel.players[0].avatar = snap.avatar;
      }
    });
  }

  /* ---------------- Registration ---------------- */
  function register(id) {
    var cfg = CONFIG[id];
    R.register(id, {
      title: cfg.title,
      render: function (host) {
        var st = getState(id);
        st.cfg = cfg;
        paint(cfg, host);
      },
      cleanup: function () {
        var st = getState(id);
        if (st.screen === 'play') {
          // route cleanup only happens when leaving view; abort session
          cleanupState(st);
          st.phase = 'idle';
        }
        if (st.room) closeRoom(st);
      }
    });
  }

  GH.quiz = {
    init: function () {
      Object.keys(CONFIG).forEach(register);
      if (GH.identity && typeof GH.identity.onChange === 'function') {
        GH.identity.onChange(patchActiveIdentity);
      }
      // expose for dashboard quick-start from hub
      GH.quiz.startDaily = function () {};
    },
    config: CONFIG,
    getState: getState,
    startTimedSession: startTimedSession,
    startRapidSession: startRapidSession,
    buildTimedQuestions: buildTimedQuestions,
    paint: paint
  };
})();
