import { describe, expect, it } from 'vitest';
import type { DocumentTab } from '../../types/document';
import {
  changedDocuments,
  normalizeSessionDocuments,
  parseSessionPayload,
  serializedSize,
  type SessionPayload,
} from './sessionStore';

function document(overrides: Record<string, unknown> = {}): DocumentTab {
  return {
    id: 'doc-1',
    title: 'Note',
    path: null,
    origin: 'scratch',
    content: '# Heading',
    savedContent: '# Heading',
    lastModified: null,
    createdAt: 1,
    cursorLine: 1,
    cursorColumn: 1,
    ...overrides,
  } as DocumentTab;
}

describe('session payload', () => {
  it('drops the legacy dirty field and keeps derived state correct', () => {
    const [normalized] = normalizeSessionDocuments([
      document({ dirty: true, content: '# Heading', savedContent: '# Old heading' }),
    ]);
    expect(normalized).toBeDefined();
    expect(normalized).not.toHaveProperty('dirty');
    expect(normalized.content).not.toBe(normalized.savedContent);
  });

  it('rejects malformed documents and defaults missing savedContent', () => {
    const documents = normalizeSessionDocuments([
      document({ id: 42 }),
      document({ origin: 'cloud' }),
      document({ savedContent: undefined }),
    ]);
    expect(documents).toHaveLength(1);
    expect(documents[0].savedContent).toBe(documents[0].content);
  });

  it('parses legacy v1 localStorage payloads', () => {
    const payload = parseSessionPayload(
      JSON.stringify({
        version: 1,
        documents: [document({ dirty: false })],
        activeDocumentId: 'doc-1',
        updatedAt: 10,
      }),
    );
    expect(payload?.version).toBe(3);
    expect(payload?.documents).toHaveLength(1);
    expect(payload?.activeDocumentId).toBe('doc-1');
    expect(payload?.updatedAt).toBe(10);
  });

  it('returns null for empty or corrupted payloads', () => {
    expect(parseSessionPayload(null)).toBeNull();
    expect(parseSessionPayload('{')).toBeNull();
    expect(parseSessionPayload(JSON.stringify({ documents: [] }))).toBeNull();
  });

  it('measures UTF-8 bytes rather than string length', () => {
    const payload: SessionPayload = {
      version: 3,
      documents: [document({ content: '中'.repeat(4096) })],
      activeDocumentId: 'doc-1',
      updatedAt: 1,
    };
    expect(serializedSize(payload)).toBeGreaterThan(JSON.stringify(payload).length);
  });

  it('computes per-document writes by reference identity', () => {
    const first = document({ id: 'doc-a' });
    const second = document({ id: 'doc-b', title: 'Second' });
    const edited = { ...first, content: 'edited' };

    expect(changedDocuments([first, second], [first, second]).upserts).toHaveLength(0);
    expect(changedDocuments([first, second], [edited, second]).upserts).toEqual([edited]);
    expect(changedDocuments([first, second], [edited]).removed).toEqual(['doc-b']);
  });
});
