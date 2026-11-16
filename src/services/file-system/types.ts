import type { SearchFileInput, TreeNode, WorkspaceSnapshot } from '../../types/workspace';

export interface AssetSaveResult {
  assetPath: string;
  relativePath: string;
  objectUrl: string;
}

export interface RestoredWorkspaceResult {
  snapshot?: WorkspaceSnapshot;
  needsPermission?: boolean;
  name?: string;
}

export interface WorkspaceServiceContract {
  readonly isSupported: boolean;
  readonly isConnected: boolean;
  openDirectory(): Promise<WorkspaceSnapshot>;
  restoreLastWorkspace(): Promise<RestoredWorkspaceResult>;
  reconnectLastWorkspace(): Promise<WorkspaceSnapshot | null>;
  scan(): Promise<WorkspaceSnapshot>;
  readTextFile(path: string): Promise<{ content: string; lastModified: number }>;
  writeTextFile(path: string, content: string): Promise<number>;
  entryExists(path: string): Promise<boolean>;
  createFile(path: string, content?: string): Promise<void>;
  createDirectory(path: string): Promise<void>;
  deleteEntry(path: string): Promise<void>;
  renameEntry(oldPath: string, newPath: string): Promise<void>;
  moveEntry(oldPath: string, targetDirectory: string): Promise<string>;
  saveImage(
    image: Blob,
    documentPath: string | null,
    preferredDirectory: string,
    mimeType?: string,
  ): Promise<AssetSaveResult>;
  resolveAssetObjectUrl(documentPath: string | null, source: string): Promise<string>;
  assetDataUrl(documentPath: string | null, source: string): Promise<string | null>;
  collectMarkdownFiles(
    nodes: TreeNode[],
    options?: { onProgress?: (loaded: number, total: number) => void },
  ): Promise<SearchFileInput[]>;
  clear(): void;
}
