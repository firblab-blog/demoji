# demoji

`demoji` is a TypeScript CLI for scanning repositories for emoji usage and preparing context-aware replacements.

## Development

```bash
npm install
npm run build
npm test
```

## Usage

```bash
demoji scan .
demoji clean . --dry-run
demoji clean . --yes
```

The current scaffold prints a not-implemented message while the detection, scanning, replacement, and reporting tasks are built out.
