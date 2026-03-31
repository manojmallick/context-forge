#!/usr/bin/env node
'use strict';

/**
 * ContextForge — gen-context.js v0.2.0
 * Zero-dependency AI context engine.
 * Runs with: node gen-context.js
 * No npm install required. Node 18+ built-ins only.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const VERSION = '0.2.0';
const MARKER = '\n\n## Auto-generated signatures\n<!-- Updated by gen-context.js -->\n';

// ---------------------------------------------------------------------------
// Config — delegate to src/config/loader.js
// ---------------------------------------------------------------------------
const { loadConfig } = require('./src/config/loader');
const { DEFAULTS } = require('./src/config/defaults');

// ---------------------------------------------------------------------------
// Language → extractor mapping (by file extension)
// ---------------------------------------------------------------------------
const EXT_MAP = {
  '.ts': 'typescript', '.tsx': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.py': 'python', '.pyw': 'python',
  '.java': 'java',
  '.kt': 'kotlin', '.kts': 'kotlin',
  '.go': 'go',
  '.rs': 'rust',
  '.cs': 'csharp',
  '.cpp': 'cpp', '.c': 'cpp', '.h': 'cpp', '.hpp': 'cpp', '.cc': 'cpp',
  '.rb': 'ruby', '.rake': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.dart': 'dart',
  '.scala': 'scala', '.sc': 'scala',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.html': 'html', '.htm': 'html',
  '.css': 'css', '.scss': 'css', '.sass': 'css', '.less': 'css',
  '.yml': 'yaml', '.yaml': 'yaml',
  '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell', '.fish': 'shell',
};

// Dockerfile handled separately (no extension)
function isDockerfile(filename) {
  return filename === 'Dockerfile' || filename.startsWith('Dockerfile.');
}

// ---------------------------------------------------------------------------
// .contextignore parser (gitignore-style subset)
// ---------------------------------------------------------------------------
function loadIgnorePatterns(cwd) {
  const patterns = [];
  for (const name of ['.contextignore', '.repomixignore']) {
    const p = path.join(cwd, name);
    if (fs.existsSync(p)) {
      const lines = fs.readFileSync(p, 'utf8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) patterns.push(trimmed);
      }
    }
  }
  return patterns;
}

function matchesIgnore(relPath, patterns) {
  for (const pat of patterns) {
    const normalized = pat.replace(/\\/g, '/');
    // Simple glob: support * and ** and trailing /
    const regexStr = normalized
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '___DOUBLE___')
      .replace(/\*/g, '[^/]*')
      .replace(/___DOUBLE___/g, '.*');
    const regex = new RegExp(`(^|/)${regexStr}($|/)`);
    if (regex.test(relPath)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// File walker
// ---------------------------------------------------------------------------
function walkDir(dir, exclude, maxDepth, depth = 0) {
  if (depth > maxDepth) return [];
  let results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return [];
  }
  for (const entry of entries) {
    if (exclude.includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(walkDir(full, exclude, maxDepth, depth + 1));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}

function buildFileList(cwd, config) {
  const files = [];
  for (const srcDir of config.srcDirs) {
    const abs = path.join(cwd, srcDir);
    if (!fs.existsSync(abs)) continue;
    const found = walkDir(abs, config.exclude, config.maxDepth);
    files.push(...found);
  }
  // Deduplicate
  return [...new Set(files)];
}

// ---------------------------------------------------------------------------
// Extractor loader (lazy, cached)
// ---------------------------------------------------------------------------
const _extractorCache = {};
function getExtractor(name) {
  if (_extractorCache[name]) return _extractorCache[name];
  const p = path.join(__dirname, 'src', 'extractors', `${name}.js`);
  if (!fs.existsSync(p)) return null;
  try {
    const mod = require(p);
    _extractorCache[name] = mod;
    return mod;
  } catch (err) {
    console.warn(`[context-forge] failed to load extractor ${name}: ${err.message}`);
    return null;
  }
}

function detectAndExtract(filePath, content, maxSigsPerFile) {
  const base = path.basename(filePath);
  const ext = path.extname(base).toLowerCase();
  let extractorName = EXT_MAP[ext] || null;
  if (!extractorName && isDockerfile(base)) extractorName = 'dockerfile';
  if (!extractorName) return [];

  const extractor = getExtractor(extractorName);
  if (!extractor) return [];

  try {
    const sigs = extractor.extract(content);
    return Array.isArray(sigs) ? sigs.slice(0, maxSigsPerFile) : [];
  } catch (err) {
    console.warn(`[context-forge] extractor failed for ${filePath}: ${err.message}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Token budget enforcement
// ---------------------------------------------------------------------------
function estimateTokens(str) {
  return Math.ceil(str.length / 4);
}

function isTestFile(filePath) {
  return /\.(test|spec)\.[a-z]+$/.test(filePath) || /_test\.[a-z]+$/.test(filePath);
}

function isConfigFile(filePath) {
  return /\.(config|conf)\.[a-z]+$/.test(filePath) ||
    path.extname(filePath) === '.json';
}

function isGeneratedFile(filePath) {
  return /(\.generated\.|\.pb\.|_pb\.)/.test(filePath);
}

function applyTokenBudget(fileEntries, maxTokens) {
  // fileEntries: [{ filePath, sigs, mtime }]
  // Reserve ~10% for formatting overhead (section headers, code fences, top-level header)
  const effectiveBudget = Math.floor(maxTokens * 0.90);
  let total = fileEntries.reduce((s, e) => s + estimateTokens(e.sigs.join('\n')), 0);
  if (total <= effectiveBudget) return fileEntries;

  // Sort by drop priority (drop first = index 0)
  const withPriority = fileEntries.map((e) => {
    let priority = 0;
    if (isGeneratedFile(e.filePath)) priority = 10;
    else if (isTestFile(e.filePath)) priority = 8;
    else if (isConfigFile(e.filePath)) priority = 6;
    else priority = 4;
    return { ...e, priority };
  });

  // Within same priority, sort by mtime ascending (oldest first = drop first)
  withPriority.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return (a.mtime || 0) - (b.mtime || 0);
  });

  const kept = [];
  let dropped = 0;
  for (let i = withPriority.length - 1; i >= 0; i--) {
    const entry = withPriority[i];
    const entryTokens = estimateTokens(entry.sigs.join('\n'));
    if (total <= effectiveBudget) {
      kept.unshift(entry);
    } else {
      total -= entryTokens;
      dropped++;
    }
  }
  if (dropped > 0) {
    console.warn(`[context-forge] budget: dropped ${dropped} files to stay under ${maxTokens} tokens`);
  }
  return kept;
}

// ---------------------------------------------------------------------------
// Recently committed files (git, optional)
// ---------------------------------------------------------------------------
function getRecentlyCommittedFiles(cwd) {
  try {
    const out = execSync('git log --name-only --format="" -n 10', {
      cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    });
    return new Set(out.split('\n').map((f) => f.trim()).filter(Boolean).map((f) => path.resolve(cwd, f)));
  } catch (_) {
    return new Set();
  }
}

// ---------------------------------------------------------------------------
// Output formatter
// ---------------------------------------------------------------------------
function formatOutput(fileEntries, cwd) {
  const lines = [
    '<!-- Generated by ContextForge gen-context.js v' + VERSION + ' -->',
    '<!-- DO NOT EDIT below the marker line — run gen-context.js to regenerate -->',
    '',
    '# Code signatures',
    '',
  ];

  // Group by top-level src dir
  const groups = {};
  for (const entry of fileEntries) {
    const rel = path.relative(cwd, entry.filePath);
    const parts = rel.split(path.sep);
    const group = parts.length > 1 ? parts[0] : '.';
    if (!groups[group]) groups[group] = [];
    groups[group].push({ rel, sigs: entry.sigs });
  }

  for (const [group, entries] of Object.entries(groups).sort()) {
    lines.push(`## ${group}`);
    lines.push('');
    for (const { rel, sigs } of entries) {
      if (sigs.length === 0) continue;
      lines.push(`### ${rel}`);
      lines.push('```');
      lines.push(...sigs);
      lines.push('```');
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Output writers
// ---------------------------------------------------------------------------
function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeOutputs(content, targets, cwd) {
  const targetMap = {
    copilot: path.join(cwd, '.github', 'copilot-instructions.md'),
    cursor: path.join(cwd, '.cursorrules'),
    windsurf: path.join(cwd, '.windsurfrules'),
  };

  for (const target of targets) {
    if (target === 'claude') {
      writeClaude(content, cwd);
      continue;
    }
    const outPath = targetMap[target];
    if (!outPath) {
      console.warn(`[context-forge] unknown output target: ${target}`);
      continue;
    }
    ensureDir(outPath);
    fs.writeFileSync(outPath, content, 'utf8');
    console.warn(`[context-forge] wrote ${path.relative(cwd, outPath)}`);
  }
}

function writeClaude(content, cwd) {
  const claudePath = path.join(cwd, 'CLAUDE.md');
  let existing = '';
  if (fs.existsSync(claudePath)) {
    existing = fs.readFileSync(claudePath, 'utf8');
  }
  const markerIdx = existing.indexOf('## Auto-generated signatures');
  let newContent;
  if (markerIdx !== -1) {
    newContent = existing.slice(0, markerIdx) + MARKER.trimStart() + content;
  } else {
    newContent = existing + MARKER + content;
  }
  fs.writeFileSync(claudePath, newContent, 'utf8');
  console.warn(`[context-forge] wrote CLAUDE.md (appended signatures)`);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
function printReport(rawTokens, finalTokens, fileCount, droppedCount, asJson) {
  const reduction = rawTokens > 0 ? (100 - (finalTokens / rawTokens) * 100).toFixed(1) : 0;
  if (asJson) {
    process.stdout.write(JSON.stringify({
      rawTokens, finalTokens, fileCount, droppedCount,
      reductionPct: parseFloat(reduction),
    }) + '\n');
  } else {
    console.log(`[context-forge] report:`);
    console.log(`  files processed : ${fileCount}`);
    console.log(`  files dropped   : ${droppedCount}`);
    console.log(`  raw tokens      : ~${rawTokens}`);
    console.log(`  output tokens   : ~${finalTokens}`);
    console.log(`  reduction       : ${reduction}%`);
  }
}

// ---------------------------------------------------------------------------
// Watch mode
// ---------------------------------------------------------------------------
function watchMode(cwd, config) {
  console.warn('[context-forge] watching for changes (Ctrl+C to stop)…');
  let debounce = null;
  for (const srcDir of config.srcDirs) {
    const abs = path.join(cwd, srcDir);
    if (!fs.existsSync(abs)) continue;
    fs.watch(abs, { recursive: true }, () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        console.warn('[context-forge] change detected, regenerating…');
        runGenerate(cwd, config, false);
      }, 500);
    });
  }
}

// ---------------------------------------------------------------------------
// Git hook installer
// ---------------------------------------------------------------------------
function installHook(cwd) {
  const hookDir = path.join(cwd, '.git', 'hooks');
  if (!fs.existsSync(hookDir)) {
    console.warn('[context-forge] .git/hooks not found — skipping hook install');
    return;
  }
  const hookPath = path.join(hookDir, 'post-commit');
  const hookLine = '\nnode "$(git rev-parse --show-toplevel)/gen-context.js" --generate 2>/dev/null || true\n';

  if (fs.existsSync(hookPath)) {
    const existing = fs.readFileSync(hookPath, 'utf8');
    if (existing.includes('gen-context.js')) {
      console.warn('[context-forge] post-commit hook already installed');
      return;
    }
    fs.appendFileSync(hookPath, hookLine);
  } else {
    fs.writeFileSync(hookPath, `#!/bin/sh${hookLine}`);
    fs.chmodSync(hookPath, '755');
  }
  console.warn('[context-forge] installed post-commit hook');
}

// ---------------------------------------------------------------------------
// Example config writer
// ---------------------------------------------------------------------------
function writeInitConfig(cwd) {
  const dest = path.join(cwd, 'gen-context.config.json');
  if (fs.existsSync(dest)) {
    console.warn('[context-forge] gen-context.config.json already exists');
    return;
  }
  const example = path.join(__dirname, 'gen-context.config.json.example');
  if (fs.existsSync(example)) {
    fs.copyFileSync(example, dest);
  } else {
    fs.writeFileSync(dest, JSON.stringify(DEFAULTS, null, 2) + '\n');
  }
  console.warn('[context-forge] wrote gen-context.config.json');
}

// ---------------------------------------------------------------------------
// Core generate pipeline
// ---------------------------------------------------------------------------
function runGenerate(cwd, config, reportMode, reportJson = false) {
  const ignorePatterns = loadIgnorePatterns(cwd);
  let allFiles = buildFileList(cwd, config);

  // Apply .contextignore
  allFiles = allFiles.filter((f) => {
    const rel = path.relative(cwd, f).replace(/\\/g, '/');
    return !matchesIgnore(rel, ignorePatterns);
  });

  // Gather mtime and git-committed info
  const recentFiles = config.diffPriority ? getRecentlyCommittedFiles(cwd) : new Set();

  let rawTokenTotal = 0;
  let fileEntries = [];

  for (const filePath of allFiles) {
    let content = '';
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (_) {
      continue;
    }

    let sigs = detectAndExtract(filePath, content, config.maxSigsPerFile);
    if (sigs.length === 0) continue;

    if (config.secretScan) {
      const { scan } = require('./src/security/scanner');
      const result = scan(sigs, filePath);
      if (result.redacted) {
        console.warn(`[context-forge] secrets redacted in ${path.relative(cwd, filePath)}`);
      }
      sigs = result.safe;
    }

    rawTokenTotal += estimateTokens(sigs.join('\n'));
    let mtime = 0;
    try {
      mtime = fs.statSync(filePath).mtimeMs;
    } catch (_) {}

    // Boost recently committed files (give them max mtime so they aren't dropped first)
    if (recentFiles.has(filePath)) mtime = Date.now();

    fileEntries.push({ filePath, sigs, mtime });
  }

  const beforeCount = fileEntries.length;
  fileEntries = applyTokenBudget(fileEntries, config.maxTokens);
  const droppedCount = beforeCount - fileEntries.length;

  const content = formatOutput(fileEntries, cwd);
  const finalTokens = estimateTokens(content);

  if (!reportMode) {
    writeOutputs(content, config.outputs, cwd);
  }

  if (reportMode || process.argv.includes('--report')) {
    printReport(rawTokenTotal, finalTokens, beforeCount, droppedCount, reportJson);
  }

  return { rawTokenTotal, finalTokens, fileCount: beforeCount, droppedCount };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------
function printHelp() {
  console.log(`
ContextForge — gen-context.js v${VERSION}
Zero-dependency AI context engine

Usage:
  node gen-context.js                  Generate context once and exit
  node gen-context.js --watch          Generate + watch for file changes
  node gen-context.js --setup          Generate + install git hook + watch
  node gen-context.js --report         Token reduction stats to stdout
  node gen-context.js --report --json  Token report as JSON (for CI)
  node gen-context.js --init           Write example config file
  node gen-context.js --help           Show this message
  node gen-context.js --version        Show version

Config: gen-context.config.json
Ignore: .contextignore, .repomixignore
Output: .github/copilot-instructions.md (default)
`);
}

function main() {
  const args = process.argv.slice(2);
  const cwd = process.cwd();

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(VERSION);
    process.exit(0);
  }

  const config = loadConfig(cwd);

  if (args.includes('--init')) {
    writeInitConfig(cwd);
    process.exit(0);
  }

  if (args.includes('--report')) {
    runGenerate(cwd, config, true, args.includes('--json'));
    process.exit(0);
  }

  if (args.includes('--setup')) {
    runGenerate(cwd, config, false);
    installHook(cwd);
    watchMode(cwd, config);
    return; // keep process alive for watch
  }

  if (args.includes('--watch')) {
    runGenerate(cwd, config, false);
    watchMode(cwd, config);
    return; // keep process alive
  }

  // Default: generate once
  runGenerate(cwd, config, false);
}

main();
