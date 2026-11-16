import { describe, expect, it } from 'vitest';
import { transformHeadingLines, transformLinePrefix } from './commands';

describe('transformHeadingLines', () => {
  it('adds and removes heading markers without losing indentation', () => {
    expect(transformHeadingLines(['Heading'], 2)).toEqual(['## Heading']);
    expect(transformHeadingLines(['  ## Heading'], 2)).toEqual(['  Heading']);
    expect(transformHeadingLines(['# Heading', 'Body'], 3)).toEqual(['### Heading', '### Body']);
  });
});

describe('transformLinePrefix', () => {
  it('creates and toggles unordered lists', () => {
    expect(transformLinePrefix(['First item', 'Second item'], 'ul')).toEqual(['- First item', '- Second item']);
    expect(transformLinePrefix(['- First item', '- Second item'], 'ul')).toEqual(['First item', 'Second item']);
  });

  it('numbers ordered list items', () => {
    expect(transformLinePrefix(['First item', 'Second item'], 'ol')).toEqual(['1. First item', '2. Second item']);
  });

  it('creates task lists', () => {
    expect(transformLinePrefix(['To do'], 'task')).toEqual(['- [ ] To do']);
  });
});
