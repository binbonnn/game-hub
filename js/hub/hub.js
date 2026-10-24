/* =====================================================================
   VIEW SWITCHING (Hub <-> Dashboard <-> Game)
===================================================================== */
function switchView(viewName) {
    hubView.classList.toggle('active', viewName === 'hub');
    dashboardView.classList.toggle('active', viewName === 'dashboard');
    gameView.classList.toggle('active', viewName === 'game');
    knowledgeDashboardView.classList.toggle('active', viewName === 'knowledgeDashboard');
    knowledgeGameView.classList.toggle('active', viewName === 'knowledgeGame');
    advmathDashboardView.classList.toggle('active', viewName === 'advmathDashboard');
    advmathGameView.classList.toggle('active', viewName === 'advmathGame');
    const memoViewEl = document.getElementById('memoView');
    if (memoViewEl) memoViewEl.classList.toggle('active', viewName === 'memo');
}

function goToHub() {
    switchView('hub');
}

function goToDashboard(focusCount) {
    countdownRunToken++; // batalkan countdown yang mungkin masih berjalan
    document.getElementById('countdownOverlay').classList.remove('is-visible');
    setActiveLeaderboardTab(focusCount || activeLeaderboardCount);
    switchView('dashboard');
}

/* =====================================================================
   HUB: PILIH GAME
===================================================================== */
document.getElementById('hubOpenMultiplyButton').addEventListener('click', () => {
    goToDashboard();
});

document.getElementById('backToHubButton').addEventListener('click', () => {
    goToHub();
});

document.getElementById('hubOpenKnowledgeButton').addEventListener('click', () => {
    goToKnowledgeDashboard();
});

document.getElementById('knowledgeBackToHubButton').addEventListener('click', () => {
    goToHub();
});

document.getElementById('hubOpenAdvmathButton').addEventListener('click', () => {
    goToAdvmathDashboard();
});

document.getElementById('advmathBackToHubButton').addEventListener('click', () => {
    goToHub();
});

function showGameComingSoonToast(btn) {
    const title = btn.querySelector('.game-card-title')?.textContent?.trim() || 'Game ini';
    showToast('danger', `🔒 ${title} segera hadir, nantikan ya!`, 3500);
}

document.querySelectorAll('.game-card.is-coming-soon, .game-card-soon').forEach(btn => {
    btn.addEventListener('click', () => showGameComingSoonToast(btn));
});

