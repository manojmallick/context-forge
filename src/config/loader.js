'use strict';

const fs = require('fs');
const path = require('path');
const { DEFAULTS } = require('./defaults');

const BASE_CONFIG_TTL_MS = 60 * 60 * 1000; // 1 hour

function loadBaseConfig(extendsVal, cwd) {
  if (!extendsVal || typeof extendsVal !== 'string') return {};

  if (extendsVal.startsWith('https://') || extendsVal.startsWith('http://')) {
    const cacheDir  = path.join(cwd, '.context', 'config-cache');
    const cacheKey  = Buffer.from(extendsVal).toString('base64url').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cachePath = path.join(cacheDir, `${cacheKey}.json`);

    if (fs.existsSync(cachePath)) {
      const age = Date.now() - fs.statSync(cachePath).mtimeMs;
      if (age < BASE_CONFIG_TTL_MS) {
        try { return JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch (_) {}
      }
    }

    try {
      const https = require('https');
      const http  = require('http');
      const mod   = extendsVal.startsWith('https://') ? https : http;
      const raw   = (() => {
        let data = '';
        return new Promise((resolve, reject) => {
          mod.get(extendsVal, (res) => {
            res.on('data', (c) => { data += c; });
            res.on('end', () => resolve(data));
          }).on('error', reject);
        });
      })();
      // Sync fallback: run a tiny fetch in a child node process. Shell-free —
      // execFileSync runs the node binary directly (no /bin/sh) and the URL is
      // passed as an argv value, never interpolated into a command string.
      const { execFileSync } = require('child_process');
      const SYNC_FETCH = "const u=process.argv[1];const h=require(u.startsWith('https')?'https':'http');let d='';h.get(u,r=>{r.on('data',c=>d+=c);r.on('end',()=>process.stdout.write(d))}).on('error',()=>process.exit(1))";
      const out = execFileSync(process.execPath, ['-e', SYNC_FETCH, extendsVal], { timeout: 10000, encoding: 'utf8' });
      const parsed = JSON.parse(out);
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(cachePath, JSON.stringify(parsed), 'utf8');
      return parsed;
    } catch (err) {
      process.stderr.write(`[sigmap] config extends: could not fetch ${extendsVal}: ${err.message}\n`);
      if (fs.existsSync(cachePath)) {
        try { return JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch (_) {}
      }
      return {};
    }
  }

  // Local file path
  const absPath = path.resolve(cwd, extendsVal);
  try {
    return JSON.parse(fs.readFileSync(absPath, 'utf8'));
  } catch (err) {
    process.stderr.write(`[sigmap] config extends: could not load ${absPath}: ${err.message}\n`);
    return {};
  }
}

// Keys that are valid in gen-context.config.json
const KNOWN_KEYS = new Set(Object.keys(DEFAULTS));

// Common top-level folder names that reliably hold source code
const COMMON_CODE_DIRS = new Set([
  'src', 'app', 'lib', 'packages', 'services', 'api', 'core', 'cmd',
  'internal', 'pkg', 'handlers', 'controllers', 'models', 'views',
  'components', 'pages', 'routes', 'middleware', 'utils', 'helpers',
  'modules', 'plugins', 'extensions', 'adapters', 'drivers',
  'examples', 'sample', 'demo', 'tests', 'test', 'spec', '__tests__',
  'hooks', 'composables', 'stores', 'features', 'domain', 'infra',
  'infrastructure', 'application', 'data', 'Sources', 'Tests',
]);

const SUPPORTED_CODE_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.pyw', '.java', '.kt', '.kts', '.go', '.rs', '.cs',
  '.cpp', '.c', '.h', '.hpp', '.cc', '.rb', '.rake', '.php',
  '.swift', '.dart', '.scala', '.sc', '.lua', '.vue', '.svelte',
  '.html', '.htm', '.css', '.scss', '.sass', '.less',
  '.yml', '.yaml', '.sh', '.bash', '.zsh', '.fish',
  '.sql', '.graphql', '.gql', '.tf', '.tfvars', '.proto',
  '.toml', '.properties', '.xml', '.md',
]);

/**
 * Detect source directories for the given project root.
 * Uses smart resolver (v6.5+) with fallback to legacy heuristics.
 *
 * @param {string} cwd - Project root
 * @param {string[]} excludeList - Folders to skip
 * @returns {string[]}
 */
function detectAutoSrcDirs(cwd, excludeList) {
  try {
    const { resolveSourceRoots } = require('../discovery/source-root-resolver');
    const result = resolveSourceRoots(cwd, { exclude: excludeList || [] });
    if (result.roots.length > 0) {
      if (result.confidence === 'low') {
        process.stderr.write(
          '[sigmap] low confidence root detection — run "sigmap roots --explain" to verify\n'
        );
      }
      return result.roots;
    }
  } catch (_) {}

  return _legacyDetectAutoSrcDirs(cwd, excludeList);
}

/**
 * Legacy source directory detection (fallback).
 *
 * @param {string} cwd - Project root
 * @param {string[]} excludeList - Folders to skip
 * @returns {string[]}
 */
function _legacyDetectAutoSrcDirs(cwd, excludeList) {
  const excludeSet = new Set(excludeList || []);
  const candidates = new Set(DEFAULTS.srcDirs);

  // ── Manifest-based detection ──────────────────────────────────────────────
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
      if (allDeps.react || allDeps.next) {
        for (const d of ['src', 'app', 'pages', 'components', 'hooks', 'lib', 'utils']) candidates.add(d);
      }
      if (allDeps['@angular/core']) {
        for (const d of ['src', 'projects', 'apps', 'libs']) candidates.add(d);
      }
      if (allDeps['@nestjs/core']) {
        for (const d of ['src', 'libs', 'apps']) candidates.add(d);
      }
      if (allDeps.vue) {
        for (const d of ['src', 'components', 'views', 'stores', 'composables', 'plugins']) candidates.add(d);
      }
      if (allDeps.svelte || allDeps['@sveltejs/kit']) {
        for (const d of ['src', 'lib', 'routes']) candidates.add(d);
      }
      if (allDeps.nx || allDeps.turbo || allDeps.lerna || pkg.workspaces) {
        for (const d of ['packages', 'apps', 'libs', 'services']) candidates.add(d);
      }
    } catch (_) {}
  }

  const hasPyproject = fs.existsSync(path.join(cwd, 'pyproject.toml'));
  const hasRequirements = fs.existsSync(path.join(cwd, 'requirements.txt'));
  const hasSetupPy = fs.existsSync(path.join(cwd, 'setup.py'));
  if (hasPyproject || hasRequirements || hasSetupPy) {
    for (const d of ['src', 'app', 'apps', 'tests', 'examples', 'instance', 'blueprints']) candidates.add(d);
  }

  if (fs.existsSync(path.join(cwd, 'Gemfile'))) {
    for (const d of ['app', 'lib', 'config', 'db', 'spec', 'test']) candidates.add(d);
  }

  if (fs.existsSync(path.join(cwd, 'composer.json'))) {
    for (const d of ['app', 'resources', 'routes', 'database', 'tests']) candidates.add(d);
  }

  if (fs.existsSync(path.join(cwd, 'go.mod'))) {
    for (const d of ['cmd', 'internal', 'pkg', 'api', 'handler', 'handlers', 'middleware', 'service']) candidates.add(d);
  }

  if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) {
    for (const d of ['src', 'crates', 'examples', 'tests', 'benches']) candidates.add(d);
  }

  const hasGradle = fs.existsSync(path.join(cwd, 'build.gradle')) ||
                    fs.existsSync(path.join(cwd, 'build.gradle.kts'));
  const hasMaven = fs.existsSync(path.join(cwd, 'pom.xml'));
  if (hasGradle || hasMaven) {
    for (const d of [
      'src/main/java', 'src/main/kotlin', 'src/main/scala',
      'src/main/resources', 'src/test/java', 'src/test/kotlin',
    ]) candidates.add(d);
  }

  if (fs.existsSync(path.join(cwd, 'pubspec.yaml'))) {
    for (const d of ['lib', 'test', 'integration_test', 'example', 'bin']) candidates.add(d);
  }

  if (fs.existsSync(path.join(cwd, 'Package.swift'))) {
    for (const d of ['Sources', 'Tests']) candidates.add(d);
  }

  // ── Top-level directory scan ──────────────────────────────────────────────
  try {
    const entries = fs.readdirSync(cwd, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue;
      if (excludeSet.has(entry.name)) continue;

      const lname = entry.name.toLowerCase();
      if (COMMON_CODE_DIRS.has(entry.name) || COMMON_CODE_DIRS.has(lname)) {
        candidates.add(entry.name);
        continue;
      }
      // Unknown dir: add if it directly contains source files
      const dirPath = path.join(cwd, entry.name);
      try {
        const subs = fs.readdirSync(dirPath, { withFileTypes: true });
        const hasSrc = subs.some((s) => {
          if (!s.isFile()) return false;
          return SUPPORTED_CODE_EXTS.has(path.extname(s.name).toLowerCase()) || s.name === 'Dockerfile';
        });
        if (hasSrc) { candidates.add(entry.name); continue; }
        const hasSrcSub = subs.some((s) =>
          s.isDirectory() && ['src', 'lib', 'main', 'java', 'kotlin', 'scala', 'python'].includes(s.name));
        if (hasSrcSub) candidates.add(entry.name);
      } catch (_) {}
    }
  } catch (_) {}

  // Only return those that exist
  return Array.from(candidates).filter((d) => {
    try { return fs.statSync(path.join(cwd, d)).isDirectory(); } catch (_) { return false; }
  });
}

/**
 * Load and merge configuration for a given working directory.
 *
 * @param {string} cwd - Project root directory
 * @returns {object} Merged config (DEFAULTS + user overrides)
 */
function loadConfig(cwd) {
  const configPath = path.join(cwd, 'gen-context.config.json');
  if (!fs.existsSync(configPath)) {
    const cfg = deepClone(DEFAULTS);
    const detected = detectAutoSrcDirs(cwd, cfg.exclude);
    if (detected.length > 0) cfg.srcDirs = detected;
    return cfg;
  }

  let userConfig;
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    userConfig = JSON.parse(raw);
  } catch (err) {
    console.warn(`[sigmap] config parse error in ${configPath}: ${err.message}`);
    const cfg = deepClone(DEFAULTS);
    const detected = detectAutoSrcDirs(cwd, cfg.exclude);
    if (detected.length > 0) cfg.srcDirs = detected;
    return cfg;
  }

  // Warn on unknown keys (helps catch typos)
  for (const key of Object.keys(userConfig)) {
    if (key.startsWith('_') || key === 'extends') continue;
    if (!KNOWN_KEYS.has(key)) {
      console.warn(`[sigmap] unknown config key: "${key}" (ignored)`);
    }
  }

  // Deep merge: DEFAULTS → base (extends) → user config
  const baseConfig = loadBaseConfig(userConfig.extends, cwd);
  const merged = deepClone(DEFAULTS);

  for (const key of Object.keys(baseConfig)) {
    if (key.startsWith('_') || key === 'extends') continue;
    if (!KNOWN_KEYS.has(key)) continue;
    const val = baseConfig[key];
    if (val !== null && typeof val === 'object' && !Array.isArray(val) &&
        typeof merged[key] === 'object' && !Array.isArray(merged[key])) {
      merged[key] = Object.assign({}, merged[key], val);
    } else {
      merged[key] = val;
    }
  }

  for (const key of Object.keys(userConfig)) {
    if (key.startsWith('_') || key === 'extends') continue;
    if (!KNOWN_KEYS.has(key)) continue; // skip unknown keys
    const val = userConfig[key];
    if (val !== null && typeof val === 'object' && !Array.isArray(val) &&
        typeof merged[key] === 'object' && !Array.isArray(merged[key])) {
      merged[key] = Object.assign({}, merged[key], val);
    } else {
      merged[key] = val;
    }
  }

  // If user didn't specify srcDirs, auto-detect; fall back to DEFAULTS if nothing found
  if (!Array.isArray(userConfig.srcDirs)) {
    const detected = detectAutoSrcDirs(cwd, merged.exclude);
    merged.srcDirs = detected.length > 0 ? detected : deepClone(DEFAULTS.srcDirs);
  }

  // Backward compat (v3.0+): mirror outputs ↔ adapters
  if (merged.adapters && !Array.isArray(merged.adapters)) merged.adapters = null;
  if (!merged.adapters && Array.isArray(merged.outputs)) {
    merged.adapters = merged.outputs.slice();
  } else if (Array.isArray(merged.adapters) && !userConfig.outputs) {
    merged.outputs = merged.adapters.filter((a) => ['copilot','claude','cursor','windsurf'].includes(a));
  }
  return merged;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

module.exports = { loadConfig, loadBaseConfig };
