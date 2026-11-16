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
            title: '已保存到磁盘',
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
                ? '工作区未连接，已下载副本'
                : 'Markdown 文件已下载',
            tone: 'success',
          });
        }
        return true;
      } catch (error) {
        pushToast({
          title: '保存失败',
          description: error instanceof Error ? error.message : '请检查文件权限。',
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
        pushToast({ title: '找不到目标文件', description: path, tone: 'error' });
        return false;
      }
      // 图片在预览区查看，而不是创建文本标签页；写作视图下先展开分屏，保证预览区可见。
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
          title: '无法打开文件',
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
            title: '图片已保存并插入',
            description: `${saved.assetPath} · 已写入 ${saved.relativePath}`,
            tone: 'success',
          });
          void refreshWorkspace({ silent: true });
          return `![粘贴的图片](${saved.relativePath})`;
        } catch (error) {
          pushToast({
            title: '图片保存失败',
            description: error instanceof Error ? error.message : undefined,
            tone: 'error',
            durationMs: 4200,
          });
          return null;
        }
      }

      if (file.size > 4 * 1024 * 1024) {
        pushToast({
          title: '图片太大',
          description: '未连接工作区时，内嵌图片上限为 4 MB。',
          tone: 'error',
        });
        return null;
      }
      const dataUrl = await readFileAsDataUrl(file);
      pushToast({
        title: '图片已内嵌为 Data URL',
        description: '打开本地文件夹后，粘贴图片会保存到 assets/。',
        tone: 'default',
        durationMs: 3600,
      });
      return `![粘贴的图片](${dataUrl})`;
    },
    [imageDirectory, pushToast, refreshWorkspace],
  );

  return useMemo(
    () => ({ saveDocument, openPath, pasteImage }),
    [openPath, pasteImage, saveDocument],
  );
}
