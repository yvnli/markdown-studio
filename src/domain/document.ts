import type { DocumentTab } from '../types/document';

type DocumentContent = Pick<DocumentTab, 'content' | 'savedContent'>;

/**
 * dirty is derived state: it depends only on the content and the last saved content, so the store doesn't need to track it separately.
 */
export function isDocumentDirty(document: DocumentContent | null | undefined): boolean {
  if (!document) return false;
  return document.content !== document.savedContent;
}
