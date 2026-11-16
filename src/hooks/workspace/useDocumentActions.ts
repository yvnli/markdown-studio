import { useCallback, useMemo } from 'react';
import { usePreferencesStore } from '../../app/preferencesStore';
import { useUIStore } from '../../app/uiStore';
import { useWorkspaceStore } from '../../app/workspaceStore';
import { workspaceService } from '../../services/file-system';
import { downloadText, safeFilename } from '../../utils/download';
import { isImageFile, normalizePath } from '../../utils/paths';
import { findFileNode } from '../../domain/treeIndex';
import { activeDocument, findDocument, readFileAsDataUrl } from './workspaceHelpers';

export interface DocumentActions {
  saveDocument: (documentId: string) => Promise<boolean>;
  openPath: (path: string) => Promise<boolean>;
  pasteImage: (file: File, documentId: string) => Promise<string | null>;
}

export function useDocumentActions(
  refreshWorkspace: (options?: { silent?: boolean }) => Promise<void>,
): DocumentActions {
  const pushToast = useUIStore((state) => state.pushToast);
  const openImagePreview = useUIStore((state) => state.openImagePreview);
  const imageDirectory = usePreferencesStore((state) => state.imageDirectory);

  const saveDocument = useCallback(
    async (documentId: string): Promise<boolean> => {
      const documentToSave = findDocument(documentId) ?? activeDocument();
      if (!documentToSave) return false;
      try {
        if (
          documentToSave.origin === 'workspace' &&
          documentToSave.path &&
          workspaceService.isConnected
        ) {
          const lastModified = await workspaceService.writeTextFile(
            documentToSave.path,
            documentToSave.content,
          );
          useWorkspaceStore.getState().markDocumentSaved(documentToSave.id, lastModified);
          pushToast({
            title: 'Saved to disk',
            description: documentToSave.path,
            tone: 'success',
            durationMs: 2200,
          });
          void refreshWorkspace({ silent: true });
        } else {
          downloadText(
            documentToSave.content,
            `${safeFilename(documentToSave.title)}.md`,
            'text/markdown;charset=utf-8',
          );
          useWorkspaceStore.getState().markDocumentSaved(documentToSave.id);
          pushToast({
            title:
              documentToSave.origin === 'workspace'
                ? 'Workspace not connected. A copy was downloaded.'
                : 'Markdown file downloaded',
            tone: 'success',
          });
        }
        return true;
      } catch (error) {
        pushToast({
          title: 'Save failed',
          description: error instanceof Error ? error.message : 'Check the file permissions.',
          tone: 'error',
          durationMs: 4200,
        });
        return false;
      }
    },
    [pushToast, refreshWorkspace],
  );

  const openPath = useCallback(
    async (path: string): Promise<boolean> => {
      const state = useWorkspaceStore.getState();
      const node = findFileNode(state.treeIndex, normalizePath(path));
      if (!node) {
        pushToast({ title: 'Target file not found', description: path, tone: 'error' });
        return false;
      }
      // Show images in the preview pane instead of opening a text tab. In Write view, expand to Split first so the preview stays visible.
      if (isImageFile(node.path)) {
        const preferences = usePreferencesStore.getState();
        if (preferences.viewMode === 'write') preferences.setViewMode('split');
        openImagePreview({
          src: node.path,
          documentPath: null,
          title: node.name,
          pathLabel: node.path,
        });
        return true;
      }
      try {
        await state.openNode(node);
        return true;
      } catch (error) {
        pushToast({
          title: 'Could not open file',
          description: error instanceof Error ? error.message : undefined,
          tone: 'error',
        });
        return false;
      }
    },
    [openImagePreview, pushToast],
  );

  const pasteImage = useCallback(
    async (file: File, documentId: string): Promise<string | null> => {
      const document = findDocument(documentId);
      if (!document) return null;
      if (workspaceService.isConnected) {
        try {
          const saved = await workspaceService.saveImage(
            file,
            document.path,
            imageDirectory,
            file.type,
          );
          pushToast({
            title: 'Image saved and inserted',
            description: `${saved.assetPath} · written to ${saved.relativePath}`,
            tone: 'success',
          });
          void refreshWorkspace({ silent: true });
          return `![Pasted image](${saved.relativePath})`;
        } catch (error) {
          pushToast({
            title: 'Could not save image',
            description: error instanceof Error ? error.message : undefined,
            tone: 'error',
            durationMs: 4200,
          });
          return null;
        }
      }

      if (file.size > 4 * 1024 * 1024) {
        pushToast({
          title: 'Image too large',
          description: 'Without a workspace, embedded images are limited to 4 MB.',
          tone: 'error',
        });
        return null;
      }
      const dataUrl = await readFileAsDataUrl(file);
      pushToast({
        title: 'Image embedded as a data URL',
        description: 'Open a local folder to save pasted images to assets/.',
        tone: 'default',
        durationMs: 3600,
      });
      return `![Pasted image](${dataUrl})`;
    },
    [imageDirectory, pushToast, refreshWorkspace],
  );

  return useMemo(
    () => ({ saveDocument, openPath, pasteImage }),
    [openPath, pasteImage, saveDocument],
  );
}
