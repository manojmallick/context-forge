'use strict';

/**
 * Method/caller-level call-graph (D4 v1, languages expanded in GR1).
 *
 * Builds symbol-level edges — which function calls which function — for JS/TS,
 * Python, Java, Go, and Rust. Deterministic, zero-dependency, regex +
 * brace/indent matching. Call sites are resolved with high precision: a call
 * resolves to a definition of that name in the *same file* first, then in a
 * *directly-imported* file (via the existing file-level import graph). Names
 * that resolve to no repo definition produce no edge — over-approximation
 * noise is avoided. Constructs that can't be parsed dependency-free are
 * skipped (less fidelity, never a parser dep).
 *
 * Symbol IDs are `relPath#symbolName` (forward-slashed, relative to cwd).
 *
 * @module src/graph/call-graph
 */

const fs = require('fs');
const path = require('path');
const { build } = require('./builder');

const JS_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const PY_EXTS = new Set(['.py', '.pyw']);
const JAVA_EXTS = new Set(['.java']);
const GO_EXTS = new Set(['.go']);
const RS_EXTS = new Set(['.rs']);

// Tokens that look like `name(` calls or definition headers but are language
// keywords, not user symbols — never treated as a call or a definition.
const NON_CALL = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'typeof',
  'await', 'new', 'super', 'else', 'do', 'with', 'yield', 'void', 'delete',
  'in', 'of', 'case', 'throw', 'print', 'and', 'or', 'not', 'assert',
  'lambda', 'class', 'def', 'elif', 'except', 'finally', 'raise', 'import',
  'from', 'global', 'nonlocal', 'del', 'pass', 'async', 'require', 'constructor',
  'synchronized',
]);

const { graphKey } = require('./path-key');
function normalizePath(p) { return graphKey(p); }
function toRel(cwd, f) { return path.relative(cwd, f).replace(/\\/g, '/'); }
function symId(cwd, absFile, name) { return `${toRel(cwd, absFile)}#${name}`; }

// ── Length- and newline-preserving maskers ──────────────────────────────────
// Replace comment / string bodies with spaces so their braces, parens, and
// call-looking tokens never confuse structure detection. Offsets stay aligned.

function maskJs(src) {
  const out = src.split('');
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n') out[k] = ' '; };
  let i = 0; const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { let j = i + 2; while (j < n && src[j] !== '\n') j++; blank(i, j); i = j; continue; }
    if (c === '/' && d === '*') { let j = i + 2; while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j++; j = Math.min(n, j + 2); blank(i, j); i = j; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === c) break; if (c !== '`' && src[j] === '\n') break; j++; }
      j = Math.min(n, j + 1); blank(i, j); i = j; continue;
    }
    i++;
  }
  return out.join('');
}

// Rust: `//`, `/* */`, and `"..."` mask like JS, but a bare `'` is usually a
// lifetime (`'a`), not a string — masking to the "closing" quote would corrupt
// offsets. Only char literals (`'x'`, `'\n'`) are masked; lifetimes pass through.
function maskRust(src) {
  const out = src.split('');
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n') out[k] = ' '; };
  let i = 0; const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { let j = i + 2; while (j < n && src[j] !== '\n') j++; blank(i, j); i = j; continue; }
    if (c === '/' && d === '*') { let j = i + 2; while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j++; j = Math.min(n, j + 2); blank(i, j); i = j; continue; }
    if (c === '"') {
      let j = i + 1;
      while (j < n) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === '"') break; j++; }
      j = Math.min(n, j + 1); blank(i, j); i = j; continue;
    }
    if (c === "'") {
      if (d === '\\' && src[i + 3] === "'") { blank(i, i + 4); i += 4; continue; } // '\n'
      if (d !== undefined && src[i + 2] === "'") { blank(i, i + 3); i += 3; continue; } // 'x'
      i++; continue; // lifetime `'a` — leave untouched
    }
    i++;
  }
  return out.join('');
}

function maskPy(src) {
  const out = src.split('');
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n') out[k] = ' '; };
  let i = 0; const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '#') { let j = i + 1; while (j < n && src[j] !== '\n') j++; blank(i, j); i = j; continue; }
    if (c === '"' || c === "'") {
      if (src.substr(i, 3) === c + c + c) {
        let j = i + 3; while (j < n && src.substr(j, 3) !== c + c + c) j++; j = Math.min(n, j + 3); blank(i, j); i = j; continue;
      }
      let j = i + 1; while (j < n) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === c || src[j] === '\n') break; j++; }
      j = Math.min(n, j + 1); blank(i, j); i = j; continue;
    }
    i++;
  }
  return out.join('');
}

// ── Balanced-delimiter matchers (operate on masked source) ───────────────────
function matchDelim(masked, openIdx, open, close) {
  let depth = 0;
  for (let i = openIdx; i < masked.length; i++) {
    if (masked[i] === open) depth++;
    else if (masked[i] === close) { depth--; if (depth === 0) return i; }
  }
  return masked.length - 1;
}

function lineAt(src, idx) {
  let line = 1;
  const end = Math.min(idx, src.length);
  for (let i = 0; i < end; i++) if (src.charCodeAt(i) === 10) line++;
  return line;
}

// ── Definition extraction ────────────────────────────────────────────────────
// Each def: { name, line, bodyStart, bodyEnd } with char offsets into `masked`.

function jsDefs(masked) {
  const defs = [];
  const seen = new Set();
  const push = (name, headerIdx, bodyStart, bodyEnd) => {
    const key = name + ':' + bodyStart;
    if (NON_CALL.has(name) || seen.has(key)) return;
    seen.add(key);
    defs.push({ name, line: lineAt(masked, headerIdx), bodyStart, bodyEnd });
  };

  // Locate the `{` body (or `=>` expression) that follows a param list `)`.
  const bodyAfterParams = (closeParen) => {
    let k = closeParen + 1;
    // skip a `=>`, return-type annotations, and whitespace up to `{` or a statement end
    while (k < masked.length && masked[k] !== '{' && masked[k] !== ';' && masked[k] !== '\n') k++;
    if (masked[k] === '{') { const end = matchDelim(masked, k, '{', '}'); return { bodyStart: k, bodyEnd: end }; }
    return null; // no braced body (interface/abstract/overload signature) — skip
  };

  // 1) function declarations:  (async) function name(...) { ... }
  const reFn = /\b(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = reFn.exec(masked)) !== null) {
    const paren = masked.indexOf('(', m.index + m[0].length - 1);
    const close = matchDelim(masked, paren, '(', ')');
    const body = bodyAfterParams(close);
    if (body) push(m[1], m.index, body.bodyStart, body.bodyEnd);
  }

  // 2) arrow / function expressions:  const name = (...) => { }  |  = function(...) { }
  const reArrow = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b\s*\*?\s*[A-Za-z_$]*\s*)?\(/g;
  while ((m = reArrow.exec(masked)) !== null) {
    const paren = masked.indexOf('(', m.index + m[0].length - 1);
    const close = matchDelim(masked, paren, '(', ')');
    let k = close + 1;
    while (k < masked.length && /\s/.test(masked[k])) k++;
    if (masked[k] === '{') { push(m[1], m.index, k, matchDelim(masked, k, '{', '}')); continue; }
    if (masked[k] === '=' && masked[k + 1] === '>') {
      let j = k + 2; while (j < masked.length && /\s/.test(masked[j])) j++;
      if (masked[j] === '{') push(m[1], m.index, j, matchDelim(masked, j, '{', '}'));
      else { // single-expression arrow body → to end of statement
        let e = j; let d = 0;
        while (e < masked.length) { const ch = masked[e]; if (ch === '(' || ch === '[') d++; else if (ch === ')' || ch === ']') d--; else if ((ch === ';' || ch === '\n') && d <= 0) break; e++; }
        push(m[1], m.index, j, e);
      }
    }
  }

  // 3) class methods:  class X { name(...) { } }
  const reClass = /\bclass\s+[A-Za-z_$][\w$]*/g;
  while ((m = reClass.exec(masked)) !== null) {
    const brace = masked.indexOf('{', m.index);
    if (brace === -1) continue;
    const classEnd = matchDelim(masked, brace, '{', '}');
    const reMethod = /(?:^|\n)\s*(?:public\s+|private\s+|protected\s+|static\s+|readonly\s+|abstract\s+|async\s+|get\s+|set\s+|\*\s*)*([A-Za-z_$][\w$]*)\s*\(/g;
    reMethod.lastIndex = brace;
    let mm;
    while ((mm = reMethod.exec(masked)) !== null && mm.index < classEnd) {
      const paren = masked.indexOf('(', mm.index + mm[0].length - 1);
      const close = matchDelim(masked, paren, '(', ')');
      const body = bodyAfterParams(close);
      if (body && body.bodyEnd <= classEnd) push(mm[1], mm.index, body.bodyStart, body.bodyEnd);
    }
  }

  return defs;
}

function pyDefs(masked) {
  const defs = [];
  const lines = masked.split('\n');
  // precompute char offset of each line start
  const offsets = [0];
  for (let i = 0; i < lines.length; i++) offsets.push(offsets[i] + lines[i].length + 1);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([ \t]*)(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/);
    if (!m) continue;
    const indent = m[1].length;
    let j = i + 1;
    for (; j < lines.length; j++) {
      const ln = lines[j];
      if (!ln.trim()) continue;                       // blank
      const ind = ln.match(/^[ \t]*/)[0].length;
      if (ind <= indent) break;                        // dedent → block ends
    }
    defs.push({ name: m[2], line: i + 1, bodyStart: offsets[i], bodyEnd: offsets[j] || masked.length });
  }
  return defs;
}

// Go:  func name(...) { }   |   func (r Recv) name(...) (T, error) { }
// The return list may itself be parenthesized, so scan past it to the body `{`.
function goDefs(masked) {
  const defs = [];
  const re = /(?:^|\n)func\s+(?:\([^)\n]*\)\s*)?([A-Za-z_]\w*)\s*\(/g;
  let m;
  while ((m = re.exec(masked)) !== null) {
    const paren = masked.indexOf('(', m.index + m[0].length - 1);
    const close = matchDelim(masked, paren, '(', ')');
    let k = close + 1;
    let depth = 0;
    while (k < masked.length) {
      const ch = masked[k];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === '{' && depth === 0) break;
      else if (ch === '\n' && depth === 0) { k = -1; break; } // no body on this header
      k++;
    }
    if (k === -1 || k >= masked.length) continue;
    defs.push({ name: m[1], line: lineAt(masked, m.index + 1), bodyStart: k, bodyEnd: matchDelim(masked, k, '{', '}') });
  }
  return defs;
}

// Java: methods + constructors with braced bodies. Statement-shaped matches
// (calls, control flow) are rejected because their `)` is followed by `;`,
// and keyword headers (`if`, `while`, …) fall to the NON_CALL guard.
function javaDefs(masked) {
  const defs = [];
  const seen = new Set();
  const re = /(?:^|\n)[ \t]*((?:(?:public|private|protected|static|final|abstract|synchronized|native|default|strictfp)\s+)*)(?:<[^>\n]{0,80}>\s*)?(?:[\w$][\w$.<>\[\],?\s]*?\s+)?([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(masked)) !== null) {
    const name = m[2];
    if (NON_CALL.has(name)) continue;
    // `new Foo() { … }` anonymous classes are uses, not definitions.
    const before = masked.slice(Math.max(0, m.index), m.index + m[0].length - name.length - 1);
    if (/\bnew\s*$/.test(before)) continue;
    const paren = masked.indexOf('(', m.index + m[0].length - 1);
    const close = matchDelim(masked, paren, '(', ')');
    // skip `throws A, B` up to the body `{` (same line — multi-line headers are skipped)
    let k = close + 1;
    while (k < masked.length && masked[k] !== '{' && masked[k] !== ';' && masked[k] !== '\n' && masked[k] !== '=') k++;
    if (masked[k] !== '{') continue;
    const key = name + ':' + k;
    if (seen.has(key)) continue;
    seen.add(key);
    defs.push({ name, line: lineAt(masked, m.index + 1), bodyStart: k, bodyEnd: matchDelim(masked, k, '{', '}') });
  }
  return defs;
}

// Rust: fn name(...) { }  |  fn name<T>(...) -> T where … { }  — inside or
// outside impl/trait blocks. A `;` before the body brace (trait declaration)
// means no body: skipped.
function rustDefs(masked) {
  const defs = [];
  const re = /\bfn\s+([A-Za-z_]\w*)/g;
  let m;
  while ((m = re.exec(masked)) !== null) {
    let k = m.index + m[0].length;
    while (k < masked.length && /\s/.test(masked[k])) k++;
    if (masked[k] === '<') k = matchDelim(masked, k, '<', '>') + 1;
    while (k < masked.length && /\s/.test(masked[k])) k++;
    if (masked[k] !== '(') continue;
    const close = matchDelim(masked, k, '(', ')');
    // return type / where clause may span lines; stop at body `{` or decl `;`
    let b = close + 1;
    while (b < masked.length && masked[b] !== '{' && masked[b] !== ';') b++;
    if (masked[b] !== '{') continue;
    defs.push({ name: m[1], line: lineAt(masked, m.index), bodyStart: b, bodyEnd: matchDelim(masked, b, '{', '}') });
  }
  return defs;
}

// Pick the masker whose comment/string syntax matches the language.
// Java and Go share JS syntax (Go raw strings mask like template literals).
function maskFor(filePath, src) {
  const ext = path.extname(filePath).toLowerCase();
  if (PY_EXTS.has(ext)) return maskPy(src);
  if (RS_EXTS.has(ext)) return maskRust(src);
  return maskJs(src);
}

function extractDefs(filePath, src) {
  const ext = path.extname(filePath).toLowerCase();
  if (JS_EXTS.has(ext)) return jsDefs(maskJs(src));
  if (PY_EXTS.has(ext)) return pyDefs(maskPy(src));
  if (JAVA_EXTS.has(ext)) return javaDefs(maskJs(src));
  if (GO_EXTS.has(ext)) return goDefs(maskJs(src));
  if (RS_EXTS.has(ext)) return rustDefs(maskRust(src));
  return null; // unsupported language
}

// Collect `name(` call tokens within [start,end) of masked source.
function callsInRange(masked, start, end) {
  const slice = masked.slice(start, end);
  const names = new Set();
  const re = /([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(slice)) !== null) {
    // skip a `.name(` method access (can't resolve the receiver deterministically)
    const before = slice[m.index - 1];
    if (before === '.') continue;
    if (!NON_CALL.has(m[1])) names.add(m[1]);
  }
  return names;
}

// ── Public API ───────────────────────────────────────────────────────────────

function _walk(dir, excludeSet, out, depth) {
  if (depth > 8) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
  for (const e of entries) {
    if (excludeSet.has(e.name) || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) _walk(full, excludeSet, out, depth + 1);
    else if (e.isFile()) {
      const ext = path.extname(e.name).toLowerCase();
      if (JS_EXTS.has(ext) || PY_EXTS.has(ext) || JAVA_EXTS.has(ext) || GO_EXTS.has(ext) || RS_EXTS.has(ext)) out.push(full);
    }
  }
}

/**
 * Build the method-level call-graph for a project.
 *
 * @param {string} cwd
 * @param {object} [opts]
 * @param {string[]} [opts.srcDirs=['src','app','lib']]
 * @param {string[]} [opts.exclude]
 * @param {string[]} [opts.files]  explicit absolute file list (skips the walk)
 * @returns {{
 *   forward: Map<string,string[]>,   // callerId → calleeIds
 *   reverse: Map<string,string[]>,   // calleeId → callerIds
 *   defs:    Map<string,{file:string,name:string,line:number}>
 * }}
 */
function buildCallGraph(cwd, opts = {}) {
  const excludeSet = new Set(opts.exclude || ['node_modules', '.git', 'dist', 'build', 'coverage', 'vendor']);
  let files = opts.files ? opts.files.map((f) => path.resolve(f)) : [];
  if (!opts.files) {
    for (const sd of (opts.srcDirs || ['src', 'app', 'lib'])) {
      const abs = path.resolve(cwd, sd);
      if (fs.existsSync(abs)) _walk(abs, excludeSet, files, 0);
    }
  }

  // File-level import graph (for precise call-site resolution). Keys normalized.
  let fileGraph;
  try { fileGraph = build(files, cwd); } catch (_) { fileGraph = { forward: new Map() }; }

  // Per-file definitions + name→file lookups.
  const perFileDefs = new Map();   // absFile → def[]
  const defsByName = new Map();     // absFile → Map<name, symbolId[]>
  const normToAbs = new Map();      // normalized abs → abs
  const defs = new Map();           // symbolId → {file,name,line}

  for (const f of files) {
    normToAbs.set(normalizePath(path.resolve(f)), path.resolve(f));
    let src;
    try { src = fs.readFileSync(f, 'utf8'); } catch (_) { continue; }
    const fileDefs = extractDefs(f, src);
    if (!fileDefs) continue;
    perFileDefs.set(f, fileDefs);
    const byName = new Map();
    for (const d of fileDefs) {
      const id = symId(cwd, f, d.name);
      defs.set(id, { file: toRel(cwd, f), name: d.name, line: d.line });
      if (!byName.has(d.name)) byName.set(d.name, []);
      byName.get(d.name).push(id);
    }
    defsByName.set(f, byName);
  }

  const forward = new Map();
  const reverse = new Map();
  const addEdge = (from, to) => {
    if (from === to) return;
    if (!forward.has(from)) forward.set(from, new Set());
    forward.get(from).add(to);
    if (!reverse.has(to)) reverse.set(to, new Set());
    reverse.get(to).add(from);
  };

  for (const [f, fileDefs] of perFileDefs.entries()) {
    const masked = maskFor(f, fs.readFileSync(f, 'utf8'));
    // resolution scope: this file's defs, then directly-imported files' defs
    const importedAbs = (fileGraph.forward.get(normalizePath(path.resolve(f))) || [])
      .map((nf) => normToAbs.get(nf)).filter(Boolean);
    // Go/Java: same-package symbols are visible with no import statement, and
    // a package is (in practice) a directory — extend the scope to same-dir
    // same-language siblings. Sorted for deterministic resolution order.
    const ext = path.extname(f).toLowerCase();
    if (GO_EXTS.has(ext) || JAVA_EXTS.has(ext)) {
      const siblings = [...perFileDefs.keys()]
        .filter((o) => o !== f && path.dirname(o) === path.dirname(f) && path.extname(o).toLowerCase() === ext)
        .sort();
      importedAbs.push(...siblings);
    }
    for (const d of fileDefs) {
      const callerId = symId(cwd, f, d.name);
      if (!forward.has(callerId)) forward.set(callerId, new Set()); // ensure node exists
      const callees = callsInRange(masked, d.bodyStart, d.bodyEnd);
      for (const nm of callees) {
        const local = (defsByName.get(f) || new Map()).get(nm);
        if (local && local.length) { for (const id of local) addEdge(callerId, id); continue; }
        for (const imp of importedAbs) {
          const ids = (defsByName.get(imp) || new Map()).get(nm);
          if (ids && ids.length) { for (const id of ids) addEdge(callerId, id); break; }
        }
      }
    }
  }

  const toArr = (mapOfSets) => {
    const out = new Map();
    for (const [k, set] of mapOfSets.entries()) out.set(k, [...set]);
    return out;
  };
  return { forward: toArr(forward), reverse: toArr(reverse), defs };
}

/**
 * Collapse the symbol-level call-graph to FILE-level bidirectional edges for
 * the ranker's neighbor boost (opt-in via `retrieval.callGraphBoost`). A file
 * whose functions call into — or are called by — another file gets an edge in
 * both directions. Keys are `path.resolve`-form absolute paths (matching the
 * ranker's lookups); entries and neighbor lists are sorted for determinism.
 *
 * @param {string} cwd
 * @param {object} [opts] { graph } to inject a prebuilt call graph (tests)
 * @returns {{ forward: Map<string,string[]> }}
 */
function buildCallFileGraph(cwd, opts = {}) {
  const graph = opts.graph || buildCallGraph(cwd, opts);
  const edges = new Map(); // absFile → Set<absFile>
  const add = (a, b) => {
    if (a === b) return;
    if (!edges.has(a)) edges.set(a, new Set());
    edges.get(a).add(b);
  };
  for (const [callerId, calleeIds] of graph.forward.entries()) {
    const callerDef = graph.defs.get(callerId);
    if (!callerDef) continue;
    for (const calleeId of calleeIds) {
      const calleeDef = graph.defs.get(calleeId);
      if (!calleeDef || calleeDef.file === callerDef.file) continue;
      // Keyed through graphKey so the file-level call graph shares ONE key space
      // with the import graph. Previously this kept case while builder.js
      // lowercased, so a lookup correct for one silently missed on the other.
      const a = graphKey(path.resolve(cwd, callerDef.file));
      const b = graphKey(path.resolve(cwd, calleeDef.file));
      add(a, b);
      add(b, a);
    }
  }
  const forward = new Map();
  for (const k of [...edges.keys()].sort()) forward.set(k, [...edges.get(k)].sort());
  return { forward };
}

// Resolve a user-supplied symbol (bare name or full `file#name` id) to ids.
function _resolveSymbol(symbol, defs) {
  if (defs.has(symbol)) return [symbol];
  const ids = [];
  for (const id of defs.keys()) if (id.slice(id.indexOf('#') + 1) === symbol) ids.push(id);
  return ids;
}

// BFS over a graph map from seed ids up to maxDepth (0 = unlimited).
function _bfs(seedIds, graph, maxDepth) {
  const direct = new Set();
  const transitive = new Set();
  const visited = new Set(seedIds);
  let frontier = [];
  for (const s of seedIds) for (const nb of (graph.get(s) || [])) if (!visited.has(nb)) { direct.add(nb); visited.add(nb); frontier.push(nb); }
  let depth = 1;
  while (frontier.length && (maxDepth === 0 || depth < maxDepth)) {
    const next = [];
    for (const node of frontier) for (const nb of (graph.get(node) || [])) if (!visited.has(nb)) { transitive.add(nb); visited.add(nb); next.push(nb); }
    frontier = next; depth++;
  }
  return { direct: [...direct], transitive: [...transitive] };
}

/**
 * Method-level blast radius: everything that (transitively) calls `symbol`.
 *
 * @param {string} symbol  bare name or `file#name`
 * @param {string} cwd
 * @param {object} [opts]  { depth=0, ...buildCallGraph opts }
 * @returns {{ symbol:string, resolved:string[], direct:string[], transitive:string[], total:number, unresolved:boolean }}
 */
function methodImpact(symbol, cwd, opts = {}) {
  const graph = opts.graph || buildCallGraph(cwd, opts);
  const ids = _resolveSymbol(symbol, graph.defs);
  if (ids.length === 0) return { symbol, resolved: [], direct: [], transitive: [], total: 0, unresolved: true };
  const { direct, transitive } = _bfs(ids, graph.reverse, opts.depth || 0);
  return { symbol, resolved: ids, direct, transitive, total: direct.length + transitive.length, unresolved: false };
}

/**
 * What `symbol` (transitively) calls.
 * @returns {{ symbol:string, resolved:string[], direct:string[], transitive:string[], total:number, unresolved:boolean }}
 */
function methodCallees(symbol, cwd, opts = {}) {
  const graph = opts.graph || buildCallGraph(cwd, opts);
  const ids = _resolveSymbol(symbol, graph.defs);
  if (ids.length === 0) return { symbol, resolved: [], direct: [], transitive: [], total: 0, unresolved: true };
  const { direct, transitive } = _bfs(ids, graph.forward, opts.depth || 0);
  return { symbol, resolved: ids, direct, transitive, total: direct.length + transitive.length, unresolved: false };
}

// ── Formatters ───────────────────────────────────────────────────────────────
function formatCallGraph(result, kind) {
  const verb = kind === 'callees' ? 'calls' : 'callers of';
  const lines = [`## ${kind === 'callees' ? 'Callees' : 'Callers'}: \`${result.symbol}\``, ''];
  if (result.unresolved) { lines.push('_symbol not found in the call-graph._'); return lines.join('\n'); }
  if (result.total === 0) {
    lines.push(kind === 'callees' ? '_calls no repo-defined symbols._' : '_no repo symbol calls this — zero method blast radius._');
    return lines.join('\n');
  }
  lines.push(`**Total ${verb}:** ${result.total}`, '');
  if (result.direct.length) { lines.push(`### Direct`); for (const id of result.direct) lines.push(`- \`${id}\``); lines.push(''); }
  if (result.transitive.length) { lines.push(`### Transitive`); for (const id of result.transitive) lines.push(`- \`${id}\``); lines.push(''); }
  return lines.join('\n');
}

function formatCallGraphJSON(result, kind) {
  return {
    symbol: result.symbol,
    kind: kind === 'callees' ? 'callees' : 'callers',
    resolved: result.resolved,
    direct: result.direct,
    transitive: result.transitive,
    total: result.total,
    unresolved: result.unresolved,
  };
}

module.exports = {
  buildCallGraph, buildCallFileGraph, methodImpact, methodCallees,
  formatCallGraph, formatCallGraphJSON,
  extractDefs, maskJs, maskPy, maskRust,
};
