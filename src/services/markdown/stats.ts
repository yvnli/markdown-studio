export interface MarkdownStats {
  words: number;
  characters: number;
  chineseCharacters: number;
  englishCharacters: number;
  paragraphs: number;
  lines: number;
  readingMinutes: number;
}

const CJK_PATTERN = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g;
const CJK_TEST = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;
const LATIN_WORD_PATTERN = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;
const WHITESPACE = /\s/gu;

/**
 * Removes the most common Markdown syntax while preserving the visible prose.
 * Code fence delimiters are removed, code content is kept and counts as text.
 */
export function stripMarkdown(markdown: string): string {
  return (
    markdown
      .replace(/^---\n[\s\S]*?\n---\n?/, '')
      .replace(/```[^\n]*\n?/g, '')
      .replace(/~~~[^\n]*\n?/g, '')
      .replace(/`([^`\n]+)`/g, '$1')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/<https?:\/\/[^>]+>/g, '')
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s{0,3}>\s?/gm, '')
      .replace(/^\s{0,3}(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?/gm, '')
      .replace(/^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/gm, '')
      .replace(/<[^>]+>/g, '')
      .replace(/[*_~|]/g, '')
      .replace(/\u00a0/g, ' ')
  );
}

export function calculateMarkdownStats(markdown: string): MarkdownStats {
  const visible = stripMarkdown(markdown);
  const chineseCharacters = (visible.match(CJK_PATTERN) ?? []).length;
  const englishCharacters = (visible.match(/[A-Za-z]/g) ?? []).length;
  const words = (visible.replace(CJK_PATTERN, ' ').match(LATIN_WORD_PATTERN) ?? []).length;
  const characters = Array.from(visible.replace(WHITESPACE, '')).length;
  const paragraphs = visible
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean).length;
  const lines = markdown.length ? markdown.split(/\r?\n/).length : 0;
  const totalWords = chineseCharacters + words;

  return {
    words: totalWords,
    characters,
    chineseCharacters,
    englishCharacters,
    paragraphs,
    lines,
    readingMinutes: totalWords ? Math.max(1, Math.ceil(totalWords / 300)) : 0,
  };
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value);
}

export function isCjkCharacter(value: string): boolean {
  return CJK_TEST.test(value);
}
