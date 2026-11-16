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
    { action: 'h1', label: 'Heading 1', tip: 'Heading 1', text: 'H1' },
    { action: 'h2', label: 'Heading 2', tip: 'Heading 2', text: 'H2' },
    { action: 'h3', label: 'Heading 3', tip: 'Heading 3', text: 'H3' },
  ],
  [
    { action: 'bold', label: 'Bold', tip: 'Bold', icon: <Bold size={16} />, shortcut: modShortcut('B') },
    { action: 'italic', label: 'Italic', tip: 'Italic', icon: <Italic size={16} />, shortcut: modShortcut('I') },
    { action: 'strike', label: 'Strikethrough', tip: 'Strikethrough', icon: <Strikethrough size={16} /> },
    { action: 'code', label: 'Code', tip: 'Inline code / code block', icon: <Code2 size={16} /> },
  ],
  [
    { action: 'quote', label: 'Quote', tip: 'Quote', icon: <Quote size={16} /> },
    { action: 'ul', label: 'Bullet list', tip: 'Bullet list', icon: <List size={16} /> },
    { action: 'ol', label: 'Numbered list', tip: 'Numbered list', icon: <ListOrdered size={16} /> },
    { action: 'task', label: 'Task list', tip: 'Task list', icon: <ListTodo size={16} /> },
  ],
  [
    { action: 'link', label: 'Link', tip: 'Insert link', icon: <Link2 size={16} />, shortcut: modShortcut('K') },
    { action: 'image', label: 'Image', tip: 'Insert image', icon: <ImagePlus size={16} /> },
    { action: 'table', label: 'Table', tip: 'Insert table', icon: <Table2 size={16} /> },
    { action: 'hr', label: 'Divider', tip: 'Insert divider', icon: <Minus size={16} /> },
    { action: 'math', label: 'Math', tip: 'Insert LaTeX formula', icon: <Sigma size={16} /> },
    { action: 'mermaid', label: 'Diagram', tip: 'Insert Mermaid diagram', icon: <Workflow size={16} /> },
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
          label="Find in file"
          tip={`Find in file · ${modShortcut('F')}`}
          size="sm"
          disabled={!hasDocument}
          onClick={onOpenFind}
        >
          <Search size={15} />
        </IconButton>
        <span className="toolbar-live-hint" aria-hidden="true">
          <span className="live-dot" />
          Syntax dimming
        </span>
        <SegmentedControl<ViewMode>
          label="Switch view"
          compact
          value={viewMode}
          onChange={setViewMode}
          options={[
            { value: 'write', label: 'Write', icon: <PenLine size={14} /> },
            { value: 'split', label: 'Split', icon: <Columns2 size={14} /> },
            { value: 'preview', label: 'Preview', icon: <Eye size={14} /> },
          ]}
        />
      </div>
    </div>
  );
}
