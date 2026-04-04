'use strict';

/**
 * SigMap zero-dependency tokenizer.
 * Splits code identifiers: camelCase, snake_case, kebab-case, PascalCase,
 * removes stop words, and returns lower-case tokens.
 */

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'in', 'of', 'to', 'for', 'and', 'or', 'is', 'are',
  'that', 'this', 'it', 'with', 'from', 'by', 'be', 'as', 'on', 'at',
  'do', 'not', 'use', 'get', 'set', 'up', 'if', 'no', 'so', 'we',
]);

/**
 * Tokenize any text (query or code signature) into unique lower-case tokens.
 * Handles:
 *   - camelCase  → ['camel', 'case']
 *   - PascalCase → ['pascal', 'case']
 *   - snake_case → ['snake', 'case']
 *   - kebab-case → ['kebab', 'case']
 *   - dot.notation → ['dot', 'notation']
 *   - File paths  → individual path components (no extension)
 *
 * @param {string} text
 * @param {object} [opts]
 * @param {boolean} [opts.removeStopWords=true]
 * @param {number}  [opts.minLength=2]
 * @returns {string[]}
 */
function tokenize(text, opts) {
  if (!text || typeof text !== 'string') return [];
  const removeStop = opts && opts.removeStopWords === false ? false : true;
  const minLen = (opts && opts.minLength) || 2;

  const tokens = text
    // strip file extension (e.g. .js, .ts, .py)
    .replace(/\.\w{1,6}(?=\s|\/|$)/g, ' ')
    // camelCase / PascalCase split
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    // snake_case / kebab-case / dot.notation
    .replace(/[_\-\.\/]/g, ' ')
    // drop remaining non-word characters
    .replace(/[^\w\s]/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= minLen);

  if (!removeStop) return [...new Set(tokens)];
  return [...new Set(tokens.filter((t) => !STOP_WORDS.has(t)))];
}

module.exports = { tokenize, STOP_WORDS };
