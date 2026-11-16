export type ViewMode = 'write' | 'split' | 'preview';
export type Appearance = 'system' | 'light' | 'dark';
export type DocumentOrigin = 'workspace' | 'scratch' | 'sample';

export interface DocumentTab {
  /** 稳定身份，创建后永不改变；path 可因重命名/移动而变化。 */
  id: string;
  title: string;
  path: string | null;
  origin: DocumentOrigin;
  content: string;
  /** 最近一次落盘内容；dirty 由 content !== savedContent 派生。 */
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
