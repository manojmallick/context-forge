'use strict';

/**
 * Extract signatures from shell scripts (bash, zsh, fish).
 * @param {string} src - Raw file content
 * @returns {string[]} Array of signature strings
 */
function extract(src) {
  if (!src || typeof src !== 'string') return [];
  const sigs = [];

  const stripped = src.replace(/#.*$/gm, '');

  // Function definitions (bash: name() { and function name {)
  for (const m of stripped.matchAll(/^(?:function\s+)?([\w:-]+)\s*\(\s*\)\s*\{/gm)) {
    if (m[1].startsWith('_')) continue;
    sigs.push(`function ${m[1]}()`);
  }

  // Main entry point patterns
  if (/^\s*main\s*\(/m.test(src) || /^\s*main\s+"?\$@/m.test(src)) {
    sigs.push('main "$@"');
  }

  // Exported variables
  for (const m of stripped.matchAll(/^export\s+([\w]+)=/gm)) {
    sigs.push(`export ${m[1]}`);
  }

  // Script description (first non-comment line after shebang)
  const lines = src.split('\n');
  for (const line of lines.slice(0, 5)) {
    if (line.startsWith('#!')) continue;
    if (line.startsWith('#')) {
      const desc = line.replace(/^#+\s*/, '').trim();
      if (desc) { sigs.unshift(`# ${desc}`); break; }
    }
  }

  return sigs.slice(0, 25);
}

module.exports = { extract };
