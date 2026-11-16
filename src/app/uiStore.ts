import { create } from 'zustand';
import type { DialogState, ToastMessage } from '../types/dialogs';
import type { RevealTarget } from '../types/document';
import { createId } from '../utils/id';

type SidebarTab = 'files' | 'search';

export interface RevealRequest extends Required<RevealTarget> {
  id: string;
  path: string;
}

export interface ImagePreviewRequest {
  id: string;
  /** Markdown 中的原始 src，或文件树里的工作区路径。 */
  src: string;
  /** 相对路径的解析基准；工作区文件为 null。 */
  documentPath: string | null;
  title?: string;
  pathLabel?: string;
}

export interface ImageInsertRequest {
  id: string;
  initialAlt: string;
}

interface UIState {
  dialog: DialogState | null;
  toasts: ToastMessage[];
  sidebarTab: SidebarTab;
  mobileSidebarOpen: boolean;
  outlineOpen: boolean;
  imagePreview: ImagePreviewRequest | null;
  imageInsert: ImageInsertRequest | null;
  findOpen: boolean;
  findReplace: boolean;
  findRequestId: number;
  findQuery: string;
  findReplacement: string;
  findCaseSensitive: boolean;
  findWholeWord: boolean;
  findUseRegex: boolean;
  findSeed: boolean;
  revealRequest: RevealRequest | null;
  openDialog: (dialog: DialogState) => void;
  closeDialog: () => void;
  pushToast: (toast: Omit<ToastMessage, 'id'> & { durationMs?: number }) => void;
  dismissToast: (id: string) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  setOutlineOpen: (open: boolean) => void;
  openImagePreview: (request: Omit<ImagePreviewRequest, 'id'>) => void;
  closeImagePreview: () => void;
  openImageInsert: (initialAlt?: string) => void;
  closeImageInsert: () => void;
  openFind: (options?: { replace?: boolean; seed?: boolean }) => void;
  closeFind: () => void;
  setFindReplace: (replace: boolean) => void;
  setFindQuery: (query: string) => void;
  setFindReplacement: (replacement: string) => void;
  setFindCaseSensitive: (value: boolean) => void;
  setFindWholeWord: (value: boolean) => void;
  setFindUseRegex: (value: boolean) => void;
  consumeFindSeed: () => void;
  revealInEditor: (path: string, target: RevealTarget) => void;
  consumeReveal: (id: string) => void;
}

const toastTimers = new Map<string, number>();

function clearToastTimer(id: string): void {
  const timer = toastTimers.get(id);
  if (timer !== undefined) {
    window.clearTimeout(timer);
    toastTimers.delete(id);
  }
}

export const useUIStore = create<UIState>((set) => ({
  dialog: null,
  toasts: [],
  sidebarTab: 'files',
  mobileSidebarOpen: false,
  outlineOpen: false,
  imagePreview: null,
  imageInsert: null,
  findOpen: false,
  findReplace: false,
  findRequestId: 0,
  findQuery: '',
  findReplacement: '',
  findCaseSensitive: false,
  findWholeWord: false,
  findUseRegex: false,
  findSeed: false,
  revealRequest: null,
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),
  pushToast: ({ title, description, tone = 'default', durationMs = 2800 }) => {
    const id = createId('toast');
    set((state) => {
      const toasts = [...state.toasts, { id, title, description, tone }];
      const removed = toasts.slice(0, Math.max(0, toasts.length - 4));
      for (const toast of removed) clearToastTimer(toast.id);
      return { toasts: toasts.slice(-4) };
    });
    const timer = window.setTimeout(() => {
      toastTimers.delete(id);
      set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
    }, durationMs);
    toastTimers.set(id, timer);
  },
  dismissToast: (id) => {
    clearToastTimer(id);
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
  },
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
  setMobileSidebarOpen: (mobileSidebarOpen) => set({ mobileSidebarOpen }),
  setOutlineOpen: (outlineOpen) => set({ outlineOpen }),
  openImagePreview: (request) =>
    set({ imagePreview: { ...request, id: createId('image') } }),
  closeImagePreview: () => set({ imagePreview: null }),
  openImageInsert: (initialAlt = '') =>
    set({ imageInsert: { id: createId('image-insert'), initialAlt } }),
  closeImageInsert: () => set({ imageInsert: null }),
  openFind: (options) =>
    set((state) => ({
      findOpen: true,
      findReplace: options?.replace ?? false,
      findRequestId: state.findRequestId + 1,
      findSeed: options?.seed ?? true,
    })),
  closeFind: () => set({ findOpen: false, findSeed: false }),
  setFindReplace: (findReplace) => set({ findReplace }),
  setFindQuery: (findQuery) => set({ findQuery }),
  setFindReplacement: (findReplacement) => set({ findReplacement }),
  setFindCaseSensitive: (findCaseSensitive) => set({ findCaseSensitive }),
  setFindWholeWord: (findWholeWord) => set({ findWholeWord }),
  setFindUseRegex: (findUseRegex) => set({ findUseRegex }),
  consumeFindSeed: () => set({ findSeed: false }),
  revealInEditor: (path, target) =>
    set({
      revealRequest: {
        id: createId('reveal'),
        path,
        line: target.line,
        column: target.column,
        length: target.length ?? 0,
      },
    }),
  consumeReveal: (id) =>
    set((state) => (state.revealRequest?.id === id ? { revealRequest: null } : state)),
}));
