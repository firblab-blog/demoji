import * as assert from 'node:assert/strict';
import { test } from 'node:test';

import { detect } from '../dist/lib/detector.js';

test('detect returns an empty list for the scaffold', () => {
  assert.deepEqual(detect(''), []);
});
