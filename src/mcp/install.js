'use strict';

/**
 * Per-client MCP install (v8.0 E4).
 *
 * `sigmap --setup` wires *every* known editor at once and only touches config
 * files that already exist (to avoid creating clutter for editors the user does
 * not use). This module is the targeted counterpart: `sigmap mcp install <client>`
 * picks one client, and — because the user explicitly asked for it — CREATES the
 * config dir/file if it is missing. Idempotent: re-running never duplicates the
 * entry. Zero dependencies; only `fs`/`path`/`os`.
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// Config shapes the supported clients use.
//  - 'json'  → { mcpServers: { sigmap: { command, args } } }
//  - 'vscode'→ { servers: { sigmap: { type: 'stdio', command, args } } }
//  - 'zed'   → { context_servers: { sigmap: { command: { path, args } } } }
//  - 'yaml'  → Codex CLI ~/.codex/config.yaml (mcpServers block, appended)
const CLIENTS = {
  claude:   { label: 'Claude Code',  format: 'json', scope: 'project', project: ['.claude', 'settings.json'] },
  cursor:   { label: 'Cursor',       format: 'json', scope: 'project', project: ['.cursor', 'mcp.json'] },
  windsurf: { label: 'Windsurf',     format: 'json', scope: 'both',
              project: ['.windsurf', 'mcp.json'],
              global:  ['.codeium', 'windsurf', 'mcp_config.json'] },
  vscode:   { label: 'VS Code',      format: 'vscode', scope: 'project', project: ['.vscode', 'mcp.json'] },
  opencode: { label: 'OpenCode',     format: 'json', scope: 'both',
              project: ['opencode.json'],
              global:  ['.config', 'opencode', 'config.json'] },
  gemini:   { label: 'Gemini CLI',   format: 'json', scope: 'global', global: ['.gemini', 'settings.json'] },
  zed:      { label: 'Zed',          format: 'zed',  scope: 'global', global: ['.config', 'zed', 'settings.json'] },
  codex:    { label: 'Codex CLI',    format: 'yaml', scope: 'global', global: ['.codex', 'config.yaml'] },
  mcp:      { label: 'Portable (.mcp.json)', format: 'json', scope: 'project', project: ['.mcp.json'] },
};

/** Resolve the absolute config path for a client, honoring `global`. */
function resolveTarget(spec, cwd, home, useGlobal) {
  const wantGlobal = useGlobal || spec.scope === 'global';
  if (wantGlobal && spec.global) return path.join(home, ...spec.global);
  if (spec.project) return path.join(cwd, ...spec.project);
  if (spec.global)  return path.join(home, ...spec.global);
  return null;
}

/** List supported clients with their resolved target paths. */
function listClients(opts = {}) {
  const cwd  = opts.cwd  || process.cwd();
  const home = opts.home || os.homedir();
  return Object.keys(CLIENTS).map((key) => {
    const spec = CLIENTS[key];
    return {
      client: key,
      label:  spec.label,
      scope:  spec.scope,
      format: spec.format,
      target: resolveTarget(spec, cwd, home, false),
      globalTarget: spec.scope === 'both' ? resolveTarget(spec, cwd, home, true) : null,
    };
  });
}

function serverArgs(scriptPath) {
  return [path.resolve(scriptPath), '--mcp'];
}

/** Install into a JSON `mcpServers` config (create file/dir if absent). */
function _installJson(filePath, scriptPath) {
  let settings = {};
  if (fs.existsSync(filePath)) {
    try { settings = JSON.parse(fs.readFileSync(filePath, 'utf8')) || {}; }
    catch (_) { settings = {}; }
  }
  if (!settings.mcpServers) settings.mcpServers = {};
  if (settings.mcpServers.sigmap) return 'already';
  settings.mcpServers.sigmap = { command: 'node', args: serverArgs(scriptPath) };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2) + '\n');
  return 'installed';
}

/**
 * Install into VS Code's `.vscode/mcp.json`, which keys servers under `servers`
 * (not `mcpServers`) and expects an explicit transport `type`. A config written
 * by an older SigMap under `mcpServers` is migrated rather than left in place,
 * so re-running repairs it instead of leaving two entries VS Code cannot read.
 */
function _installVscode(filePath, scriptPath) {
  let settings = {};
  if (fs.existsSync(filePath)) {
    try { settings = JSON.parse(fs.readFileSync(filePath, 'utf8')) || {}; }
    catch (_) { settings = {}; }
  }
  const stale = settings.mcpServers && settings.mcpServers.sigmap;
  if (stale) {
    delete settings.mcpServers.sigmap;
    if (Object.keys(settings.mcpServers).length === 0) delete settings.mcpServers;
  }
  if (!settings.servers) settings.servers = {};
  if (settings.servers.sigmap && !stale) return 'already';
  settings.servers.sigmap = { type: 'stdio', command: 'node', args: serverArgs(scriptPath) };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2) + '\n');
  return stale ? 'updated' : 'installed';
}

/** Install into Zed's `context_servers` config (create file/dir if absent). */
function _installZed(filePath, scriptPath) {
  let settings = {};
  if (fs.existsSync(filePath)) {
    try { settings = JSON.parse(fs.readFileSync(filePath, 'utf8')) || {}; }
    catch (_) { settings = {}; }
  }
  if (!settings.context_servers) settings.context_servers = {};
  if (settings.context_servers.sigmap) return 'already';
  settings.context_servers.sigmap = { command: { path: 'node', args: serverArgs(scriptPath) } };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2) + '\n');
  return 'installed';
}

/** Install into Codex CLI YAML (append block; create file if absent). */
function _installYaml(filePath, scriptPath) {
  let raw = '';
  if (fs.existsSync(filePath)) {
    raw = fs.readFileSync(filePath, 'utf8');
    if (raw.includes('sigmap')) return 'already';
  }
  const block = [
    'mcpServers:',
    '  sigmap:',
    '    command: node',
    '    args:',
    `      - ${path.resolve(scriptPath)}`,
    '      - --mcp',
  ].join('\n');
  const next = raw ? raw.trimEnd() + '\n\n' + block + '\n' : block + '\n';
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, next);
  return 'installed';
}

/**
 * Install the sigmap MCP server for a single client.
 * @returns { client, label, path, status } where status is
 *   'installed' | 'already' | 'unknown'.
 */
function installClient(client, opts = {}) {
  const spec = CLIENTS[client];
  if (!spec) {
    return { client, status: 'unknown', valid: Object.keys(CLIENTS) };
  }
  const cwd        = opts.cwd  || process.cwd();
  const home       = opts.home || os.homedir();
  const scriptPath = opts.scriptPath || path.join(cwd, 'gen-context.js');
  const filePath   = resolveTarget(spec, cwd, home, opts.global);

  let status;
  if (spec.format === 'vscode')    status = _installVscode(filePath, scriptPath);
  else if (spec.format === 'zed')  status = _installZed(filePath, scriptPath);
  else if (spec.format === 'yaml') status = _installYaml(filePath, scriptPath);
  else                             status = _installJson(filePath, scriptPath);

  return { client, label: spec.label, path: filePath, status };
}

module.exports = { CLIENTS, listClients, installClient, resolveTarget };
