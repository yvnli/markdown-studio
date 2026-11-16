import type { TreeNode } from './workspace';

export interface DesktopWorkspaceInfo {
  name: string;
}

export interface DesktopScanResult {
  name: string;
  tree: TreeNode[];
  fileCount: number;
}

export interface DesktopReadResult {
  content: string;
  lastModified: number;
}

export interface DesktopMarkdownFile {
  path: string;
  content: string;
  lastModified: number;
}

export interface DesktopSaveImagePayload {
  directory: string;
  fileName: string;
  data: ArrayBuffer;
}

export interface DesktopBridge {
  readonly isElectron: true;
  readonly platform: string;
  chooseWorkspace(): Promise<DesktopWorkspaceInfo | null>;
  getLastWorkspace(): Promise<DesktopWorkspaceInfo | null>;
  forgetWorkspace(): Promise<void>;
  scanWorkspace(): Promise<DesktopScanResult>;
  readFile(path: string): Promise<DesktopReadResult>;
  writeFile(path: string, content: string): Promise<{ lastModified: number }>;
  exists(path: string): Promise<boolean>;
  createDirectory(path: string): Promise<void>;
  removeEntry(path: string): Promise<void>;
  renameEntry(oldPath: string, newPath: string): Promise<void>;
  saveImage(payload: DesktopSaveImagePayload): Promise<{ path: string }>;
  readAssetDataUrl(path: string): Promise<string | null>;
  readMarkdownFiles(): Promise<DesktopMarkdownFile[]>;
  onOpenFolder(callback: () => void): void;
  offOpenFolder(): void;
  onWorkspaceChanged(callback: () => void): void;
  offWorkspaceChanged(): void;
}
