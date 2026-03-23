# demoji

A TypeScript CLI that scans source repositories for emoji usage, classifies each match by context, and either reports or applies policy-driven replacements.

Built for cleaning up the emoji that accumulates when vibe-coding with LLMs.

## What It Does

- **`scan`** walks a repo, finds emoji in supported text files, and prints a summary.
- **`clean`** applies context-aware replacements after confirmation or `--yes`.
- **`report`** generates a standalone HTML report for the scan results.

### Context-Aware Replacement Rules

demoji classifies every emoji it finds into one of five contexts, and each context has its own replacement strategy:

| Context | Strategy | Example |
|---------|----------|---------|
| **Comment** | Replace with text equivalent | `// ✅ done` → `// [OK] done` |
| **Log statement** | Remove entirely | `console.log("🚀 starting")` → `console.log(" starting")` |
| **String literal** | Preserve (replace with `--strict`) | `"Hello 👋"` stays as-is |
| **Identifier** | Flag for manual review, never auto-replace | `const 🚀launch = true` |
| **Other** | Replace with text equivalent | `🔥` → `[HOT]` |

## Installation

```bash
git clone https://github.com/firblab-blog/demoji.git && cd demoji
npm install
npm run build
npm link  # optional: makes `demoji` available globally
```

Requires Node.js 22 or later. Zero runtime dependencies.

## Usage

```bash
# Scan a repo for emoji
demoji scan .

# Scan with verbose per-file details
demoji scan src --verbose

# Machine-readable JSON output
demoji scan . --json

# Preview what clean would change
demoji clean . --dry-run

# Apply changes (creates a backup branch first)
demoji clean . --yes

# Generate an HTML report
demoji report . --output report.html
```

## Flags

| Flag | Description |
|------|-------------|
| `--strict` | Also replace emoji inside string literals |
| `--yes` | Skip confirmation prompt for `clean` |
| `--json` | Print machine-readable JSON output |
| `--dry-run` | Preview `clean` changes without writing files |
| `--verbose` | Show per-file detail and planned diffs |
| `--output <file>` | Set destination for `report` (default: `demoji-report.html`) |

## Supported File Types

`.ts` `.tsx` `.js` `.jsx` `.mjs` `.cjs` `.py` `.rb` `.go` `.rs` `.java` `.kt` `.swift` `.c` `.cpp` `.h` `.cs` `.md` `.yaml` `.yml` `.json` `.toml`

Automatically skips `node_modules`, `.git`, `dist`, `build`, `out`, `vendor`, `__pycache__`, `.next`, `.nuxt`, `coverage`, and `.nyc_output`. Respects `.gitignore` patterns. Detects and skips binary files.

## Example Output

```
demoji scan results for tests/fixtures/emoji-heavy

Summary:
  Files scanned:        5
  Files with emoji:     5
  Total emoji found:   20

  By context:
    COMMENT:           8  (will replace with text)
    STRING_LITERAL:    4  (will preserve)
    LOG_STATEMENT:     4  (will remove)
    IDENTIFIER:        4  (flagged for review)
    OTHER:             0  (will replace with text)

  By action:
    Replace:     8
    Remove:      4
    Preserve:    4
    Flag:        4
```

## How It Works

demoji uses Unicode properties (`\p{Emoji_Presentation}` and `\p{Extended_Pictographic}`) for detection — no hardcoded emoji lists. It parses code regions (comments, strings, template literals) for each supported language to classify context accurately, including Python docstrings, Ruby block comments, and nested JS template expressions.

For files over 5 MB, it streams line-by-line instead of loading into memory.

The `clean` command creates a git backup branch (`demoji/backup-<timestamp>`) before writing any changes, and all modifications are reversible via `git checkout`.

## Development

```bash
npm run build     # compile TypeScript
npm test          # build + run test suite
npm run typecheck # type-check without emitting
```

Uses the Node.js built-in test runner (`node:test`) and assertions (`node:assert`). No test framework dependencies.

## License

ISC
