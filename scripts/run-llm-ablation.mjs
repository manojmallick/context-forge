#!/usr/bin/env node
/**
 * SigMap LLM A/B hallucination ablation (IMPL.md §9) — the live runner.
 *
 * Runs a model twice per task — (A) no SigMap context, (B) with SigMap
 * grounding — pipes both outputs through the hallucination guard, and reports
 * the measured delta in flagged codebase-fact errors per 100 outputs.
 *
 * The pure harness lives in src/eval/llm-ablation.js (offline-testable). This
 * script only supplies the live model call + I/O, so the network touch is
 * confined to scripts/ (never the published library surface).
 *
 * Providers (auto-detected from the present key; --provider overrides):
 *   anthropic — ANTHROPIC_API_KEY            (default model claude-sonnet-4-6)
 *   gemini    — GEMINI_API_KEY / GOOGLE_API_KEY  (default model gemini-2.5-flash)
 *   minimax   — MINIMAX_API_KEY               (default model MiniMax-M3)
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-...  node scripts/run-llm-ablation.mjs
 *   GEMINI_API_KEY=...        node scripts/run-llm-ablation.mjs            # AI Studio key
 *   MINIMAX_API_KEY=...       node scripts/run-llm-ablation.mjs            # OpenAI-compatible API
 *   GEMINI_API_KEY=...        node scripts/run-llm-ablation.mjs --save --model gemini-2.5-pro
 *   GEMINI_API_KEY=...        node scripts/run-llm-ablation.mjs --verbose   # print flagged items per arm
 *   GEMINI_API_KEY=...        node scripts/run-llm-ablation.mjs --runs 5    # average 5 passes (mean ± range)
 *
 * Without any API key it prints guidance and exits 0 (skip — never fails CI).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const { runAblation, buildGrounding, aggregateRuns } = require(path.join(ROOT, 'src/eval/llm-ablation.js'));

const argv = process.argv;
const flag = (name) => { const i = argv.indexOf(name); return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null; };
const save = argv.includes('--save');
const verbose = argv.includes('--verbose');
const modelArg = flag('--model');
const RUNS = Math.max(1, parseInt(flag('--runs') || '1', 10));

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const MINIMAX_KEY = process.env.MINIMAX_API_KEY;
const MINIMAX_BASE_URL = (process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1').replace(/\/+$/, '');

const DEFAULT_MODEL = {
  anthropic: 'claude-sonnet-4-6',
  gemini: 'gemini-2.5-flash',
  minimax: 'MiniMax-M3',
};

// Resolve the provider: explicit flag, else whichever key is present (Gemini first).
let provider = flag('--provider');
if (!provider) provider = GEMINI_KEY ? 'gemini' : ANTHROPIC_KEY ? 'anthropic' : MINIMAX_KEY ? 'minimax' : null;
const MODEL = modelArg || (provider ? DEFAULT_MODEL[provider] : null);

function loadTasks() {
  const p = path.join(ROOT, 'benchmarks', 'llm-ablation-tasks.json');
  try { return JSON.parse(fs.readFileSync(p, 'utf8')).tasks || []; } catch (_) { return []; }
}

/** Anthropic Messages API → completion text. */
async function anthropicComplete(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.content || []).map((b) => b.text || '').join('\n');
}

/** Gemini (AI Studio / Generative Language API) generateContent → completion text. */
async function geminiComplete(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 1024 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return ((data.candidates || [])[0]?.content?.parts || []).map((p) => p.text || '').join('\n');
}

/** MiniMax OpenAI-compatible chat completions → completion text. */
async function minimaxComplete(prompt) {
  const res = await fetch(`${MINIMAX_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${MINIMAX_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`MiniMax API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

const COMPLETERS = { anthropic: anthropicComplete, gemini: geminiComplete, minimax: minimaxComplete };

async function main() {
  const tasks = loadTasks();
  if (tasks.length === 0) {
    console.error('No tasks in benchmarks/llm-ablation-tasks.json.');
    process.exit(1);
  }

  if (!provider) {
    console.log('SigMap LLM A/B ablation (IMPL §9)\n');
    console.log('  ⚠ No API key set — skipping the live run.');
    console.log(`  The harness is ready: ${tasks.length} tasks in benchmarks/llm-ablation-tasks.json.`);
    console.log('  Run live with one of:');
    console.log('    ANTHROPIC_API_KEY=sk-...  npm run benchmark:llm-ablation');
    console.log('    GEMINI_API_KEY=...        npm run benchmark:llm-ablation   # AI Studio key');
    console.log('    MINIMAX_API_KEY=...       npm run benchmark:llm-ablation   # OpenAI-compatible API');
    process.exit(0);
  }

  const liveComplete = COMPLETERS[provider];
  if (!liveComplete) { console.error(`[llm-ablation] unknown provider: ${provider}`); process.exit(1); }

  const callsPerRun = tasks.length * 2;
  console.log(`SigMap LLM A/B ablation — ${provider}/${MODEL}, ${tasks.length} tasks × ${RUNS} run${RUNS > 1 ? 's' : ''} (${callsPerRun * RUNS} model calls)\n`);

  const grounding = buildGrounding(ROOT);
  const results = [];
  for (let run = 1; run <= RUNS; run++) {
    if (RUNS > 1) console.log(`\n=== run ${run}/${RUNS} ===`);
    // Fresh model calls per run — model nondeterminism is the whole point of averaging.
    const cache = new Map();
    for (const t of tasks) {
      const grounded = grounding ? `${grounding}\n\n---\n\n${t.prompt}` : t.prompt;
      for (const p of [t.prompt, grounded]) {
        if (!cache.has(p)) { process.stdout.write(`  · run ${run} calling model (${t.id})…\n`); cache.set(p, await liveComplete(p)); }
      }
    }
    const complete = (prompt) => cache.get(prompt);
    const result = runAblation(tasks, ROOT, complete, { grounding, collectIssues: verbose });
    results.push(result);
    printRun(result);
  }

  if (RUNS > 1) {
    const agg = aggregateRuns(results.map((r) => r.aggregate));
    const band = (s) => `${s.mean.toFixed(1)} [${s.min.toFixed(0)}–${s.max.toFixed(0)}]`;
    console.log(`\n  ${'═'.repeat(46)}`);
    console.log(`  AVERAGE over ${agg.runs} runs (${agg.n} tasks each), flagged errors per 100 outputs:`);
    console.log(`    without grounding: ${band(agg.withoutPer100)}`);
    console.log(`    with    grounding: ${band(agg.withPer100)}`);
    console.log(`    delta (fewer with grounding): ${band(agg.deltaPer100)}`);
  }

  if (save) {
    const out = path.join(ROOT, 'benchmarks', 'reports', 'llm-ablation.json');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const payload = RUNS > 1
      ? { benchmark: 'llm-ablation', provider, model: MODEL, runs: results, summary: aggregateRuns(results.map((r) => r.aggregate)) }
      : { benchmark: 'llm-ablation', provider, model: MODEL, ...results[0] };
    fs.writeFileSync(out, JSON.stringify(payload, null, 2));
    console.log(`\n  saved → benchmarks/reports/llm-ablation.json`);
  }
}

/** Print one run's per-task table, headline delta, and (verbose) flagged items. */
function printRun(result) {
  const a = result.aggregate;
  console.log(`\n  ${'Task'.padEnd(30)} without  with`);
  console.log('  ' + '─'.repeat(46));
  for (const r of result.tasks) {
    console.log(`  ${String(r.id).padEnd(30)} ${String(r.aFlagged).padStart(6)} ${String(r.bFlagged).padStart(5)}`);
  }
  console.log('  ' + '─'.repeat(46));
  const dir = a.delta > 0 ? `${a.delta} fewer` : a.delta < 0 ? `${-a.delta} MORE` : 'no change';
  console.log(`  flagged errors per 100 outputs:  without ${a.withoutPer100.toFixed(0)}  →  with ${a.withPer100.toFixed(0)}`);
  console.log(`  measured delta: ${dir} flagged with grounding (across ${a.n} tasks)`);

  if (verbose) {
    const fmt = (issues) => (issues || []).map((i) => `      [${i.type}] ${i.value || ''} — ${i.message}`).join('\n');
    const flagged = result.tasks.filter((r) => (r.aIssues || []).length || (r.bIssues || []).length);
    if (flagged.length) {
      console.log('\n  Flagged items per arm:');
      for (const r of flagged) {
        console.log(`\n  • ${r.id}`);
        if ((r.aIssues || []).length) console.log(`    without (${r.aIssues.length}):\n${fmt(r.aIssues)}`);
        if ((r.bIssues || []).length) console.log(`    with    (${r.bIssues.length}):\n${fmt(r.bIssues)}`);
      }
    } else {
      console.log('\n  (verbose) no flagged items in either arm.');
    }
  }
}

main().catch((e) => { console.error(`[llm-ablation] ${e.message}`); process.exit(1); });
