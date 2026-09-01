'use strict';

/**
 * Complete, unbudgeted signature index for retrieval.
 *
 * WHY THIS EXISTS
 * ---------------
 * The generated context file (CLAUDE.md / AGENTS.md / copilot-instructions.md)
 * is a BUDGETED VIEW: `applyTokenBudget` drops and collapses files so the
 * artifact stays under `maxTokens`, because it is injected into every prompt.
 *
 * `buildSigIndex` used to parse that same artifact to build the ranker's index,
 * so retrieval inherited the prompt budget. Every file the budget dropped became
 * permanently unreachable by `sigmap ask` — no ranking change can surface a file
 * that is not in the index. On this repo that was 53 of 155 source files (34%),
 * and restoring them moved hit@5 from 50% to 90% on the retrieval corpus.
 *
 * The two artifacts have opposite requirements — the prompt file wants to be
 * small, the index wants to be complete — so they are now separate. This store
 * is written by `generate` BEFORE the budget is applied, and lives under
 * `.context/` (gitignored, never injected into a prompt).
 *
 * Zero-dependency, bundle-safe (fs + path only).
 */

const fs = require('fs');
const path = require('path');

const INDEX_DIR = '.context';
const INDEX_FILE = 'sig-index.json';
const SCHEMA = 1;

/** Absolute path to the retrieval index artifact. */
function indexPath(cwd) {
  return path.join(cwd, INDEX_DIR, INDEX_FILE);
}

/**
 * Persist the complete signature index.
 *
 * @param {string} cwd
 * @param {Array<{filePath: string, sigs: string[]}>} fileEntries - every
 *        extracted entry, BEFORE applyTokenBudget has dropped or collapsed any.
 * @param {{ version?: string }} [opts]
 * @returns {{ path: string, files: number }}
 */
function writeFullIndex(cwd, fileEntries, opts = {}) {
  const files = {};
  let count = 0;
  for (const e of fileEntries || []) {
    if (!e || !e.filePath || !Array.isArray(e.sigs) || e.sigs.length === 0) continue;
    const rel = path.relative(cwd, e.filePath).replace(/\\/g, '/');
    if (!rel || rel.startsWith('..')) continue;
    files[rel] = e.sigs;
    count++;
  }

  const out = indexPath(cwd);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  // Write-then-rename so a concurrent `ask` never observes a half-written index.
  const tmp = `${out}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({
    schema: SCHEMA,
    sigmapVersion: opts.version || null,
    generated: new Date().toISOString(),
    files,
  }), 'utf8');
  fs.renameSync(tmp, out);
  return { path: out, files: count };
}

/**
 * Load the complete signature index, or an empty Map when absent/unreadable.
 *
 * Deliberately NOT version-busted (unlike .sigmap-cache.json): a stale but
 * complete index still retrieves the right files, whereas discarding it drops
 * retrieval back to the budgeted view — the exact failure this store exists to
 * prevent. Staleness is handled by re-running generate or by cache/freshen.
 *
 * @param {string} cwd
 * @returns {Map<string, string[]>}
 */
function readFullIndex(cwd) {
  const index = new Map();
  try {
    const data = JSON.parse(fs.readFileSync(indexPath(cwd), 'utf8'));
    if (!data || data.schema !== SCHEMA || !data.files) return index;
    for (const [rel, sigs] of Object.entries(data.files)) {
      if (Array.isArray(sigs) && sigs.length > 0) index.set(rel, sigs);
    }
  } catch (_) { /* absent or corrupt → caller falls back to the context file */ }
  return index;
}

module.exports = { writeFullIndex, readFullIndex, indexPath, SCHEMA, INDEX_FILE };
