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
          title={dialog.entryKind === 'file' ? 'New Markdown file' : 'New folder'}
          description={`Location: ${dialog.parentLabel || 'Workspace root'}`}
          label="Name"
          initialValue={dialog.entryKind === 'file' ? 'Untitled.md' : 'New folder'}
          placeholder={dialog.entryKind === 'file' ? 'note.md' : 'Folder name'}
          confirmLabel="Create"
          onClose={closeDialog}
          onConfirm={(name) => actions.createEntry(dialog.entryKind, dialog.parentPath, name)}
        />
      );
    case 'rename-entry':
      return (
        <TextPromptDialog
          title="Rename"
          description={dialog.node.path}
          label="New name"
          initialValue={dialog.node.name}
          confirmLabel="Rename"
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
