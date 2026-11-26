import { syntaxTree } from '@codemirror/language';
import type { Range } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';

const hidden = Decoration.replace({});
const headingLineClasses = new Map([
  ['ATXHeading1', 'cm-md-h1'],
  ['ATXHeading2', 'cm-md-h2'],
  ['ATXHeading3', 'cm-md-h3'],
  ['ATXHeading4', 'cm-md-h4'],
  ['ATXHeading5', 'cm-md-h5'],
  ['ATXHeading6', 'cm-md-h6'],
  ['SetextHeading1', 'cm-md-h1'],
  ['SetextHeading2', 'cm-md-h2'],
]);

const emphasisClasses: Record<string, string> = {
  StrongEmphasis: 'cm-md-strong',
  Emphasis: 'cm-md-em',
  Strikethrough: 'cm-md-strike',
  InlineCode: 'cm-md-inline-code',
  Link: 'cm-md-link',
  Image: 'cm-md-image',
};

const markerClasses: Record<string, string> = {
  HeaderMark: 'cm-md-syntax',
  EmphasisMark: 'cm-md-syntax',
  StrikethroughMark: 'cm-md-syntax',
  CodeMark: 'cm-md-syntax',
  LinkMark: 'cm-md-syntax',
  QuoteMark: 'cm-md-syntax',
  ListMark: 'cm-md-list-mark',
  TaskMarker: 'cm-md-task-marker',
};

const hiddenMarkers = new Set([
  'HeaderMark',
  'EmphasisMark',
  'StrikethroughMark',
  'CodeMark',
  'QuoteMark',
]);

const collectActiveLines = (view: EditorView): Set<number> => {
  const lines = new Set<number>();
  for (const range of view.state.selection.ranges) {
    const from = view.state.doc.lineAt(range.from).number;
    const to = view.state.doc.lineAt(range.to).number;
    for (let line = from; line <= to; line += 1) lines.add(line);
  }
  return lines;
};

/**
 * Compute the text window whose decorations need rebuilding: the viewport plus the
 * lines containing the selection. Walking only this window keeps long documents from
 * rebuilding the whole syntax tree on every cursor move.
 */
function decorationWindow(view: EditorView): { from: number; to: number } | null {
  const state = view.state;
  let from = Number.POSITIVE_INFINITY;
  let to = Number.NEGATIVE_INFINITY;
  for (const visible of view.visibleRanges) {
    from = Math.min(from, visible.from);
    to = Math.max(to, visible.to);
  }
  for (const range of state.selection.ranges) {
    from = Math.min(from, state.doc.lineAt(range.from).from);
    to = Math.max(to, state.doc.lineAt(range.to).to);
  }
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null;
  return { from: state.doc.lineAt(from).from, to: state.doc.lineAt(to).to };
}

function buildDecorations(view: EditorView): DecorationSet {
  const state = view.state;
  const window = decorationWindow(view);
  if (!window) return Decoration.none;
  const activeLines = collectActiveLines(view);
  const ranges: Array<Range<Decoration>> = [];
  const lineClasses = new Map<number, Set<string>>();
  const hiddenRanges: Array<{ from: number; to: number }> = [];
  const markKeys = new Set<string>();
  const pushMark = (from: number, to: number, className: string) => {
    const key = `${from}:${to}:${className}`;
    if (markKeys.has(key)) return;
    markKeys.add(key);
    ranges.push(Decoration.mark({ class: className }).range(from, to));
  };

  const isActive = (from: number, to: number): boolean => {
    const start = state.doc.lineAt(from).number;
    const end = state.doc.lineAt(to).number;
    for (let line = start; line <= end; line += 1) {
      if (activeLines.has(line)) return true;
    }
    return false;
  };

  const addLineClass = (lineNumber: number, className: string) => {
    const existing = lineClasses.get(lineNumber) ?? new Set<string>();
    existing.add(className);
    lineClasses.set(lineNumber, existing);
  };

  const addLineClassRange = (from: number, to: number, className: string) => {
    let line = state.doc.lineAt(from);
    const lastLine = state.doc.lineAt(Math.max(from, to)).number;
    while (line.number <= lastLine) {
      addLineClass(line.number, className);
      if (line.number === state.doc.lines) break;
      line = state.doc.line(line.number + 1);
    }
  };

  syntaxTree(state).iterate({
    from: window.from,
    to: window.to,
    enter(node) {
      const name = node.name;
      const headingClass = headingLineClasses.get(name);
      if (headingClass) {
        addLineClassRange(node.from, node.to, headingClass);
      }

      if (name === 'Blockquote') {
        addLineClassRange(node.from, node.to, 'cm-md-blockquote');
      }

      if (name === 'FencedCode') {
        addLineClassRange(node.from, node.to, 'cm-md-fenced-code');
        // The native selection layer sits behind the opaque code background, so mark the
        // selected code directly to keep the highlight visible.
        for (const range of state.selection.ranges) {
          const from = Math.max(node.from, range.from);
          const to = Math.min(node.to, range.to);
          if (to > from) pushMark(from, to, 'cm-md-code-selection');
        }
      }

      if (name === 'Table') {
        addLineClassRange(node.from, node.to, 'cm-md-table-source');
      }

      const emphasisClass = emphasisClasses[name];
      if (emphasisClass) {
        pushMark(node.from, node.to, emphasisClass);
      }

      const markerClass = markerClasses[name];
      if (markerClass) {
        const active = isActive(node.from, node.to);
        const alwaysVisible = name === 'ListMark' || name === 'TaskMarker';
        if (active || alwaysVisible) {
          pushMark(node.from, node.to, markerClass);
        }
        if (!active && hiddenMarkers.has(name)) {
          let end = node.to;
          if (name === 'HeaderMark' || name === 'QuoteMark') {
            if (state.sliceDoc(end, end + 1) === ' ') end += 1;
          }
          hiddenRanges.push({ from: node.from, to: end });
        }
      }

      if (name === 'URL') {
        if (!isActive(node.from, node.to)) hiddenRanges.push({ from: node.from, to: node.to });
      }

      if (name === 'ListItem') {
        addLineClassRange(node.from, node.to, 'cm-md-list-item');
      }
    },
  });

  // Merge ranges so Decoration.replace never receives overlapping ranges.
  hiddenRanges.sort((a, b) => a.from - b.from || a.to - b.to);
  const merged: Array<{ from: number; to: number }> = [];
  for (const range of hiddenRanges) {
    if (!range.to || range.to <= range.from) continue;
    const last = merged.at(-1);
    if (last && range.from <= last.to) {
      last.to = Math.max(last.to, range.to);
    } else {
      merged.push({ ...range });
    }
  }
  for (const range of merged) {
    ranges.push(hidden.range(range.from, range.to));
  }

  for (const [lineNumber, classes] of lineClasses) {
    const line = state.doc.line(lineNumber);
    ranges.push(Decoration.line({ class: [...classes].join(' ') }).range(line.from));
  }

  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  return Decoration.set(ranges, true);
}

export const livePreviewExtension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  },
);
