'use strict';

const fs = require('fs');
const path = require('path');
const { DEFAULTS } = require('./defaults');

// Keys that are valid in gen-context.config.json
const KNOWN_KEYS = new Set(Object.keys(DEFAULTS));

/**
 * Load and merge configuration for a given working directory.
 *
 * @param {string} cwd - Project root directory
 * @returns {object} Merged config (DEFAULTS + user overrides)
 */
function loadConfig(cwd) {
  const configPath = path.join(cwd, 'gen-context.config.json');
  if (!fs.existsSync(configPath)) {
    return deepClone(DEFAULTS);
  }

  let userConfig;
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    userConfig = JSON.parse(raw);
  } catch (err) {
    console.warn(`[sigmap] config parse error in ${configPath}: ${err.message}`);
    return deepClone(DEFAULTS);
  }

  // Warn on unknown keys (helps catch typos)
  for (const key of Object.keys(userConfig)) {
    if (key.startsWith('_')) continue; // allow _comment etc.
    if (!KNOWN_KEYS.has(key)) {
      console.warn(`[sigmap] unknown config key: "${key}" (ignored)`);
    }
  }

  // Deep merge: top-level known keys from user override defaults
  // For object values (e.g. mcp), merge one level deep
  const merged = deepClone(DEFAULTS);
  for (const key of Object.keys(userConfig)) {
    if (key.startsWith('_')) continue;
    if (!KNOWN_KEYS.has(key)) continue; // skip unknown keys
    const val = userConfig[key];
    if (val !== null && typeof val === 'object' && !Array.isArray(val) &&
        typeof merged[key] === 'object' && !Array.isArray(merged[key])) {
      merged[key] = Object.assign({}, merged[key], val);
    } else {
      merged[key] = val;
    }
  }
  return merged;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

module.exports = { loadConfig };
