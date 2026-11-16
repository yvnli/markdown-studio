import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { FileImage, ImageOff, Loader2, Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import type { ImagePreviewRequest } from '../../app/uiStore';
import { useUIStore } from '../../app/uiStore';
import { useWorkspaceStore } from '../../app/workspaceStore';
import {
  analyzeImagePath,
  formatFileSize,
  imageFormatLabel,
  isRemoteImageSource,
  SUPPORTED_IMAGE_FORMATS_LABEL,
} from '../../domain/imagePath';
import {
  fitImageZoom,
  formatZoomPercent,
  normalizeImageZoom,
  stepImageZoom,
} from '../../domain/zoom';
import { workspaceService } from '../../services/file-system';
import { getFileName } from '../../utils/paths';

interface ImagePreviewPaneProps {
  request: ImagePreviewRequest;
  onClose: () => void;
}

interface NaturalSize {
  width: number;
  height: number;
}

/**
 * 预览区内的图片查看器：只覆盖 Markdown 预览面板的内容区，
 * 不占用应用标题栏、侧栏或编辑区。
 */
export function ImagePreviewPane({ request, onClose }: ImagePreviewPaneProps) {
  const titleId = useId();
  const [source, setSource] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [natural, setNatural] = useState<NaturalSize>({ width: 0, height: 0 });
  const [scale, setScale] = useState(1);
  const [fitScale, setFitScale] = useState(1);
  const [dragging, setDragging] = useState(false);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const anchorRef = useRef<{
    ratioX: number;
    ratioY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const openImagePreview = useUIStore((state) => state.openImagePreview);
  const imageFiles = useWorkspaceStore((state) => state.treeIndex.imageFiles);

  const analysis = useMemo(
    () =>
      analyzeImagePath(request.src, request.documentPath, imageFiles, {
        connected: workspaceService.isConnected,
      }),
    [imageFiles, request.documentPath, request.src],
  );

  const title =
    request.title?.trim() ||
    (analysis.kind === 'local'
      ? getFileName(analysis.resolvedPath ?? '') || '图片预览'
      : analysis.kind === 'external'
        ? getFileName(request.src.split(/[?#]/)[0] ?? '') || '网络图片'
        : analysis.kind === 'data'
          ? '内嵌图片'
          : '图片预览');

  const displayPath =
    request.pathLabel?.trim() ||
    (analysis.kind === 'local'
      ? analysis.resolvedPath ?? request.src
      : analysis.kind === 'data'
        ? '内嵌 Data URL 图片'
        : request.src);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setSource(null);
    setNatural({ width: 0, height: 0 });
    setScale(1);
    setFitScale(1);
    if (!request.src) {
      setStatus('error');
      return;
    }
    if (isRemoteImageSource(request.src)) {
      setSource(request.src);
      return;
    }
    if (!workspaceService.isConnected) {
      setStatus('error');
      return;
    }
    void workspaceService
      .resolveAssetObjectUrl(request.documentPath, request.src)
      .then((url) => {
        if (!cancelled) setSource(url);
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [request.documentPath, request.id, request.src]);

  const applyFit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !natural.width || !natural.height) {
      setScale(1);
      return;
    }
    const next = fitImageZoom(
      natural.width,
      natural.height,
      canvas.clientWidth - 68,
      canvas.clientHeight - 68,
    );
    setFitScale(next);
    setScale(next);
  }, [natural.height, natural.width]);

  const handleLoad = () => {
    const image = imageRef.current;
    if (!image) return;
    const width = image.naturalWidth || 0;
    const height = image.naturalHeight || 0;
    setNatural({ width, height });
    const canvas = canvasRef.current;
    const fit =
      width && height && canvas
        ? fitImageZoom(width, height, canvas.clientWidth - 68, canvas.clientHeight - 68)
        : 1;
    setFitScale(fit);
    setScale(fit);
    setStatus('ready');
  };

  const zoomBy = useCallback((direction: 1 | -1) => {
    setScale((previous) => stepImageZoom(previous, direction));
  }, []);

  // Ctrl / ⌘ + 滚轮缩放，并以鼠标位置为锚点调整滚动。
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      if (!natural.width || !natural.height) return;
      const current = scaleRef.current;
      const next = stepImageZoom(current, event.deltaY > 0 ? -1 : 1);
      if (next === current) return;
      const rect = canvas.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      anchorRef.current = {
        ratioX: (canvas.scrollLeft + offsetX) / (natural.width * current),
        ratioY: (canvas.scrollTop + offsetY) / (natural.height * current),
        offsetX,
        offsetY,
      };
      scaleRef.current = next;
      setScale(next);
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [natural.height, natural.width]);

  useEffect(() => {
    const anchor = anchorRef.current;
    const canvas = canvasRef.current;
    if (!anchor || !canvas || !natural.width || !natural.height) return;
    anchorRef.current = null;
    canvas.scrollLeft = natural.width * scale * anchor.ratioX - anchor.offsetX;
    canvas.scrollTop = natural.height * scale * anchor.ratioY - anchor.offsetY;
  }, [natural.height, natural.width, scale]);

  // 预览区不是模态层：编辑区、侧栏仍可操作，因此只在非输入状态下响应快捷键。
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], .cm-editor')) {
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier) return;
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        zoomBy(1);
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        zoomBy(-1);
      } else if (event.key === '0') {
        event.preventDefault();
        applyFit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [applyFit, onClose, zoomBy]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('button')) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      left: canvas.scrollLeft,
      top: canvas.scrollTop,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas) return;
    canvas.scrollLeft = drag.left - (event.clientX - drag.x);
    canvas.scrollTop = drag.top - (event.clientY - drag.y);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
  };

  const imageStyle: CSSProperties =
    natural.width > 0
      ? {
          width: Math.max(1, Math.round(natural.width * scale)),
          height: natural.height > 0 ? 'auto' : undefined,
          opacity: status === 'ready' ? 1 : 0,
        }
      : { maxWidth: '90%', maxHeight: '72vh', opacity: status === 'ready' ? 1 : 0 };

  const meta = [
    analysis.isImageFormat
      ? imageFormatLabel(analysis.kind === 'local' ? analysis.resolvedPath ?? request.src : request.src)
      : null,
    analysis.file?.size ? formatFileSize(analysis.file.size) : null,
    natural.width && natural.height ? `${natural.width} × ${natural.height}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className="image-preview-pane"
      role="region"
      aria-labelledby={titleId}
      aria-label="图片预览"
    >
      <header className="image-preview-header">
        <span className="image-preview-icon" aria-hidden="true">
          <FileImage size={16} />
        </span>
        <div className="image-preview-copy">
          <strong id={titleId}>{title}</strong>
          <span title={displayPath}>{displayPath}</span>
        </div>
      </header>

      <div
        ref={canvasRef}
        className={`image-preview-canvas${dragging ? ' is-dragging' : ''}`}
        aria-label="图片画布；拖拽平移，Ctrl 或 ⌘ 加滚轮缩放"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {source ? (
          <div className="image-preview-stage">
            <img
              ref={imageRef}
              src={source}
              alt={request.title || title}
              draggable={false}
              style={imageStyle}
              onLoad={handleLoad}
              onError={() => setStatus('error')}
              onDoubleClick={() =>
                setScale((previous) =>
                  Math.abs(previous - fitScale) < 0.001 ? 1 : fitScale,
                )
              }
            />
          </div>
        ) : null}

        {status === 'loading' ? (
          <div className="image-preview-status" role="status">
            <div className="image-preview-status-card">
              <Loader2 size={22} className="spin" aria-hidden="true" />
              <strong>正在读取图片…</strong>
              <p>{displayPath}</p>
            </div>
          </div>
        ) : null}

        {status === 'error' ? (
          <div className="image-preview-status" role="alert">
            <div className="image-preview-status-card">
              <ImageOff size={24} aria-hidden="true" />
              <strong>
                {errorTitle(analysis.kind, Boolean(analysis.file), workspaceService.isConnected)}
              </strong>
              <p>{errorMessage(analysis, Boolean(analysis.file), workspaceService.isConnected)}</p>
              {analysis.kind === 'local' && analysis.resolvedPath ? (
                <code>{analysis.resolvedPath}</code>
              ) : null}
              {analysis.isImageFormat ? null : (
                <span className="image-preview-status-hint">
                  支持的图片格式：{SUPPORTED_IMAGE_FORMATS_LABEL}。
                </span>
              )}
              {analysis.sameName ? (
                <button
                  type="button"
                  className="image-preview-status-action"
                  onClick={() =>
                    openImagePreview({
                      src: analysis.sameName!.path,
                      documentPath: null,
                      title: analysis.sameName!.name,
                      pathLabel: analysis.sameName!.path,
                    })
                  }
                >
                  打开工作区中的同名图片：{analysis.sameName.path}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <footer className="image-preview-toolbar">
        <div className="image-preview-zoom">
          <button
            type="button"
            className="image-preview-tool"
            aria-label="缩小图片"
            title="缩小图片"
            onClick={() => zoomBy(-1)}
          >
            <ZoomOut size={14} />
          </button>
          <button
            type="button"
            className="image-preview-zoom-value"
            aria-label={`图片缩放 ${formatZoomPercent(scale)}，点击适应窗口`}
            title="适应窗口"
            onClick={applyFit}
          >
            {formatZoomPercent(normalizeImageZoom(scale))}
          </button>
          <button
            type="button"
            className="image-preview-tool"
            aria-label="放大图片"
            title="放大图片"
            onClick={() => zoomBy(1)}
          >
            <ZoomIn size={14} />
          </button>
        </div>
        <span className="image-preview-divider" aria-hidden="true" />
        <button
          type="button"
          className="image-preview-tool"
          aria-label="适应窗口"
          title="适应窗口（⌘0）"
          onClick={applyFit}
        >
          <Maximize2 size={13} />
          <span>适应窗口</span>
        </button>
        <button
          type="button"
          className="image-preview-tool image-preview-actual"
          aria-label="按原始尺寸 1:1 显示"
          title="原始尺寸 1:1"
          onClick={() => setScale(1)}
        >
          <span>1:1</span>
        </button>
        {meta ? <span className="image-preview-meta">{meta}</span> : null}
      </footer>
    </div>
  );
}

type ImageKind = ReturnType<typeof analyzeImagePath>['kind'];

function errorTitle(kind: ImageKind, fileExists: boolean, connected: boolean): string {
  if (kind === 'external') return '网络图片加载失败';
  if (kind === 'data') return '内嵌图片无法解码';
  if (!connected) return '需要先连接本地工作区';
  if (fileExists) return '无法解码这张图片';
  return '找不到这张图片';
}

function errorMessage(
  analysis: ReturnType<typeof analyzeImagePath>,
  fileExists: boolean,
  connected: boolean,
): string {
  if (analysis.kind === 'external') {
    return '请检查图片链接是否可以公开访问，或稍后重试。';
  }
  if (analysis.kind === 'data') {
    return '图片数据可能不完整，请重新粘贴图片后再试。';
  }
  if (!connected) {
    return '本地图片需要先打开一个工作区。打开文件夹后即可在预览中查看。';
  }
  if (fileExists && analysis.isImageFormat) {
    return '文件存在，但当前浏览器无法解码这张图片。';
  }
  if (!analysis.isImageFormat) {
    return '该路径不是可预览的图片格式。';
  }
  return analysis.hint ?? '请确认图片路径是否相对当前文档或工作区根目录。';
}
