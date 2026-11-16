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
          label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          tip={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
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
        {dirty ? <span className="dirty-dot" aria-label="Unsaved changes" /> : null}
      </div>

      <div className="app-bar-actions">
        <IconButton label="Search workspace" tip={`Search workspace · ${shiftModShortcut('F')}`} onClick={onOpenSearch}>
          <Search size={17} />
        </IconButton>
        <button className="text-button app-action-label" type="button" onClick={onOpenFolder} data-tip="Open local folder" title="Open local folder">
          <FolderOpen size={16} />
          <span>Open folder</span>
        </button>
        <button
          className="primary-button"
          type="button"
          onClick={onExport}
          disabled={!hasDocument}
          data-tip="Export document"
          title="Export document"
        >
          <Download size={15} />
          <span>Export</span>
        </button>
        <IconButton label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={onToggleTheme}>
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </IconButton>
        <IconButton label="Settings" onClick={onOpenSettings}>
          <Settings2 size={17} />
        </IconButton>
      </div>
    </header>
  );
}
