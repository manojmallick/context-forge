'use strict';

/**
 * SigMap pricing table — input-token $/Mtok assumptions for the `gain` dashboard.
 *
 * These are ASSUMPTIONS used only to translate "tokens saved" into an estimated
 * dollar figure. They are deliberately conservative and configurable via
 *   --model <name>   or   config.pricingModel
 * The `gain` views always print the model + rate inline so the $ is never
 * presented as exact. Zero npm dependencies.
 */

// USD per 1,000,000 input tokens. Claude rates verified 2026-07 against
// platform.claude.com (Opus 4.8 $5, Sonnet 5/4.6 $3, Haiku 4.5 $1); GPT-4o $2.50.
const PRICES = {
  'claude-sonnet': 3.0,
  'claude-opus': 5.0,
  'claude-haiku': 1.0,
  'gpt-4o': 2.5,
  'gpt-4o-mini': 0.15,
  'gemini-1.5-pro': 1.25,
  'gemini-1.5-flash': 0.075,
  'minimax-m3': 0.6,
  'minimax-m2.7': 0.3,
};

const DEFAULT_MODEL = 'claude-sonnet';

/**
 * Resolve a price (USD per token) for a model name.
 * @param {string} [model]
 * @returns {{ model: string, perMtok: number, perToken: number }}
 */
function resolvePrice(model) {
  const key = (model || DEFAULT_MODEL).toLowerCase();
  const perMtok = PRICES[key] != null ? PRICES[key] : PRICES[DEFAULT_MODEL];
  const resolved = PRICES[key] != null ? key : DEFAULT_MODEL;
  return { model: resolved, perMtok, perToken: perMtok / 1_000_000 };
}

/** @returns {string[]} known model keys */
function listModels() {
  return Object.keys(PRICES);
}

module.exports = { PRICES, DEFAULT_MODEL, resolvePrice, listModels };
