# demoji

`demoji` is a TypeScript CLI that scans source repositories for emoji usage, classifies each match by context, and either reports or applies policy-driven replacements.

The tool was built as a Cogit proof of concept. It exercises guidance injection, task orchestration, preflight enforcement, and auditability against a real CLI project.

## What It Does

- `scan` walks a repo, finds emoji in supported text files, and prints a summary.
- `clean` applies context-aware replacements after confirmation or `--yes`.
- `report` generates a standalone HTML report for the scan results.

`demoji` follows the project guidance used during the POC:

- comments become text equivalents such as `[OK]` or `[WARN]`
- log-statement emoji are removed
- string-literal emoji are preserved by default and replaced only with `--strict`
- identifier emoji are flagged for manual review and never auto-replaced

## Installation

This repository is intended to be run locally:

```bash
npm install
npm run build
```

Run the compiled CLI directly:

```bash
node dist/index.js --help
```

If you want a local `demoji` command while developing, you can use `npm link`.

## Usage

```bash
node dist/index.js scan .
node dist/index.js clean . --dry-run
node dist/index.js clean . --yes
node dist/index.js report . --output demoji-report.html
```

Help output:

```text
Usage:
  demoji scan [path] [--strict] [--json] [--verbose]
  demoji clean [path] [--strict] [--yes] [--json] [--verbose] [--dry-run]
  demoji report [path] [--strict] [--output <file>]
  demoji help
```

## Subcommands

### `scan`

Scans the target directory and prints a terminal summary. No files are modified.

Examples:

```bash
node dist/index.js scan .
node dist/index.js scan src --strict --verbose
node dist/index.js scan . --json
```

### `clean`

Scans the target directory, shows the same summary, and writes changes only when the run is confirmed or `--yes` is set. Before modifying files, `demoji` creates a backup branch named `demoji/backup-<timestamp>`.

Examples:

```bash
node dist/index.js clean .
node dist/index.js clean . --yes
node dist/index.js clean . --dry-run --verbose
```

### `report`

Scans the target directory and writes a self-contained HTML report.

Examples:

```bash
node dist/index.js report .
node dist/index.js report . --output /tmp/demoji-report.html
```

## Flags

### `--strict`

Also replaces emoji inside string literals. Without this flag, string-literal emoji are preserved.

### `--yes`

Skips the confirmation prompt for `clean`.

### `--json`

Prints machine-readable JSON instead of the human-readable terminal summary.

### `--dry-run`

Available on `clean`. Shows what would change without writing files.

### `--verbose`

Prints additional per-file detail, and for `clean` it also shows planned diffs.

### `--output <file>`

Available on `report`. Chooses the destination HTML file path. Defaults to `demoji-report.html`.

## Example Output

Example `scan` output against the included `tests/fixtures/emoji-heavy` fixture:

```text
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

## Development

```bash
npm run build
npm test
```

The project uses Node.js built-ins only at runtime, TypeScript in strict mode, and the Node.js test runner for validation.
