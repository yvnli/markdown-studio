import { DesktopWorkspaceService } from './desktopWorkspaceService';
import { WorkspaceService } from './workspaceService';
import type { WorkspaceServiceContract } from './types';

function createWorkspaceService(): WorkspaceServiceContract {
  if (typeof window !== 'undefined' && window.markdownStudioDesktop) {
    return new DesktopWorkspaceService(window.markdownStudioDesktop);
  }
  return new WorkspaceService();
}

export const workspaceService: WorkspaceServiceContract = createWorkspaceService();
export type { WorkspaceServiceContract } from './types';
