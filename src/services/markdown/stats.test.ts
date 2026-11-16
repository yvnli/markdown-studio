import { describe, expect, it } from 'vitest';
import { calculateMarkdownStats, stripMarkdown } from './stats';
import { extractOutline, slugifyHeading } from './slug';

describe('stripMarkdown', () => {
  it('keeps visible text and removes link and emphasis syntax', () => {
    const text = stripMarkdown(
      '# Heading\n\nA paragraph with **bold** and a [link](https://example.com).',
    );
    expect(text).toContain('Heading');
    expect(text).toContain('bold');
    expect(text).toContain('link');
    expect(text).not.toContain('https://example.com');
    expect(text).not.toContain('**');
  });
});

describe('calculateMarkdownStats', () => {
  it('counts Chinese characters and English words separately', () => {
    const stats = calculateMarkdownStats('# 标题\n\n你好，world and Markdown。\n\n第二段。');
    expect(stats.chineseCharacters).toBe(7);
    expect(stats.words).toBe(10);
    expect(stats.paragraphs).toBe(3);
    expect(stats.readingMinutes).toBe(1);
  });

  it('returns zeroed metrics for empty content', () => {
    expect(calculateMarkdownStats('')).toMatchObject({
      words: 0,
      characters: 0,
      paragraphs: 0,
      lines: 0,
      readingMinutes: 0,
    });
  });
});

describe('outline helpers', () => {
  it('creates unique anchor ids and ignores fenced code', () => {
    const items = extractOutline('# Hello\n\n## Hello\n\n```md\n# Not a heading\n```');
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe('hello');
    expect(items[1].id).toBe('hello-2');
  });

  it('keeps CJK characters in slugs', () => {
    expect(slugifyHeading('第一章 开始')).toBe('第一章-开始');
  });
});
