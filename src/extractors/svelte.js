'use strict';

/**
 * Extract signatures from Svelte components.
 * @param {string} src - Raw file content
 * @returns {string[]} Array of signature strings
 */
function extract(src) {
  if (!src || typeof src !== 'string') return [];
  const sigs = [];

  // Extract <script> block
  const scriptMatch = src.match(/<script(?:\s[^>]*)?>(?:\s*)([\s\S]*?)<\/script>/i);
  if (!scriptMatch) return sigs;

  const script = scriptMatch[1]
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  // Exported props (writable)
  for (const m of script.matchAll(/^\s+export\s+let\s+(\w+)(?:\s*=\s*[^;]+)?;/gm)) {
    sigs.push(`export let ${m[1]}`);
  }

  // Exported functions
  for (const m of script.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/gm)) {
    const asyncKw = m[0].includes('async') ? 'async ' : '';
    sigs.push(`export ${asyncKw}function ${m[1]}(${normalizeParams(m[2])})`);
  }

  // Top-level functions
  for (const m of script.matchAll(/^(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/gm)) {
    if (m[1].startsWith('_')) continue;
    const asyncKw = m[0].startsWith('async') ? 'async ' : '';
    sigs.push(`${asyncKw}function ${m[1]}(${normalizeParams(m[2])})`);
  }

  // Reactive declarations $:
  for (const m of script.matchAll(/^\s+\$:\s+(\w+)\s*=/gm)) {
    sigs.push(`$: ${m[1]}`);
  }

  return sigs.slice(0, 25);
}

function normalizeParams(params) {
  if (!params) return '';
  return params.trim().replace(/\s+/g, ' ');
}

module.exports = { extract };
