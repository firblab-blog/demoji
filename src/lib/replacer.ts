import type { EmojiMatch, Replacement } from './types.js';

export interface ReplaceOptions {
  strict: boolean;
}

export interface FileChange {
  filePath: string;
  originalContent: string;
  modifiedContent: string;
  replacements: Replacement[];
  diff: string;
}

const EMOJI_TEXT_MAP: Record<string, string> = {
  '✅': '[OK]',
  '❌': '[FAIL]',
  '🚀': '[LAUNCH]',
  '🔥': '[HOT]',
  '⚠️': '[WARN]',
  '💡': '[IDEA]',
  '📝': '[NOTE]',
  '🐛': '[BUG]',
  '✨': '[NEW]',
  '🔧': '[FIX]',
  '🎉': '[CELEBRATE]',
  '💀': '[DEAD]',
  '🤔': '[THINK]',
  '👍': '[THUMBSUP]',
  '👎': '[THUMBSDOWN]',
  '🏗️': '[BUILD]',
  '📦': '[PACKAGE]',
  '🔒': '[LOCK]',
  '🔑': '[KEY]',
  '📊': '[CHART]',
  '🧪': '[TEST]',
  '🧹': '[CLEAN]',
  '⬆️': '[UP]',
  '⬇️': '[DOWN]',
  '➡️': '[RIGHT]',
  '⬅️': '[LEFT]',
  '🛑': '[STOP]',
  '🟢': '[GREEN]',
  '🔴': '[RED]',
  '🟡': '[YELLOW]',
  '💥': '[BOOM]',
  '🗑️': '[TRASH]',
  '📁': '[FOLDER]',
  '📄': '[FILE]',
  '🔍': '[SEARCH]',
  '⏰': '[TIMER]',
  '🚧': '[WIP]',
  '💾': '[SAVE]',
  '🎯': '[TARGET]',
};

export function applyReplacements(matches: EmojiMatch[], options: ReplaceOptions): Replacement[] {
  return matches.map((match) => {
    switch (match.context) {
      case 'COMMENT':
        return {
          match,
          replacement: lookupTextEquivalent(match.emoji),
          action: 'replace',
        };
      case 'LOG_STATEMENT':
        return {
          match,
          replacement: '',
          action: 'remove',
        };
      case 'IDENTIFIER':
        return {
          match,
          replacement: '',
          action: 'flag',
        };
      case 'STRING_LITERAL':
        if (options.strict) {
          return {
            match,
            replacement: lookupTextEquivalent(match.emoji),
            action: 'replace',
          };
        }

        return {
          match,
          replacement: match.emoji,
          action: 'preserve',
        };
      case 'OTHER':
        return {
          match,
          replacement: lookupTextEquivalent(match.emoji),
          action: 'replace',
        };
    }
  });
}

export function replace(matches: EmojiMatch[], options: ReplaceOptions): Replacement[] {
  return applyReplacements(matches, options);
}

export function applyToFile(
  filePath: string,
  content: string,
  replacements: Replacement[],
): FileChange {
  const actionable = replacements
    .filter((replacement) => replacement.action === 'replace' || replacement.action === 'remove')
    .sort((left, right) => right.match.offset - left.match.offset);

  let modified = content;
  for (const replacement of actionable) {
    const before = modified.slice(0, replacement.match.offset);
    const after = modified.slice(replacement.match.offset + replacement.match.emoji.length);
    modified = before + replacement.replacement + after;
  }

  return {
    filePath,
    originalContent: content,
    modifiedContent: modified,
    replacements,
    diff: generateDiff(filePath, content, modified),
  };
}

function lookupTextEquivalent(emoji: string): string {
  return EMOJI_TEXT_MAP[emoji] ?? `[EMOJI:${toCodepoints(emoji)}]`;
}

function toCodepoints(emoji: string): string {
  return Array.from(emoji, (char) =>
    `U+${char.codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0') ?? '0000'}`,
  ).join(',');
}

function generateDiff(filePath: string, original: string, modified: string): string {
  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');
  const chunks: string[] = [`--- a/${filePath}`, `+++ b/${filePath}`];
  const maxLineCount = Math.max(originalLines.length, modifiedLines.length);

  for (let index = 0; index < maxLineCount; index += 1) {
    if (originalLines[index] !== modifiedLines[index]) {
      chunks.push(`@@ -${index + 1} +${index + 1} @@`);
      if (originalLines[index] !== undefined) {
        chunks.push(`-${originalLines[index]}`);
      }
      if (modifiedLines[index] !== undefined) {
        chunks.push(`+${modifiedLines[index]}`);
      }
    }
  }

  return chunks.join('\n');
}
