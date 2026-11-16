import { describe, expect, it } from 'vitest';
import {
  IMAGE_ZOOM_MAX,
  IMAGE_ZOOM_MIN,
  PREVIEW_ZOOM_MAX,
  PREVIEW_ZOOM_MIN,
  canPreviewZoomIn,
  canPreviewZoomOut,
  fitImageZoom,
  formatZoomPercent,
  normalizeImageZoom,
  normalizePreviewZoom,
  stepImageZoom,
  stepPreviewZoom,
} from './zoom';

describe('preview zoom', () => {
  it('clamps and normalizes values into the supported range', () => {
    expect(normalizePreviewZoom(1)).toBe(1);
    expect(normalizePreviewZoom(0)).toBe(PREVIEW_ZOOM_MIN);
    expect(normalizePreviewZoom(99)).toBe(PREVIEW_ZOOM_MAX);
    expect(normalizePreviewZoom(Number.NaN)).toBe(1);
    expect(normalizePreviewZoom(1.234)).toBe(1.23);
  });

  it('steps in 10% increments and respects the boundaries', () => {
    expect(stepPreviewZoom(1, 1)).toBe(1.1);
    expect(stepPreviewZoom(1, -1)).toBe(0.9);
    expect(stepPreviewZoom(PREVIEW_ZOOM_MAX, 1)).toBe(PREVIEW_ZOOM_MAX);
    expect(stepPreviewZoom(PREVIEW_ZOOM_MIN, -1)).toBe(PREVIEW_ZOOM_MIN);
    expect(canPreviewZoomIn(PREVIEW_ZOOM_MAX)).toBe(false);
    expect(canPreviewZoomOut(PREVIEW_ZOOM_MIN)).toBe(false);
  });

  it('formats percentages for the toolbar', () => {
    expect(formatZoomPercent(1)).toBe('100%');
    expect(formatZoomPercent(1.5)).toBe('150%');
    expect(formatZoomPercent(0.666)).toBe('67%');
  });
});

describe('image viewer zoom', () => {
  it('steps with a multiplicative factor inside hard limits', () => {
    expect(stepImageZoom(1, 1)).toBe(1.25);
    expect(stepImageZoom(1, -1)).toBe(0.8);
    expect(stepImageZoom(IMAGE_ZOOM_MAX, 1)).toBe(IMAGE_ZOOM_MAX);
    expect(stepImageZoom(IMAGE_ZOOM_MIN, -1)).toBe(IMAGE_ZOOM_MIN);
    expect(normalizeImageZoom(0)).toBe(1);
  });

  it('fits large images and never upscales small ones', () => {
    expect(fitImageZoom(2000, 1000, 1000, 800)).toBe(0.5);
    expect(fitImageZoom(200, 100, 1000, 800)).toBe(1);
    expect(fitImageZoom(0, 0, 800, 600)).toBe(1);
  });
});
