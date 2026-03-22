import * as assert from 'node:assert/strict';
import { test } from 'node:test';

import { generateReport } from '../dist/lib/reporter.js';

test('generateReport summarizes result sets', () => {
  assert.equal(generateReport([]), 'Scanned 0 result set(s).');
});
