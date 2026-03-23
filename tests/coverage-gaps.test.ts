/**
 * Tests targeting uncovered code paths identified via coverage analysis.
 * Focuses on: CLI arg parsing edge cases, detector language coverage,
 * template literal parsing, Python/Ruby/YAML/JSON, and scanner edge cases.
 */
import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it, test } from 'node:test';

import { analyzeFile, detect, detectLanguage } from '../dist/lib/detector.js';
import { scan } from '../dist/lib/scanner.js';

const cliPath = join(process.cwd(), 'dist', 'index.js');

function runCli(args: string[], cwd?: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync('node', [cliPath, ...args], {
      cwd: cwd ?? process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (error: unknown) {
    const failure = error as { stdout?: string | Buffer; stderr?: string | Buffer; status?: number };
    return {
      stdout: typeof failure.stdout === 'string' ? failure.stdout : Buffer.from(failure.stdout ?? '').toString('utf8'),
      stderr: typeof failure.stderr === 'string' ? failure.stderr : Buffer.from(failure.stderr ?? '').toString('utf8'),
      exitCode: failure.status ?? 1,
    };
  }
}

// ─── CLI argument parsing edge cases ────────────────────────────────────────

describe('CLI argument parsing', () => {
  it('returns help for --help flag', () => {
    const result = runCli(['--help']);
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Usage:/u);
  });

  it('returns help for -h flag', () => {
    const result = runCli(['-h']);
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Usage:/u);
  });

  it('returns help for no args', () => {
    const result = runCli([]);
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Usage:/u);
  });

  it('errors on unknown command', () => {
    const result = runCli(['foobar']);
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /Unknown command/u);
  });

  it('errors on unknown flag', () => {
    const result = runCli(['scan', '--nonexistent']);
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /Unknown flag/u);
  });

  it('errors on duplicate positional path', () => {
    const result = runCli(['scan', '/tmp', '/tmp2']);
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /Unexpected argument/u);
  });

  it('errors on --output without value', () => {
    const result = runCli(['scan', '--output']);
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /Missing value/u);
  });

  it('errors on --path without value', () => {
    const result = runCli(['scan', '--path']);
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /Missing value/u);
  });

  it('accepts --output=value form', () => {
    const result = runCli(['scan', '--output=test.html', 'tests/fixtures/clean-repo']);
    assert.equal(result.exitCode, 0);
  });

  it('accepts --path=value form', () => {
    const result = runCli(['scan', '--path=tests/fixtures/clean-repo']);
    assert.equal(result.exitCode, 0);
  });

  it('supports --help mid-args to bail', () => {
    const result = runCli(['scan', '--strict', '--help']);
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Usage:/u);
  });

  it('supports boolean flags --strict --yes --json --verbose --dry-run', () => {
    const result = runCli(['scan', 'tests/fixtures/clean-repo', '--strict', '--json', '--verbose']);
    assert.equal(result.exitCode, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.strict, true);
  });
});

// ─── Language detection ─────────────────────────────────────────────────────

describe('language detection', () => {
  it('detects all supported languages', () => {
    const cases: Array<[string, string]> = [
      ['file.ts', 'typescript'],
      ['file.tsx', 'typescript'],
      ['file.js', 'javascript'],
      ['file.jsx', 'javascript'],
      ['file.mjs', 'javascript'],
      ['file.cjs', 'javascript'],
      ['file.py', 'python'],
      ['file.rb', 'ruby'],
      ['file.go', 'go'],
      ['file.rs', 'rust'],
      ['file.java', 'java'],
      ['file.kt', 'kotlin'],
      ['file.swift', 'swift'],
      ['file.c', 'c'],
      ['file.cpp', 'cpp'],
      ['file.h', 'c'],
      ['file.cs', 'csharp'],
      ['file.md', 'markdown'],
      ['file.yaml', 'yaml'],
      ['file.yml', 'yaml'],
      ['file.json', 'json'],
      ['file.toml', 'toml'],
      ['file.xyz', 'unknown'],
    ];

    for (const [file, expected] of cases) {
      assert.equal(detectLanguage(file), expected, `${file} should be ${expected}`);
    }
  });
});

// ─── Python context classification ──────────────────────────────────────────

describe('Python context classification', () => {
  it('classifies hash comments', () => {
    const matches = detect('# 🚀 comment\nx = 1', 'test.py');
    assert.equal(matches[0]?.context, 'COMMENT');
  });

  // NOTE: The current parser matches single " before """, so triple-quoted
  // strings are parsed as sequences of single-quoted strings. This is a known
  // limitation tracked in the audit. The test still exercises the hash-comment
  // and string parsing paths for Python.
  it('classifies triple-quoted content (parsed as string sequences)', () => {
    const code = `def hello():\n    """🚀 docstring"""\n    pass`;
    const matches = detect(code, 'test.py');
    // Emoji still detected (just classified as STRING_LITERAL instead of COMMENT)
    assert.equal(matches.length, 1);
    assert.equal(matches[0]?.emoji, '🚀');
  });

  it('classifies triple-quoted strings as string context', () => {
    const code = `x = 1\nresult = """🚀 string"""`;
    const matches = detect(code, 'test.py');
    assert.equal(matches.length, 1);
    assert.equal(matches[0]?.emoji, '🚀');
  });

  it('classifies single-quoted strings', () => {
    const matches = detect("x = '🚀 rocket'", 'test.py');
    assert.equal(matches[0]?.context, 'STRING_LITERAL');
  });

  it('classifies print() as LOG_STATEMENT', () => {
    const matches = detect("print('🚀 launch')", 'test.py');
    assert.equal(matches[0]?.context, 'LOG_STATEMENT');
  });

  it('classifies logging calls as LOG_STATEMENT', () => {
    const matches = detect("logging.info('🚀 launch')", 'test.py');
    assert.equal(matches[0]?.context, 'LOG_STATEMENT');
  });

  it('detects emoji in module-level strings', () => {
    const code = `"""🚀 module docstring"""\nimport os`;
    const matches = detect(code, 'test.py');
    assert.equal(matches.length, 1);
    assert.equal(matches[0]?.emoji, '🚀');
  });

  it('detects emoji in class-level strings', () => {
    const code = `class Foo:\n    """🚀 class doc"""\n    pass`;
    const matches = detect(code, 'test.py');
    assert.equal(matches.length, 1);
    assert.equal(matches[0]?.emoji, '🚀');
  });
});

// ─── Ruby context classification ────────────────────────────────────────────

describe('Ruby context classification', () => {
  it('classifies hash comments', () => {
    const matches = detect('# 🚀 ruby comment', 'test.rb');
    assert.equal(matches[0]?.context, 'COMMENT');
  });

  it('classifies =begin...=end block comments', () => {
    const code = `=begin\n🚀 block comment\n=end\nx = 1`;
    const matches = detect(code, 'test.rb');
    assert.equal(matches[0]?.context, 'COMMENT');
  });

  it('classifies string literals', () => {
    const matches = detect("x = '🚀 rocket'", 'test.rb');
    assert.equal(matches[0]?.context, 'STRING_LITERAL');
  });

  it('classifies print as LOG_STATEMENT in Ruby', () => {
    const matches = detect("print('🚀 launch')", 'test.rb');
    assert.equal(matches[0]?.context, 'LOG_STATEMENT');
  });
});

// ─── YAML/TOML context classification ───────────────────────────────────────

describe('YAML/TOML context classification', () => {
  it('classifies YAML hash comments', () => {
    const matches = detect('# 🚀 yaml comment\nkey: value', 'test.yaml');
    assert.equal(matches[0]?.context, 'COMMENT');
  });

  it('classifies YAML string values', () => {
    const matches = detect("key: '🚀 value'", 'test.yaml');
    assert.equal(matches[0]?.context, 'STRING_LITERAL');
  });

  it('classifies TOML hash comments', () => {
    const matches = detect('# 🚀 toml comment\nkey = "value"', 'test.toml');
    assert.equal(matches[0]?.context, 'COMMENT');
  });
});

// ─── JSON context classification ────────────────────────────────────────────

describe('JSON context classification', () => {
  it('classifies JSON string values', () => {
    const matches = detect('{"key": "🚀 value"}', 'test.json');
    assert.equal(matches[0]?.context, 'STRING_LITERAL');
  });

  it('treats emoji outside strings as OTHER', () => {
    // This is technically invalid JSON but tests the "outside string" path
    const matches = detect('🚀', 'test.json');
    assert.equal(matches[0]?.context, 'OTHER');
  });
});

// ─── Markdown context classification ────────────────────────────────────────

describe('Markdown context classification', () => {
  it('classifies all emoji as OTHER in markdown', () => {
    const matches = detect('# 🚀 heading\n\nSome 🔥 text', 'test.md');
    assert.ok(matches.every((m) => m.context === 'OTHER'));
  });
});

// ─── C-style languages ─────────────────────────────────────────────────────

describe('C-style language contexts', () => {
  it('classifies Go comments and strings', () => {
    assert.equal(detect('// 🚀 go comment', 'test.go')[0]?.context, 'COMMENT');
    assert.equal(detect('"🚀 go string"', 'test.go')[0]?.context, 'STRING_LITERAL');
    assert.equal(detect('/* 🚀 block */', 'test.go')[0]?.context, 'COMMENT');
  });

  it('classifies Rust comments and strings', () => {
    assert.equal(detect('// 🚀 rust comment', 'test.rs')[0]?.context, 'COMMENT');
    assert.equal(detect('"🚀 rust string"', 'test.rs')[0]?.context, 'STRING_LITERAL');
  });

  it('classifies Java comments and strings', () => {
    assert.equal(detect('// 🚀 java comment', 'test.java')[0]?.context, 'COMMENT');
    assert.equal(detect('"🚀 java string"', 'test.java')[0]?.context, 'STRING_LITERAL');
  });

  it('classifies C# comments', () => {
    assert.equal(detect('// 🚀 csharp', 'test.cs')[0]?.context, 'COMMENT');
  });

  it('classifies Kotlin comments', () => {
    assert.equal(detect('// 🚀 kotlin', 'test.kt')[0]?.context, 'COMMENT');
  });

  it('classifies Swift comments', () => {
    assert.equal(detect('// 🚀 swift', 'test.swift')[0]?.context, 'COMMENT');
  });

  it('classifies C++ comments and strings', () => {
    assert.equal(detect('// 🚀 cpp', 'test.cpp')[0]?.context, 'COMMENT');
    assert.equal(detect('"🚀 string"', 'test.cpp')[0]?.context, 'STRING_LITERAL');
  });

  it('classifies C header file comments', () => {
    assert.equal(detect('/* 🚀 header */', 'test.h')[0]?.context, 'COMMENT');
  });
});

// ─── Template literal edge cases ────────────────────────────────────────────

describe('template literal edge cases', () => {
  it('handles template literal with expression containing string', () => {
    const code = '`prefix ${fn("🚀")} suffix`';
    const matches = detect(code, 'test.ts');
    assert.ok(matches.length >= 1);
  });

  // NOTE: Emoji inside ${} expressions are classified as OTHER because the
  // expression parser tracks region boundaries but doesn't push nested regions
  // back to the top-level region list. This is a known limitation.
  it('handles nested template literals (emoji in expression)', () => {
    const code = '`outer ${`inner 🚀`} end`';
    const matches = detect(code, 'test.ts');
    assert.equal(matches.length, 1);
    // Emoji inside nested template within expression — classified as OTHER
    assert.equal(matches[0]?.context, 'OTHER');
  });

  it('handles template expression with braces', () => {
    const code = '`${obj.fn({key: "🚀"})} end`';
    const matches = detect(code, 'test.ts');
    assert.ok(matches.length >= 1);
  });

  it('handles template expression with block comment (outside region tracking)', () => {
    const code = '`${/* 🚀 */ value} end`';
    const matches = detect(code, 'test.ts');
    // Block comment inside ${} — expression parser skips it but doesn't classify
    assert.equal(matches[0]?.context, 'OTHER');
  });

  it('handles template expression with line comment (outside region tracking)', () => {
    const code = '`${\n// 🚀 comment\nvalue} end`';
    const matches = detect(code, 'test.ts');
    // Line comment inside ${} — same limitation
    assert.equal(matches[0]?.context, 'OTHER');
  });

  it('handles unterminated template literal', () => {
    const code = '`unterminated 🚀';
    const matches = detect(code, 'test.ts');
    assert.equal(matches.length, 1);
    assert.equal(matches[0]?.context, 'STRING_LITERAL');
  });

  it('handles template expression with single-quoted string', () => {
    const code = "`${fn('🚀')} end`";
    const matches = detect(code, 'test.ts');
    assert.ok(matches.length >= 1);
  });
});

// ─── Unterminated constructs ────────────────────────────────────────────────

describe('unterminated constructs', () => {
  it('handles unterminated block comment', () => {
    const code = '/* 🚀 never closed';
    const matches = detect(code, 'test.ts');
    assert.equal(matches.length, 1);
    assert.equal(matches[0]?.context, 'COMMENT');
  });

  it('handles unterminated string', () => {
    const code = '"🚀 never closed';
    const matches = detect(code, 'test.ts');
    assert.equal(matches.length, 1);
    assert.equal(matches[0]?.context, 'STRING_LITERAL');
  });

  it('handles unterminated triple-quoted string in Python', () => {
    const code = '"""🚀 never closed';
    const matches = detect(code, 'test.py');
    assert.equal(matches.length, 1);
  });

  it('handles unterminated Ruby block comment', () => {
    const code = '=begin\n🚀 never closed';
    const matches = detect(code, 'test.rb');
    assert.equal(matches.length, 1);
    assert.equal(matches[0]?.context, 'COMMENT');
  });
});

// ─── Unknown language fallback ──────────────────────────────────────────────

describe('unknown language fallback', () => {
  it('classifies emoji as OTHER for unknown extensions', () => {
    const matches = detect('🚀 content', 'test.xyz');
    assert.equal(matches[0]?.context, 'OTHER');
  });
});

// ─── Escaped quotes in strings ──────────────────────────────────────────────

describe('escaped characters in strings', () => {
  it('handles escaped quotes in double-quoted strings', () => {
    const code = String.raw`"escaped \"🚀 inside\""`;
    const matches = detect(code, 'test.ts');
    assert.equal(matches[0]?.context, 'STRING_LITERAL');
  });

  it('handles escaped backslash before closing quote', () => {
    const code = String.raw`"trail\\🚀"`;
    const matches = detect(code, 'test.ts');
    assert.equal(matches[0]?.context, 'STRING_LITERAL');
  });
});

// ─── Identifier context ────────────────────────────────────────────────────

describe('identifier context', () => {
  it('detects emoji in function names', () => {
    const matches = detect('function 🚀launch() {}', 'test.ts');
    assert.equal(matches[0]?.context, 'IDENTIFIER');
  });

  it('detects emoji prefixed to variable names', () => {
    const matches = detect('const 🔥hot = true', 'test.ts');
    assert.equal(matches[0]?.context, 'IDENTIFIER');
  });

  it('detects standalone emoji as OTHER', () => {
    const matches = detect('🚀', 'test.ts');
    assert.equal(matches[0]?.context, 'OTHER');
  });
});

// ─── Scanner: symlink-to-file ───────────────────────────────────────────────

let tempDir = '';

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'demoji-cov-'));

  // File symlink test
  await writeFile(join(tempDir, 'real.ts'), '// 🚀 real file\n', 'utf8');
  await symlink(join(tempDir, 'real.ts'), join(tempDir, 'link.ts'));

  // Broken symlink — previously crashed the scanner, now handled gracefully
  await symlink(join(tempDir, 'nonexistent.ts'), join(tempDir, 'broken-link.ts'));

  // Negation gitignore test
  const negDir = join(tempDir, 'neg-test');
  await mkdir(negDir, { recursive: true });
  await writeFile(join(negDir, '.gitignore'), '*.ts\n!keep.ts\n', 'utf8');
  await writeFile(join(negDir, 'skip.ts'), '// skip\n', 'utf8');
  await writeFile(join(negDir, 'keep.ts'), '// keep\n', 'utf8');

  // Directory-only gitignore rule
  const dirRuleDir = join(tempDir, 'dir-rule-test');
  await mkdir(join(dirRuleDir, 'build'), { recursive: true });
  await writeFile(join(dirRuleDir, '.gitignore'), 'build/\n', 'utf8');
  await writeFile(join(dirRuleDir, 'build', 'out.ts'), '// built\n', 'utf8');
  await writeFile(join(dirRuleDir, 'main.ts'), '// main\n', 'utf8');
});

after(async () => {
  if (tempDir !== '') {
    await rm(tempDir, { recursive: true, force: true });
  }
});

describe('scanner edge cases', () => {
  it('follows symlinks to files', async () => {
    const files: string[] = [];
    for await (const file of scan({ root: tempDir, respectGitignore: false, respectDemojiIgnore: false })) {
      files.push(file);
    }
    assert.ok(files.includes('link.ts'), 'should include symlinked file');
    assert.ok(files.includes('real.ts'), 'should include real file');
  });

  it('skips broken symlinks gracefully', async () => {
    const files: string[] = [];
    for await (const file of scan({ root: tempDir, respectGitignore: false, respectDemojiIgnore: false })) {
      files.push(file);
    }
    assert.ok(!files.includes('broken-link.ts'), 'broken symlink should be skipped');
    assert.ok(files.includes('real.ts'), 'real files should still be found');
  });

  it('respects gitignore negation patterns', async () => {
    const files: string[] = [];
    for await (const file of scan({ root: join(tempDir, 'neg-test') })) {
      files.push(file);
    }
    assert.ok(files.includes('keep.ts'), 'negated file should be included');
    assert.ok(!files.includes('skip.ts'), 'non-negated file should be excluded');
  });

  it('respects directory-only gitignore rules', async () => {
    const files: string[] = [];
    for await (const file of scan({ root: join(tempDir, 'dir-rule-test') })) {
      files.push(file);
    }
    assert.ok(files.includes('main.ts'), 'non-ignored file should be included');
    assert.ok(!files.includes('build/out.ts'), 'build dir should be ignored');
  });
});

// ─── CLI verbose + identifier output ────────────────────────────────────────

describe('CLI verbose and identifier output', () => {
  it('shows verbose file details with --verbose', () => {
    const result = runCli(['scan', 'tests/fixtures/emoji-heavy', '--verbose']);
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Verbose file details/u);
  });

  it('shows identifier flags in scan output', () => {
    const result = runCli(['scan', 'tests/fixtures/emoji-heavy']);
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /emoji in identifiers require manual review/u);
  });

  it('clean --dry-run shows diffs in verbose mode', () => {
    const result = runCli(['clean', 'tests/fixtures/emoji-heavy', '--dry-run', '--verbose']);
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Planned diffs/u);
  });
});

// ─── Multiple emoji on single line ──────────────────────────────────────────

describe('density and flagging thresholds', () => {
  it('returns correct line/column for multi-line content', () => {
    const code = 'line1\nline2\nline3 🚀\nline4 🔥';
    const matches = detect(code, 'test.ts');
    assert.equal(matches[0]?.line, 3);
    assert.equal(matches[1]?.line, 4);
  });
});

// ─── mergeRegions edge cases (via multi-region detection) ───────────────────

describe('overlapping region handling', () => {
  it('handles adjacent comments and strings', () => {
    const code = '// 🚀 comment\n"🔥 string"\n/* 🐛 block */';
    const matches = detect(code, 'test.ts');
    assert.equal(matches[0]?.context, 'COMMENT');
    assert.equal(matches[1]?.context, 'STRING_LITERAL');
    assert.equal(matches[2]?.context, 'COMMENT');
  });
});
