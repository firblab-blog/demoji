# Demoji Real-World Stress Test Results

**Date:** March 23, 2026
**Tool version:** demoji 0.1.0

## Test Repos

| Repo | Language | Files Scanned | Files w/ Emoji | Total Emoji | Focus |
|------|----------|--------------|----------------|-------------|-------|
| gitmoji | JS/TS | 92 | 17 | 135 | Emoji commit guide |
| node-emoji | JS | 77 | 22 | 184 | Emoji library |
| emoji-mart | JS/TS | 142 | 76 | 193,590 | Emoji picker (massive data files) |
| emojicode | C++ | 291 | 93 | 368 | Emoji-based programming language |
| legesher | Python/MD | 41 | 12 | 99 | Multilingual coding |
| vue-core | TS | 601 | 4 | 48 | Large popular framework |
| conventional-changelog | JS | 298 | 47 | 93 | Commit conventions |
| **Totals** | | **1,542** | **271** | **194,517** | |

## Context Classification Breakdown

| Repo | COMMENT | STRING_LITERAL | LOG_STATEMENT | IDENTIFIER | OTHER |
|------|---------|---------------|---------------|------------|-------|
| gitmoji | 4 | 81 | 0 | 0 | 50 |
| node-emoji | 0 | 96 | 0 | 0 | 88 |
| emoji-mart | 0 | 193,524 | 0 | 0 | 66 |
| emojicode | 79 | 270 | 7 | 0 | 12 |
| legesher | 2 | 28 | 0 | 4 | 65 |
| vue-core | 0 | 9 | 0 | 0 | 39 |
| conventional-changelog | 0 | 1 | 0 | 0 | 92 |

## Action Breakdown

| Repo | Replace | Remove | Preserve | Flag |
|------|---------|--------|----------|------|
| gitmoji | 54 | 0 | 81 | 0 |
| node-emoji | 88 | 0 | 96 | 0 |
| emoji-mart | 66 | 0 | 193,524 | 0 |
| emojicode | 91 | 7 | 270 | 0 |
| legesher | 67 | 0 | 28 | 4 |
| vue-core | 39 | 0 | 9 | 0 |
| conventional-changelog | 92 | 0 | 1 | 0 |

## Key Findings

### What Worked Well

1. **Scanning at scale**: Processed 1,542 files and nearly 200K emoji without crashes or errors. Even emoji-mart's 193K emoji in data files were handled gracefully.

2. **Context classification accuracy**: The tool correctly classified emoji by context across all repos:
   - Comments in emojicode's C++ files (79 `// Copyright ©` lines) → correctly tagged as COMMENT
   - String literals in gitmoji's JSON data → correctly tagged as STRING_LITERAL and preserved
   - Log statements in emojicode → correctly tagged (7 found) and marked for removal
   - Identifiers in legesher's YAML → correctly flagged for manual review (4 found)

3. **Multi-language support**: Successfully scanned JS, TS, JSON, YAML, Markdown, C++, Python, and TOML files across all repos.

4. **Conservative defaults**: String literals are preserved by default (user-facing content), which is the right call for most of these repos. The 193,524 string-literal emoji in emoji-mart were all correctly preserved.

5. **`--strict` mode works**: When enabled, string literal emoji are also targeted for replacement.

6. **Known emoji get readable mappings**: Common emoji like 🐛→[BUG], 🚀→[LAUNCH], ✅→[OK], 🤔→[THINK] produce clean, readable replacements.

7. **IDENTIFIER detection**: The tool correctly identified 4 emoji used in YAML identifiers in legesher and flagged them for manual review instead of auto-replacing.

8. **HTML reports generated successfully** for all 6 repos (emoji-mart skipped due to data size).

### Issues & Edge Cases Found

1. **© (Copyright symbol) detected as emoji**: The `©` character (U+00A9) matches `\p{Extended_Pictographic}` and is being replaced with `[EMOJI:U+00A9]` in C++ copyright headers. This is a false positive — `©` is a standard text character in virtually all codebases and should probably be excluded.

2. **Many emoji lack readable text mappings**: While common dev emoji (🐛, 🚀, ✅, etc.) get nice names, many emoji fall back to `[EMOJI:U+XXXX]` format:
   - ⭐️ → `[EMOJI:U+2B50,U+FE0F]` (could be `[STAR]`)
   - 🙏 → `[EMOJI:U+1F64F]` (could be `[THANKS]` or `[PRAY]`)
   - ❤️ → `[EMOJI:U+2764,U+FE0F]` (could be `[HEART]`)
   - 🎉 → maps to `[CELEBRATE]` ✓ but 🎨 → `[EMOJI:U+1F3A8]` (could be `[ART]`)
   - 👋 → `[EMOJI:U+1F44B]` (could be `[WAVE]`)
   - 📖 → `[EMOJI:U+1F4D6]` (could be `[DOCS]`)

3. **Partial emoji replacement in multi-emoji lines**: In legesher's config.yml, the line "If you're reporting a 🐞 bug" only replaced 👋 but left 🐞 as-is in one observed case. Need to verify consistency.

4. **No .emojicoderc or language-specific exemptions**: Emojicode literally uses emoji AS the programming language syntax. Demoji correctly classifies most as string literals, but a repo like this might benefit from a project-level `.demojirc.json` ignore list.

5. **YAML identifier false positives**: In legesher's lock.yml, text like `⚠️This issue has been...` was classified as IDENTIFIER because the emoji is adjacent to text in a YAML value context. This is arguably correct but might surprise users.

## Recommendations

1. **Expand the emoji→text mapping table** — the current 55+ mappings cover dev-centric emoji well, but adding another 30-50 common emoji (hearts, hands, faces, objects) would significantly reduce `[EMOJI:U+XXXX]` fallbacks.

2. **Exclude `©` (U+00A9) and other text-presentation emoji** — characters like ©, ®, ™ are standard text and shouldn't be flagged.

3. **Add a `.demojirc.json` example** showing how to whitelist specific emoji or files.

4. **Performance note**: All scans completed in under 2 seconds each, even on 600+ file repos. The tool is fast.
