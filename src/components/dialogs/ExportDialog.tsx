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
  { value: 'pdf', label: 'PDF', description: '分页、适合打印', icon: FileText },
  { value: 'html', label: 'HTML', description: '独立网页文件', icon: Code2 },
  { value: 'docx', label: 'Word', description: '.docx 文档', icon: FileText },
  { value: 'png', label: '长图', description: '完整内容快照', icon: ImageIcon },
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
        title: '导出完成',
        description: result.filename,
        tone: 'success',
        durationMs: 2600,
      });
      onClose();
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : '导出失败，请重试。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="导出文档"
      description={document ? document.title : '没有打开的文档'}
      onClose={onClose}
      size="md"
      hideClose={busy}
      footer={
        <>
          <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button type="button" className="primary-button" onClick={() => void runExport()} disabled={busy || !document}>
            {busy ? <Loader2 size={14} className="spin" /> : null}
            导出 {format.toUpperCase()}
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
          包含目录
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={options.includeHeader}
            onChange={(event) => updateOption('includeHeader', event.target.checked)}
          />
          包含页眉
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={options.includeFooter}
            onChange={(event) => updateOption('includeFooter', event.target.checked)}
          />
          包含页脚
        </label>
      </div>

      {format !== 'docx' ? (
        <div className="settings-row export-theme-row">
          <div className="settings-row-copy">
            <strong>导出主题</strong>
            <span>PDF、HTML 和长图会使用同一套黑白主题</span>
          </div>
          <div className="settings-choice">
            <button
              type="button"
              className={cn(options.theme === 'light' && 'is-selected')}
              onClick={() => updateOption('theme', 'light')}
            >
              <Sun size={13} />
              白色
            </button>
            <button
              type="button"
              className={cn(options.theme === 'dark' && 'is-selected')}
              onClick={() => updateOption('theme', 'dark')}
            >
              <Moon size={13} />
              深色
            </button>
          </div>
        </div>
      ) : null}

      <p className="export-note">
        PDF 与长图按当前排版快照生成；HTML 中的数学字体通过 KaTeX CDN 加载。导出的内容不包含编辑器界面。
      </p>
      {error ? <div className="form-error" role="alert">{error}</div> : null}
    </Modal>
  );
}
