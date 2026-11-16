import { del, get, set } from 'idb-keyval';
import { isDocumentDirty } from '../../domain/document';
import type { DocumentOrigin, DocumentTab } from '../../types/document';

const META_KEY = 'mdstudio.session.v3';
const DOC_PREFIX = 'mdstudio.session.v3:doc:';
const LEGACY_V2_KEY = 'mdstudio.session.v2';
const LEGACY_V1_KEY = 'mdstudio.session.v1';
const FALLBACK_KEY = 'mdstudio.session.fallback.v2';
const BACKUP_KEY = 'mdstudio.session.backup.v1';

/** 32 MB 的估算上限（按 UTF-16 字符数粗估，真正写入由 IndexedDB 配额兜底）。 */
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
 * 计算需要写入的文档：对象引用未变化的文档视为未修改（store 采用不可变更新）。
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
 * 优先读取 IndexedDB；若崩溃前写入的 localStorage 备份更新，则以备份内容覆盖对应文档。
 */
export async function loadSession(): Promise<SessionPayload | null> {
  let stored = await loadFromIdb();
  if (!stored) stored = await loadLegacy();

  // IDB 写入失败时可能退回单条 localStorage 快照；选择更新时间较新的一份。
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
 * 只写入发生变化的文档 + 元数据；失败时退化为单条 localStorage 快照。
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
 * pagehide/beforeunload 时同步写入的兜底快照：只包含未保存内容，体积可控。
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
    // 备份失败不应阻塞退出。
  }
}
