'use strict';

/**
 * Dependency graph builder (v2.5).
 *
 * Builds a forward and reverse dependency graph by resolving import/require
 * statements across JS/TS, Python, Go, Rust, Java, Kotlin, and Ruby files.
 *
 * @module src/graph/builder
 */

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Language-specific import extractors
// ---------------------------------------------------------------------------

const JS_EXTS  = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const PY_EXTS  = new Set(['.py', '.pyw']);
const GO_EXTS  = new Set(['.go']);
const RS_EXTS  = new Set(['.rs']);
const JVM_EXTS = new Set(['.java', '.kt', '.kts', '.scala', '.sc']);
const RB_EXTS  = new Set(['.rb', '.rake']);

/**
 * Resolve a JS/TS relative import string to an absolute path in fileSet.
 * @param {string} dir - directory of the importing file
 * @param {string} importStr - raw import string (e.g. './utils', '../store')
 * @param {Set<string>} fileSet
 * @returns {string|null}
 */
function resolveJsPath(dir, importStr, fileSet) {
  const base = path.resolve(dir, importStr);
  const candidates = [
    base,
    base + '.ts', base + '.tsx',
    base + '.js', base + '.jsx', base + '.mjs', base + '.cjs',
    path.join(base, 'index.ts'),
    path.join(base, 'index.js'),
  ];
  for (const c of candidates) {
    if (fileSet.has(c)) return c;
  }
  return null;
}

/**
 * Extract absolute dependency paths from a single file.
 * @param {string} filePath - absolute path to the file
 * @param {string} content  - file source content
 * @param {Set<string>} fileSet - set of all known absolute file paths
 * @returns {string[]} resolved absolute paths this file imports
 */
function extractFileDeps(filePath, content, fileSet) {
  const ext = path.extname(filePath).toLowerCase();
  const dir = path.dirname(filePath);
  const found = [];

  // ── JS / TS ───────────────────────────────────────────────────────────────
  if (JS_EXTS.has(ext)) {
    const stripped = content
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');

    // ES imports:   import ... from './foo'  or  import './side-effect'
    const reEs = /(?:^|[\r\n])\s*import\s+(?:[^'";\r\n]*?\s+from\s+)?['"](\.[^'"]+)['"]/g;
    let m;
    while ((m = reEs.exec(stripped)) !== null) {
      const r = resolveJsPath(dir, m[1], fileSet);
      if (r) found.push(r);
    }
    // CommonJS: require('./foo')
    const reCjs = /\brequire\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;
    while ((m = reCjs.exec(stripped)) !== null) {
      const r = resolveJsPath(dir, m[1], fileSet);
      if (r) found.push(r);
    }
  }

  // ── Python ────────────────────────────────────────────────────────────────
  if (PY_EXTS.has(ext)) {
    // from .module import ...  /  from ..pkg import ...
    const re = /^[ \t]*from\s+(\.+[\w.]*)\s+import/gm;
    let m;
    while ((m = re.exec(content)) !== null) {
      const dotCount = (m[1].match(/^\.+/) || [''])[0].length;
      const modPart  = m[1].slice(dotCount).replace(/\./g, '/');
      let base = dir;
      for (let i = 1; i < dotCount; i++) base = path.dirname(base);
      const candidate = modPart
        ? path.join(base, modPart + '.py')
        : null;
      if (candidate && fileSet.has(candidate)) found.push(candidate);
    }
  }

  // ── Go ────────────────────────────────────────────────────────────────────
  // Go uses module paths, not relative file paths — we match same-module paths
  // by checking if any known file's relative path matches the imported suffix.
  if (GO_EXTS.has(ext)) {
    const re = /import\s*\(\s*([\s\S]*?)\s*\)/g;
    const reInline = /import\s+"([^"]+)"/g;
    const imports = [];
    let m;
    while ((m = re.exec(content)) !== null) {
      for (const imp of m[1].matchAll(/"([^"]+)"/g)) imports.push(imp[1]);
    }
    while ((m = reInline.exec(content)) !== null) imports.push(m[1]);

    for (const imp of imports) {
      const suffix = imp.split('/').pop();
      for (const f of fileSet) {
        if (f.endsWith(path.sep + suffix + '.go') ||
            f.includes(path.sep + suffix + path.sep)) {
          found.push(f);
          break;
        }
      }
    }
  }

  // ── Rust ──────────────────────────────────────────────────────────────────
  // Match `mod foo;` and `use crate::foo::bar` — resolve to sibling .rs files
  if (RS_EXTS.has(ext)) {
    const reMod = /^\s*(?:pub\s+)?mod\s+(\w+)\s*;/gm;
    let m;
    while ((m = reMod.exec(content)) !== null) {
      const candidate = path.join(dir, m[1] + '.rs');
      if (fileSet.has(candidate)) found.push(candidate);
      // Also try mod/mod.rs
      const candidate2 = path.join(dir, m[1], 'mod.rs');
      if (fileSet.has(candidate2)) found.push(candidate2);
    }
  }

  // ── Java / Kotlin / Scala ─────────────────────────────────────────────────
  // Match same-project import statements by matching package-relative paths
  if (JVM_EXTS.has(ext)) {
    const re = /^\s*import\s+([\w.]+)\s*;?/gm;
    let m;
    while ((m = re.exec(content)) !== null) {
      // Convert com.example.utils.StringHelper → com/example/utils/StringHelper.java
      const asPath = m[1].replace(/\./g, path.sep);
      for (const jvmExt of ['.java', '.kt', '.kts', '.scala', '.sc']) {
        for (const f of fileSet) {
          if (f.endsWith(asPath + jvmExt)) { found.push(f); break; }
        }
      }
    }
  }

  // ── Ruby ──────────────────────────────────────────────────────────────────
  if (RB_EXTS.has(ext)) {
    const re = /^\s*require_relative\s+['"]([^'"]+)['"]/gm;
    let m;
    while ((m = re.exec(content)) !== null) {
      const base = path.resolve(dir, m[1]);
      const candidate  = base.endsWith('.rb') ? base : base + '.rb';
      if (fileSet.has(candidate)) found.push(candidate);
    }
  }

  return [...new Set(found)];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a forward and reverse dependency graph for all given files.
 *
 * @param {string[]} files - absolute file paths to analyze
 * @param {string}   cwd   - project root (used only for error reporting)
 * @returns {{ forward: Map<string,string[]>, reverse: Map<string,string[]> }}
 */
function build(files, cwd) {
  const fileSet = new Set(files.map((f) => path.resolve(f)));
  const forward = new Map();
  const reverse = new Map();

  // Initialise every known file in both maps (ensures isolated files appear)
  for (const f of fileSet) {
    if (!forward.has(f)) forward.set(f, []);
    if (!reverse.has(f)) reverse.set(f, []);
  }

  for (const filePath of fileSet) {
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (_) {
      continue;
    }

    const deps = extractFileDeps(filePath, content, fileSet);
    if (deps.length > 0) {
      forward.set(filePath, deps);
      for (const dep of deps) {
        if (!reverse.has(dep)) reverse.set(dep, []);
        reverse.get(dep).push(filePath);
      }
    }
  }

  return { forward, reverse };
}

/**
 * Build a dependency graph scoped to a single cwd by walking all JS/TS/Py/Go
 * files under srcDirs. Useful for the MCP tool handler.
 *
 * @param {string} cwd
 * @param {object} [opts]
 * @param {string[]} [opts.srcDirs]
 * @param {string[]} [opts.exclude]
 * @returns {{ forward: Map<string,string[]>, reverse: Map<string,string[]> }}
 */
function buildFromCwd(cwd, opts) {
  const { srcDirs = ['src', 'app', 'lib'], exclude = ['node_modules', '.git', 'dist', 'build'] } = opts || {};
  const excludeSet = new Set(exclude);

  function walkDir(dir, depth) {
    if (depth > 8) return [];
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return []; }
    const out = [];
    for (const e of entries) {
      if (excludeSet.has(e.name) || e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        out.push(...walkDir(full, depth + 1));
      } else if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        if (JS_EXTS.has(ext) || PY_EXTS.has(ext) || GO_EXTS.has(ext) ||
            RS_EXTS.has(ext) || JVM_EXTS.has(ext) || RB_EXTS.has(ext)) {
          out.push(full);
        }
      }
    }
    return out;
  }

  const files = [];
  for (const sd of srcDirs) {
    const absDir = path.resolve(cwd, sd);
    if (fs.existsSync(absDir)) files.push(...walkDir(absDir, 0));
  }
  // Also include root-level entry files
  for (const rootFile of ['gen-context.js', 'index.js', 'main.js', 'app.js']) {
    const abs = path.resolve(cwd, rootFile);
    if (fs.existsSync(abs)) files.push(abs);
  }

  return build(files, cwd);
}

module.exports = { build, buildFromCwd, extractFileDeps };
