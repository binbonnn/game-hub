/* ---- Dashboard: tab & papan peringkat ---- */
function setKnowledgeLeaderboardTab(tabName) {
    knowledgeActiveLeaderboardTab = tabName;
    document.querySelectorAll('#knowledgeDashboardView .leaderboard-tab[data-klboard]').forEach(tab => {
        tab.classList.toggle('is-active', tab.dataset.klboard === tabName);
    });
    renderKnowledgeLeaderboardPanel(tabName);
}

document.querySelectorAll('#knowledgeDashboardView .leaderboard-tab[data-klboard]').forEach(tab => {
    tab.addEventListener('click', () => setKnowledgeLeaderboardTab(tab.dataset.klboard));
});

function showKnowledgeLeaderboardLoading() {
    document.getElementById('knowledgePodium').innerHTML = '<div class="leaderboard-loading">Loading leaderboard...</div>';
    document.getElementById('knowledgeRankList').innerHTML = '';
}

async function renderKnowledgeLeaderboardPanel(tabName) {
    showKnowledgeLeaderboardLoading();
    if (tabName === 'duel') {
        const records = await getKnowledgeDuelWinsLeaderboard();
        renderKnowledgeDuelWinsPodium(records);
        renderKnowledgeDuelWinsList(records);
    } else {
        const records = await getKnowledgeSoloRecords();
        renderKnowledgeSoloPodium(records);
        renderKnowledgeSoloList(records);
    }
}

function isKnowledgeLastSavedSolo(record) {
    return !!knowledgeLastSavedRecord
        && knowledgeLastSavedRecord.name === record.name
        && knowledgeLastSavedRecord.score === record.score
        && knowledgeLastSavedRecord.hints === record.hints
        && knowledgeLastSavedRecord.burned === record.burned;
}

function renderKnowledgeSoloPodium(records) {
    const podiumEl = document.getElementById('knowledgePodium');
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

        const isYou = isKnowledgeLastSavedSolo(record);
        return `
            <div class="podium-spot ${spotClass}${isYou ? ' is-you' : ''}" role="group"
                 aria-label="Peringkat ${place}: ${escapeHtml(record.name)}, skor ${formatKnowledgeScore(record.score)}">
                ${place === 1 ? '<div class="podium-medal" aria-hidden="true">👑</div>' : `<div class="podium-medal" aria-hidden="true">${place === 2 ? '🥈' : '🥉'}</div>`}
                <div class="podium-avatar-wrap"><div class="podium-avatar">${avatarGlyph(record.avatar)}</div></div>
                <div class="podium-name" title="${escapeHtml(record.name)}">${escapeHtml(record.name)}</div>
                <div class="podium-score"><span>${formatKnowledgeScore(record.score)}</span> <span class="podium-score-unit">poin</span></div>
                <div class="podium-mistakes">💡${record.hints} · 💀${record.burned}</div>
                ${isYou ? '<div class="you-chip">⭐ Kamu</div>' : ''}
                <div class="podium-base" aria-hidden="true"><span>${place}</span></div>
            </div>
        `;
    }).join('');
}

function renderKnowledgeSoloList(records) {
    const listEl = document.getElementById('knowledgeRankList');
    if (records.length === 0) {
        listEl.innerHTML = `<li class="rank-list-empty">Masih sepi di sini.<br>Jadi yang pertama nyetor skor 🏁</li>`;
        return;
    }
    const rest = records.slice(3, MAX_KNOWLEDGE_LEADERBOARD);
    if (rest.length === 0) {
        listEl.innerHTML = '';
        return;
    }
    listEl.innerHTML = rest.map((record, i) => {
        const rank = i + 4;
        const isYou = isKnowledgeLastSavedSolo(record);
        return `
            <li class="rank-list-row${isYou ? ' is-you' : ''}">
                <span class="rank-list-position">${rank}</span>
                <span class="rank-list-avatar">${avatarGlyph(record.avatar)}</span>
                <span class="rank-list-name">${escapeHtml(record.name)}${isYou ? ' <span class="you-chip">⭐ Kamu</span>' : ''}</span>
                <span class="rank-list-dots" aria-hidden="true"></span>
                <span class="rank-list-score">${formatKnowledgeScore(record.score)} poin<small>💡${record.hints} · 💀${record.burned}</small></span>
            </li>
        `;
    }).join('');
}

function renderKnowledgeDuelWinsPodium(records) {
    const podiumEl = document.getElementById('knowledgePodium');
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

function renderKnowledgeDuelWinsList(records) {
    const listEl = document.getElementById('knowledgeRankList');
    if (records.length === 0) {
        listEl.innerHTML = `<li class="rank-list-empty">Belum ada yang menang duel di sini.<br>Jadi yang pertama yuk 🏁</li>`;
        return;
    }
    const rest = records.slice(3, MAX_KNOWLEDGE_LEADERBOARD);
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

function goToKnowledgeDashboard(focusTab) {
    countdownRunToken++;
    document.getElementById('countdownOverlay').classList.remove('is-visible');
    setKnowledgeLeaderboardTab(focusTab || knowledgeActiveLeaderboardTab);
    switchView('knowledgeDashboard');
}

/* ---- Avatar picker (simpan skor solo & form duel) ---- */
buildAvatarPicker('knowledgeAvatarPicker', (avatar) => { knowledgeSelectedAvatar = avatar; });
buildAvatarPicker('knowledgeDuelCreateAvatarPicker', (avatar) => { knowledgeDuelCreateSelectedAvatar = avatar; });
buildAvatarPicker('knowledgeDuelJoinAvatarPicker', (avatar) => { knowledgeDuelJoinSelectedAvatar = avatar; });

/* ---- Bantuan & konfirmasi keluar ---- */
document.getElementById('knowledgeHelpButton').addEventListener('click', () => {
    showModal('knowledgeHelpModal');
});


document.getElementById('knowledgeBackToDashboardButton').addEventListener('click', () => {
    if (knowledgeGameInProgress || knowledgeDuelState) {
        showModal('knowledgeConfirmExitModal');
    } else {
        goToKnowledgeDashboard();
    }
});

document.getElementById('knowledgeConfirmExitYesButton').addEventListener('click', async () => {
    hideModal('knowledgeConfirmExitModal');
    stopKnowledgeRoundTimer();
    knowledgeGameInProgress = false;
    if (knowledgeDuelState) {
        await abandonKnowledgeDuel();
    }
    goToKnowledgeDashboard();
});

