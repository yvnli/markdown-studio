import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { useUIStore } from '../../app/uiStore';
import { useWorkspaceStore } from '../../app/workspaceStore';
import { EditorFindWidget } from './EditorFindWidget';
import { MarkdownEditor } from './MarkdownEditor';
import { setSearchFlashEffect } from './searchHighlight';

interface EditorPaneProps {
  documentId: string;
  fontSize: number;
  onReady: (view: EditorView | null) => void;
  onScrollRatio: (ratio: number) => void;
  onPasteImage: (file: File, documentId: string) => Promise<string | null>;
}

export function EditorPane({
  documentId,
  fontSize,
  onReady,
  onScrollRatio,
  onPasteImage,
}: EditorPaneProps) {
  // 只订阅当前文档：其它文档的内容变化不会触发本组件重渲染。
  const document = useWorkspaceStore(
    (state) => state.documents.find((item) => item.id === documentId) ?? null,
  );
  const updateContent = useWorkspaceStore((state) => state.updateDocumentContent);
  const updateCursor = useWorkspaceStore((state) => state.updateCursor);
  const revealRequest = useUIStore((state) => state.revealRequest);
  const consumeReveal = useUIStore((state) => state.consumeReveal);
  const closeFind = useUIStore((state) => state.closeFind);
  const [view, setView] = useState<EditorView | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const flashTimerRef = useRef<number | null>(null);

  const handleReady = useCallback(
    (next: EditorView | null) => {
      viewRef.current = next;
      setView(next);
      onReady(next);
    },
    [onReady],
  );

  const handleChange = useCallback(
    (content: string) => updateContent(documentId, content),
    [documentId, updateContent],
  );
  const handleCursor = useCallback(
    (line: number, column: number) => updateCursor(documentId, line, column),
    [documentId, updateCursor],
  );
  const handlePasteImage = useCallback(
    (file: File) => onPasteImage(file, documentId),
    [documentId, onPasteImage],
  );

  useEffect(
    () => () => {
      if (flashTimerRef.current) {
        window.clearTimeout(flashTimerRef.current);
        flashTimerRef.current = null;
      }
    },
    [],
  );

  // Reveal a workspace search hit at its exact line/column in the editor.
  useEffect(() => {
    if (!view || !document || !revealRequest || revealRequest.path !== document.path) return;
    const lineNumber = Math.min(Math.max(revealRequest.line, 1), view.state.doc.lines);
    const line = view.state.doc.line(lineNumber);
    const from = Math.min(line.from + Math.max(revealRequest.column - 1, 0), line.to);
    const to = Math.min(from + Math.max(revealRequest.length, 1), line.to);

    closeFind();
    view.dispatch({
      selection: { anchor: from, head: to },
      effects: [
        EditorView.scrollIntoView(from, { y: 'center' }),
        setSearchFlashEffect.of({ from, to }),
      ],
    });
    view.focus();
    consumeReveal(revealRequest.id);

    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => {
      flashTimerRef.current = null;
      if (viewRef.current === view) {
        view.dispatch({ effects: setSearchFlashEffect.of(null) });
      }
    }, 1400);
  }, [closeFind, consumeReveal, document, revealRequest, view]);

  if (!document) return null;

  return (
    <section className="editor-pane" aria-label="Markdown 编辑区">
      <div className="pane-header">
        <span className="pane-label">
          <span className="pane-dot editor-dot" />
          EDITOR
        </span>
        <span className="pane-meta">
          行 {document.cursorLine}，列 {document.cursorColumn}
        </span>
      </div>
      <div className="editor-canvas" style={{ '--editor-font-size': `${fontSize}px` } as React.CSSProperties}>
        <MarkdownEditor
          key={document.id}
          docId={document.id}
          initialContent={document.content}
          content={document.content}
          onChange={handleChange}
          onCursorChange={handleCursor}
          onScrollRatio={onScrollRatio}
          onReady={handleReady}
          onPasteImage={handlePasteImage}
        />
        <EditorFindWidget view={view} content={document.content} />
      </div>
    </section>
  );
}

