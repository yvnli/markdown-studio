import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import type { TreeNode } from '../../types/workspace';
import { Modal } from '../ui/Modal';

interface DeleteEntryDialogProps {
  node: TreeNode;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function DeleteEntryDialog({ node, onClose, onConfirm }: DeleteEntryDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Delete failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Delete ${node.kind === 'directory' ? 'folder' : 'file'}?`}
      description="This changes local files directly and can't be undone from Markdown studio."
      onClose={onClose}
      hideClose={busy}
      footer={
        <>
          <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="primary-button danger-button" onClick={() => void submit()} disabled={busy}>
            {busy ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
            Delete
          </button>
        </>
      }
    >
      <p className="dialog-danger-copy">
        <code>{node.path || node.name}</code>
        {node.kind === 'directory' ? ' and everything in it will be deleted permanently.' : ' will be deleted permanently.'}
      </p>
      {error ? <div className="form-error" role="alert">{error}</div> : null}
    </Modal>
  );
}
