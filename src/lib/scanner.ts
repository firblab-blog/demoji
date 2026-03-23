import { open, readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

export interface ScanOptions {
  root: string;
  extensions?: Set<string>;
  respectGitignore?: boolean;
  respectDemojiIgnore?: boolean;
  maxDepth?: number;
  verbose?: boolean;
}

interface IgnoreRule {
  pattern: string;
  negated: boolean;
  directory: boolean;
  regex: RegExp;
}

interface IgnoreContext {
  basePath: string;
  rules: IgnoreRule[];
}

const ALWAYS_SKIP = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'vendor',
  '__pycache__',
  '.next',
  '.nuxt',
  'coverage',
  '.nyc_output',
]);

const SUPPORTED_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.swift',
  '.c',
  '.cpp',
  '.h',
  '.cs',
  '.md',
  '.yaml',
  '.yml',
  '.json',
  '.toml',
]);

async function resolveEntryKind(
  entry: import('node:fs').Dirent,
  fullPath: string,
): Promise<'directory' | 'file' | 'skip'> {
  if (entry.isDirectory()) {
    return 'directory';
  }

  if (entry.isSymbolicLink()) {
    try {
      const entryStat = await stat(fullPath);
      if (entryStat.isDirectory()) {
        return 'directory';
      }
      return entryStat.isFile() ? 'file' : 'skip';
    } catch {
      // Broken symlink (target does not exist) — skip gracefully
      return 'skip';
    }
  }

  return entry.isFile() ? 'file' : 'skip';
}

export async function* scan(options: ScanOptions): AsyncGenerator<string> {
  const root = options.root;
  const extensions = options.extensions ?? SUPPORTED_EXTENSIONS;
  const respectGitignore = options.respectGitignore ?? true;
  const respectDemojiIgnore = options.respectDemojiIgnore ?? true;
  const maxDepth = options.maxDepth ?? 100;
  const verbose = options.verbose ?? false;
  const visited = new Set<string>();

  yield* walkDirectory(root, 0, []);

  async function* processEntry(
    entry: import('node:fs').Dirent,
    directoryPath: string,
    depth: number,
    contexts: IgnoreContext[],
  ): AsyncGenerator<string> {
    const fullPath = join(directoryPath, entry.name);
    const relativePath = normalizePath(relative(root, fullPath));

    if (!relativePath || relativePath.startsWith('../')) {
      return;
    }

    if (ALWAYS_SKIP.has(entry.name)) {
      return;
    }

    if (shouldIgnore(relativePath, contexts)) {
      return;
    }

    const kind = await resolveEntryKind(entry, fullPath);

    if (kind === 'directory') {
      yield* walkDirectory(fullPath, depth + 1, contexts);
      return;
    }

    if (kind === 'skip') {
      return;
    }

    if (!extensions.has(extname(entry.name).toLowerCase())) {
      return;
    }

    if (await isBinaryFile(fullPath)) {
      return;
    }

    yield relativePath;
  }

  async function* walkDirectory(
    directoryPath: string,
    depth: number,
    inheritedContexts: IgnoreContext[],
  ): AsyncGenerator<string> {
    if (depth > maxDepth) {
      if (verbose) {
        console.warn(`Max depth (${maxDepth}) reached at ${directoryPath}`);
      }
      return;
    }

    const directoryStat = await stat(directoryPath);
    if (!directoryStat.isDirectory()) {
      return;
    }

    const inodeKey = `${directoryStat.dev}:${directoryStat.ino}`;
    if (visited.has(inodeKey)) {
      return;
    }

    visited.add(inodeKey);
    const contexts = await loadIgnoreContexts(
      root,
      directoryPath,
      inheritedContexts,
      respectGitignore,
      respectDemojiIgnore,
    );
    const entries = await readdir(directoryPath, { withFileTypes: true });

    for (const entry of entries) {
      yield* processEntry(entry, directoryPath, depth, contexts);
    }
  }
}

export async function readScannableTextFile(
  filePath: string,
  displayPath = filePath,
  verbose = false,
): Promise<string | null> {
  try {
    const buffer = await readFile(filePath);
    const content = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return stripBom(content);
  } catch (error) {
    if (isEncodingError(error)) {
      if (verbose) {
        console.warn(`Skipping ${displayPath}: encoding error`);
      }
      return null;
    }

    throw error;
  }
}

function parseGitignore(content: string): IgnoreRule[] {
  const rules: IgnoreRule[] = [];

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const negated = line.startsWith('!');
    const candidate = negated ? line.slice(1) : line;
    const directory = candidate.endsWith('/');
    const pattern = normalizePath(stripTrailingSlash(candidate));

    if (!pattern) {
      continue;
    }

    rules.push({
      pattern,
      negated,
      directory,
      regex: compileIgnoreRegex(pattern),
    });
  }

  return rules;
}

function isIgnored(relativePath: string, rules: IgnoreRule[]): boolean {
  const path = normalizePath(relativePath);
  let ignored = false;

  for (const rule of rules) {
    if (!matchesIgnoreRule(path, rule)) {
      continue;
    }

    ignored = !rule.negated;
  }

  return ignored;
}

async function loadIgnoreContexts(
  root: string,
  directoryPath: string,
  inheritedContexts: IgnoreContext[],
  respectGitignore: boolean,
  respectDemojiIgnore: boolean,
): Promise<IgnoreContext[]> {
  const contexts = [...inheritedContexts];
  const ignoreFiles: string[] = [];

  if (respectGitignore) {
    ignoreFiles.push('.gitignore');
  }

  if (respectDemojiIgnore) {
    ignoreFiles.push('.demoji-ignore');
  }

  for (const fileName of ignoreFiles) {
    const ignorePath = join(directoryPath, fileName);

    try {
      const content = await readFile(ignorePath, 'utf8');
      const rules = parseGitignore(content);

      if (rules.length > 0) {
        contexts.push({
          basePath: normalizeRelativePath(root, directoryPath),
          rules,
        });
      }
    } catch (error) {
      if (!isFileMissing(error)) {
        throw error;
      }
    }
  }

  return contexts;
}

async function isBinaryFile(filePath: string): Promise<boolean> {
  const buffer = Buffer.alloc(8192);
  const fileHandle = await open(filePath, 'r');

  try {
    const { bytesRead } = await fileHandle.read(buffer, 0, 8192, 0);
    return buffer.subarray(0, bytesRead).includes(0);
  } finally {
    await fileHandle.close();
  }
}

function shouldIgnore(relativePath: string, contexts: IgnoreContext[]): boolean {
  let ignored = false;

  for (const context of contexts) {
    const localPath = getLocalPath(relativePath, context.basePath);

    if (localPath === null) {
      continue;
    }

    for (const rule of context.rules) {
      if (matchesIgnoreRule(localPath, rule)) {
        ignored = !rule.negated;
      }
    }
  }

  return ignored;
}

function getLocalPath(relativePath: string, basePath: string): string | null {
  if (!basePath) {
    return relativePath;
  }

  if (relativePath === basePath) {
    return '';
  }

  if (relativePath.startsWith(`${basePath}/`)) {
    return relativePath.slice(basePath.length + 1);
  }

  return null;
}

function matchesIgnoreRule(relativePath: string, rule: IgnoreRule): boolean {
  if (!relativePath) {
    return false;
  }

  if (!rule.regex.test(relativePath)) {
    return false;
  }

  if (!rule.directory) {
    return true;
  }

  if (relativePath === rule.pattern) {
    return true;
  }

  return relativePath.startsWith(`${rule.pattern}/`) || relativePath.includes(`/${rule.pattern}/`);
}

function compileIgnoreRegex(pattern: string): RegExp {
  const hasSlash = pattern.includes('/');
  const source = globToRegexSource(pattern);

  if (hasSlash) {
    return new RegExp(`^${source}(?:$|/.*$)`, 'u');
  }

  return new RegExp(`(?:^|.*/)${source}(?:$|/.*$)`, 'u');
}

function globToRegexSource(pattern: string): string {
  let source = '';
  let index = 0;

  while (index < pattern.length) {
    const char = pattern[index] ?? '';
    const nextTwo = pattern.slice(index, index + 3);

    if (nextTwo === '**/') {
      source += '(?:.*/)?';
      index += 3;
      continue;
    }

    if (char === '*' && pattern[index + 1] === '*') {
      source += '.*';
      index += 2;
      continue;
    }

    if (char === '*') {
      source += '[^/]*';
      index += 1;
      continue;
    }

    source += escapeRegex(char);
    index += 1;
  }

  return source;
}

function escapeRegex(value: string): string {
  return value.replaceAll(/[|\\{}()[\]^$+?.]/gu, String.raw`\$&`);
}

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function normalizePath(value: string): string {
  return value.replaceAll('\\', '/');
}

function normalizeRelativePath(root: string, target: string): string {
  const result = normalizePath(relative(root, target));
  return result === '.' ? '' : result;
}

function isFileMissing(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function isEncodingError(error: unknown): boolean {
  return error instanceof TypeError && /encoded data was not valid/i.test(error.message);
}

function stripBom(content: string): string {
  return content.codePointAt(0) === 0xfeff ? content.slice(1) : content;
}

export { ALWAYS_SKIP, SUPPORTED_EXTENSIONS, isBinaryFile, isEncodingError, isIgnored, parseGitignore, stripBom };
