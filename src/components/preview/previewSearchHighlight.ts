const ALL_HIGHLIGHT = 'md-preview-search';
const ACTIVE_HIGHLIGHT = 'md-preview-search-active';

function highlightRegistry(): HighlightRegistry | null {
  if (typeof CSS === 'undefined' || typeof Highlight === 'undefined') return null;
  return CSS.highlights ?? null;
}

export function applyPreviewSearchHighlights(ranges: Range[], activeIndex: number): void {
  const registry = highlightRegistry();
  if (!registry) return;
  const inactive: AbstractRange[] = [];
  ranges.forEach((range, index) => {
    if (index !== activeIndex) inactive.push(range);
  });
  if (inactive.length) registry.set(ALL_HIGHLIGHT, new Highlight(...inactive));
  else registry.delete(ALL_HIGHLIGHT);
  const active = ranges[activeIndex];
  if (active) registry.set(ACTIVE_HIGHLIGHT, new Highlight(active));
  else registry.delete(ACTIVE_HIGHLIGHT);
}

export function clearPreviewSearchHighlights(): void {
  const registry = highlightRegistry();
  if (!registry) return;
  registry.delete(ALL_HIGHLIGHT);
  registry.delete(ACTIVE_HIGHLIGHT);
}

export function scrollPreviewRangeIntoView(
  scroll: HTMLElement | null,
  range: Range | null,
): void {
  if (!scroll || !range) return;
  const rect = range.getBoundingClientRect();
  const container = scroll.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    const element =
      range.startContainer.parentElement ??
      (range.startContainer.nodeType === Node.ELEMENT_NODE
        ? (range.startContainer as Element)
        : null);
    element?.scrollIntoView({ block: 'center', behavior: 'auto' });
    return;
  }

  const overlayMargin = 56;
  const isVisible =
    rect.top >= container.top + overlayMargin &&
    rect.bottom <= container.bottom - 16 &&
    rect.bottom >= container.top &&
    rect.top <= container.bottom;
  if (isVisible) return;

  const target =
    scroll.scrollTop +
    rect.top -
    container.top -
    Math.max(overlayMargin, scroll.clientHeight / 2 - rect.height / 2);
  scroll.scrollTo({ top: Math.max(0, target), behavior: 'auto' });
}
