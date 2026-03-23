import * as assert from 'node:assert/strict';
import { test } from 'node:test';

import { detect } from '../dist/lib/detector.js';

test('detect returns an empty list when no emoji are present', () => {
  assert.deepEqual(detect('', 'sample.ts'), []);
});

test('detect classifies basic TypeScript contexts', () => {
  assert.equal(detect('const x = 1; // 🚀 launch', 'sample.ts')[0]?.context, 'COMMENT');
  assert.equal(detect("const msg = '🎉 done'", 'sample.ts')[0]?.context, 'STRING_LITERAL');
  assert.equal(detect("console.log('🔥 hot')", 'sample.ts')[0]?.context, 'LOG_STATEMENT');
  assert.equal(detect('const 🚀launch = 1', 'sample.ts')[0]?.context, 'IDENTIFIER');
  assert.equal(detect('// normal comment', 'sample.ts').length, 0);
});

test('detect handles multi-codepoint emoji as single matches', () => {
  const family = detect('// 👨‍👩‍👧‍👦 family', 'sample.ts');
  const wave = detect('// 👋🏽 wave', 'sample.ts');
  const flag = detect('// 🇺🇸 flag', 'sample.ts');
  const keycap = detect('// #️⃣ keycap', 'sample.ts');

  assert.equal(family.length, 1);
  assert.equal(wave.length, 1);
  assert.equal(flag.length, 1);
  assert.equal(keycap.length, 1);
  assert.equal(family[0]?.context, 'COMMENT');
  assert.equal(wave[0]?.context, 'COMMENT');
  assert.equal(flag[0]?.context, 'COMMENT');
  assert.equal(keycap[0]?.context, 'COMMENT');
});

test('detect handles multiple emoji on the same line', () => {
  const matches = detect('// 🚀🔥✨ triple', 'sample.ts');
  assert.equal(matches.length, 3);
  assert.deepEqual(
    matches.map((match) => match.context),
    ['COMMENT', 'COMMENT', 'COMMENT'],
  );
});

test('detect classifies Python contexts', () => {
  assert.equal(detect('# 🐍 python comment', 'sample.py')[0]?.context, 'COMMENT');
  assert.equal(detect("print('🎉')", 'sample.py')[0]?.context, 'LOG_STATEMENT');
  assert.equal(detect("name = '🚀 rocket'", 'sample.py')[0]?.context, 'STRING_LITERAL');
});

test('detect handles template literals, block comments, and escaped quotes', () => {
  assert.equal(detect(String.raw`const msg = 'escaped \'🚀 not in string'`, 'sample.ts')[0]?.context, 'STRING_LITERAL');
  assert.equal(detect('`template ${🚀} literal`', 'sample.ts')[0]?.context, 'OTHER');
  assert.equal(detect('/* multi\nline\n🚀\ncomment */', 'sample.ts')[0]?.context, 'COMMENT');
});

test('detect reports line, column, and codepoints', () => {
  const match = detect('const value = 1;\n// 🚀 launch', 'sample.ts')[0];
  assert.ok(match);
  assert.equal(match.line, 2);
  assert.equal(match.column, 4);
  assert.equal(match.offset, 20);
  assert.deepEqual(match.codepoints, ['U+1F680']);
});
