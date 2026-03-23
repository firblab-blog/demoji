<!-- COGIT:START -->
# Cogit Managed Context
Surface: AGENTS.md
Project: demoji (proj_c4300922-b61d-4fc5-85d1-6d3070ac18d5)
Delivery posture: enforced
Project state: hybrid
Identity state: remote_attached
Source channels: discovery, remote_registration
Repair state: ok
Guidance readiness: ready
Policy status: pending_review
Recall briefing: demoji standard briefing with 0 selected context items, 6 effective rules, and 2 warnings.
Recall briefing budget: standard (837/5000 est. tokens)
Warnings:
- 4 review item(s) are still pending approval.
Composed recall briefing:
## Briefing Overview
- Project: demoji (proj_c4300922-b61d-4fc5-85d1-6d3070ac18d5)
- Budget: standard
- Delivery posture: enforced
- Project state: hybrid | Identity state: remote_attached
- Canonical locator: gitlab:192.168.10.50/applications/demoji
- Guidance readiness: ready
- Policy readiness: pending_review
- Requested files: none

## Technology Profile
- nodejs (runtime) confidence=0.91
- javascript (language) confidence=0.83

## Warnings
- Policy readiness is pending_review: Candidate guidance exists, but review is still pending.
- 4 review item(s) are still pending approval.

## Effective Policy
- [error/reviewed_source/fresh] COMMENT emoji → replace with text equivalent from the built-in mapping (e.g., ✅→[OK], ❌→[FAIL], 🚀→[LAUNCH], 🔥→[HOT], ⚠️→[WARN], 💡→[IDEA], 📝→[NOTE], 🐛→[BUG], ✨→[NEW], 🔧→[FIX]). LOG_STATEMENT emoji → remove entirely. IDENTIFIER emoji → always flag for manual review, never auto-replace. STRING_LITERAL emoji → preserve by default (user-facing), remove with --strict flag. OTHER emoji → replace with text equivalent. Unknown emoji with no mapping → replace with [EMOJI:U+XXXX] showing the codepoint.
- [error/reviewed_source/fresh] Scan these extensions: .ts, .tsx, .js, .jsx, .mjs, .cjs, .py, .rb, .go, .rs, .java, .kt, .swift, .c, .cpp, .h, .cs, .md, .yaml, .yml, .json, .toml. Skip directories: node_modules, .git, dist, build, out, vendor, __pycache__, .next, .nuxt, coverage, .nyc_output. Respect .gitignore and .demoji-ignore patterns. Never read or modify binary files. Detect binary files by checking for null bytes in the first 8192 bytes.
- [error/reviewed_source/fresh] Every detected emoji must be classified into one of four contexts: COMMENT (inside // or /* */ or # comments), STRING_LITERAL (inside quotes, template literals, or f-strings), LOG_STATEMENT (inside console.log, logger.*, print(), or logging.* calls), IDENTIFIER (variable name, function name, class name, property name), or OTHER (none of the above). Classification drives replacement strategy.
- [error/reviewed_source/fresh] NEVER modify files without explicit user confirmation via --yes flag or interactive prompt. ALWAYS create a git backup branch (demoji/backup-{timestamp}) before any modifications. The --dry-run flag MUST produce a full report without changing any file on disk. All changes must be reversible via git checkout. Exit with non-zero code on any error. Write a machine-readable JSON summary to stdout when --json flag is used.
- [error/reviewed_source/fresh] Zero runtime dependencies — stdlib only (Node.js built-ins). TypeScript with strict mode. Single entry point at src/index.ts. Compiled output to dist/. Package bin field maps 'demoji' to dist/index.js. All configuration via CLI flags, no config files required (but support optional .demojirc.json). Tests use Node.js built-in test runner (node:test) and assertions (node:assert).
- [error/reviewed_source/fresh] A file is flagged when more than 5% of its non-whitespace characters are emoji, OR when any single line contains more than 3 emoji. Comments and string literals are both scanned. Emoji used in identifiers (variable names, function names) are always flagged regardless of density. The Unicode emoji property (`\p{Emoji_Presentation}` and `\p{Extended_Pictographic}`) is the detection source — do NOT use hardcoded emoji lists.
Effective policy:
- [error/reviewed_source/fresh] COMMENT emoji → replace with text equivalent from the built-in mapping (e.g., ✅→[OK], ❌→[FAIL], 🚀→[LAUNCH], 🔥→[HOT], ⚠️→[WARN], 💡→[IDEA], 📝→[NOTE], 🐛→[BUG], ✨→[NEW], 🔧→[FIX]). LOG_STATEMENT emoji → remove entirely. IDENTIFIER emoji → always flag for manual review, never auto-replace. STRING_LITERAL emoji → preserve by default (user-facing), remove with --strict flag. OTHER emoji → replace with text equivalent. Unknown emoji with no mapping → replace with [EMOJI:U+XXXX] showing the codepoint.
- [error/reviewed_source/fresh] Scan these extensions: .ts, .tsx, .js, .jsx, .mjs, .cjs, .py, .rb, .go, .rs, .java, .kt, .swift, .c, .cpp, .h, .cs, .md, .yaml, .yml, .json, .toml. Skip directories: node_modules, .git, dist, build, out, vendor, __pycache__, .next, .nuxt, coverage, .nyc_output. Respect .gitignore and .demoji-ignore patterns. Never read or modify binary files. Detect binary files by checking for null bytes in the first 8192 bytes.
- [error/reviewed_source/fresh] Every detected emoji must be classified into one of four contexts: COMMENT (inside // or /* */ or # comments), STRING_LITERAL (inside quotes, template literals, or f-strings), LOG_STATEMENT (inside console.log, logger.*, print(), or logging.* calls), IDENTIFIER (variable name, function name, class name, property name), or OTHER (none of the above). Classification drives replacement strategy.
- [error/reviewed_source/fresh] NEVER modify files without explicit user confirmation via --yes flag or interactive prompt. ALWAYS create a git backup branch (demoji/backup-{timestamp}) before any modifications. The --dry-run flag MUST produce a full report without changing any file on disk. All changes must be reversible via git checkout. Exit with non-zero code on any error. Write a machine-readable JSON summary to stdout when --json flag is used.
- [error/reviewed_source/fresh] Zero runtime dependencies — stdlib only (Node.js built-ins). TypeScript with strict mode. Single entry point at src/index.ts. Compiled output to dist/. Package bin field maps 'demoji' to dist/index.js. All configuration via CLI flags, no config files required (but support optional .demojirc.json). Tests use Node.js built-in test runner (node:test) and assertions (node:assert).
- [error/reviewed_source/fresh] A file is flagged when more than 5% of its non-whitespace characters are emoji, OR when any single line contains more than 3 emoji. Comments and string literals are both scanned. Emoji used in identifiers (variable names, function names) are always flagged regardless of density. The Unicode emoji property (`\p{Emoji_Presentation}` and `\p{Extended_Pictographic}`) is the detection source — do NOT use hardcoded emoji lists.
Latest preflight:
- none recorded yet
Post-hoc audit findings:
- none recorded yet
Task delivery:
Current Tasks:
- no tasks are currently queued
Decision-point consultation:
- Consultation is required before significant file modifications, schema changes, API changes, or deployment actions.
- Use `cogit_query_decision_point` with `projectId`, `actionCategory`, `actionSummary`, and any `requestedFiles` you expect to touch.
- Decision-point consultations are logged in Cogit's database-backed audit trail for later review.
Notes:
- This block is generated from reviewed Cogit policy and delivery state.
- Edit outside this block to preserve user-authored instructions.
<!-- COGIT:END -->
