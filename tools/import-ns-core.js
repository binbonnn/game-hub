/* One-time importer for authoritative Nusantara sim-core modules.
   Source: g5-fase10 ZIP extraction. Output uses the rebuild GH namespace. */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(process.env.G5_ZIP_DIR || 'C:\\Users\\USER\\AppData\\Local\\Temp\\opencode\\g5-fase10', 'js', 'games', 'nusantara');
const dst = path.join(root, 'js', 'data');

const simFiles = ['ns-rng', 'ns-core', 'ns-battle', 'ns-synergy', 'ns-match', 'ns-id'];
const aliases = {
  'ns-rng': 'NS.rng',
  'ns-core': 'NS.Core',
  'ns-battle': 'NS.Battle',
  'ns-synergy': 'NS.Synergy',
  'ns-match': 'NS.Match',
  'ns-id': 'NS.Id'
};

function patch(code, name) {
  const header = "const NS = root.NS = root.NS || {};";
  if (!code.includes(header)) throw new Error('Header NS tidak ditemukan di ' + name);
  code = code.replace(header, "const GH = root.GH = root.GH || {};\n    const NS = GH.ns = GH.ns || {};");

  const footer = 'if (typeof module !== \'undefined\' && module.exports) module.exports = NS;';
  if (!code.includes(footer)) throw new Error('Footer module.exports tidak ditemukan di ' + name);
  const alias = "GH." + ({ 'ns-rng': 'nsRng', 'ns-core': 'nsCore', 'ns-battle': 'nsBattle', 'ns-synergy': 'nsSynergy', 'ns-match': 'nsMatch', 'ns-id': 'nsId' }[name]) +
    " = " + aliases[name] + ";\n    ";
  code = code.replace(footer, 'GH.ns = NS;\n    ' + alias + footer);
  return code;
}

for (const name of simFiles) {
  const file = path.join(src, 'sim-core', name + '.js');
  const code = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(path.join(dst, name + '.js'), patch(code, name), 'utf8');
  console.log('ported', name);
}

let schema = fs.readFileSync(path.join(src, 'ns-schema.js'), 'utf8');
schema = schema.replace(
  "else root.NSSchema = API;",
  "else { root.GH = root.GH || {}; root.GH.nsSchema = API; root.NSSchema = API; }"
);
fs.writeFileSync(path.join(dst, 'ns-schema.js'), schema, 'utf8');
console.log('ported ns-schema');
