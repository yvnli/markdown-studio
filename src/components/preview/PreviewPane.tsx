import {
  useDeferredValue,
  useEffect,
  type CSSProperties,
  type RefObject,
} from 'react';
import { ArrowLeft, ListTree, RefreshCw } from 'lucide-react';
import { usePreferencesStore } from '../../app/preferencesStore';
import { useUIStore } from '../../app/uiStore';
import { useWorkspaceStore } from '../../app/workspaceStore';
import { normalizePreviewZoom, stepPreviewZoom } from '../../domain/zoom';
import type { OutlineItem } from '../../services/markdown/slug';
import { ImagePreviewPane } from './ImagePreviewPane';
import { MarkdownPreview } from './MarkdownPreview';
import { OutlinePanel } from './OutlinePanel';
import { PreviewFindWidget } from './PreviewFindWidget';
import { PreviewZoomControls } from './PreviewZoomControls';

interface PreviewPaneProps {
  documentId: string | null;
  theme: 'light' | 'dark';
  outline: OutlineItem[];
  outlineOpen: boolean;
  syncScroll: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  onOutlineChange: (items: OutlineItem[]) => void;
  onToggleOutline: () => void;
  onCloseOutline: () => void;
  onSelectOutline: (id: string) => void;
  onScroll: (event: React.UIEvent<HTMLDivElement>) => void;
  onToggleSync: () => void;
  onOpenPath: (path: string) => void;
}

export function PreviewPane({
  documentId,
  theme,
  outline,
  outlineOpen,
  syncScroll,
  scrollRef,
  onOutlineChange,
  onToggleOutline,
  onCloseOutline,
  onSelectOutline,
  onScroll,
  onToggleSync,
  onOpenPath,
}: PreviewPaneProps) {
  // Read only the current document's path and content; path is the raw value, so unrelated
  // field changes do not trigger a re-render.
  const documentPath = useWorkspaceStore(
    (state) => state.documents.find((item) => item.id === documentId)?.path ?? null,
  );
  const content = useWorkspaceStore(
    (state) => state.documents.find((item) => item.id === documentId)?.content ?? '',
  );
  const markdown = useDeferredValue(content);
  const previewZoom = usePreferencesStore((state) => normalizePreviewZoom(state.previewZoom));
  const setPreviewZoom = usePreferencesStore((state) => state.setPreviewZoom);
  const imagePreview = useUIStore((state) => state.imagePreview);
  const closeImagePreview = useUIStore((state) => state.closeImagePreview);
  const viewingImage = Boolean(imagePreview);

  // Ctrl / ⌘ + wheel zooms the preview. React's onWheel is passive, so a native
  // listener is required to prevent browser page zoom.
  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const current = normalizePreviewZoom(usePreferencesStore.getState().previewZoom);
      setPreviewZoom(stepPreviewZoom(current, event.deltaY > 0 ? -1 : 1));
    };
    scroll.addEventListener('wheel', handleWheel, { passive: false });
    return () => scroll.removeEventListener('wheel', handleWheel);
  }, [scrollRef, setPreviewZoom]);

  return (
    <section
      className={`preview-pane${viewingImage && !documentId ? ' is-image-only' : ''}`}
      aria-label={viewingImage ? 'Image preview' : 'Markdown preview'}
      style={{ '--preview-zoom': previewZoom } as CSSProperties}
    >
      <div className="pane-header">
        <span className="pane-label">
          <span className="pane-dot preview-dot" />
          {viewingImage ? 'IMAGE' : 'PREVIEW'}
        </span>
        <div className="pane-actions">
          {viewingImage ? (
            <button
              type="button"
              className="pane-tool"
              aria-label="Back to Markdown preview"
              onClick={closeImagePreview}
              data-tip="Back to Markdown preview"
              title="Back to Markdown preview (Esc)"
            >
              <ArrowLeft size={13} />
              <span>Back</span>
            </button>
          ) : (
            <>
              <PreviewZoomControls zoom={previewZoom} onChange={setPreviewZoom} />
              <button
                type="button"
                className="pane-tool"
                aria-label={syncScroll ? 'Turn off sync scrolling' : 'Turn on sync scrolling'}
                aria-pressed={syncScroll}
                onClick={onToggleSync}
                data-tip={syncScroll ? 'Turn off sync scrolling' : 'Turn on sync scrolling'}
                title={syncScroll ? 'Turn off sync scrolling' : 'Turn on sync scrolling'}
              >
                <RefreshCw size={13} />
                <span>Sync</span>
              </button>
              <button
                type="button"
                className="pane-tool"
                aria-label="Document outline"
                aria-expanded={outlineOpen}
                onClick={onToggleOutline}
                data-tip="Document outline"
                title="Document outline"
              >
                <ListTree size={13} />
                <span>Outline</span>
              </button>
            </>
          )}
        </div>
      </div>
      <MarkdownPreview
        markdown={markdown}
        documentPath={documentPath}
        theme={theme}
        scrollRef={scrollRef}
        onOutlineChange={onOutlineChange}
        onOpenPath={onOpenPath}
        onScroll={onScroll}
        inactive={viewingImage}
      />
      {viewingImage ? (
        <ImagePreviewPane
          key={imagePreview?.id}
          request={imagePreview!}
          onClose={closeImagePreview}
        />
      ) : (
        <>
          <PreviewFindWidget markdown={markdown} scrollRef={scrollRef} />
          <OutlinePanel
            open={outlineOpen}
            items={outline}
            onClose={onCloseOutline}
            onSelect={onSelectOutline}
          />
        </>
      )}
    </section>
  );
}
