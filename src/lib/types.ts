export interface EmojiMatch {
  emoji: string;
  codepoints: string[];
  line: number;
  column: number;
  offset: number;
  context: EmojiContext;
}

export type EmojiContext =
  | 'COMMENT'
  | 'STRING_LITERAL'
  | 'LOG_STATEMENT'
  | 'IDENTIFIER'
  | 'OTHER';

export interface Replacement {
  match: EmojiMatch;
  replacement: string;
  action: 'replace' | 'remove' | 'flag' | 'preserve';
}

export interface FileResult {
  filePath: string;
  matches: EmojiMatch[];
  replacements: Replacement[];
  emojiDensity: number;
  totalChars: number;
  emojiChars: number;
}

export interface ScanSummary {
  totalFiles: number;
  filesWithEmoji: number;
  totalEmoji: number;
  byContext: Record<EmojiContext, number>;
  byAction: Record<Replacement['action'], number>;
}

export interface ScanResult {
  summary: ScanSummary;
  files: FileResult[];
  timestamp: string;
  targetPath: string;
  strict: boolean;
}
