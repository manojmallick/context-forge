'use strict';

/**
 * Extract TODO/FIXME/HACK/XXX comments from source text.
 * @param {string} src - Raw file content
 * @returns {{line:number, tag:string, text:string}[]}
 */
function extractTodos(src) {
  if (!src || typeof src !== 'string') return [];
  const todos = [];
  const lines = src.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/(?:\/\/|#)\s*(TODO|FIXME|HACK|XXX)\s*:?\s*(.+)/i);
    if (!m) continue;
    todos.push({
      line: i + 1,
      tag: m[1].toUpperCase(),
      text: m[2].trim().slice(0, 70),
    });
  }

  return todos;
}

module.exports = { extractTodos };
