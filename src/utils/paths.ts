const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mdown', '.mkd', '.txt']);

/**
 * 浏览器（Chromium / Electron）可以解码的图片格式。
 * 这里是「文件树预览」与「图片路径提示」共用的唯一来源。
 */
export const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.avif',
  '.bmp',
  '.ico',
  '.apng',
  '.jfif',
]);

export function normalizePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
}

export function getExtension(path: string): string {
  const name = getFileName(path);
  const index = name.lastIndexOf('.');
  return index > 0 ? name.slice(index).toLowerCase() : '';
}

export function getFileName(path: string): string {
  const normalized = normalizePath(path);
  return normalized.slice(normalized.lastIndexOf('/') + 1);
}

export function getBaseName(path: string): string {
  const fileName = getFileName(path);
  const extension = getExtension(fileName);
  return extension ? fileName.slice(0, -extension.length) : fileName;
}

export function getDirName(path: string): string {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf('/');
  return index === -1 ? '' : normalized.slice(0, index);
}

export function joinPath(...parts: string[]): string {
  return normalizePath(parts.filter(Boolean).join('/'));
}

export function isMarkdownFile(path: string): boolean {
  return MARKDOWN_EXTENSIONS.has(getExtension(path));
}

export function isImageFile(path: string): boolean {
  return IMAGE_EXTENSIONS.has(getExtension(path.split(/[?#]/)[0] ?? path));
}

/** decodeURIComponent 遇到孤立的 `%` 会抛错，路径提示不应因此中断。 */
export function safeDecodePath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * 把图片/链接目标解析为工作区相对路径。
 * - 以 `/` 开头：相对工作区根目录；
 * - 其它：相对当前文档所在目录；
 * - 解析 `.` 与 `..`，且不会越出工作区根目录。
 */
export function resolvePathFrom(baseDirectory: string, target: string): string {
  const trimmed = String(target ?? '').trim();
  const unwrapped = trimmed.replace(/^<|>$/g, '');
  const decoded = safeDecodePath(unwrapped);
  const absolute = decoded.startsWith('/');
  const combined = absolute ? decoded : joinPath(baseDirectory, decoded);
  const parts: string[] = [];
  for (const part of normalizePath(combined).split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join('/');
}

export function isHiddenPath(path: string): boolean {
  return path
    .split('/')
    .some((part) => part.startsWith('.') && part !== '.well-known');
}

export function relativePath(fromDirectory: string, toPath: string): string {
  const from = normalizePath(fromDirectory).split('/').filter(Boolean);
  const to = normalizePath(toPath).split('/').filter(Boolean);
  let shared = 0;
  while (shared < from.length && shared < to.length && from[shared] === to[shared]) {
    shared += 1;
  }
  const up = new Array(from.length - shared).fill('..');
  return [...up, ...to.slice(shared)].join('/') || getFileName(toPath);
}

export function ensureExtension(name: string, fallback = '.md'): string {
  const trimmed = name.trim();
  if (!trimmed) return `未命名${fallback}`;
  return getExtension(trimmed) ? trimmed : `${trimmed}${fallback}`;
}
