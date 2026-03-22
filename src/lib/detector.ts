import * as path from 'node:path';

import type { EmojiContext, EmojiMatch } from './types.js';

type Language =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'ruby'
  | 'go'
  | 'rust'
  | 'java'
  | 'kotlin'
  | 'swift'
  | 'c'
  | 'cpp'
  | 'csharp'
  | 'markdown'
  | 'yaml'
  | 'json'
  | 'toml'
  | 'unknown';

interface CodeRegion {
  start: number;
  end: number;
  type: 'comment' | 'string';
}

const EMOJI_SEQUENCE_REGEX =
  /(?:\p{Regional_Indicator}{2}|(?:\p{Emoji_Presentation}|\p{Extended_Pictographic})(?:\uFE0F)?(?:\p{Emoji_Modifier})?)(?:\u200D(?:\p{Regional_Indicator}{2}|(?:\p{Emoji_Presentation}|\p{Extended_Pictographic})(?:\uFE0F)?(?:\p{Emoji_Modifier})?))*/gu;

const C_STYLE_LANGUAGES = new Set<Language>([
  'typescript',
  'javascript',
  'go',
  'rust',
  'java',
  'kotlin',
  'swift',
  'c',
  'cpp',
  'csharp',
]);

const HASH_COMMENT_LANGUAGES = new Set<Language>(['python', 'yaml', 'toml', 'ruby']);

const LOG_PATTERNS = [
  /^console\.(?:log|warn|error|info|debug)$/,
  /^print$/,
  /^logging\.(?:debug|info|warn|warning|error|critical)$/,
  /^(?:log|logger)\.(?:debug|info|warn|warning|error|fatal|trace)$/,
  /^(?:log|fmt)\.(?:print|printf|println)$/,
];

export function detect(content: string, filePath = ''): EmojiMatch[] {
  const language = detectLanguage(filePath);
  const regions = mapCodeRegions(content, language);
  const lineStarts = buildLineStarts(content);
  const matches: EmojiMatch[] = [];

  for (const match of content.matchAll(EMOJI_SEQUENCE_REGEX)) {
    const emoji = match[0];
    const offset = match.index;

    if (offset === undefined) {
      continue;
    }

    const { line, column } = getLineColumn(offset, lineStarts);
    matches.push({
      emoji,
      codepoints: Array.from(emoji, (char) =>
        `U+${char.codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0') ?? '0000'}`,
      ),
      line,
      column,
      offset,
      context: classifyEmoji(offset, emoji.length, regions, content, language),
    });
  }

  return matches;
}

export function detectLanguage(filePath: string): Language {
  const ext = path.extname(filePath).toLowerCase();
  const langMap: Record<string, Language> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.py': 'python',
    '.rb': 'ruby',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.kt': 'kotlin',
    '.swift': 'swift',
    '.c': 'c',
    '.cpp': 'cpp',
    '.h': 'c',
    '.cs': 'csharp',
    '.md': 'markdown',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.json': 'json',
    '.toml': 'toml',
  };

  return langMap[ext] ?? 'unknown';
}

function mapCodeRegions(content: string, language: Language): CodeRegion[] {
  if (language === 'markdown') {
    return [];
  }

  if (language === 'json') {
    return mapJsonStrings(content);
  }

  const regions: CodeRegion[] = [];
  let index = 0;

  while (index < content.length) {
    const char = content[index];
    const next = content[index + 1] ?? '';

    if (C_STYLE_LANGUAGES.has(language)) {
      if (char === '/' && next === '/') {
        const end = findLineEnd(content, index + 2);
        regions.push({ start: index, end, type: 'comment' });
        index = end;
        continue;
      }

      if (char === '/' && next === '*') {
        const end = findBlockCommentEnd(content, index + 2, '*/');
        regions.push({ start: index, end, type: 'comment' });
        index = end;
        continue;
      }

      if (char === '"' || char === '\'') {
        const end = scanQuotedString(content, index, char);
        regions.push({ start: index, end, type: 'string' });
        index = end;
        continue;
      }

      if ((language === 'typescript' || language === 'javascript') && char === '`') {
        const template = scanTemplateLiteral(content, index);
        regions.push(...template);
        const lastRegion = template.at(-1);
        index = lastRegion?.end ?? index + 1;
        continue;
      }
    }

    if (HASH_COMMENT_LANGUAGES.has(language)) {
      if (language === 'ruby' && atRubyBlockCommentStart(content, index)) {
        const end = findRubyBlockCommentEnd(content, index);
        regions.push({ start: index, end, type: 'comment' });
        index = end;
        continue;
      }

      if (char === '#') {
        const end = findLineEnd(content, index + 1);
        regions.push({ start: index, end, type: 'comment' });
        index = end;
        continue;
      }

      if (char === '"' || char === '\'') {
        const end = scanQuotedString(content, index, char);
        regions.push({ start: index, end, type: 'string' });
        index = end;
        continue;
      }

      if (language === 'python' && (content.startsWith('"""', index) || content.startsWith('\'\'\'', index))) {
        const delimiter = content.slice(index, index + 3);
        const end = scanTripleQuotedString(content, index, delimiter);
        regions.push({
          start: index,
          end,
          type: isPythonDocstring(content, index) ? 'comment' : 'string',
        });
        index = end;
        continue;
      }
    }

    index += 1;
  }

  return mergeRegions(regions);
}

function classifyEmoji(
  offset: number,
  length: number,
  regions: CodeRegion[],
  content: string,
  language: Language,
): EmojiContext {
  if (language === 'markdown') {
    return 'OTHER';
  }

  const region = findContainingRegion(offset, regions);
  if (region?.type === 'comment') {
    return 'COMMENT';
  }

  if (region?.type === 'string') {
    return isLogStatement(content, region.start, language) ? 'LOG_STATEMENT' : 'STRING_LITERAL';
  }

  return isIdentifierEmoji(content, offset, length) ? 'IDENTIFIER' : 'OTHER';
}

function buildLineStarts(content: string): number[] {
  const starts = [0];
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === '\n') {
      starts.push(index + 1);
    }
  }
  return starts;
}

function getLineColumn(offset: number, lineStarts: number[]): { line: number; column: number } {
  let low = 0;
  let high = lineStarts.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const lineStart = lineStarts[mid] ?? 0;
    const nextLineStart = lineStarts[mid + 1] ?? Number.POSITIVE_INFINITY;

    if (offset < lineStart) {
      high = mid - 1;
      continue;
    }

    if (offset >= nextLineStart) {
      low = mid + 1;
      continue;
    }

    return { line: mid + 1, column: offset - lineStart + 1 };
  }

  return { line: 1, column: offset + 1 };
}

function mapJsonStrings(content: string): CodeRegion[] {
  const regions: CodeRegion[] = [];
  let index = 0;

  while (index < content.length) {
    if (content[index] !== '"') {
      index += 1;
      continue;
    }

    const end = scanQuotedString(content, index, '"');
    regions.push({ start: index, end, type: 'string' });
    index = end;
  }

  return regions;
}

function scanQuotedString(content: string, start: number, quote: string): number {
  let index = start + 1;

  while (index < content.length) {
    const char = content[index];
    if (char === '\\') {
      index += 2;
      continue;
    }

    if (char === quote) {
      return index + 1;
    }

    index += 1;
  }

  return content.length;
}

function scanTripleQuotedString(content: string, start: number, delimiter: string): number {
  let index = start + delimiter.length;

  while (index < content.length) {
    if (content.startsWith(delimiter, index)) {
      return index + delimiter.length;
    }

    if (content[index] === '\\') {
      index += 2;
      continue;
    }

    index += 1;
  }

  return content.length;
}

function scanTemplateLiteral(content: string, start: number): CodeRegion[] {
  const regions: CodeRegion[] = [];
  let index = start + 1;
  let segmentStart = start;

  while (index < content.length) {
    const char = content[index];

    if (char === '\\') {
      index += 2;
      continue;
    }

    if (char === '$' && content[index + 1] === '{') {
      if (segmentStart < index) {
        regions.push({ start: segmentStart, end: index, type: 'string' });
      }

      const expressionEnd = scanTemplateExpression(content, index + 2);
      segmentStart = expressionEnd;
      index = expressionEnd;
      continue;
    }

    if (char === '`') {
      regions.push({ start: segmentStart, end: index + 1, type: 'string' });
      return regions;
    }

    index += 1;
  }

  regions.push({ start: segmentStart, end: content.length, type: 'string' });
  return regions;
}

function scanTemplateExpression(content: string, start: number): number {
  let depth = 1;
  let index = start;

  while (index < content.length) {
    const char = content[index];
    const next = content[index + 1] ?? '';

    if (char === '"' || char === '\'') {
      index = scanQuotedString(content, index, char);
      continue;
    }

    if (char === '`') {
      const nested = scanTemplateLiteral(content, index);
      const lastRegion = nested.at(-1);
      index = lastRegion?.end ?? index + 1;
      continue;
    }

    if (char === '/' && next === '/') {
      index = findLineEnd(content, index + 2);
      continue;
    }

    if (char === '/' && next === '*') {
      index = findBlockCommentEnd(content, index + 2, '*/');
      continue;
    }

    if (char === '{') {
      depth += 1;
      index += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      index += 1;
      if (depth === 0) {
        return index;
      }
      continue;
    }

    index += 1;
  }

  return content.length;
}

function findLineEnd(content: string, start: number): number {
  const end = content.indexOf('\n', start);
  return end === -1 ? content.length : end;
}

function findBlockCommentEnd(content: string, start: number, delimiter: string): number {
  const end = content.indexOf(delimiter, start);
  return end === -1 ? content.length : end + delimiter.length;
}

function atRubyBlockCommentStart(content: string, index: number): boolean {
  return (index === 0 || content[index - 1] === '\n') && content.startsWith('=begin', index);
}

function findRubyBlockCommentEnd(content: string, start: number): number {
  const endMarker = '\n=end';
  const end = content.indexOf(endMarker, start + 6);
  if (end === -1) {
    return content.length;
  }

  return findLineEnd(content, end + endMarker.length);
}

function isPythonDocstring(content: string, start: number): boolean {
  const lineStart = content.lastIndexOf('\n', start - 1) + 1;
  if (content.slice(lineStart, start).trim() !== '') {
    return false;
  }

  const prefix = content.slice(0, start).trimEnd();
  if (prefix === '') {
    return true;
  }

  const previous = prefix[prefix.length - 1];
  return previous === '\n' || previous === ':' || previous === '(';
}

function mergeRegions(regions: CodeRegion[]): CodeRegion[] {
  if (regions.length < 2) {
    return regions;
  }

  const sorted = [...regions].sort((left, right) => left.start - right.start);
  const first = sorted[0];
  if (first === undefined) {
    return [];
  }

  const merged: CodeRegion[] = [first];

  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    const previous = merged[merged.length - 1];

    if (current === undefined || previous === undefined) {
      continue;
    }

    if (current.type === previous.type && current.start <= previous.end) {
      previous.end = Math.max(previous.end, current.end);
      continue;
    }

    merged.push(current);
  }

  return merged;
}

function findContainingRegion(offset: number, regions: CodeRegion[]): CodeRegion | undefined {
  for (const region of regions) {
    if (offset < region.start) {
      return undefined;
    }

    if (offset >= region.start && offset < region.end) {
      return region;
    }
  }

  return undefined;
}

function isLogStatement(content: string, regionStart: number, language: Language): boolean {
  const call = findEnclosingCall(content, regionStart);
  if (call === '') {
    return false;
  }

  if (language === 'unknown' || language === 'markdown') {
    return false;
  }

  return LOG_PATTERNS.some((pattern) => pattern.test(call));
}

function findEnclosingCall(content: string, regionStart: number): string {
  let index = regionStart - 1;

  while (index >= 0 && /\s/.test(content[index] ?? '')) {
    index -= 1;
  }

  if (content[index] !== '(') {
    return '';
  }

  index -= 1;
  while (index >= 0 && /\s/.test(content[index] ?? '')) {
    index -= 1;
  }

  let end = index + 1;
  while (index >= 0 && /[\w$.]/u.test(content[index] ?? '')) {
    index -= 1;
  }

  return content.slice(index + 1, end);
}

function isIdentifierEmoji(content: string, offset: number, length: number): boolean {
  const before = content[offset - 1] ?? '';
  const after = content[offset + length] ?? '';

  if (/[\p{L}\p{N}_$]/u.test(before) || /[\p{L}\p{N}_$]/u.test(after)) {
    return true;
  }

  const lineStart = content.lastIndexOf('\n', offset - 1) + 1;
  const prefix = content.slice(lineStart, offset);
  return /\b(?:const|let|var|function|class|def)\s*$/u.test(prefix);
}
