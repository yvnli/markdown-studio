import { beforeEach, describe, expect, it } from 'vitest';
import { SearchIndex } from './searchIndex';

const files = [
  { path: 'notes/a.md', content: 'Alpha target\nsecond line' },
  { path: 'notes/b.md', content: 'Beta target' },
  { path: 'README.md', content: 'Nothing here' },
];

describe('SearchIndex', () => {
  let index: SearchIndex;

  beforeEach(() => {
    index = new SearchIndex();
    index.setIndex(files);
  });

  it('searches the base index', () => {
    const result = index.search({ query: 'target', useRegex: false, caseSensitive: false });
    expect(result.results.map((file) => file.path)).toEqual(['notes/a.md', 'notes/b.md']);
    expect(result.total).toBe(2);
    expect(result.error).toBeUndefined();
  });

  it('applies and resets overrides for unsaved documents', () => {
    index.update([{ path: 'notes/a.md', content: 'Alpha rewritten' }]);
    expect(
      index.search({ query: 'target', useRegex: false, caseSensitive: false }).results.map((r) => r.path),
    ).toEqual(['notes/b.md']);

    index.resetOverrides(['notes/a.md']);
    expect(
      index.search({ query: 'rewritten', useRegex: false, caseSensitive: false }).results,
    ).toHaveLength(0);
    expect(
      index.search({ query: 'target', useRegex: false, caseSensitive: false }).results.map((r) => r.path),
    ).toEqual(['notes/a.md', 'notes/b.md']);
  });

  it('keeps overrides for paths that are not in the base index', () => {
    index.update([{ path: 'drafts/new.md', content: 'fresh target' }]);
    expect(index.has('drafts/new.md')).toBe(true);
    expect(index.size()).toBe(4);
    index.resetOverrides(['drafts/new.md']);
    expect(index.has('drafts/new.md')).toBe(false);
  });

  it('returns all matching paths regardless of maxResults', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      path: `notes/${i}.md`,
      content: 'shared keyword',
    }));
    index.setIndex(many);
    expect(index.matchingPaths({ query: 'keyword', useRegex: false, caseSensitive: false })).toHaveLength(30);
    const limited = index.search({
      query: 'keyword',
      useRegex: false,
      caseSensitive: false,
      maxResults: 5,
    });
    expect(limited.truncated).toBe(true);
  });

  it('supports regex and case sensitivity, and tolerates invalid patterns', () => {
    index.setIndex([{ path: 'a.md', content: 'Alpha 42' }, { path: 'b.md', content: 'beta 7' }]);
    expect(
      index.matchingPaths({ query: '\\d+', useRegex: true, caseSensitive: false }),
    ).toHaveLength(2);
    expect(
      index.matchingPaths({ query: 'alpha', useRegex: false, caseSensitive: true }),
    ).toEqual([]);
    expect(index.matchingPaths({ query: '(', useRegex: true, caseSensitive: false })).toEqual([]);
  });
});
