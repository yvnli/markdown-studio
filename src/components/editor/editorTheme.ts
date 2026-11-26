import { EditorView } from '@codemirror/view';

export const markdownEditorTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'transparent',
    color: 'var(--ink)',
    fontSize: 'var(--editor-font-size, 14px)',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.8',
    overflow: 'auto',
    padding: '26px clamp(22px, 4vw, 54px) 80px',
  },
  '.cm-content': {
    padding: '0',
    caretColor: 'var(--ink-strong)',
    maxWidth: '960px',
  },
  '.cm-line': {
    padding: '0 2px',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--ink-strong)',
    borderLeftWidth: '1.5px',
  },
  '.cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--selection) !important',
  },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
    backgroundColor: 'var(--selection) !important',
  },
  '.cm-activeLine': {
    backgroundColor: 'var(--active-line, rgba(0, 0, 0, 0.018))',
  },
  '.cm-placeholder': {
    color: 'var(--faint)',
    fontStyle: 'normal',
  },
  '.cm-tooltip': {
    border: '0.5px solid var(--line)',
    borderRadius: '8px',
    backgroundColor: 'var(--surface)',
    boxShadow: 'var(--shadow-md)',
    color: 'var(--ink)',
  },
  '.cm-panels': {
    backgroundColor: 'var(--surface)',
    color: 'var(--ink)',
  },
  '.cm-md-h1': {
    fontSize: '1.95em',
    fontWeight: '700',
    letterSpacing: '-0.035em',
    lineHeight: '1.28',
    padding: '0.26em 0 0.12em',
  },
  '.cm-md-h2': {
    fontSize: '1.55em',
    fontWeight: '650',
    letterSpacing: '-0.028em',
    lineHeight: '1.35',
    padding: '0.2em 0 0.08em',
  },
  '.cm-md-h3': {
    fontSize: '1.28em',
    fontWeight: '600',
    letterSpacing: '-0.02em',
    lineHeight: '1.45',
    padding: '0.14em 0 0.04em',
  },
  '.cm-md-h4': {
    fontSize: '1.12em',
    fontWeight: '600',
  },
  '.cm-md-h5': {
    fontSize: '1em',
    fontWeight: '600',
  },
  '.cm-md-h6': {
    fontSize: '0.92em',
    fontWeight: '600',
    color: 'var(--muted)',
  },
  '.cm-md-strong': {
    fontWeight: '650',
    color: 'var(--ink-strong)',
  },
  '.cm-md-em': {
    fontStyle: 'italic',
  },
  '.cm-md-strike': {
    textDecoration: 'line-through',
    color: 'var(--muted)',
  },
  '.cm-md-inline-code': {
    padding: '0.1em 0.32em',
    borderRadius: '4px',
    backgroundColor: 'var(--surface-soft)',
    color: 'var(--ink-strong)',
    fontSize: '0.92em',
  },
  '.cm-md-link': {
    color: 'var(--ink)',
    textDecoration: 'underline',
    textDecorationColor: 'var(--faint)',
    textUnderlineOffset: '3px',
  },
  '.cm-md-syntax': {
    color: 'var(--faint)',
    opacity: '0.72',
  },
  '.cm-md-list-mark': {
    color: 'var(--faint)',
  },
  '.cm-md-task-marker': {
    color: 'var(--muted)',
    fontSize: '0.9em',
  },
  '.cm-md-blockquote': {
    borderLeft: '2px solid var(--line-strong)',
    backgroundColor: 'var(--surface-soft)',
    paddingLeft: '16px',
    color: 'var(--ink-soft)',
  },
  '.cm-md-fenced-code': {
    backgroundColor: 'var(--code-bg)',
    color: 'var(--code-ink)',
    fontFamily: 'var(--font-mono)',
  },
  // CodeMirror paints its selection layer below the content, so the opaque fenced-code
  // background hides it; selections inside code blocks are drawn as mark decorations.
  '.cm-md-code-selection': {
    backgroundColor: 'var(--code-selection)',
  },
  '.cm-md-table-source': {
    color: 'var(--ink-soft)',
  },
});
