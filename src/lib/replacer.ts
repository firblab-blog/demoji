import type { EmojiMatch, Replacement } from './types.js';

export interface ReplaceOptions {
  strict: boolean;
}

export function replace(
  _matches: EmojiMatch[],
  _options: ReplaceOptions,
): Replacement[] {
  return [];
}
