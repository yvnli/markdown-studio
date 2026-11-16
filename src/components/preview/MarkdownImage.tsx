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
      <span className="markdown-image-loading" role="status" aria-label="Loading image">
        <Loader2 size={15} className="spin" aria-hidden="true" />
        <span>Reading image…</span>
      </span>
    );
  }

  if (!resolvedSrc || failed) {
    const localExpected = analysis.kind === 'local' ? analysis.resolvedPath : null;
    const failureHint = (() => {
      if (!src) return 'Image source is empty.';
      if (analysis.kind === 'external') {
        return 'Could not load the web image. Check that the link is directly accessible.';
      }
      if (analysis.kind === 'data') return 'Could not decode the embedded image. Paste the image again.';
      if (!workspaceService.isConnected) {
        return 'No local workspace is connected, so local images cannot be read. Open a folder to display them.';
      }
      if (analysis.file && analysis.isImageFormat) {
        return 'The file exists, but this browser cannot decode the image.';
      }
      if (!analysis.isImageFormat) {
        return `This path is not a previewable image format. Supported formats: ${SUPPORTED_IMAGE_FORMATS_LABEL}.`;
      }
      return 'Image not found in the workspace. Check the capitalization and relative folder.';
    })();
    const suggested = analysis.sameName;
    return (
      <span className="markdown-image-error" role="group" aria-label={alt || 'Image failed to load'}>
        <ImageOff size={18} aria-hidden="true" />
        <span className="markdown-image-error-copy">
          <strong>{alt || 'Image unavailable'}</strong>
          <span className="markdown-image-error-path">
            {localExpected ? `Resolved to ${localExpected}` : src || '(empty path)'}
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
              Open the matching image in the workspace: {suggested.path}
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
      aria-label={alt ? `View larger image: ${alt}` : 'View larger image'}
      title={title || 'View larger image'}
      onClick={(event) => {
        // The image may be wrapped in a link: open the viewer first so the link is not followed.
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
                ? 'Embedded Data URL image'
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
