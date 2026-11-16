import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightSpecialChars,
  keymap,
  placeholder,
  scrollPastEnd,
} from '@codemirror/view';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentLess,
  indentMore,
} from '@codemirror/commands';
import {
  bracketMatching,
  indentOnInput,
  indentUnit,
} from '@codemirror/language';
import {
  markdown,
  markdownKeymap,
  markdownLanguage,
} from '@codemirror/lang-markdown';
import { livePreviewExtension } from './livePreview';
import { markdownEditorTheme } from './editorTheme';
import { insertImageMarkdown, runFormatAction } from './commands';
import { searchHighlightExtension } from './searchHighlight';

interface MarkdownEditorProps {
  docId: string;
  initialContent: string;
  content: string;
  onChange: (content: string) => void;
  onCursorChange: (line: number, column: number) => void;
  onScrollRatio: (ratio: number) => void;
  onReady: (view: EditorView | null) => void;
  onPasteImage?: (file: File) => Promise<string | null>;
}

function cursorLabel(state: EditorState): { line: number; column: number } {
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  return { line: line.number, column: head - line.from + 1 };
}

function insertAtSelection(view: EditorView, text: string): void {
  insertImageMarkdown(view, text);
}

export function MarkdownEditor({
  docId,
  initialContent,
  content,
  onChange,
  onCursorChange,
  onScrollRatio,
  onReady,
  onPasteImage,
}: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onCursorRef = useRef(onCursorChange);
  const onScrollRef = useRef(onScrollRatio);
  const onReadyRef = useRef(onReady);
  const onPasteRef = useRef(onPasteImage);
  const pasteBusyRef = useRef(false);

  onChangeRef.current = onChange;
  onCursorRef.current = onCursorChange;
  onScrollRef.current = onScrollRatio;
  onReadyRef.current = onReady;
  onPasteRef.current = onPasteImage;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const state = EditorState.create({
      doc: initialContent,
      extensions: [
        history(),
        drawSelection(),
        dropCursor(),
        highlightActiveLine(),
        highlightSpecialChars(),
        bracketMatching(),
        indentOnInput(),
        indentUnit.of('  '),
        EditorState.tabSize.of(2),
        EditorState.allowMultipleSelections.of(true),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({
          'aria-label': 'Markdown editor',
          spellcheck: 'false',
          autocapitalize: 'off',
          autocorrect: 'off',
        }),
        markdown({
          base: markdownLanguage,
          addKeymap: false,
          completeHTMLTags: false,
        }),
        markdownEditorTheme,
        livePreviewExtension,
        searchHighlightExtension,
        placeholder('Start with a sentence…'),
        scrollPastEnd(),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
          if (update.selectionSet || update.docChanged) {
            const position = cursorLabel(update.state);
            onCursorRef.current(position.line, position.column);
          }
        }),
        keymap.of([
          { key: 'Tab', run: indentMore, shift: indentLess },
          { key: 'Mod-b', run: (view) => runFormatAction(view, 'bold') },
          { key: 'Mod-i', run: (view) => runFormatAction(view, 'italic') },
          { key: 'Mod-k', run: (view) => runFormatAction(view, 'link') },
          ...markdownKeymap,
          ...historyKeymap,
          ...defaultKeymap,
        ]),
        EditorView.domEventHandlers({
          paste(event, view) {
            const items = event.clipboardData?.items;
            if (!items || !onPasteRef.current) return false;
            const imageItem = Array.from(items).find((item) => item.type.startsWith('image/'));
            const file = imageItem?.getAsFile();
            if (!file) return false;
            event.preventDefault();
            if (pasteBusyRef.current) return true;
            pasteBusyRef.current = true;
            void onPasteRef.current(file)
              .then((markdown) => {
                if (markdown) insertAtSelection(view, markdown);
              })
              .catch(() => undefined)
              .finally(() => {
                pasteBusyRef.current = false;
              });
            return true;
          },
          drop(event, view) {
            const files = Array.from(event.dataTransfer?.files ?? []).filter((file) =>
              file.type.startsWith('image/'),
            );
            if (!files.length || !onPasteRef.current) return false;
            event.preventDefault();
            const file = files[0];
            void onPasteRef.current(file)
              .then((markdown) => {
                if (markdown) insertAtSelection(view, markdown);
              })
              .catch(() => undefined);
            return true;
          },
        }),
      ],
    });

    const view = new EditorView({ state, parent: host });
    viewRef.current = view;
    onReadyRef.current(view);

    const handleScroll = () => {
      const scroll = view.scrollDOM;
      const range = scroll.scrollHeight - scroll.clientHeight;
      onScrollRef.current(range > 0 ? scroll.scrollTop / range : 0);
    };
    view.scrollDOM.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      view.scrollDOM.removeEventListener('scroll', handleScroll);
      view.destroy();
      viewRef.current = null;
      onReadyRef.current(null);
    };
    // The editor is intentionally mounted once per document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === content) return;
    const selection = view.state.selection.main;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: content },
      selection: { anchor: Math.min(selection.anchor, content.length) },
    });
  }, [content]);

  return <div className="markdown-editor" ref={hostRef} />;
}
