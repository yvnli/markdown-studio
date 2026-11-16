import { useUIStore } from '../../app/uiStore';
import { useWorkspaceActionsContext } from '../../hooks/WorkspaceActionsContext';
import { CloseDocumentDialog } from './CloseDocumentDialog';
import { DeleteEntryDialog } from './DeleteEntryDialog';
import { ExportDialog } from './ExportDialog';
import { SettingsDialog } from './SettingsDialog';
import { TextPromptDialog } from './TextPromptDialog';

export function DialogHost() {
  const dialog = useUIStore((state) => state.dialog);
  const closeDialog = useUIStore((state) => state.closeDialog);
  const actions = useWorkspaceActionsContext();

  if (!dialog) return null;

  switch (dialog.type) {
    case 'new-entry':
      return (
        <TextPromptDialog
          title={dialog.entryKind === 'file' ? '新建 Markdown 文件' : '新建文件夹'}
          description={`位置：${dialog.parentLabel || '工作区根目录'}`}
          label="名称"
          initialValue={dialog.entryKind === 'file' ? '未命名.md' : '新建文件夹'}
          placeholder={dialog.entryKind === 'file' ? '笔记.md' : '文件夹名称'}
          confirmLabel="创建"
          onClose={closeDialog}
          onConfirm={(name) => actions.createEntry(dialog.entryKind, dialog.parentPath, name)}
        />
      );
    case 'rename-entry':
      return (
        <TextPromptDialog
          title="重命名"
          description={dialog.node.path}
          label="新名称"
          initialValue={dialog.node.name}
          confirmLabel="重命名"
          onClose={closeDialog}
          onConfirm={(name) => actions.renameEntry(dialog.node, name)}
        />
      );
    case 'delete-entry':
      return (
        <DeleteEntryDialog
          node={dialog.node}
          onClose={closeDialog}
          onConfirm={() => actions.deleteEntry(dialog.node)}
        />
      );
    case 'close-document':
      return (
        <CloseDocumentDialog
          documentId={dialog.documentId}
          title={dialog.title}
          onClose={closeDialog}
        />
      );
    case 'settings':
      return <SettingsDialog onClose={closeDialog} />;
    case 'export':
      return <ExportDialog initialFormat={dialog.initialFormat} onClose={closeDialog} />;
    default:
      return null;
  }
}
