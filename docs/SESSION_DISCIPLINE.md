# Session Discipline with SigMap

> **Goal:** Every coding session starts with full context and ends with a clean handoff.
> No more "where was I?" — every session is a continuation, not a restart.

---

## Why session discipline matters

AI coding assistants have a fixed context window. Without structure:

- The assistant forgets decisions made 30 minutes ago
- You re-explain the same architecture twice per session
- PR descriptions miss important context
- The next session starts cold

SigMap solves the first problem (the assistant always has your code signatures).
Session discipline solves the rest.

---

## Session lifecycle

### 1. Start (`cf-start`)

**Before writing any code:**

```
1. Run: node gen-context.js --generate     (or the watcher is running)
2. In Copilot Chat: type cf-start → Tab
3. Specify your task for the session
4. Wait for the assistant to confirm it has loaded context
```

Target: assistant acknowledges ≥3 relevant modules before you write line 1.

**Tokens budget check:**

```bash
node gen-context.js --report
# Should show: ~1–4K tokens (not 20K+)
# If over 6K: review .contextignore — you're indexing too much
```

---

### 2. Work — checkpoint every 30 minutes (`cf-checkpoint`)

**Why 30 minutes?**

Context drift occurs gradually. A checkpoint every 30 minutes:
- Captures decisions while they're fresh
- Gives the assistant a recovery point if the conversation derails
- Produces a natural audit trail

**Checkpoint pattern:**

```
cf-checkpoint → Tab → note: "finished auth middleware, starting token refresh"
```

The `create_checkpoint` MCP tool will record:

| Field | Source |
|---|---|
| Timestamp | System clock |
| Your note | Typed above |
| Branch | `git rev-parse --abbrev-ref HEAD` |
| Recent commits | `git log --oneline -5` |
| Token count | Context file size ÷ 4 |
| Modules indexed | Count of `### ` headings in context |
| Routes | PROJECT_MAP.md (if generated) |

**Store checkpoints:**  
Copy the checkpoint output into your session notes, PR description, or a `NOTES.md` file in the repo root (which should be in `.contextignore`).

---

### 3. End (`cf-end`)

Use `cf-end` before:
- A break longer than an hour
- Merging a PR
- Switching to a different repo

The end prompt produces a **handoff note** — a summary your future self (or a colleague) can use to resume without asking the assistant to re-explain everything.

**Minimum handoff note contains:**
- What was completed (linked to commits or file paths)
- What is in-progress (file, function, blocker)
- Next immediate step
- Any non-obvious decisions made and why

---

## Token hygiene

| Practice | Effect |
|---|---|
| Keep `maxTokens ≤ 6000` in config | Fits in any model's context budget |
| Add `NOTES.md`, `*.log`, `docs/` to `.contextignore` | Removes noise |
| Run `--generate` after large merges | Keeps sigs fresh |
| Use `cf-module` instead of `cf-context` for large repos | ~200 tokens vs ~4000 |
| Don't index `test/fixtures/` | Generated files, near-zero signal |

**Check your token efficiency:**

```bash
node gen-context.js --report --json | node -e "
  const r = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log('Ratio:', (r.outputTokens / r.totalTokens * 100).toFixed(1) + '% kept');
"
```

Target: keep ≤ 30% of raw token count.

---

## Multi-session workflow

### For features spanning multiple sessions

```
Session 1:             Session 2:             Session 3 (PR):
cf-start               cf-start               cf-start
  ↓                      ↓                      ↓
[code]                 read NOTES.md          cf-pr
  ↓                      ↓                      ↓
cf-checkpoint          cf-checkpoint          cf-end → PR description
  ↓                      ↓                      ↓
cf-end → NOTES.md      [code]                 git push
                         ↓
                       cf-end → NOTES.md
```

### Parallel workstreams (monorepo)

```bash
# Generate context per package
node gen-context.js --monorepo

# Point the assistant to a specific package
cf-module → packages/api
```

---

## Git hook integration

SigMap can regenerate context automatically on every commit:

```bash
node gen-context.js --setup
# Installs: .git/hooks/post-commit → runs gen-context.js --generate
```

With the hook in place, the context file is always in sync with HEAD. Context drift between commits becomes impossible.

**Verify the hook is active:**

```bash
cat .git/hooks/post-commit
# Should contain: node /path/to/gen-context.js --generate
```

---

## MCP tool reference

| Tool | When to use | Example |
|---|---|---|
| `read_context` | Start of session, after merges | `cf-context` or `cf-module` |
| `search_signatures` | Looking for a specific function | `cf-search` |
| `get_map` | Understanding dependencies / routes | `cf-map-imports`, `cf-map-routes` |
| `create_checkpoint` | Every 30 min, before breaks, before PR | `cf-checkpoint`, `cf-end` |

---

## VS Code snippet installation

Copy `examples/copilot-prompts.code-snippets` from this repo to:

```
# macOS / Linux
~/.config/Code/User/snippets/copilot-prompts.code-snippets

# Windows
%APPDATA%\Code\User\snippets\copilot-prompts.code-snippets
```

Or use a project-level snippet:
```
.vscode/copilot-prompts.code-snippets   ← shared with the team
```

All 20 snippets use `cf-` prefix — type `cf-` in the Copilot Chat input to browse them.

---

## Slack reminder bot

Use `examples/slack-context-bot.js` to post daily context freshness reminders to your team channel:

```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/... \
  node examples/slack-context-bot.js
```

Set up as a cron job:

```cron
0 9 * * 1-5  SLACK_WEBHOOK_URL=https://... node /path/to/slack-context-bot.js
```

This posts a Monday–Friday 9am reminder with today's date, prompting the team to run `gen-context.js --generate` if they have uncommitted changes.

---

## Quick-reference card

```
MORNING              DURING SESSION        EVENING / PR
──────────────────   ────────────────────  ────────────────────
node gen-context.js  cf-checkpoint (×N)    cf-end
cf-start             (every ~30 min)       git push
                                           cf-pr (for PRs)
```

---

*SigMap for daily always-on context; Repomix for deep one-off sessions — use both.*
