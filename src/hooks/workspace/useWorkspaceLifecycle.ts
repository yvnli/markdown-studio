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
          title: '已恢复本地工作区',
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
        title: '当前浏览器不支持打开本地文件夹',
        description: '请使用最新版 Chrome、Edge 或 Chromium。',
        tone: 'error',
        durationMs: 4200,
      });
      return;
    }
    const previousStatus = useWorkspaceStore.getState().workspaceStatus;
    useWorkspaceStore.getState().setWorkspaceStatus('loading');
    try {
      // 先落盘再切换：工作区切换后旧目录不再可写，未保存内容会永久丢失。
      const savedCount = await persistDirtyWorkspaceDocuments();
      const snapshot = await workspaceService.openDirectory();
      await adoptWorkspace(snapshot);
      pushToast({
        title: '工作区已打开',
        description:
          savedCount > 0
            ? `${snapshot.name} · ${snapshot.fileCount} 个 Markdown 文件 · 已保存 ${savedCount} 个未保存文档`
            : `${snapshot.name} · ${snapshot.fileCount} 个 Markdown 文件`,
        tone: 'success',
      });
    } catch (error) {
      useWorkspaceStore.getState().setWorkspaceStatus(previousStatus);
      if (error instanceof DOMException && error.name === 'AbortError') return;
      pushToast({
        title: '无法打开工作区',
        description: error instanceof Error ? error.message : '请重试。',
        tone: 'error',
        durationMs: 4200,
      });
    }
  }, [pushToast]);

  const reconnectWorkspace = useCallback(async () => {
    useWorkspaceStore.getState().setWorkspaceStatus('loading');
    try {
      const snapshot = await workspaceService.reconnectLastWorkspace();
      if (!snapshot) throw new Error('没有待恢复的工作区。');
      await adoptWorkspace(snapshot, { preserveRecovered: true });
      pushToast({ title: '工作区已重新连接', tone: 'success' });
    } catch (error) {
      useWorkspaceStore.getState().setWorkspaceStatus('permission');
      pushToast({
        title: '重新连接失败',
        description: error instanceof Error ? error.message : '请重新选择文件夹。',
        tone: 'error',
      });
    }
  }, [pushToast]);

  /**
   * 单飞刷新：5 秒轮询、手动刷新与桌面原生监听共享同一个进行中的 Promise。
   */
  const refreshWorkspace = useCallback(
    async (options: { silent?: boolean } = {}): Promise<void> => {
      if (!workspaceService.isConnected) return;
      if (refreshRef.current) return refreshRef.current;
      const workspaceOpenedAt = useWorkspaceStore.getState().workspace.openedAt;
      const task = (async () => {
        try {
          const snapshot = await workspaceService.scan();
          // 扫描期间切换了工作区：丢弃旧结果，防止旧树覆盖新工作区。
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
            pushToast({ title: '工作区已刷新', tone: 'default', durationMs: 1600 });
          }
        } catch (error) {
          // 后台轮询失败不抛出，避免产生未处理的 Promise rejection。
          if (!options.silent) {
            pushToast({
              title: '刷新工作区失败',
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
