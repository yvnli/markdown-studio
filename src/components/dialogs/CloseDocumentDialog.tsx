import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useWorkspaceStore } from '../../app/workspaceStore';
import { useWorkspaceActionsContext } from '../../hooks/WorkspaceActionsContext';
import { Modal } from '../ui/Modal';

interface CloseDocumentDialogProps {
  documentId: string;
  title: string;
  onClose: () => void;
}

export function CloseDocumentDialog({ documentId, title, onClose }: CloseDocumentDialogProps) {
  const closeDocument = useWorkspaceStore((state) => state.closeDocument);
  const { saveDocument } = useWorkspaceActionsContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveAndClose = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = await saveDocument(documentId);
      if (!saved) throw new Error('Save failed. The document is still open.');
      closeDocument(documentId);
      onClose();
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Close unsaved document?"
      description="You can still cancel and keep writing."
      onClose={onClose}
      hideClose={busy}
      footer={
        <>
          <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="ghost-button"
            disabled={busy}
            onClick={() => {
              closeDocument(documentId);
              onClose();
            }}
          >
            Don't save and close
          </button>
          <button type="button" className="primary-button" onClick={() => void saveAndClose()} disabled={busy}>
            {busy ? <Loader2 size={14} className="spin" /> : null}
            Save and close
          </button>
        </>
      }
    >
      <p className="dialog-danger-copy">
        <strong>{title}</strong> has changes that haven't been saved to a file.
      </p>
      {error ? <div className="form-error" role="alert">{error}</div> : null}
    </Modal>
  );
}
