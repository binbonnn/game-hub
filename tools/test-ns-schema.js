/* Uji validator data Nusantara Sirna. Jalankan: node tests/nusantara-schema.test.js (dari folder proyek).
   Berisi uji data asli (harus lolos) dan uji "data dirusak" (harus ditolak). */
const fs = require('fs'), path = require('path');
const S = require('../js/data/ns-schema.js');
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };
const load = () => { const d = {}; S.FILES.forEach(f => d[f] = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/nusantara', f + '.json'), 'utf8'))); return d; };

const base = S.validate(load());
ok(base.ok, 'data asli lolos validasi' + (base.ok ? '' : ': ' + base.errors.slice(0, 3).join(' | ')));
ok(JSON.stringify(base.summary) === JSON.stringify({ characters: 40, synergies: 16, commanders: 8, arenas: 9, bosses: 135 }), 'ringkasan 40/16/8/9/135');
ok(base.warnings.length === 1 && /77 dari 135/.test(base.warnings[0]), 'peringatan bos tanpa kelemahan tercatat (77 dari 135)');

// tiap kasus merusak satu hal; validator HARUS menolak dan menyebut bagian yang salah
const cases = [
  ['karakter dihapus satu', d => d.characters.characters.pop(), /characters/],
  ['id karakter ganda', d => { d.characters.characters[1].id = d.characters.characters[0].id; }, /id ganda/],
  ['nama karakter dua kata', d => { d.characters.characters[0].name = 'Dua Kata'; }, /satu kata/],
  ['biaya karakter 6', d => { d.characters.characters[0].cost = 6; }, /cost/],
  ['asal karakter tidak ada', d => { d.characters.characters[0].asal = 'Zzz'; }, /asal "Zzz"/],
  ['HP karakter bukan angka', d => { d.characters.characters[0].stats1Star.hp = 'x'; }, /stats1Star\.hp/],
  ['skill tanpa nilai', d => { delete d.characters.characters[0].skill.value; }, /skill/],
  ['ambang sinergi tidak menaik', d => { d.synergies.synergies[0].thresholds = [3, 2, 5]; }, /thresholds/],
  ['jumlah anggota sinergi salah', d => { d.synergies.synergies[0].memberCount = 99; }, /memberCount/],
  ['arena afinitas Commander tidak ada', d => { d.commanders.commanders[0].affinityArena = 'Arena Hantu'; }, /affinityArena/],
  ['layout arena 6 baris', d => { d.arenas.arenas[0].layout.pop(); }, /layout/],
  ['petak unit jadi jalur', d => { d.arenas.arenas[0].layout[0] = '.JUUUUU..'; }, /layout|pathOrder|unitTileCoverage/],
  ['jalur tidak bersebelahan', d => { const p = d.arenas.arenas[0].pathOrder; const t = p[3]; p[3] = p[5]; p[5] = t; }, /bersebelahan|sel/],
  ['sel jalur pertama bukan portal', d => { const p = d.arenas.arenas[0].pathOrder; p.reverse(); }, /portal S|Commander E/],
  ['pengali HP arena di luar rentang', d => { d.arenas.arenas[0].enemyHpMultiplier = 2; }, /enemyHpMultiplier/],
  ['bos kelemahan sinergi tidak ada', d => { d.bosses.bosses['Pelataran Keraton Wirasana'][0].weakAgainst = ['Qqq']; }, /weakAgainst/],
  ['ronde bos salah', d => { d.bosses.bosses['Pelataran Keraton Wirasana'][0].round = 6; }, /ronde harus 5/],
  ['bos sakral kembali muncul', d => { d.bosses.bosses['Pelataran Keraton Wirasana'][0].boss = 'Batara Kala'; }, /sakral/],
  ['peluang toko tidak 100', d => { d.economy.levels[0].shopOddsPercent = [90, 0, 0, 0, 0]; }, /shopOddsPercent/],
  ['slot toko 6', d => { d.economy.shopSlots = 6; }, /shopSlots/],
  ['pengali bintang 3 salah', d => { d.economy.starMultiplier.star3 = 3; }, /starMultiplier/],
  ['HP awal Commander 90', d => { d.rules.match.commanderStartHp = 90; }, /rules\.match/],
  ['rumus gelombang diubah', d => { d.rules.waves.creepHpGrowthPerRound = 1.05; }, /rules\.waves/],
  ['file aturan hilang', d => { delete d.rules; }, /rules/],
  ['file ronde hilang', d => { delete d.rounds; }, /rounds/],
  ['waktu persiapan 5 detik', d => { d.rounds.prepSeconds = 5; }, /prepSeconds/],
  ['nama ronde 7 kosong', d => { d.rounds.normalRounds['7'].name = ''; }, /normalRounds\[7\]/],
  ['ronde 5 (bos) diberi nama sendiri', d => { d.rounds.normalRounds['5'] = { name: 'x', desc: 'y' }; }, /normalRounds\[5\]/],
  ['deskripsi ronde terlalu panjang', d => { d.rounds.normalRounds['2'].desc = 'x'.repeat(100); }, /terlalu panjang/],
  ['berkas karakter bukan larik', d => { d.characters = { characters: 'rusak' }; }, /characters/],
];
cases.forEach(([nama, rusak, re]) => {
  const d = load(); rusak(d);
  let r; try { r = S.validate(d); } catch (e) { ok(false, 'ditolak tanpa crash: ' + nama + ' (validator melempar ' + e.message + ')'); return; }
  ok(!r.ok && r.errors.some(e => re.test(e)), 'ditolak: ' + nama + (r.ok ? ' (MALAH LOLOS)' : r.errors.some(e => re.test(e)) ? '' : ' (galat tidak menyebut bagiannya: ' + r.errors[0] + ')'));
});
let nullOk = true; try { const r = S.validate(null); nullOk = !r.ok; } catch (e) { nullOk = false; }
ok(nullOk, 'validate(null) ditolak tanpa crash');
console.log('\nRINGKASAN ' + pass + ' lulus, ' + fail + ' gagal');
process.exit(fail ? 1 : 0);
