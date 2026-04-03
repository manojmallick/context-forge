'use strict';

const fs = require('fs');
const path = require('path');

function walkFiles(dir) {
  let out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(walkFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function buildTestIndex(cwd, testDirs) {
  const dirs = Array.isArray(testDirs) && testDirs.length ? testDirs : ['tests', 'test', '__tests__', 'spec'];
  const names = new Set();

  for (const dir of dirs) {
    const abs = path.join(cwd, dir);
    if (!fs.existsSync(abs)) continue;
    for (const file of walkFiles(abs)) {
      let src = '';
      try {
        src = fs.readFileSync(file, 'utf8');
      } catch (_) {
        continue;
      }

      for (const m of src.matchAll(/\b(?:test_|it\(|test\(|describe\()\s*['"`]?([\w_]+)/g)) {
        if (m[1] && m[1].length >= 3) names.add(m[1].toLowerCase());
      }

      for (const m of src.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g)) {
        if (m[1] && m[1].length >= 4) names.add(m[1].toLowerCase());
      }
    }
  }

  return names;
}

function isTested(funcName, testIndex) {
  if (!funcName || funcName.length < 3 || !testIndex || testIndex.size === 0) return false;
  const lower = funcName.toLowerCase();
  if (testIndex.has(lower) || testIndex.has(`test_${lower}`)) return true;
  return false;
}

module.exports = { buildTestIndex, isTested };
