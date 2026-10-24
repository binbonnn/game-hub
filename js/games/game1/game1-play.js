/* =====================================================================
   ALUR GAME
===================================================================== */
const COUNTDOWN_STEPS = [
    { text: '3', label: 'Bersiap-siap...' },
    { text: '2', label: 'Fokus...' },
    { text: '1', label: 'Konsentrasi!' },
    { text: 'Mulai!', label: 'Ayo jawab secepat mungkin!' }
];

function startGameWithCount(count) {
    currentQuestionCount = count;
    currentQuestionIndex = 0;
    correctAnswers = 0;
    mistakes = 0;
    elapsedTime = 0;
    gameInProgress = true;
    lastSavedRecord = null;
    questions = generateUniqueQuestions(count);

    const stopwatchEl = document.getElementById('stopwatch');
    stopwatchEl.textContent = '00:00';
    stopwatchEl.style.backgroundColor = 'white';

    // Reset UI, tapi keypad & soal masih disembunyikan/nonaktif sampai countdown selesai
    answerInput.value = '';
    answerInput.disabled = true;
    document.querySelectorAll('.buttonKeypad, .buttonDelete, .buttonStart').forEach(btn => {
        btn.disabled = true;
    });
    document.querySelector('.buttonStart').textContent = 'Jawab';
    document.getElementById('question').innerText = '';
    document.getElementById('buttonHint').style.display = 'none';
    document.getElementById('progressLabel').textContent = `Soal 1 dari ${count}`;
    document.getElementById('progressBarFill').style.width = '0%';

    switchView('game');
    runCountdown(() => {
        answerInput.disabled = false;
        document.querySelectorAll('.buttonKeypad, .buttonDelete, .buttonStart').forEach(btn => {
            btn.disabled = false;
        });
        displayQuestion();
        startTime = new Date().getTime();
        startStopwatch();
        answerInput.focus();
    });
}

function runCountdown(onComplete) {
    const overlay = document.getElementById('countdownOverlay');
    const numberEl = document.getElementById('countdownNumber');
    const labelEl = document.getElementById('countdownLabel');
    const myToken = ++countdownRunToken;
    let stepIndex = 0;

    overlay.classList.add('is-visible');

    function showStep() {
        if (myToken !== countdownRunToken) return; // dibatalkan oleh countdown/navigasi lain

        const step = COUNTDOWN_STEPS[stepIndex];
        numberEl.textContent = step.text;
        labelEl.textContent = step.label;
        playCountdownTick(stepIndex);

        // Re-trigger animasi tiap langkah dengan memaksa reflow
        numberEl.classList.remove('countdown-pop');
        labelEl.style.animation = 'none';
        void numberEl.offsetWidth;
        numberEl.classList.add('countdown-pop');
        labelEl.style.animation = '';

        stepIndex++;
        if (stepIndex < COUNTDOWN_STEPS.length) {
            setTimeout(showStep, 800);
        } else {
            setTimeout(() => {
                if (myToken !== countdownRunToken) return;
                overlay.classList.remove('is-visible');
                onComplete();
            }, 650);
        }
    }

    showStep();
}

function updateProgress() {
    document.getElementById('progressLabel').textContent =
        `Soal ${Math.min(currentQuestionIndex + 1, currentQuestionCount)} dari ${currentQuestionCount}`;
    const pct = (currentQuestionIndex / currentQuestionCount) * 100;
    document.getElementById('progressBarFill').style.width = `${pct}%`;
}

function displayQuestion() {
    const [a, b] = questions[currentQuestionIndex];
    document.getElementById('question').innerText = `${a} x ${b} = ...`;
    document.getElementById('buttonHint').style.display = 'inline-flex';
    updateProgress();
}

document.getElementById('buttonHint').addEventListener('click', function () {
    const grid = document.getElementById('multiplicationRow');
    grid.innerHTML = '';

    for (let i = 1; i <= 10; i++) {
        const cell = document.createElement('div');
        cell.className = 'multiplication-cell';

        let lines = `<div class="multiplication-title">Tabel ${i}</div>`;
        for (let j = 1; j <= 10; j++) {
            lines += `<div class="multiplication-line">${i} x ${j} = <strong>${i * j}</strong></div>`;
        }
        cell.innerHTML = lines;
        grid.appendChild(cell);
    }

    showModal('hintModal');
});

function checkAnswer() {
    if (!answerInput.value.trim()) { // jika input kosong
        showToast('danger', 'Isi dulu jawabannya ya! 😉');
        answerInput.focus();
        return;
    }

    const userAnswer = parseInt(answerInput.value, 10);
    const [a, b] = questions[currentQuestionIndex];

    if (userAnswer !== a * b) {
        mistakes++;
        playWrongSound();
        answerInput.classList.add('wiggle-animation');
        answerInput.value = '';
        setTimeout(() => answerInput.classList.remove('wiggle-animation'), 400);
    } else {
        playCorrectSound();
        correctAnswers++;
        currentQuestionIndex++;
        answerInput.value = '';

        if (correctAnswers === currentQuestionCount - 1) {
            document.querySelector('.buttonStart').textContent = 'Selesai';
        }

        if (correctAnswers === currentQuestionCount) {
            if (duelState) {
                endDuelGame();
            } else {
                endGame();
            }
        } else {
            displayQuestion();
            if (duelState) reportDuelProgress();
        }
    }
}

// Selisih detik yang dibutuhkan untuk MENGALAHKAN rekor tertentu (minimal 1 detik lebih cepat)
function secondsToBeat(timeTaken, record) {
    return Math.max(1, timeTaken - record.time + 1);
}

function buildRankInsight(timeTaken, mistakeCount, records) {
    const sorted = sortRecords(records);
    const beatenBy = sorted.filter(r => r.time < timeTaken || (r.time === timeTaken && r.mistakes <= mistakeCount)).length;
    const rank = beatenBy + 1;
    const qualifies = rank <= MAX_LEADERBOARD_RECORDS;
    const details = [];
    const top = sorted[0];
    const third = sorted[2];
    const lastPlace = sorted[MAX_LEADERBOARD_RECORDS - 1];

    if (sorted.length === 0) {
        return {
            rank: 1, qualifies: true, tone: 'top',
            headline: '🏆 Kamu pemain pertama di level ini!',
            details: [{ icon: '💾', text: 'Simpan skormu untuk jadi peringkat 1 di papan peringkat.' }]
        };
    }

    if (rank === 1) {
        const gap = top.time - timeTaken;
        if (gap > 0) {
            details.push({ icon: '⚡', text: `${gap} detik lebih cepat dari rekor sebelumnya (${top.name}).` });
        } else {
            details.push({ icon: '🎯', text: `Waktu sama dengan rekor sebelumnya, tapi kesalahanmu lebih sedikit.` });
        }
        return { rank, qualifies, tone: 'top', headline: '👑 Rekor baru! Kamu peringkat 1', details };
    }

    const gapToTop = timeTaken - top.time;

    if (rank <= 3) {
        const above = sorted[rank - 2];
        let topText;
        if (gapToTop > 0) {
            topText = `${gapToTop} detik lebih lambat dari peringkat 1.`;
        } else if (top.mistakes < mistakeCount) {
            topText = 'Waktu sama dengan peringkat 1, tapi kalah di jumlah kesalahan.';
        } else {
            topText = 'Seri dengan peringkat 1. Rekor yang lebih dulu tercatat tetap di atas.';
        }
        details.push({ icon: '🐢', text: topText });
        details.push({ icon: '🚀', text: `${secondsToBeat(timeTaken, above)} detik lagi untuk naik ke peringkat ${rank - 1}.` });
        return { rank, qualifies, tone: 'top', headline: `${PODIUM_MEDALS[rank]} Kamu masuk 3 besar! Peringkat ${rank}`, details };
    }

    if (qualifies) {
        details.push({ icon: '🥉', text: `${secondsToBeat(timeTaken, third)} detik lagi untuk masuk 3 besar.` });
        details.push({ icon: '🐢', text: `${gapToTop} detik lebih lambat dari peringkat 1.` });
        return { rank, qualifies, tone: 'ok', headline: `🎯 Kamu masuk papan peringkat! Peringkat ${rank}`, details };
    }

    details.push({ icon: '📉', text: `${timeTaken - lastPlace.time} detik lebih lambat dari peringkat ${MAX_LEADERBOARD_RECORDS}.` });
    details.push({ icon: '🎯', text: `${secondsToBeat(timeTaken, lastPlace)} detik lagi untuk masuk papan peringkat.` });
    details.push({ icon: '🥉', text: `${secondsToBeat(timeTaken, third)} detik lagi untuk masuk 3 besar.` });
    return { rank, qualifies, tone: 'miss', headline: '💪 Belum masuk papan peringkat, ayo coba lagi!', details };
}

function renderRankInsight(insight) {
    const box = document.getElementById('rankInsight');
    box.className = `rank-insight is-${insight.tone}`;
    document.getElementById('rankInsightHeadline').textContent = insight.headline;

    const list = document.getElementById('rankInsightDetails');
    list.innerHTML = '';
    insight.details.forEach(detail => {
        const li = document.createElement('li');
        li.dataset.icon = detail.icon;
        li.textContent = detail.text; // textContent: aman dari XSS (nama pemain lain ikut tampil)
        list.appendChild(li);
    });
    box.style.display = 'block';
}

async function endGame() {
    gameInProgress = false;
    stopStopwatch();
    updateProgress();

    finalTimeSeconds = Math.floor((Date.now() - startTime) / 1000);

    const currentBackgroundColor = document.getElementById('stopwatch').style.backgroundColor;
    safeSetLocalStorage('lastGameBackgroundColor', currentBackgroundColor);

    document.getElementById('finalTime').textContent = formatTime(finalTimeSeconds);
    document.getElementById('mistakesCount').textContent = mistakes.toString();

    // Nonaktifkan keypad
    answerInput.disabled = true;
    document.querySelectorAll('.buttonKeypad, .buttonDelete, .buttonStart').forEach(btn => {
        btn.disabled = true;
    });
    document.getElementById('question').innerText = '';
    document.getElementById('buttonHint').style.display = 'none';

    const playerRecords = await getRecordsForCount(currentQuestionCount);
    const insight = buildRankInsight(finalTimeSeconds, mistakes, playerRecords);
    renderRankInsight(insight);

    // Skor yang tidak akan masuk papan peringkat tidak perlu ditawarkan untuk disimpan
    document.getElementById('saveScoreButton').style.display = insight.qualifies ? 'inline-block' : 'none';

    showModal('endGameModal');
    launchConfetti();
    playFinishSounds(insight.qualifies);
}

