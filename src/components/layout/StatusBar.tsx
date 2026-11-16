import { useDeferredValue, useMemo } from 'react';
import { HardDrive, Cloud } from 'lucide-react';
import { useWorkspaceStore } from '../../app/workspaceStore';
import { isDocumentDirty } from '../../domain/document';
import { calculateMarkdownStats, formatNumber } from '../../services/markdown/stats';
import { useWorkspaceActionsContext } from '../../hooks/WorkspaceActionsContext';

export function StatusBar() {
  const document = useWorkspaceStore((state) =>
    state.documents.find((item) => item.id === state.activeDocumentId),
  );
  const workspaceKind = useWorkspaceStore((state) => state.workspace.kind);
  const workspaceStatus = useWorkspaceStore((state) => state.workspaceStatus);
  const { saveDocument } = useWorkspaceActionsContext();
  const deferredContent = useDeferredValue(document?.content ?? '');
  const stats = useMemo(() => calculateMarkdownStats(deferredContent), [deferredContent]);

  const saveLabel = !document
    ? '没有打开的文档'
    : isDocumentDirty(document)
      ? '未保存'
      : document.origin === 'workspace'
        ? workspaceStatus === 'connected' && workspaceKind === 'file-system'
          ? '已保存到磁盘'
          : '本地草稿'
        : document.origin === 'sample'
          ? '示例文档'
          : '本地草稿';

  return (
    <footer className="status-bar">
      <div className="status-left">
        <button
          type="button"
          className={`status-save ${isDocumentDirty(document) ? 'is-dirty' : ''}`}
          onClick={() => {
            if (document) void saveDocument(document.id);
          }}
          disabled={!document}
          title={document?.origin === 'workspace' ? '保存到本地文件' : '保存 Markdown 副本'}
        >
          <span className="status-dot" />
          {saveLabel}
        </button>
        {document ? (
          <>
            <span className="status-separator" />
            <span className="status-path" title={document.path ?? '未命名草稿'}>
              {workspaceKind === 'file-system' ? <HardDrive size={11} /> : <Cloud size={11} />}
              {document.path ?? '未命名草稿'}
            </span>
          </>
        ) : null}
      </div>

      <div className="status-right">
        <span className="status-stat" title="字数 = 中文字符 + 英文单词">
          <b>{formatNumber(stats.words)}</b> 字
        </span>
        <span className="status-separator" />
        <span className="status-stat optional-stat" title="按连续字母/数字序列统计">
          <b>{formatNumber(stats.englishCharacters ? stats.words - stats.chineseCharacters : stats.words)}</b> 单词
        </span>
        <span className="status-separator optional-stat" />
        <span className="status-stat optional-stat" title="可见字符，不含空白">
          <b>{formatNumber(stats.characters)}</b> 字符
        </span>
        <span className="status-separator optional-stat" />
        <span className="status-stat optional-stat" title="以空行分隔的正文块">
          <b>{formatNumber(stats.paragraphs)}</b> 段落
        </span>
        <span className="status-separator" />
        <span className="status-stat" title="按 300 字/分钟估算">
          约 <b>{formatNumber(stats.readingMinutes)}</b> 分钟
        </span>
        <span className="status-separator" />
        <span className="status-stat status-position">
          {document ? `行 ${document.cursorLine}, 列 ${document.cursorColumn}` : '行 1, 列 1'}
        </span>
      </div>
    </footer>
  );
}
