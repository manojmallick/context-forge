#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const INTEGRATION_DIR = path.join(ROOT, 'test', 'integration');

function listTests() {
  return fs.readdirSync(INTEGRATION_DIR)
    .filter((f) => f.endsWith('.test.js'))
    .sort()
    .map((f) => path.join(INTEGRATION_DIR, f));
}

function runOne(filePath) {
  const rel = path.relative(ROOT, filePath);
  console.log(`[integration] running ${rel}`);
  const res = spawnSync('node', [filePath], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);

  if (res.status !== 0) {
    console.error(`[integration] FAIL ${rel} (exit ${res.status})`);
    return false;
  }
  console.log(`[integration] PASS ${rel}`);
  return true;
}

function main() {
  const tests = listTests();
  if (tests.length === 0) {
    console.log('[integration] no integration tests found');
    process.exit(0);
  }

  let passed = 0;
  let failed = 0;
  for (const file of tests) {
    if (runOne(file)) passed++;
    else failed++;
  }

  console.log('');
  console.log(`[integration] results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
