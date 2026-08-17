'use strict';

/**
 * `sigmap skills` — agent playbooks + multi-client installer (F3+F4, #517).
 * Run: node test/integration/skills.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const GEN_CONTEXT = path.join(ROOT, 'gen-context.js');
const {
  SKILLS, renderSkill, renderAgentsBlock, injectSkillsBlock,
  installSkills, listSkillClients, START, END,
} = require(path.join(ROOT, 'src/skills/skills.js'));

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  PASS  ${name}`); pass++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${e.message}`); fail++; }
}

function tmp(setup = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigmap-skills-'));
  for (const d of setup.dirs || []) fs.mkdirSync(path.join(dir, d), { recursive: true });
  for (const [f, content] of Object.entries(setup.files || {})) fs.writeFileSync(path.join(dir, f), content);
  return dir;
}
const rm = (dir) => fs.rmSync(dir, { recursive: true, force: true });

const AGENTS_WITH_SIGS = '# My agents file\n\nHuman content here.\n\n## Auto-generated signatures\n\nsig block\n';

// ── skill content ───────────────────────────────────────────────────────────

test('usage-maximizer names the full loop; config-optimizer names tune → apply → validate', () => {
  const um = SKILLS['sigmap-usage-maximizer'].body;
  for (const tool of ['sigmap ask', 'get_lines', 'verify_suggestion', 'squeeze', 'create_checkpoint', 'get_budget', 'summarize-then-drop']) {
    assert.ok(um.includes(tool), `usage-maximizer missing: ${tool}`);
  }
  const co = SKILLS['sigmap-config-optimizer'].body;
  for (const step of ['sigmap tune', 'tune --apply', 'sigmap validate']) {
    assert.ok(co.includes(step), `config-optimizer missing: ${step}`);
  }
});

test('rendering is deterministic and carries a version footer', () => {
  assert.strictEqual(renderSkill('claude', 'sigmap-usage-maximizer', '9.9.9'), renderSkill('claude', 'sigmap-usage-maximizer', '9.9.9'));
  assert.ok(renderSkill('claude', 'sigmap-usage-maximizer', '9.9.9').includes('SigMap v9.9.9'));
  assert.strictEqual(renderAgentsBlock('9.9.9'), renderAgentsBlock('9.9.9'));
  assert.ok(renderSkill('claude', 'sigmap-usage-maximizer', null).startsWith('---\nname: sigmap-usage-maximizer\n'), 'claude frontmatter missing');
  assert.ok(renderSkill('copilot', 'sigmap-config-optimizer', null).startsWith('---\napplyTo: "**"\n'), 'copilot applyTo missing');
});

// ── per-client install ──────────────────────────────────────────────────────

test('installSkills writes native files per client, creating dirs; unknown client → valid list', () => {
  const dir = tmp();
  for (const [client, probe] of [
    ['claude', '.claude/skills/sigmap-usage-maximizer/SKILL.md'],
    ['cursor', '.cursor/rules/sigmap-usage-maximizer.mdc'],
    ['windsurf', '.windsurf/rules/sigmap-config-optimizer.md'],
    ['copilot', '.github/instructions/sigmap-config-optimizer.instructions.md'],
  ]) {
    const r = installSkills(client, { cwd: dir, version: '1.0.0' });
    assert.ok(r.results.every((x) => x.status === 'installed'), `${client}: ${JSON.stringify(r.results)}`);
    assert.ok(fs.existsSync(path.join(dir, probe)), `${client}: missing ${probe}`);
  }
  const bad = installSkills('emacs', { cwd: dir });
  assert.strictEqual(bad.status, 'unknown');
  assert.ok(bad.valid.includes('claude') && bad.valid.includes('codex'));
  rm(dir);
});

// ── codex / AGENTS.md injection ─────────────────────────────────────────────

test('codex: block lands ABOVE the signatures marker, human content preserved, idempotent', () => {
  const dir = tmp({ files: { 'AGENTS.md': AGENTS_WITH_SIGS } });
  const r1 = installSkills('codex', { cwd: dir, version: '1.0.0' });
  assert.strictEqual(r1.results[0].status, 'updated');
  const out = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
  assert.ok(out.includes('Human content here.'), 'human content lost');
  assert.ok(out.indexOf(START) < out.indexOf('## Auto-generated signatures'), 'block not above signatures marker');
  assert.ok(out.indexOf(END) < out.indexOf('## Auto-generated signatures'), 'block end not above signatures marker');
  const r2 = installSkills('codex', { cwd: dir, version: '1.0.0' });
  assert.strictEqual(r2.results[0].status, 'already');
  assert.strictEqual(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8'), out, 'reinstall must be byte-stable');
  rm(dir);
});

test('codex: skills block survives a gen-context regeneration (codex adapter)', () => {
  const dir = tmp({ dirs: ['src'], files: {
    'AGENTS.md': AGENTS_WITH_SIGS,
    'gen-context.config.json': JSON.stringify({ outputs: ['codex'], srcDirs: ['src'] }),
    'src/app.js': 'function startServer(port) { return port; }\nmodule.exports = { startServer };\n',
  } });
  installSkills('codex', { cwd: dir, version: '1.0.0' });
  execFileSync(process.execPath, [GEN_CONTEXT], { cwd: dir, encoding: 'utf8' });
  const out = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
  assert.ok(out.includes(START) && out.includes(END), 'skills block wiped by regeneration');
  assert.ok(out.includes('Human content here.'), 'human content wiped by regeneration');
  assert.ok(out.includes('startServer'), 'signatures missing after regeneration');
  rm(dir);
});

test('injectSkillsBlock: replaces in place; appends when no signatures marker', () => {
  const block = renderAgentsBlock('1.0.0');
  const replaced = injectSkillsBlock(`before\n${START}\nold\n${END}\nafter`, block);
  assert.ok(replaced.startsWith('before\n') && replaced.endsWith('\nafter') && !replaced.includes('\nold\n'));
  const appended = injectSkillsBlock('just human text\n', block);
  assert.ok(appended.startsWith('just human text\n') && appended.includes(START));
});

// ── plain install gating + updated status ───────────────────────────────────

test('plain install touches only present clients; tampered content reports updated', () => {
  const dir = tmp({ dirs: ['.claude'] });
  const list = listSkillClients({ cwd: dir });
  assert.ok(list.find((c) => c.client === 'claude').present);
  assert.ok(!list.find((c) => c.client === 'cursor').present);

  const out = execFileSync(process.execPath, [GEN_CONTEXT, 'skills', 'install'], { cwd: dir, encoding: 'utf8' });
  assert.ok(out.includes('claude') && !out.includes('cursor'), out);
  assert.ok(!fs.existsSync(path.join(dir, '.cursor')), 'plain install must not create absent clients');

  const skillFile = path.join(dir, '.claude/skills/sigmap-usage-maximizer/SKILL.md');
  fs.appendFileSync(skillFile, '\ntampered\n');
  const r = installSkills('claude', { cwd: dir, version: JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'))).version });
  assert.strictEqual(r.results.find((x) => x.path === skillFile).status, 'updated');
  rm(dir);
});

// ── CLI ─────────────────────────────────────────────────────────────────────

test('CLI: skills list --json, install --client creates, --help documents skills', () => {
  const dir = tmp();
  const list = JSON.parse(execFileSync(process.execPath, [GEN_CONTEXT, 'skills', 'list', '--json'], { cwd: dir, encoding: 'utf8' }));
  assert.strictEqual(list.length, 5);
  assert.ok(list.every((c) => 'present' in c && 'installed' in c && Array.isArray(c.targets)));

  const inst = JSON.parse(execFileSync(process.execPath, [GEN_CONTEXT, 'skills', 'install', '--client', 'cursor', '--json'], { cwd: dir, encoding: 'utf8' }));
  assert.strictEqual(inst[0].client, 'cursor');
  assert.ok(fs.existsSync(path.join(dir, '.cursor/rules/sigmap-usage-maximizer.mdc')), '--client must create');

  const help = execFileSync(process.execPath, [GEN_CONTEXT, '--help'], { encoding: 'utf8' });
  assert.ok(/skills list\s+List skill clients/.test(help), '--help missing skills list');
  assert.ok(/skills install\s+Install the SigMap agent playbooks/.test(help), '--help missing skills install');
  rm(dir);
});

console.log(`\n  skills: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
