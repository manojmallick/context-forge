# SigMap — TIMELINE.md
# Version-wise committing plan with validation gates
# Every version is independently deployable and testable.

---

## Reading this file

Each version has:
- **What ships** — exact files and features
- **Commit sequence** — ordered list of commits with message format
- **Validation gate** — tests that must pass before tagging the version
- **Definition of done** — observable proof it works

A version is NOT done until its validation gate is 100% green.

---

## Version overview

| Version | Theme | Duration | Token impact |
|---|---|---|---|
| v0.0 | Repomix baseline | 0 (exists) | 80K → 8K |
| v0.1 | Core extractor | 2 days | 8K → 4K |
| v0.2 | Enterprise hardening | 3 days | 4K → 3K |
| v0.3 | MCP server | 3 days | 3K → 200–2K |
| v0.4 | Project map | 4 days | adds structural context |
| v0.5 | Monorepo + CI | 3 days | scales to any repo |
| v0.6 | Session discipline | 1 week | 40% fewer tokens/conversation |
| v0.7 | Model routing | 1 week | cost reduction |
| v0.8 | Prompt cache | 2 weeks | 60% API cost reduction |
| v0.9 | Observability | 2 weeks | measurement |
| v1.0 | Full system | 1 week | 97% total reduction |
| v1.1 | Context strategies | 3 days | per-module: −70% / hot-cold: −90% per question |
| v1.2 | Version bump + test hardening | 1 day | correctness + npm discoverability |
| v1.3 | `--diff` flag + watch debounce | 2 days | −50–90% tokens during active PR work |
| v1.4 ✅ | MCP `explain_file` + strategy-aware health | 2 days | precision queries, accurate scoring |
| v1.5 ✅ | VS Code extension + npm publish + docs search | 1 week | 10× adoption surface |

---

## v0.0 — Repomix baseline
**Status: Available now. Zero build time.**

This version is Repomix, not SigMap. Document it as the starting point.

### What to do
```bash
# Install Repomix globally — the first thing any new team member does
npm install -g repomix

# Create baseline measurement on your project
repomix --compress -o .context/repomix-compressed.md
# Record: how many tokens is the output?

# Create .repomixignore
cat > .repomixignore << 'EOF'
node_modules/
dist/
build/
*.generated.*
EOF
```

### Commit
```
chore: add repomix baseline — AI context v0.0

- Install repomix globally
- Create .repomixignore exclusions
- Measure baseline: [X] tokens → [Y] tokens compressed
- Document in README: repomix is the companion tool
```

### Validation gate v0.0
- [ ] `npx repomix --compress` completes without error
- [ ] Output exists at `.context/repomix-compressed.md`
- [ ] Token count measured and recorded (use: `wc -c` ÷ 4)
- [ ] `.repomixignore` excludes node_modules

---

## v0.1 — Core extractor
**Duration: 2 days | Owner: Platform**

### What ships
- `gen-context.js` — single file, zero deps, all 21 extractors inline
- `.contextignore.example`
- `gen-context.config.json.example`
- Auto-update: `fs.watch` watcher
- Auto-update: `post-commit` git hook via `--setup`
- Output: `.github/copilot-instructions.md`

### Commit sequence

```bash
# Commit 1 — scaffold
git add gen-context.js
git commit -m "feat(core): scaffold gen-context.js v0.1 — zero deps CLI

- Single file entry point
- CLI flags: --generate, --watch, --setup, --help, --version
- Config loading stub (hardcoded defaults for now)
- File walker using fs.readdirSync recursive
- Language detection by extension map"

# Commit 2 — TypeScript + JavaScript extractors (test these first)
git add src/extractors/typescript.js src/extractors/javascript.js
git add test/fixtures/typescript.ts test/expected/typescript.txt
git add test/fixtures/javascript.js test/expected/javascript.txt
git commit -m "feat(extractor): add TypeScript and JavaScript extractors

- TypeScript: export/interface/type/class/enum/function
- JavaScript: exports, class, arrow functions, module.exports
- Fixtures and expected outputs for both
- node test/run.js typescript passes"

# Commit 3 — remaining extractors in batches
git commit -m "feat(extractor): add Python, Java, Kotlin, Go extractors"
git commit -m "feat(extractor): add Rust, C#, C/C++, Ruby, PHP extractors"
git commit -m "feat(extractor): add Swift, Dart, Scala extractors"
git commit -m "feat(extractor): add Vue, Svelte, HTML, CSS extractors"
git commit -m "feat(extractor): add YAML, Shell, Dockerfile extractors"

# Commit 4 — watcher and hook
git commit -m "feat(core): add fs.watch auto-update and post-commit hook install

- --watch flag starts fs.watch on srcDirs
- --setup installs post-commit hook without overwriting existing hooks
- Debounce: 500ms after last file change
- Hook runs gen-context.js --generate silently"

# Commit 5 — .contextignore support
git commit -m "feat(config): add .contextignore support (gitignore syntax)

- Reads .contextignore from project root
- Also reads .repomixignore if present (union of both)
- Excludes matching paths before extraction"

# Commit 6 — README and docs
git commit -m "docs: add README, CONTRIBUTING, and language extraction table"

# Tag
git tag v0.1.0
git push origin main --tags
```

### Validation gate v0.1
```bash
# Gate 1: All extractor tests pass
node test/run.js
# Expected: 21/21 PASS, 0 failures

# Gate 2: Runs on a real project
cd /path/to/any-nodejs-project
node /path/to/gen-context.js --generate
# Expected: .github/copilot-instructions.md created, > 0 bytes

# Gate 3: Token reduction on a 50-file project
node gen-context.js --report
# Expected: shows reduction ≥ 80% vs raw file content

# Gate 4: .contextignore works
echo "src/legacy/**" >> .contextignore
node gen-context.js --generate
# Expected: no signatures from src/legacy/ in output

# Gate 5: Watch mode works
node gen-context.js --watch &
echo "// test change" >> src/index.ts
sleep 2
# Expected: copilot-instructions.md timestamp updated

# Gate 6: No external imports
grep -r "require(" gen-context.js | grep -v "^.*//.*require"
# Expected: only Node built-ins (fs, path, assert, os, crypto)
```

### Definition of done
- Paste generated `copilot-instructions.md` into Claude and ask: "What's the main service class?" — it should answer correctly from signatures alone
- A developer with Node 18 on a blank machine can run `node gen-context.js` without installing anything

---

## v0.2 — Enterprise hardening
**Duration: 3 days | Owner: Platform**

### What ships
- `src/security/scanner.js` — per-file secret redaction
- `src/security/patterns.js` — 10 secret patterns
- `src/config/loader.js` — reads `gen-context.config.json`
- `src/config/defaults.js` — all defaults documented
- Token budget enforcement with drop order
- Multi-agent output (copilot + claude + cursor + windsurf)
- CLAUDE.md append strategy (never overwrite human content)

### Commit sequence

```bash
# Commit 1 — secret patterns
git add src/security/patterns.js
git commit -m "feat(security): add secret detection patterns

- AWS Access Key (AKIA...)
- GCP API Key (AIza...)
- GitHub tokens (gh[pousr]_...)
- JWT, DB connection strings, SSH keys
- Stripe, Twilio, generic key=value patterns"

# Commit 2 — scanner implementation
git add src/security/scanner.js
git add test/integration/secret-scan.test.js
git commit -m "feat(security): add per-file secret scanner

- scan(sigs, filePath) → { safe, redacted }
- Never throws — returns original on error
- Never blocks whole run — redacts per file only
- Integration test: AWS key in fixture → redacted in output"

# Commit 3 — config loader
git add src/config/loader.js src/config/defaults.js
git commit -m "feat(config): add external config file support

- Reads gen-context.config.json from cwd
- Deep merges with defaults
- Validates unknown keys, prints warning
- --init flag writes annotated example config"

# Commit 4 — token budget
git add test/integration/token-budget.test.js
git commit -m "feat(core): implement token budget with priority drop order

- maxTokens: 6000 default (configurable)
- Drop order: test files → config → generated → least-changed
- Never drops recently committed files
- Prints report of what was dropped and why"

# Commit 5 — multi-agent output
git add test/integration/multi-output.test.js
git commit -m "feat(core): add multi-agent output targets

- outputs: ['copilot', 'claude', 'cursor', 'windsurf']
- CLAUDE.md: appends below ## Auto-generated signatures marker
- .cursorrules, .windsurfrules: full replacement
- Single run writes all configured targets atomically"

# Commit 6 — ignore file alignment
git commit -m "feat(config): align .contextignore with .repomixignore

- If .repomixignore exists, auto-include those patterns
- Print tip to symlink if both files exist separately
- Document in REPOMIX_INTEGRATION.md"

git tag v0.2.0
```

### Validation gate v0.2
```bash
# Gate 1: Secret scanning
echo 'const key = "AKIAIOSFODNN7EXAMPLE"' > /tmp/fake-secret.ts
node gen-context.js --generate  
grep "AKIAIOSFODNN7" .github/copilot-instructions.md
# Expected: empty (no output — secret not present)
grep "REDACTED" .github/copilot-instructions.md
# Expected: [REDACTED — AWS Access Key detected] appears

# Gate 2: Token budget
# On a project with 200+ files:
node gen-context.js --report
# Expected: final token count ≤ 6000

# Gate 3: Multi-output
node gen-context.js --generate
ls -la .github/copilot-instructions.md CLAUDE.md .cursorrules .windsurfrules
# Expected: all 4 files exist, all non-empty

# Gate 4: CLAUDE.md preservation
echo "# My human content" > CLAUDE.md
echo "## Important decisions" >> CLAUDE.md
node gen-context.js --generate
head -3 CLAUDE.md
# Expected: first 2 lines unchanged ("# My human content", "## Important decisions")

# Gate 5: Config file works
cat > gen-context.config.json << 'EOF'
{ "maxTokens": 3000, "outputs": ["copilot"], "secretScan": true }
EOF
node gen-context.js --generate
# Expected: runs without error, only writes copilot-instructions.md
```

---

## v0.3 — MCP server
**Duration: 3 days | Owner: Platform**

### What ships
- `src/mcp/server.js` — stdio JSON-RPC server
- `src/mcp/tools.js` — 3 tool definitions
- `src/mcp/handlers.js` — read_context, search_signatures, get_map
- `--mcp` CLI flag
- Auto-registration in Claude Code / Cursor settings
- `examples/claude-code-settings.json` — both MCP servers

### Commit sequence

```bash
git commit -m "feat(mcp): implement MCP stdio server — zero deps

- Handles: initialize, tools/list, tools/call
- Pure Node.js readline JSON-RPC — no npm packages
- Server reads context files from disk per call (no state)
- node gen-context.js --mcp starts server"

git commit -m "feat(mcp): add read_context tool

- read_context() → all signatures (~4K tokens)
- read_context('src/services') → module only (~200 tokens)
- Reads from .github/copilot-instructions.md on disk"

git commit -m "feat(mcp): add search_signatures and get_map tools

- search_signatures(query) → matching sigs with file paths
- get_map(type) → imports|classes|routes section of PROJECT_MAP.md
- get_map returns error message if PROJECT_MAP.md not found"

git commit -m "feat(mcp): add auto-registration for Claude Code and Cursor

- --setup detects .claude/settings.json → offers to add server entry
- --setup detects .cursor/mcp.json → offers to add server entry
- Prints manual config snippet if auto-registration declined"

git commit -m "docs: add MCP_SETUP.md and examples/claude-code-settings.json"
git tag v0.3.0
```

### Validation gate v0.3
```bash
# Gate 1: Basic MCP handshake
echo '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"protocolVersion":"2024-11-05","capabilities":{}}}' \
  | node gen-context.js --mcp | head -1
# Expected: valid JSON with "result" containing serverInfo

# Gate 2: Tools list
echo '{"jsonrpc":"2.0","method":"tools/list","id":2}' \
  | node gen-context.js --mcp
# Expected: JSON with tools array containing 3 items:
# read_context, search_signatures, get_map

# Gate 3: read_context call
echo '{"jsonrpc":"2.0","method":"tools/call","id":3,"params":{"name":"read_context","arguments":{}}}' \
  | node gen-context.js --mcp
# Expected: JSON with content containing signature strings

# Gate 4: Module-scoped call
echo '{"jsonrpc":"2.0","method":"tools/call","id":4,"params":{"name":"read_context","arguments":{"module":"src"}}}' \
  | node gen-context.js --mcp
# Expected: only signatures from src/ directory

# Gate 5: Claude Code integration
cat .claude/settings.json | grep "sigmap"
# Expected: MCP server entry exists after --setup
```

---

## v0.4 — Project dependency map
**Duration: 4 days | Owner: Platform**

### What ships
- `gen-project-map.js` — standalone entry point
- `src/map/import-graph.js` — static import analysis
- `src/map/class-hierarchy.js` — extends/implements tree
- `src/map/route-table.js` — HTTP route extraction
- Output: `PROJECT_MAP.md`

### Commit sequence

```bash
git commit -m "feat(map): scaffold gen-project-map.js — zero deps entry point"
git commit -m "feat(map): add import graph for TS/JS/Python/Go/Java"
git commit -m "feat(map): add class hierarchy extractor (extends/implements/mixins)"
git commit -m "feat(map): add route table for Express/Fastify/Flask/Spring/NestJS"
git commit -m "feat(map): add circular dependency detection with ⚠ warnings"
git commit -m "test: add integration tests for project map on 5 real frameworks"
git tag v0.4.0
```

### Validation gate v0.4
```bash
# On an Express.js project:
node gen-project-map.js
cat PROJECT_MAP.md | grep "### Import graph"
# Expected: section present with at least 3 dependency lines

cat PROJECT_MAP.md | grep "→"
# Expected: route table with HTTP method and handler mapping

# On a project with circular deps:
cat PROJECT_MAP.md | grep "⚠"
# Expected: circular dependency warning if cycles exist
```

---

## v0.5 — Monorepo + CI + git-diff priority
**Duration: 3 days | Owner: Platform**

### Commit sequence

```bash
git commit -m "feat(monorepo): auto-detect and generate per-package context files"
git commit -m "feat(core): add git-diff priority — recently changed files sort first"
git commit -m "feat(ci): add GitHub Action workflow for both tools"
git commit -m "test: add test suite covering all 21 extractors with fixtures"
git commit -m "docs: add CI integration guide and monorepo setup"
git tag v0.5.0
```

### Validation gate v0.5
```bash
# On a monorepo with packages/:
node gen-context.js --monorepo
ls packages/*/CLAUDE.md
# Expected: one file per package

# Git diff priority:
git log --name-only --format="" -n 5 | head -5 > /tmp/recent-files.txt
head -20 CLAUDE.md | grep -f /tmp/recent-files.txt
# Expected: at least one recently changed file appears in first 20 lines

# Test suite:
node test/run.js
# Expected: all tests pass including new fixtures
```

---

## v0.6 — Session discipline
**Duration: 1 week | Owner: DevEx**

### What ships
- `examples/copilot-prompts.code-snippets` — 20 VS Code snippets
- `create_checkpoint` MCP tool added to server
- `docs/SESSION_DISCIPLINE.md`
- Slack bot template for session reminders

### Validation gate v0.6
```bash
# MCP checkpoint tool:
echo '{"jsonrpc":"2.0","method":"tools/call","id":5,"params":{"name":"create_checkpoint","arguments":{}}}' \
  | node gen-context.js --mcp
# Expected: JSON with checkpoint content summarising current state

# VS Code snippets:
# Open VS Code → Insert Snippet → type "cf-" 
# Expected: at least 3 snippets appear in autocomplete
```

---

## v0.7 — v1.0 (condensed)

### v0.7 — Model routing
```bash
git commit -m "feat(routing): add model routing hints to context output"
git commit -m "docs: add MODEL_ROUTING.md — task type to tier mapping"
git tag v0.7.0
```

### v0.8 — Prompt cache
```bash
git commit -m "feat(cache): add --format cache output for Anthropic API"
git commit -m "docs: add REPOMIX_CACHE.md — repomix output as cached prefix"
git tag v0.8.0
```

### v0.9 — Observability
```bash
git commit -m "feat(report): add --report --json flag for CI token reporting"
git commit -m "feat(tracking): add optional SQLite usage log"
git commit -m "docs: add ENTERPRISE_SETUP.md — GitHub Enterprise API integration"
git tag v0.9.0
```

### v1.0 — Full system
```bash
git commit -m "feat(system): add self-healing CI — auto-regenerate on acceptance drop"
git commit -m "feat(system): add --suggest-tool command for task classification"
git commit -m "feat(system): add --health composite score output"
git commit -m "docs: update all docs for v1.0 full system"
git tag v1.0.0
```

---

## Weekly commit rhythm

For ongoing development, follow this weekly pattern:

```
Monday:    Plan the week — pick 1 version increment to complete
Tuesday:   Core implementation commits
Wednesday: Core implementation commits  
Thursday:  Tests and validation gate
Friday:    Documentation + tag if gate passes

Never commit:
- With failing tests
- Without a test for new functionality
- Breaking changes without CHANGELOG.md update
- npm packages (ever)
```

---

## Commit message format — always

```
type(scope): short description (under 72 chars)

[optional body — what and why, not how]

Types:    feat / fix / docs / test / chore / refactor / perf
Scopes:   core / extractor / mcp / security / config / map / ci / docs / test

Examples:
feat(extractor): add Elixir extractor with module and def support
fix(security): handle multiline JWT tokens in scanner
docs(readme): add Repomix integration guide with workflow diagram
test(go): add fixture for Go interface and struct extraction
chore(ci): add Node 22 to test matrix
```

---

## Paper data collection (runs alongside development)

Collect this data as you build — it's the paper's Section 5:

```bash
# After v0.1 is working — measure on 5 public repos
pip install tiktoken

# For each repo: django, express, spring-petclinic, fastapi, next.js
git clone https://github.com/django/django /tmp/django
cd /tmp/django

# Baseline: raw file content
find . -name "*.py" | xargs cat | wc -c
# Record: raw chars / 4 = raw tokens

# Repomix compressed
npx repomix --compress -o /tmp/repomix-out.txt
wc -c /tmp/repomix-out.txt
# Record: repomix chars / 4 = repomix tokens

# SigMap
node /path/to/gen-context.js --generate
wc -c .github/copilot-instructions.md
# Record: contextforge chars / 4 = contextforge tokens

# This gives you the 5-row table for the paper
```

Record in `paper/data/token-measurements.csv`:
```
repo,raw_tokens,repomix_tokens,contextforge_tokens,reduction_pct
django,342000,28000,3200,99.1%
...
```

---

## v1.1 — Context strategies
**Status: ✅ SHIPPED — tagged 2026-04-01**
**Duration: 3 days | Owner: Platform**

### What shipped
- `strategy` config key: `'full'` | `'per-module'` | `'hot-cold'` (default `'full'`)
- `hotCommits` config key: number of recent commits counted as "hot" (default `10`)
- `runPerModuleStrategy()` — one `.github/context-<module>.md` per srcDir + thin overview
- `runHotColdStrategy()` — hot (recent commits) → primary output; cold → `.github/context-cold.md`
- `docs/CONTEXT_STRATEGIES.md` — 418-line strategy guide with decision tree and 4 worked scenarios
- `docs/strategies.html` — full styled HTML docs page with comparison table
- All 6 docs HTML pages updated with Strategies nav link

### Commit sequence (already merged)
```bash
git commit -m "feat: add per-module and hot-cold context strategies"
git commit -m "docs: add CONTEXT_STRATEGIES.md with full strategy guide"
git commit -m "docs(site): add detailed strategy page and docs navigation links"
git commit -m "docs: finalize strategy documentation across guides and site"
git tag v1.1.0
```

### Validation gate v1.1 (all pass)
```bash
# per-module strategy
cat > gen-context.config.json << 'EOF'
{ "strategy": "per-module" }
EOF
node gen-context.js --generate
ls .github/context-*.md
# Expected: one file per srcDir + copilot-instructions.md overview

# hot-cold strategy
cat > gen-context.config.json << 'EOF'
{ "strategy": "hot-cold", "hotCommits": 10 }
EOF
node gen-context.js --generate
ls .github/context-cold.md
# Expected: context-cold.md exists; copilot-instructions.md contains only hot files

# full strategy (default) still works
nodegen-context.js --generate
node gen-context.js --report
# Expected: 21/21 extractor tests pass
```

---

## v1.2 — Version bump + test hardening
**Status: ✅ SHIPPED — tagged 2026-04-02**
**Duration: 1 day | Owner: Platform**

### What ships
- `package.json` version bumped from `1.0.0` → `1.1.0` (sync with shipped strategies)
- `gen-context.js` hardcoded version string updated to `1.1.0`
- `README.md` updated to reflect v1.1 features
- `test/integration/strategy.test.js` — new integration test covering `per-module` and `hot-cold` strategies
- `--init` command now also writes a starter `.contextignore` alongside the config example

### Commit sequence
```bash
# Commit 1 — version bump
git add package.json gen-context.js
git commit -m "chore: bump version to 1.1.0 — sync with shipped strategy features

- package.json: 1.0.0 → 1.1.0
- gen-context.js --version: 1.0.0 → 1.1.0
- CHANGELOG.md: v1.1.0 entry already present"

# Commit 2 — strategy integration tests
git add test/integration/strategy.test.js
git commit -m "test(integration): add strategy tests for per-module and hot-cold

- per-module: asserts context-<module>.md files are created per srcDir
- per-module: asserts overview file contains cross-module preamble
- hot-cold: asserts context-cold.md created when cold files exist
- hot-cold: asserts primary output contains only recently-changed file sigs
- Both: asserts fallback to full strategy when git history unavailable"

# Commit 3 — --init .contextignore scaffold
git add gen-context.js
git commit -m "feat(config): --init now scaffolds .contextignore alongside config

- Writes .contextignore with sensible defaults if it does not exist
- Defaults: node_modules/, dist/, build/, *.generated.*, *.pb.*, coverage/
- Skips write if .contextignore already exists (safe to re-run)
- Prints path of written file to stdout"

# Tag
git tag v1.2.0
git push origin main --tags
```

### Validation gate v1.2
```bash
# Gate 1: version string
node gen-context.js --version
# Expected: 1.1.0

cat package.json | grep version
# Expected: "version": "1.1.0"

# Gate 2: strategy integration tests pass
node test/run.js
node test/integration/strategy.test.js 2>&1 | tail -5
# Expected: all pass, 0 failures

# Gate 3: --init creates .contextignore
rm -f .contextignore
node gen-context.js --init
ls .contextignore gen-context.config.json
# Expected: both files created
cat .contextignore | grep node_modules
# Expected: node_modules/ present

# Gate 4: no regression on existing tests
node test/run.js
# Expected: 21/21 PASS
```

### Definition of done
- `node gen-context.js --version` outputs `1.1.0`
- Strategy tests exist and pass
- A first-time user running `--init` gets both config AND ignore file

---

## v1.3 — `--diff` flag + watch debounce
**Status: ✅ SHIPPED — v1.3.0**
**Duration: 2 days | Owner: Platform**

### What ships
- `--diff` CLI flag — generates context only for files changed in the current git diff (staged + unstaged)
- `--diff --staged` variant — only staged files (useful as pre-commit context check)
- Watch mode debounce improved: 300ms instead of 500ms, coalesces rapid saves into a single regeneration
- Config key `watchDebounce` (default `300`) for custom tuning
- New token profile in `--report`: shows "diff mode" vs "full mode" token counts side by side

### Commit sequence
```bash
# Commit 1 — diff flag implementation
git add gen-context.js
git commit -m "feat(core): add --diff flag for changed-files-only context

- --diff generates context for files in: git diff HEAD (staged + unstaged)
- --diff --staged generates context for git diff --cached only
- Falls back to full generation if not in a git repo
- Output written to .github/copilot-instructions.md (same as full)
- --report shows: diff files: N, diff tokens: ~X vs full tokens: ~Y"

# Commit 2 — watch debounce improvement
git add gen-context.js src/config/defaults.js
git commit -m "fix(core): reduce watch debounce to 300ms, add watchDebounce config key

- Previous 500ms felt sluggish on rapid saves
- 300ms is imperceptible for developers but prevents redundant runs
- watchDebounce: N in gen-context.config.json overrides default
- Multiple file saves within the window are coalesced into one run"

# Commit 3 — diff tests
git add test/integration/diff.test.js
git commit -m "test(integration): add --diff mode tests

- Creates temp git repo with staged and unstaged changes
- Asserts diff output only contains sigs from changed files
- Asserts --staged variant only covers staged files
- Asserts fallback to full when outside git repo"

# Commit 4 — docs
git commit -m "docs: add --diff flag to README CLI reference and help text"

git tag v1.3.0
git push origin main --tags
```

### Validation gate v1.3
```bash
# Gate 1: --diff only includes changed file sigs
mkdir /tmp/diff-test && cd /tmp/diff-test && git init
cp /path/to/gen-context.js .
git add . && git commit -m 'initial'
echo 'function newFn() {}' >> index.js
node gen-context.js --diff
cat .github/copilot-instructions.md
# Expected: only index.js signatures — no other files

# Gate 2: --diff --staged respects staging area
git add index.js
echo 'function unstaged() {}' >> other.js
node gen-context.js --diff --staged
cat .github/copilot-instructions.md | grep unstaged
# Expected: empty — unstaged file excluded

# Gate 3: watch debounce
node gen-context.js --watch &
WATCH_PID=$!
for i in 1 2 3 4 5; do echo "// $i" >> index.js; done
sleep 1 && kill $WATCH_PID
# Expected: gen-context.js ran exactly once (not 5 times)
# Check: ls -la .github/copilot-instructions.md — modified time shows 1 update

# Gate 4: report shows diff token count
node gen-context.js --diff --report
# Expected: output includes "diff files" and "diff tokens" fields

# Gate 5: all existing tests still pass
node test/run.js
# Expected: 21/21 PASS
```

### Definition of done
- During an active PR, `node gen-context.js --diff` produces context under 300 tokens for a typical 3-file change
- Watch mode no longer re-runs visibly when saving a file 5 times in quick succession

---

## v1.4 — MCP `explain_file` tool + strategy-aware health score
**Status: ✅ SHIPPED — v1.4.0**
**Duration: 2 days | Owner: Platform**

### What ships
- New MCP tool: `explain_file` — returns a file's signatures + its direct imports + files that import it (callers)
- New MCP tool: `list_modules` — lists all srcDir modules with their token counts (helps agents pick the right `read_context` call)
- Health scorer updated to be strategy-aware: `hot-cold` at 90% reduction no longer penalized vs `full` at 40%
- Health scorer gains a new metric: **strategy freshness** (checks if `context-cold.md` is older than 24h and penalizes)
- `--health --json` output gains `strategy` and `strategyFreshnessDays` fields

### Commit sequence
```bash
# Commit 1 — explain_file MCP tool
git add src/mcp/handlers.js src/mcp/tools.js
git commit -m "feat(mcp): add explain_file tool

- explain_file({ path: 'src/services/auth.ts' })
  → { signatures: [...], imports: [...], callers: [...] }
- signatures: from the file's own extractor output
- imports: direct dependencies resolved from import-graph
- callers: files that import this file (reverse lookup)
- Returns clear error if path not found or outside srcDirs"

# Commit 2 — list_modules MCP tool
git add src/mcp/handlers.js src/mcp/tools.js
git commit -m "feat(mcp): add list_modules tool

- list_modules() → [{ module, fileCount, tokenCount }, ...]
- Sorted by tokenCount descending
- Helps agents decide whether to call read_context(module) vs read_context()
- Returns total token count for full context"

# Commit 3 — strategy-aware health scorer
git add src/health/scorer.js
git commit -m "fix(health): make scorer strategy-aware

- Score is now evaluated relative to the active strategy
- hot-cold: expected reduction ≥ 85%, threshold adjusted accordingly
- per-module: tokens measured per question (per-file budget), not total
- full: original thresholds unchanged
- New strategyFreshnessDays field: penalizes stale context-cold.md (> 24h = -10 pts)
- Grade A still requires ≥ 90, but denominator accounts for strategy"

# Commit 4 — MCP integration tests
git add test/integration/mcp-server.test.js
git commit -m "test(mcp): add explain_file and list_modules tool tests

- explain_file: asserts signatures, imports, callers all present
- explain_file: asserts graceful error for unknown path
- list_modules: asserts array sorted by tokenCount desc
- list_modules: asserts sum matches full read_context token count"

# Commit 5 — health tests
git add test/integration/observability.test.js
git commit -m "test(health): add strategy-aware health score assertions"

git tag v1.4.0
git push origin main --tags
```

### Validation gate v1.4
```bash
# Gate 1: explain_file MCP tool
echo '{"jsonrpc":"2.0","method":"tools/call","id":1,"params":{"name":"explain_file","arguments":{"path":"src/mcp/handlers.js"}}}' \
  | node gen-context.js --mcp
# Expected: JSON with signatures, imports, callers arrays — all non-empty

# Gate 2: explain_file graceful error
echo '{"jsonrpc":"2.0","method":"tools/call","id":2,"params":{"name":"explain_file","arguments":{"path":"nonexistent.js"}}}' \
  | node gen-context.js --mcp
# Expected: JSON result with error message, no crash

# Gate 3: list_modules
echo '{"jsonrpc":"2.0","method":"tools/call","id":3,"params":{"name":"list_modules","arguments":{}}}' \
  | node gen-context.js --mcp
# Expected: JSON array sorted by tokenCount descending

# Gate 4: tools/list shows 5 tools (was 3, now +explain_file +list_modules)
echo '{"jsonrpc":"2.0","method":"tools/list","id":4}' \
  | node gen-context.js --mcp | grep -o '"name"' | wc -l
# Expected: 5

# Gate 5: hot-cold health score is not penalized
cat > gen-context.config.json << 'EOF'
{ "strategy": "hot-cold" }
EOF
node gen-context.js --generate
node gen-context.js --health
# Expected: grade A or B even if full-mode reduction appears low

# Gate 6: all tests pass
node test/run.js
# Expected: 21/21 PASS
```

### Definition of done
- In Claude Code, an agent can call `explain_file('src/services/payment.ts')` and get its signature, what it imports, and what calls it — without reading any raw file content
- Health score on a `hot-cold` project with 90% reduction shows grade A, not grade C

---

## v1.5 — VS Code extension + npm publish + docs search
**Status: ✅ SHIPPED — v1.5.0**
**Duration: 1 week | Owner: Platform + DevEx**

### What ships
- `vscode-extension/` — VS Code extension (published to Marketplace)
  - Status bar item: shows health score grade + last-regen timestamp
  - Command palette: `SigMap: Regenerate Context` (runs `node gen-context.js`)
  - Command palette: `SigMap: Open Context File`
  - Notification when context file is > 24h stale
  - Settings: `contextforge.scriptPath` — path to `gen-context.js`
- `npm publish` — package published as `sigmap` on npm
  - `npx sigmap` — works as a zero-install drop-in
  - `npx sigmap --init` bootstraps new projects in one command
  - Zero runtime deps preserved — only `devDependencies` for publishing tooling
- Docs site search — lightweight client-side keyword search on all 6 HTML pages
  - No external library — pure JS, searches `innerText` of all content sections
  - Keyboard shortcut: `/` to focus search, `Escape` to clear
  - Results highlight matching sections and scroll to them

### Commit sequence
```bash
# Commit 1 — npm package setup
git add package.json .npmignore
git commit -m "chore(npm): configure package for npm publish as sigmap

- name: 'sigmap'
- bin: { 'sigmap': './gen-context.js' }
- .npmignore: excludes test/, docs/, .claude/, .github/workflows/
- engines: { node: '>=18' }
- keywords: copilot, ai-context, token-reduction, code-signatures
- Zero runtime dependencies preserved"

# Commit 2 — npx bin shebang
git add gen-context.js
git commit -m "chore(core): add #!/usr/bin/env node shebang for npx compatibility

- Adds shebang as first line of gen-context.js
- chmod +x in package.json postinstall removed (bin field handles it)
- npx sigmap --init now works on fresh machines"

# Commit 3 — VS Code extension scaffold
git add vscode-extension/
git commit -m "feat(vscode): add VS Code extension scaffold

- vscode-extension/package.json with activationEvents and commands
- Extension activates on workspace open if gen-context.js found
- Status bar: shows grade (A/B/C/D) and regen time
- Command: SigMap.regenerate runs node gen-context.js
- Command: SigMap.openContext opens .github/copilot-instructions.md"

# Commit 4 — stale context notification
git add vscode-extension/src/extension.js
git commit -m "feat(vscode): add stale context notification

- Checks mtime of copilot-instructions.md on activation
- If > 24h: shows information message with 'Regenerate' button
- Runs regeneration in VS Code terminal (shows output to user)
- Respects 'Do not show again' per workspace"

# Commit 5 — docs search
git add docs/index.html docs/quick-start.html docs/languages.html \
          docs/roadmap.html docs/repomix.html docs/strategies.html
git commit -m "feat(docs): add client-side keyword search to all 6 pages

- Press '/' to open search overlay on any docs page
- Searches headings and paragraph text via DOM traversal
- Matching sections highlighted in amber, page scrolls to first match
- Press Escape or click X to clear
- Zero external dependencies — 60 lines of inline JS"

# Commit 6 — publish + Marketplace
git commit -m "chore: publish sigmap@1.1.0 to npm + VS Code Marketplace

- npm publish --access public
- vsce publish (VS Code Marketplace)
- README badges updated: npm version, VS Code installs"

git tag v1.5.0
git push origin main --tags
```

### Validation gate v1.5
```bash
# Gate 1: npx works
npx sigmap --version
# Expected: 1.1.0 (or current version)

npx sigmap --init
ls gen-context.config.json .contextignore
# Expected: both files created

# Gate 2: npm package integrity
npm pack --dry-run
# Expected: only gen-context.js, src/, README.md, LICENSE, package.json
# Expected: no test/, docs/, .claude/, secrets

# Gate 3: VS Code extension loads
# Open VS Code in sigmap project
# Expected: status bar shows health grade within 5s of window open
# Expected: Cmd+Shift+P → 'SigMap' → two commands visible

# Gate 4: stale notification
# Manually set copilot-instructions.md mtime to 2 days ago
touch -t 202603310000 .github/copilot-instructions.md
# Reload VS Code window
# Expected: notification appears within 3s: "Context file is 2 days old"

# Gate 5: docs search
# Open docs/languages.html in browser
# Press /
# Type 'python'
# Expected: Python section scrolls into view and is highlighted
# Press Escape
# Expected: highlight clears, search overlay closes

# Gate 6: no regression
node test/run.js
# Expected: 21/21 PASS
```

### Definition of done
- `npx sigmap` works on a brand new machine with no prior setup
- VS Code extension is listed on the Marketplace with >0 installs
- Any developer on the docs site can find "Python" or "hot-cold" via keyboard search in < 3 seconds

---

## Post v1.5 — backlog (unscheduled)

| Item | Description | Effort |
|---|---|---|
| Tree-sitter opt-in | Optional `--treesitter` flag for higher-accuracy extraction | Large |
| GitHub App | Auto-PR context freshness check in CI | Large |
| `--benchmark` flag | Runs against 5 public repos and prints reduction table | Medium |
| Neovim plugin | Status line integration (mirrors VS Code extension) | Medium |
| JetBrains plugin | Mirrors VS Code extension for IntelliJ/WebStorm/PyCharm | Medium |
| `explain_symbol` MCP tool | Find all usages of a function/class across the codebase | Medium |
| Graphical PROJECT_MAP | Generate Mermaid diagram from import graph | Small |
| `--format markdown-table` | Signature output as condensed markdown table | Small |
