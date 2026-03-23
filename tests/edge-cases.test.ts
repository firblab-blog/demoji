import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { LARGE_FILE_THRESHOLD, analyzeFile, detect } from '../dist/lib/detector.js';
import { generateReport } from '../dist/lib/reporter.js';
import { readScannableTextFile, scan } from '../dist/lib/scanner.js';

const rootPrefix = join(tmpdir(), 'demoji-edge-');
const cliPath = join(process.cwd(), 'dist', 'index.js');

let fixtureRoot = '';

function runCli(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync('node', [cliPath, ...args], {
      cwd: fixtureRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    return { stdout, stderr: '', exitCode: 0 };
  } catch (error: unknown) {
    const failure = error as { stdout?: string | Buffer; stderr?: string | Buffer; status?: number };
    return {
      stdout: typeof failure.stdout === 'string' ? failure.stdout : Buffer.from(failure.stdout ?? '').toString('utf8'),
      stderr: typeof failure.stderr === 'string' ? failure.stderr : Buffer.from(failure.stderr ?? '').toString('utf8'),
      exitCode: failure.status ?? 1,
    };
  }
}

async function collectScanResults(root: string, maxDepth?: number, verbose = false): Promise<string[]> {
  const files: string[] = [];

  for await (const file of scan({ root, maxDepth, verbose })) {
    files.push(file);
  }

  return files.sort();
}

before(async () => {
  fixtureRoot = await mkdtemp(rootPrefix);

  await mkdir(join(fixtureRoot, 'empty-dir'), { recursive: true });
  await writeFile(join(fixtureRoot, 'empty.ts'), '', 'utf8');
  await writeFile(join(fixtureRoot, 'bom.ts'), '\uFEFF// 🚀 with bom\n', 'utf8');
  await writeFile(join(fixtureRoot, 'long-line.ts'), `${'a'.repeat(12000)} 🚀 ${'b'.repeat(12000)} ✅\n`, 'utf8');
  await writeFile(join(fixtureRoot, 'all-emoji.ts'), '🚀✅🔥⚠️💡📝🐛✨🔧🚀✅🔥⚠️💡\n', 'utf8');
  await writeFile(join(fixtureRoot, '🚀rocket.ts'), '// normal content\n', 'utf8');
  await writeFile(join(fixtureRoot, 'fake-binary.ts'), Buffer.from([0x00, 0x01, 0x02, 0x89, 0x50]));
  await writeFile(join(fixtureRoot, 'utf16.ts'), Buffer.from([0x80, 0x80, 0x80, 0x80]));

  const largeContent = `// ${'🚀'.repeat(4)} large file\n`.repeat(Math.ceil((LARGE_FILE_THRESHOLD + 1024) / 12));
  await writeFile(join(fixtureRoot, 'large.ts'), largeContent, 'utf8');

  const loopDir = join(fixtureRoot, 'symlink-loop', 'dir');
  await mkdir(loopDir, { recursive: true });
  await writeFile(join(loopDir, 'file.ts'), '// 🚀 rocket\n', 'utf8');
  await symlink('../dir', join(loopDir, 'link'));

  let nestedPath = join(fixtureRoot, 'deep');
  for (let index = 0; index < 55; index += 1) {
    nestedPath = join(nestedPath, `level-${index}`);
    await mkdir(nestedPath, { recursive: true });
  }
  await writeFile(join(nestedPath, 'deep.ts'), '// ✅ nested\n', 'utf8');
});

after(async () => {
  if (fixtureRoot !== '') {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

describe('edge cases', () => {
  it('handles empty directory', () => {
    const result = runCli(['scan', join(fixtureRoot, 'empty-dir')]);

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /No scannable files found/u);
  });

  it('handles empty files', () => {
    assert.deepEqual(detect('', 'empty.ts'), []);
  });

  it('handles large files without excessive memory', async () => {
    const analysis = await analyzeFile(join(fixtureRoot, 'large.ts'), 'large.ts');

    assert.ok(analysis);
    assert.equal(analysis?.streamed, true);
    assert.ok((analysis?.matches.length ?? 0) > 0);
    assert.equal(analysis?.content, null);
  });

  it('strips UTF-8 BOM', async () => {
    const analysis = await analyzeFile(join(fixtureRoot, 'bom.ts'), 'bom.ts', { loadContent: true });

    assert.ok(analysis);
    assert.equal(analysis?.content?.startsWith('\uFEFF'), false);
    assert.equal(analysis?.matches.length, 1);
  });

  it('skips non-UTF-8 files gracefully', async () => {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (message?: unknown) => {
      warnings.push(String(message ?? ''));
    };

    const content = await readScannableTextFile(join(fixtureRoot, 'utf16.ts'), 'utf16.ts', true);
    console.warn = originalWarn;

    assert.equal(content, null);
    assert.match(warnings.join('\n'), /Skipping utf16\.ts: encoding error/u);
  });

  it('handles extremely long lines', async () => {
    const analysis = await analyzeFile(join(fixtureRoot, 'long-line.ts'), 'long-line.ts', { loadContent: true });

    assert.ok(analysis);
    assert.equal(analysis?.matches.length, 2);
    assert.deepEqual(
      analysis?.matches.map((match) => match.emoji),
      ['🚀', '✅'],
    );
  });

  it('respects max depth', async () => {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (message?: unknown) => {
      warnings.push(String(message ?? ''));
    };

    const files = await collectScanResults(join(fixtureRoot, 'deep'), 50, true);
    console.warn = originalWarn;

    assert.deepEqual(files, []);
    assert.match(warnings.join('\n'), /Max depth \(50\) reached/u);
  });

  it('survives symlink loops', async () => {
    const files = await collectScanResults(join(fixtureRoot, 'symlink-loop'));

    assert.deepEqual(files, ['dir/file.ts']);
  });

  it('handles emoji in filenames', async () => {
    const files = await collectScanResults(fixtureRoot);
    const html = generateReport({
      summary: {
        totalFiles: 1,
        filesWithEmoji: 0,
        totalEmoji: 0,
        byContext: { COMMENT: 0, STRING_LITERAL: 0, LOG_STATEMENT: 0, IDENTIFIER: 0, OTHER: 0 },
        byAction: { replace: 0, remove: 0, preserve: 0, flag: 0 },
      },
      files: [
        {
          filePath: '🚀rocket.ts',
          matches: [],
          replacements: [],
          emojiDensity: 0,
          totalChars: 14,
          emojiChars: 0,
        },
      ],
      timestamp: new Date().toISOString(),
      targetPath: fixtureRoot,
      strict: false,
    });

    assert.ok(files.includes('🚀rocket.ts'));
    assert.match(html, /🚀rocket\.ts/u);
  });

  it('detects binary files with supported extensions', async () => {
    const files = await collectScanResults(fixtureRoot);

    assert.ok(!files.includes('fake-binary.ts'));
  });

  it('handles file with 100% emoji content', async () => {
    const analysis = await analyzeFile(join(fixtureRoot, 'all-emoji.ts'), 'all-emoji.ts', { loadContent: true });

    assert.ok(analysis);
    assert.equal(analysis?.matches.length, 14);
    assert.equal(
      Array.from(analysis?.content?.trim() ?? '').filter((char) => !/\s/u.test(char)).length,
      analysis?.totalChars,
    );
  });
});
