'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CONTEXT_FILE = path.join('.github', 'copilot-instructions.md');

// Section header keywords in PROJECT_MAP.md
const MAP_SECTIONS = {
  imports: '### Import graph',
  classes: '### Class hierarchy',
  routes: '### Route table',
};

/**
 * read_context({ module? }) → string
 *
 * Returns the full context file, or just the sections whose file paths
 * contain the given module substring.
 */
function readContext(args, cwd) {
  const contextPath = path.join(cwd, CONTEXT_FILE);
  if (!fs.existsSync(contextPath)) {
    return 'No context file found. Run: node gen-context.js';
  }

  const content = fs.readFileSync(contextPath, 'utf8');

  if (!args || !args.module) return content;

  const mod = args.module.replace(/\\/g, '/').replace(/\/$/, '');
  const lines = content.split('\n');
  const result = [];
  let capturing = false;

  for (const line of lines) {
    if (line.startsWith('### ')) {
      const filePath = line.slice(4).trim().replace(/\\/g, '/');
      // Match if file path starts with mod or contains /mod/ or /mod
      capturing =
        filePath === mod ||
        filePath.startsWith(mod + '/') ||
        filePath.includes('/' + mod + '/') ||
        filePath.includes('/' + mod);
      if (capturing) result.push(line);
      continue;
    }
    if (capturing) result.push(line);
  }

  if (result.length === 0) return `No signatures found for module: ${mod}`;
  return result.join('\n');
}

/**
 * search_signatures({ query }) → string
 *
 * Case-insensitive search through all signature lines.
 * Returns matching lines grouped by file path.
 */
function searchSignatures(args, cwd) {
  if (!args || !args.query) return 'Missing required argument: query';

  const contextPath = path.join(cwd, CONTEXT_FILE);
  if (!fs.existsSync(contextPath)) {
    return 'No context file found. Run: node gen-context.js';
  }

  const content = fs.readFileSync(contextPath, 'utf8');
  const query = args.query.toLowerCase();
  const lines = content.split('\n');

  const result = [];
  let currentFile = '';
  let fileHeaderAdded = false;

  for (const line of lines) {
    if (line.startsWith('### ')) {
      currentFile = line.slice(4).trim();
      fileHeaderAdded = false;
      continue;
    }
    // Skip markdown fences and top-level headers
    if (line.startsWith('```') || line.startsWith('## ') || line.startsWith('# ') || line.startsWith('<!--')) {
      continue;
    }
    if (line.toLowerCase().includes(query)) {
      if (currentFile && !fileHeaderAdded) {
        if (result.length > 0) result.push('');
        result.push(`### ${currentFile}`);
        fileHeaderAdded = true;
      }
      result.push(line);
    }
  }

  if (result.length === 0) return `No signatures found matching: ${args.query}`;
  return result.join('\n');
}

/**
 * get_map({ type }) → string
 *
 * Returns a section from PROJECT_MAP.md.
 * type: 'imports' | 'classes' | 'routes'
 */
function getMap(args, cwd) {
  if (!args || !args.type) return 'Missing required argument: type';

  const header = MAP_SECTIONS[args.type];
  if (!header) {
    return `Unknown map type: "${args.type}". Use: imports, classes, routes`;
  }

  const mapPath = path.join(cwd, 'PROJECT_MAP.md');
  if (!fs.existsSync(mapPath)) {
    return 'PROJECT_MAP.md not found. Run: node gen-project-map.js';
  }

  const content = fs.readFileSync(mapPath, 'utf8');
  const idx = content.indexOf(header);
  if (idx === -1) {
    return `Section "${header}" not found in PROJECT_MAP.md`;
  }

  // Extract from this header to the next ### header
  const after = content.slice(idx);
  const nextMatch = after.slice(header.length).search(/\n###\s/);
  return nextMatch === -1 ? after : after.slice(0, header.length + nextMatch);
}

/**
 * create_checkpoint({ note? }) → string
 *
 * Returns a markdown checkpoint summarising current project state:
 * - Timestamp and optional user note
 * - Active git branch + last 5 commit messages
 * - Token count of current context file
 * - List of modules present in the context
 * - Route count (if PROJECT_MAP.md exists)
 */
function createCheckpoint(args, cwd) {
  const note = (args && args.note) ? args.note.trim() : '';
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const lines = [
    '# SigMap Checkpoint',
    `**Created:** ${now}`,
  ];

  if (note) lines.push(`**Note:** ${note}`);
  lines.push('');

  // ── Git info ────────────────────────────────────────────────────────────
  lines.push('## Git state');
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    lines.push(`**Branch:** ${branch}`);
  } catch (_) {
    lines.push('**Branch:** (not a git repo)');
  }

  try {
    const log = execSync(
      'git log --oneline -5 --no-decorate 2>/dev/null',
      { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    if (log) {
      lines.push('');
      lines.push('**Recent commits:**');
      for (const l of log.split('\n')) lines.push(`- ${l}`);
    }
  } catch (_) {} // ignore — not every project uses git
  lines.push('');

  // ── Context stats ────────────────────────────────────────────────────────
  lines.push('## Context snapshot');
  const contextPath = path.join(cwd, CONTEXT_FILE);
  if (fs.existsSync(contextPath)) {
    const content = fs.readFileSync(contextPath, 'utf8');
    const tokens = Math.ceil(content.length / 4);

    // Count modules (### headers are file paths)
    const modules = content.split('\n').filter((l) => l.startsWith('### ')).map((l) => l.slice(4).trim());
    lines.push(`**Token count:** ~${tokens}`);
    lines.push(`**Modules in context:** ${modules.length}`);

    if (modules.length > 0) {
      lines.push('');
      lines.push('**Modules:**');
      for (const m of modules.slice(0, 20)) lines.push(`- ${m}`);
      if (modules.length > 20) lines.push(`- … and ${modules.length - 20} more`);
    }
  } else {
    lines.push('_No context file found. Run: node gen-context.js_');
  }
  lines.push('');

  // ── Route summary ────────────────────────────────────────────────────────
  const mapPath = path.join(cwd, 'PROJECT_MAP.md');
  if (fs.existsSync(mapPath)) {
    const mapContent = fs.readFileSync(mapPath, 'utf8');
    const routeLines = mapContent.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Method') && !l.startsWith('|---'));
    if (routeLines.length > 0) {
      lines.push('## Routes');
      lines.push(`**Total routes detected:** ${routeLines.length}`);
      lines.push('');
      for (const r of routeLines.slice(0, 10)) lines.push(r);
      if (routeLines.length > 10) lines.push(`| … | +${routeLines.length - 10} more | |`);
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('_Generated by SigMap `create_checkpoint`_');

  return lines.join('\n');
}

/**
 * get_routing({}) → string
 *
 * Reads the current context file, classifies all indexed files by complexity,
 * and returns a formatted markdown routing guide showing which files belong
 * to the fast/balanced/powerful model tier.
 */
function getRouting(args, cwd) {
  const contextPath = path.join(cwd, CONTEXT_FILE);
  if (!fs.existsSync(contextPath)) {
    return (
      '_No context file found. Run `node gen-context.js --routing` first._\n\n' +
      'This generates routing hints that map each file to a model tier:\n' +
      '- **fast** (haiku/gpt-4o-mini) — config, markup, trivial utilities\n' +
      '- **balanced** (sonnet/gpt-4o) — standard application code\n' +
      '- **powerful** (opus/gpt-4-turbo) — complex, security-critical, or large modules'
    );
  }

  // Parse file list from context (### headings are file paths)
  const content = fs.readFileSync(contextPath, 'utf8');
  const fileRels = content.split('\n')
    .filter((l) => l.startsWith('### '))
    .map((l) => l.slice(4).trim());

  // Build synthetic fileEntries for the classifier
  // We don't have live sig arrays here, so rebuild from the context blocks
  const entries = [];
  const blocks = content.split(/^### /m).slice(1); // slice past the header
  for (const block of blocks) {
    const firstLine = block.split('\n')[0].trim();
    const codeBlock = block.match(/```\n([\s\S]*?)```/);
    const sigs = codeBlock ? codeBlock[1].trim().split('\n').filter(Boolean) : [];
    entries.push({ filePath: path.join(cwd, firstLine), sigs });
  }

  try {
    const { classifyAll } = require('../../src/routing/classifier');
    const { formatRoutingSection } = require('../../src/routing/hints');
    const groups = classifyAll(entries, cwd);
    return formatRoutingSection(groups);
  } catch (err) {
    return `_Routing classification failed: ${err.message}_`;
  }
}

/**
 * explain_file({ path }) → string
 *
 * Returns a file's signatures, its direct imports, and files that import it.
 * path: relative path from project root (e.g. 'src/services/auth.ts')
 */
function explainFile(args, cwd) {
  if (!args || !args.path) return 'Missing required argument: path';

  const targetRel = args.path.replace(/\\/g, '/').replace(/^\//, '');
  const targetAbs = path.resolve(cwd, targetRel);
  const contextPath = path.join(cwd, CONTEXT_FILE);

  const lines = ['# explain_file: ' + targetRel, ''];

  // ── Signatures (from context file) ─────────────────────────────────────
  lines.push('## Signatures');
  let indexedFiles = [];

  if (fs.existsSync(contextPath)) {
    const ctxContent = fs.readFileSync(contextPath, 'utf8');
    const ctxLines = ctxContent.split('\n');
    let capturing = false;
    const sigLines = [];

    for (const line of ctxLines) {
      if (line.startsWith('### ')) {
        if (capturing) break; // already collected our block
        const rel = line.slice(4).trim().replace(/\\/g, '/');
        capturing = rel === targetRel || rel.endsWith('/' + targetRel) || targetRel.endsWith('/' + rel);
        if (capturing) continue;
      } else if (capturing) {
        sigLines.push(line);
      }
    }

    const sigs = sigLines.filter((l) => l !== '```' && l.trim() !== '');
    if (sigs.length > 0) {
      lines.push(...sigs);
    } else {
      lines.push('_No signatures indexed for this file. Run: node gen-context.js_');
    }

    indexedFiles = ctxContent
      .split('\n')
      .filter((l) => l.startsWith('### '))
      .map((l) => path.resolve(cwd, l.slice(4).trim()));
  } else {
    lines.push('_No context file found. Run: node gen-context.js_');
  }

  if (!fs.existsSync(targetAbs)) {
    lines.push('');
    lines.push('> File not found on disk: ' + targetRel);
    return lines.join('\n');
  }

  lines.push('');

  // ── Direct imports ────────────────────────────────────────────────────────
  lines.push('## Imports (direct dependencies)');
  try {
    const { extractImports } = require('../map/import-graph');
    const fileContent = fs.readFileSync(targetAbs, 'utf8');
    const fileSet = new Set(indexedFiles);
    fileSet.add(targetAbs);
    const imports = extractImports(targetAbs, fileContent, fileSet);
    if (imports.length > 0) {
      for (const imp of imports) lines.push('- ' + path.relative(cwd, imp).replace(/\\/g, '/'));
    } else {
      lines.push('_No resolvable relative imports found._');
    }
  } catch (err) {
    lines.push('_Could not analyze imports: ' + err.message + '_');
  }

  lines.push('');

  // ── Callers (reverse-import lookup) ──────────────────────────────────────
  lines.push('## Callers (files that import this file)');
  try {
    const { extractImports } = require('../map/import-graph');
    const fileSet = new Set(indexedFiles);
    fileSet.add(targetAbs);
    const callers = [];
    for (const f of indexedFiles) {
      if (f === targetAbs || !fs.existsSync(f)) continue;
      try {
        const fc = fs.readFileSync(f, 'utf8');
        const imps = extractImports(f, fc, fileSet);
        if (imps.includes(targetAbs)) callers.push(path.relative(cwd, f).replace(/\\/g, '/'));
      } catch (_) {}
    }
    if (callers.length > 0) {
      for (const c of callers) lines.push('- ' + c);
    } else {
      lines.push('_No indexed files import this file._');
    }
  } catch (err) {
    lines.push('_Could not analyze callers: ' + err.message + '_');
  }

  return lines.join('\n');
}

/**
 * list_modules({}) → string
 *
 * Lists all srcDir modules present in the context file, sorted by token count
 * descending. Helps agents decide which module to query with read_context.
 */
function listModules(args, cwd) {
  const contextPath = path.join(cwd, CONTEXT_FILE);
  if (!fs.existsSync(contextPath)) {
    return 'No context file found. Run: node gen-context.js';
  }

  const content = fs.readFileSync(contextPath, 'utf8');
  const ctxLines = content.split('\n');

  const groups = {}; // key: top-level dir, value: { fileCount, tokenCount }
  let currentGroup = null;
  let blockBuf = [];

  function flushBlock() {
    if (currentGroup === null || blockBuf.length === 0) return;
    if (!groups[currentGroup]) groups[currentGroup] = { fileCount: 0, tokenCount: 0 };
    groups[currentGroup].fileCount++;
    groups[currentGroup].tokenCount += Math.ceil(blockBuf.join('\n').length / 4);
    blockBuf = [];
  }

  for (const line of ctxLines) {
    if (line.startsWith('### ')) {
      flushBlock();
      const rel = line.slice(4).trim().replace(/\\/g, '/');
      const parts = rel.split('/');
      currentGroup = parts.length > 1 ? parts[0] : '.';
    } else if (currentGroup !== null) {
      blockBuf.push(line);
    }
  }
  flushBlock();

  const sorted = Object.entries(groups)
    .map(([mod, data]) => ({ module: mod, fileCount: data.fileCount, tokenCount: data.tokenCount }))
    .sort((a, b) => b.tokenCount - a.tokenCount);

  if (sorted.length === 0) return 'No modules found in context file.';

  const total = sorted.reduce((s, m) => s + m.tokenCount, 0);

  return [
    '# Modules',
    '',
    '| Module | Files | Tokens |',
    '|--------|-------|--------|',
    ...sorted.map((m) => `| ${m.module} | ${m.fileCount} | ~${m.tokenCount} |`),
    '',
    `**Total context tokens: ~${total}**`,
    '',
    '_Use `read_context({ module: "name" })` to get signatures for a specific module._',
  ].join('\n');
}

module.exports = { readContext, searchSignatures, getMap, createCheckpoint, getRouting, explainFile, listModules };