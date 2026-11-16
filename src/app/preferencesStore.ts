import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { PREVIEW_ZOOM_DEFAULT, normalizePreviewZoom } from '../domain/zoom';
import type { Appearance, ViewMode } from '../types/document';

interface PreferencesState {
  appearance: Appearance;
  viewMode: ViewMode;
  sidebarOpen: boolean;
  syncScroll: boolean;
  fontSize: number;
  /** Markdown preview zoom factor; 1 = 100%. */
  previewZoom: number;
  imageDirectory: string;
  setAppearance: (appearance: Appearance) => void;
  setViewMode: (viewMode: ViewMode) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setSyncScroll: (sync: boolean) => void;
  setFontSize: (size: number) => void;
  setPreviewZoom: (zoom: number) => void;
  setImageDirectory: (directory: string) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      appearance: 'system',
      viewMode: 'split',
      sidebarOpen: typeof window === 'undefined' ? true : window.innerWidth >= 900,
      syncScroll: true,
      fontSize: 14,
      previewZoom: PREVIEW_ZOOM_DEFAULT,
      imageDirectory: 'assets',
      setAppearance: (appearance) => set({ appearance }),
      setViewMode: (viewMode) => set({ viewMode }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSyncScroll: (syncScroll) => set({ syncScroll }),
      setFontSize: (fontSize) => set({ fontSize }),
      setPreviewZoom: (previewZoom) => set({ previewZoom: normalizePreviewZoom(previewZoom) }),
      setImageDirectory: (imageDirectory) => set({ imageDirectory }),
    }),
    {
      name: 'mdstudio.preferences.v1',
      version: 1,
    },
  ),
);
