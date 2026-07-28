'use strict';

/**
 * SigMap usage logger (v0.9)
 *
 * Writes an append-only newline-delimited JSON (NDJSON) log at
 *   .context/usage.ndjson
 *
 * Each line is one JSON object describing a gen-context run.
 * Zero npm dependencies — pure Node.js fs.
 *
 * Enabled by:
 *   config.tracking: true   (gen-context.config.json)
 *   --track CLI flag
 */

const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join('.context', 'usage.ndjson');
// Dedicated log for the `gain` dashboard (extended schema). Kept separate from
// usage.ndjson so the legacy health/nudge history never collides with it.
const GAIN_FILE = path.join('.context', 'gain.ndjson');

/**
 * Append one run entry to the usage log.
 * @param {object} entry - Run metrics from runGenerate()
 * @param {string} cwd   - Project root (absolute path)
 */
function logRun(entry, cwd) {
  try {
    const logPath = path.join(cwd, LOG_FILE);
    const dir = path.dirname(logPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const record = {
      ts: new Date().toISOString(),
      version: entry.version || '0.9.0',
      fileCount: entry.fileCount || 0,
      droppedCount: entry.droppedCount || 0,
      rawTokens: entry.rawTokens || 0,
      finalTokens: entry.finalTokens || 0,
      reductionPct: entry.rawTokens > 0
        ? parseFloat((100 - (entry.finalTokens / entry.rawTokens) * 100).toFixed(1))
        : 0,
      overBudget: entry.overBudget || false,
      budgetLimit: entry.budgetLimit || 6000,
    };

    fs.appendFileSync(logPath, JSON.stringify(record) + '\n', 'utf8');
  } catch (err) {
    // Never crash the main process — tracking is optional
    process.stderr.write(`[sigmap] tracking: could not write log: ${err.message}\n`);
  }
}

/**
 * Read and parse all usage log entries.
 * @param {string} cwd - Project root (absolute path)
 * @returns {object[]} Array of parsed log records (oldest first)
 */
function readLog(cwd) {
  try {
    const logPath = path.join(cwd, LOG_FILE);
    if (!fs.existsSync(logPath)) return [];
    const raw = fs.readFileSync(logPath, 'utf8');
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try { return JSON.parse(line); } catch (_) { return null; }
      })
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

/**
 * Read and parse all `gain` dashboard records (oldest first).
 * @param {string} cwd
 * @returns {object[]}
 */
function readGainLog(cwd) {
  try {
    const logPath = path.join(cwd, GAIN_FILE);
    if (!fs.existsSync(logPath)) return [];
    return fs.readFileSync(logPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => { try { return JSON.parse(line); } catch (_) { return null; } })
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

/**
 * Compute summary statistics from an array of log records.
 * @param {object[]} entries
 * @returns {object} Summary stats
 */
function summarize(entries) {
  if (!entries || entries.length === 0) {
    return {
      totalRuns: 0,
      avgReductionPct: 0,
      avgFinalTokens: 0,
      avgRawTokens: 0,
      minFinalTokens: 0,
      maxFinalTokens: 0,
      firstRun: null,
      lastRun: null,
      overBudgetRuns: 0,
    };
  }

  const reductions = entries.map((e) => e.reductionPct || 0);
  const finals = entries.map((e) => e.finalTokens || 0);
  const raws = entries.map((e) => e.rawTokens || 0);

  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

  return {
    totalRuns: entries.length,
    avgReductionPct: parseFloat(avg(reductions).toFixed(1)),
    avgFinalTokens: Math.round(avg(finals)),
    avgRawTokens: Math.round(avg(raws)),
    minFinalTokens: Math.min(...finals),
    maxFinalTokens: Math.max(...finals),
    firstRun: entries[0].ts || null,
    lastRun: entries[entries.length - 1].ts || null,
    overBudgetRuns: entries.filter((e) => e.overBudget).length,
  };
}

/**
 * Whether `gain` savings capture is enabled. Default: ON (privacy-safe,
 * local-only, counts only — no paths, source, or query text). This is
 * intentionally decoupled from the legacy `config.tracking` flag (which gates
 * the usage.ndjson health log and defaults OFF). Opt out of gain capture via:
 *   config.gainTracking === false   ·   --no-track   ·   SIGMAP_NO_TRACK=1
 * @param {object} [config]
 * @param {string[]} [argv]
 * @returns {boolean}
 */
function isTrackingEnabled(config, argv) {
  const a = argv || (typeof process !== 'undefined' ? process.argv : []);
  if (process.env && process.env.SIGMAP_NO_TRACK) return false;
  if (a && a.includes('--no-track')) return false;
  if (config && config.gainTracking === false) return false;
  return true;
}

/**
 * Append one operation to the usage log using the extended `gain` schema.
 * Reuses the same NDJSON file as logRun and is tolerant of partial input.
 * Never throws — tracking must never break the main process.
 *
 * @param {object} entry
 * @param {string} entry.op             e.g. 'ask' | 'generate' | 'query' | 'mcp:get_map'
 * @param {number} entry.baselineTokens whole-file / candidate baseline (counterfactual)
 * @param {number} entry.actualTokens   tokens SigMap actually emitted
 * @param {number} [entry.durationMs]
 * @param {string} [entry.model]
 * @param {string} [entry.version]
 * @param {string} cwd
 */
function recordUsage(entry, cwd) {
  try {
    const logPath = path.join(cwd, GAIN_FILE);
    const dir = path.dirname(logPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const baseline = Math.max(0, Number(entry.baselineTokens) || 0);
    const actual = Math.max(0, Number(entry.actualTokens) || 0);
    const saved = Math.max(0, baseline - actual);
    const ts = new Date().toISOString();
    const record = {
      ts,
      v: entry.version || '0.9.0',
      op: entry.op || 'generate',
      session: entry.session || process.env.SIGMAP_SESSION || ts.slice(0, 10),
      baselineTokens: baseline,
      actualTokens: actual,
      savedTokens: saved,
      savedPct: baseline > 0 ? parseFloat(((saved / baseline) * 100).toFixed(1)) : 0,
      durationMs: Math.max(0, Math.round(Number(entry.durationMs) || 0)),
      model: entry.model || null,
      ok: entry.ok !== false,
    };
    fs.appendFileSync(logPath, JSON.stringify(record) + '\n', 'utf8');
  } catch (err) {
    // Never crash the main process — tracking is optional.
    if (process.stderr) process.stderr.write(`[sigmap] tracking: could not write log: ${err.message}\n`);
  }
}

module.exports = { logRun, recordUsage, readLog, readGainLog, summarize, isTrackingEnabled, GAIN_FILE };
