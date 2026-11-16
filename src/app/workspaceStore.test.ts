import { beforeEach, describe, expect, it } from 'vitest';
import { SAMPLE_FILES, SAMPLE_TREE, SAMPLE_WELCOME_PATH } from '../data/sampleWorkspace';
import { isDocumentDirty } from '../domain/document';
import { useWorkspaceStore, selectDirtyWorkspacePaths } from './workspaceStore';
import type { FileNode, WorkspaceSnapshot } from '../types/workspace';

const welcomeNode = SAMPLE_TREE.flatMap((node) =>
  node.kind === 'file' ? [node] : node.children,
).find((node): node is FileNode => node.kind === 'file' && node.path === SAMPLE_WELCOME_PATH)!;

function snapshot(tree = SAMPLE_TREE): WorkspaceSnapshot {
  return {
    kind: 'file-system',
    name: 'Vault',
    tree,
    fileCount: SAMPLE_FILES.length,
    openedAt: 1,
  };
}

describe('workspaceStore', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ workspaceStatus: 'sample' });
    useWorkspaceStore.getState().resetToSample();
  });

  it('keeps a stable document id across renames and moves', () => {
    const before = useWorkspaceStore.getState().documents[0];
    expect(before.path).toBe(SAMPLE_WELCOME_PATH);
    useWorkspaceStore.getState().renameDocumentPaths(SAMPLE_WELCOME_PATH, 'docs/renamed.md');
    const after = useWorkspaceStore.getState().documents[0];
    expect(after.id).toBe(before.id);
    expect(after.path).toBe('docs/renamed.md');
    expect(after.title).toBe('renamed');
  });

  it('derives dirty state from content instead of storing it', () => {
    useWorkspaceStore.getState().newScratchDocument();
    const state = useWorkspaceStore.getState();
    const scratch = state.documents.find((document) => document.origin === 'scratch')!;
    expect(isDocumentDirty(scratch)).toBe(false);

    state.updateDocumentContent(scratch.id, 'changed');
    const updated = useWorkspaceStore
      .getState()
      .documents.find((document) => document.id === scratch.id)!;
    expect(isDocumentDirty(updated)).toBe(true);
    expect(updated).not.toHaveProperty('dirty');

    useWorkspaceStore.getState().markDocumentSaved(scratch.id);
    const saved = useWorkspaceStore
      .getState()
      .documents.find((document) => document.id === scratch.id)!;
    expect(isDocumentDirty(saved)).toBe(false);
  });

  it('collects only dirty workspace documents for the switch guard', () => {
    useWorkspaceStore.getState().hydrateDocuments(
      [
        {
          ...useWorkspaceStore.getState().documents[0],
          id: 'workspace-1',
          path: 'notes/a.md',
          origin: 'workspace',
          content: 'edited',
          savedContent: 'original',
        },
      ],
      'workspace-1',
    );
    expect(selectDirtyWorkspacePaths(useWorkspaceStore.getState())).toEqual(['notes/a.md']);
  });

  it('deduplicates concurrent opens of the same sample file', async () => {
    const before = useWorkspaceStore.getState().documents.length;
    await Promise.all([
      useWorkspaceStore.getState().openNode(welcomeNode),
      useWorkspaceStore.getState().openNode(welcomeNode),
    ]);
    expect(useWorkspaceStore.getState().documents.length).toBe(before);
  });

  it('converts workspace documents missing from the new tree into offline drafts', () => {
    const base = useWorkspaceStore.getState().documents[0];
    useWorkspaceStore.getState().hydrateDocuments(
      [
        {
          ...base,
          id: 'ghost',
          path: 'missing.md',
          title: 'ghost',
          origin: 'workspace',
          content: 'keep me',
          savedContent: 'keep me',
        },
      ],
      'ghost',
    );
    useWorkspaceStore.getState().restoreWorkspaceSnapshot(snapshot());
    const ghost = useWorkspaceStore.getState().documents.find((document) => document.id === 'ghost')!;
    expect(ghost.origin).toBe('scratch');
    expect(ghost.path).toBeNull();
    expect(ghost.content).toBe('keep me');
  });

  it('skips tree updates when the scan signature is unchanged', () => {
    const changed = useWorkspaceStore.getState().setTree(SAMPLE_TREE, SAMPLE_FILES.length);
    expect(changed).toBe(false);

    const mutated = SAMPLE_TREE.map((node) =>
      node.kind === 'file' ? { ...node, lastModified: node.lastModified + 1 } : node,
    );
    expect(useWorkspaceStore.getState().setTree(mutated, SAMPLE_FILES.length)).toBe(true);
  });
});
