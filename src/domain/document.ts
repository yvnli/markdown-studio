import type { DocumentTab } from '../types/document';

type DocumentContent = Pick<DocumentTab, 'content' | 'savedContent'>;

/**
 * dirty 是派生状态：只由内容与最近一次落盘内容决定，避免在 store 中重复维护。
 */
export function isDocumentDirty(document: DocumentContent | null | undefined): boolean {
  if (!document) return false;
  return document.content !== document.savedContent;
}
