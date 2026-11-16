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
    <div className="preview-zoom" role="group" aria-label="Preview zoom">
      <button
        type="button"
        className="pane-tool preview-zoom-button"
        aria-label="Zoom out"
        title="Zoom out"
        data-tip="Zoom out"
        disabled={!canPreviewZoomOut(normalized)}
        onClick={() => onChange(stepPreviewZoom(normalized, -1))}
      >
        <ZoomOut size={13} />
      </button>
      <button
        type="button"
        className="preview-zoom-value"
        aria-label={`Preview zoom ${percent}. Click to reset to 100%.`}
        title="Reset to 100%"
        data-tip="Reset to 100%"
        onClick={() => onChange(1)}
      >
        {percent}
      </button>
      <button
        type="button"
        className="pane-tool preview-zoom-button"
        aria-label="Zoom in"
        title="Zoom in"
        data-tip="Zoom in"
        disabled={!canPreviewZoomIn(normalized)}
        onClick={() => onChange(stepPreviewZoom(normalized, 1))}
      >
        <ZoomIn size={13} />
      </button>
    </div>
  );
}
