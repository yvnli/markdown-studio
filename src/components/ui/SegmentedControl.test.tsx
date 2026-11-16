// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SegmentedControl } from './SegmentedControl';

afterEach(cleanup);

describe('SegmentedControl', () => {
  it('marks the active option and emits changes', async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="视图"
        value="split"
        onChange={onChange}
        options={[
          { value: 'write', label: '写作' },
          { value: 'split', label: '分屏' },
          { value: 'preview', label: '预览' },
        ]}
      />,
    );

    expect(screen.getByRole('button', { name: '分屏' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: '预览' }));
    expect(onChange).toHaveBeenCalledWith('preview');
  });
});
