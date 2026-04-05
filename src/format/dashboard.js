'use strict';

const fs = require('fs');
const path = require('path');
const { readLog } = require('../tracking/logger');

const LANGUAGE_KEYS = [
  'typescript', 'javascript', 'python', 'java', 'kotlin', 'go', 'rust',
  'csharp', 'cpp', 'ruby', 'php', 'swift', 'dart', 'scala', 'vue',
  'svelte', 'html', 'css', 'yaml', 'shell', 'dockerfile',
];

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  if (p <= 0) return sorted[0];
  if (p >= 100) return sorted[sorted.length - 1];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}

function overBudgetStreak(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return 0;
  let streak = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i] && entries[i].overBudget) streak++;
    else break;
  }
  return streak;
}

function loadConfig(cwd) {
  try {
    const p = path.join(cwd, 'gen-context.config.json');
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return null;
  }
}

function shouldExclude(rel, excludeSet) {
  if (!rel) return true;
  const parts = rel.split('/');
  for (const part of parts) {
    if (excludeSet.has(part)) return true;
  }
  return false;
}

function detectLanguage(filePath) {
  const base = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  if (base === 'Dockerfile' || /^Dockerfile\./.test(base)) return 'dockerfile';
  if (ext === '.ts' || ext === '.tsx') return 'typescript';
  if (ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs') return 'javascript';
  if (ext === '.py' || ext === '.pyw') return 'python';
  if (ext === '.java') return 'java';
  if (ext === '.kt' || ext === '.kts') return 'kotlin';
  if (ext === '.go') return 'go';
  if (ext === '.rs') return 'rust';
  if (ext === '.cs') return 'csharp';
  if (ext === '.cpp' || ext === '.c' || ext === '.h' || ext === '.hpp' || ext === '.cc') return 'cpp';
  if (ext === '.rb' || ext === '.rake') return 'ruby';
  if (ext === '.php') return 'php';
  if (ext === '.swift') return 'swift';
  if (ext === '.dart') return 'dart';
  if (ext === '.scala' || ext === '.sc') return 'scala';
  if (ext === '.vue') return 'vue';
  if (ext === '.svelte') return 'svelte';
  if (ext === '.html' || ext === '.htm') return 'html';
  if (ext === '.css' || ext === '.scss' || ext === '.sass' || ext === '.less') return 'css';
  if (ext === '.yml' || ext === '.yaml') return 'yaml';
  if (ext === '.sh' || ext === '.bash' || ext === '.zsh' || ext === '.fish') return 'shell';
  return null;
}

function walkFiles(dir, maxDepth, depth, out, excludeSet) {
  if (depth > maxDepth) return;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    const rel = abs.replace(/\\/g, '/');
    if (shouldExclude(rel, excludeSet)) continue;
    if (entry.isDirectory()) {
      walkFiles(abs, maxDepth, depth + 1, out, excludeSet);
    } else if (entry.isFile()) {
      out.push(abs);
    }
  }
}

function computeExtractorCoverage(cwd) {
  const cfg = loadConfig(cwd) || {};
  const srcDirs = Array.isArray(cfg.srcDirs) && cfg.srcDirs.length > 0
    ? cfg.srcDirs
    : ['src', 'app', 'lib', 'packages', 'services', 'api'];
  const exclude = new Set([
    'node_modules', '.git', 'dist', 'build', 'out', '__pycache__', '.next',
    'coverage', 'target', 'vendor', '.context', 'jetbrains-plugin/build',
  ]);
  if (Array.isArray(cfg.exclude)) {
    for (const item of cfg.exclude) exclude.add(String(item));
  }

  const counts = {};
  for (const key of LANGUAGE_KEYS) counts[key] = 0;

  const files = [];
  for (const relDir of srcDirs) {
    const absDir = path.join(cwd, relDir);
    if (!fs.existsSync(absDir)) continue;
    walkFiles(absDir, 8, 0, files, exclude);
  }

  for (const f of files) {
    const lang = detectLanguage(f);
    if (lang) counts[lang]++;
  }

  const covered = LANGUAGE_KEYS.filter((k) => counts[k] > 0).length;
  const supported = LANGUAGE_KEYS.length;
  const pct = supported > 0 ? parseFloat(((covered / supported) * 100).toFixed(1)) : 0;
  return { supported, covered, pct, perLanguage: counts };
}

function readBenchmarkTrend(cwd) {
  const resultDir = path.join(cwd, 'benchmarks', 'results');
  if (!fs.existsSync(resultDir)) return [];

  const files = [];
  walkFiles(resultDir, 6, 0, files, new Set());

  const values = [];
  for (const filePath of files) {
    const base = path.basename(filePath).toLowerCase();
    if (!base.endsWith('.json') && !base.endsWith('.jsonl') && !base.endsWith('.ndjson')) continue;
    let raw = '';
    try {
      raw = fs.readFileSync(filePath, 'utf8');
    } catch (_) {
      continue;
    }

    if (base.endsWith('.json')) {
      try {
        const obj = JSON.parse(raw);
        const direct = toNumber(obj && obj.hitAt5);
        const nested = toNumber(obj && obj.metrics && obj.metrics.hitAt5);
        if (direct !== null) values.push(direct);
        else if (nested !== null) values.push(nested);
      } catch (_) {}
      continue;
    }

    const lines = raw.split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        const direct = toNumber(obj && obj.hitAt5);
        const nested = toNumber(obj && obj.metrics && obj.metrics.hitAt5);
        if (direct !== null) values.push(direct);
        else if (nested !== null) values.push(nested);
      } catch (_) {}
    }
  }

  return values.slice(-30);
}

function lineChartSvg(values, title, ySuffix) {
  const width = 760;
  const height = 210;
  const left = 38;
  const right = 18;
  const top = 22;
  const bottom = 30;
  const innerW = width - left - right;
  const innerH = height - top - bottom;
  const clean = values.filter((n) => Number.isFinite(n));

  if (clean.length === 0) {
    return [
      `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${title}">`,
      '<rect x="0" y="0" width="100%" height="100%" fill="#0f1320" rx="12"/>',
      `<text x="20" y="36" fill="#d7defa" font-size="14" font-family="monospace">${title}</text>`,
      '<text x="20" y="96" fill="#8ea0d9" font-size="13" font-family="monospace">No data yet. Run with --track and --benchmark.</text>',
      '</svg>',
    ].join('');
  }

  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;

  const points = clean.map((v, i) => {
    const x = left + ((clean.length === 1 ? 0 : i / (clean.length - 1)) * innerW);
    const y = top + (1 - ((v - min) / span)) * innerH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const latest = clean[clean.length - 1];
  const yLabel = ySuffix || '';
  const grid = [];
  for (let i = 0; i <= 4; i++) {
    const gy = top + (i / 4) * innerH;
    grid.push(`<line x1="${left}" y1="${gy.toFixed(1)}" x2="${left + innerW}" y2="${gy.toFixed(1)}" stroke="#223056" stroke-width="1"/>`);
  }

  return [
    `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${title}">`,
    '<defs><linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#42d392" stop-opacity="0.25"/><stop offset="100%" stop-color="#42d392" stop-opacity="0"/></linearGradient></defs>',
    '<rect x="0" y="0" width="100%" height="100%" fill="#0f1320" rx="12"/>',
    `<text x="20" y="26" fill="#d7defa" font-size="13" font-family="monospace">${title}</text>`,
    grid.join(''),
    `<polyline fill="none" stroke="#42d392" stroke-width="2.5" points="${points}"/>`,
    `<text x="20" y="${height - 8}" fill="#8ea0d9" font-size="12" font-family="monospace">latest: ${latest.toFixed(2)}${yLabel}</text>`,
    '</svg>',
  ].join('');
}

function barChartSvg(perLanguage) {
  const width = 760;
  const height = 260;
  const left = 20;
  const top = 34;
  const usableW = width - left * 2;
  const keys = LANGUAGE_KEYS.slice();
  const max = Math.max(1, ...keys.map((k) => perLanguage[k] || 0));
  const barW = usableW / keys.length;

  const bars = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const v = perLanguage[key] || 0;
    const h = (v / max) * 160;
    const x = left + i * barW + 2;
    const y = top + 160 - h;
    bars.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(2, barW - 4).toFixed(1)}" height="${h.toFixed(1)}" fill="#7aa2ff" rx="2"/>`);
  }

  const labels = ['ts', 'js', 'py', 'java', 'kt', 'go', 'rs', 'cs', 'cpp', 'rb', 'php', 'swift', 'dart', 'scala', 'vue', 'sv', 'html', 'css', 'yaml', 'sh', 'df'];
  const xLabels = labels.map((lbl, i) => {
    const x = left + i * barW + barW / 2;
    return `<text x="${x.toFixed(1)}" y="222" fill="#8ea0d9" font-size="9" font-family="monospace" text-anchor="middle">${lbl}</text>`;
  });

  return [
    `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Extractor coverage by language">`,
    '<rect x="0" y="0" width="100%" height="100%" fill="#0f1320" rx="12"/>',
    '<text x="20" y="24" fill="#d7defa" font-size="13" font-family="monospace">Per-language extractor coverage (file counts)</text>',
    '<line x1="20" y1="194" x2="740" y2="194" stroke="#223056" stroke-width="1"/>',
    bars.join(''),
    xLabels.join(''),
    '</svg>',
  ].join('');
}

function sparkline(values) {
  const clean = values.filter((n) => Number.isFinite(n));
  if (clean.length === 0) return 'n/a';
  const ticks = '▁▂▃▄▅▆▇█';
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  return clean.map((v) => {
    const idx = Math.max(0, Math.min(ticks.length - 1, Math.round(((v - min) / span) * (ticks.length - 1))));
    return ticks[idx];
  }).join('');
}

function buildDashboardData(cwd, health) {
  const entries = readLog(cwd);
  const recent = entries.slice(-30);
  const tokenReductionTrend = recent.map((e) => toNumber(e.reductionPct)).filter((n) => n !== null);
  const hitAt5Trend = readBenchmarkTrend(cwd);
  const coverage = computeExtractorCoverage(cwd);

  const finals = entries.map((e) => toNumber(e.finalTokens)).filter((n) => n !== null);
  const summary = {
    grade: health.grade,
    score: health.score,
    daysSinceRegen: health.daysSinceRegen,
    totalRuns: entries.length,
    overBudgetRate: entries.length > 0
      ? parseFloat(((entries.filter((e) => e.overBudget).length / entries.length) * 100).toFixed(1))
      : 0,
    p50TokenCount: Math.round(percentile(finals, 50)),
    p95TokenCount: Math.round(percentile(finals, 95)),
    overBudgetStreak: overBudgetStreak(entries),
    extractorCoverage: coverage.pct,
  };

  return {
    summary,
    tokenReductionTrend,
    hitAt5Trend,
    coverage,
    charts: {
      tokenReductionSvg: lineChartSvg(tokenReductionTrend, 'Token reduction trend (last 30 tracked runs)', '%'),
      hitAt5Svg: lineChartSvg(hitAt5Trend, 'hit@5 trend (last 30 benchmark runs)', ''),
      coverageSvg: barChartSvg(coverage.perLanguage),
    },
  };
}

function generateDashboardHtml(cwd, health) {
  const data = buildDashboardData(cwd, health);
  const cards = [
    { label: 'Current grade', value: `${data.summary.grade} (${data.summary.score}/100)` },
    { label: 'Days since regen', value: data.summary.daysSinceRegen === null ? 'n/a' : String(data.summary.daysSinceRegen) },
    { label: 'Total tracked runs', value: String(data.summary.totalRuns) },
    { label: 'Over-budget %', value: `${data.summary.overBudgetRate}%` },
    { label: 'p50 token count', value: String(data.summary.p50TokenCount) },
    { label: 'p95 token count', value: String(data.summary.p95TokenCount) },
    { label: 'Over-budget streak', value: String(data.summary.overBudgetStreak) },
    { label: 'Extractor coverage', value: `${data.summary.extractorCoverage}%` },
  ];

  const cardHtml = cards.map((c) => `<div class="card"><div class="label">${c.label}</div><div class="value">${c.value}</div></div>`).join('');

  const html = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8"/>',
    '<meta name="viewport" content="width=device-width,initial-scale=1"/>',
    '<title>SigMap Dashboard</title>',
    '<style>',
    'body{margin:0;background:#0a0f1e;color:#e6ecff;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
    '.wrap{max-width:980px;margin:0 auto;padding:24px}',
    'h1{font-size:22px;margin:0 0 6px 0}',
    '.sub{color:#8ea0d9;font-size:12px;margin-bottom:20px}',
    '.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:16px}',
    '.card{background:#111a33;border:1px solid #223056;border-radius:10px;padding:10px}',
    '.label{font-size:11px;color:#8ea0d9;margin-bottom:6px}',
    '.value{font-size:16px;color:#f5f7ff}',
    '.panel{background:#111a33;border:1px solid #223056;border-radius:12px;padding:10px;margin-top:12px}',
    '@media (max-width:900px){.grid{grid-template-columns:repeat(2,minmax(0,1fr));}}',
    '</style>',
    '</head>',
    '<body>',
    '<div class="wrap">',
    '<h1>SigMap v2.10 dashboard</h1>',
    '<div class="sub">Self-contained report. No external scripts, styles, or network calls.</div>',
    `<div class="grid">${cardHtml}</div>`,
    `<div class="panel">${data.charts.tokenReductionSvg}</div>`,
    `<div class="panel">${data.charts.hitAt5Svg}</div>`,
    `<div class="panel">${data.charts.coverageSvg}</div>`,
    '</div>',
    '</body>',
    '</html>',
  ].join('');

  return { html, data };
}

function renderHistoryCharts(cwd, health) {
  const data = buildDashboardData(cwd, health);
  const lines = [
    '[sigmap] history charts:',
    `  token reduction trend : ${sparkline(data.tokenReductionTrend)}`,
    `  hit@5 trend           : ${sparkline(data.hitAt5Trend)}`,
    `  extractor coverage    : ${data.coverage.covered}/${data.coverage.supported} (${data.coverage.pct}%)`,
    '',
    '[sigmap] inline svg: token reduction',
    data.charts.tokenReductionSvg,
    '',
    '[sigmap] inline svg: hit@5',
    data.charts.hitAt5Svg,
    '',
    '[sigmap] inline svg: coverage',
    data.charts.coverageSvg,
  ];

  return {
    text: lines.join('\n'),
    tokenReductionSparkline: sparkline(data.tokenReductionTrend),
    hitAt5Sparkline: sparkline(data.hitAt5Trend),
    summary: data.summary,
    charts: data.charts,
  };
}

module.exports = { generateDashboardHtml, renderHistoryCharts, computeExtractorCoverage, percentile, overBudgetStreak };
