#!/usr/bin/env node
/* =========================================================
   Pemeriksa struktur firestore.rules (tanpa Firebase CLI/Java).

   Ini BUKAN pengganti Firestore Emulator. Skrip hanya memeriksa:
     - keseimbangan kurung kurawal, kurung biasa, dan kurung siku
     - komentar dan string tidak mengacaukan hitungan
     - setiap "allow" berada di dalam blok match
     - setiap blok match memiliki path yang valid
     - fungsi dideklarasikan sebelum dipakai dan tidak duplikat
     - semua nama fungsi yang dipanggil benar-benar ada
     - header rules_version dan service cloud.firestore ada

   Pemakaian:  node tools/validate-rules.js [file]
   Keluar dengan kode 1 bila ada masalah.
   ========================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const file = process.argv[2] || path.join(__dirname, '..', 'firestore.rules');
const src = fs.readFileSync(file, 'utf8');
const errors = [];
const warnings = [];

/* ---------- 1. Buang komentar & string, catat posisi baris ---------- */
const lineStarts = [0];
for (let i = 0; i < src.length; i++) if (src[i] === '\n') lineStarts.push(i + 1);
const lineOf = pos => {
  let lo = 0, hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= pos) lo = mid; else hi = mid - 1;
  }
  return lo + 1;
};

// Ganti isi komentar dengan spasi; isi string dengan spasi di `clean`.
// Panjang teks dan posisi baris dipertahankan agar nomor baris tetap akurat.
let noComments = ''; // komentar dibuang, string utuh (untuk cek header)
let clean = '';      // komentar dan string dibuang (untuk cek struktur)
for (let i = 0; i < src.length; i++) {
  const c = src[i];
  if (c === '/' && src[i + 1] === '/') {
    while (i < src.length && src[i] !== '\n') { noComments += ' '; clean += ' '; i++; }
    if (i < src.length) { noComments += '\n'; clean += '\n'; }
    continue;
  }
  if (c === '/' && src[i + 1] === '*') {
    const end = src.indexOf('*/', i + 2);
    if (end === -1) errors.push(`Baris ${lineOf(i)}: komentar block tidak ditutup dengan */ .`);
    const stop = end === -1 ? src.length : end + 2;
    for (; i < stop; i++) {
      const ch = src[i];
      noComments += ch === '\n' ? '\n' : ' ';
      clean += ch === '\n' ? '\n' : ' ';
    }
    i--;
    continue;
  }
  if (c === '"' || c === "'") {
    const quote = c;
    noComments += c;
    clean += ' ';
    i++;
    while (i < src.length && src[i] !== quote) {
      if (src[i] === '\\') {
        noComments += src[i] + (src[i + 1] || '');
        clean += '  ';
        i += 2;
        continue;
      }
      noComments += src[i];
      clean += src[i] === '\n' ? '\n' : ' ';
      i++;
    }
    noComments += quote;
    clean += ' ';
    continue;
  }
  noComments += c;
  clean += c;
}

/* ---------- 2. Keseimbangan kurung ---------- */
const pairs = { '}': '{', ')': '(', ']': '[' };
const stack = [];
for (let i = 0; i < clean.length; i++) {
  const c = clean[i];
  if (c === '{' || c === '(' || c === '[') stack.push({ c, i });
  else if (c === '}' || c === ')' || c === ']') {
    const top = stack.pop();
    if (!top) errors.push(`Baris ${lineOf(i)}: "${c}" penutup tanpa pembuka.`);
    else if (top.c !== pairs[c]) {
      errors.push(`Baris ${lineOf(i)}: "${c}" menutup "${top.c}" dari baris ${lineOf(top.i)}.`);
    }
  }
}
stack.forEach(s => errors.push(`Baris ${lineOf(s.i)}: "${s.c}" tidak pernah ditutup.`));

/* ---------- 3. Header ---------- */
if (!/rules_version\s*=\s*['"]2['"]\s*;/.test(noComments)) errors.push("rules_version = '2'; tidak ditemukan.");
if (!/service\s+cloud\.firestore\s*\{/.test(clean)) errors.push('service cloud.firestore tidak ditemukan.');

/* ---------- 4. Kedalaman blok & allow di dalam match ---------- */
// Telusuri token kunci: match / function / allow beserta kedalamannya.
const tokens = [];
const re = /\b(match|function|allow|service|rules_version)\b/g;
let m;
while ((m = re.exec(clean))) {
  let depth = 0;
  for (let i = 0; i < m.index; i++) {
    const c = clean[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
  }
  tokens.push({ word: m[1], index: m.index, depth: depth, line: lineOf(m.index) });
}

const funcs = new Map();
let matchDepth = -1;
tokens.forEach((t, idx) => {
  if (t.word === 'match') {
    matchDepth = t.depth;
    const head = clean.slice(t.index, clean.indexOf('{', t.index)).replace(/\s+/g, ' ').trim();
    if (!/^match\s+\/[^\s{]+\s*$/.test(head) && !/^match\s+\/\{[^}]+\}\s*$/.test(head)) {
      // path boleh mengandung wildcard {name=**}
      if (!/^match\s+\/.*$/.test(head)) errors.push(`Baris ${t.line}: path match tidak valid -> "${head}"`);
    }
  }
  if (t.word === 'allow' && t.depth <= matchDepth) {
    errors.push(`Baris ${t.line}: "allow" berada di luar blok match.`);
  }
  if (t.word === 'function') {
    const rest = clean.slice(t.index);
    const fm = /^function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(rest);
    if (!fm) {
      errors.push(`Baris ${t.line}: deklarasi function tidak valid.`);
      return;
    }
    const name = fm[1];
    if (funcs.has(name)) errors.push(`Baris ${t.line}: fungsi "${name}" dideklarasikan dua kali (pertama di baris ${funcs.get(name)}).`);
    else funcs.set(name, t.line);
    if (t.depth < matchDepth) warnings.push(`Baris ${t.line}: fungsi "${name}" dideklarasikan setelah match dimulai.`);
  }
});

/* ---------- 5. Fungsi dipakai sebelum dideklarasikan ---------- */
// Kumpulkan semua pemanggilan "nama(" di luar deklarasi, lalu bandingkan posisi.
const callRe = /(^|[^A-Za-z0-9_.])([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
const builtins = new Set([
  'get', 'exists', 'debug', 'int', 'float', 'string', 'bool', 'map', 'list', 'timestamp',
  'duration', 'path', 'latlng', 'number', 'set', 'size', 'keys', 'hasOnly', 'hasAny', 'hasAll',
  'matches', 'toMillis', 'split', 'join', 'lower', 'upper', 'trim', 'replace', 'getAfter'
]);
const declPos = new Map();
const declRe = /\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
let dm;
while ((dm = declRe.exec(clean))) declPos.set(dm[1], dm.index);

const reported = new Set();
while ((m = callRe.exec(clean))) {
  const name = m[2];
  if (name === 'function' || name === 'if' || name === 'return') continue;
  if (!declPos.has(name)) {
    if (!builtins.has(name) && !reported.has(name)) {
      errors.push(`Baris ${lineOf(m.index)}: memanggil "${name}()" yang tidak dideklarasikan (bukan fungsi bawaan yang dikenal).`);
      reported.add(name);
    }
    continue;
  }
  const callPos = m.index + m[1].length;
  if (declPos.get(name) > callPos && !reported.has(name + '@')) {
    errors.push(`Baris ${lineOf(callPos)}: "${name}()" dipakai sebelum dideklarasikan (baris ${lineOf(declPos.get(name))}).`);
    reported.add(name + '@');
  }
}

/* ---------- 6. Cek ringan pola berisiko ---------- */
if (/resource\.data\.\w+\s*!=\s*null/.test(clean)) warnings.push('Ada perbandingan "field != null"; gunakan "field == null || ..." agar aman saat field tidak ada.');

/* ---------- 7. Laporan ---------- */
const rel = path.relative(process.cwd(), file) || file;
console.log(`File      : ${rel}`);
console.log(`Baris     : ${src.split(/\r?\n/).length}`);
console.log(`Fungsi    : ${funcs.size}`);
console.log(`Match     : ${tokens.filter(t => t.word === 'match').length}`);
console.log(`Allow     : ${tokens.filter(t => t.word === 'allow').length}`);
if (warnings.length) {
  console.log('\nPeringatan:');
  warnings.forEach(w => console.log('  ! ' + w));
}
if (errors.length) {
  console.log('\nMasalah:');
  errors.forEach(e => console.log('  x ' + e));
  console.log(`\nGAGAL: ${errors.length} masalah.`);
  process.exit(1);
}
console.log('\nOK: struktur seimbang, semua allow di dalam match, semua fungsi dikenal.');
