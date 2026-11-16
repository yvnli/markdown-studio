import type { DesktopBridge, DesktopMarkdownFile } from '../../types/desktop';
import type { SearchFileInput, TreeNode, WorkspaceSnapshot } from '../../types/workspace';
import {
  getDirName,
  getFileName,
  joinPath,
  normalizePath,
  relativePath,
  resolvePathFrom,
} from '../../utils/paths';
import type {
  AssetSaveResult,
  RestoredWorkspaceResult,
  WorkspaceServiceContract,
} from './types';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function imageExtensionForMime(mimeType: string): string {
  if (/jpe?g/i.test(mimeType)) return 'jpg';
  if (/svg/i.test(mimeType)) return 'svg';
  if (/gif/i.test(mimeType)) return 'gif';
  if (/webp/i.test(mimeType)) return 'webp';
  if (/avif/i.test(mimeType)) return 'avif';
  if (/bmp/i.test(mimeType)) return 'bmp';
  return 'png';
}

export class DesktopWorkspaceService implements WorkspaceServiceContract {
  private connected = false;
  private objectUrls = new Map<string, string>();
  private dataUrlCache = new Map<string, string>();

  constructor(private readonly bridge: DesktopBridge) {}

  get isSupported(): boolean {
    return true;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  async openDirectory(): Promise<WorkspaceSnapshot> {
    const chosen = await this.bridge.chooseWorkspace();
    if (!chosen) throw new DOMException('Folder selection cancelled.', 'AbortError');
    this.connected = true;
    this.clearCaches();
    return this.scan();
  }

  async restoreLastWorkspace(): Promise<RestoredWorkspaceResult> {
    const last = await this.bridge.getLastWorkspace();
    if (!last) return {};
    this.connected = true;
    this.clearCaches();
    return { snapshot: await this.scan() };
  }

  async reconnectLastWorkspace(): Promise<WorkspaceSnapshot | null> {
    const result = await this.restoreLastWorkspace();
    return result.snapshot ?? null;
  }

  async scan(): Promise<WorkspaceSnapshot> {
    const result = await this.bridge.scanWorkspace();
    this.connected = true;
    return {
      kind: 'file-system',
      name: result.name,
      tree: result.tree,
      fileCount: result.fileCount,
      openedAt: Date.now(),
    };
  }

  async readTextFile(path: string): Promise<{ content: string; lastModified: number }> {
    const normalized = normalizePath(path);
    const result = await this.bridge.readFile(normalized);
    if (new Blob([result.content]).size > MAX_FILE_SIZE) {
      throw new Error('Files larger than 10 MB are not supported in the editor yet.');
    }
    return result;
  }

  async writeTextFile(path: string, content: string): Promise<number> {
    const normalized = normalizePath(path);
    const result = await this.bridge.writeFile(normalized, content);
    this.dataUrlCache.delete(normalized);
    return result.lastModified;
  }

  async entryExists(path: string): Promise<boolean> {
    return this.bridge.exists(normalizePath(path));
  }

  async createFile(path: string, content = ''): Promise<void> {
    await this.writeTextFile(path, content);
  }

  async createDirectory(path: string): Promise<void> {
    await this.bridge.createDirectory(normalizePath(path));
  }

  async deleteEntry(path: string): Promise<void> {
    const normalized = normalizePath(path);
    await this.bridge.removeEntry(normalized);
    this.revokeAssetUrl(normalized);
  }

  async renameEntry(oldPath: string, newPath: string): Promise<void> {
    const from = normalizePath(oldPath);
    const to = normalizePath(newPath);
    if (from === to) return;
    if (await this.entryExists(to)) {
      throw new Error('A file or folder with that name already exists at the destination.');
    }
    await this.bridge.renameEntry(from, to);
    this.revokeAssetUrl(from);
  }

  async moveEntry(oldPath: string, targetDirectory: string): Promise<string> {
    const target = joinPath(normalizePath(targetDirectory), getFileName(oldPath));
    await this.renameEntry(oldPath, target);
    return target;
  }

  async saveImage(
    image: Blob,
    documentPath: string | null,
    preferredDirectory: string,
    mimeType = 'image/png',
  ): Promise<AssetSaveResult> {
    const directory = normalizePath(preferredDirectory || 'assets');
    const extension = imageExtensionForMime(mimeType);
    const fileName = `image_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${extension}`;
    const result = await this.bridge.saveImage({
      directory,
      fileName,
      data: await image.arrayBuffer(),
    });
    const assetPath = normalizePath(result.path);
    const objectUrl = URL.createObjectURL(image);
    this.objectUrls.set(assetPath, objectUrl);
    return {
      assetPath,
      relativePath: documentPath
        ? relativePath(getDirName(documentPath), assetPath)
        : assetPath,
      objectUrl,
    };
  }

  async resolveAssetObjectUrl(documentPath: string | null, source: string): Promise<string> {
    if (/^(https?:|data:|blob:)/i.test(source)) return source;
    const assetPath = this.resolveWorkspacePath(documentPath, source);
    const cached = this.objectUrls.get(assetPath);
    if (cached) return cached;
    const dataUrl = await this.bridge.readAssetDataUrl(assetPath);
    return dataUrl ?? source;
  }

  async assetDataUrl(documentPath: string | null, source: string): Promise<string | null> {
    if (/^(https?:|data:)/i.test(source)) return source;
    const assetPath = this.resolveWorkspacePath(documentPath, source);
    const cached = this.dataUrlCache.get(assetPath);
    if (cached) return cached;
    const dataUrl = await this.bridge.readAssetDataUrl(assetPath);
    if (dataUrl) this.dataUrlCache.set(assetPath, dataUrl);
    return dataUrl;
  }

  async collectMarkdownFiles(
    _nodes: TreeNode[],
    options: { onProgress?: (loaded: number, total: number) => void } = {},
  ): Promise<SearchFileInput[]> {
    const files: DesktopMarkdownFile[] = await this.bridge.readMarkdownFiles();
    options.onProgress?.(files.length, files.length);
    return files.map((file) => ({ path: file.path, content: file.content }));
  }

  clear(): void {
    this.clearCaches();
    this.connected = false;
  }

  private clearCaches(): void {
    for (const url of this.objectUrls.values()) URL.revokeObjectURL(url);
    this.objectUrls.clear();
    this.dataUrlCache.clear();
  }

  private revokeAssetUrl(path: string): void {
    const url = this.objectUrls.get(path);
    if (url) URL.revokeObjectURL(url);
    this.objectUrls.delete(path);
  }

  private resolveWorkspacePath(documentPath: string | null, source: string): string {
    return resolvePathFrom(documentPath ? getDirName(documentPath) : '', source);
  }
}

