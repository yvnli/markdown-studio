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
      setError(submitError instanceof Error ? submitError.message : '删除失败。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`删除${node.kind === 'directory' ? '文件夹' : '文件'}？`}
      description="此操作会直接修改本地文件，无法从 Markdown studio 撤销。"
      onClose={onClose}
      hideClose={busy}
      footer={
        <>
          <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button type="button" className="primary-button danger-button" onClick={() => void submit()} disabled={busy}>
            {busy ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
            删除
          </button>
        </>
      }
    >
      <p className="dialog-danger-copy">
        <code>{node.path || node.name}</code>
        {node.kind === 'directory' ? ' 及其中所有内容将被永久删除。' : ' 将被永久删除。'}
      </p>
      {error ? <div className="form-error" role="alert">{error}</div> : null}
    </Modal>
  );
}
