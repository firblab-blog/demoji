import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const DEMOJI = join(ROOT, 'dist', 'index.js');
const FIXTURES = join(ROOT, 'tests', 'fixtures');
const REPORT_PATH = join(tmpdir(), 'demoji-integration-report.html');

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface ScanJsonResult {
  summary: {
    totalFiles: number;
    filesWithEmoji: number;
    totalEmoji: number;
    byContext: Record<string, number>;
    byAction: Record<string, number>;
  };
  files: Array<{
    filePath: string;
    matches: Array<{ emoji: string; context: string }>;
    replacements: Array<{ action: string; replacement: string; match: { context: string } }>;
  }>;
}

function run(args: string[]): CommandResult {
  try {
    const stdout = execFileSync('node', [DEMOJI, ...args], {
      cwd: FIXTURES,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (error: unknown) {
    const failure = error as {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      status?: number;
    };

    return {
      stdout: bufferToString(failure.stdout),
      stderr: bufferToString(failure.stderr),
      exitCode: failure.status ?? 1,
    };
  }
}

function bufferToString(value: string | Buffer | undefined): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof Buffer) {
    return value.toString('utf8');
  }

  return '';
}

function readFixture(relativePath: string): string {
  return readFileSync(join(FIXTURES, relativePath), 'utf8');
}

function runJsonScan(path: string, extraArgs: string[] = []): ScanJsonResult {
  const result = run(['scan', path, '--json', ...extraArgs]);
  assert.equal(result.exitCode, 0, result.stderr);
  return JSON.parse(result.stdout) as ScanJsonResult;
}

describe('scan command', () => {
  it('reports zero emoji for the clean repo', () => {
    const result = run(['scan', 'clean-repo/']);

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Files scanned:\s+3/u);
    assert.match(result.stdout, /Files with emoji:\s+0/u);
    assert.match(result.stdout, /Total emoji found:\s+0/u);
  });

  it('reports the expected total count for the emoji-heavy fixture', () => {
    const result = run(['scan', 'emoji-heavy/']);

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Files scanned:\s+5/u);
    assert.match(result.stdout, /Files with emoji:\s+5/u);
    assert.match(result.stdout, /Total emoji found:\s+20/u);
  });

  it('emits valid JSON for scan output', () => {
    const result = run(['scan', 'emoji-heavy/', '--json']);

    assert.equal(result.exitCode, 0, result.stderr);
    const parsed = JSON.parse(result.stdout) as ScanJsonResult;
    assert.equal(parsed.summary.totalFiles, 5);
    assert.equal(parsed.summary.totalEmoji, 20);
    assert.equal(parsed.files.length, 5);
  });

  it('treats string literal emoji as replaceable in strict mode', () => {
    const parsed = runJsonScan('emoji-heavy/', ['--strict']);

    assert.equal(parsed.summary.byAction.replace, 12);
    assert.equal(parsed.summary.byAction.preserve, 0);
  });

  it('detects emoji across mixed-language source files', () => {
    const parsed = runJsonScan('mixed-languages/');

    assert.equal(parsed.summary.totalFiles, 4);
    assert.equal(parsed.summary.filesWithEmoji, 4);
    assert.equal(parsed.summary.totalEmoji, 13);
  });

  it('handles edge-case fixtures without crashing', () => {
    const parsed = runJsonScan('edge-cases/');

    assert.equal(parsed.summary.totalFiles, 5);
    assert.equal(parsed.summary.totalEmoji, 124);
  });

  it('respects gitignore patterns when scanning', () => {
    const parsed = runJsonScan('gitignore-test/');

    assert.equal(parsed.summary.totalFiles, 1);
    assert.equal(parsed.summary.filesWithEmoji, 1);
    assert.equal(parsed.summary.totalEmoji, 1);
    assert.deepEqual(parsed.files.map((file) => file.filePath), ['scan-me.ts']);
  });
});

describe('context classification', () => {
  const parsed = runJsonScan('emoji-heavy/');
  const byFile = new Map(parsed.files.map((file) => [file.filePath, file]));

  it('classifies comments.ts emoji as COMMENT', () => {
    const file = byFile.get('comments.ts');

    assert.ok(file);
    assert.equal(file.matches.length, 7);
    assert.ok(file.matches.every((match) => match.context === 'COMMENT'));
  });

  it('classifies strings.ts emoji as STRING_LITERAL', () => {
    const file = byFile.get('strings.ts');

    assert.ok(file);
    assert.equal(file.matches.length, 3);
    assert.ok(file.matches.every((match) => match.context === 'STRING_LITERAL'));
  });

  it('classifies logs.ts emoji as LOG_STATEMENT', () => {
    const file = byFile.get('logs.ts');

    assert.ok(file);
    assert.equal(file.matches.length, 3);
    assert.ok(file.matches.every((match) => match.context === 'LOG_STATEMENT'));
  });

  it('classifies identifiers.ts emoji as IDENTIFIER', () => {
    const file = byFile.get('identifiers.ts');

    assert.ok(file);
    assert.equal(file.matches.length, 3);
    assert.ok(file.matches.every((match) => match.context === 'IDENTIFIER'));
  });

  it('classifies mixed.ts emoji across multiple contexts', () => {
    const file = byFile.get('mixed.ts');

    assert.ok(file);
    assert.deepEqual(
      file.matches.map((match) => match.context),
      ['COMMENT', 'STRING_LITERAL', 'LOG_STATEMENT', 'IDENTIFIER'],
    );
  });
});

describe('clean command --dry-run', () => {
  it('shows changes without modifying fixture files', () => {
    const before = readFixture('emoji-heavy/comments.ts');
    const result = run(['clean', 'emoji-heavy/', '--dry-run', '--verbose']);
    const after = readFixture('emoji-heavy/comments.ts');

    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(after, before);
    assert.match(result.stdout, /Dry run only\. No files were modified\./u);
    assert.match(result.stdout, /\[LAUNCH\]/u);
    assert.match(result.stdout, /\[OK\]/u);
    assert.match(result.stdout, /console\.log\(" deployed"\)/u);
    assert.match(result.stdout, /\[WARN\] 4 emoji in identifiers require manual review/u);
  });
});

describe('report command', () => {
  it('creates a self-contained HTML report', () => {
    rmSync(REPORT_PATH, { force: true });

    const result = run(['report', 'emoji-heavy/', '--output', REPORT_PATH]);

    assert.equal(result.exitCode, 0, result.stderr);
    assert.ok(existsSync(REPORT_PATH));

    const html = readFileSync(REPORT_PATH, 'utf8');
    assert.match(html, /^<!DOCTYPE html>/u);
    assert.match(html, /<html lang="en">/u);
    assert.match(html, /Total files scanned/u);
    assert.match(html, />5</u);
    assert.doesNotMatch(html, /<(?:script|link|img)\b[^>]+https?:\/\//iu);
    assert.ok(Buffer.byteLength(html, 'utf8') < 1024 * 1024);
  });
});

describe('edge cases', () => {
  const parsed = runJsonScan('edge-cases/');
  const byFile = new Map(parsed.files.map((file) => [file.filePath, file]));

  it('handles the empty file and all-emoji file', () => {
    assert.ok(byFile.has('empty.ts'));
    assert.equal(byFile.get('empty.ts')?.matches.length, 0);
    assert.equal(byFile.get('all-emoji.ts')?.matches.length, 15);
  });

  it('skips the binary fixture and scans the deep file', () => {
    assert.ok(!byFile.has('binary.dat'));
    assert.ok(byFile.has('deeply-nested/a/b/c/d/e/f/g/h/i/j/deep.ts'));
  });

  it('treats ZWJ and flag sequences as single emoji matches', () => {
    const unicodeFile = byFile.get('unicode-edge.ts');

    assert.ok(unicodeFile);
    assert.equal(unicodeFile.matches.length, 8);
  });
});

describe('exit codes', () => {
  it('returns zero for successful scans and help', () => {
    assert.equal(run(['scan', 'clean-repo/']).exitCode, 0);
    assert.equal(run(['scan', 'emoji-heavy/']).exitCode, 0);
    assert.equal(run(['help']).exitCode, 0);
  });

  it('returns one for a nonexistent path', () => {
    const result = run(['scan', '/nonexistent/path']);

    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /Fatal error/u);
  });
});
