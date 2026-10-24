/* =====================================================================
   DASHBOARD: TAB PAPAN PERINGKAT (podium ala gambar referensi)
===================================================================== */
function setActiveLeaderboardTab(count) {
    activeLeaderboardCount = count;
    document.querySelectorAll('#dashboardView .leaderboard-tab').forEach(tab => {
        tab.classList.toggle('is-active', parseInt(tab.dataset.count, 10) === count);
    });
    renderLeaderboardPanel(count);
}

function showLeaderboardLoading() {
    document.getElementById('podium').innerHTML = '<div class="leaderboard-loading">Memuat papan peringkat...</div>';
    document.getElementById('rankList').innerHTML = '';
}

async function renderLeaderboardPanel(count) {
    const myToken = ++leaderboardRequestToken;
    showLeaderboardLoading();

    const records = await getRecordsForCount(count);
    if (myToken !== leaderboardRequestToken) return; // tab sudah berpindah lagi, abaikan hasil basi

    renderPodium(records);
    renderRankList(records);
}

const PODIUM_MEDALS = { 1: '👑', 2: '🥈', 3: '🥉' };

function isLastSavedRecord(record) {
    return !!lastSavedRecord
        && lastSavedRecord.count === activeLeaderboardCount
        && lastSavedRecord.name === record.name
        && lastSavedRecord.time === record.time
        && lastSavedRecord.mistakes === record.mistakes;
}

function renderPodium(records) {
    const podiumEl = document.getElementById('podium');
    const displayOrder = [1, 0, 2]; // tampil dari kiri ke kanan: peringkat 2, 1, 3

    podiumEl.innerHTML = displayOrder.map(rankIndex => {
        const place = rankIndex + 1;
        const spotClass = place === 1 ? 'podium-first' : place === 2 ? 'podium-second' : 'podium-third';
        const record = records[rankIndex];
        const medal = `<div class="podium-medal" aria-hidden="true">${PODIUM_MEDALS[place]}</div>`;
        const base = `<div class="podium-base" aria-hidden="true"><span>${place}</span></div>`;

        if (!record) {
            return `
                <div class="podium-spot ${spotClass} is-empty" role="group" aria-label="Peringkat ${place}: masih kosong">
                    ${medal}
                    <div class="podium-avatar-wrap"><div class="podium-avatar">👤</div></div>
                    <div class="podium-name">—</div>
                    <div class="podium-score">--:--</div>
                    <div class="podium-mistakes">&nbsp;</div>
                    ${base}
                </div>
            `;
        }

        const isYou = isLastSavedRecord(record);
        return `
            <div class="podium-spot ${spotClass}${isYou ? ' is-you' : ''}" role="group"
                 aria-label="Peringkat ${place}: ${escapeHtml(record.name)}, ${formatTime(record.time)}, ${formatMistakes(record.mistakes)}">
                ${medal}
                <div class="podium-avatar-wrap"><div class="podium-avatar">${avatarGlyph(record.avatar)}</div></div>
                <div class="podium-name" title="${escapeHtml(record.name)}">${escapeHtml(record.name)}</div>
                <div class="podium-score">${formatTime(record.time)}</div>
                <div class="podium-mistakes">${formatMistakes(record.mistakes)}</div>
                ${isYou ? '<div class="you-chip">⭐ Kamu</div>' : ''}
                ${base}
            </div>
        `;
    }).join('');
}

function renderRankList(records) {
    const listEl = document.getElementById('rankList');

    if (records.length === 0) {
        listEl.innerHTML = `<li class="rank-list-empty">Belum ada pemain di sini.<br>Jadilah yang pertama mencatat skor! 🏁</li>`;
        return;
    }

    const rest = records.slice(3, MAX_LEADERBOARD_RECORDS);
    if (rest.length === 0) {
        listEl.innerHTML = '';
        return;
    }

    listEl.innerHTML = rest.map((record, i) => {
        const rank = i + 4;
        const isYou = isLastSavedRecord(record);
        return `
            <li class="rank-list-row${isYou ? ' is-you' : ''}">
                <span class="rank-list-position">${rank}</span>
                <span class="rank-list-avatar">${avatarGlyph(record.avatar)}</span>
                <span class="rank-list-name">${escapeHtml(record.name)}${isYou ? ' <span class="you-chip">⭐ Kamu</span>' : ''}</span>
                <span class="rank-list-dots" aria-hidden="true"></span>
                <span class="rank-list-score">${formatTime(record.time)}<small>${formatMistakes(record.mistakes)}</small></span>
            </li>
        `;
    }).join('');
}

document.querySelectorAll('#dashboardView .leaderboard-tab').forEach(tab => {
    tab.addEventListener('click', () => setActiveLeaderboardTab(parseInt(tab.dataset.count, 10)));
});

/* =====================================================================
   AVATAR PICKER (dipakai saat menyimpan skor)
===================================================================== */
function buildAvatarPicker(containerId, onSelect) {
    const picker = document.getElementById(containerId);
    if (!picker) return;
    const noProfileButton = `<button type="button" class="avatar-option is-selected" data-avatar="" aria-label="Tanpa foto profil">👤</button>`;
    const optionButtons = AVATAR_OPTIONS.map(avatar =>
        `<button type="button" class="avatar-option" data-avatar="${avatar}" aria-label="Avatar ${avatar}">${avatar}</button>`
    ).join('');

    picker.innerHTML = noProfileButton + optionButtons;

    picker.querySelectorAll('.avatar-option').forEach(btn => {
        btn.addEventListener('click', () => {
            picker.querySelectorAll('.avatar-option').forEach(b => b.classList.remove('is-selected'));
            btn.classList.add('is-selected');
            onSelect(btn.dataset.avatar || null);
        });
    });
}

/* =====================================================================
   MODAL: BANTUAN & PILIH JUMLAH SOAL
===================================================================== */
document.getElementById('helpButton').addEventListener('click', () => {
    showModal('helpModal');
});

document.getElementById('openStartModalButton').addEventListener('click', () => {
    showModal('chooseCountModal');
});

document.querySelectorAll('#chooseCountModal .count-option-button').forEach(btn => {
    btn.addEventListener('click', () => {
        const count = parseInt(btn.dataset.count, 10);
        hideModal('chooseCountModal');
        startGameWithCount(count);
    });
});

