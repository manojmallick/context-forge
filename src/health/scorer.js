'use strict';

/**
 * ContextForge health scorer.
 *
 * Computes a composite 0-100 health score for the current project by combining:
 *   1. Days since context file was last regenerated  (staleness penalty ≤ 30 pts)
 *   2. Average token reduction percentage             (low-reduction penalty 20 pts)
 *   3. Over-budget run rate                           (budget penalty 20 pts)
 *
 * Strategy-aware: thresholds adjust based on the active strategy so that
 * hot-cold (90% reduction intentional) is not penalized as 'low reduction'.
 *
 * Grade scale:  A ≥ 90  |  B ≥ 75  |  C ≥ 60  |  D < 60
 *
 * Never throws — returns graceful result with nulls for unavailable metrics.
 *
 * @param {string} cwd - Working directory (root of the project)
 * @returns {{
 *   score: number,
 *   grade: 'A'|'B'|'C'|'D',
 *   strategy: string,
 *   tokenReductionPct: number|null,
 *   daysSinceRegen: number|null,
 *   strategyFreshnessDays: number|null,
 *   totalRuns: number,
 *   overBudgetRuns: number,
 * }}
 */
function score(cwd) {
  const fs = require('fs');
  const path = require('path');

  let tokenReductionPct = null;
  let daysSinceRegen = null;
  let strategyFreshnessDays = null;
  let overBudgetRuns = 0;
  let totalRuns = 0;

  // ── Detect active strategy ────────────────────────────────────────────────
  let strategy = 'full';
  try {
    const cfgPath = path.join(cwd, 'gen-context.config.json');
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      strategy = cfg.strategy || 'full';
    }
  } catch (_) {}

  // ── Read usage log via tracking logger ──────────────────────────────────
  try {
    const { readLog, summarize } = require('../tracking/logger');
    const entries = readLog(cwd);
    const s = summarize(entries);
    // Only set tokenReductionPct when there is actual history; a brand-new/
    // untracked project should not be penalised for "0% reduction".
    if (s.totalRuns > 0) tokenReductionPct = s.avgReductionPct;
    overBudgetRuns = s.overBudgetRuns;
    totalRuns = s.totalRuns;
  } catch (_) {
    // No usage log yet — proceed with nulls
  }

  // ── Days since primary context file was last regenerated ─────────────────
  try {
    const ctxFile = path.join(cwd, '.github', 'copilot-instructions.md');
    if (fs.existsSync(ctxFile)) {
      const mtime = fs.statSync(ctxFile).mtimeMs;
      daysSinceRegen = parseFloat(((Date.now() - mtime) / (1000 * 60 * 60 * 24)).toFixed(1));
    }
  } catch (_) {}

  // ── Strategy freshness: context-cold.md age (hot-cold only) ─────────────
  if (strategy === 'hot-cold') {
    try {
      const coldFile = path.join(cwd, '.github', 'context-cold.md');
      if (fs.existsSync(coldFile)) {
        const mtime = fs.statSync(coldFile).mtimeMs;
        strategyFreshnessDays = parseFloat(((Date.now() - mtime) / (1000 * 60 * 60 * 24)).toFixed(1));
      }
    } catch (_) {}
  }

  // ── Compute composite score ───────────────────────────────────────────────
  let points = 100;

  // Staleness penalty: -4 pts per day over the 7-day freshness window (max -30)
  if (daysSinceRegen !== null && daysSinceRegen > 7) {
    points -= Math.min(30, Math.floor((daysSinceRegen - 7) * 4));
  }

  // Low-reduction penalty — threshold depends on strategy:
  // - hot-cold: primary output is intentionally tiny; measure cold freshness instead
  // - per-module: per-file budgets; global reduction < 60% expected, no penalty
  // - full: standard 60% threshold
  const reductionThreshold = (strategy === 'full') ? 60 : 0; // disable for hot-cold/per-module
  if (tokenReductionPct !== null && tokenReductionPct < reductionThreshold) {
    points -= 20;
  }

  // hot-cold strategy freshness penalty: context-cold.md older than 1 day (-10 pts)
  if (strategy === 'hot-cold' && strategyFreshnessDays !== null && strategyFreshnessDays > 1) {
    points -= Math.min(10, Math.floor(strategyFreshnessDays - 1) * 3);
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

  return { score: points, grade, strategy, tokenReductionPct, daysSinceRegen, strategyFreshnessDays, totalRuns, overBudgetRuns };
}

module.exports = { score };
