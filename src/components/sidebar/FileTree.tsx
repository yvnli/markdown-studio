import { memo, useEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown,
  ChevronRight,
  File,
  FileImage,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  Trash2,
} from 'lucide-react';
import type { DirectoryNode, FileNode, TreeNode } from '../../types/workspace';
import { cn } from '../../utils/cn';
import { isImageFile, isMarkdownFile } from '../../utils/paths';

interface FileTreeProps {
  nodes: TreeNode[];
  activePath: string | null;
  connected: boolean;
  dirtyPaths: Set<string>;
  onOpenFile: (path: string) => void;
  onRequestNewEntry: (kind: 'file' | 'directory', parentPath: string, parentLabel: string) => void;
  onRequestRename: (node: TreeNode) => void;
  onRequestDelete: (node: TreeNode) => void;
  onMove: (node: TreeNode, target: DirectoryNode) => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  node: TreeNode | null;
  parentPath: string;
  parentLabel: string;
}

function collectTopLevelDirectories(nodes: TreeNode[]): string[] {
  return nodes.filter((node): node is DirectoryNode => node.kind === 'directory').map((node) => node.path);
}

function fileIcon(node: FileNode) {
  if (isImageFile(node.path)) return <FileImage size={14} />;
  if (isMarkdownFile(node.path)) return <FileText size={14} />;
  return <File size={14} />;
}

function FileTreeComponent({
  nodes,
  activePath,
  connected,
  dirtyPaths,
  onOpenFile,
  onRequestNewEntry,
  onRequestRename,
  onRequestDelete,
  onMove,
}: FileTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(collectTopLevelDirectories(nodes)),
  );
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [dragging, setDragging] = useState<TreeNode | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const close = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setContextMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [contextMenu]);

  const toggle = (path: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const openContextMenu = (
    event: MouseEvent,
    node: TreeNode | null,
    parentPath: string,
    parentLabel: string,
  ) => {
    if (!connected) return;
    event.preventDefault();
    event.stopPropagation();
    const menuWidth = 190;
    const menuHeight = node ? 160 : 88;
    setContextMenu({
      x: Math.min(event.clientX, window.innerWidth - menuWidth - 8),
      y: Math.min(event.clientY, window.innerHeight - menuHeight - 8),
      node,
      parentPath,
      parentLabel,
    });
  };

  const handleDragStart = (event: DragEvent, node: TreeNode) => {
    if (!connected) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', node.path);
    setDragging(node);
  };

  const handleDragOver = (event: DragEvent, directoryPath: string) => {
    if (!dragging || !connected) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTarget(directoryPath);
  };

  const handleDrop = (event: DragEvent, target: DirectoryNode) => {
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(null);
    if (!dragging || dragging.path === target.path) {
      setDragging(null);
      return;
    }
    onMove(dragging, target);
    setDragging(null);
  };

  const renderNodes = (list: TreeNode[], depth: number) =>
    list.map((node) => {
      if (node.kind === 'directory') {
        const isExpanded = expanded.has(node.path);
        return (
          <div key={node.path} className="file-tree-branch">
            <div
              className={cn('file-tree-row', dropTarget === node.path && 'is-drop-target')}
              style={{ paddingLeft: `${10 + depth * 14}px` }}
              role="treeitem"
              aria-expanded={isExpanded}
              aria-level={depth + 1}
              tabIndex={0}
              draggable={connected}
              onDragStart={(event) => handleDragStart(event, node)}
              onDragEnd={() => {
                setDragging(null);
                setDropTarget(null);
              }}
              onDragOver={(event) => handleDragOver(event, node.path)}
              onDragLeave={() => setDropTarget((current) => (current === node.path ? null : current))}
              onDrop={(event) => handleDrop(event, node)}
              onClick={() => toggle(node.path)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  toggle(node.path);
                }
              }}
              onContextMenu={(event) =>
                openContextMenu(event, node, node.path, node.name)
              }
            >
              <span className="file-tree-chevron">
                {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </span>
              <span className="file-tree-icon">
                {isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />}
              </span>
              <span className="file-tree-name">{node.name}</span>
            </div>
            {isExpanded ? (
              <div role="group">
                {node.children.length ? (
                  renderNodes(node.children, depth + 1)
                ) : (
                  <div className="file-tree-empty-folder" style={{ paddingLeft: `${30 + depth * 14}px` }}>
                    空文件夹
                  </div>
                )}
              </div>
            ) : null}
          </div>
        );
      }

      const active = activePath === node.path;
      return (
        <div
          key={node.path}
          className={cn('file-tree-row', active && 'is-active')}
          style={{ paddingLeft: `${26 + depth * 14}px` }}
          role="treeitem"
          aria-selected={active}
          aria-level={depth + 1}
          tabIndex={0}
          draggable={connected}
          onDragStart={(event) => handleDragStart(event, node)}
          onDragEnd={() => setDragging(null)}
          onClick={() => onOpenFile(node.path)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onOpenFile(node.path);
            }
          }}
          onContextMenu={(event) => {
            const parent = node.path.includes('/') ? node.path.slice(0, node.path.lastIndexOf('/')) : '';
            const parentLabel = parent ? parent.split('/').at(-1) ?? parent : '工作区';
            openContextMenu(event, node, parent, parentLabel);
          }}
        >
          <span className="file-tree-icon">{fileIcon(node)}</span>
          <span className="file-tree-name">{node.name}</span>
          {dirtyPaths.has(node.path) ? <span className="file-tree-dirty" aria-label="未保存" /> : null}
        </div>
      );
    });

  return (
    <div
      className="file-tree"
      role="tree"
      aria-label="工作区文件"
      onContextMenu={(event) => {
        if (event.target === event.currentTarget) {
          openContextMenu(event, null, '', '工作区');
        }
      }}
    >
      {nodes.length ? renderNodes(nodes, 0) : (
        <p className="file-tree-placeholder">这个文件夹里还没有内容。</p>
      )}

      {contextMenu
        ? createPortal(
            <div
              ref={menuRef}
              className="context-menu"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              role="menu"
            >
              <button
                type="button"
                role="menuitem"
                className="context-menu-item"
                onClick={() => {
                  onRequestNewEntry('file', contextMenu.parentPath, contextMenu.parentLabel);
                  setContextMenu(null);
                }}
              >
                <FilePlus2 size={14} />
                新建 Markdown 文件
              </button>
              <button
                type="button"
                role="menuitem"
                className="context-menu-item"
                onClick={() => {
                  onRequestNewEntry('directory', contextMenu.parentPath, contextMenu.parentLabel);
                  setContextMenu(null);
                }}
              >
                <FolderPlus size={14} />
                新建文件夹
              </button>
              {contextMenu.node ? (
                <>
                  <div className="context-menu-separator" />
                  <button
                    type="button"
                    role="menuitem"
                    className="context-menu-item"
                    onClick={() => {
                      onRequestRename(contextMenu.node!);
                      setContextMenu(null);
                    }}
                  >
                    <Pencil size={14} />
                    重命名
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="context-menu-item context-menu-danger"
                    onClick={() => {
                      onRequestDelete(contextMenu.node!);
                      setContextMenu(null);
                    }}
                  >
                    <Trash2 size={14} />
                    删除
                  </button>
                </>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export const FileTree = memo(FileTreeComponent);
