'use strict';

/**
 * ContextForge health scorer.
 *
 * Computes a composite 0-100 health score for the current project by combining:
 *   1. Days since context file was last regenerated  (staleness penalty ≤ 30 pts)
 *   2. Average token reduction percentage             (low-reduction penalty 20 pts)
 *   3. Over-budget run rate                           (budget penalty 20 pts)
 *
 * Grade scale:  A ≥ 90  |  B ≥ 75  |  C ≥ 60  |  D < 60
 *
 * Never throws — returns graceful result with nulls for unavailable metrics.
 *
 * @param {string} cwd - Working directory (root of the project)
 * @returns {{
 *   score: number,
 *   grade: 'A'|'B'|'C'|'D',
 *   tokenReductionPct: number|null,
 *   daysSinceRegen: number|null,
 *   totalRuns: number,
 *   overBudgetRuns: number,
 * }}
 */
function score(cwd) {
  const fs = require('fs');
  const path = require('path');

  let tokenReductionPct = null;
  let daysSinceRegen = null;
  let overBudgetRuns = 0;
  let totalRuns = 0;

  // ── Read usage log via tracking logger ──────────────────────────────────
  try {
    const { readLog, summarize } = require('../tracking/logger');
    const entries = readLog(cwd);
    const s = summarize(entries);
    tokenReductionPct = s.avgReductionPct;
    overBudgetRuns = s.overBudgetRuns;
    totalRuns = s.totalRuns;
  } catch (_) {
    // No usage log yet — proceed with nulls
  }

  // ── Days since context file was last regenerated ─────────────────────────
  try {
    const ctxFile = path.join(cwd, '.github', 'copilot-instructions.md');
    if (fs.existsSync(ctxFile)) {
      const mtime = fs.statSync(ctxFile).mtimeMs;
      daysSinceRegen = parseFloat(((Date.now() - mtime) / (1000 * 60 * 60 * 24)).toFixed(1));
    }
  } catch (_) {
    // File not found or stat failed — leave as null
  }

  // ── Compute composite score ───────────────────────────────────────────────
  let points = 100;

  // Staleness penalty: -4 pts per day over the 7-day freshness window (max -30)
  if (daysSinceRegen !== null && daysSinceRegen > 7) {
    points -= Math.min(30, Math.floor((daysSinceRegen - 7) * 4));
  }

  // Low-reduction penalty: context is barely smaller than the raw source (-20)
  if (tokenReductionPct !== null && tokenReductionPct < 60) {
    points -= 20;
  }

  // Over-budget penalty: more than 20% of runs exceeded the token budget (-20)
  if (overBudgetRuns > 0 && totalRuns > 0) {
    const overBudgetRate = (overBudgetRuns / totalRuns) * 100;
    if (overBudgetRate > 20) points -= 20;
  }

  points = Math.max(0, Math.min(100, Math.round(points)));

  let grade;
  if (points >= 90) grade = 'A';
  else if (points >= 75) grade = 'B';
  else if (points >= 60) grade = 'C';
  else grade = 'D';

  return { score: points, grade, tokenReductionPct, daysSinceRegen, totalRuns, overBudgetRuns };
}

module.exports = { score };
