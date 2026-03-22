import * as assert from 'node:assert/strict';
import { test } from 'node:test';

import { replace } from '../dist/lib/replacer.js';

test('replace returns an empty list for the scaffold', () => {
  assert.deepEqual(replace([], { strict: false }), []);
});
