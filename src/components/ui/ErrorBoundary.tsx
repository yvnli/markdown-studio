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
      window.alert('No draft backup to restore.');
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
    window.alert("Couldn't export the draft backup. Check browser storage permissions.");
  }
}

/**
 * Root error boundary: keep recovery options available when rendering fails instead of a blank page.
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
          <h1>Something went wrong</h1>
          <p>Unsaved content is still in the local draft backup. Export it before reloading the app.</p>
          <pre className="fatal-error-message">{error.message || String(error)}</pre>
          <div className="fatal-error-actions">
            <button type="button" className="primary-button" onClick={() => window.location.reload()}>
              Reload
            </button>
            <button type="button" className="secondary-button" onClick={downloadDraftBackup}>
              Export draft backup
            </button>
          </div>
        </div>
      </div>
    );
  }
}
