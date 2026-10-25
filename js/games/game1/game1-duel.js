/* =====================================================================
   DUEL 1v1 (room code, realtime lewat Firestore)
===================================================================== */
// Firestore TIDAK mendukung array bersarang (array di dalam array).
// questions lokal berbentuk [[a,b], [a,b], ...] harus diubah jadi [{a,b}, ...] sebelum
// ditulis ke Firestore, dan dikembalikan lagi ke bentuk [[a,b], ...] saat dibaca.
function questionsToFirestoreArray(qs) {
    return qs.map(pair => ({ a: pair[0], b: pair[1] }));
}

function questionsFromFirestoreArray(qs) {
    return qs.map(q => [q.a, q.b]);
}

function duelDocRef(roomCode) {
    return firestoreDb.collection('duels').doc(roomCode);
}

function generateRoomCode() {
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += DUEL_CODE_CHARS[Math.floor(Math.random() * DUEL_CODE_CHARS.length)];
    }
    return code;
}

function requireFirebaseForDuel() {
    if (firebaseReady) return true;
    showToast('danger', 'Duel butuh koneksi ke server. Cek dulu firebase-config.js sudah terisi & Firestore Rules sudah di-publish.', 6000);
    return false;
}

document.getElementById('openDuelModalButton').addEventListener('click', () => {
    if (!requireFirebaseForDuel()) return;
    showModal('duelModal');
});

document.getElementById('duelCreateRoomButton').addEventListener('click', async () => {
    hideModal('duelModal');
    await waitForModalHidden('duelModal');
    showModal('duelCreateModal');
});

document.getElementById('duelJoinRoomButton').addEventListener('click', async () => {
    hideModal('duelModal');
    await waitForModalHidden('duelModal');
    showModal('duelJoinModal');
});

buildAvatarPicker('duelCreateAvatarPicker', (avatar) => { duelCreateSelectedAvatar = avatar; });
buildAvatarPicker('duelJoinAvatarPicker', (avatar) => { duelJoinSelectedAvatar = avatar; });

document.getElementById('duelJoinCode').addEventListener('input', function () {
    this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
});

/* ---- Buat Room ---- */
document.querySelectorAll('#duelCreateModal .count-option-button').forEach(btn => {
    btn.addEventListener('click', () => createDuelRoom(parseInt(btn.dataset.count, 10)));
});

async function createDuelRoom(count) {
    const nameInput = document.getElementById('duelCreateName');
    const name = nameInput.value.trim();
    if (!name) {
        showToast('danger', 'Nama kamu masih kosong, isi dulu ya');
        nameInput.focus();
        return;
    }

    cleanupDuel();
    hideModal('duelCreateModal');

    const questions = generateUniqueQuestions(count);
    let roomCode = null;

    try {
        for (let attempt = 0; attempt < 6 && !roomCode; attempt++) {
            const candidate = generateRoomCode();
            const snap = await duelDocRef(candidate).get();
            if (!snap.exists) roomCode = candidate;
        }
        if (!roomCode) throw new Error('kode-habis');

        await duelDocRef(roomCode).set({
            count: count,
            questions: questionsToFirestoreArray(questions),
            status: 'waiting',
            createdAt: Date.now(),
            startAtMillis: null,
            winner: null,
            rematch: null,
            host: { name: name, avatar: duelCreateSelectedAvatar, progress: 0, mistakes: 0, time: null, finishedAt: null, lastSeen: Date.now() },
            guest: null
        });
    } catch (e) {
        showToast('danger', `Room gagal dibuat: ${e.code || e.message}`, 5000);
        return;
    }

    duelState = { roomCode, role: 'host', count, questions, lastStartAtMillis: null, lastRematchUpdatedAt: null, resultShown: false };
    document.getElementById('duelRoomCodeDisplay').textContent = roomCode;
    await waitForModalHidden('duelCreateModal');
    showModal('duelWaitingModal');
    listenToDuelRoom(roomCode);
    startDuelHeartbeat();
}

document.getElementById('duelCopyCodeButton').addEventListener('click', () => {
    const code = document.getElementById('duelRoomCodeDisplay').textContent;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(() => showToast('success', 'Kode ke-copy')).catch(() => {});
    }
});

document.getElementById('duelCancelWaitingButton').addEventListener('click', async () => {
    hideModal('duelWaitingModal');
    await abandonDuel();
});

/* ---- Gabung Room ---- */
document.getElementById('duelJoinSubmitButton').addEventListener('click', joinDuelRoom);

async function joinDuelRoom() {
    const codeInput = document.getElementById('duelJoinCode');
    const nameInput = document.getElementById('duelJoinName');
    const code = codeInput.value.trim().toUpperCase();
    const name = nameInput.value.trim();

    if (code.length !== 4) {
        showToast('danger', 'Kode room itu 4 karakter ya');
        codeInput.focus();
        return;
    }
    if (!name) {
        showToast('danger', 'Nama kamu masih kosong, isi dulu ya');
        nameInput.focus();
        return;
    }

    const submitBtn = document.getElementById('duelJoinSubmitButton');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Menghubungkan...';

    try {
        const ref = duelDocRef(code);
        const snap = await ref.get();
        if (!snap.exists) {
            showToast('danger', 'Kode room-nya nggak ketemu. Cek lagi ya');
            return;
        }
        const room = snap.data();
        if (room.status !== 'waiting' || room.guest) {
            showToast('danger', 'Room ini udah penuh atau lagi main');
            return;
        }

        const startAtMillis = Date.now() + DUEL_START_BUFFER_MS;
        await ref.update({
            guest: { name: name, avatar: duelJoinSelectedAvatar, progress: 0, mistakes: 0, time: null, finishedAt: null, lastSeen: Date.now() },
            status: 'countdown',
            startAtMillis: startAtMillis
        });

        cleanupDuel();
        duelState = { roomCode: code, role: 'guest', count: room.count, questions: questionsFromFirestoreArray(room.questions), lastStartAtMillis: null, lastRematchUpdatedAt: null, resultShown: false };
        codeInput.value = '';
        nameInput.value = '';
        hideModal('duelJoinModal');
        listenToDuelRoom(code);
        startDuelHeartbeat();
    } catch (e) {
        showToast('danger', `Gagal join room: ${e.code || e.message}`, 5000);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Gabung';
    }
}

/* ---- Listener realtime: satu fungsi ini yang menggerakkan seluruh alur duel ---- */
function listenToDuelRoom(roomCode) {
    if (!duelState) return;
    duelState.unsubscribe = duelDocRef(roomCode).onSnapshot(
        snap => {
            if (!snap.exists) {
                if (!duelState) return;
                showToast('danger', 'Room-nya udah nggak ada', 4000);
                cleanupDuel();
                goToDashboard();
                return;
            }
            handleDuelRoomUpdate(snap.data());
        },
        err => console.warn('[Duel] listener error', err)
    );
}

async function handleDuelRoomUpdate(room) {
    if (!duelState) return;

    const opponentRole = duelState.role === 'host' ? 'guest' : 'host';
    const opponent = room[opponentRole];

    if (room.status === 'abandoned') {
        showToast('danger', 'Lawanmu keluar dari duel', 4000);
        cleanupDuel();
        goToDashboard();
        return;
    }

    // Bandingkan startAtMillis (bukan boolean sepihak) supaya KEDUA sisi mendeteksi ronde baru
    // dengan cara yang sama, baik yang menekan "Main Lagi" maupun yang tidak.
    if (room.status === 'countdown' && room.startAtMillis !== duelState.lastStartAtMillis) {
        duelState.lastStartAtMillis = room.startAtMillis;
        duelState.lastRematchUpdatedAt = null;
        duelState.resultShown = false;
        duelState.questions = questionsFromFirestoreArray(room.questions);
        duelState.opponentName = opponent ? opponent.name : 'Lawan';
        duelState.opponentAvatar = opponent ? opponent.avatar : null;
        // Tutup modal apa pun yang mungkin masih terbuka di sisi ini (mis. sisi yang TIDAK
        // menekan "Main Lagi" tetap punya modal hasil pertandingan sebelumnya terbuka)
        hideModal('duelWaitingModal');
        hideModal('duelResultModal');
        hideModal('duelRematchWaitingModal');
        hideModal('duelRematchRequestModal');
        beginDuelCountdown(room.startAtMillis);
    }

    if ((room.status === 'playing' || room.status === 'countdown') && opponent) {
        updateDuelOpponentUI(opponent);
    }

    if (room.status === 'finished' && !duelState.resultShown) {
        duelState.resultShown = true;
        if (gameInProgress) { // saya diinterupsi sebelum sempat menjawab semua soal
            gameInProgress = false;
            stopStopwatch();
            answerInput.disabled = true;
            document.querySelectorAll('.buttonKeypad, .buttonDelete, .buttonStart').forEach(btn => { btn.disabled = true; });
        }
        showDuelResult(room);
    }

    // Ajakan main lagi: minta persetujuan lawan dulu sebelum benar-benar mengulang.
    // Dibandingkan lewat updatedAt (bukan boolean) supaya permintaan & penolakan berikutnya
    // tetap terdeteksi meski isi field-nya sempat sama.
    if (room.rematch && room.rematch.updatedAt !== duelState.lastRematchUpdatedAt) {
        duelState.lastRematchUpdatedAt = room.rematch.updatedAt;
        const iAmRequester = room.rematch.requestedBy === duelState.role;

        if (room.rematch.status === 'pending') {
            if (iAmRequester) {
                showModal('duelRematchWaitingModal');
            } else {
                document.getElementById('duelRematchRequestText').textContent =
                    `${opponent ? opponent.name : 'Lawan'} ngajak rematch. Mau?`;
                showModal('duelRematchRequestModal');
            }
        } else if (room.rematch.status === 'declined') {
            hideModal('duelRematchWaitingModal');
            hideModal('duelRematchRequestModal');
            if (iAmRequester) {
                showToast('danger', 'Lawanmu skip rematch', 4000);
                await waitForModalHidden('duelRematchWaitingModal');
                showModal('duelResultModal');
                duelDocRef(duelState.roomCode).update({ rematch: null }).catch(() => {});
            }
        }
    }

    checkDuelOpponentHeartbeat(opponent, room.status);
}

/* ---- Countdown tersinkron: dua HP mulai hitung mundur pada waktu yang (kurang lebih) sama ---- */
function beginDuelCountdown(startAtMillis) {
    const countdownDurationMs = COUNTDOWN_STEPS.length * 800 + 650; // total waktu runCountdown sampai onComplete
    const waitMs = Math.max(0, (startAtMillis - Date.now()) - countdownDurationMs);

    prepareDuelGameUI();

    setTimeout(() => {
        if (!duelState) return;
        runCountdown(beginDuelPlaying);
    }, waitMs);

    duelDocRef(duelState.roomCode).update({ status: 'playing' }).catch(() => {});
}

function prepareDuelGameUI() {
    // Tampilkan overlay countdown DI SINI, sinkron bareng switchView('game') di bawah.
    // Kalau overlay baru muncul lewat runCountdown() (yang dijadwalkan via setTimeout terpisah),
    // browser sempat merender satu frame "layar game polos" tanpa overlay lebih dulu -> kelihatan kedip.
    const overlay = document.getElementById('countdownOverlay');
    document.getElementById('countdownNumber').textContent = COUNTDOWN_STEPS[0].text;
    document.getElementById('countdownLabel').textContent = COUNTDOWN_STEPS[0].label;
    overlay.classList.add('is-visible');

    currentQuestionCount = duelState.count;
    currentQuestionIndex = 0;
    correctAnswers = 0;
    mistakes = 0;
    elapsedTime = 0;
    gameInProgress = true;
    lastSavedRecord = null;
    questions = duelState.questions;

    const stopwatchEl = document.getElementById('stopwatch');
    stopwatchEl.textContent = '00:00';
    stopwatchEl.style.backgroundColor = 'white';

    answerInput.value = '';
    answerInput.disabled = true;
    document.querySelectorAll('.buttonKeypad, .buttonDelete, .buttonStart').forEach(btn => { btn.disabled = true; });
    document.querySelector('.buttonStart').textContent = 'Jawab';
    document.getElementById('question').innerText = '';
    document.getElementById('buttonHint').style.display = 'none';
    document.getElementById('progressLabel').textContent = `Soal 1 dari ${duelState.count}`;
    document.getElementById('progressBarFill').style.width = '0%';

    const oppBar = document.getElementById('duelOpponentBar');
    oppBar.style.display = 'flex';
    document.getElementById('duelOpponentAvatar').textContent = avatarGlyph(duelState.opponentAvatar);
    document.getElementById('duelOpponentName').textContent = duelState.opponentName || 'Lawan';
    document.getElementById('duelOpponentFill').style.width = '0%';
    document.getElementById('duelOpponentCount').textContent = `0/${duelState.count}`;
    document.getElementById('duelDisconnectBanner').style.display = 'none';

    switchView('game');
}

function beginDuelPlaying() {
    if (!duelState) return;
    answerInput.disabled = false;
    document.querySelectorAll('.buttonKeypad, .buttonDelete, .buttonStart').forEach(btn => { btn.disabled = false; });
    displayQuestion();
    startTime = Date.now();
    startStopwatch();
    answerInput.focus();
}

function updateDuelOpponentUI(opponent) {
    if (!duelState) return;
    const fill = document.getElementById('duelOpponentFill');
    const countEl = document.getElementById('duelOpponentCount');
    if (!fill || !countEl) return;
    const pct = Math.min(100, (opponent.progress / duelState.count) * 100);
    fill.style.width = `${pct}%`;
    countEl.textContent = `${opponent.progress}/${duelState.count}`;
}

function reportDuelProgress() {
    if (!duelState) return;
    duelDocRef(duelState.roomCode).update({
        [`${duelState.role}.progress`]: correctAnswers,
        [`${duelState.role}.mistakes`]: mistakes,
        [`${duelState.role}.lastSeen`]: Date.now()
    }).catch(e => console.warn('[Duel] gagal kirim progres', e));
}

/* ---- Selesai: transaksi memastikan hanya yang PERTAMA selesai jadi pemenang ---- */
async function endDuelGame() {
    gameInProgress = false;
    stopStopwatch();
    updateProgress();
    finalTimeSeconds = Math.floor((Date.now() - startTime) / 1000);

    answerInput.disabled = true;
    document.querySelectorAll('.buttonKeypad, .buttonDelete, .buttonStart').forEach(btn => { btn.disabled = true; });
    document.getElementById('question').innerText = '';
    document.getElementById('buttonHint').style.display = 'none';

    const myRole = duelState.role;
    const roomRef = duelDocRef(duelState.roomCode);

    try {
        await firestoreDb.runTransaction(async (tx) => {
            const snap = await tx.get(roomRef);
            if (!snap.exists) return;
            const room = snap.data();

            const update = {
                [`${myRole}.progress`]: correctAnswers,
                [`${myRole}.mistakes`]: mistakes,
                [`${myRole}.time`]: finalTimeSeconds,
                [`${myRole}.finishedAt`]: Date.now()
            };

            if (room.status !== 'finished') {
                update.status = 'finished';
                update.winner = myRole;
            }

            tx.update(roomRef, update);
        });
    } catch (e) {
        showToast('danger', `Hasil duel gagal terkirim: ${e.code || e.message}`, 5000);
    }
    // Modal hasil akan muncul lewat listener (handleDuelRoomUpdate) begitu status 'finished' diterima,
    // supaya kedua pemain melihat hasil pada saat yang (hampir) bersamaan.
}

function showDuelResult(room) {
    stopDuelHeartbeat();
    const amIWinner = room.winner === duelState.role;
    const me = duelState.role === 'host' ? room.host : room.guest;
    const opponent = duelState.role === 'host' ? room.guest : room.host;

    const banner = document.getElementById('duelWinnerBanner');
    banner.textContent = amIWinner ? '🏆 GG, kamu menang' : `😅 ${opponent ? opponent.name : 'Lawan'} Menang`;
    banner.className = `duel-winner-banner ${amIWinner ? 'is-win' : 'is-lose'}`;

    const renderPlayer = (label, player, isWinnerSide) => {
        const finished = !!(player && player.finishedAt);
        const statLine = finished
            ? `${formatTime(player.time)} · ${formatMistakes(player.mistakes)}`
            : `Stop di soal ${player ? player.progress : 0}/${room.count}`;
        return `
            <div class="duel-result-card ${isWinnerSide ? 'is-winner' : ''}">
                <div class="duel-result-avatar">${avatarGlyph(player ? player.avatar : null)}</div>
                <div class="duel-result-name">${escapeHtml(player ? player.name : '—')}</div>
                <div class="duel-result-label">${label}</div>
                <div class="duel-result-stat">${statLine}</div>
            </div>
        `;
    };

    document.getElementById('duelResultGrid').innerHTML =
        renderPlayer('Kamu', me, amIWinner) + renderPlayer('Lawan', opponent, !amIWinner);

    showModal('duelResultModal');
    launchConfetti();
    playFinishSounds(amIWinner);
}

// Tombol "Main Lagi": hanya MENGAJUKAN permintaan, belum langsung mengulang duelnya.
// Duel baru benar-benar dimulai lagi setelah lawan menekan "Setuju" (lihat duelRematchAcceptButton).
document.getElementById('duelRematchButton').addEventListener('click', async () => {
    if (!duelState) return;
    hideModal('duelResultModal');
    await waitForModalHidden('duelResultModal');
    try {
        await duelDocRef(duelState.roomCode).update({
            rematch: { requestedBy: duelState.role, status: 'pending', updatedAt: Date.now() }
        });
        showModal('duelRematchWaitingModal');
    } catch (e) {
        showToast('danger', `Ajakan rematch gagal terkirim: ${e.code || e.message}`, 5000);
        showModal('duelResultModal');
    }
});

document.getElementById('duelRematchCancelButton').addEventListener('click', async () => {
    hideModal('duelRematchWaitingModal');
    if (duelState) {
        try {
            await duelDocRef(duelState.roomCode).update({ rematch: null });
        } catch (e) { console.warn('[Duel G1] gagal mereset permintaan rematch', e);
            // room mungkin sudah berubah/hilang, aman diabaikan
        }
    }
    await waitForModalHidden('duelRematchWaitingModal');
    showModal('duelResultModal');
});

document.getElementById('duelRematchAcceptButton').addEventListener('click', async () => {
    if (!duelState) return;
    hideModal('duelRematchRequestModal');

    const newQuestions = generateUniqueQuestions(duelState.count);
    duelState.questions = newQuestions;

    try {
        await duelDocRef(duelState.roomCode).update({
            questions: questionsToFirestoreArray(newQuestions),
            status: 'countdown',
            startAtMillis: Date.now() + DUEL_START_BUFFER_MS,
            winner: null,
            rematch: null,
            'host.progress': 0, 'host.mistakes': 0, 'host.time': null, 'host.finishedAt': null, 'host.lastSeen': Date.now(),
            'guest.progress': 0, 'guest.mistakes': 0, 'guest.time': null, 'guest.finishedAt': null, 'guest.lastSeen': Date.now()
        });
    } catch (e) {
        showToast('danger', `Duel gagal dimulai ulang: ${e.code || e.message}`, 5000);
    }
});

document.getElementById('duelRematchDeclineButton').addEventListener('click', async () => {
    if (!duelState) return;
    hideModal('duelRematchRequestModal');
    await waitForModalHidden('duelRematchRequestModal');
    showModal('duelResultModal');

    const requesterRole = duelState.role === 'host' ? 'guest' : 'host';
    try {
        await duelDocRef(duelState.roomCode).update({
            rematch: { requestedBy: requesterRole, status: 'declined', updatedAt: Date.now() }
        });
    } catch (e) { console.warn('[Duel G1] gagal menolak rematch', e);
        // room mungkin sudah berubah/hilang, aman diabaikan
    }
});

document.getElementById('duelResultDashboardButton').addEventListener('click', () => {
    hideModal('duelResultModal');
    cleanupDuel();
    goToDashboard();
});

/* ---- Deteksi lawan terputus (heartbeat) ---- */
function startDuelHeartbeat() {
    stopDuelHeartbeat();
    duelHeartbeatInterval = setInterval(() => {
        if (!duelState) return;
        duelDocRef(duelState.roomCode).update({
            [`${duelState.role}.lastSeen`]: Date.now()
        }).catch(() => {});
    }, DUEL_HEARTBEAT_INTERVAL_MS);
}

function stopDuelHeartbeat() {
    if (duelHeartbeatInterval) {
        clearInterval(duelHeartbeatInterval);
        duelHeartbeatInterval = null;
    }
}

function checkDuelOpponentHeartbeat(opponent, status) {
    const banner = document.getElementById('duelDisconnectBanner');
    if (!banner) return;
    if (!opponent || status === 'finished' || status === 'waiting') {
        banner.style.display = 'none';
        return;
    }
    const stale = opponent.lastSeen && (Date.now() - opponent.lastSeen > DUEL_HEARTBEAT_TIMEOUT_MS);
    banner.style.display = stale ? 'flex' : 'none';
}

document.getElementById('duelLeaveDisconnectedButton').addEventListener('click', async () => {
    await abandonDuel();
    goToDashboard();
});

/* ---- Keluar dari duel ---- */
async function abandonDuel() {
    if (!duelState) return;
    try {
        await duelDocRef(duelState.roomCode).update({ status: 'abandoned' });
    } catch (e) { console.warn('[Duel G1] gagal menandai ruang ditinggalkan', e);
        // room mungkin sudah tidak ada / sudah selesai duluan, aman diabaikan
    }
    cleanupDuel();
}

function cleanupDuel() {
    if (duelState && typeof duelState.unsubscribe === 'function') {
        duelState.unsubscribe();
    }
    stopDuelHeartbeat();
    const oppBar = document.getElementById('duelOpponentBar');
    const banner = document.getElementById('duelDisconnectBanner');
    if (oppBar) oppBar.style.display = 'none';
    if (banner) banner.style.display = 'none';
    duelState = null;
}

