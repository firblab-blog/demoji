import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import * as path from 'node:path';

import type { EmojiContext, EmojiMatch } from './types.js';
import { isEncodingError, readScannableTextFile, stripBom } from './scanner.js';

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

export interface FileDetectionResult {
  content: string | null;
  matches: EmojiMatch[];
  totalChars: number;
  streamed: boolean;
}

export interface AnalyzeFileOptions {
  verbose?: boolean;
  loadContent?: boolean;
}

export const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024;

const EMOJI_ATOM =
  String.raw`(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|(?:\p{Emoji_Presentation}|\p{Extended_Pictographic})(?:\uFE0F)?(?:\p{Emoji_Modifier})?)`;

const EMOJI_SEQUENCE_REGEX = new RegExp(String.raw`${EMOJI_ATOM}(?:\u200D${EMOJI_ATOM})*`, 'gu');

/**
 * Characters that match \p{Extended_Pictographic} but are standard text symbols,
 * not emoji. These are excluded from detection unless they carry an explicit
 * emoji variation selector (U+FE0F).
 */
const TEXT_PRESENTATION_EXCLUSIONS = new Set([
  0x00a9, // © Copyright
  0x00ae, // ® Registered
  0x2122, // ™ Trademark
]);

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
  if (content === '') {
    return [];
  }

  return analyzeContent(content, filePath).matches;
}

export async function analyzeFile(
  filePath: string,
  displayPath = filePath,
  options: AnalyzeFileOptions = {},
): Promise<FileDetectionResult | null> {
  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      if (options.verbose) {
        console.warn(`Skipping ${displayPath}: file not found`);
      }
      return null;
    }
    throw error;
  }
  const loadContent = options.loadContent ?? false;

  if (fileStat.size > LARGE_FILE_THRESHOLD && !loadContent) {
    return detectLargeFile(filePath, displayPath, options.verbose ?? false);
  }

  const content = await readScannableTextFile(filePath, displayPath, options.verbose ?? false);
  if (content === null) {
    return null;
  }

  const analysis = analyzeContent(content, displayPath);
  return {
    content: loadContent ? content : null,
    matches: analysis.matches,
    totalChars: analysis.totalChars,
    streamed: false,
  };
}

function analyzeContent(content: string, filePath = ''): { matches: EmojiMatch[]; totalChars: number } {
  if (content === '') {
    return { matches: [], totalChars: 0 };
  }

  const language = detectLanguage(filePath);
  const regions = mapCodeRegions(content, language);
  const lineStarts = buildLineStarts(content);
  const matches: EmojiMatch[] = [];
  let totalChars = 0;

  for (const char of content) {
    if (!/\s/u.test(char)) {
      totalChars += 1;
    }
  }

  for (const match of content.matchAll(EMOJI_SEQUENCE_REGEX)) {
    const emoji = match[0];
    const offset = match.index;

    if (offset === undefined) {
      continue;
    }

    if (isTextPresentationOnly(emoji)) {
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

  return { matches, totalChars };
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

  if (C_STYLE_LANGUAGES.has(language)) {
    return mergeRegions(mapCStyleRegions(content, language));
  }

  if (HASH_COMMENT_LANGUAGES.has(language)) {
    return mergeRegions(mapHashCommentRegions(content, language));
  }

  return [];
}

function mapCStyleRegions(content: string, language: Language): CodeRegion[] {
  const regions: CodeRegion[] = [];
  let index = 0;

  while (index < content.length) {
    const char = content[index];
    const next = content[index + 1] ?? '';

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

    index += 1;
  }

  return regions;
}

function mapHashCommentRegions(content: string, language: Language): CodeRegion[] {
  const regions: CodeRegion[] = [];
  let index = 0;

  while (index < content.length) {
    const char = content[index];

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

    index += 1;
  }

  return regions;
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

function processStreamLine(
  rawLine: string,
  displayPath: string,
  lineNumber: number,
  offset: number,
): { matches: EmojiMatch[]; totalChars: number } {
  const analysis = analyzeContent(rawLine, displayPath);
  const matches = analysis.matches.map((match) => ({
    ...match,
    line: match.line + lineNumber - 1,
    offset: match.offset + offset,
  }));
  return { matches, totalChars: analysis.totalChars };
}

/**
 * Handle errors from the streaming file reader.
 * Encoding errors (invalid UTF-8) are expected for binary files that slipped
 * through the extension filter — return null to skip them gracefully.
 * All other errors are re-thrown.
 */
function handleStreamError(
  error: unknown,
  displayPath: string,
  verbose: boolean,
): null {
  if (isEncodingError(error)) {
    if (verbose) {
      console.warn(`Skipping ${displayPath}: encoding error`);
    }
    return null;
  }
  throw error;
}

async function detectLargeFile(
  filePath: string,
  displayPath: string,
  verbose: boolean,
): Promise<FileDetectionResult | null> {
  const stream = createReadStream(filePath);
  const decoder = new TextDecoder('utf-8', { fatal: true });

  const matches: EmojiMatch[] = [];
  let lineNumber = 0;
  let offset = 0;
  let totalChars = 0;
  let pending = '';

  try {
    for await (const chunk of stream) {
      pending += decoder.decode(chunk, { stream: true });

      if (lineNumber === 0) {
        pending = stripBom(pending);
      }

      let newlineIndex = pending.indexOf('\n');
      while (newlineIndex !== -1) {
        let rawLine = pending.slice(0, newlineIndex);
        pending = pending.slice(newlineIndex + 1);

        if (rawLine.endsWith('\r')) {
          rawLine = rawLine.slice(0, -1);
          offset += 1;
        }

        lineNumber += 1;
        const result = processStreamLine(rawLine, displayPath, lineNumber, offset);
        totalChars += result.totalChars;
        matches.push(...result.matches);

        offset += rawLine.length + 1;
        newlineIndex = pending.indexOf('\n');
      }
    }

    pending += decoder.decode();
    if (lineNumber === 0) {
      pending = stripBom(pending);
    }

    if (pending.length > 0) {
      lineNumber += 1;
      const result = processStreamLine(pending, displayPath, lineNumber, offset);
      totalChars += result.totalChars;
      matches.push(...result.matches);
    }
  } catch (error) {
    return handleStreamError(error, displayPath, verbose);
  }

  return {
    content: null,
    matches,
    totalChars,
    streamed: true,
  };
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

function advanceTemplateExpression(
  content: string,
  index: number,
  depth: { value: number },
): number | null {
  const char = content[index];
  const next = content[index + 1] ?? '';

  if (char === '"' || char === '\'') {
    return scanQuotedString(content, index, char);
  }

  if (char === '`') {
    const nested = scanTemplateLiteral(content, index);
    return nested.at(-1)?.end ?? index + 1;
  }

  if (char === '/' && next === '/') {
    return findLineEnd(content, index + 2);
  }

  if (char === '/' && next === '*') {
    return findBlockCommentEnd(content, index + 2, '*/');
  }

  if (char === '{') {
    depth.value += 1;
    return index + 1;
  }

  if (char === '}') {
    depth.value -= 1;
    return depth.value === 0 ? null : index + 1;
  }

  return index + 1;
}

function scanTemplateExpression(content: string, start: number): number {
  const depth = { value: 1 };
  let index = start;

  while (index < content.length) {
    const next = advanceTemplateExpression(content, index, depth);
    if (next === null) {
      return index + 1;
    }
    index = next;
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

  const previous = prefix.at(-1);
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
    const previous = merged.at(-1);

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

/**
 * Returns true when the matched sequence is a single character from the
 * text-presentation exclusion list WITHOUT an explicit emoji variation
 * selector (U+FE0F). Characters like © followed by \uFE0F are genuine
 * emoji presentations and should still be detected.
 */
function isTextPresentationOnly(emoji: string): boolean {
  const codepoint = emoji.codePointAt(0) ?? 0;

  if (!TEXT_PRESENTATION_EXCLUSIONS.has(codepoint)) {
    return false;
  }

  // If the character is followed by U+FE0F (emoji presentation selector)
  // then the author explicitly wants emoji rendering — keep detecting it.
  const charLength = codepoint > 0xffff ? 2 : 1;
  return emoji.codePointAt(charLength) !== 0xfe0f;
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
