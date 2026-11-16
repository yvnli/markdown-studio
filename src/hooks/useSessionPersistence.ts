import { useCallback, useEffect, useRef, useState } from 'react';
import { useUIStore } from '../app/uiStore';
import { useWorkspaceStore } from '../app/workspaceStore';
import {
  SESSION_CHAR_LIMIT,
  loadSession,
  saveSession,
  saveSessionBackupSync,
  type SessionPayload,
} from '../services/session/sessionStore';

const SAVE_DELAY_MS = 650;

// 模块级缓存：StrictMode 会重复执行 effect，确保两次挂载共享同一次读取。
let sessionLoad: Promise<Awaited<ReturnType<typeof loadSession>>> | null = null;

function loadSessionOnce() {
  sessionLoad ??= loadSession().catch(() => null);
  return sessionLoad;
}

export function useSessionPersistence(): boolean {
  const [hydrated, setHydrated] = useState(false);
  const documents = useWorkspaceStore((state) => state.documents);
  const activeDocumentId = useWorkspaceStore((state) => state.activeDocumentId);
  const pushToast = useUIStore((state) => state.pushToast);
  const latestRef = useRef({ documents, activeDocumentId });
  const timerRef = useRef<number | null>(null);
  const quotaWarnedRef = useRef(false);
  const hydratedRef = useRef(false);
  // 已确认写入 IndexedDB 的文档引用；用于把持久化粒度缩小到“变化的文档”。
  const persistedRef = useRef<typeof documents>([]);
  const persistSeqRef = useRef(0);
  latestRef.current = { documents, activeDocumentId };

  useEffect(() => {
    let cancelled = false;
    void loadSessionOnce()
      .then((session) => {
        if (cancelled || !session) return;
        useWorkspaceStore
          .getState()
          .hydrateDocuments(session.documents, session.activeDocumentId);
        // 可能是从 v2/v1 迁移而来：清空基准，首次保存会写入按文档记录的新格式。
        persistedRef.current = [];
      })
      .finally(() => {
        if (cancelled) return;
        hydratedRef.current = true;
        setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(() => {
    if (!hydratedRef.current) return;
    const { documents: currentDocuments, activeDocumentId: currentActive } = latestRef.current;
    const payload: SessionPayload = {
      version: 3,
      documents: currentDocuments,
      activeDocumentId: currentActive,
      updatedAt: Date.now(),
    };
    const totalChars = currentDocuments.reduce(
      (total, document) => total + document.content.length,
      0,
    );
    if (totalChars > SESSION_CHAR_LIMIT) {
      if (!quotaWarnedRef.current) {
        quotaWarnedRef.current = true;
        pushToast({
          title: '草稿快照过大',
          description: '请及时保存到本地文件，浏览器只保留最近的一部分草稿。',
          tone: 'error',
          durationMs: 4200,
        });
      }
      return;
    }
    const seq = persistSeqRef.current + 1;
    persistSeqRef.current = seq;
    void saveSession(payload, persistedRef.current)
      .then(() => {
        // 只记录本次真正写入的那批引用，避免把写入期间的编辑误标为已持久化。
        if (seq === persistSeqRef.current) persistedRef.current = currentDocuments;
      })
      .catch(() => {
        if (!quotaWarnedRef.current) {
          quotaWarnedRef.current = true;
          pushToast({
            title: '浏览器存储空间不足',
            description: '请将重要文档保存到本地文件。',
            tone: 'error',
            durationMs: 4200,
          });
        }
      });
  }, [pushToast]);

  useEffect(() => {
    if (!hydrated) return;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      persist();
    }, SAVE_DELAY_MS);
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [activeDocumentId, documents, hydrated, persist]);

  useEffect(() => {
    const flush = () => {
      const { documents: currentDocuments, activeDocumentId: currentActive } = latestRef.current;
      // 同步兜底只写未保存内容，保证崩溃/强退时最多丢失 650ms 内的修改。
      saveSessionBackupSync(currentDocuments, currentActive);
      persist();
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, [persist]);

  return hydrated;
}
