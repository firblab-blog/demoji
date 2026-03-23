import * as assert from 'node:assert/strict';
import { test } from 'node:test';

import { applyReplacements, applyToFile, replace } from '../dist/lib/replacer.js';

function createMatch(
  emoji: string,
  context: 'COMMENT' | 'STRING_LITERAL' | 'LOG_STATEMENT' | 'IDENTIFIER' | 'OTHER',
  offset = 0,
) {
  return {
    emoji,
    codepoints: Array.from(emoji, (char) =>
      `U+${char.codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0') ?? '0000'}`,
    ),
    line: 1,
    column: offset + 1,
    offset,
    context,
  };
}

test('replace returns an empty list for no matches', () => {
  assert.deepEqual(replace([], { strict: false }), []);
});

test('COMMENT emoji is replaced with text', () => {
  const [replacement] = applyReplacements([createMatch('✅', 'COMMENT')], { strict: false });
  assert.deepEqual(replacement, {
    match: createMatch('✅', 'COMMENT'),
    replacement: '[OK]',
    action: 'replace',
  });
});

test('LOG_STATEMENT emoji is removed entirely', () => {
  const [replacement] = applyReplacements([createMatch('🔥', 'LOG_STATEMENT')], { strict: false });
  assert.equal(replacement?.action, 'remove');
  assert.equal(replacement?.replacement, '');
});

test('IDENTIFIER emoji is flagged and never auto-replaced', () => {
  const [replacement] = applyReplacements([createMatch('🚀', 'IDENTIFIER')], { strict: false });
  assert.equal(replacement?.action, 'flag');
  assert.equal(replacement?.replacement, '');
});

test('STRING_LITERAL emoji is preserved by default', () => {
  const [replacement] = applyReplacements([createMatch('🎉', 'STRING_LITERAL')], { strict: false });
  assert.equal(replacement?.action, 'preserve');
  assert.equal(replacement?.replacement, '🎉');
});

test('STRING_LITERAL emoji is replaced in strict mode', () => {
  const [replacement] = applyReplacements([createMatch('🎉', 'STRING_LITERAL')], { strict: true });
  assert.equal(replacement?.action, 'replace');
  assert.equal(replacement?.replacement, '[CELEBRATE]');
});

test('OTHER emoji is replaced with text', () => {
  const [replacement] = applyReplacements([createMatch('💡', 'OTHER')], { strict: false });
  assert.equal(replacement?.action, 'replace');
  assert.equal(replacement?.replacement, '[IDEA]');
});

test('unknown emoji falls back to unicode codepoints', () => {
  const [replacement] = applyReplacements([createMatch('🦄', 'COMMENT')], { strict: false });
  assert.equal(replacement?.replacement, '[EMOJI:U+1F984]');
});

test('applyToFile applies multiple replacements to modified content', () => {
  const content = '// ✅ note\nconsole.log("🔥")\nconst word = "🎉";';
  const commentOffset = content.indexOf('✅');
  const logOffset = content.indexOf('🔥');
  const stringOffset = content.indexOf('🎉');
  const replacements = applyReplacements(
    [
      createMatch('✅', 'COMMENT', commentOffset),
      createMatch('🔥', 'LOG_STATEMENT', logOffset),
      createMatch('🎉', 'STRING_LITERAL', stringOffset),
    ],
    { strict: true },
  );
  const change = applyToFile('sample.ts', content, replacements);

  assert.equal(change.modifiedContent, '// [OK] note\nconsole.log("")\nconst word = "[CELEBRATE]";');
});

test('applyToFile diff output shows changed lines', () => {
  const content = '// ✅ note';
  const replacements = applyReplacements([createMatch('✅', 'COMMENT', 3)], { strict: false });
  const change = applyToFile('sample.ts', content, replacements);

  assert.equal(
    change.diff,
    ['--- a/sample.ts', '+++ b/sample.ts', '@@ -1 +1 @@', '-// ✅ note', '+// [OK] note'].join('\n'),
  );
});

test('applyToFile applies replacements in reverse offset order', () => {
  const content = '// ✅🔥✨';
  const firstOffset = content.indexOf('✅');
  const secondOffset = content.indexOf('🔥');
  const thirdOffset = content.indexOf('✨');
  const replacements = applyReplacements(
    [
      createMatch('✅', 'COMMENT', firstOffset),
      createMatch('🔥', 'COMMENT', secondOffset),
      createMatch('✨', 'COMMENT', thirdOffset),
    ],
    { strict: false },
  );

  const change = applyToFile('sample.ts', content, replacements);
  assert.equal(change.modifiedContent, '// [OK][HOT][SPARKLE]');
});

test('new mappings resolve common emoji to readable text', () => {
  const cases: Array<[string, string]> = [
    ['❤️', '[HEART]'],
    ['🙏', '[PRAY]'],
    ['👋', '[WAVE]'],
    ['📖', '[DOCS]'],
    ['🎨', '[ART]'],
    ['⭐', '[STAR]'],
    ['💻', '[COMPUTER]'],
    ['📢', '[ANNOUNCE]'],
    ['🌍', '[GLOBE]'],
    ['👀', '[EYES]'],
    ['👏', '[CLAP]'],
    ['🚨', '[ALERT]'],
    ['🆕', '[NEW]'],
    ['🐞', '[BUG]'],
    ['➕', '[PLUS]'],
    ['⚡', '[ZAP]'],
    ['🤝', '[HANDSHAKE]'],
    ['🔗', '[LINK]'],
  ];

  for (const [emoji, expected] of cases) {
    const [replacement] = applyReplacements([createMatch(emoji, 'COMMENT')], { strict: false });
    assert.equal(replacement?.replacement, expected, `Expected ${emoji} to map to ${expected}`);
  }
});
