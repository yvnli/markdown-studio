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
      if (!saved) throw new Error('保存失败，文档仍未关闭。');
      closeDocument(documentId);
      onClose();
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : '保存失败。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="关闭未保存的文档？"
      description="你仍然可以取消，并回到编辑器中继续写作。"
      onClose={onClose}
      hideClose={busy}
      footer={
        <>
          <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>
            取消
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
            不保存并关闭
          </button>
          <button type="button" className="primary-button" onClick={() => void saveAndClose()} disabled={busy}>
            {busy ? <Loader2 size={14} className="spin" /> : null}
            保存并关闭
          </button>
        </>
      }
    >
      <p className="dialog-danger-copy">
        <strong>{title}</strong> 含有尚未保存到文件的更改。
      </p>
      {error ? <div className="form-error" role="alert">{error}</div> : null}
    </Modal>
  );
}
