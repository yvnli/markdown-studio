import { describe, expect, it, vi } from 'vitest';
import { markdownToHtml } from './markdownToHtml';

describe('markdownToHtml', () => {
  it('中文出现在数学模式里时不触发 KaTeX strict 警告', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const html = await markdownToHtml('按 $每分钟$ 计费，公式为 $E = mc^2$。');
      expect(html).toContain('class="katex"');
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('真正的 LaTeX 语法错误仍然标记为 katex-error', async () => {
    const html = await markdownToHtml('$\\frac{1}$');
    expect(html).toContain('katex-error');
  });
});
