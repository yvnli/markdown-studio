import { create } from 'zustand';
import {
  SAMPLE_FILES,
  SAMPLE_TREE,
  SAMPLE_WELCOME_PATH,
  buildDocumentFromSample,
} from '../data/sampleWorkspace';
import { isDocumentDirty } from '../domain/document';
import {
  buildTreeIndex,
  hasPath,
  type WorkspaceTreeIndex,
} from '../domain/treeIndex';
import { workspaceService } from '../services/file-system';
import type { DocumentTab } from '../types/document';
import type { FileNode, TreeNode, WorkspaceSnapshot } from '../types/workspace';
import { getBaseName, isMarkdownFile } from '../utils/paths';
import { createId } from '../utils/id';

export type WorkspaceStatus = 'sample' | 'loading' | 'connected' | 'permission';

interface WorkspaceState {
  documents: DocumentTab[];
  activeDocumentId: string | null;
  workspace: WorkspaceSnapshot;
  treeIndex: WorkspaceTreeIndex;
  workspaceStatus: WorkspaceStatus;
  workspaceError: string | null;
  pendingWorkspaceName: string;
  setActiveDocument: (id: string) => void;
  openNode: (node: FileNode) => Promise<void>;
  newScratchDocument: () => void;
  closeDocument: (id: string) => void;
  updateDocumentContent: (id: string, content: string) => void;
  updateCursor: (id: string, line: number, column: number) => void;
  markDocumentSaved: (id: string, lastModified?: number) => void;
  syncDocumentFromDisk: (id: string, content: string, lastModified: number) => void;
  switchWorkspace: (snapshot: WorkspaceSnapshot) => void;
  restoreWorkspaceSnapshot: (snapshot: WorkspaceSnapshot) => void;
  hydrateDocuments: (documents: DocumentTab[], activeDocumentId: string | null) => void;
  setTree: (tree: TreeNode[], fileCount?: number) => boolean;
  renameDocumentPaths: (oldPath: string, newPath: string) => void;
  setWorkspaceStatus: (status: WorkspaceStatus, error?: string | null) => void;
  setPendingWorkspace: (name: string) => void;
  resetToSample: () => void;
  removeDocumentsByPathPrefix: (prefix: string) => void;
}

const welcomeFile = SAMPLE_FILES.find((file) => file.path === SAMPLE_WELCOME_PATH) ?? SAMPLE_FILES[0];
const welcomeDocument = buildDocumentFromSample(welcomeFile);

const sampleWorkspace: WorkspaceSnapshot = {
  kind: 'sample',
  name: '示例工作区',
  tree: SAMPLE_TREE,
  fileCount: SAMPLE_FILES.length,
  openedAt: Date.now(),
};

/** 正在读取的文件，避免双击 / 并发调用打开出重复标签。 */
const openingNodes = new Map<string, Promise<void>>();

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  documents: [welcomeDocument],
  activeDocumentId: welcomeDocument.id,
  workspace: sampleWorkspace,
  treeIndex: buildTreeIndex(SAMPLE_TREE),
  workspaceStatus: 'sample',
  workspaceError: null,
  pendingWorkspaceName: '',

  setActiveDocument: (id) => {
    if (get().documents.some((document) => document.id === id)) {
      set({ activeDocumentId: id });
    }
  },

  openNode: async (node) => {
    if (node.kind !== 'file') return;
    if (!isMarkdownFile(node.path)) {
      throw new Error(
        '当前文件类型不支持编辑。图片文件请在文件树中点击预览；编辑器仅支持 Markdown 或纯文本文件。',
      );
    }
    const state = get();
    const matched = state.documents.find(
      (document) =>
        document.path === node.path &&
        (state.workspace.kind === 'sample'
          ? document.origin === 'sample'
          : document.origin === 'workspace'),
    );
    if (matched) {
      set({ activeDocumentId: matched.id });
      return;
    }
    if (state.workspace.kind === 'sample') {
      const sample = SAMPLE_FILES.find((file) => file.path === node.path);
      if (!sample) throw new Error('示例文件不存在。');
      const document = buildDocumentFromSample(sample);
      set((current) => ({
        documents: [...current.documents, document],
        activeDocumentId: document.id,
      }));
      return;
    }

    const workspaceOpenedAt = state.workspace.openedAt;
    const inFlight = openingNodes.get(node.path);
    if (inFlight) {
      await inFlight;
      if (get().workspace.openedAt !== workspaceOpenedAt) return;
      set((current) => {
        const opened = current.documents.find(
          (document) => document.path === node.path && document.origin === 'workspace',
        );
        return opened ? { activeDocumentId: opened.id } : current;
      });
      return;
    }

    const task = (async () => {
      const { content, lastModified } = await workspaceService.readTextFile(node.path);
      set((current) => {
        // 读取期间切换了工作区：丢弃旧工作区的结果，避免把旧文件带入新工作区。
        if (current.workspace.openedAt !== workspaceOpenedAt) return current;
        // 读取期间可能被其它入口打开，二次检查避免重复标签。
        const alreadyOpen = current.documents.find(
          (document) => document.path === node.path && document.origin === 'workspace',
        );
        if (alreadyOpen) {
          return { activeDocumentId: alreadyOpen.id };
        }
        const document: DocumentTab = {
          id: createId('doc'),
          title: getBaseName(node.path),
          path: node.path,
          origin: 'workspace',
          content,
          savedContent: content,
          lastModified,
          createdAt: Date.now(),
          cursorLine: 1,
          cursorColumn: 1,
        };
        return {
          documents: [...current.documents, document],
          activeDocumentId: document.id,
        };
      });
    })();
    openingNodes.set(node.path, task);
    try {
      await task;
    } finally {
      openingNodes.delete(node.path);
    }
  },

  newScratchDocument: () => {
    const now = Date.now();
    const count = get().documents.filter((document) => document.origin === 'scratch').length + 1;
    const document: DocumentTab = {
      id: createId('doc'),
      title: `未命名 ${count}`,
      path: null,
      origin: 'scratch',
      content: '',
      savedContent: '',
      lastModified: null,
      createdAt: now,
      cursorLine: 1,
      cursorColumn: 1,
    };
    set((state) => ({
      documents: [...state.documents, document],
      activeDocumentId: document.id,
    }));
  },

  closeDocument: (id) =>
    set((state) => {
      const index = state.documents.findIndex((document) => document.id === id);
      if (index === -1) return state;
      const documents = state.documents.filter((document) => document.id !== id);
      let activeDocumentId = state.activeDocumentId;
      if (state.activeDocumentId === id) {
        activeDocumentId = documents[Math.min(index, documents.length - 1)]?.id ?? null;
      }
      return { documents, activeDocumentId };
    }),

  updateDocumentContent: (id, content) =>
    set((state) => {
      const current = state.documents.find((document) => document.id === id);
      if (!current || current.content === content) return state;
      return {
        documents: state.documents.map((document) =>
          document.id === id ? { ...document, content } : document,
        ),
      };
    }),

  updateCursor: (id, line, column) =>
    set((state) => {
      const current = state.documents.find((document) => document.id === id);
      if (!current || (current.cursorLine === line && current.cursorColumn === column)) {
        return state;
      }
      return {
        documents: state.documents.map((document) =>
          document.id === id ? { ...document, cursorLine: line, cursorColumn: column } : document,
        ),
      };
    }),

  markDocumentSaved: (id, lastModified) =>
    set((state) => ({
      documents: state.documents.map((document) =>
        document.id === id
          ? {
              ...document,
              savedContent: document.content,
              lastModified: lastModified ?? document.lastModified,
            }
          : document,
      ),
    })),

  syncDocumentFromDisk: (id, content, lastModified) =>
    set((state) => ({
      documents: state.documents.map((document) =>
        document.id === id
          ? {
              ...document,
              content,
              savedContent: content,
              lastModified,
            }
          : document,
      ),
    })),

  switchWorkspace: (workspace) =>
    set((state) => {
      const scratchDocuments = state.documents.filter((document) => document.origin === 'scratch');
      return {
        workspace,
        treeIndex: buildTreeIndex(workspace.tree),
        workspaceStatus: 'connected',
        workspaceError: null,
        pendingWorkspaceName: '',
        documents: scratchDocuments,
        activeDocumentId: scratchDocuments[0]?.id ?? null,
      };
    }),

  restoreWorkspaceSnapshot: (workspace) =>
    set((state) => {
      const treeIndex = buildTreeIndex(workspace.tree);
      const documents = state.documents
        .filter((document) => document.origin !== 'sample')
        .map((document) => {
          if (document.origin !== 'workspace' || !document.path) return document;
          if (hasPath(treeIndex, document.path)) return document;
          // 文件已不在工作区中：保留内容，转为可另存的离线草稿，避免静默丢失。
          return {
            ...document,
            origin: 'scratch' as const,
            path: null,
            title: `${document.title}（离线草稿）`,
          };
        });
      const activeDocumentId = documents.some((document) => document.id === state.activeDocumentId)
        ? state.activeDocumentId
        : documents[0]?.id ?? null;
      return {
        workspace,
        treeIndex,
        workspaceStatus: 'connected',
        workspaceError: null,
        pendingWorkspaceName: '',
        documents,
        activeDocumentId,
      };
    }),

  hydrateDocuments: (documents, activeDocumentId) =>
    set({
      documents,
      activeDocumentId:
        activeDocumentId && documents.some((document) => document.id === activeDocumentId)
          ? activeDocumentId
          : documents[0]?.id ?? null,
    }),

  setTree: (tree, fileCount) => {
    const state = get();
    const treeIndex = buildTreeIndex(tree);
    const nextFileCount = fileCount ?? state.workspace.fileCount;
    if (treeIndex.signature === state.treeIndex.signature && nextFileCount === state.workspace.fileCount) {
      return false;
    }
    set({
      treeIndex,
      workspace: {
        ...state.workspace,
        tree,
        fileCount: nextFileCount,
      },
    });
    return true;
  },

  setWorkspaceStatus: (workspaceStatus, workspaceError = null) =>
    set({ workspaceStatus, workspaceError }),

  setPendingWorkspace: (pendingWorkspaceName) =>
    set({ pendingWorkspaceName, workspaceStatus: pendingWorkspaceName ? 'permission' : 'sample' }),

  resetToSample: () =>
    set({
      documents: [welcomeDocument],
      activeDocumentId: welcomeDocument.id,
      workspace: { ...sampleWorkspace, openedAt: Date.now() },
      treeIndex: buildTreeIndex(SAMPLE_TREE),
      workspaceStatus: 'sample',
      workspaceError: null,
      pendingWorkspaceName: '',
    }),

  renameDocumentPaths: (oldPath, newPath) =>
    set((state) => {
      let activeDocumentId = state.activeDocumentId;
      const documents = state.documents.map((document) => {
        if (!document.path) return document;
        const isExact = document.path === oldPath;
        const isNested = document.path.startsWith(`${oldPath}/`);
        if (!isExact && !isNested) return document;
        const nextPath = isExact ? newPath : `${newPath}${document.path.slice(oldPath.length)}`;
        if (state.activeDocumentId === document.id) activeDocumentId = document.id;
        // id 保持稳定：重命名/移动不应重建编辑器或丢失撤销历史。
        return {
          ...document,
          path: nextPath,
          title: getBaseName(nextPath),
        };
      });
      return { documents, activeDocumentId };
    }),

  removeDocumentsByPathPrefix: (prefix) =>
    set((state) => {
      const docs = state.documents.filter(
        (document) => !document.path || !document.path.startsWith(prefix),
      );
      let activeDocumentId = state.activeDocumentId;
      if (!docs.some((document) => document.id === activeDocumentId)) {
        activeDocumentId = docs[0]?.id ?? null;
      }
      return { documents: docs, activeDocumentId };
    }),
}));

export const selectDirtyWorkspacePaths = (state: WorkspaceState): string[] =>
  state.documents
    .filter(
      (document) => document.origin === 'workspace' && document.path && isDocumentDirty(document),
    )
    .map((document) => document.path as string);

export { isDocumentDirty };
