/* =====================================================================================
   ALUR GAME SOLO
===================================================================================== */
document.getElementById('knowledgeOpenSoloButton').addEventListener('click', () => {
    startKnowledgeSoloGame();
});

function prepareKnowledgeGameUI() {
    // Tampilkan overlay countdown SINKRON bareng switchView, supaya tidak ada celah
    // "layar game polos" sempat kelihatan sebelum overlay menutupinya (lihat catatan
    // yang sama di prepareDuelGameUI milik game Perkalian).
    const overlay = document.getElementById('countdownOverlay');
    document.getElementById('countdownNumber').textContent = COUNTDOWN_STEPS[0].text;
    document.getElementById('countdownLabel').textContent = COUNTDOWN_STEPS[0].label;
    overlay.classList.add('is-visible');

    knowledgeGameInProgress = true;
    knowledgeLastSavedRecord = null;
    knowledgeCorrectCount = 0;
    knowledgeScoreTenths = 0;
    knowledgeStreak = 0;
    clearKnowledgeGain();
    knowledgeBurnedCount = 0;
    knowledgeHintsUsed = 0;
    knowledgeSeqIndex = 0;
    knowledgeLastResolved = null;
    renderKnowledgeRecap();

    document.getElementById('knowledgeTimer').textContent = '01:00';
    document.getElementById('knowledgeTimerBarFill').style.width = '100%';
    document.getElementById('knowledgeTimerBarFill').style.backgroundColor = '';
    document.getElementById('knowledgeProgressLabel').textContent = 'Skor: 0,0';
    document.getElementById('knowledgeQuestionText').textContent = '';
    document.querySelectorAll('.knowledge-option-btn').forEach(btn => {
        resetKnowledgeOptionButton(btn, '');
        btn.disabled = true;
    });
    document.getElementById('knowledgeHintButton').disabled = true;

    switchView('knowledgeGame');
}

function startKnowledgeSoloGame() {
    knowledgeDuelState = null;
    knowledgeSequence = generateKnowledgeSequence(KNOWLEDGE_ROUND_BUFFER);
    prepareKnowledgeGameUI();
    document.getElementById('knowledgeDuelOpponentBar').style.display = 'none';
    document.getElementById('knowledgeDuelDisconnectBanner').style.display = 'none';
    runCountdown(() => {
        beginKnowledgeRound(Date.now() + KNOWLEDGE_ROUND_DURATION_MS);
    });
}

function beginKnowledgeRound(endAtMillis) {
    knowledgeRoundEndAt = endAtMillis;
    displayKnowledgeQuestion();
    startKnowledgeRoundTimer();
}

function startKnowledgeRoundTimer() {
    clearInterval(knowledgeRoundTimerInterval);
    knowledgeRoundTimerInterval = setInterval(() => {
        const remainingMs = knowledgeRoundEndAt - Date.now();
        const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
        const minutes = Math.floor(remainingSec / 60).toString().padStart(2, '0');
        const seconds = (remainingSec % 60).toString().padStart(2, '0');
        document.getElementById('knowledgeTimer').textContent = `${minutes}:${seconds}`;
        const pct = Math.max(0, Math.min(100, (remainingMs / KNOWLEDGE_ROUND_DURATION_MS) * 100));
        const fill = document.getElementById('knowledgeTimerBarFill');
        fill.style.width = `${pct}%`;
        fill.style.backgroundColor = remainingSec <= 10 ? 'var(--color-danger)' : '';

        if (remainingMs <= 0) {
            stopKnowledgeRoundTimer();
            if (knowledgeDuelState) {
                endKnowledgeDuelRound();
            } else {
                endKnowledgeSoloRound();
            }
        }
    }, 200);
}

function stopKnowledgeRoundTimer() {
    clearInterval(knowledgeRoundTimerInterval);
    knowledgeRoundTimerInterval = null;
}

/* ---- Tombol opsi: keadaan normal / salah (bisa dibuka penjelasannya) ---- */
function resetKnowledgeOptionButton(btn, text) {
    btn.innerHTML = '';
    btn.className = 'knowledge-option-btn';
    btn.style.display = 'flex';
    btn.removeAttribute('data-state');
    btn.removeAttribute('aria-expanded');
    const label = document.createElement('span');
    label.className = 'kn-opt-text';
    label.textContent = text === undefined || text === null ? '' : text;
    btn.appendChild(label);
}

// Opsi salah: merah + tidak dicoret, teks tetap terbaca, tombol berubah fungsi jadi pembuka penjelasan
function markKnowledgeOptionWrong(btn, idx, q) {
    btn.dataset.state = 'wrong';
    btn.classList.add('is-wrong');
    btn.setAttribute('aria-expanded', 'false');

    const cue = document.createElement('span');
    cue.className = 'kn-opt-cue';
    cue.textContent = 'ⓘ Lihat penjelasan';
    btn.appendChild(cue);

    const explain = document.createElement('span');
    explain.className = 'kn-opt-explain';
    explain.hidden = true;
    explain.textContent = q.explanations[idx] || 'Penjelasan untuk opsi ini belum tersedia.';
    btn.appendChild(explain);
}

// Buka/tutup penjelasan opsi salah. TIDAK menilai jawaban dan TIDAK mengubah opsi lain.
function toggleKnowledgeOptionExplanation(btn) {
    const explain = btn.querySelector('.kn-opt-explain');
    const cue = btn.querySelector('.kn-opt-cue');
    if (!explain || !cue) return;
    const willOpen = explain.hidden;
    explain.hidden = !willOpen;
    btn.classList.toggle('is-open', willOpen);
    btn.setAttribute('aria-expanded', String(willOpen));
    cue.textContent = willOpen ? '▴ Sembunyikan' : 'ⓘ Lihat penjelasan';
}

// Panel "Pembahasan soal sebelumnya": isi dari data soal yang BARU SAJA selesai, disimpan saat soal selesai diproses
function renderKnowledgeRecap() {
    const box = document.getElementById('knowledgeRecap');
    if (!box) return;
    if (!knowledgeLastResolved) {
        box.style.display = 'none';
        return;
    }
    const { q, status } = knowledgeLastResolved;
    document.getElementById('knowledgeRecapStatus').textContent =
        status === 'correct' ? '📖 Pembahasan soal sebelumnya · ✅ Dijawab benar' : '📖 Pembahasan soal sebelumnya · 💀 Soal hangus';
    document.getElementById('knowledgeRecapQuestion').textContent = q.question;
    document.getElementById('knowledgeRecapAnswer').textContent = q.options[q.correctIndex];
    document.getElementById('knowledgeRecapExplanation').textContent =
        q.explanations[q.correctIndex] || 'Penjelasan untuk jawaban ini belum tersedia.';
    box.style.display = 'block';
}

function displayKnowledgeQuestion() {
    if (knowledgeSeqIndex >= knowledgeSequence.length) {
        knowledgeSequence = knowledgeSequence.concat(generateKnowledgeSequence(KNOWLEDGE_ROUND_BUFFER));
    }
    const q = knowledgeSequence[knowledgeSeqIndex];
    knowledgeWrongClicksThisQuestion = 0;
    knowledgeHintUsedThisQuestion = false;

    document.getElementById('knowledgeQuestionText').textContent = q.question;
    const btns = document.querySelectorAll('.knowledge-option-btn');
    btns.forEach((btn, i) => {
        resetKnowledgeOptionButton(btn, q.options[i]);
        btn.disabled = false;
    });
    document.getElementById('knowledgeHintButton').disabled = false;
    renderKnowledgeRecap(); // pembahasan soal TERAKHIR yang selesai (benar atau hangus); kosong di soal nomor 1
    document.getElementById('knowledgeProgressLabel').textContent = `Skor: ${formatKnowledgeScore(tenthsToScore(knowledgeScoreTenths))}`;
}

document.querySelectorAll('.knowledge-option-btn').forEach((btn, idx) => {
    btn.addEventListener('click', () => handleKnowledgeOptionClick(idx));
});

function handleKnowledgeOptionClick(idx) {
    if (!knowledgeGameInProgress) return;
    const btns = Array.from(document.querySelectorAll('.knowledge-option-btn'));
    const btn = btns[idx];
    if (!btn || btn.disabled) return;

    // Opsi yang sudah ditandai salah: tekan lagi = buka/tutup penjelasannya (bukan jawaban baru)
    if (btn.dataset.state === 'wrong') {
        toggleKnowledgeOptionExplanation(btn);
        return;
    }

    const q = knowledgeSequence[knowledgeSeqIndex];

    if (idx === q.correctIndex) {
        btn.classList.add('is-correct');
        playCorrectSound();
        const gained = knowledgePointsForCorrect(knowledgeWrongClicksThisQuestion, knowledgeHintUsedThisQuestion);
        // Streak hanya bertambah bila benar di klik pertama dan tanpa Hint; selain itu streak putus
        const cleanAnswer = knowledgeWrongClicksThisQuestion === 0 && !knowledgeHintUsedThisQuestion;
        knowledgeStreak = cleanAnswer ? knowledgeStreak + 1 : 0;
        const bonus = knowledgeStreakBonusTenths(knowledgeStreak);
        knowledgeScoreTenths += gained + bonus;
        showKnowledgeGain(gained, bonus);
        if (bonus > 0) triggerKnowledgeStreakFx(knowledgeStreak);
        knowledgeCorrectCount++;
        knowledgeLastResolved = { q, status: 'correct' };
        document.getElementById('knowledgeProgressLabel').textContent = `Skor: ${formatKnowledgeScore(tenthsToScore(knowledgeScoreTenths))}`;
        btns.forEach(b => { b.disabled = true; });
        if (knowledgeDuelState) reportKnowledgeDuelProgress();
        setTimeout(advanceKnowledgeQuestion, 450);
        return;
    }

    markKnowledgeOptionWrong(btn, idx, q);
    playWrongSound();
    knowledgeWrongClicksThisQuestion++;
    breakKnowledgeStreak();
    // Sudah 2 opsi salah ditekan: hint tidak relevan lagi, nonaktifkan tombolnya
    if (knowledgeWrongClicksThisQuestion >= 2) document.getElementById('knowledgeHintButton').disabled = true;

    // Hangus bila tidak ada lagi opsi salah yang masih bisa dipilih (tersisa jawaban benar saja)
    const selectableDistractors = btns.filter((b, i) =>
        i !== q.correctIndex && b.dataset.state !== 'wrong' && b.style.display !== 'none').length;
    if (selectableDistractors === 0) {
        knowledgeBurnedCount++;
        knowledgeScoreTenths += KNOWLEDGE_POINTS_BURNED;
        showKnowledgeGain(KNOWLEDGE_POINTS_BURNED, 0);
        knowledgeLastResolved = { q, status: 'burned' };
        document.getElementById('knowledgeProgressLabel').textContent = `Skor: ${formatKnowledgeScore(tenthsToScore(knowledgeScoreTenths))}`;
        btns.forEach(b => { b.disabled = true; });
        if (knowledgeDuelState) reportKnowledgeDuelProgress();
        setTimeout(advanceKnowledgeQuestion, 650);
    }
}

function advanceKnowledgeQuestion() {
    knowledgeSeqIndex++;
    if (knowledgeRoundEndAt - Date.now() > 0 && knowledgeGameInProgress) {
        displayKnowledgeQuestion();
    }
    // Kalau waktu sudah habis tepat di momen ini, interval timer yang akan menangani endRound.
}

document.getElementById('knowledgeHintButton').addEventListener('click', () => {
    if (knowledgeHintUsedThisQuestion || !knowledgeGameInProgress || knowledgeWrongClicksThisQuestion >= 2) return;
    const q = knowledgeSequence[knowledgeSeqIndex];
    const btns = Array.from(document.querySelectorAll('.knowledge-option-btn'));

    // Opsi yang masih "hidup" = bukan jawaban benar, belum ditandai salah, belum disembunyikan
    const viableDistractorIdx = btns
        .map((b, i) => i)
        .filter(i => i !== q.correctIndex && btns[i].dataset.state !== 'wrong' && btns[i].style.display !== 'none');

    if (viableDistractorIdx.length === 0) return; // sudah tersisa 1 opsi (benar) saja, hint tak relevan lagi

    knowledgeHintUsedThisQuestion = true;
    knowledgeHintsUsed++;
    breakKnowledgeStreak(); // memakai Hint memutus streak
    document.getElementById('knowledgeHintButton').disabled = true;

    // Dari distraktor yang masih "hidup", sisakan 1 secara acak, sembunyikan sisanya.
    // Opsi yang sudah ditandai salah TIDAK disembunyikan, supaya penjelasannya tetap bisa dibuka.
    const keepIndex = viableDistractorIdx[Math.floor(Math.random() * viableDistractorIdx.length)];
    viableDistractorIdx.forEach(i => {
        if (i !== keepIndex) btns[i].style.display = 'none';
    });

});

/* ---- Insight peringkat (analog buildRankInsight milik game Perkalian, tapi "lebih tinggi = lebih baik") ---- */
function buildKnowledgeRankInsight(score, hints, burned, records) {
    const myTenths = Math.round(score * 10);
    const sorted = sortKnowledgeSoloRecords(records);
    const better = sorted.filter(r => {
        const t = knowledgeScoreTenthsOf(r);
        return t > myTenths || (t === myTenths && (r.hints < hints || (r.hints === hints && r.burned <= burned)));
    }).length;
    const rank = better + 1;
    const qualifies = rank <= MAX_KNOWLEDGE_LEADERBOARD;
    const gapText = (tenths) => formatKnowledgeScore(Math.max(1, tenths) / 10);

    if (sorted.length === 0) {
        return {
            rank: 1, qualifies: true, tone: 'top',
            headline: '🏆 Kamu pemain pertama di sini!',
            details: [{ icon: '💾', text: 'Simpan skormu untuk jadi peringkat 1 di papan peringkat.' }]
        };
    }

    const top = sorted[0];
    const details = [];

    if (rank === 1) {
        const gap = myTenths - knowledgeScoreTenthsOf(top);
        details.push({ icon: '⚡', text: gap > 0 ? `${gapText(gap)} poin lebih tinggi dari rekor sebelumnya.` : `Skor sama, tapi hint/hangus-mu lebih sedikit.` });
        return { rank, qualifies, tone: 'top', headline: '👑 Rekor baru! Kamu peringkat 1', details };
    }

    if (rank <= 3) {
        const gapToTop = knowledgeScoreTenthsOf(top) - myTenths;
        details.push({ icon: '🎯', text: `${gapText(gapToTop)} poin lagi untuk menyamai peringkat 1.` });
        return { rank, qualifies, tone: 'top', headline: `${rank === 2 ? '🥈' : '🥉'} Kamu masuk 3 besar! Peringkat ${rank}`, details };
    }

    if (qualifies) {
        const third = sorted[2];
        details.push({ icon: '🥉', text: `${gapText(knowledgeScoreTenthsOf(third) - myTenths + 1)} poin lagi untuk masuk 3 besar.` });
        return { rank, qualifies, tone: 'ok', headline: `🎯 Kamu masuk papan peringkat! Peringkat ${rank}`, details };
    }

    const last = sorted[MAX_KNOWLEDGE_LEADERBOARD - 1];
    details.push({ icon: '📉', text: `${gapText(knowledgeScoreTenthsOf(last) - myTenths + 1)} poin lagi untuk masuk papan peringkat.` });
    return { rank, qualifies, tone: 'miss', headline: '💪 Belum masuk papan peringkat, ayo coba lagi!', details };
}

function renderKnowledgeRankInsight(insight) {
    const box = document.getElementById('knowledgeRankInsight');
    box.className = `rank-insight is-${insight.tone}`;
    document.getElementById('knowledgeRankInsightHeadline').textContent = insight.headline;
    const list = document.getElementById('knowledgeRankInsightDetails');
    list.innerHTML = '';
    insight.details.forEach(detail => {
        const li = document.createElement('li');
        li.dataset.icon = detail.icon;
        li.textContent = detail.text;
        list.appendChild(li);
    });
    box.style.display = 'block';
}

async function endKnowledgeSoloRound() {
    knowledgeGameInProgress = false;
    document.querySelectorAll('.knowledge-option-btn').forEach(b => { b.disabled = true; });
    document.getElementById('knowledgeHintButton').disabled = true;

    const finalScore = tenthsToScore(knowledgeScoreTenths);
    document.getElementById('knowledgeFinalScore').textContent = formatKnowledgeScore(finalScore);
    document.getElementById('knowledgeFinalCorrect').textContent = knowledgeCorrectCount.toString();
    document.getElementById('knowledgeFinalHints').textContent = knowledgeHintsUsed.toString();
    document.getElementById('knowledgeFinalBurned').textContent = knowledgeBurnedCount.toString();

    const records = await getKnowledgeSoloRecords();
    const insight = buildKnowledgeRankInsight(finalScore, knowledgeHintsUsed, knowledgeBurnedCount, records);
    renderKnowledgeRankInsight(insight);
    document.getElementById('knowledgeSaveScoreButton').style.display = insight.qualifies ? 'inline-block' : 'none';

    showModal('knowledgeEndModal');
    launchConfetti();
    playFinishSounds(insight.qualifies);
}

document.getElementById('knowledgeSaveScoreButton').addEventListener('click', async () => {
    hideModal('knowledgeEndModal');
    await waitForModalHidden('knowledgeEndModal');
    showModal('knowledgeSaveRecordModal');
});

document.getElementById('knowledgeButtonSavePlayerRecord').addEventListener('click', saveKnowledgePlayerRecord);

async function saveKnowledgePlayerRecord() {
    const nameInput = document.getElementById('knowledgePlayerName');
    const playerName = nameInput.value.trim();
    if (!playerName) {
        showToast('danger', 'Isi dulu namamu ya!');
        nameInput.focus();
        return;
    }

    const saveBtn = document.getElementById('knowledgeButtonSavePlayerRecord');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Menyimpan...';

    let saveResult = null;
    try {
        saveResult = await saveKnowledgeSoloRecord({
            name: playerName,
            score: tenthsToScore(knowledgeScoreTenths),
            correct: knowledgeCorrectCount,
            hints: knowledgeHintsUsed,
            burned: knowledgeBurnedCount,
            avatar: knowledgeSelectedAvatar
        });
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Simpan';
    }

    hideModal('knowledgeSaveRecordModal');
    nameInput.value = '';
    knowledgeLastSavedRecord = { name: playerName, score: tenthsToScore(knowledgeScoreTenths), hints: knowledgeHintsUsed, burned: knowledgeBurnedCount };

    if (saveResult && saveResult.error) {
        showToast('danger', `Gagal simpan online: ${saveResult.error}`, 6000);
    }

    goToKnowledgeDashboard('solo');
}

document.getElementById('knowledgeSaveRecordModal').addEventListener('shown.bs.modal', function () {
    document.getElementById('knowledgePlayerName').focus();
});

document.getElementById('knowledgePlayAgainButton').addEventListener('click', () => {
    hideModal('knowledgeEndModal');
    startKnowledgeSoloGame();
});

document.getElementById('knowledgeEndBackToDashboardButton').addEventListener('click', () => {
    hideModal('knowledgeEndModal');
    goToKnowledgeDashboard('solo');
});

