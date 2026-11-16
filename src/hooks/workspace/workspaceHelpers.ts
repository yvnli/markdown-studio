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
 * Write every unsaved document in the current workspace back to disk before switching.
 * Throws on failure so the caller can abort the switch and avoid losing drafts.
 */
export async function persistDirtyWorkspaceDocuments(): Promise<number> {
  const dirty = useWorkspaceStore
    .getState()
    .documents.filter(
      (document) => document.origin === 'workspace' && document.path && isDocumentDirty(document),
    );
  if (dirty.length && !workspaceService.isConnected) {
    throw new Error("Workspace not connected, so unsaved documents can't be written. Reconnect the workspace first, or export the drafts individually.");
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
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image.'));
    reader.readAsDataURL(file);
  });
}
