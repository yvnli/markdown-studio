import { ZoomIn, ZoomOut } from 'lucide-react';
import {
  canPreviewZoomIn,
  canPreviewZoomOut,
  formatZoomPercent,
  normalizePreviewZoom,
  stepPreviewZoom,
} from '../../domain/zoom';

interface PreviewZoomControlsProps {
  zoom: number;
  onChange: (zoom: number) => void;
}

export function PreviewZoomControls({ zoom, onChange }: PreviewZoomControlsProps) {
  const normalized = normalizePreviewZoom(zoom);
  const percent = formatZoomPercent(normalized);
  return (
    <div className="preview-zoom" role="group" aria-label="预览缩放">
      <button
        type="button"
        className="pane-tool preview-zoom-button"
        aria-label="缩小预览"
        title="缩小预览"
        data-tip="缩小预览"
        disabled={!canPreviewZoomOut(normalized)}
        onClick={() => onChange(stepPreviewZoom(normalized, -1))}
      >
        <ZoomOut size={13} />
      </button>
      <button
        type="button"
        className="preview-zoom-value"
        aria-label={`预览缩放 ${percent}，点击重置为 100%`}
        title="重置为 100%"
        data-tip="重置为 100%"
        onClick={() => onChange(1)}
      >
        {percent}
      </button>
      <button
        type="button"
        className="pane-tool preview-zoom-button"
        aria-label="放大预览"
        title="放大预览"
        data-tip="放大预览"
        disabled={!canPreviewZoomIn(normalized)}
        onClick={() => onChange(stepPreviewZoom(normalized, 1))}
      >
        <ZoomIn size={13} />
      </button>
    </div>
  );
}
