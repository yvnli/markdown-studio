import { describe, expect, it } from 'vitest';
import {
  findMatches,
  replaceAllMatches,
  replacementForMatch,
  type FindOptions,
} from './findCore';

function offsets(text: string, options: FindOptions): Array<[number, number]> {
  return findMatches(text, options).matches.map((match) => [match.from, match.to]);
}

describe('findMatches', () => {
  it('finds plain text case-insensitively by default', () => {
    const text = 'Markdown studio\nmarkdown STUDIO';
    expect(offsets(text, { query: 'markdown' })).toEqual([
      [0, 8],
      [16, 24],
    ]);
  });

  it('honours case sensitivity', () => {
    const text = 'Markdown markdown';
    expect(offsets(text, { query: 'markdown', caseSensitive: true })).toEqual([[9, 17]]);
  });

  it('matches whole words only', () => {
    const text = 'cat concatenate cat. cat2';
    expect(offsets(text, { query: 'cat', wholeWord: true })).toEqual([
      [0, 3],
      [16, 19],
    ]);
  });

  it('supports regular expressions and reports every match on a line', () => {
    const text = 'foo1 foo2\nfoo3';
    expect(offsets(text, { query: 'foo\\d', regex: true })).toEqual([
      [0, 4],
      [5, 9],
      [10, 14],
    ]);
  });

  it('reports invalid regular expressions without throwing', () => {
    const result = findMatches('text', { query: '[', regex: true });
    expect(result.error).toBeTruthy();
    expect(result.matches).toHaveLength(0);
  });

  it('ignores zero-width regular expression matches and terminates', () => {
    const result = findMatches('abc', { query: '(?=b)', regex: true });
    expect(result.error).toBeNull();
    expect(result.matches).toHaveLength(0);
  });

  it('truncates at the requested limit', () => {
    const result = findMatches('aaaa', { query: 'a' }, 2);
    expect(result.matches).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });
});

describe('replacement helpers', () => {
  it('keeps replacement text literal in plain mode', () => {
    expect(
      replacementForMatch(
        'foo',
        { from: 0, to: 3 },
        { query: 'foo', regex: false },
        '$1',
      ),
    ).toBe('$1');
  });

  it('expands capture groups in regex mode', () => {
    const options: FindOptions = { query: '(foo)-(bar)', regex: true };
    expect(
      replacementForMatch('foo-bar', { from: 0, to: 7 }, options, '$2 $1'),
    ).toBe('bar foo');
  });

  it('expands named groups and special patterns', () => {
    const options: FindOptions = { query: '(?<word>\\w+)', regex: true };
    expect(
      replacementForMatch('hello world', { from: 6, to: 11 }, options, '$<word>!'),
    ).toBe('world!');
    expect(
      replacementForMatch('hello world', { from: 6, to: 11 }, options, '[$&]'),
    ).toBe('[world]');
  });

  it('keeps context-sensitive regex replacements working', () => {
    const options: FindOptions = { query: '(?<=@)\\w+', regex: true };
    expect(
      replacementForMatch('@user', { from: 1, to: 5 }, options, 'name'),
    ).toBe('name');
    expect(replaceAllMatches('@user and @admin', options, 'name').content).toBe(
      '@name and @name',
    );
  });

  it('replaces every match without touching surrounding text', () => {
    const result = replaceAllMatches(
      'one two one three',
      { query: 'one' },
      '1',
    );
    expect(result.count).toBe(2);
    expect(result.content).toBe('1 two 1 three');
  });

  it('supports capture group replacement for every match', () => {
    const result = replaceAllMatches(
      'a1 b2',
      { query: '([a-z])(\\d)', regex: true },
      '$2-$1',
    );
    expect(result.count).toBe(2);
    expect(result.content).toBe('1-a 2-b');
  });

  it('reports invalid expressions for replace all', () => {
    const result = replaceAllMatches('text', { query: '(', regex: true }, '');
    expect(result.error).toBeTruthy();
    expect(result.content).toBe('text');
    expect(result.count).toBe(0);
  });
});
