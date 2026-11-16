import { useEffect, useMemo, useState } from 'react';
import { ImageOff, Loader2 } from 'lucide-react';
import { useUIStore } from '../../app/uiStore';
import { useWorkspaceStore } from '../../app/workspaceStore';
import {
  analyzeImagePath,
  isRemoteImageSource,
  SUPPORTED_IMAGE_FORMATS_LABEL,
} from '../../domain/imagePath';
import { workspaceService } from '../../services/file-system';

interface MarkdownImageProps {
  src?: string;
  alt?: string;
  title?: string;
  documentPath: string | null;
}

export function MarkdownImage({ src, alt = '', title, documentPath }: MarkdownImageProps) {
  const requestKey = `${documentPath ?? ''}\u0000${src ?? ''}`;
  const directSrc = src && isRemoteImageSource(src) ? src : '';
  const [localAsset, setLocalAsset] = useState<{ key: string; url: string } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const openImagePreview = useUIStore((state) => state.openImagePreview);
  const imageFiles = useWorkspaceStore((state) => state.treeIndex.imageFiles);

  const analysis = useMemo(
    () =>
      analyzeImagePath(src ?? '', documentPath, imageFiles, {
        connected: workspaceService.isConnected,
      }),
    [documentPath, imageFiles, src],
  );

  useEffect(() => {
    if (!src || isRemoteImageSource(src)) return;
    let cancelled = false;
    void workspaceService
      .resolveAssetObjectUrl(documentPath, src)
      .then((next) => {
        if (!cancelled) setLocalAsset({ key: requestKey, url: next });
      })
      .catch(() => {
        if (!cancelled) setLocalAsset({ key: requestKey, url: src });
      });
    return () => {
      cancelled = true;
    };
  }, [documentPath, requestKey, src]);

  const resolvedSrc =
    directSrc || (localAsset?.key === requestKey ? localAsset.url : '');
  const loading = Boolean(src) && !directSrc && localAsset?.key !== requestKey;
  const failed = failedKey === requestKey;

  if (loading) {
    return (
      <span className="markdown-image-loading" role="status" aria-label="正在加载图片">
        <Loader2 size={15} className="spin" aria-hidden="true" />
        <span>正在读取图片…</span>
      </span>
    );
  }

  if (!resolvedSrc || failed) {
    const localExpected = analysis.kind === 'local' ? analysis.resolvedPath : null;
    const failureHint = (() => {
      if (!src) return '图片地址为空。';
      if (analysis.kind === 'external') {
        return '网络图片加载失败，请检查链接是否可以直接访问。';
      }
      if (analysis.kind === 'data') return '内嵌图片数据无法解码，请重新粘贴图片。';
      if (!workspaceService.isConnected) {
        return '尚未连接本地工作区，无法读取本地图片。打开文件夹后可正常显示。';
      }
      if (analysis.file && analysis.isImageFormat) {
        return '文件存在，但当前浏览器无法解码这张图片。';
      }
      if (!analysis.isImageFormat) {
        return `该路径不是可预览的图片格式。支持 ${SUPPORTED_IMAGE_FORMATS_LABEL}。`;
      }
      return '工作区中找不到这张图片，请检查大小写与相对目录。';
    })();
    const suggested = analysis.sameName;
    return (
      <span className="markdown-image-error" role="group" aria-label={alt || '图片加载失败'}>
        <ImageOff size={18} aria-hidden="true" />
        <span className="markdown-image-error-copy">
          <strong>{alt || '图片无法加载'}</strong>
          <span className="markdown-image-error-path">
            {localExpected ? `解析为 ${localExpected}` : src || '（空路径）'}
          </span>
          <span className="markdown-image-error-hint">{failureHint}</span>
          {localExpected &&
          analysis.hint &&
          workspaceService.isConnected &&
          !analysis.file &&
          analysis.isImageFormat ? (
            <span className="markdown-image-error-hint">{analysis.hint}</span>
          ) : null}
          {suggested ? (
            <button
              type="button"
              className="markdown-image-error-action"
              onClick={() =>
                openImagePreview({
                  src: suggested.path,
                  documentPath: null,
                  title: suggested.name,
                  pathLabel: suggested.path,
                })
              }
            >
              打开工作区中的同名图片：{suggested.path}
            </button>
          ) : null}
        </span>
      </span>
    );
  }

  return (
    <button
      type="button"
      className="markdown-image-button"
      aria-label={alt ? `查看大图：${alt}` : '查看大图'}
      title={title || '查看大图'}
      onClick={(event) => {
        // 图片可能被包在链接里：优先打开查看器，避免同时触发链接跳转。
        event.preventDefault();
        event.stopPropagation();
        openImagePreview({
          src: src ?? '',
          documentPath,
          title: title || alt,
          pathLabel:
            analysis.kind === 'local'
              ? analysis.resolvedPath ?? src ?? ''
              : analysis.kind === 'data'
                ? '内嵌 Data URL 图片'
                : analysis.kind === 'external'
                  ? src ?? ''
                  : alt,
        });
      }}
    >
      <img
        src={resolvedSrc}
        alt={alt}
        title={title}
        loading="lazy"
        decoding="async"
        onError={() => setFailedKey(requestKey)}
      />
    </button>
  );
}
