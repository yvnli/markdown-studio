import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useUIStore } from '../../app/uiStore';
import { useWorkspaceStore } from '../../app/workspaceStore';
import { isDocumentDirty } from '../../domain/document';
import { findFileNode } from '../../domain/treeIndex';
import { workspaceService } from '../../services/file-system';
import {
  adoptWorkspace,
  persistDirtyWorkspaceDocuments,
} from './workspaceHelpers';

export interface WorkspaceLifecycle {
  restoreWorkspace: () => Promise<void>;
  openFolder: () => Promise<void>;
  reconnectWorkspace: () => Promise<void>;
  refreshWorkspace: (options?: { silent?: boolean }) => Promise<void>;
}

export function useWorkspaceLifecycle(): WorkspaceLifecycle {
  const pushToast = useUIStore((state) => state.pushToast);
  const restoringRef = useRef(false);
  const refreshRef = useRef<Promise<void> | null>(null);

  const restoreWorkspace = useCallback(async () => {
    if (restoringRef.current) return;
    restoringRef.current = true;
    try {
      const restored = await workspaceService.restoreLastWorkspace();
      if (restored.snapshot) {
        await adoptWorkspace(restored.snapshot, { preserveRecovered: true });
        pushToast({
          title: 'Local workspace restored',
          description: restored.snapshot.name,
          tone: 'success',
        });
      } else if (restored.needsPermission && restored.name) {
        useWorkspaceStore.getState().setPendingWorkspace(restored.name);
      }
    } catch {
      // A missing or revoked handle should not block the local sample workspace.
    } finally {
      restoringRef.current = false;
    }
  }, [pushToast]);

  const openFolder = useCallback(async () => {
    if (!workspaceService.isSupported) {
      pushToast({
        title: "This browser can't open local folders",
        description: 'Use the latest Chrome, Edge, or Chromium.',
        tone: 'error',
        durationMs: 4200,
      });
      return;
    }
    const previousStatus = useWorkspaceStore.getState().workspaceStatus;
    useWorkspaceStore.getState().setWorkspaceStatus('loading');
    try {
      // Save before switching: the old folder is no longer writable after the switch, so unsaved changes would be lost permanently.
      const savedCount = await persistDirtyWorkspaceDocuments();
      const snapshot = await workspaceService.openDirectory();
      await adoptWorkspace(snapshot);
      const fileSummary = `${snapshot.fileCount} Markdown ${snapshot.fileCount === 1 ? 'file' : 'files'}`;
      pushToast({
        title: 'Workspace opened',
        description:
          savedCount > 0
            ? `${snapshot.name} · ${fileSummary} · wrote ${savedCount} unsaved ${savedCount === 1 ? 'document' : 'documents'} to disk`
            : `${snapshot.name} · ${fileSummary}`,
        tone: 'success',
      });
    } catch (error) {
      useWorkspaceStore.getState().setWorkspaceStatus(previousStatus);
      if (error instanceof DOMException && error.name === 'AbortError') return;
      pushToast({
        title: 'Could not open workspace',
        description: error instanceof Error ? error.message : 'Please try again.',
        tone: 'error',
        durationMs: 4200,
      });
    }
  }, [pushToast]);

  const reconnectWorkspace = useCallback(async () => {
    useWorkspaceStore.getState().setWorkspaceStatus('loading');
    try {
      const snapshot = await workspaceService.reconnectLastWorkspace();
      if (!snapshot) throw new Error('No workspace to restore.');
      await adoptWorkspace(snapshot, { preserveRecovered: true });
      pushToast({ title: 'Workspace reconnected', tone: 'success' });
    } catch (error) {
      useWorkspaceStore.getState().setWorkspaceStatus('permission');
      pushToast({
        title: 'Reconnect failed',
        description: error instanceof Error ? error.message : 'Please choose the folder again.',
        tone: 'error',
      });
    }
  }, [pushToast]);

  /**
   * Single-flight refresh: the 5-second poll, manual refresh, and native desktop listener share one in-progress Promise.
   */
  const refreshWorkspace = useCallback(
    async (options: { silent?: boolean } = {}): Promise<void> => {
      if (!workspaceService.isConnected) return;
      if (refreshRef.current) return refreshRef.current;
      const workspaceOpenedAt = useWorkspaceStore.getState().workspace.openedAt;
      const task = (async () => {
        try {
          const snapshot = await workspaceService.scan();
          // The workspace changed during the scan: drop the stale result so the old tree can't overwrite the new workspace.
          if (useWorkspaceStore.getState().workspace.openedAt !== workspaceOpenedAt) return;
          const changed = useWorkspaceStore.getState().setTree(snapshot.tree, snapshot.fileCount);
          const treeIndex = useWorkspaceStore.getState().treeIndex;
          const openDocuments = useWorkspaceStore.getState().documents;
          for (const document of openDocuments) {
            if (document.origin !== 'workspace' || !document.path || isDocumentDirty(document)) {
              continue;
            }
            const node = findFileNode(treeIndex, document.path);
            if (!node || node.lastModified <= (document.lastModified ?? 0)) continue;
            const latest = await workspaceService.readTextFile(document.path);
            useWorkspaceStore
              .getState()
              .syncDocumentFromDisk(document.id, latest.content, latest.lastModified);
          }
          if (!options.silent && changed) {
            pushToast({ title: 'Workspace refreshed', tone: 'default', durationMs: 1600 });
          }
        } catch (error) {
          // Don't throw on background poll failures, to avoid unhandled Promise rejections.
          if (!options.silent) {
            pushToast({
              title: 'Could not refresh workspace',
              description: error instanceof Error ? error.message : undefined,
              tone: 'error',
            });
          }
        }
      })();
      refreshRef.current = task;
      try {
        await task;
      } finally {
        refreshRef.current = null;
      }
    },
    [pushToast],
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && workspaceService.isConnected) {
        void refreshWorkspace({ silent: true });
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [refreshWorkspace]);

  return useMemo(
    () => ({ restoreWorkspace, openFolder, reconnectWorkspace, refreshWorkspace }),
    [openFolder, reconnectWorkspace, refreshWorkspace, restoreWorkspace],
  );
}
