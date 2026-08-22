'use strict';

/**
 * #534 — per-module strategy: ask/query_context must merge every
 * context-<module>.md split file, not just context-cold.md.
 * Run: node test/integration/per-module-ask.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const GEN_CONTEXT = path.join(ROOT, 'gen-context.js');
const { buildSigIndex, rank } = require(path.join(ROOT, 'src/retrieval/ranker.js'));

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  PASS  ${name}`); pass++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${e.message}`); fail++; }
}

/** Two-module per-module repo, generated for real. */
function perModuleRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigmap-permod-'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.mkdirSync(path.join(dir, 'lib'));
  fs.writeFileSync(path.join(dir, 'src', 'db.js'),
    'function connectDatabase(url) { return url; }\nmodule.exports = { connectDatabase };\n');
  fs.writeFileSync(path.join(dir, 'lib', 'widget.js'),
    'function renderWidget(el) { return el; }\nmodule.exports = { renderWidget };\n');
  fs.writeFileSync(path.join(dir, 'gen-context.config.json'),
    JSON.stringify({ strategy: 'per-module', srcDirs: ['src', 'lib'] }));
  const gen = execFileSync(process.execPath, [GEN_CONTEXT], { cwd: dir, encoding: 'utf8' });
  assert.ok(fs.existsSync(path.join(dir, '.github', 'context-src.md')), `split files missing: ${gen}`);
  return dir;
}
const rm = (dir) => fs.rmSync(dir, { recursive: true, force: true });

test('buildSigIndex merges every per-module split file (both modules retrievable)', () => {
  const dir = perModuleRepo();
  const index = buildSigIndex(dir);
  const keys = [...index.keys()].join(' ');
  assert.ok(keys.includes('db.js'), `src module missing from index: ${keys}`);
  assert.ok(keys.includes('widget.js'), `lib module missing from index: ${keys}`);
  const dbHit = rank('connect database', index, { topK: 3, cwd: dir })[0];
  assert.ok(dbHit && dbHit.file.includes('db.js'), `db.js not ranked first: ${JSON.stringify(dbHit)}`);
  const widgetHit = rank('render widget', index, { topK: 3, cwd: dir })[0];
  assert.ok(widgetHit && widgetHit.file.includes('widget.js'), `widget.js not ranked first: ${JSON.stringify(widgetHit)}`);
  rm(dir);
});

test('CLI: sigmap ask works on a per-module repo (was: "no context file found")', () => {
  const dir = perModuleRepo();
  const out = execFileSync(process.execPath, [GEN_CONTEXT, 'ask', 'connect database'], { cwd: dir, encoding: 'utf8' });
  assert.ok(!out.includes('no context file found'), out);
  assert.ok(fs.existsSync(path.join(dir, '.context', 'query-context.md')), 'query context not written');
  const ctx = fs.readFileSync(path.join(dir, '.context', 'query-context.md'), 'utf8');
  assert.ok(ctx.includes('connectDatabase'), 'ranked context missing the target signature');
  rm(dir);
});

test('CLI: --query --json returns ranked results on a per-module repo', () => {
  const dir = perModuleRepo();
  const out = JSON.parse(execFileSync(process.execPath, [GEN_CONTEXT, '--query', 'render widget', '--json'], { cwd: dir, encoding: 'utf8' }));
  assert.ok(out.results.length > 0, 'no results');
  assert.ok(out.results[0].file.includes('widget.js'), JSON.stringify(out.results[0]));
  rm(dir);
});

test('hot-cold and full strategies unchanged (cold file still merged; full still works)', () => {
  // full strategy: primary file carries everything — enrichment must not break it
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sigmap-permod-full-'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src', 'auth.js'), 'function loginUser(name) { return name; }\nmodule.exports = { loginUser };\n');
  execFileSync(process.execPath, [GEN_CONTEXT], { cwd: dir, encoding: 'utf8' });
  const index = buildSigIndex(dir);
  assert.ok([...index.keys()].some((k) => k.includes('auth.js')), 'full strategy broken');
  // synthetic cold file merges exactly as before
  fs.writeFileSync(path.join(dir, '.github', 'context-cold.md'),
    '### src/legacy.js\n```\nfunction oldThing(a)  :1-1\n```\n');
  const enriched = buildSigIndex(dir);
  assert.ok([...enriched.keys()].some((k) => k.includes('legacy.js')), 'cold merge regressed');
  rm(dir);
});

console.log(`\n  per-module-ask: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
