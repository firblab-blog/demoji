import * as assert from 'node:assert/strict';
import { test } from 'node:test';

import { generateReport } from '../dist/lib/reporter.js';
import type { FileResult, ScanResult } from '../dist/lib/types.js';

const sampleResult: ScanResult = {
  summary: {
    totalFiles: 3,
    filesWithEmoji: 2,
    totalEmoji: 7,
    byContext: {
      COMMENT: 2,
      STRING_LITERAL: 1,
      LOG_STATEMENT: 2,
      IDENTIFIER: 1,
      OTHER: 1,
    },
    byAction: {
      replace: 4,
      remove: 2,
      preserve: 0,
      flag: 1,
    },
  },
  files: [
    createFileResult('src/<script>.ts', {
      emojiDensity: 0.01,
      emojiChars: 1,
      totalChars: 100,
      matches: [{ emoji: 'x', context: 'COMMENT' }],
      replacements: [{ emoji: 'x', action: 'replace', context: 'COMMENT' }],
    }),
    createFileResult('docs/status&notes.md', {
      emojiDensity: 0.03,
      emojiChars: 3,
      totalChars: 100,
      matches: [
        { emoji: 'x', context: 'STRING_LITERAL' },
        { emoji: 'x', context: 'LOG_STATEMENT' },
        { emoji: 'x', context: 'OTHER' },
      ],
      replacements: [
        { emoji: 'x', action: 'preserve', context: 'STRING_LITERAL' },
        { emoji: 'x', action: 'remove', context: 'LOG_STATEMENT' },
        { emoji: 'x', action: 'replace', context: 'OTHER' },
      ],
    }),
    createFileResult('nested/high.ts', {
      emojiDensity: 0.08,
      emojiChars: 3,
      totalChars: 40,
      matches: [
        { emoji: 'x', context: 'IDENTIFIER' },
        { emoji: 'x', context: 'COMMENT' },
        { emoji: 'x', context: 'LOG_STATEMENT' },
      ],
      replacements: [
        { emoji: 'x', action: 'flag', context: 'IDENTIFIER' },
        { emoji: 'x', action: 'replace', context: 'COMMENT' },
        { emoji: 'x', action: 'remove', context: 'LOG_STATEMENT' },
      ],
    }),
  ],
  timestamp: '2026-03-22T14:30:00.000Z',
  targetPath: 'tests/<fixtures>&demo',
  strict: false,
};

test('generated HTML contains the document shell', () => {
  const html = generateReport(sampleResult);

  assert.match(html, /^<!DOCTYPE html>/u);
  assert.match(html, /<html lang="en">/u);
  assert.match(html, /<head>/u);
  assert.match(html, /<body>/u);
});

test('summary numbers are rendered', () => {
  const html = generateReport(sampleResult);

  assert.match(html, />3<\/p>/u);
  assert.match(html, />2<\/p>/u);
  assert.match(html, />7<\/p>/u);
  assert.match(html, />4\.0%<\/p>/u);
});

test('file table renders one row per file result', () => {
  const html = generateReport(sampleResult);
  const rowCount = html.match(/<tr class="file-row"/gu)?.length ?? 0;

  assert.equal(rowCount, sampleResult.files.length);
});

test('user provided file paths are escaped in the HTML output', () => {
  const html = generateReport(sampleResult);

  assert.match(html, /tests\/&lt;fixtures&gt;&amp;demo/u);
  assert.match(html, /src\/&lt;script&gt;\.ts/u);
  assert.match(html, /docs\/status&amp;notes\.md/u);
  assert.doesNotMatch(html, /<span class="file-path">src\/<script>\.ts<\/span>/u);
});

test('report contains no external resource references', () => {
  const html = generateReport(sampleResult);

  assert.doesNotMatch(html, /<(?:script|link|img)\b[^>]+https?:\/\//iu);
});

test('density thresholds map to the expected CSS classes', () => {
  const html = generateReport(sampleResult);

  assert.match(html, /data-density-class="density-low">[\s\S]*?1\.0%/u);
  assert.match(html, /data-density-class="density-medium">[\s\S]*?3\.0%/u);
  assert.match(html, /data-density-class="density-high">[\s\S]*?8\.0%/u);
});

function createFileResult(
  filePath: string,
  options: {
    emojiDensity: number;
    emojiChars: number;
    totalChars: number;
    matches: Array<{ emoji: string; context: FileResult['matches'][number]['context'] }>;
    replacements: Array<{
      emoji: string;
      action: FileResult['replacements'][number]['action'];
      context: FileResult['replacements'][number]['match']['context'];
    }>;
  },
): FileResult {
  return {
    filePath,
    emojiDensity: options.emojiDensity,
    emojiChars: options.emojiChars,
    totalChars: options.totalChars,
    matches: options.matches.map((match, index) => ({
      emoji: match.emoji,
      codepoints: ['U+0000'],
      line: index + 1,
      column: 1,
      offset: index,
      context: match.context,
    })),
    replacements: options.replacements.map((replacement, index) => ({
      match: {
        emoji: replacement.emoji,
        codepoints: ['U+0000'],
        line: index + 1,
        column: 1,
        offset: index,
        context: replacement.context,
      },
      replacement: replacement.action === 'remove' ? '' : '[TEXT]',
      action: replacement.action,
    })),
  };
}
