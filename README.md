# ContextForge

**Zero-dependency AI context engine — 97% token reduction**

Every coding agent session starts with full codebase context at under 4K tokens.  
No `npm install`. Runs on any machine with Node.js 18+.

```bash
node gen-context.js       # generate once
node gen-context.js --watch   # generate + auto-update on file changes
node gen-context.js --setup   # generate + install git hook + watch
```

---

## What it does

ContextForge scans your source files, extracts only the **function and class signatures** (no bodies, no imports, no comments), and writes a compact `copilot-instructions.md` file that Copilot, Claude, Cursor, and Windsurf read automatically.

| Stage | Tokens |
|---|---|
| Raw source files | ~80,000 |
| Repomix compressed | ~8,000 |
| **ContextForge signatures** | **~4,000** |
| ContextForge + MCP (v0.3) | ~200–2,000 on demand |

---

## Quick start

```bash
# No install needed — just Node 18+
node gen-context.js

# Output: .github/copilot-instructions.md
# That file is auto-read by GitHub Copilot in VS Code
```

---

## Companion tool: Repomix

ContextForge and [Repomix](https://github.com/yamadashy/repomix) are **complementary, not competing**:

- **ContextForge** — always-on, runs in git hooks, produces ~4K token signature index
- **Repomix** — on-demand deep sessions, full file content, broader language support

```bash
# Use both:
node gen-context.js --setup    # always-on context
npx repomix --compress         # deep dive sessions
```

---

## Languages supported (v0.1)

| Language | Extensions |
|---|---|
| TypeScript | `.ts` `.tsx` |
| JavaScript | `.js` `.jsx` `.mjs` `.cjs` |
| Python | `.py` `.pyw` |
| Java | `.java` |
| Kotlin | `.kt` `.kts` |
| Go | `.go` |
| Rust | `.rs` |
| C# | `.cs` |
| C/C++ | `.cpp` `.c` `.h` `.hpp` `.cc` |
| Ruby | `.rb` `.rake` |
| PHP | `.php` |
| Swift | `.swift` |
| Dart | `.dart` |
| Scala | `.scala` `.sc` |
| Vue | `.vue` |
| Svelte | `.svelte` |
| HTML | `.html` `.htm` |
| CSS/SCSS | `.css` `.scss` `.sass` `.less` |
| YAML | `.yml` `.yaml` |
| Shell | `.sh` `.bash` `.zsh` `.fish` |
| Dockerfile | `Dockerfile` `Dockerfile.*` |

---

## CLI reference

```
node gen-context.js                       Generate once and exit
node gen-context.js --monorepo            Generate per-package context (monorepo)
node gen-context.js --routing             Include model routing hints in output
node gen-context.js --format cache        Also write Anthropic prompt-cache JSON
node gen-context.js --watch              Generate + watch for changes
node gen-context.js --setup              Generate + install git hook + start watcher
node gen-context.js --report            Token reduction stats
node gen-context.js --report --json     Token report as JSON (for CI)
node gen-context.js --init              Write example config file
node gen-context.js --help              Usage information
node gen-context.js --version           Version string
```

---

## Prompt caching (v0.8)

Reduce Anthropic API costs by ~60% using prompt cache. ContextForge writes a cache-ready
JSON block that you can embed in your API calls:

```bash
node gen-context.js --format cache
# Writes: .github/copilot-instructions.cache.json
# Format: { type: 'text', text: '...', cache_control: { type: 'ephemeral' } }
```

Combine with Repomix for maximum savings — use Repomix output as the stable cached prefix
and ContextForge signatures as the per-session dynamic segment.
See [docs/REPOMIX_CACHE.md](docs/REPOMIX_CACHE.md) for the full strategy.

---

## Configuration

Copy `gen-context.config.json.example` to `gen-context.config.json`:

```json
{
  "srcDirs": ["src", "app", "lib"],
  "maxTokens": 6000,
  "outputs": ["copilot"],
  "secretScan": true,
  "format": "cache"
}
```

Exclusions go in `.contextignore` (gitignore syntax). Also reads `.repomixignore` if present.

---

## Testing

```bash
node test/run.js            # all 21 extractors
node test/run.js typescript # one language
node test/run.js --update   # regenerate expected outputs
```

---

## Validation

```bash
# Gate 1: all tests pass
node test/run.js
# Expected: 21/21 PASS

# Gate 2: no external imports
grep "require(" gen-context.js | grep -v "^.*//.*require"
# Expected: only Node built-ins (fs, path, assert, os, crypto, child_process, readline)

# Gate 3: watch mode works
node gen-context.js --watch &
echo "// change" >> src/extractors/javascript.js
sleep 2
# Expected: copilot-instructions.md timestamp updated
```

---

## Project structure

```
gen-context.js                ← single-file entry point
gen-project-map.js            ← import graph, class hierarchy, route table
src/extractors/               ← 21 language extractors
src/format/cache.js           ← Anthropic prompt-cache JSON formatter (v0.8)
src/routing/                  ← model routing hints (v0.7)
src/mcp/                      ← MCP stdio server (v0.3)
src/security/                 ← secret scanner (v0.2)
src/config/                   ← config loader + defaults
test/fixtures/                ← one fixture per language
test/expected/                ← expected extractor output
test/run.js                   ← zero-dep test runner
docs/REPOMIX_CACHE.md         ← prompt cache strategy guide (v0.8)
docs/MODEL_ROUTING.md         ← model routing guide (v0.7)
.contextignore.example        ← exclusion template
gen-context.config.json.example ← annotated config reference
```

---

## Principles

- **Zero npm dependencies** — `node gen-context.js` on a blank machine
- **Never throw** — extractors always return `[]` on error
- **Repomix is a companion** — use both, replace neither
- **No telemetry** — never phones home

---

## License

MIT
