import {
  IMAGE_EXTENSIONS,
  getBaseName,
  getDirName,
  getExtension,
  getFileName,
  isImageFile,
  relativePath,
  resolvePathFrom,
  safeDecodePath,
} from '../utils/paths';

/** Compatible with file tree nodes; only the fields needed for analysis. */
export interface ImageAsset {
  path: string;
  name: string;
  size: number;
}

export type ImagePathKind = 'empty' | 'external' | 'data' | 'local';
export type ImagePathTone = 'info' | 'success' | 'warning' | 'error';

export interface ImagePathAnalysis {
  kind: ImagePathKind;
  tone: ImagePathTone;
  /** Raw user input. */
  input: string;
  /** Target with surrounding whitespace and Markdown angle brackets removed. */
  source: string;
  /** Workspace-relative path for display in the document (null for external links). */
  resolvedPath: string | null;
  /** Path from the current document folder to the target file (local images only). */
  documentRelativePath: string | null;
  /** A file that actually exists in the workspace. */
  file: ImageAsset | null;
  /** Candidate when the path is wrong but a same-name image exists in the workspace. */
  sameName: ImageAsset | null;
  /** Path to the same-name image relative to the current document, ready to replace the input. */
  sameNameRelativePath: string | null;
  isImageFormat: boolean;
  title: string;
  detail: string;
  hint: string | null;
}

export interface ImageSuggestion {
  file: ImageAsset;
  /** Relative path that can be inserted into Markdown directly. */
  relativePath: string;
}

const IMAGE_FORMAT_LABELS: Record<string, string> = {
  '.png': 'PNG',
  '.jpg': 'JPEG',
  '.jpeg': 'JPEG',
  '.jfif': 'JPEG',
  '.gif': 'GIF',
  '.webp': 'WebP',
  '.svg': 'SVG',
  '.avif': 'AVIF',
  '.bmp': 'BMP',
  '.ico': 'ICO',
  '.apng': 'APNG',
};

export const SUPPORTED_IMAGE_FORMATS_LABEL =
  'PNG, JPEG, GIF, WebP, SVG, AVIF, BMP, ICO, APNG';

export function isRemoteImageSource(source: string): boolean {
  return /^(https?:|data:|blob:)/i.test(source.trim());
}

/**
 * react-markdown filters data: images by default. The preview allows image data URLs while still blocking protocols like javascript:.
 */
export function sanitizePreviewUrl(value: string): string {
  const url = value.trim();
  if (!url) return '';
  if (/^(https?:|mailto:|tel:|data:image\/|blob:)/i.test(url)) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return '';
  return url;
}

export function isSupportedImageSource(source: string): boolean {
  const value = source.trim();
  if (!value) return false;
  if (/^data:image\//i.test(value)) return true;
  if (/^blob:/i.test(value)) return true;
  return isImageFile(value);
}

export function imageFormatLabel(pathOrSource: string): string {
  const value = pathOrSource.trim();
  if (/^data:image\//i.test(value)) {
    const subtype = value.slice(11).split(/[;,]/)[0] ?? '';
    return subtype ? subtype.toUpperCase() : 'DATA';
  }
  const extension = getExtension(value.split(/[?#]/)[0] ?? value);
  return IMAGE_FORMAT_LABELS[extension] ?? (extension ? extension.slice(1).toUpperCase() : 'Image');
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function cleanSource(value: string): string {
  return value.trim().replace(/^<|>$/g, '');
}

function locationHint(documentPath: string | null, resolvedPath: string, absolute: boolean): string {
  if (absolute) return `Resolved from the workspace root → ${resolvedPath}`;
  const directory = documentPath ? getDirName(documentPath) : '';
  return `Relative to ${directory || 'workspace root'} → ${resolvedPath}`;
}

function defaultValue(
  kind: ImagePathKind,
  tone: ImagePathTone,
  title: string,
  detail = '',
  hint: string | null = null,
): ImagePathAnalysis {
  return {
    kind,
    tone,
    input: '',
    source: '',
    resolvedPath: null,
    documentRelativePath: null,
    file: null,
    sameName: null,
    sameNameRelativePath: null,
    isImageFormat: false,
    title,
    detail,
    hint,
  };
}

export interface AnalyzeImagePathOptions {
  /** Whether a local workspace is connected; when not, show path rules instead of claiming the file is missing. */
  connected?: boolean;
}

export function analyzeImagePath(
  input: string,
  documentPath: string | null,
  assets: readonly ImageAsset[],
  options: AnalyzeImagePathOptions = {},
): ImagePathAnalysis {
  const raw = String(input ?? '');
  const source = cleanSource(raw);
  const connected = options.connected ?? true;
  const base = defaultValue('empty', 'info', 'Enter an image path');
  if (!source) {
    const directory = documentPath ? getDirName(documentPath) : '';
    return {
      ...base,
      input: raw,
      detail: directory
        ? `Relative paths start from the current document folder (${directory}).`
        : 'Relative paths start from the workspace root.',
      hint: `Supports ${SUPPORTED_IMAGE_FORMATS_LABEL}, plus https:// or data: images.`,
    };
  }

  if (/^data:/i.test(source)) {
    if (!/^data:image\//i.test(source)) {
      return {
        ...base,
        kind: 'data',
        tone: 'warning',
        input: raw,
        source,
        title: 'Not an image data URL',
        detail: 'Data URLs must start with data:image/.',
        hint: `Supported formats: ${SUPPORTED_IMAGE_FORMATS_LABEL}.`,
      };
    }
    return {
      ...base,
      kind: 'data',
      tone: 'success',
      input: raw,
      source,
      title: 'Embedded data URL image',
      detail: 'The image data lives in the Markdown itself and doesn\'t depend on a workspace file.',
      isImageFormat: true,
    };
  }

  if (/^(https?:|blob:)/i.test(source)) {
    return {
      ...base,
      kind: 'external',
      tone: 'info',
      input: raw,
      source,
      title: 'External or temporary image link',
      detail: 'The preview loads the image directly from the link. Make sure it\'s publicly accessible.',
      isImageFormat: isImageFile(source) || /^blob:/i.test(source),
      hint: 'External links can\'t be checked against workspace path rules.',
    };
  }

  const absolute = safeDecodePath(source).startsWith('/');
  const resolvedPath = resolvePathFrom(documentPath ? getDirName(documentPath) : '', source);
  const documentDirectory = documentPath ? getDirName(documentPath) : '';
  const documentRelativePath = relativePath(documentDirectory, resolvedPath) || resolvedPath;
  const extension = getExtension(resolvedPath);
  const isImageFormat = IMAGE_EXTENSIONS.has(extension);
  const file = assets.find((asset) => asset.path === resolvedPath) ?? null;
  const fileName = getFileName(resolvedPath);
  const sameName =
    assets.find(
      (asset) =>
        asset.path !== resolvedPath &&
        getFileName(asset.path).toLowerCase() === fileName.toLowerCase() &&
        isImageFile(asset.path),
    ) ?? null;
  const sameNameRelativePath = sameName
    ? relativePath(documentDirectory, sameName.path) || sameName.path
    : null;

  const detail = locationHint(documentPath, resolvedPath, absolute);

  if (file) {
    const format = imageFormatLabel(resolvedPath);
    if (!isImageFormat) {
      return {
        ...base,
        kind: 'local',
        tone: 'error',
        input: raw,
        source,
        resolvedPath,
        documentRelativePath,
        file,
        sameName,
        sameNameRelativePath,
        isImageFormat: false,
        title: `${file.name} isn't a previewable image`,
        detail,
        hint: `Supported formats: ${SUPPORTED_IMAGE_FORMATS_LABEL}.`,
      };
    }
    return {
      ...base,
      kind: 'local',
      tone: 'success',
      input: raw,
      source,
      resolvedPath,
      documentRelativePath,
      file,
      sameName,
      sameNameRelativePath,
      isImageFormat: true,
      title: `Found ${file.name}`,
      detail: `${detail} · ${format}${file.size ? ` · ${formatFileSize(file.size)}` : ''}`,
      hint: 'The image will be referenced by this path after insertion.',
    };
  }

  if (extension && !isImageFormat) {
    return {
      ...base,
      kind: 'local',
      tone: 'warning',
      input: raw,
      source,
      resolvedPath,
      documentRelativePath,
      file: null,
      sameName,
      sameNameRelativePath,
      isImageFormat: false,
      title: `${extension} isn't a supported image format`,
      detail,
      hint: `Supported formats: ${SUPPORTED_IMAGE_FORMATS_LABEL}.`,
    };
  }

  const suggestedRelative = sameName
    ? `You can use ${sameNameRelativePath} instead.`
    : !connected
      ? 'Open a local workspace to check whether the file exists.'
      : `Check the case and folder; a leading / means the workspace root, for example /${fileName || 'assets/image.png'}.`;

  return {
    ...base,
    kind: 'local',
    tone: 'warning',
    input: raw,
    source,
    resolvedPath,
    documentRelativePath,
    file: null,
    sameName,
    sameNameRelativePath,
    isImageFormat,
    title: `${resolvedPath || 'This file'} not found in the workspace`,
    detail: connected ? detail : `${detail} · no local workspace connected`,
    hint: sameName ? `Same-name image found in the workspace: ${sameName.path}. ${suggestedRelative}` : suggestedRelative,
  };
}

/**
 * Suggest workspace images for Insert image based on the typed path, ranking exact paths and same-name files first.
 */
export function suggestImageFiles(
  input: string,
  documentPath: string | null,
  assets: readonly ImageAsset[],
  limit = 6,
): ImageSuggestion[] {
  const source = cleanSource(String(input ?? ''));
  const directory = documentPath ? getDirName(documentPath) : '';
  const localSource = source && !isRemoteImageSource(source) ? source : '';
  const resolved = localSource ? resolvePathFrom(directory, localSource) : '';
  const typedName = localSource ? getFileName(resolved).toLowerCase() : '';
  const typedPath = localSource.toLowerCase();

  return assets
    .filter((asset) => isImageFile(asset.path))
    .map((file) => {
      let score = 4;
      if (resolved && file.path === resolved) score = 0;
      else if (typedName && file.name.toLowerCase() === typedName) score = 1;
      else if (typedName && file.name.toLowerCase().includes(typedName)) score = 2;
      else if (typedPath && file.path.toLowerCase().includes(typedPath)) score = 3;
      return {
        file,
        relativePath: relativePath(directory, file.path) || file.path,
        score,
      };
    })
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      return a.file.path.localeCompare(b.file.path, 'en', {
        numeric: true,
        sensitivity: 'base',
      });
    })
    .slice(0, Math.max(0, limit))
    .map(({ file, relativePath: relative }) => ({ file, relativePath: relative }));
}

/**
 * Spaces and parentheses in Markdown destinations break links, so escape them before insertion; keep any % the user already typed.
 */
const MARKDOWN_DESTINATION_ESCAPES: Record<string, string> = {
  ' ': '%20',
  '(': '%28',
  ')': '%29',
  '<': '%3C',
  '>': '%3E',
  '"': '%22',
  '#': '%23',
};

export function encodeMarkdownDestination(value: string): string {
  return value
    .trim()
    .replaceAll('\\', '/')
    .replace(/[ ()<>"#]/g, (character) => MARKDOWN_DESTINATION_ESCAPES[character] ?? character);
}

export function defaultImageAlt(value: string): string {
  const source = cleanSource(value);
  if (!source) return 'Image';
  if (/^(data:|https?:|blob:)/i.test(source)) return 'Image';
  return getBaseName(source) || 'Image';
}

/** Escape square brackets in Markdown alt text so syntax like `![a]b](x.png)` isn't cut short. */
export function escapeMarkdownAlt(value: string): string {
  return value.replace(/[[\]\\]/g, '\\$&').replace(/\s+/g, ' ').trim();
}
