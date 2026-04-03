'use strict';

/**
 * Extract signatures from Python source code.
 * @param {string} src - Raw file content
 * @returns {string[]} Array of signature strings
 */
function extract(src) {
  if (!src || typeof src !== 'string') return [];
  const sigs = [];

  // noComments: strip only # comments, keep docstrings (needed for @decorator detection)
  const noComments = src.replace(/#.*$/gm, '');
  // stripped: also strip docstrings (safe for regex matching)
  const stripped = noComments
    .replace(/"""[\s\S]*?"""/g, '')
    .replace(/'''[\s\S]*?'''/g, '');

  // Classes
  for (const m of stripped.matchAll(/^class\s+(\w+)(?:\s*\(([^)]*)\))?\s*:/gm)) {
    const className = m[1];
    const baseName = m[2] ? m[2].trim() : '';
    const bodyStart = m.index + m[0].length;

    // Try @dataclass collapse
    const dcFields = tryExtractDataclassFields(stripped, m.index);
    if (dcFields !== null) {
      sigs.push(`@dataclass ${className}(${dcFields})`);
      continue;
    }

    // Try BaseModel/BaseSettings collapse
    if (/(BaseModel|BaseSettings)/.test(baseName)) {
      const bmFields = tryExtractBaseModelFields(stripped, bodyStart);
      if (bmFields) {
        sigs.push(`class ${className}(${baseName}) ${bmFields}`);
        continue;
      }
    }

    const baseStr = baseName ? `(${baseName})` : '';
    sigs.push(`class ${className}${baseStr}`);

    // Class-level ALL_CAPS constants
    for (const c of extractClassConstants(stripped, bodyStart)) {
      sigs.push(`  ${c}`);
    }

    // Methods
    const methods = extractClassMethods(stripped, bodyStart);
    for (const meth of methods) sigs.push(`  ${meth}`);
  }

  // Top-level functions
  for (const m of stripped.matchAll(/^((?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*[^:]+)?)\s*:/gm)) {
    if (/^_/.test(m[2])) continue;
    const asyncKw = m[1].trimStart().startsWith('async') ? 'async ' : '';
    const params = normalizeParams(m[3]);
    const retType = extractReturnType(m[1] + ':');
    const retStr = retType ? ` → ${retType}` : '';
    const hint = extractDocHint(src, m[2], m[0]);
    const hintStr = hint ? `  # ${hint}` : '';
    sigs.push(`${asyncKw}def ${m[2]}(${params})${retStr}${hintStr}`);
  }

  // FastAPI router endpoints: @router.METHOD("path") + async def name(...)
  const lines = noComments.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    const decLine = lines[i].trim();
    const rm = decLine.match(/^@\w+\.(get|post|put|patch|delete|head)\s*\(\s*['"]([^'"]+)['"]/);
    if (!rm) continue;
    for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
      const fl = lines[j].trim();
      const fm = fl.match(/^(?:async\s+)?def\s+(\w+)/);
      if (fm) { sigs.push(`${rm[1].toUpperCase()} ${rm[2]}  →  ${fm[1]}()`); break; }
      if (fl && !fl.startsWith('@') && !fl.startsWith('#')) break;
    }
  }

  return sigs.slice(0, 30);
}

function extractClassMethods(stripped, startIndex) {
  const methods = [];
  const lines = stripped.slice(startIndex).split('\n');
  for (const line of lines) {
    if (line.trim() === '') continue;
    const indent = line.match(/^(\s+)/);
    if (!indent) break;
    const m = line.match(/^\s+(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^:]+))?\s*:/);
    if (m) {
      if (m[1].startsWith('__') && m[1] !== '__init__') continue;
      if (m[1].startsWith('_') && !m[1].startsWith('__')) continue;
      const asyncKw = line.trimStart().startsWith('async') ? 'async ' : '';
      const params = normalizeParams(m[2]).replace(/^self,?\s*/, '').replace(/^cls,?\s*/, '');
      const retType = m[3] ? m[3].trim().replace(/Optional\[([^\]]+)\]/, '$1|None').slice(0, 30) : '';
      const retStr = retType ? ` → ${retType}` : '';
      methods.push(`${asyncKw}def ${m[1]}(${params})${retStr}`);
    }
  }
  return methods.slice(0, 8);
}

function tryExtractDataclassFields(stripped, classIndex) {
  const before = stripped.slice(Math.max(0, classIndex - 120), classIndex);
  if (!/@dataclass/.test(before)) return null;
  const lines = stripped.slice(classIndex).split('\n');
  const fields = [];
  for (const line of lines.slice(1)) {
    if (line.trim() === '') continue;
    if (!line.match(/^\s+/)) break;
    const f = line.match(/^\s+(\w+)\s*:\s*([^=\n]+?)(?:\s*=.*)?$/);
    if (!f) break;
    const isOptional = f[2].includes('Optional') || /=\s*None/.test(line);
    fields.push(isOptional ? `${f[1]}?` : f[1]);
  }
  return fields.length ? fields.join(', ') : null;
}

function tryExtractBaseModelFields(stripped, bodyStart) {
  const lines = stripped.slice(bodyStart, bodyStart + 800).split('\n');
  const fields = [];
  let foundFirst = false;
  for (const line of lines) {
    if (line.trim() === '') continue;
    if (foundFirst && !/^\s/.test(line)) break;
    if (!line.match(/^\s{4}\w/)) continue;
    foundFirst = true;
    const f = line.match(/^\s{4}(\w+)\s*(?::\s*([^=\n]+?))?(?:\s*=\s*(.*))?$/);
    if (!f || f[1].startsWith('_') || f[1] === 'class' || f[1] === 'def') continue;
    const isOptional = (f[2] || '').includes('Optional') || f[3] !== undefined;
    fields.push(isOptional ? `${f[1]}?` : `${f[1]}*`);
  }
  return fields.length ? `{${fields.slice(0, 6).join(', ')}}` : null;
}

function extractClassConstants(stripped, startIndex) {
  const lines = stripped.slice(startIndex).split('\n');
  const consts = [];
  for (const line of lines) {
    if (!line.match(/^\s+/)) break;
    const c = line.match(/^\s+([A-Z][A-Z0-9_]{2,})\s*=\s*(.+)/);
    if (!c) continue;
    let val = c[2].trim();
    const items = (val.match(/"([^"]+)"/g) || val.match(/'([^']+)'/g) || []);
    if (items.length > 3) val = `[${items[0].replace(/['"]/g, '')}..${items[items.length - 1].replace(/['"]/g, '')}]`;
    if (val.length > 40) val = val.slice(0, 37) + '...';
    consts.push(`${c[1]}=${val}`);
  }
  return consts.slice(0, 3);
}

function extractReturnType(sigLine) {
  const m = sigLine.match(/->\s*([^:]+):/);
  if (!m) return '';
  let rt = m[1].trim();
  rt = rt.replace(/Optional\[([^\]]+)\]/, '$1|None');
  return rt.length > 30 ? rt.slice(0, 27) + '...' : rt;
}

function normalizeParams(params) {
  if (!params) return '';
  return params.trim()
    .split(',')
    .map((p) => {
      const part = p.trim();
      if (!part) return '';
      const stars = part.match(/^(\*{1,2})/)?.[1] || '';
      const rest = part.slice(stars.length);
      const eqIdx = rest.indexOf('=');
      const noDefault = eqIdx !== -1 ? rest.slice(0, eqIdx).trim() : rest.trim();
      const clean = noDefault
        .replace(/Optional\[([^\]]+)\]/, '$1?')
        .replace(/Union\[([^\]]+),\s*None\]/, '$1?');
      return stars + clean;
    })
    .filter((p) => p && p !== 'self' && p !== 'cls')
    .join(', ');
}

function extractDocHint(src, fnName, fnSigLine) {
  if (!src || !fnName || !fnSigLine) return '';
  const escSig = fnSigLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${escSig.replace(/\s+/g, '\\s+')}`, 'm');
  const pos = src.search(re);
  if (pos === -1) return '';
  const afterSig = src.slice(pos + fnSigLine.length, pos + fnSigLine.length + 600);

  // Find first non-empty line after function signature indentation
  const m = afterSig.match(/^\s*\n\s*(?:[rubfRUBF]{0,2})?("""|''')([\s\S]*?)\1/m);
  if (!m) return '';

  const firstLine = m[2]
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean);
  if (!firstLine) return '';

  const sentence = firstLine.split(/[.!?]/)[0].trim();
  return sentence.slice(0, 60);
}

module.exports = { extract };
