/* =========================================================
   Normalisasi bank soal Game 2 & Game 3.

   Pemakaian (dari akar proyek):
     node tools/build-banks.js
     node tools/build-banks.js <knowledge-questions.js> <advmath-questions.js>

   Sumber boleh memakai beberapa penamaan field. Keluaran ditulis ke
   js/data/knowledge.js dan js/data/advmath.js dalam bentuk yang dipakai
   game-quiz.js. Jalankan ulang hanya bila file sumber berubah.
   ========================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const knowledgeSrc = process.argv[2] || 'C:/Users/USER/Downloads/game-hub-g5-fase8f-kode/data/knowledge-questions.js';
const advmathSrc = process.argv[3] || 'C:/Users/USER/Downloads/game-hub-g5-fase8f-kode/data/advmath-questions.js';

function load(file, names) {
  const code = fs.readFileSync(file, 'utf8');
  const fn = new Function(code + '\nreturn {' + names.join(',') + '};');
  return fn();
}

function text(value) {
  return String(value == null ? '' : value).trim();
}

function qid(prefix, index) {
  return prefix + (index + 1);
}

function pick(raw, keys) {
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (raw[key] !== undefined && raw[key] !== null && text(raw[key]) !== '') return raw[key];
  }
  return undefined;
}

function normalizeOptions(raw) {
  let options = pick(raw, ['options', 'pilihan', 'opsi', 'choices']);
  let correctIndex = pick(raw, ['correctIndex', 'answerIndex', 'indexJawaban', 'kunci']);

  if (!Array.isArray(options) || options.length < 2) {
    const answer = pick(raw, ['answer', 'jawaban', 'jawabanBenar', 'correct', 'correctAnswer']);
    const wrongs = pick(raw, ['distractors', 'pengecoh', 'jawabanPengecoh', 'wrongAnswers']);
    if (answer === undefined || !Array.isArray(wrongs)) return null;
    options = [answer].concat(wrongs);
    correctIndex = options.findIndex(function (o) { return String(o) === String(answer); });
  }

  options = options.map(text);
  correctIndex = Number(correctIndex);
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) return null;
  return { options: options, correctIndex: correctIndex };
}

function normalizeKnowledge(raw, index, names) {
  if (!raw || typeof raw !== 'object') return null;
  const question = pick(raw, ['question', 'pertanyaan', 'soal', 'q']);
  if (question === undefined) return null;
  const opt = normalizeOptions(raw);
  if (!opt) return null;
  const categoryId = Number(pick(raw, ['category', 'kategori'])) || 1;
  const explanations = pick(raw, ['explanations', 'pembahasan', 'penjelasan']);
  return {
    id: qid('kn_', index),
    srcId: raw.id === undefined ? index + 1 : raw.id,
    categoryId: categoryId,
    category: names[categoryId] || 'Umum',
    question: text(question),
    options: opt.options,
    correctIndex: opt.correctIndex,
    explanations: Array.isArray(explanations) && explanations.length
      ? opt.options.map(function (_, i) { return text(explanations[i]) || ''; })
      : opt.options.map(function (_, i) { return i === opt.correctIndex ? 'Jawaban ini benar.' : 'Jawaban ini kurang tepat.'; })
  };
}

function normalizeAdvmath(raw, index, names) {
  if (!raw || typeof raw !== 'object') return null;
  const question = pick(raw, ['question', 'pertanyaan', 'soal', 'q']);
  if (question === undefined) return null;
  const opt = normalizeOptions(raw);
  if (!opt) return null;
  const categoryId = Number(pick(raw, ['category', 'kategori'])) || 1;
  const clueArray = pick(raw, ['clues', 'hints', 'petunjuk']);
  const clues = [1, 2, 3].map(function (n) {
    const direct = pick(raw, ['clue' + n, 'clue_' + n, 'hint' + n, 'hint_' + n, 'petunjuk' + n, 'petunjuk_' + n]);
    if (direct !== undefined) return text(direct);
    if (Array.isArray(clueArray) && clueArray[n - 1] !== undefined) return text(clueArray[n - 1]);
    return 'Petunjuk tingkat ini belum tersedia.';
  });
  return {
    id: qid('adv_', index),
    srcId: raw.id === undefined ? index + 1 : raw.id,
    categoryId: categoryId,
    category: names[categoryId] || 'Menantang',
    level: categoryId,
    question: text(question),
    options: opt.options,
    correctIndex: opt.correctIndex,
    clues: clues
  };
}

function writeBank(file, header, globalName, bank, metaName, extra) {
  const lines = bank.map(function (q) { return '    ' + JSON.stringify(q); });
  const meta = Object.assign({ count: bank.length }, extra);
  const out = '/* =========================================================\n' +
    '   ' + header + '\n' +
    '   DIGENERASI oleh tools/build-banks.js dari bank soal asli.\n' +
    '   Jangan ubah manual; ubah file sumber lalu jalankan ulang generator.\n' +
    '   ========================================================= */\n' +
    '(function () {\n' +
    "  'use strict';\n" +
    '  var GH = window.GH = window.GH || {};\n' +
    '  var bank = [\n' + lines.join(',\n') + '\n  ];\n' +
    '  GH.bank = GH.bank || {};\n' +
    '  GH.bank.' + globalName + ' = bank;\n' +
    '  GH.bank.' + metaName + ' = ' + JSON.stringify(meta) + ';\n' +
    '})();\n';
  fs.writeFileSync(file, out, 'utf8');
}

function main() {
  const knowledge = load(knowledgeSrc, ['KNOWLEDGE_QUESTIONS', 'KNOWLEDGE_CATEGORY_NAMES']);
  const advmath = load(advmathSrc, ['ADVMATH_QUESTIONS']);

  const kNames = knowledge.KNOWLEDGE_CATEGORY_NAMES || {
    1: 'Geografi', 2: 'Sains & Teknologi', 3: 'Sejarah & Tokoh', 4: 'Bahasa & Budaya', 5: 'Matematika & Logika'
  };
  /* ADVMATH_CATEGORY_NAMES di file sumber memakai kunci ganda, jadi nama ditetapkan di sini. */
  const aNames = { 1: 'Menengah', 2: 'Menantang', 3: 'Sulit', 4: 'Advance', 5: 'Expert' };

  const kBank = knowledge.KNOWLEDGE_QUESTIONS.map(function (q, i) { return normalizeKnowledge(q, i, kNames); }).filter(Boolean);
  const aBank = advmath.ADVMATH_QUESTIONS.map(function (q, i) { return normalizeAdvmath(q, i, aNames); }).filter(Boolean);

  if (kBank.length !== knowledge.KNOWLEDGE_QUESTIONS.length) {
    throw new Error('Bank pengetahuan ada soal yang gagal dinormalisasi: ' + kBank.length + '/' + knowledge.KNOWLEDGE_QUESTIONS.length);
  }
  if (aBank.length !== advmath.ADVMATH_QUESTIONS.length) {
    throw new Error('Bank perkalian lanjutan ada soal yang gagal dinormalisasi: ' + aBank.length + '/' + advmath.ADVMATH_QUESTIONS.length);
  }

  writeBank(path.join(root, 'js', 'data', 'knowledge.js'),
    'Game Hub v2 - Bank soal Pengetahuan Dasar (2.000 soal)',
    'knowledge', kBank, 'knowledgeMeta',
    { categories: Array.from(new Set(kBank.map(function (q) { return q.category; }))), format: 'id, category, question, options, correctIndex, explanations' });

  writeBank(path.join(root, 'js', 'data', 'advmath.js'),
    'Game Hub v2 - Bank soal Perkalian Lanjutan / Matematika (2.000 soal)',
    'advmath', aBank, 'advmathMeta',
    { categories: Array.from(new Set(aBank.map(function (q) { return q.category; }))), format: 'id, category, question, options, correctIndex, clues' });

  console.log('knowledge: ' + kBank.length + ' soal');
  console.log('advmath:   ' + aBank.length + ' soal');
}

main();
