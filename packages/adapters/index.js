'use strict';

/**
 * packages/adapters/index.js
 * Central registry for all SigMap output adapters.
 *
 * Usage:
 *   const { getAdapter, listAdapters, adapt } = require('sigmap/adapters');
 *   const output = adapt(context, 'copilot', { version: '3.0.0' });
 */

const path = require('path');

const ADAPTER_NAMES = ['copilot', 'claude', 'cursor', 'windsurf', 'openai', 'gemini'];

// Lazy-load adapters so unused ones don't pay any require() cost
const _cache = {};

/**
 * Load and return an adapter module by name.
 * @param {string} name - Adapter name (copilot|claude|cursor|windsurf|openai|gemini)
 * @returns {{ name: string, format: Function, outputPath: Function }|null}
 */
function getAdapter(name) {
  if (!name || typeof name !== 'string') return null;
  const key = name.toLowerCase();
  if (!ADAPTER_NAMES.includes(key)) return null;
  if (!_cache[key]) {
    try {
      _cache[key] = require(path.join(__dirname, key + '.js'));
    } catch (_) {
      return null;
    }
  }
  return _cache[key];
}

/**
 * List all available adapter names.
 * @returns {string[]}
 */
function listAdapters() {
  return ADAPTER_NAMES.slice();
}

/**
 * Format context using the named adapter.
 * @param {string} context - Raw signature context string
 * @param {string} adapterName - Adapter name
 * @param {object} [opts] - Options passed to adapter.format()
 * @returns {string} Formatted output string (empty string if adapter not found or context empty)
 */
function adapt(context, adapterName, opts = {}) {
  if (!context || typeof context !== 'string') return '';
  const adapter = getAdapter(adapterName);
  if (!adapter || typeof adapter.format !== 'function') return '';
  try {
    return adapter.format(context, opts);
  } catch (_) {
    return '';
  }
}

/**
 * Map old `outputs` config values to new `adapters` names.
 * Provides backward compatibility for existing configurations.
 * @param {string[]} outputs - Legacy outputs array
 * @returns {string[]} Equivalent adapters array
 */
function outputsToAdapters(outputs) {
  if (!Array.isArray(outputs)) return ['copilot'];
  return outputs.map((o) => {
    // All current output names already match adapter names
    if (ADAPTER_NAMES.includes(o)) return o;
    return o; // pass through unknowns — getAdapter() will handle gracefully
  });
}

module.exports = { getAdapter, listAdapters, adapt, outputsToAdapters };
