import { useDeferredValue, useMemo } from 'react';
import { HardDrive, Cloud } from 'lucide-react';
import { useWorkspaceStore } from '../../app/workspaceStore';
import { isDocumentDirty } from '../../domain/document';
import { calculateMarkdownStats, formatNumber } from '../../services/markdown/stats';
import { useWorkspaceActionsContext } from '../../hooks/WorkspaceActionsContext';

export function StatusBar() {
  const document = useWorkspaceStore((state) =>
    state.documents.find((item) => item.id === state.activeDocumentId),
  );
  const workspaceKind = useWorkspaceStore((state) => state.workspace.kind);
  const workspaceStatus = useWorkspaceStore((state) => state.workspaceStatus);
  const { saveDocument } = useWorkspaceActionsContext();
  const deferredContent = useDeferredValue(document?.content ?? '');
  const stats = useMemo(() => calculateMarkdownStats(deferredContent), [deferredContent]);

  const saveLabel = !document
    ? 'No document open'
    : isDocumentDirty(document)
      ? 'Unsaved'
      : document.origin === 'workspace'
        ? workspaceStatus === 'connected' && workspaceKind === 'file-system'
          ? 'Saved to disk'
          : 'Local draft'
        : document.origin === 'sample'
          ? 'Sample document'
          : 'Local draft';

  return (
    <footer className="status-bar">
      <div className="status-left">
        <button
          type="button"
          className={`status-save ${isDocumentDirty(document) ? 'is-dirty' : ''}`}
          onClick={() => {
            if (document) void saveDocument(document.id);
          }}
          disabled={!document}
          title={document?.origin === 'workspace' ? 'Save to local file' : 'Save a Markdown copy'}
        >
          <span className="status-dot" />
          {saveLabel}
        </button>
        {document ? (
          <>
            <span className="status-separator" />
            <span className="status-path" title={document.path ?? 'Untitled draft'}>
              {workspaceKind === 'file-system' ? <HardDrive size={11} /> : <Cloud size={11} />}
              {document.path ?? 'Untitled draft'}
            </span>
          </>
        ) : null}
      </div>

      <div className="status-right">
        <span className="status-stat" title="Words in this document">
          <b>{formatNumber(stats.words)}</b> {stats.words === 1 ? 'word' : 'words'}
        </span>
        <span className="status-separator optional-stat" />
        <span className="status-stat optional-stat" title="Visible characters, excluding whitespace">
          <b>{formatNumber(stats.characters)}</b> {stats.characters === 1 ? 'character' : 'characters'}
        </span>
        <span className="status-separator optional-stat" />
        <span className="status-stat optional-stat" title="Body blocks separated by blank lines">
          <b>{formatNumber(stats.paragraphs)}</b> {stats.paragraphs === 1 ? 'paragraph' : 'paragraphs'}
        </span>
        <span className="status-separator" />
        <span className="status-stat" title="Estimated at 300 words per minute">
          About <b>{formatNumber(stats.readingMinutes)}</b> min
        </span>
        <span className="status-separator" />
        <span className="status-stat status-position">
          {document ? `Line ${document.cursorLine}, Col ${document.cursorColumn}` : 'Line 1, Col 1'}
        </span>
      </div>
    </footer>
  );
}
