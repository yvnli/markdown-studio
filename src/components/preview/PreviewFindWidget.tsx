import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { usePreferencesStore } from '../../app/preferencesStore';
import { useUIStore } from '../../app/uiStore';
import { searchPreview } from '../../services/search/previewSearch';
import { FindBar } from '../search/FindBar';
import {
  applyPreviewSearchHighlights,
  clearPreviewSearchHighlights,
  scrollPreviewRangeIntoView,
} from './previewSearchHighlight';

interface PreviewFindWidgetProps {
  markdown: string;
  scrollRef: RefObject<HTMLDivElement | null>;
}

interface PreviewSearchState {
  key: string;
  matches: ReturnType<typeof searchPreview>['matches'];
  ranges: Range[];
  error: string | null;
  truncated: boolean;
}

const EMPTY_RESULT: PreviewSearchState = {
  key: '',
  matches: [],
  ranges: [],
  error: null,
  truncated: false,
};

export function PreviewFindWidget({ markdown, scrollRef }: PreviewFindWidgetProps) {
  const isPreview = usePreferencesStore((state) => state.viewMode === 'preview');
  const findOpen = useUIStore((state) => state.findOpen);
  const findQuery = useUIStore((state) => state.findQuery);
  const findCaseSensitive = useUIStore((state) => state.findCaseSensitive);
  const findWholeWord = useUIStore((state) => state.findWholeWord);
  const findUseRegex = useUIStore((state) => state.findUseRegex);
  const findSeed = useUIStore((state) => state.findSeed);
  const closeFind = useUIStore((state) => state.closeFind);
  const consumeFindSeed = useUIStore((state) => state.consumeFindSeed);

  const [search, setSearch] = useState<PreviewSearchState>(EMPTY_RESULT);
  const [activeIndex, setActiveIndex] = useState(0);
  const [revision, setRevision] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isPreview && findOpen && findSeed) consumeFindSeed();
  }, [consumeFindSeed, findOpen, findSeed, isPreview]);

  const options = useMemo(
    () => ({
      query: findQuery,
      caseSensitive: findCaseSensitive,
      wholeWord: findWholeWord,
      regex: findUseRegex,
    }),
    [findCaseSensitive, findQuery, findUseRegex, findWholeWord],
  );
  const queryKey = `${findQuery}\u0000${findCaseSensitive ? '1' : '0'}${findWholeWord ? '1' : '0'}${findUseRegex ? '1' : '0'}`;

  const rebuild = useCallback(() => {
    if (!isPreview || !findOpen || !findQuery) {
      setSearch(EMPTY_RESULT);
      return;
    }
    const next = searchPreview(scrollRef.current, options);
    setSearch({ ...next, key: queryKey });
  }, [findOpen, findQuery, isPreview, options, queryKey, scrollRef]);

  // Rebuild whenever the query, the rendered Markdown or the DOM changes.
  useEffect(() => {
    rebuild();
  }, [markdown, rebuild, revision]);

  useEffect(() => {
    if (!isPreview || !findOpen) return;
    const root = scrollRef.current;
    if (!root) return;
    let frame = 0;
    const observer = new MutationObserver(() => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        setRevision((value) => value + 1);
      });
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [findOpen, isPreview, scrollRef]);

  // Start each new search from the first rendered match.
  useEffect(() => {
    if (!isPreview || !findOpen) return;
    setActiveIndex(0);
  }, [findOpen, isPreview, queryKey]);

  const current = useMemo(
    () => (search.key === queryKey ? search : EMPTY_RESULT),
    [queryKey, search],
  );
  const matches = current.matches;
  const ranges = current.ranges;
  const error = current.error;
  const truncated = current.truncated;
  const safeActiveIndex = matches.length ? Math.min(activeIndex, matches.length - 1) : 0;

  useEffect(() => {
    setActiveIndex((previous) =>
      matches.length ? Math.min(previous, matches.length - 1) : 0,
    );
  }, [matches.length]);

  // Paint the visible matches with the CSS Custom Highlight API.
  useEffect(() => {
    if (!isPreview || !findOpen || !findQuery || current.key !== queryKey) {
      clearPreviewSearchHighlights();
      return;
    }
    applyPreviewSearchHighlights(ranges, safeActiveIndex);
  }, [current.key, findOpen, findQuery, isPreview, queryKey, ranges, safeActiveIndex]);

  useEffect(
    () => () => {
      clearPreviewSearchHighlights();
    },
    [],
  );

  // Keep the active match visible inside the preview scroller.
  useEffect(() => {
    if (!isPreview || !findOpen || !findQuery || current.key !== queryKey) return;
    scrollPreviewRangeIntoView(scrollRef.current, ranges[safeActiveIndex] ?? null);
  }, [current.key, findOpen, findQuery, isPreview, queryKey, ranges, safeActiveIndex, scrollRef]);

  const goToMatch = useCallback(
    (delta: number) => {
      const count = matches.length;
      if (!count) return;
      setActiveIndex((previous) => {
        const current = Math.min(previous, count - 1);
        return (current + delta + count) % count;
      });
    },
    [matches.length],
  );

  const handleClose = useCallback(() => {
    clearPreviewSearchHighlights();
    closeFind();
  }, [closeFind]);

  if (!isPreview || !findOpen) return null;

  return (
    <FindBar
      mode="preview"
      matches={matches.length}
      activeIndex={safeActiveIndex}
      error={error}
      truncated={truncated}
      inputRef={inputRef}
      replaceInputRef={replaceInputRef}
      onPrev={() => goToMatch(-1)}
      onNext={() => goToMatch(1)}
      onClose={handleClose}
      onReplaceCurrent={() => undefined}
      onReplaceAll={() => undefined}
    />
  );
}
