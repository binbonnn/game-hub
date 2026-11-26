/* =========================================================
   Game Hub v2 · Nusantara Sirna data
   Semua aturan yang bisa didata dipisahkan dari presentasi.
   ========================================================= */
(function () {
  'use strict';
  var GH = window.GH = window.GH || {};
  var U = GH.util;

  var ORIGINS = {
    sri:   { id: 'sri',   name: 'Sri',   icon: '❀', color: '#e6b86a', desc: 'Kejayaan, tanah, dan ketahanan.' },
    hyang: { id: 'hyang', name: 'Hyang', icon: '✦', color: '#a78bfa', desc: 'Cahaya, sabda, dan kekuatan batin.' },
    tau:   { id: 'tau',   name: 'Tau',   icon: '◈', color: '#62c9ff', desc: 'Air, aliran, dan pemulihan.' },
    hut:   { id: 'hut',   name: 'Hut',   icon: '♣', color: '#4fe0a6', desc: 'Rimba, akar, dan kehidupan.' },
    jong:  { id: 'jong',  name: 'Jong',  icon: '⛵', color: '#38bdf8', desc: 'Laut, pelayaran, dan keberanian.' },
    dwi:   { id: 'dwi',   name: 'Dwi',   icon: '∞', color: '#ff79c6', desc: 'Keseimbangan dan penguatan.' },
    rim:   { id: 'rim',   name: 'Rim',   icon: '❖', color: '#84cc16', desc: 'Belantara, insting, dan amukan.' },
    kei:   { id: 'kei',   name: 'Kei',   icon: '↯', color: '#f59e0b', desc: 'Kelincahan, kilat, dan tipu daya.' }
  };

  var PATHS = {
    mpu:  { id: 'mpu',  name: 'Mpu',  icon: '⚒', color: '#c084fc', desc: 'Cipta, senjata, dan perlindungan.' },
    lir:  { id: 'lir',  name: 'Lir',  icon: '≈', color: '#38bdf8', desc: 'Aliran, pemulihan, dan kelembutan.' },
    dung: { id: 'dung', name: 'Dung', icon: '⛨', color: '#94a3b8', desc: 'Benteng, keteguhan, dan pengorbanan.' },
    nah:  { id: 'nah',  name: 'Nah',  icon: '✹', color: '#ef4444', desc: 'Amarah, ledakan, dan keberanian.' },
    tam:  { id: 'tam',  name: 'Tam',  icon: '✧', color: '#fbbf24', desc: 'Ruang tamu, dagang, dan sambutan.' },
    wang: { id: 'wang', name: 'Wang', icon: '◉', color: '#facc15', desc: 'Kemakmuran dan keberuntungan.' },
    kar:  { id: 'kar',  name: 'Kar',  icon: '▲', color: '#a8a29e', desc: 'Batu, keteguhan, dan pertahanan.' },
    gong: { id: 'gong', name: 'Gong', icon: '◎', color: '#f472b6', desc: 'Gema, irama, dan hentakan.' }
  };

  var SKILLS = {
    damage:    { label: 'Tebasan',        desc: 'Melukai satu musuh.' },
    area:      { label: 'Hantaman Area',  desc: 'Melukai musuh di sekitar target.' },
    periodic:  { label: 'Racun Berkala',  desc: 'Melukai musuh selama beberapa detik.' },
    heal:      { label: 'Pemulih',        desc: 'Memulihkan HP sekutu terlemah.' },
    healArea:  { label: 'Restu Area',     desc: 'Memulihkan HP sekutu di sekitar.' },
    shield:    { label: 'Perisai',        desc: 'Memberi perisai kepada sekutu.' },
    buff:      { label: 'Semangat',       desc: 'Menaikkan ATK sekutu.' },
    cc:        { label: 'Cengkeram',      desc: 'Menghentikan musuh sementara.' },
    summon:    { label: 'Panggilan',      desc: 'Memanggil roh penjaga.' },
    mana:      { label: 'Gema Mana',      desc: 'Memulihkan mana sekutu.' }
  };

  /* [id, name, cost, origin, path, skill, power, range, hp, atk] */
  var ROW = [
    ['wira', 'Wira', 1, 'sri', 'dung', 'damage', 70, 1, 620, 46],
    ['bayu', 'Bayu', 1, 'kei', 'lir', 'buff', 12, 2, 520, 50],
    ['sari', 'Sari', 1, 'hut', 'lir', 'heal', 110, 2, 540, 40],
    ['danu', 'Danu', 1, 'tau', 'mpu', 'shield', 130, 2, 580, 42],
    ['laras', 'Laras', 1, 'hyang', 'gong', 'mana', 18, 2, 500, 38],
    ['kala', 'Kala', 1, 'rim', 'nah', 'damage', 78, 1, 560, 52],
    ['raka', 'Raka', 1, 'jong', 'tam', 'damage', 64, 2, 530, 48],
    ['nila', 'Nila', 1, 'dwi', 'kar', 'buff', 10, 1, 620, 44],

    ['aruna', 'Aruna', 2, 'sri', 'nah', 'area', 82, 1, 720, 58],
    ['bima', 'Bima', 2, 'jong', 'dung', 'shield', 190, 1, 780, 55],
    ['cempaka', 'Cempaka', 2, 'hut', 'mpu', 'healArea', 95, 2, 700, 50],
    ['daksa', 'Daksa', 2, 'rim', 'kar', 'damage', 120, 1, 820, 60],
    ['eka', 'Eka', 2, 'dwi', 'lir', 'buff', 16, 2, 680, 54],
    ['gita', 'Gita', 2, 'hyang', 'gong', 'mana', 24, 2, 660, 48],
    ['hasta', 'Hasta', 2, 'tau', 'tam', 'damage', 95, 3, 640, 56],
    ['indra', 'Indra', 2, 'kei', 'mpu', 'periodic', 70, 2, 690, 57],

    ['jaya', 'Jaya', 3, 'sri', 'wang', 'buff', 22, 1, 850, 70],
    ['kembang', 'Kembang', 3, 'hut', 'lir', 'heal', 240, 3, 820, 60],
    ['langit', 'Langit', 3, 'hyang', 'gong', 'area', 130, 2, 800, 72],
    ['mandala', 'Mandala', 3, 'tau', 'mpu', 'shield', 300, 2, 880, 62],
    ['naga', 'Naga', 3, 'jong', 'kar', 'damage', 190, 1, 950, 75],
    ['ombak', 'Ombak', 3, 'tau', 'nah', 'area', 120, 2, 830, 74],
    ['purnama', 'Purnama', 3, 'dwi', 'lir', 'healArea', 160, 2, 860, 64],
    ['raga', 'Raga', 3, 'rim', 'dung', 'cc', 1.5, 1, 900, 66],

    ['semar', 'Semar', 4, 'sri', 'tam', 'buff', 30, 2, 1050, 78],
    ['tala', 'Tala', 4, 'hyang', 'lir', 'heal', 420, 3, 980, 72],
    ['ugahari', 'Ugahari', 4, 'kei', 'mpu', 'summon', 0.45, 2, 1000, 80],
    ['wening', 'Wening', 4, 'dwi', 'gong', 'mana', 42, 3, 950, 68],
    ['yudha', 'Yudha', 4, 'jong', 'nah', 'area', 210, 1, 1150, 88],
    ['aksara', 'Aksara', 4, 'hut', 'gong', 'periodic', 130, 3, 960, 76],
    ['baskara', 'Baskara', 4, 'hyang', 'kar', 'damage', 300, 2, 1020, 85],
    ['cakra', 'Cakra', 4, 'rim', 'wang', 'damage', 280, 1, 1100, 90],

    ['adipati', 'Adipati', 5, 'sri', 'dung', 'buff', 45, 2, 1400, 100],
    ['bathara', 'Bathara', 5, 'hyang', 'mpu', 'area', 320, 3, 1250, 110],
    ['kencana', 'Kencana', 5, 'dwi', 'wang', 'healArea', 300, 3, 1300, 92],
    ['mahardika', 'Mahardika', 5, 'hut', 'kar', 'damage', 520, 1, 1600, 105],
    ['nirwana', 'Nirwana', 5, 'kei', 'lir', 'summon', 0.65, 3, 1200, 100],
    ['ranakala', 'Ranakala', 5, 'rim', 'nah', 'periodic', 230, 2, 1350, 115],
    ['sagara', 'Sagara', 5, 'jong', 'tam', 'area', 290, 3, 1300, 108],
    ['wisesa', 'Wisesa', 5, 'hyang', 'gong', 'cc', 2.2, 3, 1200, 98]
  ];

  var SKILL_PREFIX = {
    damage: 'Tebasan', area: 'Hantaman', periodic: 'Racun', heal: 'Tetabuhan',
    healArea: 'Restu', shield: 'Perisai', buff: 'Sesanti', cc: 'Cengkeram',
    summon: 'Panggilan', mana: 'Gema'
  };

  var CHARACTERS = ROW.map(function (r) {
    return {
      id: r[0], name: r[1], cost: r[2], origin: r[3], path: r[4],
      skill: {
        type: r[5],
        name: SKILL_PREFIX[r[5]] + ' ' + r[1],
        power: r[6],
        desc: SKILLS[r[5]].desc
      },
      range: r[7],
      hp: r[8],
      atk: r[9],
      icon: r[1].slice(0, 1).toUpperCase(),
      color: ORIGINS[r[3]].color
    };
  });

  var WARISAN = {
    sri:   { id: 'sri',   name: 'Sri',   type: 'asal', icon: '❀', thresholds: [2, 3, 5], color: ORIGINS.sri.color, desc: 'HP seluruh Titisan +8% / +16% / +28%.', mods: { hpPct: [0.08, 0.16, 0.28] } },
    hyang: { id: 'hyang', name: 'Hyang', type: 'asal', icon: '✦', thresholds: [2, 3, 5], color: ORIGINS.hyang.color, desc: 'Kekuatan skill +10% / +20% / +35%.', mods: { skillPct: [0.10, 0.20, 0.35] } },
    tau:   { id: 'tau',   name: 'Tau',   type: 'asal', icon: '◈', thresholds: [2, 3, 5], color: ORIGINS.tau.color, desc: 'Mana awal +15 / +30 / +50.', mods: { startMana: [15, 30, 50] } },
    hut:   { id: 'hut',   name: 'Hut',   type: 'asal', icon: '♣', thresholds: [2, 3, 5], color: ORIGINS.hut.color, desc: 'Regenerasi HP +5 / +10 / +18 per detik.', mods: { regen: [5, 10, 18] } },
    jong:  { id: 'jong',  name: 'Jong',  type: 'asal', icon: '⛵', thresholds: [2, 3, 5], color: ORIGINS.jong.color, desc: 'Kecepatan serang +8% / +16% / +28%.', mods: { asPct: [0.08, 0.16, 0.28] } },
    dwi:   { id: 'dwi',   name: 'Dwi',   type: 'asal', icon: '∞', thresholds: [2, 3, 5], color: ORIGINS.dwi.color, desc: 'Semua bonus Warisan lain +10% / +20% / +35%.', mods: { amplify: [0.10, 0.20, 0.35] } },
    rim:   { id: 'rim',   name: 'Rim',   type: 'asal', icon: '❖', thresholds: [2, 3, 5], color: ORIGINS.rim.color, desc: 'ATK seluruh Titisan +8% / +16% / +28%.', mods: { atkPct: [0.08, 0.16, 0.28] } },
    kei:   { id: 'kei',   name: 'Kei',   type: 'asal', icon: '↯', thresholds: [2, 3, 5], color: ORIGINS.kei.color, desc: 'Peluang menghindar +6% / +12% / +20%.', mods: { dodge: [0.06, 0.12, 0.20] } },

    mpu:  { id: 'mpu',  name: 'Mpu',  type: 'laku', icon: '⚒', thresholds: [2, 3, 4], color: PATHS.mpu.color, desc: 'Perisai awal +8% / +16% / +28% HP maksimum.', mods: { shieldPct: [0.08, 0.16, 0.28] } },
    lir:  { id: 'lir',  name: 'Lir',  type: 'laku', icon: '≈', thresholds: [2, 3, 4], color: PATHS.lir.color, desc: 'Regenerasi mana +4 / +8 / +14 per detik.', mods: { manaRegen: [4, 8, 14] } },
    dung: { id: 'dung', name: 'Dung', type: 'laku', icon: '⛨', thresholds: [2, 3, 4], color: PATHS.dung.color, desc: 'Pengurangan damage +8% / +16% / +28%.', mods: { armorPct: [0.08, 0.16, 0.28] } },
    nah:  { id: 'nah',  name: 'Nah',  type: 'laku', icon: '✹', thresholds: [2, 3, 4], color: PATHS.nah.color, desc: 'Peluang kritikal +10% / +20% / +35% (damage ×1,8).', mods: { crit: [0.10, 0.20, 0.35] } },
    tam:  { id: 'tam',  name: 'Tam',  type: 'laku', icon: '✧', thresholds: [2, 3, 4], color: PATHS.tam.color, desc: 'Emas tambahan +1 / +2 / +3 per pupuh.', mods: { gold: [1, 2, 3] } },
    wang: { id: 'wang', name: 'Wang', type: 'laku', icon: '◉', thresholds: [2, 3, 4], color: PATHS.wang.color, desc: 'Batas bunga +1 / +2 / +3.', mods: { interestCap: [1, 2, 3] } },
    kar:  { id: 'kar',  name: 'Kar',  type: 'laku', icon: '▲', thresholds: [2, 3, 4], color: PATHS.kar.color, desc: 'HP tetap +100 / +220 / +400.', mods: { hpFlat: [100, 220, 400] } },
    gong: { id: 'gong', name: 'Gong', type: 'laku', icon: '◎', thresholds: [2, 3, 4], color: PATHS.gong.color, desc: 'Peluang menghentikan musuh +8% / +16% / +28%.', mods: { stun: [0.08, 0.16, 0.28] } }
  };

  var SENAPATI = [
    { id: 'sen', name: 'Sen', title: 'Panglima Bumi', origin: 'sri', icon: '♜', color: '#e6b86a', passive: '+12% HP seluruh Titisan.', mods: { hpPct: 0.12 }, affinityText: 'HP Titisan dan Senapati meningkat.' },
    { id: 'yung', name: 'Yung', title: 'Penjaga Sabda', origin: 'hyang', icon: '✧', color: '#a78bfa', passive: '+15% kekuatan skill.', mods: { skillPct: 0.15 }, affinityText: 'Skill Titisan meledak lebih kuat.' },
    { id: 'tuk', name: 'Tuk', title: 'Nakhoda Alir', origin: 'tau', icon: '≈', color: '#62c9ff', passive: '+2 emas setiap pupuh.', mods: { gold: 2 }, affinityText: 'Arus emas mengalir lebih deras.' },
    { id: 'hat', name: 'Hat', title: 'Wali Rimba', origin: 'hut', icon: '♣', color: '#4fe0a6', passive: 'Regenerasi 6 HP per detik.', mods: { regen: 6 }, affinityText: 'Akar rimba menyembuhkan luka.' },
    { id: 'deng', name: 'Deng', title: 'Laksamana Ombak', origin: 'jong', icon: '⛵', color: '#38bdf8', passive: '+12% kecepatan serang.', mods: { asPct: 0.12 }, affinityText: 'Ombak mempercepat serangan.' },
    { id: 'jro', name: 'Jro', title: 'Penjaga Keseimbangan', origin: 'dwi', icon: '∞', color: '#ff79c6', passive: 'Batas bunga +2 dan emas awal +1.', mods: { interestCap: 2, startGold: 1 }, affinityText: 'Keseimbangan memberi hasil berlipat.' },
    { id: 'pang', name: 'Pang', title: 'Pemburu Belantara', origin: 'rim', icon: '❖', color: '#84cc16', passive: '+12% ATK seluruh Titisan.', mods: { atkPct: 0.12 }, affinityText: 'Belantara menajamkan taring.' },
    { id: 'pit', name: 'Pit', title: 'Bayang Kilat', origin: 'kei', icon: '↯', color: '#f59e0b', passive: '+12% peluang kritikal.', mods: { crit: 0.12 }, affinityText: 'Kilat menuntun tangan.' }
  ];

  var PUSAKA = [
    { id: 'kendi_amerta', name: 'Kendi Amerta', icon: '⚱', desc: '+15% HP maksimum.', tag: 'tank', mods: { hpPct: 0.15 } },
    { id: 'keris_wesi', name: 'Keris Wesi', icon: '🗡', desc: '+20% ATK.', tag: 'damage', mods: { atkPct: 0.20 } },
    { id: 'candi_kecil', name: 'Candi Kecil', icon: '🏛', desc: '+1 batas unit.', tag: 'utility', mods: { unitCap: 1 } },
    { id: 'gong_pusaka', name: 'Gong Pusaka', icon: '🔔', desc: 'Mulai pertempuran dengan 35 mana.', tag: 'caster', mods: { startMana: 35 } },
    { id: 'selendang', name: 'Selendang Sutra', icon: '🧣', desc: '+15% kecepatan serang.', tag: 'damage', mods: { asPct: 0.15 } },
    { id: 'batu_candi', name: 'Batu Candi', icon: '🪨', desc: 'Mengurangi damage 10%.', tag: 'tank', mods: { armorPct: 0.10 } },
    { id: 'lontar_emas', name: 'Lontar Emas', icon: '📜', desc: '+2 emas setiap pupuh.', tag: 'utility', mods: { gold: 2 } },
    { id: 'bunga_wijaya', name: 'Bunga Wijaya', icon: '🌺', desc: 'Memulihkan 4 HP Senapati setiap menang.', tag: 'tank', mods: { commanderHeal: 4 } },
    { id: 'kipas_sutra', name: 'Kipas Sutra', icon: '🪭', desc: '+1 jangkauan serang.', tag: 'damage', mods: { range: 1 } },
    { id: 'aksara_emas', name: 'Aksara Emas', icon: '✒', desc: '+25% kekuatan skill.', tag: 'caster', mods: { skillPct: 0.25 } },
    { id: 'piring_emas', name: 'Piring Emas', icon: '🍽', desc: '+12% peluang kritikal.', tag: 'damage', mods: { crit: 0.12 } },
    { id: 'payung_agung', name: 'Payung Agung', icon: '☂', desc: 'Perisai awal 12% HP.', tag: 'tank', mods: { shieldPct: 0.12 } },
    { id: 'tirta_suci', name: 'Tirta Suci', icon: '💧', desc: 'Regenerasi 7 HP per detik.', tag: 'tank', mods: { regen: 7 } },
    { id: 'kendi_kecil', name: 'Kendi Kecil', icon: '🏺', desc: 'Batas bunga +1.', tag: 'utility', mods: { interestCap: 1 } },
    { id: 'cakra_baja', name: 'Cakra Baja', icon: '☸', desc: '+10% ATK dan +8% HP.', tag: 'damage', mods: { atkPct: 0.10, hpPct: 0.08 } }
  ];

  var ARENAS = [
    { id: 'wirasana', name: 'Pelataran Keraton Wirasana', terrain: 'keraton', hpMult: 1.00, affinity: 'sri', layout: 'A', palette: ['#3b2f1d', '#8a6a32', '#e6b86a'] },
    { id: 'kawah', name: 'Kawah Putri Sanghyang', terrain: 'kawah', hpMult: 1.06, affinity: 'hyang', layout: 'B', palette: ['#2a1a33', '#6d3f7a', '#c084fc'] },
    { id: 'ngarai', name: 'Ngarai Silang Bajanjang', terrain: 'ngarai', hpMult: 0.88, affinity: 'rim', layout: 'C', palette: ['#1b2a1f', '#4d7a3a', '#9bd36a'] },
    { id: 'kaldera', name: 'Kaldera Toba Purba', terrain: 'kaldera', hpMult: 1.10, affinity: 'tau', layout: 'D', palette: ['#102a33', '#1e6b7a', '#62c9ff'] },
    { id: 'tallo', name: 'Dermaga Tallo Apung', terrain: 'dermaga', hpMult: 0.92, affinity: 'jong', layout: 'E', palette: ['#1a2433', '#2c5f7a', '#7dd3fc'] },
    { id: 'tirta', name: 'Pura Segara Tirta Langit', terrain: 'pura', hpMult: 1.02, affinity: 'dwi', layout: 'F', palette: ['#241a33', '#7a4a7a', '#ff9ad5'] },
    { id: 'tabalong', name: 'Rimba Tabalong Kayangan', terrain: 'rimba', hpMult: 0.80, affinity: 'hut', layout: 'G', palette: ['#14251c', '#2f6b45', '#6cf5c8'] },
    { id: 'banda', name: 'Pelabuhan Karang Banda', terrain: 'banda', hpMult: 1.13, affinity: 'kei', layout: 'H', palette: ['#2a2314', '#7a5a24', '#f5c76b'] },
    { id: 'sunyaruri', name: 'Sasana Sunyaruri', terrain: 'sunyaruri', hpMult: 0.98, affinity: 'sri', layout: 'I', palette: ['#1a1d2e', '#3d4266', '#aab6ff'] }
  ];

  var LEVEL_ODDS = {
    1: [100, 0, 0, 0, 0],
    2: [70, 30, 0, 0, 0],
    3: [60, 30, 10, 0, 0],
    4: [50, 35, 15, 0, 0],
    5: [40, 35, 20, 5, 0],
    6: [30, 35, 25, 10, 0],
    7: [22, 30, 28, 15, 5],
    8: [18, 25, 30, 20, 7],
    9: [15, 20, 25, 25, 15]
  };

  var POOL_SIZES = { 1: 22, 2: 20, 3: 17, 4: 12, 5: 9 };

  var TERMS = [
    { term: 'Titisan', old: 'karakter', desc: 'Unit yang dibeli di Toko dan ditempatkan di petak unit.' },
    { term: 'Sasana', old: 'arena', desc: 'Medan pertempuran 9 × 7 dengan jalur dan petak unit.' },
    { term: 'Warisan', old: 'sinergi', desc: 'Bonus dari kesamaan Asal dan Laku. Warisan Asal punya ambang 2/3/5, Laku 2/3/4.' },
    { term: 'Lawang Sunyi', old: 'portal', desc: 'Pintu masuk Sunyi di awal jalur.' },
    { term: 'Penjaga', old: 'bos', desc: 'Musuh kuat pada pupuh kelipatan 5. Memberi Pusaka saat dikalahkan.' },
    { term: 'Sunyi', old: 'creep', desc: 'Musuh biasa yang berjalan menuju Senapati.' },
    { term: 'Senapati', old: 'commander', desc: 'Panglima yang kamu pilih sebelum pertandingan. HP-nya adalah nyawa pertahananmu.' },
    { term: 'Pupuh', old: 'ronde', desc: 'Satu putaran persiapan dan pertempuran.' },
    { term: 'Pusaka', old: 'relik', desc: 'Hadiah dari Penjaga. Maksimal 12 dimiliki, 3 terpasang per unit.' },
    { term: 'Lontar Sangkala', old: 'panduan', desc: 'Panduan dalam game yang menjelaskan istilah dan aturan.' }
  ];

  var LONTAR = [
    { title: 'Bab I · Awal Pertahanan', body: 'Pilih Senapati, lalu mulai pertandingan. Setiap pupuh dimulai dengan fase persiapan 30–45 detik. Beli Titisan di Toko, letakkan di petak unit, dan tekan Siap untuk mempercepat pertempuran.' },
    { title: 'Bab II · Titisan dan Bintang', body: 'Tiga Titisan dengan nama dan bintang yang sama akan bergabung menjadi bintang berikutnya. Bintang 2 menguatkan HP dan ATK ×1,8; bintang 3 ×3,24. Merge bisa terjadi di Bangku maupun di Sasana.' },
    { title: 'Bab III · Warisan', body: 'Warisan Asal aktif pada 2, 3, dan 5 Titisan unik dengan Asal yang sama. Warisan Laku aktif pada 2, 3, dan 4 Titisan unik. Anggota dihitung dari Titisan unik di papan. Dwi memperkuat semua Warisan lain.' },
    { title: 'Bab IV · Toko, Emas, dan Level', body: 'Emas awal 5 dan pendapatan dasar 5 per pupuh. Bunga memberi +1 per 10 emas (maks +5 sebelum bonus). Refresh Toko 2 emas. Beli XP: 4 emas untuk 4 XP; setiap pupuh kamu juga mendapat 2 XP pasif. Level 1–9 menentukan batas unit di papan.' },
    { title: 'Bab V · Pertempuran', body: 'Sunyi berjalan dari Lawang Sunyi menuju Senapati. Titisan menyerang musuh terdepan dalam jangkauan. Setiap serangan menambah 10 mana; saat mana penuh, skill keluar. Titisan yang gugur hidup kembali pada pupuh berikutnya.' },
    { title: 'Bab VI · Penjaga dan Pusaka', body: 'Penjaga muncul setiap kelipatan 5 pupuh. Setelah menang, pilih satu dari tiga Pusaka. Pusaka memberi efek kuat, maksimal 12 dimiliki dan 3 terpasang per unit. Gunakan Pasang otomatis untuk membagi Pusaka sesuai peran.' },
    { title: 'Bab VII · Skor dan Peringkat', body: 'Skor = pupuh yang dicapai × 100 + HP Senapati tersisa × 5 + bonus peringkat. Skor hanya disimpan bila mencapai minimal pupuh 3. Duel dan Party menambahkan bonus posisi. Papan peringkat mingguan berganti setiap Senin 00.00 UTC.' }
  ];

  function mirrorX(path) {
    return path.map(function (p) { return { x: 8 - p.x, y: p.y }; });
  }
  function mirrorY(path) {
    return path.map(function (p) { return { x: p.x, y: 6 - p.y }; });
  }
  function seq(x1, y1, x2, y2) {
    var out = [];
    if (x1 === x2) {
      var stepY = y2 >= y1 ? 1 : -1;
      for (var y = y1; y !== y2 + stepY; y += stepY) out.push({ x: x1, y: y });
    } else {
      var stepX = x2 >= x1 ? 1 : -1;
      for (var x = x1; x !== x2 + stepX; x += stepX) out.push({ x: x, y: y1 });
    }
    return out;
  }
  function concat() {
    var out = [];
    Array.prototype.forEach.call(arguments, function (part) { out = out.concat(part); });
    return out;
  }
  function dedupePath(path) {
    var seen = {}, out = [];
    path.forEach(function (p) {
      var k = p.x + ',' + p.y;
      if (!seen[k]) { seen[k] = true; out.push(p); }
    });
    return out;
  }

  var BASE_A = concat(seq(0, 1, 8, 1), [{ x: 8, y: 2 }], seq(8, 3, 0, 3), [{ x: 0, y: 4 }], seq(0, 5, 4, 5));
  var BASE_C = concat(seq(0, 2, 8, 2), [{ x: 8, y: 3 }], seq(8, 4, 0, 4), [{ x: 0, y: 5 }], seq(0, 6, 4, 6));
  var BASE_E = concat(seq(0, 6, 0, 0), seq(1, 0, 3, 0), seq(3, 1, 3, 6), seq(4, 6, 6, 6), seq(6, 5, 6, 0));
  var BASE_G = concat(seq(0, 1, 4, 1), [{ x: 4, y: 2 }], [{ x: 4, y: 3 }], concat(seq(3, 3, 1, 3), [{ x: 1, y: 4 }], [{ x: 1, y: 5 }], seq(1, 5, 3, 5), [{ x: 4, y: 5 }, { x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 4 }, { x: 6, y: 3 }, { x: 5, y: 3 }, { x: 5, y: 2 }, { x: 5, y: 1 }, { x: 6, y: 1 }, { x: 7, y: 1 }, { x: 8, y: 1 }]));

  var LAYOUTS = {
    A: dedupePath(BASE_A),
    B: mirrorX(BASE_A),
    C: dedupePath(BASE_C),
    D: mirrorX(BASE_C),
    E: dedupePath(BASE_E),
    F: mirrorX(BASE_E),
    G: dedupePath(BASE_G),
    H: mirrorX(BASE_G),
    I: mirrorY(BASE_A)
  };

  function key(x, y) { return x + ',' + y; }

  function neighborsOf(pathCell) {
    var out = [];
    for (var dx = -1; dx <= 1; dx++) {
      for (var dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        var x = pathCell.x + dx, y = pathCell.y + dy;
        if (x >= 0 && x <= 8 && y >= 0 && y <= 6) out.push({ x: x, y: y });
      }
    }
    return out;
  }

  function buildArena(arena) {
    var path = LAYOUTS[arena.layout].slice();
    var pathKeys = {};
    path.forEach(function (p) { pathKeys[key(p.x, p.y)] = true; });
    var last = path[path.length - 1];
    var prev = path[path.length - 2];
    var dir = { x: Math.sign(last.x - prev.x), y: Math.sign(last.y - prev.y) };
    var commander = { x: U.clamp(last.x + dir.x, 0, 8), y: U.clamp(last.y + dir.y, 0, 6) };
    if (pathKeys[key(commander.x, commander.y)] || (commander.x === last.x && commander.y === last.y)) {
      // cari tetangga terdekat yang bukan jalur
      var options = neighborsOf(last).filter(function (p) { return !pathKeys[key(p.x, p.y)]; });
      commander = options[0] || { x: last.x, y: last.y };
    }
    var blocked = {};
    blocked[key(commander.x, commander.y)] = 'commander';
    blocked[key(path[0].x, path[0].y)] = 'portal';

    var candidateKeys = {};
    var candidates = [];
    path.forEach(function (p) {
      neighborsOf(p).forEach(function (n) {
        var k = key(n.x, n.y);
        if (pathKeys[k] || blocked[k] || candidateKeys[k]) return;
        candidateKeys[k] = true;
        candidates.push(n);
      });
    });
    candidates.sort(function (a, b) {
      var da = Math.abs(a.x - 4) + Math.abs(a.y - 3);
      var db = Math.abs(b.x - 4) + Math.abs(b.y - 3);
      return da - db;
    });
    var unitTiles = candidates.slice(0, 24);
    if (unitTiles.length < 24) {
      for (var y = 0; y <= 6 && unitTiles.length < 24; y++) {
        for (var x = 0; x <= 8 && unitTiles.length < 24; x++) {
          var k = key(x, y);
          if (pathKeys[k] || blocked[k] || unitTiles.some(function (u) { return u.x === x && u.y === y; })) continue;
          unitTiles.push({ x: x, y: y });
        }
      }
    }
    var unitKeys = {};
    unitTiles.forEach(function (u) { unitKeys[key(u.x, u.y)] = true; });
    var decor = [];
    for (var yy = 0; yy <= 6; yy++) {
      for (var xx = 0; xx <= 8; xx++) {
        var kk = key(xx, yy);
        if (!pathKeys[kk] && !unitKeys[kk] && !blocked[kk]) decor.push({ x: xx, y: yy });
      }
    }
    return Object.assign({}, arena, {
      path: path,
      pathKeys: pathKeys,
      commander: commander,
      portal: path[0],
      unitTiles: unitTiles,
      unitKeys: unitKeys,
      decor: decor
    });
  }

  var ARENAS_BUILT = ARENAS.map(buildArena);

  var ECON = {
    startGold: 5,
    baseIncome: 5,
    interestPer: 10,
    interestCap: 5,
    streak: [{ at: 2, bonus: 1 }, { at: 4, bonus: 2 }, { at: 6, bonus: 3 }],
    shopSize: 5,
    refreshCost: 2,
    xpCost: 4,
    xpAmount: 4,
    xpPassive: 2,
    maxLevel: 9,
    benchSize: 9,
    maxRelics: 12,
    relicSlotsPerUnit: 3
  };

  // Data statis rebuild lama. Dipertahankan sementara sebagai GH.nsLegacyData
  // sampai host Nusantara dialihkan ke GH.nsData.load() (ZIP-authoritative).
  var NS = GH.nsLegacyData = {
    origins: ORIGINS,
    paths: PATHS,
    skills: SKILLS,
    characters: CHARACTERS,
    warisan: WARISAN,
    senapati: SENAPATI,
    pusaka: PUSAKA,
    arenas: ARENAS_BUILT,
    arenasRaw: ARENAS,
    layouts: LAYOUTS,
    levelOdds: LEVEL_ODDS,
    poolSizes: POOL_SIZES,
    econ: ECON,
    terms: TERMS,
    lontar: LONTAR,
    starMultiplier: { 1: 1, 2: 1.8, 3: 3.24 },
    sellValue: { 1: 1, 2: 3, 3: 9 },
    wave: function (round, arenaHpMult) {
      var extreme = round >= 51;
      var boss = round % 5 === 0;
      var baseHp = 300 * Math.pow(1.042, round - 1) * (arenaHpMult || 1);
      var baseAtk = 20 * Math.pow(1.05, round - 1);
      var count = 6 + Math.floor(round / 5);
      if (boss) {
        var bossMult = extreme ? 2.2 : 1.6;
        return {
          boss: true,
          extreme: extreme,
          count: 1,
          perHp: baseHp * count * bossMult,
          perAtk: baseAtk * 1.5 * (extreme ? 1.35 : 1),
          leak: extreme ? 35 : 20,
          label: extreme ? 'Ronde Ekstrem' : 'Penjaga',
          normalCount: 0
        };
      }
      return {
        boss: false,
        extreme: false,
        count: count,
        perHp: baseHp,
        perAtk: baseAtk,
        leak: 1 + Math.floor(round / 10),
        label: 'Gelombang Sunyi',
        normalCount: count
      };
    },
    score: function (round, hp, bonus) {
      return round * 100 + Math.max(0, hp) * 5 + (bonus || 0);
    },
    rankBonus: { duelWin: 200, party: [400, 250, 150], coop: 0 }
  };
})();
