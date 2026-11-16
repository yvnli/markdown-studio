import { useMemo } from 'react';
import { useDocumentActions } from './workspace/useDocumentActions';
import { useFileTreeActions } from './workspace/useFileTreeActions';
import { useWorkspaceLifecycle } from './workspace/useWorkspaceLifecycle';

/**
 * Workspace actions facade: lifecycle, document, and file tree actions stay separate while exposing one API.
 */
export function useWorkspaceActions() {
  const lifecycle = useWorkspaceLifecycle();
  const documents = useDocumentActions(lifecycle.refreshWorkspace);
  const tree = useFileTreeActions(lifecycle.refreshWorkspace, documents.openPath);

  return useMemo(
    () => ({ ...lifecycle, ...documents, ...tree }),
    [documents, lifecycle, tree],
  );
}
