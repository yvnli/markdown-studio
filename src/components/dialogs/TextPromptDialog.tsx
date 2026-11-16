import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Modal } from '../ui/Modal';

interface TextPromptDialogProps {
  title: string;
  description?: string;
  label: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: (value: string) => Promise<void>;
}

export function TextPromptDialog({
  title,
  description,
  label,
  initialValue = '',
  placeholder,
  confirmLabel = '创建',
  onClose,
  onConfirm,
}: TextPromptDialogProps) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    const dot = initialValue.lastIndexOf('.');
    if (dot > 0) input.setSelectionRange(0, dot);
    else input.select();
  }, [initialValue]);

  const submit = async () => {
    if (busy || !value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(value.trim());
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '操作失败，请重试。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={title}
      description={description}
      onClose={onClose}
      hideClose={busy}
      footer={
        <>
          <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => void submit()}
            disabled={busy || !value.trim()}
          >
            {busy ? <Loader2 size={14} className="spin" /> : null}
            {confirmLabel}
          </button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="form-field">
          <label htmlFor="prompt-name">{label}</label>
          <input
            id="prompt-name"
            ref={inputRef}
            value={value}
            placeholder={placeholder}
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
            disabled={busy}
          />
        </div>
        {error ? (
          <div className="form-error" role="alert">
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
