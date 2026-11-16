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
  // 预览只取当前文档的 path 与 content；path 是原始值，避免因无关字段变化重渲染。
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

  // Ctrl / ⌘ + 滚轮缩放预览。React 的 onWheel 是 passive 的，必须用原生监听才能阻止页面缩放。
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
      aria-label={viewingImage ? '图片预览区' : 'Markdown 预览区'}
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
              aria-label="返回 Markdown 预览"
              onClick={closeImagePreview}
              data-tip="返回 Markdown 预览"
              title="返回 Markdown 预览（Esc）"
            >
              <ArrowLeft size={13} />
              <span>返回</span>
            </button>
          ) : (
            <>
              <PreviewZoomControls zoom={previewZoom} onChange={setPreviewZoom} />
              <button
                type="button"
                className="pane-tool"
                aria-label={syncScroll ? '关闭同步滚动' : '开启同步滚动'}
                aria-pressed={syncScroll}
                onClick={onToggleSync}
                data-tip={syncScroll ? '关闭同步滚动' : '开启同步滚动'}
                title={syncScroll ? '关闭同步滚动' : '开启同步滚动'}
              >
                <RefreshCw size={13} />
                <span>同步</span>
              </button>
              <button
                type="button"
                className="pane-tool"
                aria-label="文档大纲"
                aria-expanded={outlineOpen}
                onClick={onToggleOutline}
                data-tip="文档大纲"
                title="文档大纲"
              >
                <ListTree size={13} />
                <span>大纲</span>
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
