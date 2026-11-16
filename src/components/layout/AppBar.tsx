import { Download, FolderOpen, Moon, PanelLeft, Search, Settings2, Sun } from 'lucide-react';
import { IconButton } from '../ui/IconButton';
import { shiftModShortcut } from '../../utils/platform';
import { cn } from '../../utils/cn';

interface AppBarProps {
  title: string;
  dirty: boolean;
  sidebarOpen: boolean;
  theme: 'light' | 'dark';
  hasDocument: boolean;
  onToggleSidebar: () => void;
  onOpenFolder: () => void;
  onOpenSearch: () => void;
  onExport: () => void;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
}

export function AppBar({
  title,
  dirty,
  sidebarOpen,
  theme,
  hasDocument,
  onToggleSidebar,
  onOpenFolder,
  onOpenSearch,
  onExport,
  onToggleTheme,
  onOpenSettings,
}: AppBarProps) {
  return (
    <header className="app-bar">
      <div className="app-bar-leading">
        <IconButton
          label={sidebarOpen ? '收起侧边栏' : '展开侧边栏'}
          tip={sidebarOpen ? '收起侧边栏' : '展开侧边栏'}
          active={sidebarOpen}
          onClick={onToggleSidebar}
        >
          <PanelLeft size={17} />
        </IconButton>
        <div className="brand" aria-label="Markdown studio">
          <span className="brand-logo" aria-hidden="true">☁️</span>
          <span className="brand-wordmark">
            <strong>Markdown studio</strong>
            <span>LOCAL-FIRST WRITING</span>
          </span>
        </div>
      </div>

      <div className="document-heading">
        <span className={cn('document-heading-title', !hasDocument && 'is-placeholder')}>
          {hasDocument ? title : 'Markdown studio'}
        </span>
        {dirty ? <span className="dirty-dot" aria-label="有未保存的更改" /> : null}
      </div>

      <div className="app-bar-actions">
        <IconButton label="全局搜索" tip={`全局搜索 · ${shiftModShortcut('F')}`} onClick={onOpenSearch}>
          <Search size={17} />
        </IconButton>
        <button className="text-button app-action-label" type="button" onClick={onOpenFolder} data-tip="打开本地文件夹" title="打开本地文件夹">
          <FolderOpen size={16} />
          <span>打开文件夹</span>
        </button>
        <button
          className="primary-button"
          type="button"
          onClick={onExport}
          disabled={!hasDocument}
          data-tip="导出文档"
          title="导出文档"
        >
          <Download size={15} />
          <span>导出</span>
        </button>
        <IconButton label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'} onClick={onToggleTheme}>
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </IconButton>
        <IconButton label="设置" onClick={onOpenSettings}>
          <Settings2 size={17} />
        </IconButton>
      </div>
    </header>
  );
}
