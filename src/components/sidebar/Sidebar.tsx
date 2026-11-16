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
          title: 'Sample workspace is read-only',
          description: 'Open a local folder to create and edit files.',
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
          title: 'Move failed',
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
      aria-label="Workspace sidebar"
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
                ? `${workspace.fileCount} Markdown ${workspace.fileCount === 1 ? 'file' : 'files'}`
                : 'Local read-only'}
            </span>
          </div>
          <IconButton
            label="Refresh workspace"
            tip="Refresh workspace"
            size="sm"
            disabled={!connected || busy}
            onClick={() => void refreshWorkspace()}
          >
            <RefreshCw size={14} className={busy ? 'spin' : undefined} />
          </IconButton>
          <IconButton
            label="Close sidebar"
            tip="Close sidebar"
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
            <span>New file</span>
            <kbd>{shiftModShortcut('N')}</kbd>
          </button>
          <IconButton
            label="New folder"
            tip="New folder"
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
              <strong>Permission needed</strong>
              <span>{pendingWorkspaceName}</span>
            </div>
            <button type="button" className="small-button" onClick={() => void reconnectWorkspace()}>
              Connect
            </button>
          </div>
        ) : null}

        {!connected ? (
          <button type="button" className="open-workspace-button" onClick={() => void openFolder()}>
            <FolderOpen size={15} />
            Open local folder
          </button>
        ) : null}
      </div>

      <div className="sidebar-tabs" role="tablist" aria-label="Sidebar panels">
        <button
          type="button"
          role="tab"
          aria-selected={sidebarTab === 'files'}
          className={cn('sidebar-tab', sidebarTab === 'files' && 'is-active')}
          onClick={() => setSidebarTab('files')}
        >
          Files
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={sidebarTab === 'search'}
          className={cn('sidebar-tab', sidebarTab === 'search' && 'is-active')}
          onClick={() => setSidebarTab('search')}
        >
          <Search size={13} />
          Search
        </button>
      </div>

      <div className="sidebar-content">
        <section className="sidebar-pane" hidden={sidebarTab !== 'files'}>
          <div className="file-pane-heading">
            <span>Workspace files</span>
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
              Reading folder…
            </div>
          ) : null}
        </section>
        <section className="sidebar-pane sidebar-search-pane" hidden={sidebarTab !== 'search'}>
          <SearchPanel active={sidebarTab === 'search'} onOpenFile={handleOpenPath} />
        </section>
      </div>

      <div className="sidebar-footer">
        <span className={cn('status-indicator', connected && 'is-connected')} />
        {connected ? 'Local files · Auto-sync' : 'Data stays in this browser'}
      </div>
    </aside>
  );
}
