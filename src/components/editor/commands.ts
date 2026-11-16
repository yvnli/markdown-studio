import type { EditorView } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';

export type FormatAction =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bold'
  | 'italic'
  | 'strike'
  | 'code'
  | 'link'
  | 'image'
  | 'quote'
  | 'ul'
  | 'ol'
  | 'task'
  | 'table'
  | 'hr'
  | 'math'
  | 'mermaid';

export type LinePrefixKind = 'quote' | 'ul' | 'ol' | 'task';

export function transformHeadingLines(lines: string[], level: number): string[] {
  const target = `${'#'.repeat(level)} `;
  const nonEmpty = lines.filter((line) => line.trim());
  const allTarget =
    nonEmpty.length > 0 &&
    nonEmpty.every((line) => line.replace(/^\s*/, '').startsWith(target));

  if (nonEmpty.length === 0) {
    return lines.map((line, index) => (index === 0 ? `${line}${target}` : line));
  }

  return lines.map((line) => {
    if (!line.trim()) return line;
    const indent = line.match(/^\s*/)?.[0] ?? '';
    const content = line.slice(indent.length).replace(/^#{1,6}\s+/, '');
    return allTarget ? `${indent}${content}` : `${indent}${target}${content}`;
  });
}

export function transformLinePrefix(lines: string[], kind: LinePrefixKind): string[] {
  const config = {
    quote: {
      detect: /^\s*>\s?/,
      remove: /^(\s*)>\s?/,
      make: (indent: string) => `${indent}> `,
    },
    ul: {
      detect: /^\s*(?:[-*+]|\d+\.)\s+/,
      remove: /^(\s*)(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?/,
      make: (indent: string) => `${indent}- `,
    },
    ol: {
      detect: /^\s*\d+\.\s+/,
      remove: /^(\s*)(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?/,
      make: (indent: string, index: number) => `${indent}${index + 1}. `,
    },
    task: {
      detect: /^\s*[-*+]\s+\[[ xX]\]\s+/,
      remove: /^(\s*)(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?/,
      make: (indent: string) => `${indent}- [ ] `,
    },
  }[kind];

  const nonEmpty = lines.filter((line) => line.trim());
  const allHavePrefix =
    nonEmpty.length > 0 && nonEmpty.every((line) => config.detect.test(line));

  if (nonEmpty.length === 0) {
    return lines.map((line, index) => (index === 0 ? `${line}${config.make('', 0)}` : line));
  }

  let counter = 0;
  return lines.map((line) => {
    if (!line.trim()) return line;
    if (allHavePrefix) return line.replace(config.remove, '$1');
    const withoutMarker = line.replace(config.remove, '$1');
    const indent = withoutMarker.match(/^\s*/)?.[0] ?? '';
    const content = withoutMarker.slice(indent.length);
    const prefix = config.make(indent, counter);
    counter += 1;
    return `${prefix}${content}`;
  });
}

function selectedLineBlock(view: EditorView): {
  from: number;
  to: number;
  hasSelection: boolean;
  anchor: number;
  head: number;
} {
  const selection = view.state.selection.main;
  const from = Math.min(selection.from, selection.to);
  const to = Math.max(selection.from, selection.to);
  const startLine = view.state.doc.lineAt(from);
  const endLine = view.state.doc.lineAt(to > from ? to - 1 : to);
  return {
    from: startLine.from,
    to: endLine.to,
    hasSelection: to > from,
    anchor: selection.anchor,
    head: selection.head,
  };
}

function replaceLineBlock(view: EditorView, transform: (lines: string[]) => string[]): void {
  const block = selectedLineBlock(view);
  const lines = view.state.sliceDoc(block.from, block.to).split('\n');
  const transformed = transform(lines).join('\n');
  if (transformed === lines.join('\n')) {
    view.focus();
    return;
  }

  const selection = block.hasSelection
    ? EditorSelection.range(block.from, block.from + transformed.length)
    : EditorSelection.cursor(block.from + transformed.length);

  view.dispatch({
    changes: { from: block.from, to: block.to, insert: transformed },
    selection,
    scrollIntoView: true,
  });
  view.focus();
}

export function applyHeading(view: EditorView, level: number): void {
  replaceLineBlock(view, (lines) => transformHeadingLines(lines, level));
}

export function applyLinePrefix(view: EditorView, kind: LinePrefixKind): void {
  replaceLineBlock(view, (lines) => transformLinePrefix(lines, kind));
}

export function toggleInline(
  view: EditorView,
  before: string,
  after: string,
  placeholder: string,
): void {
  const selection = view.state.selection.main;
  const from = Math.min(selection.from, selection.to);
  const to = Math.max(selection.from, selection.to);
  const selected = view.state.sliceDoc(from, to);

  const surrounds =
    from >= before.length &&
    view.state.sliceDoc(from - before.length, from) === before &&
    view.state.sliceDoc(to, to + after.length) === after;

  if (surrounds) {
    view.dispatch({
      changes: { from: from - before.length, to: to + after.length, insert: selected },
      selection: EditorSelection.range(from - before.length, to - before.length),
      scrollIntoView: true,
    });
    view.focus();
    return;
  }

  if (selected.startsWith(before) && selected.endsWith(after) && selected.length >= before.length + after.length) {
    const inner = selected.slice(before.length, selected.length - after.length);
    view.dispatch({
      changes: { from, to, insert: inner },
      selection: EditorSelection.range(from, from + inner.length),
      scrollIntoView: true,
    });
    view.focus();
    return;
  }

  const content = selected || placeholder;
  const insert = `${before}${content}${after}`;
  view.dispatch({
    changes: { from, to, insert },
    selection: EditorSelection.range(from + before.length, from + before.length + content.length),
    scrollIntoView: true,
  });
  view.focus();
}

export function insertLink(view: EditorView): void {
  const selection = view.state.selection.main;
  const from = Math.min(selection.from, selection.to);
  const to = Math.max(selection.from, selection.to);
  const selected = view.state.sliceDoc(from, to);
  const label = selected || 'Link text';
  const url = 'https://';
  const insert = `[${label}](${url})`;
  const urlStart = from + 1 + label.length + 2;
  view.dispatch({
    changes: { from, to, insert },
    selection: EditorSelection.range(urlStart, urlStart + url.length),
    scrollIntoView: true,
  });
  view.focus();
}

export function insertImagePlaceholder(view: EditorView): void {
  const selection = view.state.selection.main;
  const from = Math.min(selection.from, selection.to);
  const to = Math.max(selection.from, selection.to);
  const selected = view.state.sliceDoc(from, to);
  const alt = selected || 'Image description';
  const src = 'Image URL';
  const insert = `![${alt}](${src})`;
  const srcStart = from + 2 + alt.length + 2;
  view.dispatch({
    changes: { from, to, insert },
    selection: EditorSelection.range(srcStart, srcStart + src.length),
    scrollIntoView: true,
  });
  view.focus();
}

export function insertCode(view: EditorView): void {
  const selection = view.state.selection.main;
  const selected = view.state.sliceDoc(selection.from, selection.to);
  if (!selected.includes('\n')) {
    toggleInline(view, '`', '`', 'code');
    return;
  }
  const insert = `\`\`\`\n${selected}\n\`\`\``;
  replaceSelectionWithBlock(view, insert, selected);
}

export function insertBlock(view: EditorView, block: string, selectText?: string): void {
  const selection = view.state.selection.main;
  const from = Math.min(selection.from, selection.to);
  const to = Math.max(selection.from, selection.to);
  const before = view.state.sliceDoc(0, from);
  const after = view.state.sliceDoc(to);
  const prefix = !before.trim() ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const suffix = !after.trim() ? '' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  const insert = `${prefix}${block}${suffix}`;
  let selectionStart = from + insert.length;
  let selectionEnd = selectionStart;
  if (selectText) {
    const offset = insert.indexOf(selectText);
    if (offset >= 0) {
      selectionStart = from + offset;
      selectionEnd = selectionStart + selectText.length;
    }
  }
  view.dispatch({
    changes: { from, to, insert },
    selection: EditorSelection.range(selectionStart, selectionEnd),
    scrollIntoView: true,
  });
  view.focus();
}

function replaceSelectionWithBlock(view: EditorView, block: string, original: string): void {
  const selection = view.state.selection.main;
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: block },
    selection: EditorSelection.range(
      selection.from + block.indexOf(original),
      selection.from + block.indexOf(original) + original.length,
    ),
    scrollIntoView: true,
  });
  view.focus();
}

export function insertTable(view: EditorView): void {
  insertBlock(
    view,
    '| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n| Content | Content | Content |',
    'Column 1',
  );
}

export function insertMath(view: EditorView): void {
  const selection = view.state.selection.main;
  const selected = view.state.sliceDoc(selection.from, selection.to);
  if (selected) {
    toggleInline(view, '$', '$', 'x^2');
    return;
  }
  insertBlock(view, '$$\n\\sum_{i=1}^{n} x_i\n$$', '\\sum_{i=1}^{n} x_i');
}

export function insertMermaid(view: EditorView): void {
  insertBlock(
    view,
    '```mermaid\nflowchart LR\n  A[Idea] --> B[Draft]\n```',
    'A[Idea] --> B[Draft]',
  );
}

export function insertHorizontalRule(view: EditorView): void {
  insertBlock(view, '---');
}

export function runFormatAction(view: EditorView, action: FormatAction): boolean {
  switch (action) {
    case 'h1':
      applyHeading(view, 1);
      return true;
    case 'h2':
      applyHeading(view, 2);
      return true;
    case 'h3':
      applyHeading(view, 3);
      return true;
    case 'bold':
      toggleInline(view, '**', '**', 'Bold text');
      return true;
    case 'italic':
      toggleInline(view, '*', '*', 'Italic text');
      return true;
    case 'strike':
      toggleInline(view, '~~', '~~', 'Strikethrough text');
      return true;
    case 'code':
      insertCode(view);
      return true;
    case 'link':
      insertLink(view);
      return true;
    case 'image':
      insertImagePlaceholder(view);
      return true;
    case 'quote':
      applyLinePrefix(view, 'quote');
      return true;
    case 'ul':
      applyLinePrefix(view, 'ul');
      return true;
    case 'ol':
      applyLinePrefix(view, 'ol');
      return true;
    case 'task':
      applyLinePrefix(view, 'task');
      return true;
    case 'table':
      insertTable(view);
      return true;
    case 'hr':
      insertHorizontalRule(view);
      return true;
    case 'math':
      insertMath(view);
      return true;
    case 'mermaid':
      insertMermaid(view);
      return true;
    default:
      return false;
  }
}

export function insertImageMarkdown(view: EditorView, markdown: string): void {
  const selection = view.state.selection.main;
  // Replace the selection so selected text does not linger in both the image alt text and the body.
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: markdown },
    selection: EditorSelection.cursor(selection.from + markdown.length),
    scrollIntoView: true,
  });
  view.focus();
}
