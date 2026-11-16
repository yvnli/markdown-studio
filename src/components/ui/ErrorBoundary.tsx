import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

const BACKUP_KEY = 'mdstudio.session.backup.v1';

function downloadDraftBackup(): void {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) {
      window.alert('当前没有可恢复的草稿备份。');
      return;
    }
    const blob = new Blob([raw], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'markdown-studio-drafts.json';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    window.alert('草稿备份导出失败，请检查浏览器存储权限。');
  }
}

/**
 * 根级错误边界：渲染异常时保留可恢复入口，而不是整页白屏。
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Markdown studio render error:', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="fatal-error" role="alert">
        <div className="fatal-error-card">
          <h1>界面遇到了一个错误</h1>
          <p>未保存的内容仍保存在本地草稿备份中。你可以先导出备份，再重新加载应用。</p>
          <pre className="fatal-error-message">{error.message || String(error)}</pre>
          <div className="fatal-error-actions">
            <button type="button" className="primary-button" onClick={() => window.location.reload()}>
              重新加载
            </button>
            <button type="button" className="secondary-button" onClick={downloadDraftBackup}>
              导出草稿备份
            </button>
          </div>
        </div>
      </div>
    );
  }
}
