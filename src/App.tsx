import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import { CloudSun, FilePlus2, FolderOpen } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { usePreferencesStore } from './app/preferencesStore';
import { useUIStore } from './app/uiStore';
import { useWorkspaceStore } from './app/workspaceStore';
import { isDocumentDirty } from './domain/document';
import { AppBar } from './components/layout/AppBar';
import { StatusBar } from './components/layout/StatusBar';
import { Sidebar } from './components/sidebar/Sidebar';
import { EditorTabs } from './components/editor/EditorTabs';
import { EditorToolbar } from './components/editor/EditorToolbar';
import { EditorPane } from './components/editor/EditorPane';
import { DialogHost } from './components/dialogs/DialogHost';
import { InsertImageDialog } from './components/dialogs/InsertImageDialog';
import { ToastStack } from './components/ui/ToastStack';
import { EmptyState } from './components/ui/EmptyState';
import { useGlobalHotkeys } from './hooks/useGlobalHotkeys';
import { useSessionPersistence } from './hooks/useSessionPersistence';
import { useResolvedTheme } from './hooks/useResolvedTheme';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useWorkspaceActionsContext } from './hooks/WorkspaceActionsContext';
import type { OutlineItem } from './services/markdown/slug';
import { cn } from './utils/cn';

const PreviewPane = lazy(() =>
  import('./components/preview/PreviewPane').then((module) => ({ default: module.PreviewPane })),
);

export default function App() {
  const theme = useResolvedTheme();
  const isMobile = useMediaQuery('(max-width: 900px)');
  const sidebarPreference = usePreferencesStore((state) => state.sidebarOpen);
  const toggleSidebarPreference = usePreferencesStore((state) => state.toggleSidebar);
  const viewMode = usePreferencesStore((state) => state.viewMode);
  const setViewMode = usePreferencesStore((state) => state.setViewMode);
  const syncScroll = usePreferencesStore((state) => state.syncScroll);
  const setSyncScroll = usePreferencesStore((state) => state.setSyncScroll);
  const fontSize = usePreferencesStore((state) => state.fontSize);
  const setAppearance = usePreferencesStore((state) => state.setAppearance);
  const activeDocumentId = useWorkspaceStore((state) => state.activeDocumentId);
  const activeMeta = useWorkspaceStore(
    useShallow((state) => {
      const document = state.documents.find((item) => item.id === state.activeDocumentId);
      return document
        ? { title: document.title, dirty: isDocumentDirty(document) }
        : null;
    }),
  );
  const activeTitle = activeMeta?.title ?? '';
  const activeDocumentPath = useWorkspaceStore(
    (state) =>
      state.documents.find((document) => document.id === state.activeDocumentId)?.path ?? null,
  );
  const newScratchDocument = useWorkspaceStore((state) => state.newScratchDocument);
  const mobileSidebarOpen = useUIStore((state) => state.mobileSidebarOpen);
  const setMobileSidebarOpen = useUIStore((state) => state.setMobileSidebarOpen);
  const setSidebarTab = useUIStore((state) => state.setSidebarTab);
  const openDialog = useUIStore((state) => state.openDialog);
  const imageInsert = useUIStore((state) => state.imageInsert);
  const closeImageInsert = useUIStore((state) => state.closeImageInsert);
  const imagePreview = useUIStore((state) => state.imagePreview);
  const closeImagePreview = useUIStore((state) => state.closeImagePreview);
  const outlineOpen = useUIStore((state) => state.outlineOpen);
  const setOutlineOpen = useUIStore((state) => state.setOutlineOpen);
  const openFind = useUIStore((state) => state.openFind);
  const closeFind = useUIStore((state) => state.closeFind);
  const revealRequest = useUIStore((state) => state.revealRequest);
  const pushToast = useUIStore((state) => state.pushToast);
  const actions = useWorkspaceActionsContext();
  const sessionHydrated = useSessionPersistence();
  const restoreStartedRef = useRef(false);

  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const previewScrollRef = useRef<HTMLDivElement | null>(null);
  const syncLockRef = useRef(0);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const sidebarVisible = isMobile ? mobileSidebarOpen : sidebarPreference;

  useEffect(() => {
    if (!isMobile) setMobileSidebarOpen(false);
  }, [isMobile, setMobileSidebarOpen]);

  useEffect(() => {
    document.title = activeTitle ? `${activeTitle} · Markdown studio` : 'Markdown studio';
  }, [activeTitle]);

  useEffect(() => {
    if (!sessionHydrated || restoreStartedRef.current) return;
    restoreStartedRef.current = true;
    void actions.restoreWorkspace();
  }, [actions, sessionHydrated]);

  useEffect(() => {
    const bridge = window.markdownStudioDesktop;
    if (!bridge) return;
    bridge.onOpenFolder(() => {
      void actions.openFolder();
    });
    // 桌面端原生文件监听：发生外部变更时立即静默刷新，5 秒轮询仅作兜底。
    bridge.onWorkspaceChanged(() => {
      void actions.refreshWorkspace({ silent: true });
    });
    return () => {
      bridge.offOpenFolder();
      bridge.offWorkspaceChanged();
    };
  }, [actions]);

  useEffect(() => {
    setOutline([]);
    setOutlineOpen(false);
    closeFind();
    if (previewScrollRef.current) previewScrollRef.current.scrollTop = 0;
  }, [activeDocumentId, closeFind, setOutlineOpen]);

  // 切到纯预览或关闭文档时编辑器视图会卸载，插入图片对话框不应悬空。
  useEffect(() => {
    if (viewMode === 'preview' || !activeDocumentId) closeImageInsert();
  }, [activeDocumentId, closeImageInsert, viewMode]);

  // 图片查看器依附于当前文档的预览区：切换文档时关闭，避免看到上一篇文档的图片。
  useEffect(() => {
    closeImagePreview();
  }, [activeDocumentId, closeImagePreview]);

  // 图片查看器只存在于预览区；切回写作视图时一并关闭。
  useEffect(() => {
    if (viewMode === 'write') closeImagePreview();
  }, [closeImagePreview, viewMode]);

  useEffect(() => {
    if (revealRequest && viewMode === 'preview') setViewMode('split');
  }, [revealRequest, setViewMode, viewMode]);

  const onEditorReady = useCallback((view: EditorView | null) => {
    editorViewRef.current = view;
    setEditorView(view);
  }, []);

  const syncPreviewToEditor = useCallback(() => {
    const view = editorViewRef.current;
    const preview = previewScrollRef.current;
    if (!view || !preview || viewMode !== 'split' || !syncScroll) return;
    const editorRange = view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight;
    const previewRange = preview.scrollHeight - preview.clientHeight;
    if (editorRange <= 0 || previewRange <= 0) return;
    syncLockRef.current = performance.now() + 90;
    preview.scrollTop = (view.scrollDOM.scrollTop / editorRange) * previewRange;
  }, [syncScroll, viewMode]);

  const handleEditorScrollRatio = useCallback(
    (ratio: number) => {
      if (viewMode !== 'split' || !syncScroll) return;
      if (performance.now() < syncLockRef.current) return;
      const preview = previewScrollRef.current;
      if (!preview) return;
      const range = preview.scrollHeight - preview.clientHeight;
      if (range <= 0) return;
      syncLockRef.current = performance.now() + 90;
      preview.scrollTop = ratio * range;
    },
    [syncScroll, viewMode],
  );

  const handlePreviewScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (viewMode !== 'split' || !syncScroll) return;
      if (performance.now() < syncLockRef.current) return;
      const view = editorViewRef.current;
      if (!view) return;
      const preview = event.currentTarget;
      const previewRange = preview.scrollHeight - preview.clientHeight;
      const editorRange = view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight;
      if (previewRange <= 0 || editorRange <= 0) return;
      syncLockRef.current = performance.now() + 90;
      view.scrollDOM.scrollTop = (preview.scrollTop / previewRange) * editorRange;
    },
    [syncScroll, viewMode],
  );

  useEffect(() => {
    if (viewMode === 'split') {
      const timer = window.setTimeout(syncPreviewToEditor, 80);
      return () => window.clearTimeout(timer);
    }
  }, [syncPreviewToEditor, viewMode]);

  const handleToggleSidebar = () => {
    if (isMobile) setMobileSidebarOpen(!mobileSidebarOpen);
    else toggleSidebarPreference();
  };

  const openSearch = useCallback(() => {
    setSidebarTab('search');
    if (isMobile) setMobileSidebarOpen(true);
    else if (!sidebarPreference) toggleSidebarPreference();
    window.setTimeout(() => {
      document.querySelector<HTMLInputElement>('.search-field input')?.focus();
    }, 60);
  }, [isMobile, setSidebarTab, setMobileSidebarOpen, sidebarPreference, toggleSidebarPreference]);

  const openSettings = useCallback(() => openDialog({ type: 'settings' }), [openDialog]);

  const openDocumentFind = useCallback(
    (replace = false) => {
      if (!activeDocumentId) return;
      if (viewMode === 'preview') setOutlineOpen(false);
      openFind({
        replace: viewMode === 'preview' ? false : replace,
        seed: viewMode !== 'preview',
      });
    },
    [activeDocumentId, openFind, setOutlineOpen, viewMode],
  );

  const openPathFromPreview = useCallback(
    (path: string) => void actions.openPath(path),
    [actions],
  );

  const openNewWorkspaceFile = useCallback(() => {
    const workspace = useWorkspaceStore.getState().workspace;
    if (workspace.kind !== 'file-system') {
      pushToast({
        title: '示例工作区为只读',
        description: '打开本地文件夹后即可创建文件。',
        tone: 'default',
      });
      return;
    }
    openDialog({ type: 'new-entry', entryKind: 'file', parentPath: '', parentLabel: workspace.name });
  }, [openDialog, pushToast]);

  useGlobalHotkeys({
    onSave: () => {
      if (activeDocumentId) void actions.saveDocument(activeDocumentId);
    },
    onOpenFolder: () => void actions.openFolder(),
    onNewDocument: newScratchDocument,
    onNewFile: openNewWorkspaceFile,
    onFind: () => openDocumentFind(false),
    onReplace: () => openDocumentFind(true),
    onGlobalSearch: openSearch,
    onSettings: openSettings,
  });

  const handleToggleSync = () => {
    setSyncScroll(!syncScroll);
    if (!syncScroll) window.setTimeout(syncPreviewToEditor, 50);
  };

  const selectOutline = (id: string) => {
    const preview = previewScrollRef.current;
    const target = preview?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setOutlineOpen(false);
  };

  const toggleTheme = () => setAppearance(theme === 'dark' ? 'light' : 'dark');

  return (
    <div className={cn('app-shell', !sidebarVisible && 'sidebar-collapsed')}>
      <AppBar
        title={activeTitle || 'Markdown studio'}
        dirty={Boolean(activeMeta?.dirty)}
        sidebarOpen={sidebarVisible}
        theme={theme}
        hasDocument={Boolean(activeMeta)}
        onToggleSidebar={handleToggleSidebar}
        onOpenFolder={() => void actions.openFolder()}
        onOpenSearch={openSearch}
        onExport={() => openDialog({ type: 'export' })}
        onToggleTheme={toggleTheme}
        onOpenSettings={openSettings}
      />

      <div className="app-body">
        <Sidebar
          collapsed={!sidebarVisible}
          mobileOpen={isMobile && mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />
        {isMobile && mobileSidebarOpen ? (
          <button type="button" className="sidebar-scrim" aria-label="关闭侧边栏" onClick={() => setMobileSidebarOpen(false)} />
        ) : null}
        <main className="main-column">
          <EditorTabs />
          <EditorToolbar
            editorView={editorView}
            hasDocument={Boolean(activeMeta)}
            onOpenFind={() => openDocumentFind(false)}
          />
          <div className="workspace-panes" data-view={viewMode}>
            {activeDocumentId || imagePreview ? (
              <>
                {activeDocumentId && viewMode !== 'preview' ? (
                  <EditorPane
                    documentId={activeDocumentId}
                    fontSize={fontSize}
                    onReady={onEditorReady}
                    onScrollRatio={handleEditorScrollRatio}
                    onPasteImage={actions.pasteImage}
                  />
                ) : null}
                {viewMode !== 'write' ? (
                  <Suspense
                    fallback={
                      <section className="preview-pane preview-pane-loading" aria-busy="true">
                        <div className="preview-loading-hint">正在准备预览…</div>
                      </section>
                    }
                  >
                    <PreviewPane
                      documentId={activeDocumentId}
                      theme={theme}
                      outline={outline}
                      outlineOpen={outlineOpen}
                      syncScroll={syncScroll}
                      scrollRef={previewScrollRef}
                      onOutlineChange={setOutline}
                      onToggleOutline={() => {
                        if (!outlineOpen) closeFind();
                        setOutlineOpen(!outlineOpen);
                      }}
                      onCloseOutline={() => setOutlineOpen(false)}
                      onSelectOutline={selectOutline}
                      onScroll={handlePreviewScroll}
                      onToggleSync={handleToggleSync}
                      onOpenPath={openPathFromPreview}
                    />
                  </Suspense>
                ) : null}
              </>
            ) : (
              <div className="workspace-empty">
                <EmptyState
                  icon={<CloudSun size={28} strokeWidth={1.4} />}
                  title="开始一篇新文档"
                  description="新建一篇本地草稿，或者打开一个文件夹，把文字留在自己的磁盘上。"
                  action={
                    <div className="empty-actions">
                      <button type="button" className="primary-button" onClick={newScratchDocument}>
                        <FilePlus2 size={15} />
                        新建文档
                      </button>
                      <button type="button" className="secondary-button" onClick={() => void actions.openFolder()}>
                        <FolderOpen size={15} />
                        打开文件夹
                      </button>
                    </div>
                  }
                />
              </div>
            )}
          </div>
        </main>
      </div>

      <StatusBar />
      <DialogHost />
      <InsertImageDialog
        open={Boolean(imageInsert)}
        editorView={editorView}
        documentPath={activeDocumentPath}
        initialAlt={imageInsert?.initialAlt ?? ''}
        onClose={closeImageInsert}
      />
      <ToastStack />
    </div>
  );
}
