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

/** 与文件树节点结构兼容，只依赖分析所需的字段。 */
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
  /** 用户输入原文。 */
  input: string;
  /** 去掉首尾空格与 Markdown 尖括号后的目标。 */
  source: string;
  /** 文内显示用的工作区相对路径（外部链接为 null）。 */
  resolvedPath: string | null;
  /** 从当前文档目录到目标文件的相对路径（仅本地图片）。 */
  documentRelativePath: string | null;
  /** 工作区中真实存在的文件。 */
  file: ImageAsset | null;
  /** 路径写错、但工作区中存在同名图片时的候选。 */
  sameName: ImageAsset | null;
  /** 同名图片相对当前文档的路径，可直接替换输入。 */
  sameNameRelativePath: string | null;
  isImageFormat: boolean;
  title: string;
  detail: string;
  hint: string | null;
}

export interface ImageSuggestion {
  file: ImageAsset;
  /** 可直接填入 Markdown 的相对路径。 */
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
  'PNG、JPEG、GIF、WebP、SVG、AVIF、BMP、ICO、APNG';

export function isRemoteImageSource(source: string): boolean {
  return /^(https?:|data:|blob:)/i.test(source.trim());
}

/**
 * react-markdown 默认会过滤 data: 图片；预览需要放行图片 Data URL，同时继续拦截 javascript: 等协议。
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
  return IMAGE_FORMAT_LABELS[extension] ?? (extension ? extension.slice(1).toUpperCase() : '图片');
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
  if (absolute) return `以工作区根目录解析 → ${resolvedPath}`;
  const directory = documentPath ? getDirName(documentPath) : '';
  return `相对 ${directory || '工作区根目录'} → ${resolvedPath}`;
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
  /** 是否已连接本地工作区；未连接时只提示路径规则，不谎称文件不存在。 */
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
  const base = defaultValue('empty', 'info', '输入图片路径');
  if (!source) {
    const directory = documentPath ? getDirName(documentPath) : '';
    return {
      ...base,
      input: raw,
      detail: directory
        ? `相对路径以当前文档目录 ${directory} 为基准。`
        : '相对路径以工作区根目录为基准。',
      hint: `支持 ${SUPPORTED_IMAGE_FORMATS_LABEL}，也可以使用 https:// 或 data: 图片。`,
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
        title: '这不是图片 Data URL',
        detail: 'data: URL 需要以 data:image/ 开头。',
        hint: `支持 ${SUPPORTED_IMAGE_FORMATS_LABEL}。`,
      };
    }
    return {
      ...base,
      kind: 'data',
      tone: 'success',
      input: raw,
      source,
      title: '内嵌 Data URL 图片',
      detail: '图片数据直接写在 Markdown 中，不依赖工作区文件。',
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
      title: '外部 / 临时图片链接',
      detail: '预览时会直接从链接加载图片，请确认它可以公开访问。',
      isImageFormat: isImageFile(source) || /^blob:/i.test(source),
      hint: '外部链接无法用工作区路径规则校验。',
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
        title: `${file.name} 不是可预览的图片`,
        detail,
        hint: `支持的格式：${SUPPORTED_IMAGE_FORMATS_LABEL}。`,
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
      title: `已找到 ${file.name}`,
      detail: `${detail} · ${format}${file.size ? ` · ${formatFileSize(file.size)}` : ''}`,
      hint: '插入后将按这个路径引用图片。',
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
      title: `“${extension}” 不是支持的图片格式`,
      detail,
      hint: `支持的格式：${SUPPORTED_IMAGE_FORMATS_LABEL}。`,
    };
  }

  const suggestedRelative = sameName
    ? `可直接改用 ${sameNameRelativePath}。`
    : !connected
      ? '打开本地工作区后可以校验文件是否存在。'
      : `请检查大小写与目录；以 / 开头表示工作区根目录，例如 /${fileName || 'assets/图片.png'}。`;

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
    title: `工作区中没有 ${resolvedPath || '这个文件'}`,
    detail: connected ? detail : `${detail} · 当前未连接本地工作区`,
    hint: sameName ? `工作区中发现同名图片 ${sameName.path}，${suggestedRelative}` : suggestedRelative,
  };
}

/**
 * 为「插入图片」按输入路径推荐工作区里的图片，优先返回精确路径与同名文件。
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
      return a.file.path.localeCompare(b.file.path, 'zh-CN', {
        numeric: true,
        sensitivity: 'base',
      });
    })
    .slice(0, Math.max(0, limit))
    .map(({ file, relativePath: relative }) => ({ file, relativePath: relative }));
}

/**
 * Markdown 目的地中的空格和括号会截断链接，插入前转义；保留用户已写的 `%`。
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
  if (!source) return '图片';
  if (/^(data:|https?:|blob:)/i.test(source)) return '图片';
  return getBaseName(source) || '图片';
}

/** Markdown 替代文字中转义方括号，避免 `![a]b](x.png)` 这类语法被截断。 */
export function escapeMarkdownAlt(value: string): string {
  return value.replace(/[[\]\\]/g, '\\$&').replace(/\s+/g, ' ').trim();
}
