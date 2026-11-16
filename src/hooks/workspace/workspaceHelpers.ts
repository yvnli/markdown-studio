import { useWorkspaceStore } from '../../app/workspaceStore';
import { isDocumentDirty } from '../../domain/document';
import { buildTreeIndex, firstMarkdownFile } from '../../domain/treeIndex';
import { workspaceService } from '../../services/file-system';
import type { DocumentTab } from '../../types/document';
import type { WorkspaceSnapshot } from '../../types/workspace';

export function activeDocument(): DocumentTab | null {
  const state = useWorkspaceStore.getState();
  return state.documents.find((document) => document.id === state.activeDocumentId) ?? null;
}

export function findDocument(id: string): DocumentTab | null {
  return useWorkspaceStore.getState().documents.find((document) => document.id === id) ?? null;
}

/**
 * 切换工作区前把当前工作区所有未保存文档写回磁盘。
 * 写入失败会抛出，调用方中止切换，避免"切换即丢稿"。
 */
export async function persistDirtyWorkspaceDocuments(): Promise<number> {
  const dirty = useWorkspaceStore
    .getState()
    .documents.filter(
      (document) => document.origin === 'workspace' && document.path && isDocumentDirty(document),
    );
  if (dirty.length && !workspaceService.isConnected) {
    throw new Error('工作区未连接，无法保存未保存的文档。请先重新连接工作区，或分别导出草稿。');
  }
  for (const document of dirty) {
    const lastModified = await workspaceService.writeTextFile(
      document.path as string,
      document.content,
    );
    useWorkspaceStore.getState().markDocumentSaved(document.id, lastModified);
  }
  return dirty.length;
}

export async function adoptWorkspace(
  snapshot: WorkspaceSnapshot,
  options: { preserveRecovered?: boolean } = {},
): Promise<void> {
  const store = useWorkspaceStore.getState();
  if (options.preserveRecovered) {
    store.restoreWorkspaceSnapshot(snapshot);
  } else {
    store.switchWorkspace(snapshot);
  }
  const after = useWorkspaceStore.getState();
  if (!after.activeDocumentId) {
    const first = firstMarkdownFile(buildTreeIndex(snapshot.tree));
    if (first) await after.openNode(first);
  }
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('无法读取图片。'));
    reader.readAsDataURL(file);
  });
}
