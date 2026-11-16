import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import App from './App';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { WorkspaceActionsProvider } from './hooks/WorkspaceActionsContext';

if (window.markdownStudioDesktop) {
  document.documentElement.classList.add('is-electron');
  if (window.markdownStudioDesktop.platform === 'darwin') {
    document.documentElement.classList.add('is-electron-mac');
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <WorkspaceActionsProvider>
        <App />
      </WorkspaceActionsProvider>
    </ErrorBoundary>
  </StrictMode>,
);
