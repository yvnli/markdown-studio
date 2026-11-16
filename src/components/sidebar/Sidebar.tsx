import { useCallback, useMemo } from 'react';
import {
  Cloud,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '../../app/uiStore';
import { selectDirtyWorkspacePaths, useWorkspaceStore } from '../../app/workspaceStore';
import { findTreeNode } from '../../domain/treeIndex';
import { useWorkspaceActionsContext } from '../../hooks/WorkspaceActionsContext';
import { cn } from '../../utils/cn';
import { FileTree } from './FileTree';
import { SearchPanel } from './SearchPanel';
import { IconButton } from '../ui/IconButton';
import type { RevealTarget } from '../../types/document';
import type { TreeNode } from '../../types/workspace';
import { shiftModShortcut } from '../../utils/platform';

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ collapsed, mobileOpen, onCloseMobile }: SidebarProps) {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const treeIndex = useWorkspaceStore((state) => state.treeIndex);
  const status = useWorkspaceStore((state) => state.workspaceStatus);
  const pendingWorkspaceName = useWorkspaceStore((state) => state.pendingWorkspaceName);
  const activePath = useWorkspaceStore(
    (state) => state.documents.find((document) => document.id === state.activeDocumentId)?.path ?? null,
  );
  const dirtyPaths = useWorkspaceStore(useShallow(selectDirtyWorkspacePaths));
  const sidebarTab = useUIStore((state) => state.sidebarTab);
  const setSidebarTab = useUIStore((state) => state.setSidebarTab);
  const openDialog = useUIStore((state) => state.openDialog);
  const pushToast = useUIStore((state) => state.pushToast);
  const revealInEditor = useUIStore((state) => state.revealInEditor);
  const { openFolder, reconnectWorkspace, refreshWorkspace, openPath, moveEntry } =
    useWorkspaceActionsContext();

  const connected = workspace.kind === 'file-system';
  const busy = status === 'loading';
  const dirtyPathSet = useMemo(() => new Set(dirtyPaths), [dirtyPaths]);

  const requestNewEntry = useCallback(
    (entryKind: 'file' | 'directory', parentPath: string, parentLabel: string) => {
      if (!connected) {
        pushToast({
          title: '示例工作区为只读',
          description: '打开本地文件夹后即可创建和编辑文件。',
          tone: 'default',
          durationMs: 3200,
        });
        return;
      }
      openDialog({ type: 'new-entry', entryKind, parentPath, parentLabel });
    },
    [connected, openDialog, pushToast],
  );

  const handleOpenPath = useCallback(
    (path: string, target?: RevealTarget) => {
      void openPath(path).then((opened) => {
        if (opened && target) revealInEditor(path, target);
      });
      if (window.matchMedia('(max-width: 900px)').matches) onCloseMobile();
    },
    [onCloseMobile, openPath, revealInEditor],
  );

  const handleMove = useCallback(
    (node: TreeNode, target: Parameters<typeof moveEntry>[1]) => {
      void moveEntry(node, target).catch((error: unknown) => {
        pushToast({
          title: '移动失败',
          description: error instanceof Error ? error.message : undefined,
          tone: 'error',
        });
      });
    },
    [moveEntry, pushToast],
  );

  const handleRequestRename = useCallback(
    (node: TreeNode) => {
      if (findTreeNode(treeIndex, node.path)) {
        openDialog({ type: 'rename-entry', node });
      }
    },
    [openDialog, treeIndex],
  );

  const handleRequestDelete = useCallback(
    (node: TreeNode) => {
      if (findTreeNode(treeIndex, node.path)) {
        openDialog({ type: 'delete-entry', node });
      }
    },
    [openDialog, treeIndex],
  );

  return (
    <aside
      className={cn(
        'sidebar',
        collapsed && 'is-collapsed',
        mobileOpen && 'is-mobile-open',
      )}
      aria-label="工作区侧边栏"
    >
      <div className="sidebar-top">
        <div className="workspace-identity">
          <span className="workspace-icon">
            {connected ? <HardDrive size={16} /> : <Cloud size={16} />}
          </span>
          <div className="workspace-copy">
            <strong title={workspace.name}>{workspace.name}</strong>
            <span>
              {connected
                ? `${workspace.fileCount} 个 Markdown 文件`
                : '示例工作区 · 本地只读'}
            </span>
          </div>
          <IconButton
            label="刷新工作区"
            tip="刷新工作区"
            size="sm"
            disabled={!connected || busy}
            onClick={() => void refreshWorkspace()}
          >
            <RefreshCw size={14} className={busy ? 'spin' : undefined} />
          </IconButton>
          <IconButton
            label="关闭侧边栏"
            tip="关闭侧边栏"
            size="sm"
            className="sidebar-mobile-close"
            onClick={onCloseMobile}
          >
            <X size={14} />
          </IconButton>
        </div>

        <div className="sidebar-primary-actions">
          <button
            type="button"
            className="sidebar-action-button"
            disabled={!connected}
            onClick={() => requestNewEntry('file', '', workspace.name)}
          >
            <FilePlus2 size={15} />
            <span>新建文件</span>
            <kbd>{shiftModShortcut('N')}</kbd>
          </button>
          <IconButton
            label="新建文件夹"
            tip="新建文件夹"
            size="sm"
            disabled={!connected}
            onClick={() => requestNewEntry('directory', '', workspace.name)}
          >
            <FolderPlus size={15} />
          </IconButton>
        </div>

        {status === 'permission' && pendingWorkspaceName ? (
          <div className="sidebar-notice">
            <ShieldAlert size={15} />
            <div>
              <strong>需要重新授权</strong>
              <span>{pendingWorkspaceName}</span>
            </div>
            <button type="button" className="small-button" onClick={() => void reconnectWorkspace()}>
              连接
            </button>
          </div>
        ) : null}

        {!connected ? (
          <button type="button" className="open-workspace-button" onClick={() => void openFolder()}>
            <FolderOpen size={15} />
            打开本地文件夹
          </button>
        ) : null}
      </div>

      <div className="sidebar-tabs" role="tablist" aria-label="侧边栏面板">
        <button
          type="button"
          role="tab"
          aria-selected={sidebarTab === 'files'}
          className={cn('sidebar-tab', sidebarTab === 'files' && 'is-active')}
          onClick={() => setSidebarTab('files')}
        >
          文件
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={sidebarTab === 'search'}
          className={cn('sidebar-tab', sidebarTab === 'search' && 'is-active')}
          onClick={() => setSidebarTab('search')}
        >
          <Search size={13} />
          搜索
        </button>
      </div>

      <div className="sidebar-content">
        <section className="sidebar-pane" hidden={sidebarTab !== 'files'}>
          <div className="file-pane-heading">
            <span>工作区文件</span>
            <span className="file-pane-count">{connected ? workspace.fileCount : 'DEMO'}</span>
          </div>
          <FileTree
            key={`${workspace.name}-${workspace.openedAt}`}
            nodes={workspace.tree}
            activePath={activePath}
            connected={connected}
            dirtyPaths={dirtyPathSet}
            onOpenFile={handleOpenPath}
            onRequestNewEntry={requestNewEntry}
            onRequestRename={handleRequestRename}
            onRequestDelete={handleRequestDelete}
            onMove={handleMove}
          />
          {busy ? (
            <div className="sidebar-loading" role="status">
              <Loader2 size={14} className="spin" />
              正在读取文件夹…
            </div>
          ) : null}
        </section>
        <section className="sidebar-pane sidebar-search-pane" hidden={sidebarTab !== 'search'}>
          <SearchPanel active={sidebarTab === 'search'} onOpenFile={handleOpenPath} />
        </section>
      </div>

      <div className="sidebar-footer">
        <span className={cn('status-indicator', connected && 'is-connected')} />
        {connected ? '本地文件 · 自动同步' : '数据仅保存在当前浏览器'}
      </div>
    </aside>
  );
}
