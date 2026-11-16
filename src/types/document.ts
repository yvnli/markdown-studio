export type ViewMode = 'write' | 'split' | 'preview';
export type Appearance = 'system' | 'light' | 'dark';
export type DocumentOrigin = 'workspace' | 'scratch' | 'sample';

export interface DocumentTab {
  /** Stable identity that never changes after creation; path can change on rename or move. */
  id: string;
  title: string;
  path: string | null;
  origin: DocumentOrigin;
  content: string;
  /** Content from the last save; dirty is derived from content !== savedContent. */
  savedContent: string;
  lastModified: number | null;
  createdAt: number;
  cursorLine: number;
  cursorColumn: number;
}

export interface RevealTarget {
  line: number;
  column: number;
  length?: number;
}
