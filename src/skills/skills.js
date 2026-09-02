'use strict';

/**
 * sigmap skills — canonical agent playbooks + multi-client installer (F3+F4, #517).
 *
 * Two deterministic skill documents (the spend-minimizing usage loop and the
 * config-optimizer playbook) emitted in each client's native skill/rules
 * format — the `mcp/install.js` CLIENTS pattern applied to skills. File-based
 * clients get sigmap-namespaced files we own outright; AGENTS.md (codex) gets
 * a marker-delimited block inserted ABOVE the `## Auto-generated signatures`
 * marker, since the codex adapter preserves content above it and replaces
 * everything below. Idempotent; human content is never touched.
 */

const fs = require('fs');
const path = require('path');

const START = '<!-- sigmap-skills:start -->';
const END = '<!-- sigmap-skills:end -->';
const SIGNATURES_MARKER = '## Auto-generated signatures';

const SKILLS = {
  'sigmap-usage-maximizer': {
    title: 'SigMap usage maximizer',
    description: 'Spend-minimizing loop for agents in a SigMap-indexed repo: ask before reading, read ranges, verify before trusting, squeeze big pastes, checkpoint, watch the budget.',
    body: [
      'Follow this loop before any file exploration in a repo with SigMap installed.',
      '',
      '1. **Ask before reading.** `sigmap ask "<task>"` (or the `query_context` MCP tool) ranks the relevant files as ~hundreds of tokens of signatures instead of thousands of raw-file tokens. Never open files to "look around".',
      '2. **Read ranges, not files.** Use the `get_lines` MCP tool with the `:start-end` line anchors carried on every signature to pull only the lines you need.',
      '3. **Ground before trusting.** Run the `verify_suggestion` MCP tool (or `sigmap verify-ai-output`) on generated code before applying it — it flags fabricated files, imports, symbols, and npm scripts against the live index.',
      '4. **Squeeze big pastes.** Any stack trace, CI/build log, or JSON blob goes through `sigmap squeeze` (or the `squeeze_output` MCP tool) before it enters context — the signal survives, the noise does not.',
      '5. **Checkpoint progress.** Use the `create_checkpoint` MCP tool or `sigmap note "<decision>"` so a follow-up session resumes without re-deriving state.',
      '6. **Watch the budget.** Check the `get_budget` MCP tool or `sigmap budget` (estimates from SigMap\'s local ledger — no LLM calls). Near the budget: summarize-then-drop older context instead of accumulating, and prefer terse output.',
    ].join('\n'),
  },
  'sigmap-task': {
    title: 'SigMap task loop',
    kind: 'prompt',
    description: 'Do a coding task grounded in SigMap: look up before reading, edit by line anchor, verify before reporting.',
    argumentHint: 'the change you want, in plain words',
    body: [
      'Work through these steps **in order**. Do not open any file before step 2.',
      'Every command runs from the integrated terminal — do not ask the user to run them for you.',
      '',
      '1. **Look up, do not search.** `npx sigmap ask "<the task>"` — this writes `.context/query-context.md`.',
      '2. **Read the map.** `cat .context/query-context.md`. It ranks the relevant files and lists their signatures with `:start-end` line anchors — a few hundred tokens where the same files read whole are tens of thousands. Say which files it surfaced before continuing. If nothing relevant appears, re-run step 1 with different wording; fall back to search only after two attempts, and say so.',
      '3. **Open only the anchored ranges.** A signature ending `:425-425` means read line 425, not the whole file. Never read a file in full when you hold an anchor for it.',
      '4. **Make the change.** Follow the conventions visible in the signatures — same layering, same response wrapper, same annotation style. Add no dependencies.',
      '5. **Verify before reporting.** Write what you changed to `.sigmap-notes.md`, naming every file by its **full repository-relative path** (a bare filename is reported as fake), then run `npx sigmap verify-ai-output .sigmap-notes.md`. It checks every name against the real index, offline, with no model call. Fix anything it flags and re-run before you reply.',
      '6. **Refresh the map.** `npx sigmap` — your edits made it stale.',
      '7. **Report.** The files you changed, the ranges you actually read, the step-1 token count, and the step-5 verify result. Say so if you fell back to searching or if verify flagged something.',
    ].join('\n'),
  },
  'sigmap-config-optimizer': {
    title: 'SigMap config optimizer',
    description: 'Playbook for getting a correct SigMap config on any repo: detect with sigmap tune, review the per-change reasons, apply, validate.',
    body: [
      'Playbook for configuring SigMap on a new or misconfigured repo.',
      '',
      '1. **Detect.** `sigmap tune` prints a recommended config diff — srcDirs pin, monorepo mode, adapters, excludes, budget — with one evidence-naming reason per change. Read-only.',
      '2. **Review.** Every reason names its evidence (workspace marker, client artifact, vendored dir, file-count estimate). Explicit user config is never proposed against.',
      '3. **Apply.** `sigmap tune --apply` merges the recommendations into `gen-context.config.json`, preserving every existing key. Idempotent — a second `tune` proposes nothing.',
      '4. **Validate.** `sigmap validate` confirms the generated context matches the config; `sigmap doctor` diagnoses anything left.',
    ].join('\n'),
  },
};

// Client registry — parent = artifact whose presence means "user uses this
// client" (the `--setup` only-touch-existing rule for plain `skills install`).
const SKILL_CLIENTS = {
  claude:   { label: 'Claude Code',    parent: ['.claude'],
              target: (cwd, skill) => path.join(cwd, '.claude', 'skills', skill, 'SKILL.md') },
  cursor:   { label: 'Cursor',         parent: ['.cursor'],
              target: (cwd, skill) => path.join(cwd, '.cursor', 'rules', `${skill}.mdc`) },
  windsurf: { label: 'Windsurf',       parent: ['.windsurf'],
              target: (cwd, skill) => path.join(cwd, '.windsurf', 'rules', `${skill}.md`) },
  copilot:  { label: 'GitHub Copilot', parent: ['.github'],
              target: (cwd, skill) => (SKILLS[skill] && SKILLS[skill].kind === 'prompt'
                ? path.join(cwd, '.github', 'prompts', `${skill}.prompt.md`)
                : path.join(cwd, '.github', 'instructions', `${skill}.instructions.md`)) },
  codex:    { label: 'Codex CLI (AGENTS.md)', parent: ['AGENTS.md'],
              target: (cwd) => path.join(cwd, 'AGENTS.md'), inject: true },
};

function _footer(version) {
  const ver = version ? ` v${version}` : '';
  return `<sub>Generated by SigMap${ver} · run \`sigmap skills install\` to refresh.</sub>`;
}

/** Render one skill's client-specific file content. */
function renderSkill(client, skillName, version) {
  const skill = SKILLS[skillName];
  const body = `# ${skill.title}\n\n${skill.body}\n\n${_footer(version)}\n`;
  if (client === 'claude') {
    return `---\nname: ${skillName}\ndescription: ${skill.description}\n---\n\n${body}`;
  }
  if (client === 'cursor') {
    return `---\ndescription: ${skill.description}\nalwaysApply: false\n---\n\n${body}`;
  }
  if (client === 'copilot') {
    if (skill.kind === 'prompt') {
      return `---\nname: ${skillName}\nagent: 'agent'\ndescription: ${skill.description}\n`
        + `argument-hint: ${skill.argumentHint}\n---\n\n${body}`;
    }
    return `---\napplyTo: "**"\n---\n\n${body}`;
  }
  return body; // windsurf: plain markdown
}

/** Render the combined AGENTS.md block (both skills, marker-delimited). */
function renderAgentsBlock(version) {
  const parts = [START, '## SigMap agent skills', ''];
  for (const name of Object.keys(SKILLS)) {
    parts.push(`### ${SKILLS[name].title}`, '', SKILLS[name].body, '');
  }
  parts.push(_footer(version), END);
  return parts.join('\n');
}

/**
 * Inject (or replace) the skills block in AGENTS.md content.
 * A new block is inserted ABOVE the `## Auto-generated signatures` marker —
 * the codex adapter's write() preserves content above that marker and
 * replaces everything below it. Never touches content outside the markers.
 */
function injectSkillsBlock(existing, block) {
  const src = String(existing || '');
  const startIdx = src.indexOf(START);
  if (startIdx !== -1) {
    const endIdx = src.indexOf(END, startIdx);
    if (endIdx !== -1) {
      return src.slice(0, startIdx) + block + src.slice(endIdx + END.length);
    }
  }
  const sigIdx = src.indexOf(SIGNATURES_MARKER);
  if (sigIdx !== -1) {
    return src.slice(0, sigIdx) + block + '\n\n' + src.slice(sigIdx);
  }
  if (src.trim() === '') return block + '\n';
  return src + (src.endsWith('\n') ? '\n' : '\n\n') + block + '\n';
}

function _writeIfChanged(filePath, content) {
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, 'utf8');
    if (existing === content) return 'already';
    fs.writeFileSync(filePath, content);
    return 'updated';
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return 'installed';
}

/**
 * Install both skills for one client.
 * @returns {{ client, label, results: Array<{skill, path, status}> }}
 *          status: 'installed' | 'updated' | 'already'; or { status:'unknown', valid } for a bad client.
 */
function installSkills(client, opts = {}) {
  const spec = SKILL_CLIENTS[client];
  if (!spec) return { client, status: 'unknown', valid: Object.keys(SKILL_CLIENTS) };
  const cwd = opts.cwd || process.cwd();
  const version = opts.version || null;
  const results = [];

  if (spec.inject) {
    const filePath = spec.target(cwd);
    const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    const next = injectSkillsBlock(existing, renderAgentsBlock(version));
    let status;
    if (next === existing) status = 'already';
    else { fs.writeFileSync(filePath, next); status = existing ? 'updated' : 'installed'; }
    results.push({ skill: Object.keys(SKILLS).join(' + '), path: filePath, status });
  } else {
    for (const skillName of Object.keys(SKILLS)) {
      const filePath = spec.target(cwd, skillName);
      results.push({ skill: skillName, path: filePath, status: _writeIfChanged(filePath, renderSkill(client, skillName, version)) });
    }
  }
  return { client, label: spec.label, results };
}

/** True when the client's parent artifact exists (plain-install eligibility). */
function clientPresent(client, cwd) {
  const spec = SKILL_CLIENTS[client];
  return !!spec && fs.existsSync(path.join(cwd, ...spec.parent));
}

/** List clients with target paths, presence, and installed state. */
function listSkillClients(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  return Object.keys(SKILL_CLIENTS).map((client) => {
    const spec = SKILL_CLIENTS[client];
    const targets = spec.inject
      ? [spec.target(cwd)]
      : Object.keys(SKILLS).map((s) => spec.target(cwd, s));
    const installed = spec.inject
      ? (fs.existsSync(targets[0]) && fs.readFileSync(targets[0], 'utf8').includes(START))
      : targets.every((t) => fs.existsSync(t));
    return { client, label: spec.label, present: clientPresent(client, cwd), installed, targets };
  });
}

module.exports = { SKILLS, SKILL_CLIENTS, renderSkill, renderAgentsBlock, injectSkillsBlock, installSkills, listSkillClients, clientPresent, START, END };
