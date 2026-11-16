import { get, set } from 'idb-keyval';
import { mapWithConcurrency } from '../../utils/async';
import type {
  DirectoryNode,
  FileNode,
  SearchFileInput,
  TreeNode,
  WorkspaceSnapshot,
} from '../../types/workspace';
import {
  getDirName,
  getExtension,
  getFileName,
  isHiddenPath,
  isMarkdownFile,
  joinPath,
  normalizePath,
  resolvePathFrom,
} from '../../utils/paths';

const HANDLE_KEY = 'mdstudio.workspaceHandle.v1';
const IGNORED_NAMES = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '.cache',
  '.DS_Store',
]);
const MAX_FILES = 6000;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

type PermissionMode = 'read' | 'readwrite';

function permissionHandle(handle: FileSystemHandle): PermissionCapableFileSystemHandle {
  return handle as PermissionCapableFileSystemHandle;
}

function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' });
  });
}

function imageExtensionForMime(mimeType: string): string {
  if (/jpe?g/i.test(mimeType)) return 'jpg';
  if (/svg/i.test(mimeType)) return 'svg';
  if (/gif/i.test(mimeType)) return 'gif';
  if (/webp/i.test(mimeType)) return 'webp';
  if (/avif/i.test(mimeType)) return 'avif';
  if (/bmp/i.test(mimeType)) return 'bmp';
  return 'png';
}

function sanitizeAssetDirectory(value: string): string {
  const cleaned = normalizePath(value || 'assets')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');
  return cleaned || 'assets';
}

export class WorkspaceService {
  private root: FileSystemDirectoryHandle | null = null;
  private pendingHandle: FileSystemDirectoryHandle | null = null;
  private objectUrls = new Map<string, string>();
  private contentCache = new Map<string, { lastModified: number; content: string }>();

  get isSupported(): boolean {
    return typeof window.showDirectoryPicker === 'function';
  }

  get isConnected(): boolean {
    return this.root !== null;
  }

  async openDirectory(): Promise<WorkspaceSnapshot> {
    if (!this.isSupported) {
      throw new Error(
        'This browser does not support local folder access. Use the latest Chrome, Edge, or Chromium.',
      );
    }
    const handle = await window.showDirectoryPicker!({ id: 'markdown-studio', mode: 'readwrite' });
    const hasPermission = await this.ensurePermission(handle, 'readwrite');
    if (!hasPermission) throw new Error('Folder read/write permission was not granted.');
    try {
      await set(HANDLE_KEY, handle);
    } catch {
      // Persisted handles are a convenience; some browsers disable IndexedDB.
    }
    this.connect(handle);
    return this.scan();
  }

  async restoreLastWorkspace(): Promise<{
    snapshot?: WorkspaceSnapshot;
    needsPermission?: boolean;
    name?: string;
  }> {
    let handle: FileSystemDirectoryHandle | undefined;
    try {
      handle = await get<FileSystemDirectoryHandle>(HANDLE_KEY);
    } catch {
      handle = undefined;
    }
    if (!handle) return {};
    const permission = await this.queryPermission(handle, 'readwrite');
    if (permission === 'granted') {
      this.connect(handle);
      return { snapshot: await this.scan() };
    }
    this.pendingHandle = handle;
    return { needsPermission: true, name: handle.name };
  }

  async reconnectLastWorkspace(): Promise<WorkspaceSnapshot | null> {
    if (!this.pendingHandle) return null;
    const granted = await this.ensurePermission(this.pendingHandle, 'readwrite');
    if (!granted) throw new Error('Workspace access permission was not granted.');
    this.connect(this.pendingHandle);
    this.pendingHandle = null;
    return this.scan();
  }

  async scan(): Promise<WorkspaceSnapshot> {
    if (!this.root) throw new Error('No workspace is open.');
    const tree: TreeNode[] = [];
    const counters = { files: 0, markdownFiles: 0 };

    const readDirectory = async (
      directory: FileSystemDirectoryHandle,
      parentPath: string,
      depth: number,
    ): Promise<TreeNode[]> => {
      if (depth > 12) return [];
      const candidates: FileSystemHandle[] = [];
      for await (const entry of directory.values()) {
        if (counters.files + candidates.length >= MAX_FILES) break;
        if (IGNORED_NAMES.has(entry.name) || isHiddenPath(entry.name)) continue;
        candidates.push(entry);
      }
      const nodes = await mapWithConcurrency(candidates, 12, async (entry) => {
        const path = joinPath(parentPath, entry.name);
        if (entry.kind === 'directory') {
          const children = await readDirectory(entry as FileSystemDirectoryHandle, path, depth + 1);
          return { kind: 'directory', name: entry.name, path, children } satisfies DirectoryNode;
        }
        counters.files += 1;
        const file = await (entry as FileSystemFileHandle).getFile().catch(() => null);
        if (isMarkdownFile(path)) counters.markdownFiles += 1;
        return {
          kind: 'file',
          name: entry.name,
          path,
          extension: getExtension(path),
          size: file?.size ?? 0,
          lastModified: file?.lastModified ?? 0,
        } satisfies FileNode;
      });
      return sortNodes(nodes);
    };

    tree.push(...sortNodes(await readDirectory(this.root, '', 0)));
    return {
      kind: 'file-system',
      name: this.root.name,
      tree,
      fileCount: counters.markdownFiles,
      openedAt: Date.now(),
    };
  }

  async readTextFile(path: string): Promise<{ content: string; lastModified: number }> {
    const normalized = normalizePath(path);
    const handle = await this.getFileHandle(normalized, false);
    const file = await handle.getFile();
    if (file.size > MAX_FILE_SIZE) {
      throw new Error('Files larger than 10 MB are not supported in the editor yet.');
    }
    const content = await file.text();
    this.contentCache.set(normalized, { lastModified: file.lastModified, content });
    return { content, lastModified: file.lastModified };
  }

  async writeTextFile(path: string, content: string): Promise<number> {
    const normalized = normalizePath(path);
    const handle = await this.getFileHandle(normalized, true);
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
    const file = await handle.getFile();
    this.contentCache.set(normalized, { lastModified: file.lastModified, content });
    return file.lastModified;
  }

  async entryExists(path: string): Promise<boolean> {
    return this.entryExistsInternal(path);
  }

  async createFile(path: string, content = ''): Promise<void> {
    const normalized = normalizePath(path);
    if (!normalized) throw new Error('File name cannot be empty.');
    await this.writeTextFile(normalized, content);
  }

  async createDirectory(path: string): Promise<void> {
    const normalized = normalizePath(path);
    if (!normalized) return;
    await this.getDirectoryHandle(normalized, true);
  }

  async deleteEntry(path: string): Promise<void> {
    const normalized = normalizePath(path);
    const parts = normalized.split('/');
    const name = parts.pop()!;
    const parent = await this.getDirectoryHandle(parts.join('/'), false);
    await parent.removeEntry(name, { recursive: true });
    this.contentCache.delete(normalized);
  }

  async renameEntry(oldPath: string, newPath: string): Promise<void> {
    const from = normalizePath(oldPath);
    const to = normalizePath(newPath);
    if (from === to) return;
    if (await this.entryExistsInternal(to)) {
      throw new Error('A file or folder with that name already exists at the destination.');
    }

    const source = await this.getHandle(from);
    if (source.kind === 'file') {
      const file = await (source as FileSystemFileHandle).getFile();
      const destination = await this.getFileHandle(to, true);
      const writable = await destination.createWritable();
      await writable.write(await file.arrayBuffer());
      await writable.close();
    } else {
      await this.copyDirectory(source as FileSystemDirectoryHandle, to);
    }
    await this.deleteEntry(from);
  }

  async moveEntry(oldPath: string, targetDirectory: string): Promise<string> {
    const normalizedTarget = normalizePath(targetDirectory);
    const target = joinPath(normalizedTarget, getFileName(oldPath));
    await this.renameEntry(oldPath, target);
    return target;
  }

  async saveImage(
    image: Blob,
    documentPath: string | null,
    preferredDirectory: string,
    mimeType = 'image/png',
  ): Promise<{ assetPath: string; relativePath: string; objectUrl: string }> {
    if (!this.root) throw new Error('Open a local folder before pasting an image.');
    const directory = sanitizeAssetDirectory(preferredDirectory);
    const extension = imageExtensionForMime(mimeType);
    const filename = `image_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${extension}`;
    const assetPath = joinPath(directory, filename);
    const parent = await this.getDirectoryHandle(directory, true);
    const fileHandle = await parent.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(image);
    await writable.close();
    const file = await fileHandle.getFile();
    this.revokeAssetUrl(assetPath);
    const objectUrl = URL.createObjectURL(file);
    this.objectUrls.set(assetPath, objectUrl);
    return {
      assetPath,
      relativePath: documentPath ? relativeTo(getDirName(documentPath), assetPath) : assetPath,
      objectUrl,
    };
  }

  async resolveAssetObjectUrl(documentPath: string | null, source: string): Promise<string> {
    if (/^(https?:|data:|blob:)/i.test(source)) return source;
    if (!this.root) return source;
    const assetPath = this.resolveWorkspacePath(documentPath, source);
    const cached = this.objectUrls.get(assetPath);
    if (cached) return cached;
    try {
      const handle = await this.getFileHandle(assetPath, false);
      const file = await handle.getFile();
      const url = URL.createObjectURL(file);
      this.objectUrls.set(assetPath, url);
      return url;
    } catch {
      return source;
    }
  }

  async assetDataUrl(documentPath: string | null, source: string): Promise<string | null> {
    if (/^(data:|https?:)/i.test(source)) return source;
    if (!this.root) return null;
    const assetPath = this.resolveWorkspacePath(documentPath, source);
    try {
      const handle = await this.getFileHandle(assetPath, false);
      const file = await handle.getFile();
      return await blobToDataUrl(file);
    } catch {
      return null;
    }
  }

  async collectMarkdownFiles(
    nodes: TreeNode[],
    options: { onProgress?: (loaded: number, total: number) => void } = {},
  ): Promise<SearchFileInput[]> {
    if (!this.root) return [];
    const fileNodes = flattenFiles(nodes).filter((node) => isMarkdownFile(node.path));
    const results: SearchFileInput[] = [];
    let loaded = 0;
    const batchSize = 12;

    for (let index = 0; index < fileNodes.length; index += batchSize) {
      const batch = fileNodes.slice(index, index + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (node) => {
          const cached = this.contentCache.get(node.path);
          if (cached && cached.lastModified === node.lastModified) {
            return { path: node.path, content: cached.content };
          }
          try {
            const result = await this.readTextFile(node.path);
            return { path: node.path, content: result.content };
          } catch {
            return null;
          }
        }),
      );
      for (const item of batchResults) {
        if (item) results.push(item);
        loaded += 1;
      }
      options.onProgress?.(loaded, fileNodes.length);
    }
    return results;
  }

  clear(): void {
    this.revokeObjectUrls();
    this.root = null;
    this.pendingHandle = null;
    this.contentCache.clear();
  }

  private connect(handle: FileSystemDirectoryHandle): void {
    this.revokeObjectUrls();
    this.root = handle;
    this.pendingHandle = null;
    this.contentCache.clear();
  }

  private async ensurePermission(handle: FileSystemDirectoryHandle, mode: PermissionMode): Promise<boolean> {
    const capable = permissionHandle(handle);
    const descriptor = { mode };
    if (capable.queryPermission) {
      const status = await capable.queryPermission(descriptor);
      if (status === 'granted') return true;
    }
    if (capable.requestPermission) {
      return (await capable.requestPermission(descriptor)) === 'granted';
    }
    return true;
  }

  private async queryPermission(
    handle: FileSystemDirectoryHandle,
    mode: PermissionMode,
  ): Promise<PermissionState> {
    const capable = permissionHandle(handle);
    if (!capable.queryPermission) return 'granted';
    return capable.queryPermission({ mode });
  }

  private async getDirectoryHandle(
    path: string,
    create: boolean,
  ): Promise<FileSystemDirectoryHandle> {
    if (!this.root) throw new Error('No workspace is open.');
    const normalized = normalizePath(path);
    if (!normalized) return this.root;
    const parts = normalized.split('/').filter(Boolean);
    let current = this.root;
    for (const part of parts) {
      current = await current.getDirectoryHandle(part, { create });
    }
    return current;
  }

  private async getFileHandle(path: string, create: boolean): Promise<FileSystemFileHandle> {
    const normalized = normalizePath(path);
    const parts = normalized.split('/');
    const filename = parts.pop();
    if (!filename) throw new Error('Invalid file path.');
    const directory = await this.getDirectoryHandle(parts.join('/'), create);
    return directory.getFileHandle(filename, { create });
  }

  private async getHandle(path: string): Promise<FileSystemFileHandle | FileSystemDirectoryHandle> {
    const normalized = normalizePath(path);
    const parts = normalized.split('/');
    const name = parts.pop();
    if (!name) throw new Error('Invalid path.');
    const parent = await this.getDirectoryHandle(parts.join('/'), false);
    for await (const entry of parent.values()) {
      if (entry.name === name) return entry;
    }
    throw new Error(`Not found: ${normalized}`);
  }

  private async entryExistsInternal(path: string): Promise<boolean> {
    try {
      await this.getHandle(path);
      return true;
    } catch {
      return false;
    }
  }

  private async copyDirectory(
    source: FileSystemDirectoryHandle,
    destinationPath: string,
  ): Promise<void> {
    const destination = await this.getDirectoryHandle(destinationPath, true);
    for await (const entry of source.values()) {
      if (entry.kind === 'directory') {
        await destination.getDirectoryHandle(entry.name, { create: true });
        await this.copyDirectory(entry, joinPath(destinationPath, entry.name));
      } else {
        const file = await entry.getFile();
        const target = await destination.getFileHandle(entry.name, { create: true });
        const writable = await target.createWritable();
        await writable.write(await file.arrayBuffer());
        await writable.close();
      }
    }
  }

  private resolveWorkspacePath(documentPath: string | null, source: string): string {
    return resolvePathFrom(documentPath ? getDirName(documentPath) : '', source);
  }

  private revokeAssetUrl(path: string): void {
    const url = this.objectUrls.get(path);
    if (url) URL.revokeObjectURL(url);
    this.objectUrls.delete(path);
  }

  private revokeObjectUrls(): void {
    for (const url of this.objectUrls.values()) URL.revokeObjectURL(url);
    this.objectUrls.clear();
  }
}

function flattenFiles(nodes: TreeNode[]): FileNode[] {
  const result: FileNode[] = [];
  for (const node of nodes) {
    if (node.kind === 'file') result.push(node);
    else result.push(...flattenFiles(node.children));
  }
  return result;
}

function relativeTo(fromDirectory: string, path: string): string {
  const from = normalizePath(fromDirectory).split('/').filter(Boolean);
  const to = normalizePath(path).split('/').filter(Boolean);
  let shared = 0;
  while (shared < from.length && shared < to.length && from[shared] === to[shared]) shared += 1;
  return [...new Array(from.length - shared).fill('..'), ...to.slice(shared)].join('/');
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read image.'));
    reader.readAsDataURL(blob);
  });
}

export const workspaceService = new WorkspaceService();
