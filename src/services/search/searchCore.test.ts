import { describe, expect, it } from 'vitest';
import { searchFiles } from './searchCore';

const files = [
  { path: 'notes/alpha.md', content: '# Alpha\n\nmarkdown studio\nsecond line' },
  { path: 'beta.md', content: 'Markdown Studio is local first.\n' },
  { path: 'notes/gamma.md', content: 'nothing here' },
];

describe('searchFiles', () => {
  it('finds case-insensitive matches and groups by file', () => {
    const result = searchFiles({
      files,
      query: 'markdown studio',
      useRegex: false,
      caseSensitive: false,
      maxResults: 100,
    });
    expect(result.total).toBe(2);
    expect(result.results.map((entry) => entry.path)).toEqual([
      'notes/alpha.md',
      'beta.md',
    ]);
    expect(result.results[0].matches[0].line).toBe(3);
  });

  it('supports regex, case sensitivity and centered snippets', () => {
    const longLine = `${'x'.repeat(120)}needle${'y'.repeat(120)}`;
    const result = searchFiles({
      files: [{ path: 'long.md', content: longLine }],
      query: 'NEEDLE',
      useRegex: true,
      caseSensitive: true,
      maxResults: 10,
    });
    expect(result.total).toBe(0);
    const lower = searchFiles({
      files: [{ path: 'long.md', content: longLine }],
      query: 'needle',
      useRegex: true,
      caseSensitive: true,
      maxResults: 10,
    });
    expect(lower.total).toBe(1);
    expect(lower.results[0].matches[0].matchStart).toBeGreaterThan(0);
  });

  it('reports invalid regular expressions without throwing', () => {
    const result = searchFiles({
      files,
      query: '[',
      useRegex: true,
      caseSensitive: false,
      maxResults: 10,
    });
    expect(result.error).toBeTruthy();
    expect(result.results).toHaveLength(0);
  });

  it('enumerates every occurrence on the same line', () => {
    const result = searchFiles({
      files: [{ path: 'repeat.md', content: 'foo foo foo' }],
      query: 'foo',
      useRegex: false,
      caseSensitive: false,
      maxResults: 10,
    });
    expect(result.total).toBe(3);
    expect(result.results[0].matches.map((match) => match.column)).toEqual([1, 5, 9]);
  });

  it('truncates at maxResults', () => {
    const result = searchFiles({
      files,
      query: 'line',
      useRegex: false,
      caseSensitive: false,
      maxResults: 1,
    });
    expect(result.total).toBe(1);
    expect(result.truncated).toBe(true);
  });
});
