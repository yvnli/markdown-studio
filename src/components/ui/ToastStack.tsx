import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useUIStore } from '../../app/uiStore';
import { cn } from '../../utils/cn';

export function ToastStack() {
  const toasts = useUIStore((state) => state.toasts);
  const dismiss = useUIStore((state) => state.dismissToast);

  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => {
        const Icon = toast.tone === 'error' ? AlertCircle : toast.tone === 'success' ? CheckCircle2 : Info;
        return (
          <div key={toast.id} className={cn('toast', `toast-${toast.tone}`)} role={toast.tone === 'error' ? 'alert' : 'status'}>
            <Icon size={15} aria-hidden="true" />
            <div className="toast-copy">
              <strong>{toast.title}</strong>
              {toast.description ? <span>{toast.description}</span> : null}
            </div>
            <button type="button" className="toast-close" aria-label="关闭提示" onClick={() => dismiss(toast.id)}>
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
