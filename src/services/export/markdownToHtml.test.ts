import { describe, expect, it, vi } from 'vitest';
import { markdownToHtml } from './markdownToHtml';

describe('markdownToHtml', () => {
  it('does not trigger a KaTeX strict warning when Chinese appears in math mode', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const html = await markdownToHtml('按 $每分钟$ 计费，公式为 $E = mc^2$。');
      expect(html).toContain('class="katex"');
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('still marks genuine LaTeX syntax errors as katex-error', async () => {
    const html = await markdownToHtml('$\\frac{1}$');
    expect(html).toContain('katex-error');
  });
});
