/* ---- Dashboard: tab & papan peringkat ---- */
function setAdvmathLeaderboardTab(tabName) {
    advmathActiveLeaderboardTab = String(tabName);
    document.querySelectorAll('#advmathDashboardView .leaderboard-tab[data-alboard]').forEach(tab => {
        tab.classList.toggle('is-active', tab.dataset.alboard === advmathActiveLeaderboardTab);
    });
    renderAdvmathLeaderboardPanel(advmathActiveLeaderboardTab);
}

document.querySelectorAll('#advmathDashboardView .leaderboard-tab[data-alboard]').forEach(tab => {
    tab.addEventListener('click', () => setAdvmathLeaderboardTab(tab.dataset.alboard));
});

function showAdvmathLeaderboardLoading() {
    document.getElementById('advmathPodium').innerHTML = '<div class="leaderboard-loading">Loading leaderboard...</div>';
    document.getElementById('advmathRankList').innerHTML = '';
}

async function renderAdvmathLeaderboardPanel(tabName) {
    const myToken = ++advmathLeaderboardRequestToken;
    showAdvmathLeaderboardLoading();
    if (tabName === 'duel') {
        const records = await getAdvmathDuelWinsLeaderboard();
        if (myToken !== advmathLeaderboardRequestToken) return; // tab sudah berpindah, abaikan hasil basi
        renderAdvmathDuelWinsPodium(records);
        renderAdvmathDuelWinsList(records);
    } else {
        const records = await getAdvmathRecordsForCount(parseInt(tabName, 10));
        if (myToken !== advmathLeaderboardRequestToken) return;
        renderAdvmathSoloPodium(records);
        renderAdvmathSoloList(records);
    }
}

function isAdvmathLastSavedSolo(record) {
    return !!advmathLastSavedRecord
        && String(advmathLastSavedRecord.count) === advmathActiveLeaderboardTab
        && advmathLastSavedRecord.name === record.name
        && advmathLastSavedRecord.time === record.time
        && advmathLastSavedRecord.mistakes === record.mistakes
        && advmathLastSavedRecord.hints === record.hints
        && advmathLastSavedRecord.burned === record.burned;
}

function advmathMetaText(record) {
    return `✖${record.mistakes || 0} · 💡${record.hints || 0} · 💀${record.burned || 0}`;
}

function renderAdvmathSoloPodium(records) {
    const podiumEl = document.getElementById('advmathPodium');
    const displayOrder = [1, 0, 2];

    podiumEl.innerHTML = displayOrder.map(rankIndex => {
        const place = rankIndex + 1;
        const spotClass = place === 1 ? 'podium-first' : place === 2 ? 'podium-second' : 'podium-third';
        const record = records[rankIndex];
        const medal = `<div class="podium-medal" aria-hidden="true">${place === 1 ? '👑' : place === 2 ? '🥈' : '🥉'}</div>`;

        if (!record) {
            return `
                <div class="podium-spot ${spotClass} is-empty">
                    ${medal}
                    <div class="podium-avatar-wrap"><div class="podium-avatar">👤</div></div>
                    <div class="podium-name">—</div>
                    <div class="podium-score">--:--</div>
                    <div class="podium-mistakes">&nbsp;</div>
                    <div class="podium-base" aria-hidden="true"><span>${place}</span></div>
                </div>
            `;
        }

        const isYou = isAdvmathLastSavedSolo(record);
        return `
            <div class="podium-spot ${spotClass}${isYou ? ' is-you' : ''}" role="group"
                 aria-label="Peringkat ${place}: ${escapeHtml(record.name)}, total waktu ${formatAdvmathDuration(record.time)}, ${record.mistakes || 0} salah, ${record.hints || 0} hint, ${record.burned || 0} soal hangus">
                ${medal}
                <div class="podium-avatar-wrap"><div class="podium-avatar">${avatarGlyph(record.avatar)}</div></div>
                <div class="podium-name" title="${escapeHtml(record.name)}">${escapeHtml(record.name)}</div>
                <div class="podium-score">${formatAdvmathDuration(record.time)}</div>
                <div class="podium-mistakes">${advmathMetaText(record)}</div>
                ${isYou ? '<div class="you-chip">⭐ Kamu</div>' : ''}
                <div class="podium-base" aria-hidden="true"><span>${place}</span></div>
            </div>
        `;
    }).join('');
}

function renderAdvmathSoloList(records) {
    const listEl = document.getElementById('advmathRankList');
    if (records.length === 0) {
        listEl.innerHTML = `<li class="rank-list-empty">Masih sepi di sini.<br>Jadi yang pertama nyetor waktu 🏁</li>`;
        return;
    }
    const rest = records.slice(3, MAX_ADVMATH_LEADERBOARD);
    if (rest.length === 0) {
        listEl.innerHTML = '';
        return;
    }
    listEl.innerHTML = rest.map((record, i) => {
        const rank = i + 4;
        const isYou = isAdvmathLastSavedSolo(record);
        return `
            <li class="rank-list-row${isYou ? ' is-you' : ''}">
                <span class="rank-list-position">${rank}</span>
                <span class="rank-list-avatar">${avatarGlyph(record.avatar)}</span>
                <span class="rank-list-name">${escapeHtml(record.name)}${isYou ? ' <span class="you-chip">⭐ Kamu</span>' : ''}</span>
                <span class="rank-list-dots" aria-hidden="true"></span>
                <span class="rank-list-score">${formatAdvmathDuration(record.time)}<small>${advmathMetaText(record)}</small></span>
            </li>
        `;
    }).join('');
}

function renderAdvmathDuelWinsPodium(records) {
    const podiumEl = document.getElementById('advmathPodium');
    const displayOrder = [1, 0, 2];

    podiumEl.innerHTML = displayOrder.map(rankIndex => {
        const place = rankIndex + 1;
        const spotClass = place === 1 ? 'podium-first' : place === 2 ? 'podium-second' : 'podium-third';
        const record = records[rankIndex];

        if (!record) {
            return `
                <div class="podium-spot ${spotClass} is-empty">
                    <div class="podium-avatar-wrap"><div class="podium-avatar">👤</div></div>
                    <div class="podium-name">—</div>
                    <div class="podium-score">--</div>
                    <div class="podium-mistakes">&nbsp;</div>
                    <div class="podium-base" aria-hidden="true"><span>${place}</span></div>
                </div>
            `;
        }

        return `
            <div class="podium-spot ${spotClass}" role="group"
                 aria-label="Peringkat ${place}: ${escapeHtml(record.name)}, ${record.wins} menang">
                ${place === 1 ? '<div class="podium-medal" aria-hidden="true">👑</div>' : `<div class="podium-medal" aria-hidden="true">${place === 2 ? '🥈' : '🥉'}</div>`}
                <div class="podium-avatar-wrap"><div class="podium-avatar">${avatarGlyph(record.avatar)}</div></div>
                <div class="podium-name" title="${escapeHtml(record.name)}">${escapeHtml(record.name)}</div>
                <div class="podium-score"><span>${record.wins}x</span> <span class="podium-score-unit">menang</span></div>
                <div class="podium-mistakes">&nbsp;</div>
                <div class="podium-base" aria-hidden="true"><span>${place}</span></div>
            </div>
        `;
    }).join('');
}

function renderAdvmathDuelWinsList(records) {
    const listEl = document.getElementById('advmathRankList');
    if (records.length === 0) {
        listEl.innerHTML = `<li class="rank-list-empty">Belum ada yang menang duel di sini.<br>Jadi yang pertama yuk 🏁</li>`;
        return;
    }
    const rest = records.slice(3, MAX_ADVMATH_DUEL_LEADERBOARD);
    if (rest.length === 0) {
        listEl.innerHTML = '';
        return;
    }
    listEl.innerHTML = rest.map((record, i) => {
        const rank = i + 4;
        return `
            <li class="rank-list-row">
                <span class="rank-list-position">${rank}</span>
                <span class="rank-list-avatar">${avatarGlyph(record.avatar)}</span>
                <span class="rank-list-name">${escapeHtml(record.name)}</span>
                <span class="rank-list-dots" aria-hidden="true"></span>
                <span class="rank-list-score">${record.wins}x<small>menang</small></span>
            </li>
        `;
    }).join('');
}

function goToAdvmathDashboard(focusTab) {
    countdownRunToken++;
    document.getElementById('countdownOverlay').classList.remove('is-visible');
    stopAdvmathRoundTimer();
    setAdvmathLeaderboardTab(focusTab || advmathActiveLeaderboardTab);
    switchView('advmathDashboard');
}

/* ---- Avatar picker (simpan skor solo & form duel) ---- */
buildAvatarPicker('advmathAvatarPicker', (avatar) => { advmathSelectedAvatar = avatar; });
buildAvatarPicker('advmathDuelCreateAvatarPicker', (avatar) => { advmathDuelCreateSelectedAvatar = avatar; });
buildAvatarPicker('advmathDuelJoinAvatarPicker', (avatar) => { advmathDuelJoinSelectedAvatar = avatar; });

/* ---- Bantuan & konfirmasi keluar ---- */
document.getElementById('advmathHelpButton').addEventListener('click', () => {
    showModal('advmathHelpModal');
});

document.getElementById('advmathBackToDashboardButton').addEventListener('click', () => {
    if (advmathGameInProgress || advmathDuelState) {
        showModal('advmathConfirmExitModal');
    } else {
        goToAdvmathDashboard();
    }
});

document.getElementById('advmathConfirmExitYesButton').addEventListener('click', async () => {
    hideModal('advmathConfirmExitModal');
    stopAdvmathRoundTimer();
    advmathGameInProgress = false;
    if (advmathDuelState) {
        await abandonAdvmathDuel();
    }
    goToAdvmathDashboard();
});

