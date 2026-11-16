import { describe, expect, it } from 'vitest';
import {
  analyzeImagePath,
  defaultImageAlt,
  encodeMarkdownDestination,
  escapeMarkdownAlt,
  formatFileSize,
  imageFormatLabel,
  isRemoteImageSource,
  isSupportedImageSource,
  sanitizePreviewUrl,
  suggestImageFiles,
  type ImageAsset,
} from './imagePath';
import { isImageFile } from '../utils/paths';

const assets: ImageAsset[] = [
  { path: 'assets/photo.png', name: 'photo.png', size: 2048 },
  { path: 'assets/my photo.webp', name: 'my photo.webp', size: 4096 },
  { path: 'notes/diagram.svg', name: 'diagram.svg', size: 512 },
  { path: 'notes/readme.pdf', name: 'readme.pdf', size: 1024 },
];

describe('image file formats', () => {
  it('recognizes the browser-supported image extensions', () => {
    for (const extension of ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico', 'apng', 'jfif']) {
      expect(isImageFile(`assets/picture.${extension}`)).toBe(true);
      expect(isSupportedImageSource(`assets/picture.${extension}`)).toBe(true);
    }
    expect(isImageFile('assets/picture.pdf')).toBe(false);
    expect(isImageFile('assets/picture')).toBe(false);
  });

  it('labels formats and sizes', () => {
    expect(imageFormatLabel('assets/photo.PNG')).toBe('PNG');
    expect(imageFormatLabel('data:image/webp;base64,abc')).toBe('WEBP');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(1024 * 1024 * 3.5)).toBe('3.5 MB');
  });
});

describe('analyzeImagePath', () => {
  it('resolves document-relative, dot-relative and root-relative paths', () => {
    const dot = analyzeImagePath('./assets/photo.png', 'notes/a.md', assets);
    expect(dot.kind).toBe('local');
    expect(dot.resolvedPath).toBe('notes/assets/photo.png');
    expect(dot.file).toBeNull();

    const parent = analyzeImagePath('../assets/photo.png', 'notes/a.md', assets);
    expect(parent.resolvedPath).toBe('assets/photo.png');
    expect(parent.file?.path).toBe('assets/photo.png');
    expect(parent.tone).toBe('success');
    expect(parent.detail).toContain('相对 notes');

    const root = analyzeImagePath('/assets/photo.png', 'notes/a.md', assets);
    expect(root.resolvedPath).toBe('assets/photo.png');
    expect(root.detail).toContain('工作区根目录');
  });

  it('suggests a same-name image when the relative directory is wrong', () => {
    const analysis = analyzeImagePath('assets/photo.png', 'notes/a.md', assets);
    expect(analysis.tone).toBe('warning');
    expect(analysis.title).toContain('notes/assets/photo.png');
    expect(analysis.sameName?.path).toBe('assets/photo.png');
    expect(analysis.sameNameRelativePath).toBe('../assets/photo.png');
    expect(analysis.hint).toContain('../assets/photo.png');
  });

  it('explains unsupported formats and disconnected workspaces', () => {
    const pdf = analyzeImagePath('./readme.pdf', 'notes/a.md', assets);
    expect(pdf.tone).toBe('error');
    expect(pdf.hint).toContain('PNG');

    const missing = analyzeImagePath('images/missing.png', 'notes/a.md', assets, {
      connected: false,
    });
    expect(missing.tone).toBe('warning');
    expect(missing.detail).toContain('未连接');
    expect(missing.hint).toContain('打开本地工作区');
  });

  it('recognizes external and embedded image sources', () => {
    const remote = analyzeImagePath('https://example.com/a.png', null, assets);
    expect(remote.kind).toBe('external');
    expect(remote.tone).toBe('info');
    expect(isRemoteImageSource('https://example.com/a.png')).toBe(true);

    const data = analyzeImagePath('data:image/png;base64,AAAA', null, assets);
    expect(data.kind).toBe('data');
    expect(data.tone).toBe('success');
    expect(data.isImageFormat).toBe(true);
  });

  it('keeps path rules in the empty state', () => {
    const empty = analyzeImagePath('', 'notes/a.md', assets);
    expect(empty.kind).toBe('empty');
    expect(empty.detail).toContain('notes');
    expect(empty.hint).toContain('PNG');
  });
});

describe('suggestImageFiles', () => {
  it('ranks exact and same-name matches for the current document', () => {
    const suggestions = suggestImageFiles('photo.png', 'notes/a.md', assets);
    expect(suggestions[0]?.file.path).toBe('assets/photo.png');
    expect(suggestions[0]?.relativePath).toBe('../assets/photo.png');
    expect(suggestions.some((item) => item.file.path === 'notes/readme.pdf')).toBe(false);
  });

  it('lists images with paths relative to the document when the query is empty', () => {
    const suggestions = suggestImageFiles('', 'notes/a.md', assets);
    expect(suggestions.map((item) => item.relativePath)).toEqual([
      '../assets/my photo.webp',
      '../assets/photo.png',
      'diagram.svg',
    ]);
  });
});

describe('sanitizePreviewUrl', () => {
  it('allows image data URLs and normal preview URLs but blocks active schemes', () => {
    expect(sanitizePreviewUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(sanitizePreviewUrl('https://example.com/a.png')).toBe('https://example.com/a.png');
    expect(sanitizePreviewUrl('mailto:hi@example.com')).toBe('mailto:hi@example.com');
    expect(sanitizePreviewUrl('../assets/a.png')).toBe('../assets/a.png');
    expect(sanitizePreviewUrl('#section')).toBe('#section');
    expect(sanitizePreviewUrl('javascript:alert(1)')).toBe('');
    expect(sanitizePreviewUrl('data:text/html,<script>')).toBe('');
  });
});

describe('markdown image helpers', () => {
  it('encodes destinations that would break Markdown link syntax', () => {
    expect(encodeMarkdownDestination('assets/my photo.png')).toBe('assets/my%20photo.png');
    expect(encodeMarkdownDestination('assets/a(1).png')).toBe('assets/a%281%29.png');
    expect(encodeMarkdownDestination('assets\\photo.png')).toBe('assets/photo.png');
  });

  it('derives and escapes alt text', () => {
    expect(defaultImageAlt('../assets/my photo.png')).toBe('my photo');
    expect(defaultImageAlt('data:image/png;base64,AAAA')).toBe('图片');
    expect(escapeMarkdownAlt('a [b] c')).toBe('a \\[b\\] c');
  });
});
