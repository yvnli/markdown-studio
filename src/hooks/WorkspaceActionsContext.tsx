import { createContext, useContext, type ReactNode } from 'react';
import { useWorkspaceActions } from './useWorkspaceActions';

type WorkspaceActionsValue = ReturnType<typeof useWorkspaceActions>;

const WorkspaceActionsContext = createContext<WorkspaceActionsValue | null>(null);

export function WorkspaceActionsProvider({ children }: { children: ReactNode }) {
  const actions = useWorkspaceActions();
  return (
    <WorkspaceActionsContext.Provider value={actions}>
      {children}
    </WorkspaceActionsContext.Provider>
  );
}

// This file intentionally co-locates the provider and its hook.
// eslint-disable-next-line react-refresh/only-export-components
export function useWorkspaceActionsContext(): WorkspaceActionsValue {
  const context = useContext(WorkspaceActionsContext);
  if (!context) throw new Error('useWorkspaceActionsContext must be used inside WorkspaceActionsProvider');
  return context;
}
