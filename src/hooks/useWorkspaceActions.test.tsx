// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import type { DocumentTab } from '../types/document';

const mocks = vi.hoisted(() => {
  const snapshot = {
    kind: 'file-system' as const,
    name: 'Vault',
    tree: [],
    fileCount: 0,
    openedAt: 1,
  };
  const service = {
    isSupported: true,
    isConnected: true,
    openDirectory: vi.fn(async () => snapshot),
    restoreLastWorkspace: vi.fn(async () => ({})),
    reconnectLastWorkspace: vi.fn(async () => snapshot),
    scan: vi.fn(async () => snapshot),
    readTextFile: vi.fn(async () => ({ content: '# file', lastModified: 1 })),
    writeTextFile: vi.fn(async () => 2),
    entryExists: vi.fn(async () => false),
    createFile: vi.fn(async () => undefined),
    createDirectory: vi.fn(async () => undefined),
    deleteEntry: vi.fn(async () => undefined),
    renameEntry: vi.fn(async () => undefined),
    moveEntry: vi.fn(async () => 'moved.md'),
    saveImage: vi.fn(async () => ({
      assetPath: 'assets/image_1.png',
      relativePath: '../assets/image_1.png',
      objectUrl: 'blob:mock',
    })),
    resolveAssetObjectUrl: vi.fn(async () => 'blob:mock'),
    assetDataUrl: vi.fn(async () => null),
    collectMarkdownFiles: vi.fn(async () => []),
    clear: vi.fn(),
  };
  return { service, snapshot };
});

vi.mock('../services/file-system', () => ({ workspaceService: mocks.service }));

import { usePreferencesStore } from '../app/preferencesStore';
import { useWorkspaceActions } from './useWorkspaceActions';
import { useUIStore } from '../app/uiStore';
import { useWorkspaceStore } from '../app/workspaceStore';
import { isDocumentDirty } from '../domain/document';

function workspaceDocument(overrides: Partial<DocumentTab> = {}): DocumentTab {
  return {
    id: 'doc-a',
    title: 'a',
    path: 'notes/a.md',
    origin: 'workspace',
    content: 'edited',
    savedContent: 'original',
    lastModified: 1,
    createdAt: 1,
    cursorLine: 1,
    cursorColumn: 1,
    ...overrides,
  };
}

function setDocuments(documents: DocumentTab[], active = documents[0]?.id ?? null) {
  useWorkspaceStore.getState().hydrateDocuments(documents, active);
}

describe('useWorkspaceActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.service.isConnected = true;
    mocks.service.writeTextFile.mockResolvedValue(2);
    setDocuments([workspaceDocument()]);
  });

  afterEach(() => {
    cleanup();
    useUIStore.getState().closeImagePreview();
    usePreferencesStore.getState().setViewMode('split');
    useWorkspaceStore.getState().resetToSample();
  });

  it('saves dirty workspace documents before switching workspaces', async () => {
    const { result } = renderHook(() => useWorkspaceActions());
    await result.current.openFolder();

    expect(mocks.service.writeTextFile).toHaveBeenCalledWith('notes/a.md', 'edited');
    expect(mocks.service.openDirectory).toHaveBeenCalledTimes(1);
    const writeOrder = mocks.service.writeTextFile.mock.invocationCallOrder[0];
    const openOrder = mocks.service.openDirectory.mock.invocationCallOrder[0];
    expect(writeOrder).toBeLessThan(openOrder);
  });

  it('aborts the switch when a dirty document cannot be written', async () => {
    mocks.service.writeTextFile.mockRejectedValueOnce(new Error('disk full'));
    const { result } = renderHook(() => useWorkspaceActions());
    await result.current.openFolder();

    expect(mocks.service.openDirectory).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().documents[0].origin).toBe('workspace');
  });

  it('refuses to switch when the workspace is disconnected but drafts are dirty', async () => {
    mocks.service.isConnected = false;
    const { result } = renderHook(() => useWorkspaceActions());
    await result.current.openFolder();

    expect(mocks.service.writeTextFile).not.toHaveBeenCalled();
    expect(mocks.service.openDirectory).not.toHaveBeenCalled();
  });

  it('saves the requested document instead of whichever tab is active', async () => {
    const first = workspaceDocument({ id: 'doc-a', path: 'notes/a.md', content: 'A!' });
    const second = workspaceDocument({ id: 'doc-b', path: 'notes/b.md', content: 'B!' });
    setDocuments([first, second], 'doc-a');

    const { result } = renderHook(() => useWorkspaceActions());
    const saved = await result.current.saveDocument('doc-b');

    expect(saved).toBe(true);
    expect(mocks.service.writeTextFile).toHaveBeenCalledWith('notes/b.md', 'B!');
    const state = useWorkspaceStore.getState();
    expect(isDocumentDirty(state.documents.find((document) => document.id === 'doc-b'))).toBe(false);
    expect(isDocumentDirty(state.documents.find((document) => document.id === 'doc-a'))).toBe(true);
  });

  it('opens image files in the preview pane instead of a text tab', async () => {
    usePreferencesStore.getState().setViewMode('write');
    useWorkspaceStore.getState().setTree(
      [
        {
          kind: 'file',
          name: 'photo.png',
          path: 'assets/photo.png',
          extension: '.png',
          size: 2048,
          lastModified: 1,
        },
      ],
      0,
    );
    const { result } = renderHook(() => useWorkspaceActions());
    const opened = await result.current.openPath('assets/photo.png');

    expect(opened).toBe(true);
    expect(useUIStore.getState().imagePreview).toMatchObject({
      src: 'assets/photo.png',
      documentPath: null,
      title: 'photo.png',
    });
    // 写作视图没有预览区：打开图片时自动切到分屏，让图片出现在预览面板里。
    expect(usePreferencesStore.getState().viewMode).toBe('split');
    expect(mocks.service.readTextFile).not.toHaveBeenCalled();
  });

  it('resolves image paths against the document that requested the paste', async () => {
    const first = workspaceDocument({ id: 'doc-a', path: 'notes/a.md' });
    const second = workspaceDocument({ id: 'doc-b', path: 'notes/b.md' });
    setDocuments([first, second], 'doc-a');

    const { result } = renderHook(() => useWorkspaceActions());
    const file = new File([new Uint8Array([1, 2, 3])], 'shot.png', { type: 'image/png' });
    const markdown = await result.current.pasteImage(file, 'doc-b');

    expect(mocks.service.saveImage).toHaveBeenCalledWith(
      file,
      'notes/b.md',
      expect.any(String),
      'image/png',
    );
    expect(markdown).toBe('![粘贴的图片](../assets/image_1.png)');
  });
});
