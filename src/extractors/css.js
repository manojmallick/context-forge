'use strict';

/**
 * Extract signatures from CSS/SCSS/SASS/Less source code.
 * @param {string} src - Raw file content
 * @returns {string[]} Array of signature strings
 */
function extract(src) {
  if (!src || typeof src !== 'string') return [];
  const sigs = [];

  const stripped = src
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  // CSS custom properties (variables)
  const rootMatch = stripped.match(/:root\s*\{([^}]*)\}/);
  if (rootMatch) {
    for (const m of rootMatch[1].matchAll(/(--[\w-]+)\s*:/g)) {
      sigs.push(`var ${m[1]}`);
    }
  }

  // SCSS/Less variables
  for (const m of stripped.matchAll(/^(\$[\w-]+)\s*:/gm)) {
    sigs.push(`$var ${m[1]}`);
  }

  // SCSS mixins
  for (const m of stripped.matchAll(/^@mixin\s+([\w-]+)(?:\s*\(([^)]*)\))?/gm)) {
    const params = m[2] ? `(${m[2].trim()})` : '';
    sigs.push(`@mixin ${m[1]}${params}`);
  }

  // SCSS functions
  for (const m of stripped.matchAll(/^@function\s+([\w-]+)\s*\(([^)]*)\)/gm)) {
    sigs.push(`@function ${m[1]}(${m[2].trim()})`);
  }

  // Key class names (top-level)
  const classNames = new Set();
  for (const m of stripped.matchAll(/^\.([\w-]+)(?=[^{]*\{)/gm)) {
    classNames.add(m[1]);
    if (classNames.size >= 10) break;
  }
  for (const name of classNames) sigs.push(`.${name}`);

  return sigs.slice(0, 25);
}

module.exports = { extract };
