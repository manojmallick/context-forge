'use strict';

/**
 * SigMap zero-dependency relevance ranker.
 *
 * Ranks all files in a signature index against a natural-language query.
 * Scoring weights:
 *   - keyword overlap (exact token match against sigs)
 *   - symbol match (token appears in a top-level identifier / function name)
 *   - partial prefix match (token is prefix of a sig token, length ≥ 4)
 *   - path relevance (query token appears in the file path)
 *   - recency boost (applied externally via recency map)
 *
 * Usage:
 *   const { rank } = require('./src/retrieval/ranker');
 *   const results = rank(query, sigIndex, { topK: 10 });
 *   // results: [{ file, score, sigs, tokens }]
 */

const { loadWeights } = require('../learning/weights');
const { tokenize, STOP_WORDS } = require('./tokenizer');
const { bm25rank, MODULE_DOC_RE } = require('./bm25');

// ---------------------------------------------------------------------------
// Default weights
// ---------------------------------------------------------------------------
const DEFAULT_WEIGHTS = {
  exactToken: 1.0,       // query token exactly in sig tokens
  symbolMatch: 0.5,      // bonus if token appears in a function/class name line
  prefixMatch: 0.3,      // partial prefix hit (query token ≥ 4 chars)
  pathMatch: 0.8,        // query token appears in the file path
  recencyBoost: 1.5,     // multiplier applied when file is in recencySet
  graphBoost: 0.4,       // additive bonus for 1-hop import neighbors of matching files
};

// Graph boost amounts for 2-hop traversal with decay (v6.7)
const GRAPH_BOOST_AMOUNTS = {
  hop1: 0.40,   // direct import neighbor of a file with score > 0
  hop2: 0.15,   // 2 hops away (transitive), with decay
  callHop: 0.30, // call-graph file neighbor (opt-in retrieval.callGraphBoost)
};

// Max additive prior for import-graph centrality (opt-in retrieval.centralityBlend)
const CENTRALITY_BLEND_WEIGHT = 0.3;

// Per-intent weight profiles were removed in favour of a single weight set.
// They were provably inert: scoreFile's score was discarded by rank(), so the
// profiles only ever reached the explain table. Once the signal WAS wired into
// the score (see SIGNAL_BLEND below), a sweep over the leak-free hard corpus
// showed intent-specific profiles produced byte-identical metrics to the flat
// DEFAULT_WEIGHTS at every blend value — so they earn nothing and are gone.
// `detectIntent` is retained: it is still reported to the user and is the right
// hook for shaping OUTPUT depth later.

// How much the weighted keyword/symbol/path signal modulates the BM25 base.
// Multiplicative and bounded, so it can only reorder files that already match —
// it can never lift a zero-BM25 file into the results. Tuned on the leak-free
// corpus: 0.5 gave hit@5 50.0% -> 56.7% and MRR 0.419 -> 0.447; higher values
// held hit@5 but degraded MRR.
const SIGNAL_BLEND = 0.5;

// TRIED AND REJECTED: a same-line co-occurrence bonus, on the theory that a file
// declaring `parseAuthToken` should outrank one mentioning `parseAuth` and
// `token` on separate lines. Swept 0.15-1.0: hit@5 did not move on either the
// 90-task authored corpus or the 32-task mined one, and MRR degraded
// monotonically as the weight rose. Signatures are short and dense enough that
// BM25's bag already captures this. Not reinstated without new evidence.

// Penalty multipliers for negative signals
const PENALTY_SIGNALS = {
  testFile:      0.4,    // test/spec/__tests__ in path
  generatedCode: 0.3,    // dist/build/.next in path
  docsFile:      0.2,    // docs/doc/README in path
  nodeModules:   0.0,    // node_modules (zero score)
  dataHolder:    0.3,    // generated POJO/entity: almost entirely accessors
};

// A file whose members are overwhelmingly trivial accessors is a data holder,
// not logic. Path-based detection cannot see these: generated JPA/MyBatis
// entities live in ordinary source trees. They match a query on any column
// name they happen to carry (`getNote`/`setNote` matches "note" as strongly as
// the service that actually implements order notes), so on an entity-heavy
// repo they crowd real code out of the top results.
const ACCESSOR_RE = /^\s*(get|set|is)[A-Z]\w*\s*\(/;
const DATA_HOLDER_RATIO = 0.8;
const DATA_HOLDER_MIN_MEMBERS = 6;

// Query terms that mean the penalised category IS the target. Read from the
// query tokens directly, NOT via detectIntent: that classifier is first-match-
// wins over its pattern object, and `debug` precedes `test`, so "fix the failing
// test" classifies as debug and never reaches the test branch.
const WANTS_TESTS = new Set(['test', 'tests', 'spec', 'specs', 'unit', 'integration', 'e2e', 'assertion', 'assert', 'mock', 'fixture', 'coverage', 'testing']);
const WANTS_DOCS = new Set(['doc', 'docs', 'documentation', 'readme', 'changelog', 'guide', 'tutorial']);
const WANTS_MODELS = new Set(['entity', 'entities', 'model', 'models', 'pojo', 'dto', 'bean', 'getter', 'getters', 'setter', 'setters', 'accessor', 'accessors', 'field', 'fields', 'column', 'columns', 'schema']);

/** Which penalised categories the query is explicitly asking for. */
function _queryWants(queryTokens) {
  const wants = { tests: false, docs: false, models: false };
  for (const t of queryTokens || []) {
    if (WANTS_TESTS.has(t)) wants.tests = true;
    if (WANTS_DOCS.has(t)) wants.docs = true;
    if (WANTS_MODELS.has(t)) wants.models = true;
  }
  return wants;
}

/**
 * True when a file's members are overwhelmingly trivial accessors — a generated
 * entity or POJO rather than logic. Type declarations are excluded from the
 * ratio so a small class is not misjudged by its own `class X` line.
 */
function _isDataHolder(sigs) {
  if (!Array.isArray(sigs)) return false;
  const members = sigs.filter((line) => /^\s/.test(line) || !/^(class|interface|enum|struct|function|module\.exports)\b/.test(line));
  if (members.length < DATA_HOLDER_MIN_MEMBERS) return false;
  const accessors = members.filter((line) => ACCESSOR_RE.test(line)).length;
  return accessors / members.length >= DATA_HOLDER_RATIO;
}

function _computePenalty(filePath, wants, sigs) {
  const pathLower = filePath.toLowerCase();
  if (pathLower.includes('node_modules')) return PENALTY_SIGNALS.nodeModules;
  // A penalty must never fire on the very thing the user asked for. Before
  // this, "write tests for the ranker" multiplied every test file by 0.4 —
  // the query and the penalty were pulling in opposite directions.
  if (/(^|\/)(test|tests|spec|__tests__|e2e)($|\/)/.test(pathLower) || /\.(test|spec)\./.test(pathLower)) {
    return (wants && wants.tests) ? 1.0 : PENALTY_SIGNALS.testFile;
  }
  if (/(^|\/)(dist|build|\.next|\.nuxt|out|\.venv|venv)($|\/)/.test(pathLower)) return PENALTY_SIGNALS.generatedCode;
  if (/(^|\/)(docs|doc|readme|changelog)($|\/)/.test(pathLower)) {
    return (wants && wants.docs) ? 1.0 : PENALTY_SIGNALS.docsFile;
  }
  // Content-based, and last: a data holder is still a real source file, so it
  // is only demoted once the path-based categories have had their say.
  if (_isDataHolder(sigs)) {
    return (wants && wants.models) ? 1.0 : PENALTY_SIGNALS.dataHolder;
  }
  return 1.0;
}

// Detect hub files: those with fanout > 20% of all files in the graph
function _computeHubs(graph) {
  if (!graph || !graph.reverse) return new Set();
  const fileCount = Math.max(1, graph.reverse.size);
  const threshold = Math.ceil(fileCount * 0.2);
  const hubs = new Set();
  for (const [file, deps] of graph.reverse) {
    if ((deps && deps.size >= threshold) || (Array.isArray(deps) && deps.length >= threshold)) {
      hubs.add(file);
    }
  }
  return hubs;
}

// Common utility paths that should be treated as hubs regardless of fanout
// The graph builders disagree on key case: src/graph/builder.js lowercases every
// node (normalizePath), while src/graph/call-graph.js keys by a case-preserving
// path.resolve. Assuming either one breaks the other, so every graph lookup in
// this file probes both forms — the same thing the centrality blend already does.
function _graphKeys(p) {
  const norm = require('path').normalize(p);
  const lower = norm.toLowerCase();
  return lower === norm ? [norm] : [norm, lower];
}
function _graphGet(map, absPath) {
  for (const k of _graphKeys(absPath)) {
    const hit = map.get(k);
    if (hit !== undefined) return hit;
  }
  return undefined;
}
function _registerKeys(map, absPath, value) {
  for (const k of _graphKeys(absPath)) if (!map.has(k)) map.set(k, value);
}

function _isHub(filePath) {
  return /\/(utils|helpers|shared|common|constants|types|interfaces|index|zzz|globals)\.(ts|tsx|js|jsx|r|R)$/.test(filePath)
      || filePath.endsWith('/index.ts') || filePath.endsWith('/index.js')
      || filePath.endsWith('/R/utils.R') || filePath.endsWith('/R/zzz.R') || filePath.endsWith('/R/globals.R');
}

/**
 * Score a single file against a query, returning detailed signal breakdown.
 *
 * @param {string}   filePath   - relative file path (e.g. 'src/extractors/python.js')
 * @param {string[]} sigs       - signature strings for this file
 * @param {string[]} queryTokens - pre-tokenized query
 * @param {object}   weights
 * @returns {{ score: number, signals: { exactToken: number, symbolMatch: number, prefixMatch: number, pathMatch: number, penalty: number } }}
 */
function scoreFile(filePath, sigs, queryTokens, weights, wants) {
  if (!sigs || sigs.length === 0) return { score: 0, signals: { exactToken: 0, symbolMatch: 0, prefixMatch: 0, pathMatch: 0, penalty: 1.0 } };

  const w = weights || DEFAULT_WEIGHTS;
  const signals = { exactToken: 0, symbolMatch: 0, prefixMatch: 0, pathMatch: 0, penalty: _computePenalty(filePath, wants, sigs) };

  // Module-doc prose is excluded here on purpose. This signal measures overlap
  // with DECLARED IDENTIFIERS; prose relevance is BM25's job, where it is scored
  // as its own weighted field. Letting descriptive text inflate the identifier
  // signal double-counts it and measurably degraded MRR.
  const codeSigs = sigs.filter((line) => !MODULE_DOC_RE.test(line));
  const sigText = codeSigs.join(' ');
  const sigTokenSet = new Set(tokenize(sigText));

  // Build token set from the file path
  const pathTokenSet = new Set(tokenize(filePath));

  let score = 0;

  for (const qt of queryTokens) {
    if (STOP_WORDS.has(qt)) continue;

    // Exact token match in sigs
    if (sigTokenSet.has(qt)) {
      const bonus = w.exactToken;
      score += bonus;
      signals.exactToken += bonus;

      // Bonus: appears directly in a function/class/method name line
      const nameLineMatch = codeSigs.some((sig) => {
        const nt = tokenize(sig.replace(/[^a-zA-Z0-9_\s]/g, ' '));
        return nt.includes(qt);
      });
      if (nameLineMatch) {
        score += w.symbolMatch;
        signals.symbolMatch += w.symbolMatch;
      }
    }

    // Prefix match (e.g. query "python" matches "pythonDeps")
    if (qt.length >= 4) {
      for (const st of sigTokenSet) {
        if (st !== qt && st.startsWith(qt)) {
          score += w.prefixMatch;
          signals.prefixMatch += w.prefixMatch;
          break; // one bonus per query token
        }
      }
    }

    // Path token match
    if (pathTokenSet.has(qt)) {
      score += w.pathMatch;
      signals.pathMatch += w.pathMatch;
    }
  }

  // Apply penalty multiplier
  score *= signals.penalty;

  return { score, signals };
}

/**
 * Rank all files in a signature index against a query.
 *
 * @param {string}              query     - natural language query
 * @param {Map<string,string[]>} sigIndex - Map<file, sigs[]>
 * @param {object}  [opts]
 * @param {number}  [opts.topK=10]               - max results to return
 * @param {number}  [opts.recencyBoost=1.5]       - multiplier for recent files
 * @param {Set<string>} [opts.recencySet]         - set of recently-changed file paths
 * @param {object}  [opts.weights]               - override scoring weights
 * @param {string}  [opts.cwd]                   - project root for learned ranking weights
 * @param {{ forward: Map<string,string[]> }} [opts.graph] - dependency graph for neighbor boost
 * @param {{ forward: Map<string,string[]> }} [opts.callGraph] - file-level call-graph edges
 *        (from buildCallFileGraph) for the opt-in call-neighbor boost
 * @param {Map<string,number>} [opts.centrality] - absolute file → normalized
 *        centrality (from computeCentrality) for the opt-in centrality blend
 * @returns {{ file: string, score: number, sigs: string[], tokens: number, intent: string, signals: object }[]}
 */
function rank(query, sigIndex, opts) {
  if (!query || typeof query !== 'string') return [];
  if (!sigIndex || !(sigIndex instanceof Map) || sigIndex.size === 0) return [];

  const topK = (opts && opts.topK) || 10;
  const recencyMultiplier = (opts && opts.recencyBoost) || DEFAULT_WEIGHTS.recencyBoost;
  const recencySet = (opts && opts.recencySet) || null;
  const graph = (opts && opts.graph && opts.graph.forward instanceof Map) ? opts.graph : null;
  const cwd = (opts && opts.cwd) || null;

  // Intent is reported to the user and shapes output depth; it no longer
  // selects scoring weights (see SIGNAL_BLEND).
  const intent = detectIntent(query);
  const weights = (opts && opts.weights) ? Object.assign({}, DEFAULT_WEIGHTS, opts.weights) : DEFAULT_WEIGHTS;
  // Learned per-file multipliers are a LOCAL, evolving signal (.context/weights.json).
  // Benchmarks and CI gates must opt out via { learned: false }, or a developer's
  // local learned state silently changes the score and CI stops being reproducible.
  const useLearned = !(opts && opts.learned === false);
  const learnedWeights = opts && opts.cwd && useLearned ? loadWeights(opts.cwd) : null;

  const queryTokens = tokenize(query);
  const queryWants = _queryWants(queryTokens);
  if (queryTokens.length === 0) {
    // Empty query: return top-K by file count (most signatures = most useful)
    const all = [];
    for (const [file, sigs] of sigIndex.entries()) {
      all.push({ file, score: sigs.length, sigs, tokens: Math.ceil(sigs.join('\n').length / 4), intent, signals: {} });
    }
    all.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
    return all.slice(0, topK);
  }

  // Identifier-aware BM25 base relevance over the whole index (#395). BM25
  // splits camelCase/snake_case, stems, and boosts path tokens, so queries
  // whose terms live inside identifiers (e.g. "component emit" → componentEmits)
  // are matched. The existing negative-signal penalty and recency/graph/learned
  // boosts are layered on top; the per-token signals stay for the explain table.
  const bm25Scores = new Map();
  for (const c of bm25rank(query, [...sigIndex.entries()].map(([file, sigs]) => ({ file, sigs })), opts)) {
    bm25Scores.set(c.file, c.score);
  }

  // Two passes: scoreFile's weighted signal needs the max across the corpus to
  // normalise against, so collect first, then combine.
  const prescored = [];
  let maxSignal = 0;
  for (const [file, sigs] of sigIndex.entries()) {
    const result = scoreFile(file, sigs, queryTokens, weights, queryWants);
    if (result.score > maxSignal) maxSignal = result.score;
    prescored.push({ file, sigs, result });
  }

  const scored = [];
  for (const { file, sigs, result } of prescored) {
    const penalty = result.signals.penalty;
    const base = bm25Scores.get(file) || 0;
    // Blend the weighted keyword/symbol/path signal into the BM25 base. This
    // was previously computed and thrown away — `result.score` was never read,
    // which silently made DEFAULT_WEIGHTS and every intent profile dead config.
    const signalNorm = maxSignal > 0 ? result.score / maxSignal : 0;
    let score = base * penalty * (1 + SIGNAL_BLEND * signalNorm);
    const signals = result.signals;
    signals.bm25 = base;
    signals.signalBlend = signalNorm;

    // Recency boost
    if (recencySet && recencySet.has(file) && score > 0) {
      score *= recencyMultiplier;
      signals.recencyBoost = recencyMultiplier;
    }

    if (learnedWeights && score > 0) {
      const multiplier = learnedWeights[file] || 1.0;
      score *= multiplier;
      signals.learnedWeights = multiplier;
    }

    scored.push({
      file,
      score,
      sigs,
      tokens: Math.ceil(sigs.join('\n').length / 4),
      intent,
      signals,
    });
  }

  // Graph neighbor boost: 2-hop traversal with decay (v6.7)
  // Hop 1: add hop1 amount to direct import neighbors (score > 0)
  // Hop 2: add hop2 amount to neighbors of hop1 files (with decay)
  // Hub suppression: files with high fanout (>20%) are not boosted
  if (graph && cwd) {
    const path = require('path');
    // Every graph node is keyed by `path.normalize(p).toLowerCase()` (see
    // normalizePath in src/graph/builder.js and src/graph/call-graph.js).
    // Lookups MUST use the same key space: a bare path.resolve() preserves
    // case, so on any repo whose absolute path contains an uppercase letter
    // every .get() missed and this entire block was silently inert.
    const keyToIdx = new Map();
    for (let i = 0; i < scored.length; i++) {
      _registerKeys(keyToIdx, path.resolve(cwd, scored[i].file), i);
    }

    const hubs = _computeHubs(graph);
    const hop1Files = new Set(); // normalised keys that received a hop1 boost
    const hop1Seeds = [];        // original (un-normalised) paths, for hop-2 lookup

    // Hop 1: direct neighbors of scored files
    for (const entry of scored) {
      if (entry.score <= 0) continue;
      const neighbors = _graphGet(graph.forward, path.resolve(cwd, entry.file)) || [];
      for (const neighborAbs of neighbors) {
        const nk = path.normalize(neighborAbs);
        if (_isHub(nk) || hubs.has(nk) || hubs.has(nk.toLowerCase())) continue;
        const idx = _graphGet(keyToIdx, nk);
        if (idx !== undefined) {
          scored[idx].score += GRAPH_BOOST_AMOUNTS.hop1;
          scored[idx].signals.graphBoost = (scored[idx].signals.graphBoost || 0) + GRAPH_BOOST_AMOUNTS.hop1;
          hop1Files.add(nk);
          hop1Seeds.push(neighborAbs);
        }
      }
    }

    // Hop 2: neighbors of hop1 files (only if they didn't get a direct score)
    for (const hop1Key of hop1Seeds) {
      if (_graphGet(keyToIdx, hop1Key) === undefined) continue; // skip files not in index
      const neighbors = _graphGet(graph.forward, hop1Key) || [];
      for (const neighborAbs of neighbors) {
        const nk = path.normalize(neighborAbs);
        if (_isHub(nk) || hubs.has(nk) || hubs.has(nk.toLowerCase())) continue;
        if (hop1Files.has(nk)) continue; // skip already hop1-boosted
        const idx = _graphGet(keyToIdx, nk);
        if (idx !== undefined && scored[idx].score > 0) {
          // Only boost files that have some baseline score (not noise)
          scored[idx].score += GRAPH_BOOST_AMOUNTS.hop2;
          scored[idx].signals.graphBoost = (scored[idx].signals.graphBoost || 0) + GRAPH_BOOST_AMOUNTS.hop2;
        }
      }
    }
  }

  // Call-graph neighbor boost (opt-in via retrieval.callGraphBoost): a file
  // whose functions call into — or are called by — a positively-scored file is
  // relevant even when no import edge exists (Go/Java same-package, dynamic
  // dispatch). Single hop; seeds snapshotted first so boosts never cascade.
  const callGraph = (opts && opts.callGraph && opts.callGraph.forward instanceof Map) ? opts.callGraph : null;
  if (callGraph && cwd) {
    const path = require('path');
    // buildCallFileGraph keys by a CASE-PRESERVING path.resolve, unlike the
    // import graph builder which lowercases — hence the dual-form probe.
    const keyToIdx = new Map();
    for (let i = 0; i < scored.length; i++) _registerKeys(keyToIdx, path.resolve(cwd, scored[i].file), i);
    const hubs = _computeHubs(callGraph);
    const seeds = scored.filter((e) => e.score > 0).map((e) => e.file);
    for (const file of seeds) {
      for (const neighborAbs of (_graphGet(callGraph.forward, path.resolve(cwd, file)) || [])) {
        const nk = path.normalize(neighborAbs);
        if (_isHub(nk) || hubs.has(nk) || hubs.has(nk.toLowerCase())) continue;
        const idx = _graphGet(keyToIdx, nk);
        if (idx !== undefined && scored[idx].file !== file) {
          scored[idx].score += GRAPH_BOOST_AMOUNTS.callHop;
          scored[idx].signals.callGraphBoost = (scored[idx].signals.callGraphBoost || 0) + GRAPH_BOOST_AMOUNTS.callHop;
        }
      }
    }
  }

  // Centrality blend (opt-in via retrieval.centralityBlend): a small additive
  // prior from import-graph centrality so heavily-referenced files rank above
  // one-off helpers on ambiguous queries. Applied only to positively-scored
  // files — a tie-breaker among matches, never a way to surface non-matches.
  const centrality = (opts && opts.centrality instanceof Map && opts.centrality.size > 0) ? opts.centrality : null;
  if (centrality && cwd) {
    const path = require('path');
    for (const entry of scored) {
      if (entry.score <= 0) continue;
      const abs = path.resolve(cwd, entry.file);
      // The graph builder lowercases paths (normalizePath) — probe both forms.
      const c = centrality.get(abs) || centrality.get(abs.toLowerCase());
      if (c) {
        const bonus = CENTRALITY_BLEND_WEIGHT * c;
        entry.score += bonus;
        entry.signals.centrality = bonus;
      }
    }
  }

  // Compute confidence levels based on score distribution
  if (scored.length > 0) {
    const scores = scored.map(s => s.score);
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    const scoreRange = maxScore - minScore || 1;

    // Confidence tiers: top 33% = high, next 33% = medium, rest = low
    for (const entry of scored) {
      if (entry.score <= 0) {
        entry.confidence = 'low';
      } else {
        const normalized = (entry.score - minScore) / scoreRange;
        entry.confidence = normalized > 0.66 ? 'high' : normalized > 0.33 ? 'medium' : 'low';
      }
    }
  }

  scored.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
  return scored.slice(0, topK);
}

/**
 * All paths where sigmap adapters write their context files, in probe order.
 * The first existing file with a non-empty index wins when no explicit path
 * is supplied.
 */
const ADAPTER_OUTPUT_PATHS = [
  ['.github', 'copilot-instructions.md'], // copilot (default)
  ['CLAUDE.md'],                           // claude
  ['AGENTS.md'],                           // codex
  ['.cursorrules'],                        // cursor
  ['.windsurfrules'],                      // windsurf
  ['.github', 'openai-context.md'],        // openai
  ['.github', 'gemini-context.md'],        // gemini
  ['llm-full.txt'],                        // llm-full
  ['llm.txt'],                             // llm
];

/**
 * Parse a single context file into a Map<filePath, string[]>.
 *
 * Files that contain human-written content before an
 * "## Auto-generated signatures" marker (e.g. CLAUDE.md) are handled
 * by skipping everything above the marker before scanning for ### headers.
 *
 * @param {string} contextPath  - absolute path to the context file
 * @returns {Map<string, string[]>}
 */
function _parseContextFile(contextPath) {
  const fs = require('fs');
  const index = new Map();

  if (!fs.existsSync(contextPath)) return index;

  let content = fs.readFileSync(contextPath, 'utf8');

  // Skip any human-written preamble that sits above the auto-generated block.
  const markerIdx = content.indexOf('## Auto-generated signatures');
  if (markerIdx !== -1) content = content.slice(markerIdx);

  const lines = content.split('\n');
  let currentFile = null;
  let inBlock = false;
  let sigs = [];

  for (const line of lines) {
    const headerMatch = line.match(/^###\s+(\S+)\s*$/);
    if (headerMatch) {
      if (currentFile !== null) index.set(currentFile, sigs);
      currentFile = headerMatch[1];
      sigs = [];
      inBlock = false;
      continue;
    }
    if (line.startsWith('```')) { inBlock = !inBlock; continue; }
    if (inBlock && currentFile && line.trim()) sigs.push(line.trim());
  }
  if (currentFile !== null) index.set(currentFile, sigs);

  return index;
}

/** Merge source index into target; prefer non-empty sig lists. */
function _mergeSigIndex(target, source) {
  for (const [file, sigs] of source.entries()) {
    if (!sigs || sigs.length === 0) continue;
    if (!target.has(file) || target.get(file).length < sigs.length) {
      target.set(file, sigs);
    }
  }
  return target;
}

/**
 * Load signatures from .sigmap-cache.json (absolute paths → repo-relative keys).
 * @param {string} cwd
 * @returns {Map<string, string[]>}
 */
function _buildSigIndexFromCache(cwd) {
  const fs = require('fs');
  const path = require('path');
  const index = new Map();
  try {
    const { loadCache } = require('../cache/sig-cache');
    const pkgPath = path.join(cwd, 'package.json');
    let version = '0.0.0';
    if (fs.existsSync(pkgPath)) {
      version = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version || version;
    }
    const cache = loadCache(cwd, version);
    for (const [absPath, entry] of cache.entries()) {
      if (!entry || !entry.sigs || entry.sigs.length === 0) continue;
      const rel = path.relative(cwd, absPath).replace(/\\/g, '/');
      if (!rel || rel.startsWith('..')) continue;
      index.set(rel, entry.sigs);
    }
  } catch (_) {}
  return index;
}

/**
 * Hot-cold and per-module strategies store most signatures outside the primary
 * copilot-instructions.md file. MCP tools must merge all sources.
 * @param {string} cwd
 * @returns {Map<string, string[]>}
 */
function _enrichSigIndexFromStrategy(cwd, index) {
  const fs = require('fs');
  const path = require('path');
  // Merge every strategy split file: context-cold.md (hot-cold) AND each
  // per-module context-<module>.md — the per-module strategy stores ALL
  // signatures in these, leaving the primary file as a thin overview, so
  // skipping them made ask/query_context see an empty index (#534).
  // Sorted for deterministic merge order.
  try {
    const ghDir = path.join(cwd, '.github');
    const splits = fs.readdirSync(ghDir)
      .filter((f) => /^context-[\w.-]+\.md$/.test(f))
      .sort();
    for (const f of splits) {
      _mergeSigIndex(index, _parseContextFile(path.join(ghDir, f)));
    }
  } catch (_) {}
  _mergeSigIndex(index, _buildSigIndexFromCache(cwd));

  // The complete retrieval index (written by generate before applyTokenBudget)
  // takes precedence: it is the only source containing files the budget dropped,
  // and full signatures for files the budget collapsed to line anchors. It is
  // merged as the BASE rather than on top because _mergeSigIndex only replaces
  // when the source has MORE signatures — a collapsed entry has the same count
  // as its full form, so merging the other way would keep the anchors.
  try {
    const full = require('./sig-index-store').readFullIndex(cwd);
    if (full.size > 0) return _mergeSigIndex(full, index);
  } catch (_) { /* absent → budgeted view is still served */ }

  return index;
}

/**
 * Build a signature index from the generated context file.
 * Returns Map<filePath, string[]> where filePath is the relative path
 * as it appears in the ### headers of the context file.
 *
 * Resolution priority:
 *  1. `opts.contextPath` — explicit path from --output or --adapter flag
 *  2. `customOutput` key in gen-context.config.json — persisted from a
 *     previous `--output <file>` generation run
 *  3. All known adapter output paths probed in order (first non-empty wins)
 *
 * @param {string} cwd
 * @param {{ contextPath?: string }} [opts]
 * @returns {Map<string, string[]>}
 */
function buildSigIndex(cwd, opts) {
  const fs   = require('fs');
  const path = require('path');

  // 1. Caller supplied an explicit path — use it directly.
  if (opts && opts.contextPath) {
    const index = _parseContextFile(opts.contextPath);
    return _enrichSigIndexFromStrategy(cwd, index);
  }

  // 2. Check gen-context.config.json for a persisted customOutput path.
  try {
    const cfgPath = path.join(cwd, 'gen-context.config.json');
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      if (cfg.customOutput) {
        const customPath = path.resolve(cwd, cfg.customOutput);
        const index = _parseContextFile(customPath);
        if (index.size > 0) return _enrichSigIndexFromStrategy(cwd, index);
      }
    }
  } catch (_) {}

  // 3. Probe all known adapter output paths; return first non-empty index.
  for (const parts of ADAPTER_OUTPUT_PATHS) {
    const contextPath = path.join(cwd, ...parts);
    const index = _parseContextFile(contextPath);
    if (index.size > 0) return _enrichSigIndexFromStrategy(cwd, index);
  }

  // 4. Primary file empty/missing (hot-cold) — still serve cold + cache.
  const fallback = new Map();
  return _enrichSigIndexFromStrategy(cwd, fallback);
}

/**
 * Format ranked results as a markdown table string.
 *
 * @param {{ file: string, score: number, sigs: string[], tokens: number, intent: string, signals: object }[]} results
 * @param {string} query
 * @returns {string}
 */
function formatRankTable(results, query) {
  if (!results || results.length === 0) {
    return `No matching files found for query: "${query}"\n`;
  }

  const intent = (results[0] && results[0].intent) || 'search';
  const lines = [
    `## Query: ${query}`,
    `Intent: ${intent}`,
    '',
    '| Rank | File | Score | Sigs | Penalty |',
    '|------|------|-------|------|---------|',
    ...results.map((r, i) => {
      const penalty = r.signals && r.signals.penalty ? r.signals.penalty.toFixed(2) : '1.00';
      return `| ${i + 1} | ${r.file} | ${r.score.toFixed(2)} | ${r.sigs.length} | ${penalty} |`;
    }),
    '',
  ];

  // Add signature details for top results
  for (const r of results.slice(0, 3)) {
    if (r.sigs.length > 0) {
      lines.push(`### ${r.file}`);
      if (r.signals) {
        const sig = r.signals;
        lines.push(`Signals: exactToken=${(sig.exactToken || 0).toFixed(2)} symbolMatch=${(sig.symbolMatch || 0).toFixed(2)} prefixMatch=${(sig.prefixMatch || 0).toFixed(2)} pathMatch=${(sig.pathMatch || 0).toFixed(2)} penalty=${(sig.penalty || 1).toFixed(2)}`);
      }
      lines.push('```');
      lines.push(...r.sigs.slice(0, 10));
      if (r.sigs.length > 10) lines.push(`... (${r.sigs.length - 10} more)`);
      lines.push('```');
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Format ranked results as a structured JSON-serialisable object.
 *
 * @param {{ file: string, score: number, sigs: string[], tokens: number, intent: string, signals: object }[]} results
 * @param {string} query
 * @returns {object}
 */
function formatRankJSON(results, query) {
  const intent = (results && results[0] && results[0].intent) || 'search';
  return {
    query,
    intent,
    results: (results || []).map((r, i) => ({
      rank: i + 1,
      file: r.file,
      score: r.score,
      sigs: r.sigs,
      tokens: r.tokens,
      signals: r.signals || {},
    })),
    totalResults: (results || []).length,
  };
}

// ---------------------------------------------------------------------------
// Intent detection — 7 intents
// ---------------------------------------------------------------------------
// Nouns carry an optional plural: `\btest\b` does not match "tests", so
// "write unit tests for the ranker" matched NO intent at all and fell through
// to the 'search' default.
const INTENT_PATTERNS = {
  debug:    /\b(bugs?|fix(es|ed)?|errors?|crash(es)?|exceptions?|broken|failing|failures?|issues?|problems?|regressions?)\b/i,
  explain:  /\b(explain|how does|what is|understand|overview|architecture|describe|walk me|teach)\b/i,
  refactor: /\b(refactor|restructure|redesign|clean up|extract|move|rename|simplify|optimi[sz]e)\b/i,
  review:   /\b(review|check|audit|security|pr|pull request|assess|validate)\b/i,
  test:     /\b(tests?|unit tests?|integration tests?|testing|specs?|assert(ion)?s?|mocks?|fixtures?)\b/i,
  integrate:/\b(imports?|integrate|connect|wire|bind|requires?|exports?|depends?|dependenc(y|ies)|graph)\b/i,
  navigate: /\b(find|locate|where|search|look for|show me|navigate|browse|list)\b/i,
};

/**
 * Every intent whose pattern matches, strongest first.
 *
 * A real request is routinely multi-intent — "fix the failing test" is both a
 * debug task and a test task — and reporting one label discards that. Worse,
 * the single-label version returned the FIRST key in INTENT_PATTERNS order, so
 * `debug` permanently shadowed `test`: no query containing "fix" or "failing"
 * could ever be labelled a test, no matter how test-shaped it was.
 *
 * Ranked by how many distinct terms each pattern matched, so the dominant
 * intent leads; ties fall back to declaration order for determinism.
 *
 * @param {string} query
 * @returns {string[]} matched intents, never empty (defaults to ['search'])
 */
function detectIntents(query) {
  if (!query || typeof query !== 'string') return ['search'];
  const scored = [];
  let order = 0;
  for (const [intent, re] of Object.entries(INTENT_PATTERNS)) {
    const hits = query.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'));
    if (hits && hits.length) {
      scored.push({ intent, hits: new Set(hits.map((h) => h.toLowerCase())).size, order: order });
    }
    order++;
  }
  if (scored.length === 0) return ['search'];
  scored.sort((a, b) => (b.hits - a.hits) || (a.order - b.order));
  return scored.map((s) => s.intent);
}

/** Primary intent. Kept for callers that want a single label. */
function detectIntent(query) {
  return detectIntents(query)[0];
}

module.exports = { rank, buildSigIndex, scoreFile, _queryWants, _isDataHolder, detectIntents, formatRankTable, formatRankJSON, DEFAULT_WEIGHTS, GRAPH_BOOST_AMOUNTS, CENTRALITY_BLEND_WEIGHT, detectIntent };
