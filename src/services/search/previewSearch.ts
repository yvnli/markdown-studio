import { findMatches, type FindMatch, type FindOptions } from './findCore';

export interface PreviewTextSegment {
  node: Text;
  start: number;
  end: number;
}

export interface PreviewTextIndex {
  text: string;
  segments: PreviewTextSegment[];
}

export interface PreviewSearchResult {
  matches: FindMatch[];
  ranges: Range[];
  error: string | null;
  truncated: boolean;
}

export interface PreviewTextPosition {
  node: Text;
  offset: number;
}

const SKIP_SELECTOR = [
  'script',
  'style',
  'noscript',
  'textarea',
  'input',
  'select',
  '[data-search-ignore]',
  '.code-block-header',
  '.mermaid-diagram',
  '.katex-mathml',
  '.preview-empty',
].join(',');

const BLOCK_SELECTOR = [
  'p',
  'li',
  'pre',
  'blockquote',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'td',
  'th',
  'figcaption',
  'dt',
  'dd',
  'summary',
  'details',
].join(',');

function nearestBlock(node: Text, root: HTMLElement): Element {
  let element = node.parentElement;
  while (element && element !== root) {
    if (element.matches(BLOCK_SELECTOR)) return element;
    element = element.parentElement;
  }
  return root;
}

function isSkipped(node: Text): boolean {
  const parent = node.parentElement;
  if (!parent) return true;
  return Boolean(parent.closest(SKIP_SELECTOR));
}

/**
 * Flattens the visible text of the rendered Markdown into a single string while
 * keeping a map back to the original text nodes. Block-level elements are
 * separated by `\n` so phrase searches cannot run across paragraphs.
 */
export function buildPreviewTextIndex(root: HTMLElement | null): PreviewTextIndex {
  if (!root) return { text: '', segments: [] };
  const walker = root.ownerDocument.createTreeWalker(root, 4);
  const segments: PreviewTextSegment[] = [];
  let text = '';
  let lastBlock: Element | null = null;
  let node = walker.nextNode();

  while (node) {
    const textNode = node as Text;
    if (!isSkipped(textNode)) {
      const data = textNode.data;
      if (data) {
        const block = nearestBlock(textNode, root);
        if (lastBlock && block !== lastBlock) text += '\n';
        const start = text.length;
        text += data;
        segments.push({ node: textNode, start, end: text.length });
        lastBlock = block;
      }
    }
    node = walker.nextNode();
  }

  return { text, segments };
}

/**
 * Maps a flat-text offset back to a DOM text node position. `bias` decides
 * which side of a block separator the offset belongs to: a match may not start
 * on a separator, while its end may sit at the end of the previous block.
 */
export function locatePreviewOffset(
  index: PreviewTextIndex,
  offset: number,
  bias: 'start' | 'end' = 'start',
): PreviewTextPosition | null {
  const { segments, text } = index;
  if (!segments.length || offset < 0 || offset > text.length) return null;

  let low = 0;
  let high = segments.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (segments[middle].end < offset) low = middle + 1;
    else {
      found = middle;
      high = middle - 1;
    }
  }
  if (found === -1) return null;
  const segment = segments[found];
  if (offset < segment.start) return null;

  if (offset < segment.end || offset === segment.start) {
    return {
      node: segment.node,
      offset: Math.max(0, Math.min(offset - segment.start, segment.node.data.length)),
    };
  }

  const next = segments[found + 1];
  if (next && next.start === offset) {
    return bias === 'start'
      ? { node: next.node, offset: 0 }
      : { node: segment.node, offset: segment.node.data.length };
  }
  if (bias === 'start') return null;
  return { node: segment.node, offset: segment.node.data.length };
}

export function matchToPreviewRange(index: PreviewTextIndex, match: FindMatch): Range | null {
  const start = locatePreviewOffset(index, match.from, 'start');
  const end = locatePreviewOffset(index, match.to, 'end');
  if (!start || !end) return null;
  const range = start.node.ownerDocument.createRange();
  try {
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
  } catch {
    return null;
  }
  return range;
}

export function searchPreview(
  root: HTMLElement | null,
  options: FindOptions,
  limit?: number,
): PreviewSearchResult {
  const index = buildPreviewTextIndex(root);
  const found = findMatches(index.text, options, limit);
  const matches: FindMatch[] = [];
  const ranges: Range[] = [];
  for (const match of found.matches) {
    const range = matchToPreviewRange(index, match);
    if (!range) continue;
    matches.push(match);
    ranges.push(range);
  }
  return {
    matches,
    ranges,
    error: found.error,
    truncated: found.truncated,
  };
}
