/* =====================================================================================
   GAME PERKALIAN 1-10 LANJUTAN
   (sengaja ditulis paralel/terpisah dari game Perkalian, bukan berbagi satu "engine" --
   supaya aman: perubahan di sini tidak berisiko merusak game Perkalian yang sudah jalan)
===================================================================================== */

/* ---- Konstanta & state ---- */
const ADVMATH_COUNT_OPTIONS = [10, 20, 30];
const MAX_ADVMATH_LEADERBOARD = 7;        // papan peringkat per jumlah soal (sama seperti game Perkalian 1-10)
const MAX_ADVMATH_DUEL_LEADERBOARD = 10;  // papan kemenangan duel (tidak berubah)
const ADVMATH_DUEL_START_BUFFER_MS = 6000;
const ADVMATH_DUEL_HEARTBEAT_INTERVAL_MS = 5000;
const ADVMATH_DUEL_HEARTBEAT_TIMEOUT_MS = 13000;

// Hukuman jawaban salah: kumulatif & terpisah (salah ke-1, ke-2, ke-3 pada SATU soal), dalam detik
const ADVMATH_WRONG_PENALTIES = [60, 180, 300];
const ADVMATH_MAX_WRONG = ADVMATH_WRONG_PENALTIES.length; // salah ke-3 => soal hangus
// Hint: hukuman (detik, dikenakan sekali per tingkat per soal) & durasi akses clue (detik)
const ADVMATH_HINT_CONFIG = {
    1: { penalty: 100, durationSec: 30 },
    2: { penalty: 200, durationSec: 30 },
    3: { penalty: 300, durationSec: 45 }   // Hint 3 = pembahasan penuh => soal langsung hangus
};
const ADVMATH_HINT_LEVELS = [1, 2, 3];
const ADVMATH_CORRECT_ADVANCE_DELAY_MS = 450;

let advmathUsedQuestionIds = [];
let advmathSequence = [];
let advmathCount = 20;                 // jumlah soal pada sesi yang sedang berjalan
let advmathSeqIndex = 0;
let advmathCorrectCount = 0;
let advmathBurnedCount = 0;
let advmathMistakeCount = 0;           // total klik jawaban salah
let advmathHintsUsed = 0;              // total tingkat hint yang dibuka (tiap tingkat dihitung sekali per soal)
let advmathPenaltySeconds = 0;         // total hukuman waktu yang SUDAH diterapkan (satu-satunya sumber hukuman)
let advmathStartTime = 0;              // ms, diambil saat countdown selesai
let advmathFinalLocked = false;
let advmathFinalSeconds = 0;           // total waktu akhir resmi (aktual + hukuman) -> dasar peringkat & simpan
let advmathActualSeconds = 0;          // bagian waktu aktual dari total akhir (untuk rincian di layar hasil)
let advmathGameInProgress = false;
let advmathUiInterval = null;
let advmathLastShownSeconds = -1;
let advmathLastSavedRecord = null;
let advmathActiveLeaderboardTab = '10'; // '10' | '20' | '30' | 'duel'
let advmathLeaderboardRequestToken = 0;
let advmathSelectedAvatar = null;
let advmathDuelCreateSelectedAvatar = null;
let advmathDuelJoinSelectedAvatar = null;
let advmathDuelState = null;
let advmathDuelHeartbeatInterval = null;

// Status SATU soal yang sedang aktif. Dibuat ulang total setiap pindah soal (lihat resetAdvmathQuestionState).
let advmathQ = null;
let advmathQuestionToken = 0; // naik tiap pindah soal; callback tertunda yang membawa token lama otomatis diabaikan

// Satu nama = satu baris di papan peringkat duel (dipakai sebagai ID dokumen Firestore)
function nameToDocId(name) {
    return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'anon';
}

/* ---- Format waktu: mm:ss, dan h:mm:ss kalau lebih dari 1 jam (hukuman bisa membuat total waktu panjang) ---- */
function formatAdvmathDuration(totalSeconds) {
    const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/* ---- Bank soal: toleran terhadap beberapa penamaan field supaya file 2.000 soal Anda tetap terbaca ----
   Bentuk utama (disarankan):
     { id, category, question, options: [4 teks], correctIndex, clue1, clue2, clue3 }
   Bentuk lain yang juga dikenali:
     - pertanyaan / soal            -> question
     - kategori                     -> category
     - pilihan / opsi               -> options
     - answer|jawaban + distractors|pengecoh (3 teks) -> options diacak otomatis
     - clue_1 / hint1 / petunjuk1 / clues:[..] / hints:[..] / petunjuk:[..]  -> clue1..clue3
*/
function advmathPick(raw, keys) {
    for (const k of keys) {
        if (raw[k] !== undefined && raw[k] !== null && String(raw[k]).trim() !== '') return raw[k];
    }
    return undefined;
}

function normalizeAdvmathQuestion(raw, index) {
    if (!raw || typeof raw !== 'object') return null;
    const question = advmathPick(raw, ['question', 'pertanyaan', 'soal', 'q']);
    if (question === undefined) return null;

    let options = advmathPick(raw, ['options', 'pilihan', 'opsi', 'choices']);
    let correctIndex = advmathPick(raw, ['correctIndex', 'answerIndex', 'indexJawaban', 'kunci']);

    if (!Array.isArray(options) || options.length < 2) {
        const answer = advmathPick(raw, ['answer', 'jawaban', 'jawabanBenar', 'correct', 'correctAnswer']);
        const distractors = advmathPick(raw, ['distractors', 'pengecoh', 'jawabanPengecoh', 'wrongAnswers']);
        if (answer === undefined || !Array.isArray(distractors)) return null;
        options = [answer, ...distractors];
        // acak urutan supaya jawaban benar tidak selalu di posisi pertama
        for (let i = options.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [options[i], options[j]] = [options[j], options[i]];
        }
        correctIndex = options.findIndex(o => String(o) === String(answer));
    }
    options = options.map(o => String(o));
    correctIndex = Number(correctIndex);
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) return null;

    const clueArray = advmathPick(raw, ['clues', 'hints', 'petunjuk']);
    const clues = [1, 2, 3].map(n => {
        const direct = advmathPick(raw, [`clue${n}`, `clue_${n}`, `Clue${n}`, `Clue_${n}`, `clue ${n}`, `hint${n}`, `hint_${n}`, `petunjuk${n}`, `petunjuk_${n}`]);
        if (direct !== undefined) return String(direct);
        if (Array.isArray(clueArray) && clueArray[n - 1] !== undefined) return String(clueArray[n - 1]);
        return 'Clue untuk tingkat ini belum tersedia pada soal ini.';
    });

    const id = raw.id !== undefined ? raw.id : index + 1;
    const category = Number(advmathPick(raw, ['category', 'kategori'])) || 1;
    return { id, category, question: String(question), options, correctIndex, clues };
}

const ADVMATH_BANK = (typeof ADVMATH_QUESTIONS !== 'undefined' && Array.isArray(ADVMATH_QUESTIONS))
    ? ADVMATH_QUESTIONS.map((raw, i) => normalizeAdvmathQuestion(raw, i)).filter(Boolean)
    : [];
if (typeof ADVMATH_QUESTIONS !== 'undefined' && ADVMATH_BANK.length !== ADVMATH_QUESTIONS.length) {
    console.warn(`[Perkalian 1-10 Lanjutan] ${ADVMATH_QUESTIONS.length - ADVMATH_BANK.length} soal dilewati karena formatnya tidak dikenali.`);
}

/* ---- Soal: rotasi kategori 1,2,3,...,N,1,2,3,...  (N ikut jumlah kategori yang ADA di data) ---- */
function getAdvmathCategories() {
    const set = new Set(ADVMATH_BANK.map(q => q.category));
    return Array.from(set).sort((a, b) => a - b);
}

function generateAdvmathSequence(count) {
    const categories = getAdvmathCategories();
    if (categories.length === 0) return [];
    const byCategory = {};
    categories.forEach(c => { byCategory[c] = ADVMATH_BANK.filter(q => q.category === c); });

    // Reset riwayat soal yang sudah pernah keluar kalau sisa pool sudah hampir habis,
    // supaya tidak pernah terjebak (sama seperti pola di game Perkalian)
    if (advmathUsedQuestionIds.length >= ADVMATH_BANK.length - count) {
        advmathUsedQuestionIds = [];
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
            !advmathUsedQuestionIds.includes(q.id) && !sequence.some(s => s.id === q.id)
        );
        if (pool.length === 0) continue; // kategori ini lagi kering sementara, lanjut putaran berikutnya
        const pick = pool[Math.floor(Math.random() * pool.length)];
        sequence.push(pick);
        advmathUsedQuestionIds.push(pick.id);
    }
    return sequence;
}

