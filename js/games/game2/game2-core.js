/* =====================================================================================
   GAME PENGETAHUAN DASAR
   (sengaja ditulis paralel/terpisah dari game Perkalian, bukan berbagi satu "engine" --
   supaya aman: perubahan di sini tidak berisiko merusak game Perkalian yang sudah jalan)
===================================================================================== */

/* ---- Konstanta & state ---- */
const KNOWLEDGE_ROUND_DURATION_MS = 60000; // 60 detik per ronde
const KNOWLEDGE_ROUND_BUFFER = 80; // soal yang disiapkan di depan per ronde (jauh lebih dari cukup utk 60 detik)
const MAX_KNOWLEDGE_LEADERBOARD = 10;
const KNOWLEDGE_DUEL_START_BUFFER_MS = 6000;
const KNOWLEDGE_DUEL_HEARTBEAT_INTERVAL_MS = 5000;
const KNOWLEDGE_DUEL_HEARTBEAT_TIMEOUT_MS = 13000;

let knowledgeUsedQuestionIds = [];
let knowledgeLastResolved = null; // soal TERAKHIR yang selesai diproses {q, status:'correct'|'burned'} -> sumber panel pembahasan

/* ---- Bank soal: penjelasan per opsi ----
   Bentuk utama:  { id, category, question, options:[4 teks], correctIndex, explanations:[4 teks sejajar dengan options] }
   Bentuk lain yang juga dikenali (supaya 2.000 soal Anda terbaca apa adanya):
     - options berupa objek: [{ text|teks|label, explanation|penjelasan|pembahasan, isCorrect|benar }]
     - penjelasan sejajar opsi: explanations / penjelasan / penjelasanOpsi / optionExplanations / pembahasan (array 4)
     - penjelasan per huruf: explanationA..D / penjelasanA..D / penjelasan_a..d / explanation0..3
     - penjelasan benar + pengecoh terpisah: penjelasanBenar | correctExplanation  +  penjelasanPengecoh | wrongExplanations (3, urutan pengecoh)
     - answer|jawaban + distractors|pengecoh (opsi diacak otomatis, penjelasan ikut terhubung ke opsinya)
   Awalan "Penjelasan:" di teks dibuang otomatis. */
function knPick(raw, keys) {
    for (const k of keys) {
        if (raw[k] !== undefined && raw[k] !== null && String(raw[k]).trim() !== '') return raw[k];
    }
    return undefined;
}

function knCleanExplanation(v) {
    if (v === undefined || v === null) return null;
    const text = String(v).trim().replace(/^penjelasan\s*:\s*/i, '').trim();
    return text === '' ? null : text;
}

function normalizeKnowledgeQuestion(raw, index) {
    if (!raw || typeof raw !== 'object') return null;
    const question = knPick(raw, ['question', 'pertanyaan', 'soal', 'q']);
    if (question === undefined) return null;

    const optsRaw = knPick(raw, ['options', 'pilihan', 'opsi', 'choices']);
    let items = []; // {text, expl, correct}

    if (Array.isArray(optsRaw) && optsRaw.length >= 2) {
        optsRaw.forEach((o, j) => {
            if (o && typeof o === 'object') {
                items.push({
                    text: String(knPick(o, ['text', 'teks', 'label', 'option', 'opsi', 'value', 'jawaban']) ?? ''),
                    expl: knPick(o, ['explanation', 'penjelasan', 'pembahasan', 'alasan', 'reason']),
                    correct: [o.isCorrect, o.benar, o.correct, o.is_correct].includes(true)
                });
            } else {
                items.push({ text: String(o), expl: undefined, correct: false });
            }
        });
    } else {
        const answer = knPick(raw, ['answer', 'jawaban', 'jawabanBenar', 'correctAnswer']);
        const distractors = knPick(raw, ['distractors', 'pengecoh', 'jawabanPengecoh', 'wrongAnswers']);
        if (answer === undefined || !Array.isArray(distractors)) return null;
        const answerExpl = knPick(raw, ['answerExplanation', 'penjelasanBenar', 'penjelasanJawaban', 'correctExplanation', 'explanationCorrect', 'pembahasanBenar']);
        const wrongExpl = knPick(raw, ['distractorExplanations', 'penjelasanPengecoh', 'wrongExplanations', 'penjelasanSalah', 'explanationWrong']) || [];
        items = [{ text: String(answer), expl: answerExpl, correct: true }].concat(
            distractors.map((d, j) => ({ text: String(d), expl: Array.isArray(wrongExpl) ? wrongExpl[j] : undefined, correct: false })));
        for (let i = items.length - 1; i > 0; i--) { // acak posisi; penjelasan ikut menempel pada opsinya
            const j = Math.floor(Math.random() * (i + 1));
            [items[i], items[j]] = [items[j], items[i]];
        }
    }

    // indeks jawaban benar
    let correctIndex = items.findIndex(it => it.correct);
    if (correctIndex < 0) {
        const ci = knPick(raw, ['correctIndex', 'answerIndex', 'indexJawaban', 'kunci']);
        if (typeof ci === 'string' && /^[A-Da-d]$/.test(ci.trim())) correctIndex = ci.trim().toUpperCase().charCodeAt(0) - 65;
        else if (ci !== undefined && Number.isInteger(Number(ci))) correctIndex = Number(ci);
    }
    if (correctIndex < 0) {
        const ans = knPick(raw, ['answer', 'jawaban', 'jawabanBenar', 'correctAnswer']);
        if (ans !== undefined) correctIndex = items.findIndex(it => it.text === String(ans));
    }
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= items.length) return null;

    // penjelasan: sejajar-opsi (array), per-huruf, atau benar+pengecoh terpisah -- hanya mengisi yang masih kosong
    const arr = knPick(raw, ['explanations', 'penjelasan', 'penjelasanOpsi', 'optionExplanations', 'pembahasan', 'penjelasan_opsi']);
    if (Array.isArray(arr)) arr.forEach((e, j) => { if (items[j] && items[j].expl === undefined) items[j].expl = e; });
    ['A', 'B', 'C', 'D'].forEach((L, j) => {
        if (!items[j] || items[j].expl !== undefined) return;
        const v = knPick(raw, [`explanation${L}`, `penjelasan${L}`, `penjelasan_${L.toLowerCase()}`, `explanation_${L.toLowerCase()}`, `explanation${j}`, `penjelasan${j}`]);
        if (v !== undefined) items[j].expl = v;
    });
    const cExpl = knPick(raw, ['penjelasanBenar', 'correctExplanation', 'explanationCorrect', 'pembahasanBenar', 'penjelasanJawabanBenar']);
    if (cExpl !== undefined && items[correctIndex].expl === undefined) items[correctIndex].expl = cExpl;
    const wExpl = knPick(raw, ['penjelasanPengecoh', 'wrongExplanations', 'distractorExplanations', 'penjelasanSalah', 'explanationWrong']);
    if (Array.isArray(wExpl)) {
        let k = 0;
        items.forEach((it, j) => { if (j !== correctIndex) { if (it.expl === undefined) it.expl = wExpl[k]; k++; } });
    }

    const id = raw.id !== undefined ? raw.id : index + 1;
    const category = Number(knPick(raw, ['category', 'kategori'])) || 1;
    return {
        id, category, question: String(question),
        options: items.map(it => it.text),
        correctIndex,
        explanations: items.map(it => knCleanExplanation(it.expl))
    };
}

const KNOWLEDGE_BANK = (typeof KNOWLEDGE_QUESTIONS !== 'undefined' && Array.isArray(KNOWLEDGE_QUESTIONS))
    ? KNOWLEDGE_QUESTIONS.map((raw, i) => normalizeKnowledgeQuestion(raw, i)).filter(Boolean)
    : [];
(function reportKnowledgeBankHealth() {
    if (typeof KNOWLEDGE_QUESTIONS === 'undefined') return;
    const skipped = KNOWLEDGE_QUESTIONS.length - KNOWLEDGE_BANK.length;
    const noExpl = KNOWLEDGE_BANK.filter(q => q.explanations.some(e => !e)).length;
    if (skipped > 0) console.warn(`[Pengetahuan Dasar] ${skipped} soal dilewati karena formatnya tidak dikenali.`);
    if (noExpl > 0) console.warn(`[Pengetahuan Dasar] ${noExpl} soal punya opsi tanpa penjelasan (akan tampil "belum tersedia").`);
})();
let knowledgeSequence = [];
let knowledgeSeqIndex = 0;
let knowledgeCorrectCount = 0;
// Skor disimpan dalam "persepuluhan" (10 = 1,0 poin) supaya penjumlahan 0,7 + 0,3 dst. tidak kena error pecahan desimal
let knowledgeScoreTenths = 0;
let knowledgeBurnedCount = 0;
let knowledgeHintsUsed = 0;
let knowledgeWrongClicksThisQuestion = 0;
let knowledgeHintUsedThisQuestion = false;
let knowledgeGameInProgress = false;
let knowledgeRoundTimerInterval = null;
let knowledgeRoundEndAt = 0;
let knowledgeLastSavedRecord = null;
let knowledgeActiveLeaderboardTab = 'solo';
let knowledgeSelectedAvatar = null;
let knowledgeDuelCreateSelectedAvatar = null;
let knowledgeDuelJoinSelectedAvatar = null;
let knowledgeDuelState = null;
let knowledgeDuelHeartbeatInterval = null;

// Satu nama = satu baris di papan peringkat duel (dipakai sebagai ID dokumen Firestore)
function nameToDocId(name) {
    return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'anon';
}

/* ---- Soal: rotasi kategori 1,2,3,...,N,1,2,3,...  (N ikut jumlah kategori yang ADA di data) ---- */
function getKnowledgeCategories() {
    const set = new Set(KNOWLEDGE_BANK.map(q => q.category));
    return Array.from(set).sort((a, b) => a - b);
}

function generateKnowledgeSequence(count) {
    const categories = getKnowledgeCategories();
    const byCategory = {};
    categories.forEach(c => { byCategory[c] = KNOWLEDGE_BANK.filter(q => q.category === c); });

    // Reset riwayat soal yang sudah pernah keluar kalau sisa pool sudah hampir habis,
    // supaya tidak pernah terjebak (sama seperti pola di game Perkalian)
    if (knowledgeUsedQuestionIds.length >= KNOWLEDGE_BANK.length - count) {
        knowledgeUsedQuestionIds = [];
    }

    const sequence = [];
    let pointer = 0;
    let safety = 0;
    const safetyLimit = count * 50 + 500;
    while (sequence.length < count && safety < safetyLimit) {
        safety++;
        const cat = categories[pointer % categories.length];
        pointer++;
        const pool = byCategory[cat].filter(q =>
            !knowledgeUsedQuestionIds.includes(q.id) && !sequence.some(s => s.id === q.id)
        );
        if (pool.length === 0) continue; // kategori ini lagi kering sementara, lanjut putaran berikutnya
        const pick = pool[Math.floor(Math.random() * pool.length)];
        sequence.push(pick);
        knowledgeUsedQuestionIds.push(pick.id);
    }
    return sequence;
}

/* ---- Sistem skor Pengetahuan Dasar (berdasarkan "klik ke berapa" jawaban benar) ---- */
const KNOWLEDGE_POINTS_CLICK_1 = 10;  // benar di klik pertama  = 1,0
const KNOWLEDGE_POINTS_CLICK_2 = 7;   // benar di klik kedua    = 0,7
const KNOWLEDGE_POINTS_CLICK_3 = 3;   // benar di klik ketiga   = 0,3 (juga batas maksimal jika memakai hint)
const KNOWLEDGE_POINTS_BURNED = -10;  // soal hangus            = -1,0

function knowledgePointsForCorrect(wrongClicksBefore, hintUsed) {
    const base = wrongClicksBefore === 0 ? KNOWLEDGE_POINTS_CLICK_1
        : wrongClicksBefore === 1 ? KNOWLEDGE_POINTS_CLICK_2
        : KNOWLEDGE_POINTS_CLICK_3;
    return hintUsed ? Math.min(base, KNOWLEDGE_POINTS_CLICK_3) : base;
}

/* ---- Bonus streak (benar di klik pertama, tanpa Hint, berturut-turut) & info poin di layar ---- */
let knowledgeStreak = 0;
function knowledgeStreakBonusTenths(streak) {
    if (streak <= 0 || streak % 5 !== 0) return 0;
    return streak === 5 ? 30 : streak === 10 ? 70 : 100; // +3, +7, lalu +10 (maksimal) untuk 15, 20, 25, ...
}
function knowledgeStreakLevel(streak) { return streak >= 15 ? 3 : streak >= 10 ? 2 : 1; }
function formatKnowledgePlain(tenths) {
    return (Math.abs(Math.round(tenths)) / 10).toFixed(1).replace('.', ',').replace(/,0$/, '');
}
let knowledgeGainTimer = null;
function showKnowledgeGain(tenths, bonusTenths) {
    const chip = document.getElementById('knowledgeGainChip');
    if (!chip) return;
    chip.classList.remove('is-visible', 'is-gain', 'is-loss', 'is-bonus', 'is-break');
    chip.textContent = tenths < 0
        ? `\u2212${formatKnowledgePlain(tenths)} poin`
        : `+${formatKnowledgePlain(tenths)} poin` + (bonusTenths ? ` tambah +${formatKnowledgePlain(bonusTenths)} bonus poin` : '');
    chip.classList.add(tenths < 0 ? 'is-loss' : bonusTenths ? 'is-bonus' : 'is-gain');
    void chip.offsetWidth;
    chip.classList.add('is-visible');
    clearTimeout(knowledgeGainTimer);
    knowledgeGainTimer = setTimeout(clearKnowledgeGain, 1800);
}
function breakKnowledgeStreak() {
    // Hanya diumumkan bila memang ada streak yang putus (streak >= 1)
    if (knowledgeStreak <= 0) return;
    knowledgeStreak = 0;
    const chip = document.getElementById('knowledgeGainChip');
    if (!chip) return;
    chip.classList.remove('is-visible', 'is-gain', 'is-loss', 'is-bonus', 'is-break');
    chip.textContent = 'Streak putus';
    chip.classList.add('is-break');
    void chip.offsetWidth;
    chip.classList.add('is-visible');
    clearTimeout(knowledgeGainTimer);
    knowledgeGainTimer = setTimeout(clearKnowledgeGain, 1800);
}
function clearKnowledgeGain() {
    const chip = document.getElementById('knowledgeGainChip');
    if (chip) { chip.classList.remove('is-visible', 'is-gain', 'is-loss', 'is-bonus', 'is-break'); chip.textContent = ''; }
}
function triggerKnowledgeStreakFx(streak) {
    const level = knowledgeStreakLevel(streak);
    const fx = document.getElementById('knowledgeStreakFx');
    const view = document.getElementById('knowledgeGameView');
    if (fx) {
        fx.classList.remove('is-on', 'is-lvl-1', 'is-lvl-2', 'is-lvl-3');
        void fx.offsetWidth;
        fx.classList.add('is-lvl-' + level, 'is-on');
    }
    if (view) {
        view.classList.remove('is-streak-shake', 'shake-1', 'shake-2', 'shake-3');
        void view.offsetWidth;
        view.classList.add('is-streak-shake', 'shake-' + level);
        setTimeout(() => view.classList.remove('is-streak-shake', 'shake-1', 'shake-2', 'shake-3'), 700);
    }
    try { if (navigator.vibrate) navigator.vibrate(level === 1 ? [80] : level === 2 ? [90, 40, 90] : [120, 40, 120, 40, 200]); } catch (e) { /* abaikan */ }
}

function tenthsToScore(tenths) {
    return Math.round(tenths) / 10;
}

// Format Indonesia: koma desimal, 1 angka di belakang koma, tanda minus sungguhan (mis. "7,3" / "−1,0")
function formatKnowledgeScore(score) {
    const tenths = Math.round((Number(score) || 0) * 10);
    const text = (Math.abs(tenths) / 10).toFixed(1).replace('.', ',');
    return tenths < 0 ? `\u2212${text}` : text;
}

function formatKnowledgeGain(points) {
    const tenths = Math.round(points);
    return tenths < 0 ? `\u2212${(Math.abs(tenths) / 10).toFixed(1).replace('.', ',')}` : `+${(tenths / 10).toFixed(1).replace('.', ',')}`;
}

function knowledgeScoreTenthsOf(record) {
    return Math.round((Number(record && record.score) || 0) * 10);
}

