'use strict';

/**
 * Class hierarchy analyzer.
 * Extracts class declarations with extends/implements across
 * TypeScript, JavaScript, Python, Java, Kotlin, C# files.
 *
 * @param {string[]} files — absolute file paths to analyze
 * @param {string}   cwd   — project root for relative path display
 * @returns {string} formatted section content (empty string if nothing found)
 */

const fs = require('fs');
const path = require('path');

function analyze(files, cwd) {
  const entries = [];

  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase();
    const rel = path.relative(cwd, filePath).replace(/\\/g, '/');
    let content;
    try { content = fs.readFileSync(filePath, 'utf8'); } catch (_) { continue; }

    // TS / JS
    if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
      const re = /^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+([\w<>.]+?))?(?:\s+implements\s+([\w<>.,\s]+?))?\s*\{/gm;
      let m;
      while ((m = re.exec(content)) !== null) {
        const parent = m[2] ? m[2].split('<')[0].trim() : null;
        const ifaces = m[3]
          ? m[3].split(',').map((s) => s.split('<')[0].trim()).filter(Boolean)
          : [];
        entries.push({ name: m[1], parent, interfaces: ifaces, file: rel });
      }
    }

    // Python
    if (['.py', '.pyw'].includes(ext)) {
      const re = /^\s*class\s+(\w+)\s*\(([^)]*)\)\s*:/gm;
      let m;
      while ((m = re.exec(content)) !== null) {
        const parents = m[2]
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s && s !== 'object');
        entries.push({
          name: m[1],
          parent: parents[0] || null,
          interfaces: parents.slice(1),
          file: rel,
        });
      }
    }

    // Java
    if (ext === '.java') {
      const re = /^\s*(?:(?:public|protected|private|static|abstract|final)\s+)*class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s<>]+?))?\s*\{/gm;
      let m;
      while ((m = re.exec(content)) !== null) {
        const ifaces = m[3]
          ? m[3].split(',').map((s) => s.split('<')[0].trim()).filter(Boolean)
          : [];
        entries.push({ name: m[1], parent: m[2] || null, interfaces: ifaces, file: rel });
      }
    }

    // Kotlin
    if (['.kt', '.kts'].includes(ext)) {
      const re = /^\s*(?:(?:data|sealed|abstract|open|inner)\s+)?class\s+(\w+)(?:\s*[^:\r\n]*)?\s*:\s*([\w<>(),.\s]+?)(?:\s*\{|$)/gm;
      let m;
      while ((m = re.exec(content)) !== null) {
        const parents = m[2]
          .split(',')
          .map((s) => s.replace(/\(.*?\)/, '').split('<')[0].trim())
          .filter(Boolean);
        entries.push({
          name: m[1],
          parent: parents[0] || null,
          interfaces: parents.slice(1),
          file: rel,
        });
      }
    }

    // C#
    if (ext === '.cs') {
      const re = /^\s*(?:(?:public|internal|protected|private|static|abstract|sealed|partial)\s+)*class\s+(\w+)(?:\s*:\s*([\w<>.,\s]+?))?\s*\{/gm;
      let m;
      while ((m = re.exec(content)) !== null) {
        const parents = m[2]
          ? m[2].split(',').map((s) => s.split('<')[0].trim()).filter(Boolean)
          : [];
        entries.push({
          name: m[1],
          parent: parents[0] || null,
          interfaces: parents.slice(1),
          file: rel,
        });
      }
    }
  }

  if (entries.length === 0) return '';

  return entries
    .map((e) => {
      let line = e.name;
      if (e.parent) line += ` extends ${e.parent}`;
      if (e.interfaces.length > 0) line += ` implements ${e.interfaces.join(', ')}`;
      line += ` (${e.file})`;
      return line;
    })
    .join('\n');
}

module.exports = { analyze };
