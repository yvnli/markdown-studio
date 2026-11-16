import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileImage,
  Info,
} from 'lucide-react';
import type { EditorView } from '@codemirror/view';
import { useUIStore } from '../../app/uiStore';
import { useWorkspaceStore } from '../../app/workspaceStore';
import {
  SUPPORTED_IMAGE_FORMATS_LABEL,
  analyzeImagePath,
  defaultImageAlt,
  encodeMarkdownDestination,
  escapeMarkdownAlt,
  suggestImageFiles,
} from '../../domain/imagePath';
import { workspaceService } from '../../services/file-system';
import { Modal } from '../ui/Modal';
import { insertImageMarkdown } from '../editor/commands';

interface InsertImageDialogProps {
  open: boolean;
  editorView: EditorView | null;
  documentPath: string | null;
  initialAlt: string;
  onClose: () => void;
}

export function InsertImageDialog({
  open,
  editorView,
  documentPath,
  initialAlt,
  onClose,
}: InsertImageDialogProps) {
  const [value, setValue] = useState('');
  const [alt, setAlt] = useState('');
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const imageFiles = useWorkspaceStore((state) => state.treeIndex.imageFiles);
  const connected = workspaceService.isConnected;
  const pushToast = useUIStore((state) => state.pushToast);

  const analysis = useMemo(
    () => analyzeImagePath(value, documentPath, imageFiles, { connected }),
    [connected, documentPath, imageFiles, value],
  );
  const suggestions = useMemo(
    () => suggestImageFiles(value, documentPath, imageFiles, 6),
    [documentPath, imageFiles, value],
  );

  useEffect(() => {
    if (!open) return;
    setValue('');
    setAlt(initialAlt.trim());
    setThumbnail(null);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [initialAlt, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setThumbnail(null);
    let request: Promise<string> | null = null;
    if (analysis.kind === 'data' && analysis.isImageFormat) {
      setThumbnail(analysis.source);
    } else if (analysis.kind === 'external') {
      setThumbnail(analysis.source);
    } else if (analysis.file && analysis.isImageFormat && analysis.resolvedPath) {
      request = workspaceService.resolveAssetObjectUrl(null, analysis.resolvedPath);
    }
    if (request) {
      void request
        .then((url) => {
          if (!cancelled) setThumbnail(url);
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [
    analysis.file,
    analysis.isImageFormat,
    analysis.kind,
    analysis.resolvedPath,
    analysis.source,
    open,
  ]);

  const submit = () => {
    if (!value.trim()) return;
    if (!editorView) {
      pushToast({
        title: '无法插入图片',
        description: '请先打开一篇文档并切换到写作或分屏视图。',
        tone: 'error',
      });
      return;
    }
    const destination =
      analysis.kind === 'local'
        ? encodeMarkdownDestination(analysis.source)
        : analysis.source.trim();
    const altText = escapeMarkdownAlt(alt.trim() || defaultImageAlt(analysis.source));
    insertImageMarkdown(editorView, `![${altText}](${destination})`);
    onClose();
  };

  if (!open) return null;

  const needsAttention =
    analysis.kind === 'local' && (!analysis.file || !analysis.isImageFormat);
  const HintIcon =
    analysis.tone === 'success'
      ? CheckCircle2
      : analysis.tone === 'warning'
        ? AlertTriangle
        : analysis.tone === 'error'
          ? AlertCircle
          : Info;

  return (
    <Modal
      title="插入图片"
      description="相对路径以当前文档目录为基准；以 / 开头表示工作区根目录。"
      size="md"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="secondary-button" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={!value.trim()}
            onClick={submit}
          >
            {needsAttention ? '仍然插入' : '插入图片'}
          </button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="form-field">
          <label htmlFor="insert-image-path">图片路径</label>
          <input
            id="insert-image-path"
            ref={inputRef}
            value={value}
            placeholder="../assets/photo.png"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setValue(event.target.value)}
          />
          <span className="form-hint">
            支持 {SUPPORTED_IMAGE_FORMATS_LABEL}，或 https:// / data: 图片。
          </span>
        </div>

        <div
          className={`image-path-hint tone-${analysis.tone}`}
          role="status"
          aria-live="polite"
        >
          <HintIcon size={14} aria-hidden="true" />
          <div className="image-path-hint-copy">
            <strong className="image-path-hint-title">{analysis.title}</strong>
            {analysis.detail ? (
              <span className="image-path-hint-detail">{analysis.detail}</span>
            ) : null}
            {analysis.hint ? (
              <span className="image-path-hint-tip">{analysis.hint}</span>
            ) : null}
          </div>
        </div>

        {thumbnail ? (
          <div className="image-insert-thumb">
            <img
              src={thumbnail}
              alt="图片预览"
              onError={() => setThumbnail(null)}
            />
          </div>
        ) : null}

        {suggestions.length ? (
          <div className="image-suggestions">
            <span className="image-suggestions-label">
              {value.trim() ? '工作区中的图片（点击替换为相对路径）' : '工作区中的图片'}
            </span>
            <div className="image-suggestion-list">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.file.path}
                  type="button"
                  className="image-suggestion"
                  title={`${suggestion.file.name} · ${suggestion.file.path}`}
                  onClick={() => setValue(suggestion.relativePath)}
                >
                  <FileImage size={13} aria-hidden="true" />
                  <span className="image-suggestion-name">{suggestion.file.name}</span>
                  <span className="image-suggestion-path">{suggestion.relativePath}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="form-field">
          <label htmlFor="insert-image-alt">图片说明</label>
          <input
            id="insert-image-alt"
            value={alt}
            placeholder={defaultImageAlt(value)}
            onChange={(event) => setAlt(event.target.value)}
          />
          <span className="form-hint">留空时使用文件名，方便屏幕阅读器与导出。</span>
        </div>
      </form>
    </Modal>
  );
}
