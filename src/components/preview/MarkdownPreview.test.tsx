// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MarkdownPreview } from './MarkdownPreview';

afterEach(cleanup);

describe('MarkdownPreview', () => {
  it('中文出现在数学模式里时不触发 KaTeX strict 警告', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { container } = render(
        <MarkdownPreview
          markdown="按 $每分钟$ 计费"
          documentPath={null}
          theme="light"
          scrollRef={{ current: null }}
          onOutlineChange={() => {}}
        />,
      );

      expect(container.querySelector('.katex')).not.toBeNull();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
