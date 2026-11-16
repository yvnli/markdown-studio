import type { FileNode, TreeNode } from '../types/workspace';
import { isImageFile, isMarkdownFile } from '../utils/paths';

export interface WorkspaceTreeIndex {
  byPath: Map<string, TreeNode>;
  files: FileNode[];
  markdownFiles: FileNode[];
  imageFiles: FileNode[];
  /** Change signature: path + mtime + size, used to tell whether the tree actually changed. */
  signature: string;
}

export function buildTreeIndex(tree: TreeNode[]): WorkspaceTreeIndex {
  const byPath = new Map<string, TreeNode>();
  const files: FileNode[] = [];
  const markdownFiles: FileNode[] = [];
  const imageFiles: FileNode[] = [];
  const segments: string[] = [];

  const walk = (nodes: TreeNode[]): void => {
    for (const node of nodes) {
      byPath.set(node.path, node);
      if (node.kind === 'file') {
        files.push(node);
        segments.push(`${node.path}:${node.lastModified}:${node.size}`);
        if (isMarkdownFile(node.path)) markdownFiles.push(node);
        if (isImageFile(node.path)) imageFiles.push(node);
      } else {
        segments.push(`${node.path}/`);
        walk(node.children);
      }
    }
  };

  walk(tree);
  return { byPath, files, markdownFiles, imageFiles, signature: segments.join('|') };
}

export function findTreeNode(index: WorkspaceTreeIndex, path: string): TreeNode | null {
  return index.byPath.get(path) ?? null;
}

export function findFileNode(index: WorkspaceTreeIndex, path: string): FileNode | null {
  const node = index.byPath.get(path);
  return node?.kind === 'file' ? node : null;
}

export function firstMarkdownFile(index: WorkspaceTreeIndex): FileNode | null {
  return index.markdownFiles[0] ?? null;
}

export function hasPath(index: WorkspaceTreeIndex, path: string): boolean {
  return index.byPath.has(path);
}
