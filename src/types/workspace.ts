export type WorkspaceKind = 'sample' | 'file-system';

export interface FileNode {
  kind: 'file';
  name: string;
  path: string;
  extension: string;
  size: number;
  lastModified: number;
}

export interface DirectoryNode {
  kind: 'directory';
  name: string;
  path: string;
  children: TreeNode[];
}

export type TreeNode = FileNode | DirectoryNode;

export interface WorkspaceSnapshot {
  kind: WorkspaceKind;
  name: string;
  tree: TreeNode[];
  fileCount: number;
  openedAt: number;
}

export interface SearchFileInput {
  path: string;
  content: string;
}

export interface SearchMatch {
  path: string;
  fileName: string;
  line: number;
  column: number;
  preview: string;
  matchStart: number;
  matchLength: number;
}

export interface SearchFileResult {
  path: string;
  fileName: string;
  matches: SearchMatch[];
}

export type SearchWorkerRequest =
  | { type: 'set-index'; id: number; files: SearchFileInput[] }
  | { type: 'update-index'; id: number; files: SearchFileInput[] }
  | { type: 'reset-overrides'; id: number; paths: string[] }
  | {
      type: 'matching-paths';
      id: number;
      query: string;
      useRegex: boolean;
      caseSensitive: boolean;
    }
  | {
      type: 'search';
      id: number;
      query: string;
      useRegex: boolean;
      caseSensitive: boolean;
      maxResults: number;
    };

export type SearchWorkerResponse =
  | SearchResponse
  | { id: number; paths: string[] };

export interface SearchResponse {
  id?: number;
  results: SearchFileResult[];
  total: number;
  truncated: boolean;
  durationMs: number;
  error?: string;
}
