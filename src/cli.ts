import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline';

import { analyzeFile } from './lib/detector.js';
import { applyToFile, replace, type FileChange } from './lib/replacer.js';
import { generateReport } from './lib/reporter.js';
import { scan } from './lib/scanner.js';
import type { EmojiContext, FileResult, Replacement, ScanResult } from './lib/types.js';

type Command = 'scan' | 'clean' | 'report' | 'help';

interface IdentifierFlag {
  filePath: string;
  line: number;
  snippet: string;
}

interface Analysis {
  result: ScanResult;
  changes: FileChange[];
  identifierFlags: IdentifierFlag[];
  noScannableFiles: boolean;
}

export interface CliOptions {
  command: Command;
  path: string;
  strict: boolean;
  yes: boolean;
  json: boolean;
  verbose: boolean;
  output: string;
  dryRun: boolean;
}

const COMMANDS = new Set<Command>(['scan', 'clean', 'report', 'help']);

export function parseArgs(argv: string[]): CliOptions {
  const args = argv.slice(2);
  const defaults: CliOptions = {
    command: 'help',
    path: '.',
    strict: false,
    yes: false,
    json: false,
    verbose: false,
    output: 'demoji-report.html',
    dryRun: false,
  };

  if (args.length === 0) {
    return defaults;
  }

  const first = args[0];
  if (first === undefined || first === '--help' || first === '-h' || first === 'help') {
    return defaults;
  }

  if (!COMMANDS.has(first as Command) || first === 'help') {
    throw new Error(`Unknown command: ${first}`);
  }

  const options: CliOptions = { ...defaults, command: first as Command };

  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === undefined) {
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      return { ...options, command: 'help' };
    }

    if (arg === '--strict') {
      options.strict = true;
      continue;
    }

    if (arg === '--yes') {
      options.yes = true;
      continue;
    }

    if (arg === '--json') {
      options.json = true;
      continue;
    }

    if (arg === '--verbose') {
      options.verbose = true;
      continue;
    }

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--output') {
      const value = args[index + 1];
      if (value === undefined) {
        throw new Error('Missing value for --output');
      }
      options.output = value;
      index += 1;
      continue;
    }

    if (arg.startsWith('--output=')) {
      options.output = arg.slice('--output='.length);
      continue;
    }

    if (arg === '--path') {
      const value = args[index + 1];
      if (value === undefined) {
        throw new Error('Missing value for --path');
      }
      options.path = value;
      index += 1;
      continue;
    }

    if (arg.startsWith('--path=')) {
      options.path = arg.slice('--path='.length);
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown flag: ${arg}`);
    }

    if (options.path !== '.') {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    options.path = arg;
  }

  return options;
}

export async function run(argv: string[]): Promise<number> {
  const options = parseArgs(argv);

  switch (options.command) {
    case 'help':
      printUsage();
      return 0;
    case 'scan':
      return runScan(options);
    case 'clean':
      return runClean(options);
    case 'report':
      return runReport(options);
  }
}

async function runScan(options: CliOptions): Promise<number> {
  const analysis = await analyzePath(options);
  writeResult(options, analysis.result, analysis.identifierFlags, analysis.noScannableFiles);

  if (options.verbose) {
    printVerboseFiles(analysis.result.files);
  }

  return 0;
}

async function runClean(options: CliOptions): Promise<number> {
  const analysis = await analyzePath(options);
  const actionableChanges = analysis.changes.filter((change) =>
    change.replacements.some((replacement) => isActionable(replacement)),
  );

  writeResult(options, analysis.result, analysis.identifierFlags, analysis.noScannableFiles);

  if (options.verbose) {
    printVerboseFiles(analysis.result.files);
    printDiffs(actionableChanges);
  }

  if (options.dryRun) {
    process.stdout.write('\nDry run only. No files were modified.\n');
    return 0;
  }

  if (actionableChanges.length === 0) {
    process.stdout.write('\nNo file changes were required.\n');
    return 0;
  }

  if (!options.yes) {
    const confirmed = await confirm(`Apply changes to ${actionableChanges.length} file(s)?`);
    if (!confirmed) {
      process.stdout.write('Aborted. No files were modified.\n');
      return 2;
    }
  }

  const backupBranch = createBackupBranch(resolve(options.path));
  for (const change of actionableChanges) {
    await writeFile(change.filePath, change.modifiedContent, 'utf8');
  }

  process.stdout.write(
    `\nApplied changes to ${actionableChanges.length} file(s). Backup branch: ${backupBranch}\n`,
  );
  return 0;
}

async function runReport(options: CliOptions): Promise<number> {
  const analysis = await analyzePath(options);
  const reportPath = resolve(process.cwd(), options.output);
  const html = generateReport(analysis.result);

  await writeFile(reportPath, html, 'utf8');
  process.stdout.write(`${reportPath}\n`);
  return 0;
}

async function analyzePath(options: CliOptions): Promise<Analysis> {
  const root = resolve(options.path);
  const files: FileResult[] = [];
  const changes: FileChange[] = [];
  const identifierFlags: IdentifierFlag[] = [];

  const byContext = createContextCounts();
  const byAction = createActionCounts();

  let totalFiles = 0;
  let filesWithEmoji = 0;
  let totalEmoji = 0;

  for await (const relativePath of scan({ root, verbose: options.verbose })) {
    totalFiles += 1;
    const absolutePath = join(root, relativePath);
    const loadContent = options.command === 'clean';
    const analysis = await analyzeFile(absolutePath, relativePath, {
      verbose: options.verbose,
      loadContent,
    });

    if (analysis === null) {
      totalFiles -= 1;
      continue;
    }

    const matches = analysis.matches;
    const replacements = replace(matches, { strict: options.strict });
    const totalChars = analysis.totalChars;
    const emojiChars = matches.length;
    const emojiDensity = totalChars === 0 ? 0 : emojiChars / totalChars;

    const fileResult: FileResult = {
      filePath: relativePath,
      matches,
      replacements,
      emojiDensity,
      totalChars,
      emojiChars,
    };

    files.push(fileResult);

    for (const match of matches) {
      byContext[match.context] += 1;
      totalEmoji += 1;
    }

    for (const replacement of replacements) {
      byAction[replacement.action] += 1;
      if (replacement.action === 'flag') {
        identifierFlags.push({
          filePath: relativePath,
          line: replacement.match.line,
          snippet: formatSnippet(analysis.content, replacement.match.line, analysis.streamed),
        });
      }
    }

    if (matches.length > 0) {
      filesWithEmoji += 1;
    }

    if (analysis.content !== null && replacements.some((replacement) => isActionable(replacement))) {
      changes.push(applyToFile(absolutePath, analysis.content, replacements));
    }
  }

  const result: ScanResult = {
    summary: {
      totalFiles,
      filesWithEmoji,
      totalEmoji,
      byContext,
      byAction,
    },
    files,
    timestamp: new Date().toISOString(),
    targetPath: options.path,
    strict: options.strict,
  };

  return {
    result,
    changes,
    identifierFlags,
    noScannableFiles: totalFiles === 0,
  };
}

function writeResult(
  options: CliOptions,
  result: ScanResult,
  identifierFlags: IdentifierFlag[],
  noScannableFiles: boolean,
): void {
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (noScannableFiles) {
    process.stdout.write('No scannable files found\n');
    return;
  }

  const label = options.command === 'clean' && options.dryRun ? 'clean --dry-run' : options.command;
  process.stdout.write(`demoji ${label} results for ${result.targetPath}\n\n`);
  process.stdout.write('Summary:\n');
  process.stdout.write(`  Files scanned:     ${padCount(result.summary.totalFiles)}\n`);
  process.stdout.write(`  Files with emoji:  ${padCount(result.summary.filesWithEmoji)}\n`);
  process.stdout.write(`  Total emoji found: ${padCount(result.summary.totalEmoji)}\n\n`);
  process.stdout.write('  By context:\n');
  process.stdout.write(`    COMMENT:        ${padCount(result.summary.byContext.COMMENT)}  (will replace with text)\n`);
  process.stdout.write(
    `    STRING_LITERAL: ${padCount(result.summary.byContext.STRING_LITERAL)}  ${
      result.strict ? '(will replace with text)' : '(will preserve)'
    }\n`,
  );
  process.stdout.write(`    LOG_STATEMENT:  ${padCount(result.summary.byContext.LOG_STATEMENT)}  (will remove)\n`);
  process.stdout.write(`    IDENTIFIER:     ${padCount(result.summary.byContext.IDENTIFIER)}  (flagged for review)\n`);
  process.stdout.write(`    OTHER:          ${padCount(result.summary.byContext.OTHER)}  (will replace with text)\n\n`);
  process.stdout.write('  By action:\n');
  process.stdout.write(`    Replace:  ${padCount(result.summary.byAction.replace)}\n`);
  process.stdout.write(`    Remove:   ${padCount(result.summary.byAction.remove)}\n`);
  process.stdout.write(`    Preserve: ${padCount(result.summary.byAction.preserve)}\n`);
  process.stdout.write(`    Flag:     ${padCount(result.summary.byAction.flag)}\n`);

  const topFiles = [...result.files]
    .filter((file) => file.matches.length > 0)
    .sort((left, right) => right.emojiDensity - left.emojiDensity || right.matches.length - left.matches.length)
    .slice(0, 3);

  if (topFiles.length > 0) {
    process.stdout.write('\nTop files by emoji density:\n');
    for (const file of topFiles) {
      process.stdout.write(
        `  ${file.filePath.padEnd(22)} ${formatPercent(file.emojiDensity)}  (${file.matches.length} emoji)\n`,
      );
    }
  }

  if (identifierFlags.length > 0) {
    process.stdout.write(
      `\n[WARN] ${identifierFlags.length} emoji in identifiers require manual review:\n`,
    );
    for (const flag of identifierFlags) {
      process.stdout.write(`  ${flag.filePath}:${flag.line}:  ${flag.snippet}\n`);
    }
  }
}

function printVerboseFiles(files: FileResult[]): void {
  const interestingFiles = files.filter((file) => file.matches.length > 0);
  if (interestingFiles.length === 0) {
    return;
  }

  process.stdout.write('\nVerbose file details:\n');
  for (const file of interestingFiles) {
    process.stdout.write(
      `  ${file.filePath}: ${file.matches.length} emoji, ${formatPercent(file.emojiDensity)} density\n`,
    );
  }
}

function printDiffs(changes: FileChange[]): void {
  if (changes.length === 0) {
    return;
  }

  process.stdout.write('\nPlanned diffs:\n');
  for (const change of changes) {
    process.stdout.write(`${change.diff}\n`);
  }
}

function createBackupBranch(targetPath: string): string {
  const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: targetPath,
    encoding: 'utf8',
  }).trim();
  const currentRef = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
  const fallbackRef =
    currentRef === 'HEAD'
      ? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
      : currentRef;
  const timestamp = new Date().toISOString().replace(/[:.]/gu, '-');
  const branchName = `demoji/backup-${timestamp}`;

  execFileSync('git', ['checkout', '-b', branchName], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['checkout', fallbackRef], { cwd: repoRoot, stdio: 'ignore' });

  return branchName;
}

async function confirm(message: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolveConfirm) => {
    rl.question(`${message} [y/N] `, (answer) => {
      rl.close();
      resolveConfirm(answer.trim().toLowerCase() === 'y');
    });
  });
}

function createContextCounts(): Record<EmojiContext, number> {
  return {
    COMMENT: 0,
    STRING_LITERAL: 0,
    LOG_STATEMENT: 0,
    IDENTIFIER: 0,
    OTHER: 0,
  };
}

function createActionCounts(): Record<Replacement['action'], number> {
  return {
    replace: 0,
    remove: 0,
    preserve: 0,
    flag: 0,
  };
}

function isActionable(replacement: Replacement): boolean {
  return replacement.action === 'replace' || replacement.action === 'remove';
}

function formatSnippet(content: string | null, lineNumber: number, streamed: boolean): string {
  if (content === null) {
    return streamed ? '[streamed file]' : '';
  }

  const line = content.split(/\r?\n/u)[lineNumber - 1] ?? '';
  return line.trim();
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function padCount(value: number): string {
  return String(value).padStart(4);
}

function printUsage(): void {
  process.stdout.write(
    [
      'Usage:',
      '  demoji scan [path] [--strict] [--json] [--verbose]',
      '  demoji clean [path] [--strict] [--yes] [--json] [--verbose] [--dry-run]',
      '  demoji report [path] [--strict] [--output <file>]',
      '  demoji help',
      '',
      'Flags:',
      '  --path <dir>     Target directory (default: .)',
      '  --strict         Replace emoji in string literals',
      '  --yes            Skip confirmation prompt',
      '  --json           Print machine-readable JSON',
      '  --verbose        Show additional per-file details',
      '  --output <file>  Output path for report command',
      '  --dry-run        Preview clean changes without writing files',
      '  --help, -h       Show this help text',
      '',
    ].join('\n'),
  );
}

export function runCli(args: string[]): Promise<number> {
  return run(['node', 'demoji', ...args]);
}
