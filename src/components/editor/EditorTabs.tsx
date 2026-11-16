import { FileText, Plus, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '../../app/uiStore';
import { useWorkspaceStore } from '../../app/workspaceStore';
import { isDocumentDirty } from '../../domain/document';
import { cn } from '../../utils/cn';

export function EditorTabs() {
  const ids = useWorkspaceStore(useShallow((state) => state.documents.map((document) => document.id)));
  const titles = useWorkspaceStore(
    useShallow((state) => state.documents.map((document) => document.title)),
  );
  const dirtyFlags = useWorkspaceStore(
    useShallow((state) => state.documents.map((document) => isDocumentDirty(document))),
  );
  const paths = useWorkspaceStore(
    useShallow((state) => state.documents.map((document) => document.path)),
  );
  const activeId = useWorkspaceStore((state) => state.activeDocumentId);
  const setActive = useWorkspaceStore((state) => state.setActiveDocument);
  const closeDocument = useWorkspaceStore((state) => state.closeDocument);
  const newScratchDocument = useWorkspaceStore((state) => state.newScratchDocument);
  const openDialog = useUIStore((state) => state.openDialog);

  const requestClose = (id: string, title: string, dirty: boolean) => {
    if (dirty) {
      setActive(id);
      openDialog({ type: 'close-document', documentId: id, title });
    } else {
      closeDocument(id);
    }
  };

  return (
    <div className="editor-tabs-bar">
      <div className="editor-tabs" role="tablist" aria-label="打开的文档">
        {ids.length === 0 ? <span className="editor-tabs-empty">还没有打开的文档</span> : null}
        {ids.map((id, index) => {
          const title = titles[index] ?? '';
          const dirty = dirtyFlags[index] ?? false;
          const active = id === activeId;
          return (
            <div
              key={id}
              className={cn('editor-tab', active && 'is-active')}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              title={paths[index] ?? title}
              onClick={() => setActive(id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setActive(id);
                }
              }}
            >
              <FileText size={13} className="editor-tab-icon" aria-hidden="true" />
              <span className="editor-tab-title">{title}</span>
              {dirty ? <span className="editor-tab-dirty" aria-label="未保存" /> : null}
              <button
                type="button"
                className="editor-tab-close"
                aria-label={`关闭 ${title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  requestClose(id, title, dirty);
                }}
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="new-tab-button"
        onClick={newScratchDocument}
        aria-label="新建空白文档"
        data-tip="新建空白文档 · ⌘N"
        title="新建空白文档 · ⌘N"
      >
        <Plus size={15} />
      </button>
    </div>
  );
}
