import { useState } from 'react';
import {
  Code2,
  FileText,
  Image as ImageIcon,
  Loader2,
  Moon,
  Sun,
} from 'lucide-react';
import { useUIStore } from '../../app/uiStore';
import { useWorkspaceStore } from '../../app/workspaceStore';
import type { ExportFormat, ExportOptions } from '../../types/export';
import { downloadBlob } from '../../utils/download';
import { cn } from '../../utils/cn';
import { Modal } from '../ui/Modal';

interface ExportDialogProps {
  initialFormat?: ExportFormat;
  onClose: () => void;
}

const formats: Array<{
  value: ExportFormat;
  label: string;
  description: string;
  icon: typeof FileText;
}> = [
  { value: 'pdf', label: 'PDF', description: 'Paginated, print-ready', icon: FileText },
  { value: 'html', label: 'HTML', description: 'Standalone web page', icon: Code2 },
  { value: 'docx', label: 'Word', description: '.docx document', icon: FileText },
  { value: 'png', label: 'Long image', description: 'Full-content snapshot', icon: ImageIcon },
];

export function ExportDialog({ initialFormat = 'pdf', onClose }: ExportDialogProps) {
  const document = useWorkspaceStore((state) =>
    state.documents.find((item) => item.id === state.activeDocumentId),
  );
  const pushToast = useUIStore((state) => state.pushToast);
  const currentTheme = window.document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  const [format, setFormat] = useState<ExportFormat>(initialFormat);
  const [options, setOptions] = useState<ExportOptions>({
    format: initialFormat,
    includeToc: false,
    includeHeader: false,
    includeFooter: false,
    theme: currentTheme,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateFormat = (next: ExportFormat) => {
    setFormat(next);
    setOptions((current) => ({ ...current, format: next }));
  };

  const updateOption = <K extends keyof ExportOptions>(key: K, value: ExportOptions[K]) => {
    setOptions((current) => ({ ...current, [key]: value }));
  };

  const runExport = async () => {
    if (!document) return;
    setBusy(true);
    setError(null);
    try {
      const { exportDocument } = await import('../../services/export/exportDocument');
      const result = await exportDocument({
        markdown: document.content,
        title: document.title,
        documentPath: document.path,
        options: { ...options, format },
      });
      downloadBlob(result.blob, result.filename);
      pushToast({
        title: 'Export complete',
        description: result.filename,
        tone: 'success',
        durationMs: 2600,
      });
      onClose();
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Export failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Export document"
      description={document ? document.title : 'No document open'}
      onClose={onClose}
      size="md"
      hideClose={busy}
      footer={
        <>
          <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="primary-button" onClick={() => void runExport()} disabled={busy || !document}>
            {busy ? <Loader2 size={14} className="spin" /> : null}
            Export {format.toUpperCase()}
          </button>
        </>
      }
    >
      <div className="export-format-grid">
        {formats.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.value}
              type="button"
              className={cn('export-format-card', format === item.value && 'is-selected')}
              aria-pressed={format === item.value}
              onClick={() => updateFormat(item.value)}
            >
              <Icon size={17} />
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </button>
          );
        })}
      </div>

      <div className="export-options">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={options.includeToc}
            onChange={(event) => updateOption('includeToc', event.target.checked)}
          />
          Include table of contents
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={options.includeHeader}
            onChange={(event) => updateOption('includeHeader', event.target.checked)}
          />
          Include header
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={options.includeFooter}
            onChange={(event) => updateOption('includeFooter', event.target.checked)}
          />
          Include footer
        </label>
      </div>

      {format !== 'docx' ? (
        <div className="settings-row export-theme-row">
          <div className="settings-row-copy">
            <strong>Export theme</strong>
            <span>PDF, HTML, and long images share the same black-and-white theme</span>
          </div>
          <div className="settings-choice">
            <button
              type="button"
              className={cn(options.theme === 'light' && 'is-selected')}
              onClick={() => updateOption('theme', 'light')}
            >
              <Sun size={13} />
              Light
            </button>
            <button
              type="button"
              className={cn(options.theme === 'dark' && 'is-selected')}
              onClick={() => updateOption('theme', 'dark')}
            >
              <Moon size={13} />
              Dark
            </button>
          </div>
        </div>
      ) : null}

      <p className="export-note">
        PDF and long images are generated from the current layout snapshot. Math fonts in HTML load from the KaTeX CDN. Exports don't include the editor interface.
      </p>
      {error ? <div className="form-error" role="alert">{error}</div> : null}
    </Modal>
  );
}
