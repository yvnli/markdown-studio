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

// Module-level cache: StrictMode runs effects twice, so both mounts share a single load.
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
  // Document references confirmed written to IndexedDB; keeps persistence scoped to changed documents.
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
        // Possibly migrated from v2/v1: clear the baseline; the first save writes the new per-document format.
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
          title: 'Draft snapshot is too large',
          description: 'Save to a local file soon. The browser keeps only the most recent drafts.',
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
        // Record only the references actually written this time, so edits made during the write aren't marked as persisted.
        if (seq === persistSeqRef.current) persistedRef.current = currentDocuments;
      })
      .catch(() => {
        if (!quotaWarnedRef.current) {
          quotaWarnedRef.current = true;
          pushToast({
            title: 'Browser storage is full',
            description: 'Save important documents to a local file.',
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
      // The synchronous fallback writes only unsaved content, so a crash loses at most 650 ms of edits.
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
