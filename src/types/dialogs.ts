import type { ExportFormat } from './export';
import type { TreeNode } from './workspace';

export type DialogState =
  | { type: 'new-entry'; entryKind: 'file' | 'directory'; parentPath: string; parentLabel: string }
  | { type: 'rename-entry'; node: TreeNode }
  | { type: 'delete-entry'; node: TreeNode }
  | { type: 'close-document'; documentId: string; title: string }
  | { type: 'settings' }
  | { type: 'export'; initialFormat?: ExportFormat }
  | { type: 'about' };

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  tone: 'default' | 'success' | 'error';
}
