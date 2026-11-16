import { del, get, set } from 'idb-keyval';
import { isDocumentDirty } from '../../domain/document';
import type { DocumentOrigin, DocumentTab } from '../../types/document';

const META_KEY = 'mdstudio.session.v3';
const DOC_PREFIX = 'mdstudio.session.v3:doc:';
const LEGACY_V2_KEY = 'mdstudio.session.v2';
const LEGACY_V1_KEY = 'mdstudio.session.v1';
const FALLBACK_KEY = 'mdstudio.session.fallback.v2';
const BACKUP_KEY = 'mdstudio.session.backup.v1';

/** Rough 32 MB estimate, measured in UTF-16 characters; the real cap is the IndexedDB quota. */
export const SESSION_CHAR_LIMIT = 16 * 1024 * 1024;

export interface SessionPayload {
  version: 3;
  documents: DocumentTab[];
  activeDocumentId: string | null;
  updatedAt: number;
}

interface SessionMeta {
  version: 3;
  ids: string[];
  activeDocumentId: string | null;
  updatedAt: number;
}

export interface SessionBackup {
  version: 3;
  documents: DocumentTab[];
  activeDocumentId: string | null;
  updatedAt: number;
}

const VALID_ORIGINS: ReadonlySet<string> = new Set<DocumentOrigin>(['workspace', 'scratch', 'sample']);

function normalizeDocument(value: unknown): DocumentTab | null {
  if (!value || typeof value !== 'object') return null;
  const document = value as Partial<DocumentTab> & { dirty?: unknown };
  if (typeof document.id !== 'string' || typeof document.title !== 'string') return null;
  if (typeof document.content !== 'string') return null;
  if (document.path !== null && typeof document.path !== 'string') return null;
  if (typeof document.origin !== 'string' || !VALID_ORIGINS.has(document.origin)) return null;
  const savedContent =
    typeof document.savedContent === 'string' ? document.savedContent : document.content;
  return {
    id: document.id,
    title: document.title,
    path: document.path,
    origin: document.origin as DocumentOrigin,
    content: document.content,
    savedContent,
    lastModified: typeof document.lastModified === 'number' ? document.lastModified : null,
    createdAt: typeof document.createdAt === 'number' ? document.createdAt : Date.now(),
    cursorLine: Number.isFinite(document.cursorLine) ? (document.cursorLine as number) : 1,
    cursorColumn: Number.isFinite(document.cursorColumn) ? (document.cursorColumn as number) : 1,
  };
}

export function normalizeSessionDocuments(values: unknown): DocumentTab[] {
  if (!Array.isArray(values)) return [];
  return values
    .map(normalizeDocument)
    .filter((document): document is DocumentTab => document !== null);
}

export function parseSessionPayload(raw: string | null): SessionPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SessionPayload>;
    const documents = normalizeSessionDocuments(parsed.documents);
    if (!documents.length) return null;
    return {
      version: 3,
      documents,
      activeDocumentId:
        typeof parsed.activeDocumentId === 'string' ? parsed.activeDocumentId : null,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Determine which documents need writing: one whose object reference is unchanged
 * counts as unmodified, since the store updates immutably.
 */
export function changedDocuments(
  previous: readonly DocumentTab[],
  next: readonly DocumentTab[],
): { upserts: DocumentTab[]; removed: string[] } {
  const previousById = new Map(previous.map((document) => [document.id, document]));
  const nextIds = new Set(next.map((document) => document.id));
  const upserts = next.filter((document) => previousById.get(document.id) !== document);
  const removed = previous
    .filter((document) => !nextIds.has(document.id))
    .map((document) => document.id);
  return { upserts, removed };
}

function readJson<T>(key: string): T | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function readBackup(): SessionBackup | null {
  const value = readJson<SessionBackup>(BACKUP_KEY);
  return value && Array.isArray(value.documents) ? value : null;
}

async function loadLegacy(): Promise<SessionPayload | null> {
  for (const key of [LEGACY_V2_KEY, LEGACY_V1_KEY, FALLBACK_KEY]) {
    const payload = parseSessionPayload(
      typeof localStorage === 'undefined' ? null : localStorage.getItem(key),
    );
    if (payload) return payload;
  }
  return null;
}

async function loadFromIdb(): Promise<SessionPayload | null> {
  let meta: SessionMeta | null;
  try {
    meta = (await get<SessionMeta>(META_KEY)) ?? null;
  } catch {
    return null;
  }
  if (!meta || !Array.isArray(meta.ids)) return null;

  const documents = await Promise.all(
    meta.ids.map((id) => get<DocumentTab>(`${DOC_PREFIX}${id}`).catch(() => undefined)),
  );
  const normalized = normalizeSessionDocuments(documents.filter(Boolean));
  if (!normalized.length) return null;
  return {
    version: 3,
    documents: normalized,
    activeDocumentId: typeof meta.activeDocumentId === 'string' ? meta.activeDocumentId : null,
    updatedAt: typeof meta.updatedAt === 'number' ? meta.updatedAt : 0,
  };
}

/**
 * Read IndexedDB first; if the localStorage backup written before a crash is newer,
 * let its content replace the matching documents.
 */
export async function loadSession(): Promise<SessionPayload | null> {
  let stored = await loadFromIdb();
  if (!stored) stored = await loadLegacy();

  // A failed IndexedDB write may fall back to a single localStorage snapshot; keep the newer one.
  const fallback = parseSessionPayload(
    typeof localStorage === 'undefined' ? null : localStorage.getItem(FALLBACK_KEY),
  );
  if (fallback && (!stored || fallback.updatedAt > stored.updatedAt)) stored = fallback;

  const backup = readBackup();
  if (!backup) return stored;
  if (stored && backup.updatedAt <= stored.updatedAt) return stored;

  const backupDocuments = normalizeSessionDocuments(backup.documents);
  const byId = new Map(backupDocuments.map((document) => [document.id, document]));
  const merged: DocumentTab[] = (stored?.documents ?? []).map(
    (document) => byId.get(document.id) ?? document,
  );
  const known = new Set(merged.map((document) => document.id));
  for (const document of backupDocuments) {
    if (!known.has(document.id)) merged.push(document);
  }
  return {
    version: 3,
    documents: merged,
    activeDocumentId: backup.activeDocumentId ?? stored?.activeDocumentId ?? null,
    updatedAt: Math.max(backup.updatedAt, stored?.updatedAt ?? 0),
  };
}

export function serializedSize(payload: SessionPayload): number {
  try {
    return new TextEncoder().encode(JSON.stringify(payload)).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * Write only changed documents plus metadata; on failure, fall back to a single
 * localStorage snapshot.
 */
export async function saveSession(
  payload: SessionPayload,
  previousDocuments: readonly DocumentTab[] = [],
): Promise<'idb' | 'local'> {
  const { upserts, removed } = changedDocuments(previousDocuments, payload.documents);
  try {
    await Promise.all(upserts.map((document) => set(`${DOC_PREFIX}${document.id}`, document)));
    await Promise.all(removed.map((id) => del(`${DOC_PREFIX}${id}`)));
    const meta: SessionMeta = {
      version: 3,
      ids: payload.documents.map((document) => document.id),
      activeDocumentId: payload.activeDocumentId,
      updatedAt: payload.updatedAt,
    };
    await set(META_KEY, meta);
    return 'idb';
  } catch {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(payload));
    return 'local';
  }
}

/**
 * Fallback snapshot written synchronously on pagehide/beforeunload: unsaved content only,
 * so the size stays bounded.
 */
export function saveSessionBackupSync(
  documents: DocumentTab[],
  activeDocumentId: string | null,
): void {
  try {
    const dirtyDocuments = documents.filter(
      (document) => document.origin !== 'sample' && isDocumentDirty(document),
    );
    if (!dirtyDocuments.length) {
      localStorage.removeItem(BACKUP_KEY);
      return;
    }
    const backup: SessionBackup = {
      version: 3,
      documents: dirtyDocuments,
      activeDocumentId,
      updatedAt: Date.now(),
    };
    localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
  } catch {
    // A failed backup should not block exit.
  }
}
