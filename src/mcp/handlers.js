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
    '# ContextForge Checkpoint',
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
  lines.push('_Generated by ContextForge `create_checkpoint`_');

  return lines.join('\n');
}

module.exports = { readContext, searchSignatures, getMap, createCheckpoint };