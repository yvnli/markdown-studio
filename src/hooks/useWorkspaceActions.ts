import { useMemo } from 'react';
import { useDocumentActions } from './workspace/useDocumentActions';
import { useFileTreeActions } from './workspace/useFileTreeActions';
import { useWorkspaceLifecycle } from './workspace/useWorkspaceLifecycle';

/**
 * 工作区动作的组合入口：生命周期、文档、文件树动作各自独立，对外保持同一 API。
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
