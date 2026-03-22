import * as assert from 'node:assert/strict';
import { test } from 'node:test';

import { scan } from '../dist/lib/scanner.js';

test('scan yields no files for the scaffold', async () => {
  const files: string[] = [];

  for await (const file of scan('.')) {
    files.push(file);
  }

  assert.deepEqual(files, []);
});
