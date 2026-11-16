import type { ReactNode } from 'react';
import {
  Bold,
  Code2,
  Columns2,
  Eye,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  PenLine,
  Quote,
  Search,
  Sigma,
  Strikethrough,
  Table2,
  Workflow,
} from 'lucide-react';
import type { EditorView } from '@codemirror/view';
import { usePreferencesStore } from '../../app/preferencesStore';
import { useUIStore } from '../../app/uiStore';
import type { ViewMode } from '../../types/document';
import { cn } from '../../utils/cn';
import { runFormatAction, type FormatAction } from './commands';
import { SegmentedControl } from '../ui/SegmentedControl';
import { IconButton } from '../ui/IconButton';
import { modShortcut } from '../../utils/platform';

interface ToolDefinition {
  action: FormatAction;
  label: string;
  tip: string;
  icon?: ReactNode;
  text?: string;
  shortcut?: string;
}

const groups: ToolDefinition[][] = [
  [
    { action: 'h1', label: '一级标题', tip: '一级标题', text: 'H1' },
    { action: 'h2', label: '二级标题', tip: '二级标题', text: 'H2' },
    { action: 'h3', label: '三级标题', tip: '三级标题', text: 'H3' },
  ],
  [
    { action: 'bold', label: '加粗', tip: '加粗', icon: <Bold size={16} />, shortcut: modShortcut('B') },
    { action: 'italic', label: '斜体', tip: '斜体', icon: <Italic size={16} />, shortcut: modShortcut('I') },
    { action: 'strike', label: '删除线', tip: '删除线', icon: <Strikethrough size={16} /> },
    { action: 'code', label: '代码', tip: '行内代码 / 代码块', icon: <Code2 size={16} /> },
  ],
  [
    { action: 'quote', label: '引用', tip: '引用', icon: <Quote size={16} /> },
    { action: 'ul', label: '无序列表', tip: '无序列表', icon: <List size={16} /> },
    { action: 'ol', label: '有序列表', tip: '有序列表', icon: <ListOrdered size={16} /> },
    { action: 'task', label: '任务列表', tip: '任务列表', icon: <ListTodo size={16} /> },
  ],
  [
    { action: 'link', label: '链接', tip: '插入链接', icon: <Link2 size={16} />, shortcut: modShortcut('K') },
    { action: 'image', label: '图片', tip: '插入图片', icon: <ImagePlus size={16} /> },
    { action: 'table', label: '表格', tip: '插入表格', icon: <Table2 size={16} /> },
    { action: 'hr', label: '分割线', tip: '插入分割线', icon: <Minus size={16} /> },
    { action: 'math', label: '公式', tip: '插入 LaTeX 公式', icon: <Sigma size={16} /> },
    { action: 'mermaid', label: '图表', tip: '插入 Mermaid 图表', icon: <Workflow size={16} /> },
  ],
];

interface EditorToolbarProps {
  editorView: EditorView | null;
  hasDocument: boolean;
  onOpenFind: () => void;
}

export function EditorToolbar({ editorView, hasDocument, onOpenFind }: EditorToolbarProps) {
  const viewMode = usePreferencesStore((state) => state.viewMode);
  const setViewMode = usePreferencesStore((state) => state.setViewMode);
  const openImageInsert = useUIStore((state) => state.openImageInsert);
  const canFormat = Boolean(editorView) && viewMode !== 'preview' && hasDocument;

  const apply = (action: FormatAction) => {
    if (!editorView) return;
    if (action === 'image') {
      const selection = editorView.state.selection.main;
      const selected = editorView.state.sliceDoc(selection.from, selection.to).trim();
      openImageInsert(selected);
      return;
    }
    runFormatAction(editorView, action);
  };

  return (
    <div className="editor-toolbar">
      <div className="format-scroll">
        {groups.map((group, groupIndex) => (
          <div className="format-group" key={groupIndex}>
            {groupIndex > 0 ? <span className="format-separator" aria-hidden="true" /> : null}
            {group.map((tool) => (
              <button
                key={tool.action}
                type="button"
                className={cn('format-button', tool.text && 'format-button-text')}
                aria-label={tool.label}
                data-tip={tool.shortcut ? `${tool.tip} · ${tool.shortcut}` : tool.tip}
                title={tool.shortcut ? `${tool.tip} · ${tool.shortcut}` : tool.tip}
                disabled={!canFormat}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => apply(tool.action)}
              >
                {tool.text ?? tool.icon}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="toolbar-trailing">
        <IconButton
          label="在文件中查找"
          tip={`在文件中查找 · ${modShortcut('F')}`}
          size="sm"
          disabled={!hasDocument}
          onClick={onOpenFind}
        >
          <Search size={15} />
        </IconButton>
        <span className="toolbar-live-hint" aria-hidden="true">
          <span className="live-dot" />
          语法自动淡化
        </span>
        <SegmentedControl<ViewMode>
          label="切换视图"
          compact
          value={viewMode}
          onChange={setViewMode}
          options={[
            { value: 'write', label: '写作', icon: <PenLine size={14} /> },
            { value: 'split', label: '分屏', icon: <Columns2 size={14} /> },
            { value: 'preview', label: '预览', icon: <Eye size={14} /> },
          ]}
        />
      </div>
    </div>
  );
}
