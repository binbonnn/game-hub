/* One-time importer for authoritative Nusantara P0 tests. */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(process.env.G5_ZIP_DIR || 'C:\\Users\\USER\\AppData\\Local\\Temp\\opencode\\g5-fase10', 'tests');
const dst = path.join(root, 'tools');
const names = [
  'nusantara-schema', 'nusantara-core', 'nusantara-match', 'nusantara-boss',
  'nusantara-fx', 'nusantara-upgrade'
];

for (const name of names) {
  const file = path.join(src, name + '.test.js');
  let code = fs.readFileSync(file, 'utf8');
  code = code
    .replace(/\.\.\/js\/games\/nusantara\/sim-core\//g, '../js/data/')
    .replace(/\.\.\/js\/games\/nusantara\/ns-schema\.js/g, '../js/data/ns-schema.js');
  const out = path.join(dst, 'test-' + name.replace('nusantara-', 'ns-') + '.js');
  fs.writeFileSync(out, code, 'utf8');
  console.log('imported', path.basename(out));
}
