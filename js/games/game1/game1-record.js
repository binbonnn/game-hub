/* =====================================================================
   SIMPAN SKOR
===================================================================== */
document.getElementById('saveScoreButton').addEventListener('click', async () => {
    hideModal('endGameModal');
    await waitForModalHidden('endGameModal');
    showModal('saveRecordModal');
});

document.getElementById('buttonSavePlayerRecord').addEventListener('click', savePlayerRecord);

async function savePlayerRecord() {
    const playerNameInput = document.getElementById('playerName');
    const playerName = playerNameInput.value.trim();
    if (!playerName) {
        alert('Isi dulu namamu ya!');
        return;
    }

    const saveButton = document.getElementById('buttonSavePlayerRecord');
    saveButton.disabled = true;
    saveButton.textContent = 'Menyimpan...';

    const savedBackgroundColor = safeGetLocalStorage('lastGameBackgroundColor');

    let saveResult = null;
    try {
        saveResult = await saveRecord(currentQuestionCount, {
            name: playerName,
            time: finalTimeSeconds,
            mistakes: mistakes,
            avatar: selectedAvatar,
            bgColor: savedBackgroundColor
        });
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = 'Simpan';
    }

    hideModal('saveRecordModal');
    playerNameInput.value = '';

    lastSavedRecord = { count: currentQuestionCount, name: playerName, time: finalTimeSeconds, mistakes: mistakes };

    if (saveResult && saveResult.error) {
        showToast('danger', `Gagal simpan online: ${saveResult.error}`, 6000);
    }

    goToDashboard(currentQuestionCount);
}

document.getElementById('saveRecordModal').addEventListener('shown.bs.modal', function () {
    document.getElementById('playerName').focus();
});

/* =====================================================================
   NAVIGASI: KEMBALI KE DASHBOARD / MAIN LAGI
===================================================================== */
document.getElementById('backToDashboardButton').addEventListener('click', () => {
    if (gameInProgress || duelState) {
        showModal('confirmExitModal');
    } else {
        goToDashboard();
    }
});

document.getElementById('confirmExitYesButton').addEventListener('click', async () => {
    hideModal('confirmExitModal');
    stopStopwatch();
    gameInProgress = false;
    if (duelState) {
        await abandonDuel();
    }
    goToDashboard();
});

document.getElementById('playAgainButton').addEventListener('click', () => {
    hideModal('endGameModal');
    startGameWithCount(currentQuestionCount);
});

document.getElementById('endGameBackToDashboardButton').addEventListener('click', () => {
    hideModal('endGameModal');
    goToDashboard(currentQuestionCount);
});

