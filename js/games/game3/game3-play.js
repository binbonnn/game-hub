/* =====================================================================================
   ALUR GAME (berbasis waktu: total waktu = waktu aktual + semua hukuman)
===================================================================================== */
// Pilih jumlah soal: logika sama seperti game Perkalian 1-10 (modal berisi 10/20/30 soal)
document.getElementById('advmathOpenSoloButton').addEventListener('click', () => {
    showModal('advmathChooseCountModal');
});

document.querySelectorAll('#advmathChooseCountModal .count-option-button').forEach(btn => {
    btn.addEventListener('click', () => {
        const count = parseInt(btn.dataset.count, 10);
        hideModal('advmathChooseCountModal');
        startAdvmathSoloGame(count);
    });
});

function advmathHintButtons() {
    return Array.from(document.querySelectorAll('#advmathHintRow .advmath-hint-btn'));
}

function advmathOptionButtons() {
    return Array.from(document.querySelectorAll('.advmath-option-btn'));
}

function prepareAdvmathGameUI() {
    // Tampilkan overlay countdown SINKRON bareng switchView, supaya tidak ada celah
    // "layar game polos" sempat kelihatan sebelum overlay menutupinya.
    const overlay = document.getElementById('countdownOverlay');
    document.getElementById('countdownNumber').textContent = COUNTDOWN_STEPS[0].text;
    document.getElementById('countdownLabel').textContent = COUNTDOWN_STEPS[0].label;
    overlay.classList.add('is-visible');

    stopAdvmathRoundTimer();
    advmathQuestionToken++;
    advmathQ = null;
    advmathGameInProgress = true;
    advmathLastSavedRecord = null;
    advmathCorrectCount = 0;
    advmathBurnedCount = 0;
    advmathMistakeCount = 0;
    advmathHintsUsed = 0;
    advmathPenaltySeconds = 0;
    advmathFinalLocked = false;
    advmathFinalSeconds = 0;
    advmathActualSeconds = 0;
    advmathSeqIndex = 0;
    advmathLastShownSeconds = -1;

    document.getElementById('advmathTimer').textContent = '00:00';
    document.getElementById('advmathProgressBarFill').style.width = '0%';
    document.getElementById('advmathProgressLabel').textContent = `Soal 1 dari ${advmathCount}`;
    document.getElementById('advmathQuestionText').textContent = '';
    document.getElementById('advmathBurnBanner').style.display = 'none';
    advmathOptionButtons().forEach(btn => {
        btn.disabled = true;
        btn.textContent = '';
        btn.className = 'advmath-option-btn';
    });
    advmathHintButtons().forEach(btn => {
        btn.disabled = true;
        btn.className = 'advmath-hint-btn';
        btn.style.removeProperty('--p');
        btn.querySelector('.advmath-hint-status').textContent = '';
    });
    hideModal('advmathHintModal');

    switchView('advmathGame');
}

function startAdvmathSoloGame(count) {
    advmathDuelState = null;
    advmathCount = count;
    advmathSequence = generateAdvmathSequence(count);
    if (advmathSequence.length === 0) {
        showToast('danger', 'Bank soal belum tersedia. Cek file advmath-questions.js.', 5000);
        return;
    }
    advmathCount = advmathSequence.length; // jaga-jaga kalau bank soal lebih sedikit dari jumlah yang dipilih
    prepareAdvmathGameUI();
    document.getElementById('advmathDuelOpponentBar').style.display = 'none';
    document.getElementById('advmathDuelDisconnectBanner').style.display = 'none';
    runCountdown(() => {
        beginAdvmathRound();
    });
}

// Dipanggil SETELAH countdown selesai: baru di sini timer permainan mulai berjalan
function beginAdvmathRound() {
    advmathStartTime = Date.now();
    displayAdvmathQuestion();
    startAdvmathRoundTimer();
}

/* ---- Timer permainan ---- */
function advmathCurrentTotalSeconds(now) {
    const actual = Math.floor(((now || Date.now()) - advmathStartTime) / 1000);
    return Math.max(0, actual) + advmathPenaltySeconds;
}

function renderAdvmathTimer(force) {
    const total = advmathFinalLocked ? advmathFinalSeconds : advmathCurrentTotalSeconds();
    if (!force && total === advmathLastShownSeconds) return;
    advmathLastShownSeconds = total;
    const text = formatAdvmathDuration(total);
    const timerEl = document.getElementById('advmathTimer');
    timerEl.textContent = text;
    const modalTimer = document.getElementById('advmathHintTimer');
    if (modalTimer) modalTimer.textContent = text;
}

function startAdvmathRoundTimer() {
    clearInterval(advmathUiInterval);
    advmathUiInterval = setInterval(advmathUiTick, 100);
    renderAdvmathTimer(true);
}

// Menghentikan SEMUA timer/callback milik sesi (interval tampilan + callback perpindahan soal tertunda)
function stopAdvmathRoundTimer() {
    clearInterval(advmathUiInterval);
    advmathUiInterval = null;
    advmathQuestionToken++;
    if (advmathQ && advmathQ.autoAdvanceTimeout) {
        clearTimeout(advmathQ.autoAdvanceTimeout);
        advmathQ.autoAdvanceTimeout = null;
    }
}

function advmathUiTick() {
    if (!advmathGameInProgress && !advmathFinalLocked) return;
    renderAdvmathTimer(false);
    updateAdvmathHintUI();
}

// Mengunci total waktu akhir tepat saat soal TERAKHIR selesai. Hanya boleh terjadi sekali per sesi
// (jadi hukuman tidak pernah terhitung ulang saat hasil ditampilkan atau disimpan).
function lockAdvmathFinalTime() {
    if (advmathFinalLocked) return;
    const now = Date.now();
    advmathActualSeconds = Math.max(0, Math.floor((now - advmathStartTime) / 1000));
    advmathFinalSeconds = advmathActualSeconds + advmathPenaltySeconds;
    advmathFinalLocked = true;
    renderAdvmathTimer(true);
}

function applyAdvmathPenalty(seconds) {
    advmathPenaltySeconds += seconds;
    renderAdvmathTimer(true); // timer langsung menunjukkan perubahan

    const timerEl = document.getElementById('advmathTimer');
    timerEl.classList.remove('is-penalty');
    void timerEl.offsetWidth;
    timerEl.classList.add('is-penalty');

    const chip = document.getElementById('advmathPenaltyChip');
    chip.textContent = `+${seconds} detik`;
    chip.classList.remove('is-visible');
    void chip.offsetWidth;
    chip.classList.add('is-visible');
}

/* ---- Status & tampilan satu soal ---- */
function newAdvmathQuestionState() {
    const hints = {};
    ADVMATH_HINT_LEVELS.forEach(l => { hints[l] = { openedAt: null, deadline: null }; });
    return { wrong: 0, burned: false, resolved: false, hints, lastOpenedLevel: null, shownLevel: null, burnDeadline: null, autoAdvanceTimeout: null };
}

function resetAdvmathQuestionState() {
    advmathQuestionToken++; // callback otomatis soal sebelumnya jadi basi
    if (advmathQ && advmathQ.autoAdvanceTimeout) clearTimeout(advmathQ.autoAdvanceTimeout);
    advmathQ = newAdvmathQuestionState();
}

function displayAdvmathQuestion() {
    const q = advmathSequence[advmathSeqIndex];
    resetAdvmathQuestionState();
    closeAdvmathHintModalSilently();

    document.getElementById('advmathQuestionText').textContent = q.question;
    advmathOptionButtons().forEach((btn, i) => {
        btn.textContent = q.options[i] !== undefined ? q.options[i] : '';
        btn.style.display = q.options[i] !== undefined ? 'flex' : 'none';
        btn.disabled = false;
        btn.className = 'advmath-option-btn';
    });
    document.getElementById('advmathBurnBanner').style.display = 'none';
    document.getElementById('advmathProgressLabel').textContent = `Soal ${advmathSeqIndex + 1} dari ${advmathCount}`;
    document.getElementById('advmathProgressBarFill').style.width = `${(advmathSeqIndex / advmathCount) * 100}%`;
    updateAdvmathHintUI();
}

document.querySelectorAll('.advmath-option-btn').forEach((btn, idx) => {
    btn.addEventListener('click', () => handleAdvmathOptionClick(idx));
});

function handleAdvmathOptionClick(idx) {
    if (!advmathGameInProgress || !advmathQ || advmathQ.burned || advmathQ.resolved) return;
    const btns = advmathOptionButtons();
    const btn = btns[idx];
    if (!btn || btn.disabled) return;
    const q = advmathSequence[advmathSeqIndex];

    if (idx === q.correctIndex) {
        advmathQ.resolved = true;
        btn.classList.add('is-correct');
        btns.forEach(b => { b.disabled = true; });
        playCorrectSound();
        advmathCorrectCount++;
        const isLast = advmathSeqIndex >= advmathCount - 1;
        if (isLast) lockAdvmathFinalTime(); // waktu berhenti tepat saat soal terakhir dijawab benar
        updateAdvmathHintUI();
        if (advmathDuelState) reportAdvmathDuelProgress(advmathSeqIndex + 1);
        closeAdvmathHintModalSilently();
        const token = advmathQuestionToken;
        setTimeout(() => proceedAfterAdvmathQuestion(token), ADVMATH_CORRECT_ADVANCE_DELAY_MS);
        return;
    }

    // Jawaban salah: hukuman langsung diterapkan, terpisah & kumulatif (60 -> 180 -> 300)
    btn.disabled = true;
    btn.classList.add('is-wrong');
    playWrongSound();
    advmathQ.wrong++;
    advmathMistakeCount++;
    const penalty = ADVMATH_WRONG_PENALTIES[advmathQ.wrong - 1];
    applyAdvmathPenalty(penalty);

    if (advmathQ.wrong >= ADVMATH_MAX_WRONG) {
        burnAdvmathQuestion();
    }
}

/* ---- Soal hangus: tidak ada hukuman tambahan di sini (hukuman sudah diberikan oleh tindakan pemicunya) ---- */
function pickAdvmathReferenceDeadline() {
    const now = Date.now();
    const q = advmathQ;
    // 1) hint yang sedang ditampilkan di pop-up
    if (q.shownLevel && q.hints[q.shownLevel].deadline && q.hints[q.shownLevel].deadline > now) {
        return q.hints[q.shownLevel].deadline;
    }
    // 2) kalau tidak ada yang ditampilkan: countdown aktif yang paling akhir dibuka
    let best = null;
    ADVMATH_HINT_LEVELS.forEach(l => {
        const h = q.hints[l];
        if (h.deadline && h.deadline > now && (!best || h.openedAt > best.openedAt)) best = h;
    });
    return best ? best.deadline : null;
}

function burnAdvmathQuestion() {
    const q = advmathQ;
    if (!q || q.burned || q.resolved) return;
    q.burned = true;
    advmathBurnedCount++;

    const current = advmathSequence[advmathSeqIndex];
    advmathOptionButtons().forEach((b, i) => {
        b.disabled = true;
        if (i === current.correctIndex) b.classList.add('is-reveal'); // bantuan pemulihan: tunjukkan jawaban yang benar
    });
    if (advmathDuelState) reportAdvmathDuelProgress(advmathSeqIndex + 1);

    const token = advmathQuestionToken;
    const deadline = pickAdvmathReferenceDeadline();

    if (!deadline) {
        // Tidak ada countdown hint aktif -> langsung pindah, tanpa waktu tunggu tambahan
        updateAdvmathHintUI();
        proceedAfterAdvmathQuestion(token);
        return;
    }

    // Ada countdown hint aktif -> tetap di soal sampai sisa countdown habis atau pemain menekan "Lanjut"
    q.burnDeadline = deadline;
    document.getElementById('advmathBurnBanner').style.display = 'flex';
    const waitMs = Math.max(0, deadline - Date.now());
    q.autoAdvanceTimeout = setTimeout(() => proceedAfterAdvmathQuestion(token), waitMs);
    updateAdvmathHintUI();
}

document.getElementById('advmathNextButton').addEventListener('click', () => {
    if (!advmathQ || !advmathQ.burned) return;
    proceedAfterAdvmathQuestion(advmathQuestionToken);
});

document.getElementById('advmathHintNextButton').addEventListener('click', () => {
    if (!advmathQ || !advmathQ.burned) return;
    proceedAfterAdvmathQuestion(advmathQuestionToken);
});

// SATU-SATUNYA pintu perpindahan soal. Token memastikan tiap soal hanya berpindah sekali, walau tombol "Lanjut",
// timeout otomatis, dan beberapa countdown berakhir hampir bersamaan.
function proceedAfterAdvmathQuestion(token) {
    if (token !== advmathQuestionToken) return;
    if (!advmathGameInProgress && !advmathFinalLocked) return;
    advmathQuestionToken++;
    if (advmathQ && advmathQ.autoAdvanceTimeout) {
        clearTimeout(advmathQ.autoAdvanceTimeout);
        advmathQ.autoAdvanceTimeout = null;
    }
    closeAdvmathHintModalSilently();

    if (advmathSeqIndex >= advmathCount - 1) {
        finishAdvmathGame();
        return;
    }
    advmathSeqIndex++;
    displayAdvmathQuestion();
    if (advmathDuelState) reportAdvmathDuelProgress(advmathSeqIndex);
}

/* ---- Hint 1/2/3 ---- */
function updateAdvmathHintUI() {
    const q = advmathQ;
    const now = Date.now();
    advmathHintButtons().forEach(btn => {
        const level = parseInt(btn.dataset.level, 10);
        const cfg = ADVMATH_HINT_CONFIG[level];
        const statusEl = btn.querySelector('.advmath-hint-status');
        btn.classList.remove('is-active', 'is-expired', 'is-locked');
        if (!q || !advmathGameInProgress) {
            btn.disabled = true;
            return;
        }
        const h = q.hints[level];
        if (h.deadline) {
            const remainingMs = h.deadline - now;
            if (remainingMs > 0) {
                btn.classList.add('is-active');
                btn.disabled = false;
                btn.style.setProperty('--p', Math.max(0, Math.min(1, remainingMs / (cfg.durationSec * 1000))).toFixed(4));
                statusEl.textContent = `${Math.ceil(remainingMs / 1000)} dtk`;
                btn.setAttribute('aria-label', `Hint ${level}, sisa akses ${Math.ceil(remainingMs / 1000)} detik`);
            } else {
                btn.classList.add('is-expired');
                btn.disabled = true;
                btn.style.setProperty('--p', 0);
                statusEl.textContent = 'Hangus 🔥';
                btn.setAttribute('aria-label', `Hint ${level} sudah kedaluwarsa`);
            }
        } else if (q.burned || q.resolved) {
            btn.classList.add('is-locked');
            btn.disabled = true;
            btn.style.setProperty('--p', 1);
            statusEl.textContent = '';
            btn.setAttribute('aria-label', `Hint ${level} tidak tersedia`);
        } else {
            btn.disabled = false;
            btn.style.setProperty('--p', 1);
            statusEl.textContent = '';
            btn.setAttribute('aria-label', `Hint ${level}, hukuman tambahan ${cfg.penalty} detik`);
        }
    });

    // Banner "soal hangus": hitung mundur sisa waktu tunggu
    const banner = document.getElementById('advmathBurnBanner');
    if (q && q.burned && q.burnDeadline) {
        const remaining = Math.max(0, Math.ceil((q.burnDeadline - now) / 1000));
        document.getElementById('advmathBurnCountdown').textContent = String(remaining);
        banner.style.display = 'flex';
    }

    updateAdvmathHintModalUI();
}

advmathHintButtons().forEach(btn => {
    btn.addEventListener('click', () => openAdvmathHint(parseInt(btn.dataset.level, 10)));
});

async function openAdvmathHint(level) {
    if (!advmathGameInProgress || !advmathQ || advmathQ.resolved) return;
    const q = advmathQ;
    const h = q.hints[level];
    const cfg = ADVMATH_HINT_CONFIG[level];
    const now = Date.now();

    if (h.deadline) {
        // Sudah pernah dibuka: tidak ada hukuman baru & countdown TIDAK di-reset
        if (now >= h.deadline) {
            return;
        }
        q.shownLevel = level;
        await showAdvmathHintModal(level);
        return;
    }

    if (q.burned) return; // soal sudah hangus: tidak boleh membuka hint tambahan

    // Pertama kali dibuka: hukuman langsung diterapkan SEKALI & countdown mulai
    h.openedAt = now;
    h.deadline = now + cfg.durationSec * 1000;
    q.lastOpenedLevel = level;
    q.shownLevel = level;
    advmathHintsUsed++;
    applyAdvmathPenalty(cfg.penalty);

    if (level === 3) {
        burnAdvmathQuestion(); // memakai countdown Hint 3 (sedang ditampilkan) sebagai acuan waktu tunggu
    }
    if (advmathDuelState) reportAdvmathDuelProgress(advmathSeqIndex);
    updateAdvmathHintUI();
    await showAdvmathHintModal(level);
}

async function showAdvmathHintModal(level) {
    const q = advmathQ;
    if (!q) return;
    const current = advmathSequence[advmathSeqIndex];
    const cfg = ADVMATH_HINT_CONFIG[level];
    q.shownLevel = level;

    document.getElementById('advmathHintModalLabel').textContent = `💡 Hint ${level}`;
    document.getElementById('advmathHintClue').textContent = current.clues[level - 1];
    document.getElementById('advmathHintPenaltyInfo').textContent = `Hukuman +${cfg.penalty} detik sudah diterapkan. Membuka ulang hint ini tidak menambah hukuman.`;
    document.getElementById('advmathHintModal').dataset.level = String(level);
    updateAdvmathHintModalUI();

    await waitForModalHidden('advmathHintModal');
    if (!advmathQ || advmathQ !== q) return; // sudah pindah soal selama menunggu
    q.shownLevel = level;
    showModal('advmathHintModal');
}

function updateAdvmathHintModalUI() {
    const modal = document.getElementById('advmathHintModal');
    if (!modal) return;
    const q = advmathQ;
    const level = parseInt(modal.dataset.level, 10);
    if (!q || !level || !q.hints[level]) return;
    const cfg = ADVMATH_HINT_CONFIG[level];
    const h = q.hints[level];
    const now = Date.now();
    const remainingMs = h.deadline ? h.deadline - now : 0;

    document.getElementById('advmathHintCountdownText').textContent =
        remainingMs > 0 ? `Sisa akses: ${Math.ceil(remainingMs / 1000)} detik` : 'Akses hint habis 🔥';
    document.getElementById('advmathHintCountdownFill').style.width =
        `${Math.max(0, Math.min(100, (remainingMs / (cfg.durationSec * 1000)) * 100))}%`;
    modal.classList.toggle('is-level-3', level === 3);

    const burnNote = document.getElementById('advmathHintBurnNote');
    const nextBtn = document.getElementById('advmathHintNextButton');
    burnNote.style.display = q.burned ? 'block' : 'none';
    nextBtn.style.display = q.burned ? 'inline-block' : 'none';

    // Akses habis -> tutup pop-up otomatis (tanpa hukuman tambahan)
    if (h.deadline && remainingMs <= 0 && modal.classList.contains('show') && q.shownLevel === level) {
        q.shownLevel = null;
        hideModal('advmathHintModal');
    }
}

// Pop-up ditutup (tombol X / Tutup / klik di luar): countdown tetap berjalan di latar belakang
document.getElementById('advmathHintModal').addEventListener('hidden.bs.modal', () => {
    if (advmathQ) advmathQ.shownLevel = null;
});

function closeAdvmathHintModalSilently() {
    if (advmathQ) advmathQ.shownLevel = null;
    hideModal('advmathHintModal');
    // Jaring pengaman: kalau pop-up sedang di tengah animasi buka, hide() pertama diabaikan Bootstrap.
    // Cek lagi sesaat kemudian; tutup hanya kalau pemain belum membuka hint baru di soal berikutnya.
    setTimeout(() => {
        const m = document.getElementById('advmathHintModal');
        if (m && m.classList.contains('show') && (!advmathQ || !advmathQ.shownLevel)) hideModal('advmathHintModal');
    }, 450);
}

/* ---- Selesai ---- */
function finishAdvmathGame() {
    lockAdvmathFinalTime();
    advmathGameInProgress = false;
    clearInterval(advmathUiInterval);
    advmathUiInterval = null;
    advmathOptionButtons().forEach(b => { b.disabled = true; });
    advmathHintButtons().forEach(b => { b.disabled = true; });
    document.getElementById('advmathBurnBanner').style.display = 'none';
    document.getElementById('advmathProgressBarFill').style.width = '100%';
    document.getElementById('advmathTimer').textContent = formatAdvmathDuration(advmathFinalSeconds);

    if (advmathDuelState) {
        endAdvmathDuelGame();
    } else {
        endAdvmathSoloGame();
    }
}

// Selisih detik yang dibutuhkan untuk MENGALAHKAN rekor tertentu (minimal 1 detik lebih cepat)
function advmathSecondsToBeat(timeTaken, record) {
    return Math.max(1, timeTaken - record.time + 1);
}

function buildAdvmathRankInsight(timeTaken, mistakes, burned, hints, records) {
    const sorted = sortAdvmathRecords(records);
    const beatenBy = sorted.filter(r => {
        if (r.time !== timeTaken) return r.time < timeTaken;
        if ((r.burned || 0) !== burned) return (r.burned || 0) < burned;
        if ((r.hints || 0) !== hints) return (r.hints || 0) < hints;
        return (r.mistakes || 0) <= mistakes;
    }).length;
    const rank = beatenBy + 1;
    const qualifies = rank <= MAX_ADVMATH_LEADERBOARD;
    const details = [];
    const top = sorted[0];
    const third = sorted[2];
    const lastPlace = sorted[MAX_ADVMATH_LEADERBOARD - 1];
    const medals = { 1: '👑', 2: '🥈', 3: '🥉' };

    if (sorted.length === 0) {
        return {
            rank: 1, qualifies: true, tone: 'top',
            headline: '🏆 Kamu pemain pertama di level ini!',
            details: [{ icon: '💾', text: 'Simpan waktumu untuk jadi peringkat 1 di papan peringkat.' }]
        };
    }

    if (rank === 1) {
        const gap = top.time - timeTaken;
        details.push({ icon: gap > 0 ? '⚡' : '🎯', text: gap > 0
            ? `${formatAdvmathDuration(gap)} lebih cepat dari rekor sebelumnya (${top.name}).`
            : 'Waktu sama dengan rekor sebelumnya, tapi soal hangus/hint/salahmu lebih sedikit.' });
        return { rank, qualifies, tone: 'top', headline: '👑 Rekor baru! Kamu peringkat 1', details };
    }

    const gapToTop = timeTaken - top.time;

    if (rank <= 3) {
        const above = sorted[rank - 2];
        details.push({ icon: '🐢', text: gapToTop > 0
            ? `${formatAdvmathDuration(gapToTop)} lebih lambat dari peringkat 1.`
            : 'Waktu sama dengan peringkat 1, tapi kalah di soal hangus/hint/salah.' });
        details.push({ icon: '🚀', text: `${formatAdvmathDuration(advmathSecondsToBeat(timeTaken, above))} lagi untuk naik ke peringkat ${rank - 1}.` });
        return { rank, qualifies, tone: 'top', headline: `${medals[rank]} Kamu masuk 3 besar! Peringkat ${rank}`, details };
    }

    if (qualifies) {
        details.push({ icon: '🥉', text: `${formatAdvmathDuration(advmathSecondsToBeat(timeTaken, third))} lagi untuk masuk 3 besar.` });
        details.push({ icon: '🐢', text: `${formatAdvmathDuration(gapToTop)} lebih lambat dari peringkat 1.` });
        return { rank, qualifies, tone: 'ok', headline: `🎯 Kamu masuk papan peringkat! Peringkat ${rank}`, details };
    }

    details.push({ icon: '📉', text: `${formatAdvmathDuration(timeTaken - lastPlace.time)} lebih lambat dari peringkat ${MAX_ADVMATH_LEADERBOARD}.` });
    details.push({ icon: '🎯', text: `${formatAdvmathDuration(advmathSecondsToBeat(timeTaken, lastPlace))} lagi untuk masuk papan peringkat.` });
    details.push({ icon: '💡', text: 'Tip: setiap salah, hint, dan soal hangus menambah waktu. Jawab yakin supaya waktumu singkat.' });
    return { rank, qualifies, tone: 'miss', headline: '💪 Belum masuk papan peringkat, ayo coba lagi!', details };
}

function renderAdvmathRankInsight(insight) {
    const box = document.getElementById('advmathRankInsight');
    box.className = `rank-insight is-${insight.tone}`;
    document.getElementById('advmathRankInsightHeadline').textContent = insight.headline;
    const list = document.getElementById('advmathRankInsightDetails');
    list.innerHTML = '';
    insight.details.forEach(detail => {
        const li = document.createElement('li');
        li.dataset.icon = detail.icon;
        li.textContent = detail.text;
        list.appendChild(li);
    });
    box.style.display = 'block';
}

async function endAdvmathSoloGame() {
    document.getElementById('advmathFinalTime').textContent = formatAdvmathDuration(advmathFinalSeconds);
    document.getElementById('advmathFinalActual').textContent = formatAdvmathDuration(advmathActualSeconds);
    document.getElementById('advmathFinalPenalty').textContent = `+${formatAdvmathDuration(advmathPenaltySeconds)}`;
    document.getElementById('advmathFinalMistakes').textContent = advmathMistakeCount.toString();
    document.getElementById('advmathFinalHints').textContent = advmathHintsUsed.toString();
    document.getElementById('advmathFinalBurned').textContent = advmathBurnedCount.toString();
    document.getElementById('advmathEndCountLabel').textContent = `${advmathCount} soal`;

    const records = await getAdvmathRecordsForCount(advmathCount);
    const insight = buildAdvmathRankInsight(advmathFinalSeconds, advmathMistakeCount, advmathBurnedCount, advmathHintsUsed, records);
    renderAdvmathRankInsight(insight);
    document.getElementById('advmathSaveScoreButton').style.display = insight.qualifies ? 'inline-block' : 'none';

    showModal('advmathEndModal');
    launchConfetti();
    playFinishSounds(insight.qualifies);
}

document.getElementById('advmathSaveScoreButton').addEventListener('click', async () => {
    hideModal('advmathEndModal');
    await waitForModalHidden('advmathEndModal');
    showModal('advmathSaveRecordModal');
});

document.getElementById('advmathButtonSavePlayerRecord').addEventListener('click', saveAdvmathPlayerRecord);

async function saveAdvmathPlayerRecord() {
    const nameInput = document.getElementById('advmathPlayerName');
    const playerName = nameInput.value.trim();
    if (!playerName) {
        showToast('danger', 'Isi dulu namamu ya!');
        nameInput.focus();
        return;
    }

    const saveBtn = document.getElementById('advmathButtonSavePlayerRecord');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Menyimpan...';

    // Nilai yang disimpan = total waktu akhir yang SUDAH dikunci (aktual + hukuman), tanpa dihitung ulang
    const record = {
        name: playerName,
        time: advmathFinalSeconds,
        mistakes: advmathMistakeCount,
        hints: advmathHintsUsed,
        burned: advmathBurnedCount,
        avatar: advmathSelectedAvatar
    };
    const savedCount = advmathCount;

    let saveResult = null;
    try {
        saveResult = await saveAdvmathRecord(savedCount, record);
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Simpan';
    }

    hideModal('advmathSaveRecordModal');
    nameInput.value = '';
    advmathLastSavedRecord = { count: savedCount, name: playerName, time: record.time, mistakes: record.mistakes, hints: record.hints, burned: record.burned };

    if (saveResult && saveResult.error) {
        showToast('danger', `Gagal simpan online: ${saveResult.error}`, 6000);
    }

    goToAdvmathDashboard(String(savedCount));
}

document.getElementById('advmathSaveRecordModal').addEventListener('shown.bs.modal', function () {
    document.getElementById('advmathPlayerName').focus();
});

document.getElementById('advmathPlayAgainButton').addEventListener('click', () => {
    hideModal('advmathEndModal');
    startAdvmathSoloGame(advmathCount);
});

document.getElementById('advmathEndBackToDashboardButton').addEventListener('click', () => {
    hideModal('advmathEndModal');
    goToAdvmathDashboard(String(advmathCount));
});

/* Tombol X / tombol Esc pada pop up hasil game = sama dengan tombol "Dashboard" */
[['endGameModal', 'endGameBackToDashboardButton'],
 ['knowledgeEndModal', 'knowledgeEndBackToDashboardButton'],
 ['advmathEndModal', 'advmathEndBackToDashboardButton']].forEach(([modalId, dashBtnId]) => {
    const modalEl = document.getElementById(modalId);
    const toDashboard = () => document.getElementById(dashBtnId).click();
    modalEl.querySelector('.end-modal-close').addEventListener('click', toDashboard);
    modalEl.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); toDashboard(); } });
});

