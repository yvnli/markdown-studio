import { useCallback, useMemo } from 'react';
import { useUIStore } from '../../app/uiStore';
import { useWorkspaceStore } from '../../app/workspaceStore';
import { workspaceService } from '../../services/file-system';
import type { DirectoryNode, TreeNode } from '../../types/workspace';
import {
  ensureExtension,
  getDirName,
  getExtension,
  joinPath,
} from '../../utils/paths';

export interface FileTreeActions {
  createEntry: (
    entryKind: 'file' | 'directory',
    parentPath: string,
    rawName: string,
  ) => Promise<void>;
  renameEntry: (node: TreeNode, rawName: string) => Promise<void>;
  deleteEntry: (node: TreeNode) => Promise<void>;
  moveEntry: (node: TreeNode, target: DirectoryNode) => Promise<void>;
}

export function useFileTreeActions(
  refreshWorkspace: (options?: { silent?: boolean }) => Promise<void>,
  openPath: (path: string) => Promise<boolean>,
): FileTreeActions {
  const pushToast = useUIStore((state) => state.pushToast);

  const createEntry = useCallback(
    async (entryKind: 'file' | 'directory', parentPath: string, rawName: string) => {
      if (!workspaceService.isConnected) throw new Error('Open a local workspace first.');
      const name = entryKind === 'file' ? ensureExtension(rawName) : rawName.trim();
      if (!name) throw new Error("Name can't be empty.");
      const path = joinPath(parentPath, name);
      if (await workspaceService.entryExists(path)) throw new Error('A file or folder with that name already exists.');
      if (entryKind === 'file') {
        await workspaceService.createFile(path, `# ${name.replace(/\.[^.]+$/, '')}\n`);
      } else {
        await workspaceService.createDirectory(path);
      }
      await refreshWorkspace({ silent: true });
      if (entryKind === 'file') await openPath(path);
      pushToast({
        title: entryKind === 'file' ? 'Markdown file created' : 'Folder created',
        description: path,
        tone: 'success',
      });
    },
    [openPath, pushToast, refreshWorkspace],
  );

  const renameEntry = useCallback(
    async (node: TreeNode, rawName: string) => {
      if (!workspaceService.isConnected) throw new Error('Open a local workspace first.');
      const fileName =
        node.kind === 'file' ? ensureExtension(rawName, getExtension(node.path)) : rawName.trim();
      const path = joinPath(getDirName(node.path), fileName);
      await workspaceService.renameEntry(node.path, path);
      useWorkspaceStore.getState().renameDocumentPaths(node.path, path);
      await refreshWorkspace({ silent: true });
      pushToast({ title: 'Name updated', description: path, tone: 'success' });
    },
    [pushToast, refreshWorkspace],
  );

  const deleteEntry = useCallback(
    async (node: TreeNode) => {
      if (!workspaceService.isConnected) throw new Error('Open a local workspace first.');
      await workspaceService.deleteEntry(node.path);
      useWorkspaceStore.getState().removeDocumentsByPathPrefix(node.path);
      await refreshWorkspace({ silent: true });
      pushToast({ title: 'Deleted', description: node.path, tone: 'default' });
    },
    [pushToast, refreshWorkspace],
  );

  const moveEntry = useCallback(
    async (node: TreeNode, target: DirectoryNode) => {
      if (!workspaceService.isConnected) throw new Error('Open a local workspace first.');
      if (
        node.path === target.path ||
        (node.kind === 'directory' && target.path.startsWith(`${node.path}/`))
      ) {
        throw new Error("Can't move an item into itself or its subfolder.");
      }
      const nextPath = await workspaceService.moveEntry(node.path, target.path);
      useWorkspaceStore.getState().renameDocumentPaths(node.path, nextPath);
      await refreshWorkspace({ silent: true });
      pushToast({ title: 'Moved', description: nextPath, tone: 'success' });
    },
    [pushToast, refreshWorkspace],
  );

  return useMemo(
    () => ({ createEntry, renameEntry, deleteEntry, moveEntry }),
    [createEntry, deleteEntry, moveEntry, renameEntry],
  );
}
