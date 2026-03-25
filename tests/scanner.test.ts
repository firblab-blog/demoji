import * as assert from 'node:assert/strict';
import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

import { scan } from '../dist/lib/scanner.js';

const fixtureRoot = join(process.cwd(), 'tests', 'fixtures', 'scan-test');
const symlinkPath = join(fixtureRoot, 'nested', 'loop');

before(async () => {
  try {
    await symlink('..', symlinkPath, 'dir');
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') {
      throw error;
    }
  }

});

after(async () => {
  await rm(symlinkPath, { force: true });
});

test('scan yields supported text files as relative paths', async () => {
  const files = await collectScanResults();

  assert.deepEqual(files, ['clean.py', 'clean.ts', 'nested/deep.ts']);
});

test('scan respects root and nested ignore files', async () => {
  const files = await collectScanResults();

  assert.ok(!files.includes('ignored-dir/hidden.ts'));
  assert.ok(!files.includes('debug.log'));
  assert.ok(!files.includes('nested/local-skip/skip.ts'));
});

test('scan applies the built-in skip list and supported extensions', async () => {
  const files = await collectScanResults();

  assert.ok(!files.includes('node_modules/dep.js'));
  assert.ok(!files.includes('readme.txt'));
});

test('scan skips binary files even when they match supported extensions', async () => {
  await writeFile(join(fixtureRoot, 'binary.ts'), Buffer.from([0x23, 0x00, 0x21]));

  try {
    const files = await collectScanResults();
    assert.ok(!files.includes('binary.ts'));
  } finally {
    await rm(join(fixtureRoot, 'binary.ts'), { force: true });
  }
});

test('scan does not loop forever on symlink cycles', async () => {
  const files = await collectScanResults();

  assert.equal(files.filter((file) => file === 'nested/deep.ts').length, 1);
});

test('scan handles filenames with backslashes on non-Windows platforms', async () => {
  if (process.platform === 'win32') {
    return;
  }

  const tmpDir = join(fixtureRoot, 'backslash-test');
  const backslashFile = join(tmpDir, 'sub\\file.json');

  await mkdir(tmpDir, { recursive: true });
  await writeFile(backslashFile, '{"emoji": "🚀"}');

  try {
    const files: string[] = [];
    for await (const file of scan({ root: tmpDir })) {
      files.push(file);
    }

    assert.equal(files.length, 1);
    assert.ok(files[0]?.includes('\\'), 'filename should preserve the literal backslash');
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

async function collectScanResults(): Promise<string[]> {
  const files: string[] = [];

  for await (const file of scan({ root: fixtureRoot })) {
    files.push(file);
  }

  return files.sort();
}
