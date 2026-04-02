#!/usr/bin/env node
/**
 * SigMap Slack context-bot — zero npm dependencies.
 *
 * Posts a daily context-freshness reminder + checkpoint summary
 * to a Slack channel via an Incoming Webhook URL.
 *
 * Usage:
 *   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/... node slack-context-bot.js
 *
 * Optional environment variables:
 *   CONTEXT_PATH   Path to context file (default: .github/copilot-instructions.md)
 *   PROJECT_NAME   Display name for the project (default: directory name)
 *   REMIND_USERS   Comma-separated Slack user IDs to @-mention (e.g. U012AB3CD,U987ZY6WX)
 *
 * Cron example (Monday–Friday, 9 AM):
 *   0 9 * * 1-5  cd /path/to/repo && SLACK_WEBHOOK_URL=https://... node examples/slack-context-bot.js
 */

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');
const { execSync } = require('child_process');

// ── Configuration ────────────────────────────────────────────────────────────

const WEBHOOK_URL  = process.env.SLACK_WEBHOOK_URL;
const CONTEXT_FILE = process.env.CONTEXT_PATH || path.join('.github', 'copilot-instructions.md');
const CWD          = process.cwd();
const PROJECT_NAME = process.env.PROJECT_NAME || path.basename(CWD);
const REMIND_USERS = process.env.REMIND_USERS
  ? process.env.REMIND_USERS.split(',').map((s) => s.trim()).filter(Boolean)
  : [];

if (!WEBHOOK_URL) {
  console.error('[context-bot] ERROR: SLACK_WEBHOOK_URL environment variable is not set.');
  console.error('[context-bot] Example: SLACK_WEBHOOK_URL=https://hooks.slack.com/services/... node slack-context-bot.js');
  process.exit(1);
}

// ── Gather project state ──────────────────────────────────────────────────────

function getContextStats() {
  const contextPath = path.join(CWD, CONTEXT_FILE);
  if (!fs.existsSync(contextPath)) {
    return { exists: false };
  }

  const content  = fs.readFileSync(contextPath, 'utf8');
  const stat     = fs.statSync(contextPath);
  const tokens   = Math.ceil(content.length / 4);
  const modules  = (content.match(/^### /gm) || []).length;
  const ageMins  = Math.floor((Date.now() - stat.mtimeMs) / 60_000);

  return { exists: true, tokens, modules, ageMins };
}

function getGitInfo() {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: CWD, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const lastCommit = execSync('git log --oneline -1 --no-decorate', {
      cwd: CWD, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const uncommitted = execSync('git status --porcelain', {
      cwd: CWD, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim().split('\n').filter(Boolean).length;

    return { branch, lastCommit, uncommitted };
  } catch (_) {
    return { branch: 'unknown', lastCommit: '—', uncommitted: 0 };
  }
}

// ── Build Slack payload ───────────────────────────────────────────────────────

function buildPayload(ctx, git) {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const mentions = REMIND_USERS.map((id) => `<@${id}>`).join(' ');
  const greeting = mentions ? `${mentions} — ` : '';

  // Freshness indicator
  let freshnessEmoji = ':white_check_mark:'; // < 2 hours
  let freshnessText  = `Updated ${ctx.ageMins} min ago`;
  if (!ctx.exists) {
    freshnessEmoji = ':x:';
    freshnessText  = 'No context file found — run `node gen-context.js`';
  } else if (ctx.ageMins > 480) { // > 8 hours
    freshnessEmoji = ':warning:';
    freshnessText  = `Last updated ${Math.floor(ctx.ageMins / 60)}h ago — consider regenerating`;
  } else if (ctx.ageMins > 120) { // > 2 hours
    freshnessEmoji = ':large_yellow_circle:';
    freshnessText  = `Updated ${Math.floor(ctx.ageMins / 60)}h ago`;
  }

  const uncommittedNote = git.uncommitted > 0
    ? `\n>:pencil2: *${git.uncommitted} uncommitted file${git.uncommitted > 1 ? 's' : ''}* — context may be stale`
    : '';

  const text = [
    `${greeting}:brain: *SigMap daily reminder* — *${PROJECT_NAME}*`,
    `>*Date:* ${today}`,
    `>*Branch:* \`${git.branch}\`  |  *Last commit:* ${git.lastCommit}`,
    uncommittedNote,
    '',
    `>${freshnessEmoji} *Context file:* ${freshnessText}`,
    ctx.exists ? `>:bar_chart: ~${ctx.tokens} tokens  |  ${ctx.modules} modules indexed` : '',
    '',
    ':clipboard: *Session checklist:*',
    '> 1. Run `node gen-context.js --generate` if you have uncommitted changes',
    '> 2. Start with `cf-start` snippet in Copilot Chat',
    '> 3. Checkpoint every ~30 min with `cf-checkpoint`',
    '> 4. End with `cf-end` before pushing',
  ].filter((l) => l !== undefined).join('\n');

  return { text };
}

// ── HTTP POST ────────────────────────────────────────────────────────────────

function postToSlack(payload) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(WEBHOOK_URL);
    } catch (_) {
      return reject(new Error(`Invalid SLACK_WEBHOOK_URL: "${WEBHOOK_URL}"`));
    }

    const body = JSON.stringify(payload);

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + (url.search || ''),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200 && data === 'ok') {
          resolve();
        } else {
          reject(new Error(`Slack responded ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10_000, () => {
      req.destroy();
      reject(new Error('Request to Slack timed out after 10s'));
    });

    req.write(body);
    req.end();
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const ctx     = getContextStats();
  const git     = getGitInfo();
  const payload = buildPayload(ctx, git);

  console.log('[context-bot] Posting to Slack…');

  try {
    await postToSlack(payload);
    console.log('[context-bot] Message posted successfully.');
  } catch (err) {
    console.error(`[context-bot] Failed to post: ${err.message}`);
    process.exit(1);
  }
}

main();
