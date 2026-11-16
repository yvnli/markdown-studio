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
        label="View"
        value="split"
        onChange={onChange}
        options={[
          { value: 'write', label: 'Write' },
          { value: 'split', label: 'Split' },
          { value: 'preview', label: 'Preview' },
        ]}
      />,
    );

    expect(screen.getByRole('button', { name: 'Split' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(onChange).toHaveBeenCalledWith('preview');
  });
});
