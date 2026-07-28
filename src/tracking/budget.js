'use strict';

/**
 * Session spend ledger (v8.23 F1) — a queryable view over the existing gain
 * log (.context/gain.ndjson, written by recordUsage).
 *
 * Honesty scope: this ledger counts tokens **SigMap emitted** (chars/4
 * estimates), not the host chat's total spend — conversation history, model
 * output, and other tools are invisible to a CLI. Every number here is an
 * estimate and is labeled as such in output.
 *
 * Session identity: `SIGMAP_SESSION` env var when the host sets one, else a
 * UTC day bucket (YYYY-MM-DD). Legacy gain entries (written before the
 * `session` field existed) match day-bucket sessions by timestamp prefix.
 *
 * Zero dependencies; local JSON only.
 */

const fs = require('fs');
const path = require('path');
const { readGainLog } = require('./logger');

// Same generated-context surfaces cache/freshen.js watches.
const CONTEXT_PATHS = [
  ['.github', 'copilot-instructions.md'],
  ['CLAUDE.md'], ['AGENTS.md'], ['.github', 'context-cold.md'],
];

/** Session key: SIGMAP_SESSION override, else UTC day bucket. */
function sessionKey(env) {
  const e = env || process.env;
  if (e.SIGMAP_SESSION) return String(e.SIGMAP_SESSION);
  return new Date().toISOString().slice(0, 10);
}

/** Newest mtime (ms) among generated context files, or 0 if none exist. */
function contextMtime(cwd) {
  let newest = 0;
  for (const parts of CONTEXT_PATHS) {
    try { newest = Math.max(newest, fs.statSync(path.join(cwd, ...parts)).mtimeMs); } catch (_) {}
  }
  return newest;
}

/** Does a gain-log entry belong to this session? */
function entryInSession(entry, session) {
  if (entry.session) return entry.session === session;
  // Legacy entry: match day-bucket sessions on the timestamp date.
  return /^\d{4}-\d{2}-\d{2}$/.test(session) && String(entry.ts || '').startsWith(session);
}

/**
 * Session spend status.
 * @param {string} cwd
 * @param {object} [opts]
 * @param {string} [opts.session]          session key (default: sessionKey())
 * @param {number} [opts.budgetTokens]     budget override (else config sessionBudgetTokens)
 * @param {number} [opts.contextTtlDays]   TTL override (else config contextTtlDays)
 * @param {object} [opts.config]           loaded config (for the two keys above)
 * @param {number} [opts.now]              clock override for tests (ms)
 * @returns {{
 *   session: string, unit: 'estimated-tokens', ops: number,
 *   spentTokens: number, baselineTokens: number, savedTokens: number,
 *   budgetTokens: number|null, remainingTokens: number|null, pctUsed: number|null,
 *   overBudget: boolean,
 *   context: { exists: boolean, ageMs: number|null, ageDays: number|null,
 *              ttlDays: number|null, stale: boolean }
 * }}
 */
function budgetStatus(cwd, opts = {}) {
  const session = opts.session || sessionKey();
  const cfg = opts.config || {};
  const budget = opts.budgetTokens != null ? Number(opts.budgetTokens)
    : (Number.isFinite(cfg.sessionBudgetTokens) ? cfg.sessionBudgetTokens : null);
  const ttlDays = opts.contextTtlDays != null ? Number(opts.contextTtlDays)
    : (Number.isFinite(cfg.contextTtlDays) ? cfg.contextTtlDays : null);
  const now = opts.now != null ? opts.now : Date.now();

  let ops = 0, spent = 0, baseline = 0, saved = 0;
  for (const e of readGainLog(cwd)) {
    if (!entryInSession(e, session)) continue;
    ops++;
    spent += Number(e.actualTokens) || 0;
    baseline += Number(e.baselineTokens) || 0;
    saved += Number(e.savedTokens) || 0;
  }

  const mtime = contextMtime(cwd);
  const ageMs = mtime > 0 ? Math.max(0, now - mtime) : null;
  const ageDays = ageMs != null ? ageMs / 86400000 : null;

  return {
    session,
    unit: 'estimated-tokens',
    ops,
    spentTokens: spent,
    baselineTokens: baseline,
    savedTokens: saved,
    budgetTokens: budget,
    remainingTokens: budget != null ? Math.max(0, budget - spent) : null,
    pctUsed: budget > 0 ? Math.round((spent / budget) * 1000) / 10 : null,
    overBudget: budget != null && spent > budget,
    context: {
      exists: mtime > 0,
      ageMs,
      ageDays: ageDays != null ? Math.round(ageDays * 10) / 10 : null,
      ttlDays,
      stale: ttlDays != null && ageDays != null && ageDays > ttlDays,
    },
  };
}

module.exports = { sessionKey, budgetStatus, contextMtime, entryInSession };
