/* =====================================================================================
   DUEL 1v1 PERKALIAN 1-10 LANJUTAN
===================================================================================== */
function advmathDuelDocRef(roomCode) {
    return firestoreDb.collection('advmath_duels').doc(roomCode);
}

document.getElementById('advmathOpenDuelButton').addEventListener('click', () => {
    if (!requireFirebaseForDuel()) return;
    showModal('advmathDuelModal');
});

document.getElementById('advmathDuelCreateRoomButton').addEventListener('click', async () => {
    hideModal('advmathDuelModal');
    await waitForModalHidden('advmathDuelModal');
    showModal('advmathDuelCreateModal');
});

document.getElementById('advmathDuelJoinRoomButton').addEventListener('click', async () => {
    hideModal('advmathDuelModal');
    await waitForModalHidden('advmathDuelModal');
    showModal('advmathDuelJoinModal');
});

document.getElementById('advmathDuelJoinCode').addEventListener('input', function () {
    this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
});

// Host memilih jumlah soal di modal buat-room (sama seperti duel di game Perkalian 1-10)
document.querySelectorAll('#advmathDuelCreateModal .count-option-button').forEach(btn => {
    btn.addEventListener('click', () => createAdvmathDuelRoom(parseInt(btn.dataset.count, 10)));
});

async function createAdvmathDuelRoom(count) {
    const nameInput = document.getElementById('advmathDuelCreateName');
    const name = nameInput.value.trim();
    if (!name) {
        showToast('danger', 'Isi dulu namamu ya!');
        nameInput.focus();
        return;
    }

    cleanupAdvmathDuel();
    hideModal('advmathDuelCreateModal');

    const sequence = generateAdvmathSequence(count);
    if (sequence.length === 0) {
        showToast('danger', 'Bank soal belum tersedia. Cek file advmath-questions.js.', 5000);
        return;
    }
    let roomCode = null;

    try {
        for (let attempt = 0; attempt < 6 && !roomCode; attempt++) {
            const candidate = generateRoomCode();
            const snap = await advmathDuelDocRef(candidate).get();
            if (!snap.exists) roomCode = candidate;
        }
        if (!roomCode) throw new Error('kode-habis');

        await advmathDuelDocRef(roomCode).set({
            count: sequence.length,
            status: 'waiting',
            createdAt: Date.now(),
            startAtMillis: null,
            winner: null,
            rematch: null,
            questions: sequence,
            host: { name: name, avatar: advmathDuelCreateSelectedAvatar, progress: 0, mistakes: 0, burned: 0, hints: 0, time: null, finishedAt: null, lastSeen: Date.now() },
            guest: null
        });
    } catch (e) {
        showToast('danger', `Gagal membuat room: ${e.code || e.message}`, 5000);
        return;
    }

    advmathDuelState = {
        roomCode, role: 'host', sequence, count: sequence.length,
        lastStartAtMillis: null, lastRematchUpdatedAt: null, resultShown: false
    };
    document.getElementById('advmathDuelRoomCodeDisplay').textContent = roomCode;
    await waitForModalHidden('advmathDuelCreateModal');
    showModal('advmathDuelWaitingModal');
    listenToAdvmathDuelRoom(roomCode);
    startAdvmathDuelHeartbeat();
}

document.getElementById('advmathDuelCopyCodeButton').addEventListener('click', () => {
    const code = document.getElementById('advmathDuelRoomCodeDisplay').textContent;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(() => showToast('success', 'Kode disalin!')).catch(() => {});
    }
});

document.getElementById('advmathDuelCancelWaitingButton').addEventListener('click', async () => {
    hideModal('advmathDuelWaitingModal');
    await abandonAdvmathDuel();
});

document.getElementById('advmathDuelJoinSubmitButton').addEventListener('click', joinAdvmathDuelRoom);

async function joinAdvmathDuelRoom() {
    const codeInput = document.getElementById('advmathDuelJoinCode');
    const nameInput = document.getElementById('advmathDuelJoinName');
    const code = codeInput.value.trim().toUpperCase();
    const name = nameInput.value.trim();

    if (code.length !== 4) {
        showToast('danger', 'Kode room terdiri dari 4 karakter.');
        codeInput.focus();
        return;
    }
    if (!name) {
        showToast('danger', 'Isi dulu namamu ya!');
        nameInput.focus();
        return;
    }

    const submitBtn = document.getElementById('advmathDuelJoinSubmitButton');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Menghubungkan...';

    try {
        const ref = advmathDuelDocRef(code);
        const snap = await ref.get();
        if (!snap.exists) {
            showToast('danger', 'Kode room tidak ditemukan.');
            return;
        }
        const room = snap.data();
        if (room.status !== 'waiting' || room.guest) {
            showToast('danger', 'Room ini sudah penuh atau sedang bermain.');
            return;
        }

        const startAtMillis = Date.now() + ADVMATH_DUEL_START_BUFFER_MS;
        await ref.update({
            guest: { name: name, avatar: advmathDuelJoinSelectedAvatar, progress: 0, mistakes: 0, burned: 0, hints: 0, time: null, finishedAt: null, lastSeen: Date.now() },
            status: 'countdown',
            startAtMillis: startAtMillis
        });

        cleanupAdvmathDuel();
        advmathDuelState = {
            roomCode: code, role: 'guest', sequence: room.questions, count: room.count,
            lastStartAtMillis: null, lastRematchUpdatedAt: null, resultShown: false
        };
        codeInput.value = '';
        nameInput.value = '';
        hideModal('advmathDuelJoinModal');
        listenToAdvmathDuelRoom(code);
        startAdvmathDuelHeartbeat();
    } catch (e) {
        showToast('danger', `Gagal gabung room: ${e.code || e.message}`, 5000);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Gabung';
    }
}

function listenToAdvmathDuelRoom(roomCode) {
    if (!advmathDuelState) return;
    advmathDuelState.unsubscribe = advmathDuelDocRef(roomCode).onSnapshot(
        snap => {
            if (!snap.exists) {
                if (!advmathDuelState) return;
                showToast('danger', 'Room duel sudah tidak tersedia.', 4000);
                cleanupAdvmathDuel();
                goToAdvmathDashboard('duel');
                return;
            }
            handleAdvmathDuelRoomUpdate(snap.data());
        },
        err => console.warn('[Duel Perkalian 1-10 Lanjutan] listener error', err)
    );
}

async function handleAdvmathDuelRoomUpdate(room) {
    if (!advmathDuelState) return;

    const opponentRole = advmathDuelState.role === 'host' ? 'guest' : 'host';
    const opponent = room[opponentRole];

    if (room.status === 'abandoned') {
        showToast('danger', 'Lawan meninggalkan duel.', 4000);
        cleanupAdvmathDuel();
        goToAdvmathDashboard('duel');
        return;
    }

    if (room.status === 'countdown' && room.startAtMillis !== advmathDuelState.lastStartAtMillis) {
        advmathDuelState.lastStartAtMillis = room.startAtMillis;
        advmathDuelState.lastRematchUpdatedAt = null;
        advmathDuelState.resultShown = false;
        advmathDuelState.sequence = room.questions;
        advmathDuelState.count = room.count;
        advmathDuelState.opponentName = opponent ? opponent.name : 'Lawan';
        advmathDuelState.opponentAvatar = opponent ? opponent.avatar : null;

        hideModal('advmathDuelWaitingModal');
        hideModal('advmathDuelResultModal');
        hideModal('advmathDuelWaitingResultModal');
        hideModal('advmathDuelRematchWaitingModal');
        hideModal('advmathDuelRematchRequestModal');
        beginAdvmathDuelCountdown(room.startAtMillis);
    }

    if ((room.status === 'playing' || room.status === 'countdown') && opponent) {
        updateAdvmathDuelOpponentUI(opponent);
    }

    if (room.status === 'finished' && !advmathDuelState.resultShown) {
        advmathDuelState.resultShown = true;
        if (advmathGameInProgress) {
            advmathGameInProgress = false;
            stopAdvmathRoundTimer();
            advmathOptionButtons().forEach(b => { b.disabled = true; });
            advmathHintButtons().forEach(b => { b.disabled = true; });
        }
        await waitForModalHidden('advmathDuelWaitingResultModal');
        showAdvmathDuelResult(room);
    }

    if (room.rematch && room.rematch.updatedAt !== advmathDuelState.lastRematchUpdatedAt) {
        advmathDuelState.lastRematchUpdatedAt = room.rematch.updatedAt;
        const iAmRequester = room.rematch.requestedBy === advmathDuelState.role;

        if (room.rematch.status === 'pending') {
            if (iAmRequester) {
                showModal('advmathDuelRematchWaitingModal');
            } else {
                document.getElementById('advmathDuelRematchRequestText').textContent =
                    `${opponent ? opponent.name : 'Lawan'} ingin main lagi. Setuju?`;
                showModal('advmathDuelRematchRequestModal');
            }
        } else if (room.rematch.status === 'declined') {
            hideModal('advmathDuelRematchWaitingModal');
            hideModal('advmathDuelRematchRequestModal');
            if (iAmRequester) {
                showToast('danger', 'Lawan menolak ajakan main lagi.', 4000);
                await waitForModalHidden('advmathDuelRematchWaitingModal');
                showModal('advmathDuelResultModal');
                advmathDuelDocRef(advmathDuelState.roomCode).update({ rematch: null }).catch(() => {});
            }
        }
    }

    checkAdvmathDuelOpponentHeartbeat(opponent, room.status);
}

function beginAdvmathDuelCountdown(startAtMillis) {
    const countdownDurationMs = COUNTDOWN_STEPS.length * 800 + 650;
    const waitMs = Math.max(0, (startAtMillis - Date.now()) - countdownDurationMs);

    advmathSequence = advmathDuelState.sequence;
    advmathCount = advmathSequence.length;
    prepareAdvmathGameUI();

    const oppBar = document.getElementById('advmathDuelOpponentBar');
    oppBar.style.display = 'flex';
    document.getElementById('advmathDuelOpponentAvatar').textContent = avatarGlyph(advmathDuelState.opponentAvatar);
    document.getElementById('advmathDuelOpponentName').textContent = advmathDuelState.opponentName || 'Lawan';
    document.getElementById('advmathDuelOpponentFill').style.width = '0%';
    document.getElementById('advmathDuelOpponentCount').textContent = `0/${advmathCount} soal`;
    document.getElementById('advmathDuelDisconnectBanner').style.display = 'none';

    setTimeout(() => {
        if (!advmathDuelState) return;
        runCountdown(() => {
            beginAdvmathRound();
        });
    }, waitMs);

    advmathDuelDocRef(advmathDuelState.roomCode).update({ status: 'playing' }).catch(() => {});
}

function updateAdvmathDuelOpponentUI(opponent) {
    const fill = document.getElementById('advmathDuelOpponentFill');
    const countEl = document.getElementById('advmathDuelOpponentCount');
    if (!fill || !countEl) return;
    const total = (advmathDuelState && advmathDuelState.count) || advmathCount || 1;
    const done = Math.max(0, Math.min(total, Number(opponent.progress) || 0));
    fill.style.width = `${(done / total) * 100}%`;
    countEl.textContent = `${done}/${total} soal`;
}

// progress = jumlah soal yang sudah selesai (dijawab benar atau hangus)
function reportAdvmathDuelProgress(progress) {
    if (!advmathDuelState) return;
    advmathDuelDocRef(advmathDuelState.roomCode).update({
        [`${advmathDuelState.role}.progress`]: progress,
        [`${advmathDuelState.role}.mistakes`]: advmathMistakeCount,
        [`${advmathDuelState.role}.burned`]: advmathBurnedCount,
        [`${advmathDuelState.role}.hints`]: advmathHintsUsed,
        [`${advmathDuelState.role}.lastSeen`]: Date.now()
    }).catch(e => console.warn('[Duel Perkalian 1-10 Lanjutan] gagal kirim progres', e));
}

// Pemenang ditentukan setelah KEDUA pemain selesai: total waktu akhir (aktual + hukuman) paling singkat menang.
// (Berbeda dari duel Perkalian 1-10: di sini yang selesai duluan belum tentu menang karena ada hukuman waktu.)
async function endAdvmathDuelGame() {
    const myRole = advmathDuelState.role;
    const opponentRole = myRole === 'host' ? 'guest' : 'host';
    const roomRef = advmathDuelDocRef(advmathDuelState.roomCode);
    const myFinal = { time: advmathFinalSeconds, mistakes: advmathMistakeCount, burned: advmathBurnedCount, hints: advmathHintsUsed };

    try {
        await firestoreDb.runTransaction(async (tx) => {
            const snap = await tx.get(roomRef);
            if (!snap.exists) return;
            const room = snap.data();

            const update = {
                [`${myRole}.progress`]: advmathCount,
                [`${myRole}.time`]: myFinal.time,
                [`${myRole}.mistakes`]: myFinal.mistakes,
                [`${myRole}.burned`]: myFinal.burned,
                [`${myRole}.hints`]: myFinal.hints,
                [`${myRole}.finishedAt`]: Date.now()
            };

            const opponentData = room[opponentRole];
            if (opponentData && opponentData.finishedAt) {
                update.status = 'finished';
                update.winner = determineAdvmathDuelWinner(myRole, myFinal, opponentRole, opponentData);
            }

            tx.update(roomRef, update);
        });
    } catch (e) {
        showToast('danger', `Gagal mengirim hasil duel: ${e.code || e.message}`, 5000);
    }

    if (!advmathDuelState.resultShown) {
        showModal('advmathDuelWaitingResultModal');
    }
}

function determineAdvmathDuelWinner(roleA, dataA, roleB, dataB) {
    if (dataA.time !== dataB.time) return dataA.time < dataB.time ? roleA : roleB;
    if ((dataA.burned || 0) !== (dataB.burned || 0)) return (dataA.burned || 0) < (dataB.burned || 0) ? roleA : roleB;
    if ((dataA.hints || 0) !== (dataB.hints || 0)) return (dataA.hints || 0) < (dataB.hints || 0) ? roleA : roleB;
    if ((dataA.mistakes || 0) !== (dataB.mistakes || 0)) return (dataA.mistakes || 0) < (dataB.mistakes || 0) ? roleA : roleB;
    return 'draw';
}

async function showAdvmathDuelResult(room) {
    stopAdvmathDuelHeartbeat();
    hideModal('advmathDuelWaitingResultModal');

    const isDraw = room.winner === 'draw';
    const amIWinner = room.winner === advmathDuelState.role;
    const me = advmathDuelState.role === 'host' ? room.host : room.guest;
    const opponent = advmathDuelState.role === 'host' ? room.guest : room.host;

    const banner = document.getElementById('advmathDuelWinnerBanner');
    if (isDraw) {
        banner.textContent = '🤝 Seri!';
        banner.className = 'duel-winner-banner is-lose';
    } else {
        banner.textContent = amIWinner ? '🏆 Kamu Menang!' : `😅 ${opponent ? opponent.name : 'Lawan'} Menang`;
        banner.className = `duel-winner-banner ${amIWinner ? 'is-win' : 'is-lose'}`;
    }

    const renderPlayer = (label, player) => {
        const finished = !!(player && player.finishedAt);
        const statLine = finished
            ? `${formatAdvmathDuration(player.time)} · ✖${player.mistakes || 0} · 💡${player.hints || 0} · 💀${player.burned || 0}`
            : `Belum menyelesaikan soalnya`;
        return `
            <div class="duel-result-card">
                <div class="duel-result-avatar">${avatarGlyph(player ? player.avatar : null)}</div>
                <div class="duel-result-name">${escapeHtml(player ? player.name : '—')}</div>
                <div class="duel-result-label">${label}</div>
                <div class="duel-result-stat">${statLine}</div>
            </div>
        `;
    };

    document.getElementById('advmathDuelResultGrid').innerHTML =
        renderPlayer('Kamu', me) + renderPlayer('Lawan', opponent);

    if (amIWinner && me) {
        await recordAdvmathDuelWin(me.name, me.avatar);
    }

    showModal('advmathDuelResultModal');
    launchConfetti();
    playFinishSounds(amIWinner);
}

document.getElementById('advmathDuelRematchButton').addEventListener('click', async () => {
    if (!advmathDuelState) return;
    hideModal('advmathDuelResultModal');
    await waitForModalHidden('advmathDuelResultModal');
    try {
        await advmathDuelDocRef(advmathDuelState.roomCode).update({
            rematch: { requestedBy: advmathDuelState.role, status: 'pending', updatedAt: Date.now() }
        });
        showModal('advmathDuelRematchWaitingModal');
    } catch (e) {
        showToast('danger', `Gagal mengirim ajakan main lagi: ${e.code || e.message}`, 5000);
        showModal('advmathDuelResultModal');
    }
});

document.getElementById('advmathDuelRematchCancelButton').addEventListener('click', async () => {
    hideModal('advmathDuelRematchWaitingModal');
    if (advmathDuelState) {
        try {
            await advmathDuelDocRef(advmathDuelState.roomCode).update({ rematch: null });
        } catch (e) { console.warn('[Duel G3] gagal mereset permintaan rematch', e); /* abaikan */ }
    }
    await waitForModalHidden('advmathDuelRematchWaitingModal');
    showModal('advmathDuelResultModal');
});

document.getElementById('advmathDuelRematchAcceptButton').addEventListener('click', async () => {
    if (!advmathDuelState) return;
    hideModal('advmathDuelRematchRequestModal');
    await waitForModalHidden('advmathDuelRematchRequestModal');

    const newSequence = generateAdvmathSequence(advmathDuelState.count || advmathCount);
    advmathDuelState.sequence = newSequence;

    try {
        await advmathDuelDocRef(advmathDuelState.roomCode).update({
            questions: newSequence,
            count: newSequence.length,
            status: 'countdown',
            startAtMillis: Date.now() + ADVMATH_DUEL_START_BUFFER_MS,
            winner: null,
            rematch: null,
            'host.progress': 0, 'host.time': null, 'host.mistakes': 0, 'host.burned': 0, 'host.hints': 0, 'host.finishedAt': null, 'host.lastSeen': Date.now(),
            'guest.progress': 0, 'guest.time': null, 'guest.mistakes': 0, 'guest.burned': 0, 'guest.hints': 0, 'guest.finishedAt': null, 'guest.lastSeen': Date.now()
        });
    } catch (e) {
        showToast('danger', `Gagal memulai ulang duel: ${e.code || e.message}`, 5000);
    }
});

document.getElementById('advmathDuelRematchDeclineButton').addEventListener('click', async () => {
    if (!advmathDuelState) return;
    hideModal('advmathDuelRematchRequestModal');
    await waitForModalHidden('advmathDuelRematchRequestModal');
    showModal('advmathDuelResultModal');

    const requesterRole = advmathDuelState.role === 'host' ? 'guest' : 'host';
    try {
        await advmathDuelDocRef(advmathDuelState.roomCode).update({
            rematch: { requestedBy: requesterRole, status: 'declined', updatedAt: Date.now() }
        });
    } catch (e) { console.warn('[Duel G3] gagal menolak rematch', e); /* abaikan */ }
});

document.getElementById('advmathDuelResultDashboardButton').addEventListener('click', () => {
    hideModal('advmathDuelResultModal');
    cleanupAdvmathDuel();
    goToAdvmathDashboard('duel');
});

function startAdvmathDuelHeartbeat() {
    stopAdvmathDuelHeartbeat();
    advmathDuelHeartbeatInterval = setInterval(() => {
        if (!advmathDuelState) return;
        advmathDuelDocRef(advmathDuelState.roomCode).update({
            [`${advmathDuelState.role}.lastSeen`]: Date.now()
        }).catch(() => {});
    }, ADVMATH_DUEL_HEARTBEAT_INTERVAL_MS);
}

function stopAdvmathDuelHeartbeat() {
    if (advmathDuelHeartbeatInterval) {
        clearInterval(advmathDuelHeartbeatInterval);
        advmathDuelHeartbeatInterval = null;
    }
}

function checkAdvmathDuelOpponentHeartbeat(opponent, status) {
    const banner = document.getElementById('advmathDuelDisconnectBanner');
    if (!banner) return;
    if (!opponent || status === 'finished' || status === 'waiting') {
        banner.style.display = 'none';
        return;
    }
    const stale = opponent.lastSeen && (Date.now() - opponent.lastSeen > ADVMATH_DUEL_HEARTBEAT_TIMEOUT_MS);
    banner.style.display = stale ? 'flex' : 'none';
}

document.getElementById('advmathDuelLeaveDisconnectedButton').addEventListener('click', async () => {
    await abandonAdvmathDuel();
    goToAdvmathDashboard('duel');
});

async function abandonAdvmathDuel() {
    if (!advmathDuelState) return;
    try {
        await advmathDuelDocRef(advmathDuelState.roomCode).update({ status: 'abandoned' });
    } catch (e) { console.warn('[Duel G3] gagal menandai ruang ditinggalkan', e); /* room mungkin sudah tidak ada / sudah selesai duluan, aman diabaikan */ }
    cleanupAdvmathDuel();
}

function cleanupAdvmathDuel() {
    if (advmathDuelState && typeof advmathDuelState.unsubscribe === 'function') {
        advmathDuelState.unsubscribe();
    }
    stopAdvmathDuelHeartbeat();
    const oppBar = document.getElementById('advmathDuelOpponentBar');
    const banner = document.getElementById('advmathDuelDisconnectBanner');
    if (oppBar) oppBar.style.display = 'none';
    if (banner) banner.style.display = 'none';
    advmathDuelState = null;
}

