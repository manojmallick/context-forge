'use strict';

/**
 * sigmap tune — deterministic config optimizer (F2, #514).
 *
 * Packages the existing discovery stack (source-root-resolver, monorepo
 * markers, client-artifact probes) into a recommended config diff with a
 * one-line reason per change. Read-only by default; `applyTuneProposal`
 * merges accepted changes into gen-context.config.json, preserving every
 * user key. Explicit user choices are never proposed against.
 */

const fs = require('fs');
const path = require('path');
const { loadConfig } = require('./loader');
const { resolveSourceRoots } = require('../discovery/source-root-resolver');

// Workspace markers, in probe order (reason names the first one found).
const MONOREPO_MARKERS = ['pnpm-workspace.yaml', 'turbo.json', 'nx.json', 'lerna.json'];

// Client artifacts → adapter names (additive only).
const ADAPTER_MARKERS = [
  { adapter: 'claude',   files: ['CLAUDE.md'] },
  { adapter: 'cursor',   files: ['.cursorrules', '.cursor'] },
  { adapter: 'windsurf', files: ['.windsurfrules', '.windsurf'] },
  { adapter: 'codex',    files: ['AGENTS.md'] },
];

// Root-level dirs that are typically vendored/generated when present.
const JUNK_DIRS = [
  'third_party', 'thirdparty', 'external', 'externals',
  'generated', 'testdata', 'snapshots', 'tmp', 'temp', '.cache',
];

// Rough signature cost per source file (chars/4 world) for the budget check.
const TOKENS_PER_FILE = 25;

const SOURCE_EXTS = new Set([
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.py', '.rb', '.go', '.rs',
  '.java', '.kt', '.cs', '.cpp', '.c', '.h', '.hpp', '.swift', '.dart',
  '.scala', '.php', '.lua', '.gd', '.r', '.R',
]);

/** Raw user config file content, or null when absent/unparsable. */
function _readUserConfig(cwd) {
  try {
    return JSON.parse(fs.readFileSync(path.join(cwd, 'gen-context.config.json'), 'utf8'));
  } catch (_) {
    return null;
  }
}

/** Count source files under `roots` (relative to cwd), depth-capped, deterministic. */
function _countSourceFiles(cwd, roots, exclude, depth = 5) {
  const excSet = new Set(exclude || []);
  let count = 0;
  const walk = (dir, d) => {
    if (d <= 0 || count > 20000) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      if (excSet.has(e.name)) continue;
      if (e.isDirectory()) walk(path.join(dir, e.name), d - 1);
      else if (e.isFile() && SOURCE_EXTS.has(path.extname(e.name))) count++;
    }
  };
  for (const r of roots) {
    const full = path.join(cwd, r);
    if (fs.existsSync(full)) walk(full, depth);
  }
  return count;
}

/** The workspace marker present at cwd, or null. */
function _monorepoMarker(cwd) {
  for (const m of MONOREPO_MARKERS) {
    if (fs.existsSync(path.join(cwd, m))) return m;
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
    if (pkg.workspaces) return 'package.json workspaces';
  } catch (_) {}
  return null;
}

/**
 * Build the recommended config diff for a repo.
 *
 * @param {string} cwd
 * @returns {{ changes: Array<{key:string, current:*, recommended:*, reason:string}>,
 *             detection: { roots:string[], confidence:string, isMonorepo:boolean },
 *             configExists: boolean }}
 */
function buildTuneProposal(cwd) {
  const userConfig = _readUserConfig(cwd);
  const config = loadConfig(cwd);
  const detection = resolveSourceRoots(cwd, { exclude: config.exclude });
  const changes = [];

  // 1. srcDirs — recommend pinning the detected roots when the user hasn't.
  // Pinned srcDirs make generation explicit/stable and are protected from
  // token-budget drops; user-pinned srcDirs are never proposed against.
  const userPinnedSrcDirs = !!(userConfig && Array.isArray(userConfig.srcDirs));
  if (!userPinnedSrcDirs && detection.roots.length > 0 && detection.confidence !== 'low') {
    changes.push({
      key: 'srcDirs',
      current: null,
      recommended: detection.roots,
      reason: `pin the ${detection.roots.length} detected source root(s) [confidence ${detection.confidence}] — explicit srcDirs are stable across runs and protected from budget drops`,
    });
  }

  // 2. monorepo — a workspace marker exists but the mode is off.
  const marker = _monorepoMarker(cwd);
  if (marker && config.monorepo !== true) {
    changes.push({
      key: 'monorepo',
      current: config.monorepo,
      recommended: true,
      reason: `workspace marker found: ${marker}`,
    });
  }

  // 3. adapters — client artifacts present that the adapter list doesn't cover.
  const currentAdapters = Array.isArray(config.adapters) ? config.adapters
    : (Array.isArray(config.outputs) ? config.outputs : ['copilot']);
  const found = [];
  for (const { adapter, files } of ADAPTER_MARKERS) {
    if (currentAdapters.includes(adapter)) continue;
    const hit = files.find((f) => fs.existsSync(path.join(cwd, f)));
    if (hit) found.push({ adapter, hit });
  }
  if (found.length > 0) {
    changes.push({
      key: 'adapters',
      current: currentAdapters,
      recommended: [...currentAdapters, ...found.map((f) => f.adapter)],
      reason: `client files present: ${found.map((f) => f.hit).join(', ')}`,
    });
  }

  // 4. exclude — root-level vendored/generated dirs not excluded yet.
  const junkFound = JUNK_DIRS.filter((d) => {
    if ((config.exclude || []).includes(d)) return false;
    try { return fs.statSync(path.join(cwd, d)).isDirectory(); } catch (_) { return false; }
  });
  if (junkFound.length > 0) {
    changes.push({
      key: 'exclude',
      current: userConfig && userConfig.exclude ? userConfig.exclude : null,
      recommended: [...((userConfig && userConfig.exclude) || config.exclude), ...junkFound],
      reason: `present at root and typically vendored/generated: ${junkFound.join(', ')}`,
    });
  }

  // 5. autoMaxTokens — a pinned budget that the repo's size will overflow.
  if (config.autoMaxTokens === false) {
    const roots = detection.roots.length > 0 ? detection.roots : config.srcDirs;
    const files = _countSourceFiles(cwd, roots, config.exclude);
    const estTokens = files * TOKENS_PER_FILE;
    if (estTokens > config.maxTokens) {
      changes.push({
        key: 'autoMaxTokens',
        current: false,
        recommended: true,
        reason: `~${files} source files need ~${estTokens} tokens (heuristic) but maxTokens is pinned at ${config.maxTokens} — auto-scaling targets ${Math.round((config.coverageTarget || 0.8) * 100)}% coverage`,
      });
    }
  }

  return {
    changes,
    detection: { roots: detection.roots, confidence: detection.confidence, isMonorepo: detection.isMonorepo },
    configExists: userConfig !== null,
  };
}

/**
 * Merge a proposal's changes into gen-context.config.json (create if absent).
 * Preserves every existing user key; only the proposed keys are written.
 *
 * @returns {{ path: string, applied: string[] }}
 */
function applyTuneProposal(cwd, proposal) {
  const cfgPath = path.join(cwd, 'gen-context.config.json');
  const existing = _readUserConfig(cwd) || {};
  for (const c of proposal.changes) existing[c.key] = c.recommended;
  fs.writeFileSync(cfgPath, JSON.stringify(existing, null, 2) + '\n');
  return { path: cfgPath, applied: proposal.changes.map((c) => c.key) };
}

/** Human rendering of a proposal (one block per change, reason indented). */
function formatTuneProposal(proposal) {
  const lines = [];
  if (proposal.changes.length === 0) {
    lines.push('[sigmap] tune: config already matches detection — no changes recommended');
  } else {
    lines.push(`[sigmap] tune: ${proposal.changes.length} recommended change(s)`);
    for (const c of proposal.changes) {
      lines.push(`  ${c.key.padEnd(14)} ${JSON.stringify(c.current)} → ${JSON.stringify(c.recommended)}`);
      lines.push(`  ${''.padEnd(14)} reason: ${c.reason}`);
    }
    lines.push('');
    lines.push('  apply with: sigmap tune --apply   (then: sigmap validate)');
  }
  lines.push(`  detection: roots [${proposal.detection.roots.join(', ')}] · confidence ${proposal.detection.confidence} · monorepo ${proposal.detection.isMonorepo ? 'yes' : 'no'}`);
  return lines.join('\n');
}

module.exports = { buildTuneProposal, applyTuneProposal, formatTuneProposal, JUNK_DIRS, TOKENS_PER_FILE };
