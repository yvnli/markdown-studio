import { useEffect, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react';
import {
  CaseSensitive,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Regex,
  Replace,
  Search,
  WholeWord,
  X,
} from 'lucide-react';
import { useUIStore } from '../../app/uiStore';
import { cn } from '../../utils/cn';
import { altModShortcut } from '../../utils/platform';

interface FindBarProps {
  mode: 'editor' | 'preview';
  matches: number;
  activeIndex: number;
  error: string | null;
  truncated: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  replaceInputRef: RefObject<HTMLInputElement | null>;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onReplaceCurrent: () => void;
  onReplaceAll: () => void;
}

export function FindBar({
  mode,
  matches,
  activeIndex,
  error,
  truncated,
  inputRef,
  replaceInputRef,
  onPrev,
  onNext,
  onClose,
  onReplaceCurrent,
  onReplaceAll,
}: FindBarProps) {
  const query = useUIStore((state) => state.findQuery);
  const replacement = useUIStore((state) => state.findReplacement);
  const caseSensitive = useUIStore((state) => state.findCaseSensitive);
  const wholeWord = useUIStore((state) => state.findWholeWord);
  const useRegex = useUIStore((state) => state.findUseRegex);
  const replaceVisible = useUIStore((state) => state.findReplace);
  const findRequestId = useUIStore((state) => state.findRequestId);
  const setFindQuery = useUIStore((state) => state.setFindQuery);
  const setFindReplacement = useUIStore((state) => state.setFindReplacement);
  const setFindCaseSensitive = useUIStore((state) => state.setFindCaseSensitive);
  const setFindWholeWord = useUIStore((state) => state.setFindWholeWord);
  const setFindUseRegex = useUIStore((state) => state.setFindUseRegex);
  const setFindReplace = useUIStore((state) => state.setFindReplace);

  const canReplace = mode === 'editor';
  const queryRef = useRef(query);
  queryRef.current = query;
  const actionsRef = useRef({ onPrev, onNext, onClose });
  actionsRef.current = { onPrev, onNext, onClose };

  // Focus the find input when the bar opens, and select its text when the
  // shortcut is pressed again.
  useEffect(() => {
    const focusTarget = () => {
      const target =
        canReplace && replaceVisible && queryRef.current
          ? replaceInputRef.current
          : inputRef.current;
      target?.focus();
      target?.select();
    };
    focusTarget();
    const timer = window.setTimeout(focusTarget, 20);
    return () => window.clearTimeout(timer);
  }, [canReplace, findRequestId, inputRef, replaceInputRef, replaceVisible]);

  // F3 / Shift+F3 and ⌘G / Ctrl+G navigate while the bar is visible.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (event.key === 'F3') {
        event.preventDefault();
        if (event.shiftKey) actionsRef.current.onPrev();
        else actionsRef.current.onNext();
        return;
      }
      if (modifier && !event.altKey && event.key.toLowerCase() === 'g') {
        event.preventDefault();
        if (event.shiftKey) actionsRef.current.onPrev();
        else actionsRef.current.onNext();
        return;
      }
      if (event.key === 'Escape') {
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (target?.closest('.modal-backdrop')) return;
        event.preventDefault();
        actionsRef.current.onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleFindKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) onPrev();
      else onNext();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  };

  const handleReplaceKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.metaKey || event.ctrlKey || event.altKey) onReplaceAll();
      else onReplaceCurrent();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  };

  const toggleReplace = () => {
    setFindReplace(!replaceVisible);
  };

  const summary = !query
    ? ''
    : error
      ? '正则无效'
      : matches
        ? `${activeIndex + 1}/${matches}${truncated ? '+' : ''}`
        : '无结果';
  const noResults = Boolean(query) && !error && matches === 0;
  const preview = mode === 'preview';

  return (
    <div
      className={cn('editor-find', preview && 'is-preview')}
      role="search"
      aria-label={preview ? '预览内查找' : '文件内查找与替换'}
      data-find-mode={mode}
    >
      <div className="editor-find-row">
        {canReplace ? (
          <button
            type="button"
            className={cn('editor-find-toggle', replaceVisible && 'is-open')}
            aria-label={replaceVisible ? '隐藏替换' : '显示替换'}
            aria-expanded={replaceVisible}
            title={`${replaceVisible ? '隐藏替换' : '显示替换'} · ${altModShortcut('F')}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={toggleReplace}
          >
            <ChevronRight size={13} />
          </button>
        ) : null}

        <div className="editor-find-field">
          <Search size={13} className="editor-find-icon" />
          <input
            ref={inputRef}
            type="text"
            className="editor-find-input"
            value={query}
            placeholder={preview ? '在预览中查找' : '查找'}
            aria-label={preview ? '在预览中查找' : '在文件中查找'}
            title={preview ? '预览视图仅支持查找，切换到写作或分屏可替换' : undefined}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            onChange={(event) => setFindQuery(event.target.value)}
            onKeyDown={handleFindKeyDown}
          />
          {query ? (
            <button
              type="button"
              className="editor-find-clear"
              aria-label="清除查找"
              title="清除查找"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setFindQuery('');
                inputRef.current?.focus();
              }}
            >
              <X size={12} />
            </button>
          ) : null}
        </div>

        <span className={cn('editor-find-count', noResults && 'is-empty')} aria-live="polite">
          {summary}
        </span>

        <button
          type="button"
          className={cn('editor-find-option', caseSensitive && 'is-active')}
          aria-label="区分大小写"
          aria-pressed={caseSensitive}
          title="区分大小写"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setFindCaseSensitive(!caseSensitive)}
        >
          <CaseSensitive size={14} />
        </button>
        <button
          type="button"
          className={cn('editor-find-option', wholeWord && 'is-active')}
          aria-label="全字匹配"
          aria-pressed={wholeWord}
          title="全字匹配"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setFindWholeWord(!wholeWord)}
        >
          <WholeWord size={14} />
        </button>
        <button
          type="button"
          className={cn('editor-find-option', useRegex && 'is-active')}
          aria-label="使用正则表达式"
          aria-pressed={useRegex}
          title="使用正则表达式"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setFindUseRegex(!useRegex)}
        >
          <Regex size={14} />
        </button>

        <span className="editor-find-separator" aria-hidden="true" />

        <button
          type="button"
          className="editor-find-nav"
          aria-label="上一个匹配"
          title="上一个匹配 (Shift+Enter)"
          disabled={!matches}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onPrev}
        >
          <ChevronUp size={14} />
        </button>
        <button
          type="button"
          className="editor-find-nav"
          aria-label="下一个匹配"
          title="下一个匹配 (Enter)"
          disabled={!matches}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onNext}
        >
          <ChevronDown size={14} />
        </button>
        <button
          type="button"
          className="editor-find-close"
          aria-label="关闭查找"
          title="关闭 (Esc)"
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>

      {canReplace && replaceVisible ? (
        <div className="editor-find-row editor-find-replace-row">
          <span className="editor-find-toggle-spacer" aria-hidden="true" />
          <div className="editor-find-field">
            <Replace size={13} className="editor-find-icon" />
            <input
              ref={replaceInputRef}
              type="text"
              className="editor-find-input"
              value={replacement}
              placeholder="替换"
              aria-label="替换为"
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => setFindReplacement(event.target.value)}
              onKeyDown={handleReplaceKeyDown}
            />
          </div>
          <button
            type="button"
            className="editor-find-action"
            disabled={!matches}
            title="替换当前匹配"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onReplaceCurrent}
          >
            替换
          </button>
          <button
            type="button"
            className="editor-find-action"
            disabled={!matches || Boolean(error)}
            title="全部替换"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onReplaceAll}
          >
            全部替换
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="editor-find-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
