/* =====================================================================
   Game Hub v2 · Nusantara authoritative view
   ---------------------------------------------------------
   Jembatan baca saja dari data/nusantara/*.json + modul GH.ns* ke bentuk
   yang dipakai host .ns-* rebuild. Tidak ada angka aturan yang ditulis
   ulang di sini: ekonomi, sinergi, Pusaka, arena, gelombang, dan skor
   berasal dari bundle ZIP yang sudah divalidasi GH.nsSchema.
   ===================================================================== */
(function (root) {
  'use strict';
  var GH = root.GH = root.GH || {};
  var legacy = GH.nsLegacyData || {};

  var ARENA_ID = {
    'pelataran-keraton-wirasana': 'wirasana',
    'kawah-putri-sanghyang': 'kawah',
    'ngarai-silang-bajanjang': 'ngarai',
    'kaldera-toba-purba': 'kaldera',
    'dermaga-tallo-apung': 'tallo',
    'pura-segara-tirta-langit': 'tirta',
    'rimba-tabalong-kayangan': 'tabalong',
    'pelabuhan-karang-banda': 'banda',
    'sasana-sunyaruri': 'sunyaruri'
  };

  var ORIGIN_UI = {
    sri: { icon: '❀', color: '#e6b86a' },
    hyang: { icon: '✦', color: '#a78bfa' },
    tau: { icon: '◈', color: '#62c9ff' },
    hut: { icon: '♣', color: '#4fe0a6' },
    jong: { icon: '⛵', color: '#38bdf8' },
    dwi: { icon: '∞', color: '#ff79c6' },
    rim: { icon: '❖', color: '#84cc16' },
    kei: { icon: '↯', color: '#f59e0b' }
  };
  var PATH_UI = {
    mpu: { icon: '⚒', color: '#c084fc' },
    lir: { icon: '≈', color: '#38bdf8' },
    dung: { icon: '⛨', color: '#94a3b8' },
    nah: { icon: '✹', color: '#ef4444' },
    tam: { icon: '✧', color: '#fbbf24' },
    wang: { icon: '◉', color: '#facc15' },
    kar: { icon: '▲', color: '#a8a29e' },
    gong: { icon: '◎', color: '#f472b6' }
  };
  var RELIC_ICON = {
    'keris-luk-tujuh': '🗡', 'kain-songket': '🧵', 'tombak-pusaka': '⚔',
    'perisai-salawaku': '🛡', 'batik-parang': '◈', 'cermin-perunggu': '🪞',
    'beras-kuning': '🌾', 'kendi-air-suci': '🏺', 'topeng-penolak': '🎭',
    'mahkota-raja': '👑', 'gong-perunggu': '🔔', 'sirih-pinang': '🍃',
    'jimat-kerabat': '✥', 'pedang-sunyi': '🗡', 'mustika-lawang': '✦'
  };

  function low(value) { return String(value == null ? '' : value).trim().toLowerCase(); }
  function legacyRow(list, name) {
    return (list || []).filter(function (row) { return row && row.name === name; })[0] || {};
  }
  function uiFor(kind, name) {
    var key = low(name);
    var map = kind === 'asal' ? ORIGIN_UI : PATH_UI;
    return map[key] || { icon: kind === 'asal' ? '✦' : '◇', color: 'var(--g5)' };
  }
  function cellKey(r, c) { return r + ',' + c; }

  function buildArena(a, commanders) {
    var rows = a.layout || [];
    var portalS = a.portalS || [];
    var commanderE = a.commanderE || [];
    var portal = { x: Number(portalS[1]) - 1, y: Number(portalS[0]) - 1 };
    var commander = { x: Number(commanderE[1]) - 1, y: Number(commanderE[0]) - 1 };
    var path = (a.pathOrder || []).map(function (p) { return { x: Number(p[1]) - 1, y: Number(p[0]) - 1 }; });
    var pathKeys = {};
    path.forEach(function (p) { pathKeys[cellKey(p.x, p.y)] = true; });
    var unitTiles = (a.unitTileCoverage || []).map(function (t) { return { x: Number(t.col) - 1, y: Number(t.row) - 1 }; });
    var unitKeys = {};
    unitTiles.forEach(function (p) { unitKeys[cellKey(p.x, p.y)] = true; });
    var decor = [];
    for (var y = 0; y < rows.length; y++) {
      for (var x = 0; x < rows[y].length; x++) {
        var k = cellKey(x, y);
        if (!pathKeys[k] && !unitKeys[k] && !(commander.x === x && commander.y === y) && !(portal.x === x && portal.y === y)) decor.push({ x: x, y: y });
      }
    }
    var affinityCommander = (commanders || []).filter(function (c) { return c.name === a.affinityCommander; })[0];
    var rawId = a.id;
    return {
      id: ARENA_ID[rawId] || rawId,
      zipId: rawId,
      name: a.name,
      terrain: low(a.name).split(' ')[0],
      hpMult: a.enemyHpMultiplier,
      affinity: affinityCommander ? low(affinityCommander.asal) : '',
      layout: 'ZIP',
      palette: legacyRow(legacy.arenas, a.name).palette || ['#2a2433', '#6d3f7a', '#c084fc'],
      layoutRows: rows.slice(),
      path: path,
      pathKeys: pathKeys,
      commander: commander,
      portal: portal,
      unitTiles: unitTiles,
      unitKeys: unitKeys,
      decor: decor,
      environmentEffect: a.environmentEffectDraft
    };
  }

  function mapFxKeys(source, map) {
    var out = [];
    (source || []).forEach(function (tier) {
      var row = {};
      Object.keys(tier || {}).forEach(function (k) {
        var target = map[k];
        if (target && typeof tier[k] === 'number') row[target] = tier[k];
      });
      out.push(row);
    });
    return out;
  }

  function relicTag(fx) {
    if (fx.atk != null || fx.as != null || fx.crit != null || fx.bossDmg != null) return 'damage';
    if (fx.hp != null || fx.def != null || fx.shield != null || fx.dr != null || fx.leakDown != null) return 'tank';
    if (fx.mana != null || fx.regen != null) return 'caster';
    return 'utility';
  }

  function build(res) {
    var data = res && res.data;
    if (!data) throw new Error('GH.nsView.build membutuhkan bundle data yang valid.');
    var ns = GH.ns || {};
    var core = ns.Core || GH.nsCore;
    var battle = ns.Battle || GH.nsBattle;
    var waveMod = ns.Wave || (battle && battle.waveFor ? { forRound: battle.waveFor } : null);
    var synergy = ns.Synergy || GH.nsSynergy;
    var match = GH.nsMatch || ns.Match;
    if (!core || !waveMod || !match) throw new Error('Modul aturan Nusantara belum dimuat sebelum nsView.');
    var eco = data.economy;
    var rules = data.rules;
    var fx = rules.fx || {};
    var commanders = (data.commanders && data.commanders.commanders) || [];
    var synergies = (data.synergies && data.synergies.synergies) || [];
    var chars = (data.characters && data.characters.characters) || [];

    var origins = {};
    var paths = {};
    var warisan = {};
    synergies.forEach(function (s) {
      var id = low(s.name);
      var ui = uiFor(s.kind, s.name);
      var entry = {
        id: s.id, name: s.name, icon: ui.icon, color: ui.color,
        desc: (s.effectsText || []).join(' · '),
        effectsText: (s.effectsText || []).slice()
      };
      if (s.kind === 'asal') origins[id] = entry;
      else paths[id] = entry;
      var tiers = (fx.synergy && fx.synergy[s.id] && fx.synergy[s.id].tiers) || s.effectsDraft || [];
      warisan[s.id] = {
        id: s.id,
        name: s.name,
        type: s.kind,
        icon: ui.icon,
        color: ui.color,
        thresholds: (s.thresholds || []).slice(),
        desc: entry.desc,
        mods: mapFxKeys(tiers, {
          shield: 'shieldPct', def: 'def', regen: 'regenPct', gold: 'gold',
          interestCap: 'interestCap', as: 'asPct', amp: 'amplify', dodge: 'dodge',
          crit: 'crit', critDmg: 'critDmg', mana: 'startMana', atk: 'atkPct',
          hp: 'hpPct', share: 'share', pen: 'pen', dur: 'dur'
        })
      };
    });

    var senapati = commanders.map(function (c) {
      var asal = low(c.asal);
      var ui = uiFor('asal', asal);
      var kind = fx.senapati && fx.senapati.kinds && fx.senapati.kinds[c.id];
      var value = c.passiveValue || 0;
      var mods = {};
      if (kind === 'centerShield') mods.shieldPct = value;
      else if (kind === 'healBonus') mods.healBonus = value;
      else if (kind === 'streakGold') mods.gold = value;
      else if (kind === 'quake') mods.quake = value;
      else if (kind === 'shopSlot') mods.shopSlot = value;
      else if (kind === 'durAmp') mods.amplify = value;
      else if (kind === 'rearDodge') mods.dodge = value;
      else if (kind === 'share') mods.share = value;
      return {
        id: c.id,
        name: c.name,
        title: c.formerName || c.name,
        origin: asal,
        icon: ORIGIN_UI[asal] ? ORIGIN_UI[asal].icon : '♜',
        color: ui.color,
        passive: c.passive,
        backstory: c.backstory,
        affinityArena: c.affinityArena,
        mods: mods,
        passiveValue: value,
        passiveValueOnAffinityArena: c.passiveValueOnAffinityArena,
        passiveUnit: c.passiveUnit,
        kind: kind
      };
    });

    var pusaka = ((fx.pusaka || []).map(function (p) {
      return {
        id: p.id,
        name: p.name,
        icon: RELIC_ICON[p.id] || '◆',
        desc: p.desc,
        tag: relicTag(p.fx || {}),
        fx: Object.assign({}, p.fx || {}),
        mods: mapFxKeys([p.fx || {}], {
          atk: 'atkPct', hp: 'hpPct', as: 'asPct', def: 'def', shield: 'shieldPct',
          mana: 'startMana', gold: 'gold', regen: 'regenPct', dr: 'armorPct',
          crit: 'crit', unitLimit: 'unitCap', hpPlus: 'commanderHeal',
          leakDown: 'leakDown', bossDmg: 'bossDmg', rerollDown: 'rerollDown'
        })[0] || {}
      };
    }));

    var characterList = chars.map(function (c) {
      var asal = low(c.asal);
      var laku = low(c.laku);
      var originUi = uiFor('asal', asal);
      var stats = c.stats1Star || {};
      var archetype = (eco.lakuArchetypes || {})[c.laku] || {};
      return {
        id: c.id,
        name: c.name,
        formerName: c.formerName,
        cost: c.cost,
        origin: asal,
        path: laku,
        role: low(archetype.role || ''),
        hp: stats.hp,
        atk: stats.atk,
        range: stats.range,
        armor: stats.armor,
        resist: stats.resist,
        manaStart: stats.manaStart,
        manaMax: stats.manaMax,
        attackSpeed: stats.attackSpeed,
        backstory: c.backstory,
        icon: c.name.slice(0, 1).toUpperCase(),
        color: originUi.color,
        skill: {
          name: c.skill && c.skill.name,
          type: low(c.skill && c.skill.type),
          desc: c.skill && c.skill.description,
          power: c.skill && c.skill.value,
          durationSec: c.skill && c.skill.durationSec,
          fx: ((c.skill && c.skill.fx) || []).slice()
        }
      };
    });

    var arenaList = ((data.arenas && data.arenas.arenas) || []).map(function (a) { return buildArena(a, commanders); });
    var arenaByZip = {};
    arenaList.forEach(function (a) { arenaByZip[a.zipId] = a; });

    function wave(round, arenaOrMult) {
      var arena = arenaOrMult && typeof arenaOrMult === 'object' ? arenaOrMult : null;
      if (!arena && typeof arenaOrMult === 'number') {
        arena = arenaList.filter(function (a) { return Math.abs(a.hpMult - arenaOrMult) < 1e-9; })[0] || arenaList[0];
      }
      arena = arena || arenaList[0];
      var zipWave = waveMod.forRound(data, round, arena.zipId);
      var desc = waveMod.describe ? waveMod.describe(data, round, arena.zipId) : null;
      var boss = zipWave.kind === 'bos';
      return {
        boss: boss,
        extreme: !!(zipWave.boss && low(zipWave.boss.tier) === 'ekstrem'),
        count: zipWave.count,
        perHp: zipWave.hp,
        perAtk: zipWave.atk,
        leak: zipWave.leak,
        label: desc && desc.name ? desc.name : (boss ? zipWave.boss.roundName : 'Gelombang Sunyi'),
        desc: desc && desc.desc ? desc.desc : (boss ? zipWave.boss.mechanic : ''),
        normalCount: zipWave.pre ? zipWave.pre.count : zipWave.count,
        zip: zipWave,
        zipArenaId: arena.zipId
      };
    }

    var bonus = (rules.scoring && rules.scoring.rankBonus) || {};
    return {
      ok: true,
      source: 'zip',
      data: data,
      core: core,
      battle: battle,
      synergy: synergy,
      match: match,
      waveModule: waveMod,
      econ: {
        prepSeconds: Number((data.rounds && data.rounds.prepSeconds) || 60),
        startGold: eco.startingGold,
        baseIncome: eco.baseIncomePerRound,
        interestPer: eco.interest.goldPerBonus,
        interestCap: eco.interest.maxBonus,
        streak: (eco.streakBonus || []).map(function (s) { return { at: s.minStreak, bonus: s.gold }; }),
        shopSize: eco.shopSlots,
        refreshCost: eco.rerollCost,
        xpCost: eco.buyXpCost,
        xpAmount: eco.xpPerPurchase,
        xpPassive: eco.passiveXpPerRound,
        maxLevel: eco.maxLevel,
        levels: (eco.levels || []).map(function (lv) {
          return { level: lv.level, xpToNext: lv.xpToNext, unitLimit: lv.unitLimit };
        }),
        benchSize: eco.benchSlots,
        maxRelics: 12,
        relicSlotsPerUnit: 3
      },
      origins: origins,
      paths: paths,
      skills: legacy.skills || {},
      characters: characterList,
      warisan: warisan,
      senapati: senapati,
      pusaka: pusaka,
      arenas: arenaList,
      arenasByZipId: arenaByZip,
      levelOdds: (eco.levels || []).reduce(function (out, lv, i) { out[i + 1] = (lv.shopOddsPercent || []).slice(); return out; }, {}),
      poolSizes: Object.keys(eco.poolByCost || {}).reduce(function (out, cost) {
        out[cost] = eco.poolByCost[cost].copiesPerCharacter;
        return out;
      }, {}),
      starMultiplier: {
        1: eco.starMultiplier.star1,
        2: eco.starMultiplier.star2,
        3: eco.starMultiplier.star3
      },
      sellValue: {
        1: eco.sellMultiplierByStar.star1,
        2: eco.sellMultiplierByStar.star2,
        3: eco.sellMultiplierByStar.star3
      },
      terms: legacy.terms || [],
      lontar: legacy.lontar || [],
      rankBonus: {
        duelWin: bonus.duelWin || 0,
        party: bonus.partyCompetitive
          ? [bonus.partyCompetitive.first, bonus.partyCompetitive.second, bonus.partyCompetitive.third]
          : [0, 0, 0],
        coop: bonus.coop || 0
      },
      wave: wave,
      score: function (round, hp, extra) {
        return Math.max(0, Number(round) || 0) * 100 + Math.max(0, Number(hp) || 0) * 5 + (Number(extra) || 0);
      },
      minScoreRound: rules.scoring && rules.scoring.minRoundForScore,
      rules: rules,
      economy: eco
    };
  }

  function load(force) {
    if (!GH.nsData || typeof GH.nsData.load !== 'function') {
      return Promise.resolve({ ok: false, errors: ['GH.nsData belum dimuat.'], view: null });
    }
    return Promise.resolve(GH.nsData.load(force)).then(function (res) {
      if (!res || !res.ok) return { ok: false, errors: (res && res.errors) || ['Data Nusantara gagal dimuat.'], view: null, source: res };
      try {
        return { ok: true, errors: [], warnings: res.warnings || [], view: build(res), source: res };
      } catch (err) {
        return { ok: false, errors: [(err && err.message) || 'Gagal membangun tampilan data Nusantara.'], view: null, source: res };
      }
    });
  }

  GH.nsView = { build: build, load: load };
  root.NSView = GH.nsView;
  if (typeof module !== 'undefined' && module.exports) module.exports = GH.nsView;
})(typeof window !== 'undefined' ? window : globalThis);
