# Changelog

## [2.0.1] — 2026-04-04

### Added
- v2 pipeline support: TODOs, recent changes, coverage gaps, PR diff context
- Dependency extractors for Python and TypeScript
- Impact radius hints (reverse dependency annotations)
- Enriched signatures with return types and type hints across all 21 languages
- "What's new in 2.0" section in extension README

### Changed
- Status bar prefix updated from `cf:` to `sm:` for SigMap branding alignment

### Fixed
- Status bar now correctly shows SigMap branding

## [1.5.0] — 2026-04-03

### Added
- Initial release on VS Code Marketplace
- Status bar showing health grade (A/B/C/D) and time since last regeneration
- `SigMap: Regenerate Context` command
- `SigMap: Open Context File` command
- Stale context notification (>24h) with one-click regenerate
- Configurable `sigmap.scriptPath` setting
- 21 language support
- Secret scanning (AWS keys, GitHub tokens, DB strings, etc.)
- MCP server support for Claude and Cursor
