/* =====================================================================================
   DUEL 1v1 PENGETAHUAN DASAR
===================================================================================== */
function knowledgeDuelDocRef(roomCode) {
    return firestoreDb.collection('knowledge_duels').doc(roomCode);
}

document.getElementById('knowledgeOpenDuelButton').addEventListener('click', () => {
    if (!requireFirebaseForDuel()) return;
    showModal('knowledgeDuelModal');
});

document.getElementById('knowledgeDuelCreateRoomButton').addEventListener('click', async () => {
    hideModal('knowledgeDuelModal');
    await waitForModalHidden('knowledgeDuelModal');
    showModal('knowledgeDuelCreateModal');
});

document.getElementById('knowledgeDuelJoinRoomButton').addEventListener('click', async () => {
    hideModal('knowledgeDuelModal');
    await waitForModalHidden('knowledgeDuelModal');
    showModal('knowledgeDuelJoinModal');
});

document.getElementById('knowledgeDuelJoinCode').addEventListener('input', function () {
    this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
});

document.getElementById('knowledgeDuelCreateSubmitButton').addEventListener('click', createKnowledgeDuelRoom);

async function createKnowledgeDuelRoom() {
    const nameInput = document.getElementById('knowledgeDuelCreateName');
    const name = nameInput.value.trim();
    if (!name) {
        showToast('danger', 'Namanya belum diisi nih');
        nameInput.focus();
        return;
    }

    cleanupKnowledgeDuel();
    hideModal('knowledgeDuelCreateModal');

    const sequence = generateKnowledgeSequence(KNOWLEDGE_ROUND_BUFFER);
    let roomCode = null;

    try {
        for (let attempt = 0; attempt < 6 && !roomCode; attempt++) {
            const candidate = generateRoomCode();
            const snap = await knowledgeDuelDocRef(candidate).get();
            if (!snap.exists) roomCode = candidate;
        }
        if (!roomCode) throw new Error('kode-habis');

        await knowledgeDuelDocRef(roomCode).set({
            status: 'waiting',
            createdAt: Date.now(),
            startAtMillis: null,
            winner: null,
            rematch: null,
            questions: sequence,
            host: { name: name, avatar: knowledgeDuelCreateSelectedAvatar, score: 0, correct: 0, burned: 0, hints: 0, finishedAt: null, lastSeen: Date.now() },
            guest: null
        });
    } catch (e) {
        showToast('danger', `Room gagal dibuat: ${e.code || e.message}`, 5000);
        return;
    }

    knowledgeDuelState = {
        roomCode, role: 'host', sequence,
        lastStartAtMillis: null, lastRematchUpdatedAt: null, resultShown: false
    };
    document.getElementById('knowledgeDuelRoomCodeDisplay').textContent = roomCode;
    await waitForModalHidden('knowledgeDuelCreateModal');
    showModal('knowledgeDuelWaitingModal');
    listenToKnowledgeDuelRoom(roomCode);
    startKnowledgeDuelHeartbeat();
}

document.getElementById('knowledgeDuelCopyCodeButton').addEventListener('click', () => {
    const code = document.getElementById('knowledgeDuelRoomCodeDisplay').textContent;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(() => showToast('success', 'Kode ke-copy')).catch(() => {});
    }
});

document.getElementById('knowledgeDuelCancelWaitingButton').addEventListener('click', async () => {
    hideModal('knowledgeDuelWaitingModal');
    await abandonKnowledgeDuel();
});

document.getElementById('knowledgeDuelJoinSubmitButton').addEventListener('click', joinKnowledgeDuelRoom);

async function joinKnowledgeDuelRoom() {
    const codeInput = document.getElementById('knowledgeDuelJoinCode');
    const nameInput = document.getElementById('knowledgeDuelJoinName');
    const code = codeInput.value.trim().toUpperCase();
    const name = nameInput.value.trim();

    if (code.length !== 4) {
        showToast('danger', 'Kode room itu 4 karakter ya');
        codeInput.focus();
        return;
    }
    if (!name) {
        showToast('danger', 'Namanya belum diisi nih');
        nameInput.focus();
        return;
    }

    const submitBtn = document.getElementById('knowledgeDuelJoinSubmitButton');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Menghubungkan...';

    try {
        const ref = knowledgeDuelDocRef(code);
        const snap = await ref.get();
        if (!snap.exists) {
            showToast('danger', 'Kode room-nya nggak ketemu, cek lagi ya');
            return;
        }
        const room = snap.data();
        if (room.status !== 'waiting' || room.guest) {
            showToast('danger', 'Room ini udah penuh atau lagi main');
            return;
        }

        const startAtMillis = Date.now() + KNOWLEDGE_DUEL_START_BUFFER_MS;
        await ref.update({
            guest: { name: name, avatar: knowledgeDuelJoinSelectedAvatar, score: 0, correct: 0, burned: 0, hints: 0, finishedAt: null, lastSeen: Date.now() },
            status: 'countdown',
            startAtMillis: startAtMillis
        });

        cleanupKnowledgeDuel();
        knowledgeDuelState = {
            roomCode: code, role: 'guest', sequence: room.questions,
            lastStartAtMillis: null, lastRematchUpdatedAt: null, resultShown: false
        };
        codeInput.value = '';
        nameInput.value = '';
        hideModal('knowledgeDuelJoinModal');
        listenToKnowledgeDuelRoom(code);
        startKnowledgeDuelHeartbeat();
    } catch (e) {
        showToast('danger', `Gagal join room: ${e.code || e.message}`, 5000);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Gabung';
    }
}

function listenToKnowledgeDuelRoom(roomCode) {
    if (!knowledgeDuelState) return;
    knowledgeDuelState.unsubscribe = knowledgeDuelDocRef(roomCode).onSnapshot(
        snap => {
            if (!snap.exists) {
                if (!knowledgeDuelState) return;
                showToast('danger', 'Room duelnya udah nggak ada', 4000);
                cleanupKnowledgeDuel();
                goToKnowledgeDashboard('duel');
                return;
            }
            handleKnowledgeDuelRoomUpdate(snap.data());
        },
        err => console.warn('[Duel Pengetahuan Dasar] listener error', err)
    );
}

async function handleKnowledgeDuelRoomUpdate(room) {
    if (!knowledgeDuelState) return;

    const opponentRole = knowledgeDuelState.role === 'host' ? 'guest' : 'host';
    const opponent = room[opponentRole];

    if (room.status === 'abandoned') {
        showToast('danger', 'Lawanmu cabut dari duel', 4000);
        cleanupKnowledgeDuel();
        goToKnowledgeDashboard('duel');
        return;
    }

    if (room.status === 'countdown' && room.startAtMillis !== knowledgeDuelState.lastStartAtMillis) {
        knowledgeDuelState.lastStartAtMillis = room.startAtMillis;
        knowledgeDuelState.lastRematchUpdatedAt = null;
        knowledgeDuelState.resultShown = false;
        knowledgeDuelState.sequence = room.questions;
        knowledgeDuelState.opponentName = opponent ? opponent.name : 'Lawan';
        knowledgeDuelState.opponentAvatar = opponent ? opponent.avatar : null;

        hideModal('knowledgeDuelWaitingModal');
        hideModal('knowledgeDuelResultModal');
        hideModal('knowledgeDuelWaitingResultModal');
        hideModal('knowledgeDuelRematchWaitingModal');
        hideModal('knowledgeDuelRematchRequestModal');
        beginKnowledgeDuelCountdown(room.startAtMillis);
    }

    if ((room.status === 'playing' || room.status === 'countdown') && opponent) {
        updateKnowledgeDuelOpponentUI(opponent);
    }

    if (room.status === 'finished' && !knowledgeDuelState.resultShown) {
        knowledgeDuelState.resultShown = true;
        if (knowledgeGameInProgress) {
            knowledgeGameInProgress = false;
            stopKnowledgeRoundTimer();
            document.querySelectorAll('.knowledge-option-btn').forEach(b => { b.disabled = true; });
            document.getElementById('knowledgeHintButton').disabled = true;
        }
        await waitForModalHidden('knowledgeDuelWaitingResultModal');
        showKnowledgeDuelResult(room);
    }

    if (room.rematch && room.rematch.updatedAt !== knowledgeDuelState.lastRematchUpdatedAt) {
        knowledgeDuelState.lastRematchUpdatedAt = room.rematch.updatedAt;
        const iAmRequester = room.rematch.requestedBy === knowledgeDuelState.role;

        if (room.rematch.status === 'pending') {
            if (iAmRequester) {
                showModal('knowledgeDuelRematchWaitingModal');
            } else {
                document.getElementById('knowledgeDuelRematchRequestText').textContent =
                    `${opponent ? opponent.name : 'Lawan'} ngajak rematch. Mau?`;
                showModal('knowledgeDuelRematchRequestModal');
            }
        } else if (room.rematch.status === 'declined') {
            hideModal('knowledgeDuelRematchWaitingModal');
            hideModal('knowledgeDuelRematchRequestModal');
            if (iAmRequester) {
                showToast('danger', 'Lawanmu skip rematch', 4000);
                await waitForModalHidden('knowledgeDuelRematchWaitingModal');
                showModal('knowledgeDuelResultModal');
                knowledgeDuelDocRef(knowledgeDuelState.roomCode).update({ rematch: null }).catch(() => {});
            }
        }
    }

    checkKnowledgeDuelOpponentHeartbeat(opponent, room.status);
}

function beginKnowledgeDuelCountdown(startAtMillis) {
    const countdownDurationMs = COUNTDOWN_STEPS.length * 800 + 650;
    const waitMs = Math.max(0, (startAtMillis - Date.now()) - countdownDurationMs);

    knowledgeSequence = knowledgeDuelState.sequence;
    prepareKnowledgeGameUI();

    const oppBar = document.getElementById('knowledgeDuelOpponentBar');
    oppBar.style.display = 'flex';
    document.getElementById('knowledgeDuelOpponentAvatar').textContent = avatarGlyph(knowledgeDuelState.opponentAvatar);
    document.getElementById('knowledgeDuelOpponentName').textContent = knowledgeDuelState.opponentName || 'Lawan';
    document.getElementById('knowledgeDuelOpponentFill').style.width = '0%';
    document.getElementById('knowledgeDuelOpponentCount').textContent = '0 benar';
    document.getElementById('knowledgeDuelDisconnectBanner').style.display = 'none';

    setTimeout(() => {
        if (!knowledgeDuelState) return;
        runCountdown(() => {
            beginKnowledgeRound(startAtMillis + KNOWLEDGE_ROUND_DURATION_MS);
        });
    }, waitMs);

    knowledgeDuelDocRef(knowledgeDuelState.roomCode).update({ status: 'playing' }).catch(() => {});
}

function updateKnowledgeDuelOpponentUI(opponent) {
    const fill = document.getElementById('knowledgeDuelOpponentFill');
    const countEl = document.getElementById('knowledgeDuelOpponentCount');
    if (!fill || !countEl) return;
    const oppScore = Number(opponent.score) || 0;
    const pct = Math.max(0, Math.min(100, (oppScore / 15) * 100)); // skala visual kasar, bukan target pasti
    fill.style.width = `${pct}%`;
    countEl.textContent = `${formatKnowledgeScore(oppScore)} poin`;
}

function reportKnowledgeDuelProgress() {
    if (!knowledgeDuelState) return;
    knowledgeDuelDocRef(knowledgeDuelState.roomCode).update({
        [`${knowledgeDuelState.role}.score`]: tenthsToScore(knowledgeScoreTenths),
        [`${knowledgeDuelState.role}.correct`]: knowledgeCorrectCount,
        [`${knowledgeDuelState.role}.burned`]: knowledgeBurnedCount,
        [`${knowledgeDuelState.role}.hints`]: knowledgeHintsUsed,
        [`${knowledgeDuelState.role}.lastSeen`]: Date.now()
    }).catch(e => console.warn('[Duel Pengetahuan Dasar] gagal kirim progres', e));
}

// Berbeda dari duel Perkalian: di sini KEDUA pemain main penuh 60 detik (bukan lomba selesai duluan),
// jadi pemenang baru bisa ditentukan setelah KEDUA sisi sama-sama menuliskan hasil akhirnya.
async function endKnowledgeDuelRound() {
    knowledgeGameInProgress = false;
    document.querySelectorAll('.knowledge-option-btn').forEach(b => { b.disabled = true; });
    document.getElementById('knowledgeHintButton').disabled = true;

    const myRole = knowledgeDuelState.role;
    const opponentRole = myRole === 'host' ? 'guest' : 'host';
    const roomRef = knowledgeDuelDocRef(knowledgeDuelState.roomCode);
    const myFinal = { score: tenthsToScore(knowledgeScoreTenths), correct: knowledgeCorrectCount, burned: knowledgeBurnedCount, hints: knowledgeHintsUsed };

    try {
        await firestoreDb.runTransaction(async (tx) => {
            const snap = await tx.get(roomRef);
            if (!snap.exists) return;
            const room = snap.data();

            const update = {
                [`${myRole}.score`]: myFinal.score,
                [`${myRole}.correct`]: myFinal.correct,
                [`${myRole}.burned`]: myFinal.burned,
                [`${myRole}.hints`]: myFinal.hints,
                [`${myRole}.finishedAt`]: Date.now()
            };

            const opponentData = room[opponentRole];
            if (opponentData && opponentData.finishedAt) {
                update.status = 'finished';
                update.winner = determineKnowledgeDuelWinner(myRole, myFinal, opponentRole, opponentData);
            }

            tx.update(roomRef, update);
        });
    } catch (e) {
        showToast('danger', `Hasil duel gagal terkirim: ${e.code || e.message}`, 5000);
    }

    if (!knowledgeDuelState.resultShown) {
        showModal('knowledgeDuelWaitingResultModal');
    }
}

function determineKnowledgeDuelWinner(roleA, dataA, roleB, dataB) {
    const tA = Math.round((Number(dataA.score) || 0) * 10);
    const tB = Math.round((Number(dataB.score) || 0) * 10);
    if (tA !== tB) return tA > tB ? roleA : roleB;
    if (dataA.hints !== dataB.hints) return dataA.hints < dataB.hints ? roleA : roleB;
    if (dataA.burned !== dataB.burned) return dataA.burned < dataB.burned ? roleA : roleB;
    return 'draw';
}

async function showKnowledgeDuelResult(room) {
    stopKnowledgeDuelHeartbeat();
    hideModal('knowledgeDuelWaitingResultModal');

    const isDraw = room.winner === 'draw';
    const amIWinner = room.winner === knowledgeDuelState.role;
    const me = knowledgeDuelState.role === 'host' ? room.host : room.guest;
    const opponent = knowledgeDuelState.role === 'host' ? room.guest : room.host;

    const banner = document.getElementById('knowledgeDuelWinnerBanner');
    if (isDraw) {
        banner.textContent = '🤝 Seri!';
        banner.className = 'duel-winner-banner is-lose';
    } else {
        banner.textContent = amIWinner ? '🏆 GG, kamu menang' : `😅 ${opponent ? opponent.name : 'Lawan'} menang kali ini`;
        banner.className = `duel-winner-banner ${amIWinner ? 'is-win' : 'is-lose'}`;
    }

    const renderPlayer = (label, player) => {
        const finished = !!(player && player.finishedAt);
        const statLine = finished
            ? `${formatKnowledgeScore(player.score)} poin · ${player.correct} benar · 💡${player.hints} · 💀${player.burned}`
            : `Belum selesai main`;
        return `
            <div class="duel-result-card">
                <div class="duel-result-avatar">${avatarGlyph(player ? player.avatar : null)}</div>
                <div class="duel-result-name">${escapeHtml(player ? player.name : '—')}</div>
                <div class="duel-result-label">${label}</div>
                <div class="duel-result-stat">${statLine}</div>
            </div>
        `;
    };

    document.getElementById('knowledgeDuelResultGrid').innerHTML =
        renderPlayer('Kamu', me) + renderPlayer('Lawan', opponent);

    if (amIWinner && me) {
        await recordKnowledgeDuelWin(me.name, me.avatar);
    }

    showModal('knowledgeDuelResultModal');
    launchConfetti();
    playFinishSounds(amIWinner);
}

document.getElementById('knowledgeDuelRematchButton').addEventListener('click', async () => {
    if (!knowledgeDuelState) return;
    hideModal('knowledgeDuelResultModal');
    await waitForModalHidden('knowledgeDuelResultModal');
    try {
        await knowledgeDuelDocRef(knowledgeDuelState.roomCode).update({
            rematch: { requestedBy: knowledgeDuelState.role, status: 'pending', updatedAt: Date.now() }
        });
        showModal('knowledgeDuelRematchWaitingModal');
    } catch (e) {
        showToast('danger', `Ajakan rematch gagal terkirim: ${e.code || e.message}`, 5000);
        showModal('knowledgeDuelResultModal');
    }
});

document.getElementById('knowledgeDuelRematchCancelButton').addEventListener('click', async () => {
    hideModal('knowledgeDuelRematchWaitingModal');
    if (knowledgeDuelState) {
        try {
            await knowledgeDuelDocRef(knowledgeDuelState.roomCode).update({ rematch: null });
        } catch (e) { console.warn('[Duel G2] gagal mereset permintaan rematch', e); /* abaikan */ }
    }
    await waitForModalHidden('knowledgeDuelRematchWaitingModal');
    showModal('knowledgeDuelResultModal');
});

document.getElementById('knowledgeDuelRematchAcceptButton').addEventListener('click', async () => {
    if (!knowledgeDuelState) return;
    hideModal('knowledgeDuelRematchRequestModal');
    await waitForModalHidden('knowledgeDuelRematchRequestModal');

    const newSequence = generateKnowledgeSequence(KNOWLEDGE_ROUND_BUFFER);
    knowledgeDuelState.sequence = newSequence;

    try {
        await knowledgeDuelDocRef(knowledgeDuelState.roomCode).update({
            questions: newSequence,
            status: 'countdown',
            startAtMillis: Date.now() + KNOWLEDGE_DUEL_START_BUFFER_MS,
            winner: null,
            rematch: null,
            'host.score': 0, 'host.correct': 0, 'host.burned': 0, 'host.hints': 0, 'host.finishedAt': null, 'host.lastSeen': Date.now(),
            'guest.score': 0, 'guest.correct': 0, 'guest.burned': 0, 'guest.hints': 0, 'guest.finishedAt': null, 'guest.lastSeen': Date.now()
        });
    } catch (e) {
        showToast('danger', `Duel gagal dimulai ulang: ${e.code || e.message}`, 5000);
    }
});

document.getElementById('knowledgeDuelRematchDeclineButton').addEventListener('click', async () => {
    if (!knowledgeDuelState) return;
    hideModal('knowledgeDuelRematchRequestModal');
    await waitForModalHidden('knowledgeDuelRematchRequestModal');
    showModal('knowledgeDuelResultModal');

    const requesterRole = knowledgeDuelState.role === 'host' ? 'guest' : 'host';
    try {
        await knowledgeDuelDocRef(knowledgeDuelState.roomCode).update({
            rematch: { requestedBy: requesterRole, status: 'declined', updatedAt: Date.now() }
        });
    } catch (e) { console.warn('[Duel G2] gagal menolak rematch', e); /* abaikan */ }
});

document.getElementById('knowledgeDuelResultDashboardButton').addEventListener('click', () => {
    hideModal('knowledgeDuelResultModal');
    cleanupKnowledgeDuel();
    goToKnowledgeDashboard('duel');
});

function startKnowledgeDuelHeartbeat() {
    stopKnowledgeDuelHeartbeat();
    knowledgeDuelHeartbeatInterval = setInterval(() => {
        if (!knowledgeDuelState) return;
        knowledgeDuelDocRef(knowledgeDuelState.roomCode).update({
            [`${knowledgeDuelState.role}.lastSeen`]: Date.now()
        }).catch(() => {});
    }, KNOWLEDGE_DUEL_HEARTBEAT_INTERVAL_MS);
}

function stopKnowledgeDuelHeartbeat() {
    if (knowledgeDuelHeartbeatInterval) {
        clearInterval(knowledgeDuelHeartbeatInterval);
        knowledgeDuelHeartbeatInterval = null;
    }
}

function checkKnowledgeDuelOpponentHeartbeat(opponent, status) {
    const banner = document.getElementById('knowledgeDuelDisconnectBanner');
    if (!banner) return;
    if (!opponent || status === 'finished' || status === 'waiting') {
        banner.style.display = 'none';
        return;
    }
    const stale = opponent.lastSeen && (Date.now() - opponent.lastSeen > KNOWLEDGE_DUEL_HEARTBEAT_TIMEOUT_MS);
    banner.style.display = stale ? 'flex' : 'none';
}

document.getElementById('knowledgeDuelLeaveDisconnectedButton').addEventListener('click', async () => {
    await abandonKnowledgeDuel();
    goToKnowledgeDashboard('duel');
});

async function abandonKnowledgeDuel() {
    if (!knowledgeDuelState) return;
    try {
        await knowledgeDuelDocRef(knowledgeDuelState.roomCode).update({ status: 'abandoned' });
    } catch (e) { console.warn('[Duel G2] gagal menandai ruang ditinggalkan', e); /* room mungkin sudah tidak ada / sudah selesai duluan, aman diabaikan */ }
    cleanupKnowledgeDuel();
}

function cleanupKnowledgeDuel() {
    if (knowledgeDuelState && typeof knowledgeDuelState.unsubscribe === 'function') {
        knowledgeDuelState.unsubscribe();
    }
    stopKnowledgeDuelHeartbeat();
    const oppBar = document.getElementById('knowledgeDuelOpponentBar');
    const banner = document.getElementById('knowledgeDuelDisconnectBanner');
    if (oppBar) oppBar.style.display = 'none';
    if (banner) banner.style.display = 'none';
    knowledgeDuelState = null;
}

