import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorView as CodeMirrorView, type EditorView } from '@codemirror/view';
import { useUIStore } from '../../app/uiStore';
import {
  findMatches,
  replaceAllMatches,
  replacementForMatch,
  type FindMatch,
  type FindOptions,
  type FindResult,
} from '../../services/search/findCore';
import { FindBar } from '../search/FindBar';
import { setSearchHighlightsEffect } from './searchHighlight';

interface EditorFindWidgetProps {
  view: EditorView | null;
  content: string;
}

const EMPTY_RESULT: FindResult = { matches: [], error: null, truncated: false };

export function EditorFindWidget({ view, content }: EditorFindWidgetProps) {
  const findOpen = useUIStore((state) => state.findOpen);
  const findReplace = useUIStore((state) => state.findReplace);
  const findQuery = useUIStore((state) => state.findQuery);
  const findReplacement = useUIStore((state) => state.findReplacement);
  const findCaseSensitive = useUIStore((state) => state.findCaseSensitive);
  const findWholeWord = useUIStore((state) => state.findWholeWord);
  const findUseRegex = useUIStore((state) => state.findUseRegex);
  const findSeed = useUIStore((state) => state.findSeed);
  const setFindQuery = useUIStore((state) => state.setFindQuery);
  const consumeFindSeed = useUIStore((state) => state.consumeFindSeed);
  const closeFind = useUIStore((state) => state.closeFind);
  const pushToast = useUIStore((state) => state.pushToast);

  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const viewRef = useRef<EditorView | null>(view);
  const matchesRef = useRef<FindMatch[]>([]);
  const activeRef = useRef(0);

  viewRef.current = view;

  const options = useMemo<FindOptions>(
    () => ({
      query: findQuery,
      caseSensitive: findCaseSensitive,
      wholeWord: findWholeWord,
      regex: findUseRegex,
    }),
    [findCaseSensitive, findQuery, findUseRegex, findWholeWord],
  );

  const result = useMemo(
    () => (findOpen && findQuery ? findMatches(content, options) : EMPTY_RESULT),
    [content, findOpen, findQuery, options],
  );
  const matches = result.matches;
  const safeActiveIndex = matches.length ? Math.min(activeIndex, matches.length - 1) : 0;

  matchesRef.current = matches;
  activeRef.current = safeActiveIndex;

  const revealMatch = useCallback((match: FindMatch | undefined) => {
    const editor = viewRef.current;
    if (!editor || !match) return;
    editor.dispatch({
      selection: { anchor: match.from, head: match.to },
      effects: CodeMirrorView.scrollIntoView(match.from, { y: 'nearest', yMargin: 48 }),
    });
  }, []);

  const goToMatch = useCallback(
    (delta: number) => {
      const list = matchesRef.current;
      if (!list.length) return;
      const nextIndex = (activeRef.current + delta + list.length) % list.length;
      activeRef.current = nextIndex;
      setActiveIndex(nextIndex);
      revealMatch(list[nextIndex]);
    },
    [revealMatch],
  );

  const handleClose = useCallback(() => {
    closeFind();
    window.setTimeout(() => viewRef.current?.focus(), 0);
  }, [closeFind]);

  // Seed the query from the current selection when the widget is opened.
  useEffect(() => {
    if (!findOpen || !findSeed) return;
    consumeFindSeed();
    const editor = viewRef.current;
    const selection = editor?.state.selection.main;
    if (!editor || !selection || selection.empty) return;
    const selected = editor.state.sliceDoc(selection.from, selection.to);
    if (!selected || selected.length > 300 || selected.includes('\n')) return;
    setFindQuery(selected);
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }, [consumeFindSeed, findOpen, findSeed, setFindQuery]);

  const queryKey = `${findQuery}\u0000${findCaseSensitive ? '1' : '0'}${findWholeWord ? '1' : '0'}${findUseRegex ? '1' : '0'}`;

  // When the query or one of its options changes, reveal the match nearest the caret.
  useEffect(() => {
    if (!findOpen) return;
    const editor = viewRef.current;
    if (!editor) return;
    const list = matchesRef.current;
    if (!findQuery || !list.length) {
      setActiveIndex(0);
      return;
    }
    const selection = editor.state.selection.main;
    let nextIndex = list.findIndex(
      (match) => match.from === selection.from && match.to === selection.to,
    );
    if (nextIndex === -1) nextIndex = list.findIndex((match) => match.from >= selection.head);
    if (nextIndex === -1) nextIndex = 0;
    setActiveIndex(nextIndex);
    revealMatch(list[nextIndex]);
  }, [findOpen, findQuery, queryKey, revealMatch, view]);

  // Keep the editor decorations in sync with the current result set.
  useEffect(() => {
    const editor = viewRef.current;
    if (!editor) return;
    if (!findOpen || !findQuery) {
      editor.dispatch({ effects: setSearchHighlightsEffect.of(null) });
      return;
    }
    editor.dispatch({
      effects: setSearchHighlightsEffect.of({ matches, activeIndex: safeActiveIndex }),
    });
  }, [findOpen, findQuery, matches, safeActiveIndex, view]);

  const handleReplaceCurrent = useCallback(() => {
    const editor = viewRef.current;
    const match = matchesRef.current[activeRef.current];
    if (!editor || !match || !findQuery) return;
    const currentOptions: FindOptions = {
      query: findQuery,
      caseSensitive: findCaseSensitive,
      wholeWord: findWholeWord,
      regex: findUseRegex,
    };
    const text = editor.state.doc.toString();
    const replaced = replacementForMatch(text, match, currentOptions, findReplacement);
    const cursor = match.from + replaced.length;
    editor.dispatch({
      changes: { from: match.from, to: match.to, insert: replaced },
      selection: { anchor: cursor },
    });

    const nextMatches = findMatches(editor.state.doc.toString(), currentOptions).matches;
    matchesRef.current = nextMatches;
    let nextIndex = nextMatches.findIndex((candidate) => candidate.from >= cursor);
    if (nextIndex === -1) nextIndex = 0;
    const nextMatch = nextMatches[nextIndex];
    if (nextMatch) {
      activeRef.current = nextIndex;
      setActiveIndex(nextIndex);
      editor.dispatch({
        selection: { anchor: nextMatch.from, head: nextMatch.to },
        effects: [
          setSearchHighlightsEffect.of({ matches: nextMatches, activeIndex: nextIndex }),
          CodeMirrorView.scrollIntoView(nextMatch.from, { y: 'nearest', yMargin: 48 }),
        ],
      });
    } else {
      activeRef.current = 0;
      setActiveIndex(0);
      editor.dispatch({ effects: setSearchHighlightsEffect.of(null) });
    }
    const focusTarget = findReplace ? replaceInputRef.current : inputRef.current;
    focusTarget?.focus();
  }, [
    findCaseSensitive,
    findQuery,
    findReplace,
    findReplacement,
    findUseRegex,
    findWholeWord,
  ]);

  const handleReplaceAll = useCallback(() => {
    const editor = viewRef.current;
    if (!editor || !findQuery) return;
    const currentOptions: FindOptions = {
      query: findQuery,
      caseSensitive: findCaseSensitive,
      wholeWord: findWholeWord,
      regex: findUseRegex,
    };
    const text = editor.state.doc.toString();
    const outcome = replaceAllMatches(text, currentOptions, findReplacement);
    if (outcome.error || !outcome.count || outcome.content === text) return;
    const anchor = Math.min(editor.state.selection.main.head, outcome.content.length);
    editor.dispatch({
      changes: { from: 0, to: text.length, insert: outcome.content },
      selection: { anchor },
      effects: setSearchHighlightsEffect.of(null),
    });
    matchesRef.current = [];
    activeRef.current = 0;
    setActiveIndex(0);
    pushToast({
      title: `已替换 ${outcome.count} 处`,
      description: outcome.truncated ? '匹配过多，仅替换了前一部分。' : undefined,
      tone: 'success',
      durationMs: 1800,
    });
    replaceInputRef.current?.focus();
  }, [findCaseSensitive, findQuery, findReplacement, findUseRegex, findWholeWord, pushToast]);

  if (!findOpen) return null;

  return (
    <FindBar
      mode="editor"
      matches={matches.length}
      activeIndex={safeActiveIndex}
      error={result.error}
      truncated={result.truncated}
      inputRef={inputRef}
      replaceInputRef={replaceInputRef}
      onPrev={() => goToMatch(-1)}
      onNext={() => goToMatch(1)}
      onClose={handleClose}
      onReplaceCurrent={handleReplaceCurrent}
      onReplaceAll={handleReplaceAll}
    />
  );
}
