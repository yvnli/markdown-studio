import { describe, expect, it } from 'vitest';
import { transformHeadingLines, transformLinePrefix } from './commands';

describe('transformHeadingLines', () => {
  it('adds and removes heading markers without losing indentation', () => {
    expect(transformHeadingLines(['标题'], 2)).toEqual(['## 标题']);
    expect(transformHeadingLines(['  ## 标题'], 2)).toEqual(['  标题']);
    expect(transformHeadingLines(['# 标题', '正文'], 3)).toEqual(['### 标题', '### 正文']);
  });
});

describe('transformLinePrefix', () => {
  it('creates and toggles unordered lists', () => {
    expect(transformLinePrefix(['第一项', '第二项'], 'ul')).toEqual(['- 第一项', '- 第二项']);
    expect(transformLinePrefix(['- 第一项', '- 第二项'], 'ul')).toEqual(['第一项', '第二项']);
  });

  it('numbers ordered list items', () => {
    expect(transformLinePrefix(['第一项', '第二项'], 'ol')).toEqual(['1. 第一项', '2. 第二项']);
  });

  it('creates task lists', () => {
    expect(transformLinePrefix(['待办'], 'task')).toEqual(['- [ ] 待办']);
  });
});
