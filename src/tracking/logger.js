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

module.exports = { logRun, readLog, summarize };
