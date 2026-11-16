// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildPreviewTextIndex,
  locatePreviewOffset,
  searchPreview,
} from './previewSearch';

function mount(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('buildPreviewTextIndex', () => {
  it('flattens inline text and separates block elements with newlines', () => {
    const root = mount('<p>Hello <strong>world</strong></p><p>second line</p>');
    const index = buildPreviewTextIndex(root);
    expect(index.text).toBe('Hello world\nsecond line');
    expect(index.segments).toHaveLength(3);
  });

  it('skips code block chrome and hidden duplicate markup', () => {
    const root = mount(`
      <div class="code-block">
        <div class="code-block-header"><span>ts</span><button>Copy</button></div>
        <pre><code>const x = 1;</code></pre>
      </div>
      <span class="katex-mathml">hidden math</span>
      <div class="preview-empty">empty state</div>
    `);
    const index = buildPreviewTextIndex(root);
    expect(index.text).toContain('const x = 1;');
    expect(index.text).not.toContain('Copy');
    expect(index.text).not.toContain('hidden math');
    expect(index.text).not.toContain('empty state');
  });
});

describe('locatePreviewOffset', () => {
  it('maps offsets to text nodes and rejects block separators', () => {
    const root = mount('<p>Hello <strong>world</strong></p><p>second</p>');
    const index = buildPreviewTextIndex(root);
    const world = index.text.indexOf('world');
    const position = locatePreviewOffset(index, world);
    expect(position?.node.data).toBe('world');
    expect(position?.offset).toBe(0);

    const separator = index.text.indexOf('\n');
    expect(separator).toBeGreaterThan(0);
    expect(locatePreviewOffset(index, separator, 'start')).toBeNull();
    expect(locatePreviewOffset(index, separator, 'end')?.node.data).toBe('world');
  });
});

describe('searchPreview', () => {
  it('finds phrases that span inline markup', () => {
    const root = mount('<p>Hello <strong>world</strong></p><p>second line</p>');
    const result = searchPreview(root, { query: 'Hello world' });
    expect(result.matches).toHaveLength(1);
    expect(result.ranges[0].toString()).toBe('Hello world');
  });

  it('does not match phrases across block boundaries', () => {
    const root = mount('<p>alpha</p><p>beta</p>');
    expect(searchPreview(root, { query: 'alphabeta' }).matches).toHaveLength(0);
    expect(searchPreview(root, { query: 'alpha' }).matches).toHaveLength(1);
  });

  it('honours case sensitivity and returns Range objects', () => {
    const root = mount('<p>Hello world</p>');
    expect(searchPreview(root, { query: 'hello', caseSensitive: true }).matches).toHaveLength(0);
    const insensitive = searchPreview(root, { query: 'hello', caseSensitive: false });
    expect(insensitive.matches).toHaveLength(1);
    expect(insensitive.ranges[0].toString()).toBe('Hello');
  });

  it('supports regular expressions and whole-word matching', () => {
    const root = mount('<p>cat concatenate cat</p>');
    expect(searchPreview(root, { query: 'cat', wholeWord: true }).matches).toHaveLength(2);
    const regex = searchPreview(root, { query: 'c[a-z]+', regex: true });
    expect(regex.matches.length).toBeGreaterThanOrEqual(2);
  });

  it('reports invalid regular expressions without throwing', () => {
    const root = mount('<p>text</p>');
    const result = searchPreview(root, { query: '[', regex: true });
    expect(result.error).toBeTruthy();
    expect(result.matches).toHaveLength(0);
  });
});
