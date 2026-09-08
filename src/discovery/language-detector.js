'use strict';

const fs   = require('fs');
const path = require('path');
const { REGISTRY } = require('./source-root-registry');

module.exports = { detectLanguages };

const SKIP_DIRS = new Set([
  'node_modules','dist','build','.git','venv','.venv','target',
  'DerivedData','Pods','.build','Carthage','coverage','.next','.nuxt',
  '__pycache__','.pytest_cache','vendor','.bundle','Carthage',
]);

const EXT_TO_LANG = {
  '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.ts': 'typescript', '.tsx': 'typescript', '.jsx': 'javascript',
  '.py': 'python', '.rb': 'ruby', '.go': 'go', '.rs': 'rust',
  '.java': 'java', '.kt': 'kotlin', '.cs': 'csharp', '.cpp': 'cpp',
  '.c': 'cpp', '.h': 'cpp', '.hpp': 'cpp', '.swift': 'swift',
  '.dart': 'dart', '.scala': 'scala', '.php': 'php',
  '.lua': 'lua',
  '.gd': 'gdscript',
  '.r': 'r', '.R': 'r',
};

function detectLanguages(cwd) {
  const weights = {};

  // Signal 1: manifest files (+3 each)
  for (const [lang, reg] of Object.entries(REGISTRY)) {
    for (const mf of (reg.manifestFiles || [])) {
      if (fs.existsSync(path.join(cwd, mf))) {
        weights[lang] = (weights[lang] || 0) + 3;
      }
    }
  }

  // Signal 2: TypeScript dep in package.json (+2)
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (allDeps.typescript) { weights.typescript = (weights.typescript || 0) + 2; }
  } catch (_) {}

  // Signal 3: file extension count (walk depth 3, capped at +5 per language)
  const extCount = {};
  _walkDepth(cwd, 3, extCount);
  const maxCount = Math.max(1, ...Object.values(extCount));
  for (const [ext, count] of Object.entries(extCount)) {
    const lang = EXT_TO_LANG[ext];
    if (lang) {
      weights[lang] = (weights[lang] || 0) + Math.min(5, (count / maxCount) * 5);
    }
  }

  // Normalize to [0,1] and sort
  const maxW = Math.max(1, ...Object.values(weights));
  return Object.entries(weights)
    .map(([name, w]) => ({ name, weight: Math.round(w / maxW * 100) / 100 }))
    .sort((a, b) => b.weight - a.weight);
}

function _walkDepth(dir, depth, extCount) {
  if (depth <= 0) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    if (e.isDirectory()) {
      _walkDepth(path.join(dir, e.name), depth - 1, extCount);
    } else if (e.isFile()) {
      const ext = path.extname(e.name).toLowerCase();
      if (EXT_TO_LANG[ext]) extCount[ext] = (extCount[ext] || 0) + 1;
    }
  }
}
