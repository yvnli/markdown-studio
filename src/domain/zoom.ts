/**
 * 预览缩放与图片查看器缩放的纯计算逻辑。
 * 组件只负责渲染，具体范围、步进和百分比的语义保持一致。
 */

export const PREVIEW_ZOOM_MIN = 0.5;
export const PREVIEW_ZOOM_MAX = 3;
export const PREVIEW_ZOOM_STEP = 0.1;
export const PREVIEW_ZOOM_DEFAULT = 1;

export const IMAGE_ZOOM_MIN = 0.05;
export const IMAGE_ZOOM_MAX = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function normalizePreviewZoom(value: number): number {
  if (!Number.isFinite(value)) return PREVIEW_ZOOM_DEFAULT;
  return roundTo(clamp(value, PREVIEW_ZOOM_MIN, PREVIEW_ZOOM_MAX), 2);
}

/** direction：1 放大，-1 缩小。 */
export function stepPreviewZoom(zoom: number, direction: 1 | -1): number {
  return normalizePreviewZoom(normalizePreviewZoom(zoom) + direction * PREVIEW_ZOOM_STEP);
}

export function canPreviewZoomIn(zoom: number): boolean {
  return normalizePreviewZoom(zoom) < PREVIEW_ZOOM_MAX;
}

export function canPreviewZoomOut(zoom: number): boolean {
  return normalizePreviewZoom(zoom) > PREVIEW_ZOOM_MIN;
}

export function formatZoomPercent(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}

export function normalizeImageZoom(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return roundTo(clamp(value, IMAGE_ZOOM_MIN, IMAGE_ZOOM_MAX), 3);
}

export function stepImageZoom(zoom: number, direction: 1 | -1): number {
  const factor = direction > 0 ? 1.25 : 0.8;
  return normalizeImageZoom(normalizeImageZoom(zoom) * factor);
}

export function fitImageZoom(
  naturalWidth: number,
  naturalHeight: number,
  availableWidth: number,
  availableHeight: number,
): number {
  if (
    !Number.isFinite(naturalWidth) ||
    !Number.isFinite(naturalHeight) ||
    naturalWidth <= 0 ||
    naturalHeight <= 0 ||
    availableWidth <= 0 ||
    availableHeight <= 0
  ) {
    return 1;
  }
  return normalizeImageZoom(
    Math.min(1, availableWidth / naturalWidth, availableHeight / naturalHeight),
  );
}
