import {
  Children,
  isValidElement,
  memo,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import 'katex/dist/katex.min.css';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeSlug from 'rehype-slug';
import { CloudSun } from 'lucide-react';
import { sanitizePreviewUrl } from '../../domain/imagePath';
import { katexOptions } from '../../services/markdown/katexOptions';
import type { OutlineItem } from '../../services/markdown/slug';
import { collectOutline } from '../../services/markdown/slugFromDom';
import {
  getDirName,
  isImageFile,
  isMarkdownFile,
  resolvePathFrom,
  safeDecodePath,
} from '../../utils/paths';
import { CodeBlock } from './CodeBlock';
import { MarkdownImage } from './MarkdownImage';

interface MarkdownPreviewProps {
  markdown: string;
  documentPath: string | null;
  theme: 'light' | 'dark';
  scrollRef: RefObject<HTMLDivElement | null>;
  onOutlineChange: (items: OutlineItem[]) => void;
  onOpenPath?: (path: string) => void;
  onScroll?: (event: React.UIEvent<HTMLDivElement>) => void;
  /** 图片查看器覆盖预览区时，隐藏 Markdown 内容的交互与辅助技术可见性。 */
  inactive?: boolean;
}

function extractText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return extractText(node.props.children);
  return '';
}

function resolveInternalPath(documentPath: string | null, href: string): string {
  const decoded = safeDecodePath(href.split('#')[0] ?? '');
  return resolvePathFrom(getDirName(documentPath ?? ''), decoded);
}

function MarkdownPreviewComponent({
  markdown,
  documentPath,
  theme,
  scrollRef,
  onOutlineChange,
  onOpenPath,
  onScroll,
  inactive = false,
}: MarkdownPreviewProps) {
  const articleRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    onOutlineChange(collectOutline(article));
  }, [markdown, onOutlineChange]);

  const components = useMemo<Components>(() => {
    const handleInternalLink = (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
      event.preventDefault();
      const [rawPath, rawHash] = href.split('#');
      const path = resolveInternalPath(documentPath, rawPath);
      if (rawHash) {
        const target = articleRef.current?.querySelector<HTMLElement>(`#${CSS.escape(rawHash)}`);
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (isMarkdownFile(path) || isImageFile(path)) {
        onOpenPath?.(path);
      }
    };

    return {
      pre({ children }) {
        const child = Children.toArray(children).find(isValidElement);
        if (!child) return <pre>{children}</pre>;
        const props = child.props as { className?: string; children?: ReactNode };
        const code = extractText(props.children).replace(/\n$/, '');
        return <CodeBlock code={code} className={props.className} theme={theme} />;
      },
      code({ className, children, ...props }) {
        return (
          <code className={className} {...props}>
            {children}
          </code>
        );
      },
      a({ href, children, ...props }) {
        const target = href ?? '';
        const external = /^(https?:|mailto:|data:)/i.test(target);
        const hashOnly = target.startsWith('#');
        const localTarget =
          !external && !hashOnly ? resolveInternalPath(documentPath, target) : '';
        // 本地 Markdown 链接与图片链接都交给 openPath：图片会打开图片查看器。
        const internalFile =
          !external && !hashOnly && (isMarkdownFile(localTarget) || isImageFile(localTarget));
        return (
          <a
            {...props}
            href={target}
            target={external ? '_blank' : undefined}
            rel={external ? 'noopener noreferrer' : undefined}
            onClick={
              internalFile || hashOnly
                ? (event) => handleInternalLink(event, target)
                : undefined
            }
          >
            {children}
          </a>
        );
      },
      img({ src, alt, title }) {
        return (
          <MarkdownImage src={src} alt={alt} title={title} documentPath={documentPath} />
        );
      },
      table({ children }) {
        return (
          <div className="table-wrap">
            <table>{children}</table>
          </div>
        );
      },
      input({ type, ...props }) {
        if (type === 'checkbox') {
          return <input type="checkbox" {...props} disabled readOnly />;
        }
        return <input type={type} {...props} />;
      },
    };
  }, [documentPath, onOpenPath, theme]);

  if (!markdown.trim()) {
    return (
      <div
        className="preview-scroll preview-scroll-empty"
        ref={scrollRef}
        onScroll={onScroll}
        aria-hidden={inactive || undefined}
        inert={inactive || undefined}
      >
        <div className="preview-empty">
          <span className="preview-empty-icon" aria-hidden="true">
            <CloudSun size={26} strokeWidth={1.4} />
          </span>
          <strong>还没有落下第一笔</strong>
          <span>在左侧写下 Markdown，排版会在这里慢慢展开。</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="preview-scroll"
      ref={scrollRef}
      onScroll={onScroll}
      aria-hidden={inactive || undefined}
      inert={inactive || undefined}
    >
      <article className="markdown-body" ref={articleRef}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeSlug, [rehypeKatex, katexOptions]]}
          components={components}
          urlTransform={sanitizePreviewUrl}
        >
          {markdown}
        </ReactMarkdown>
      </article>
    </div>
  );
}

export const MarkdownPreview = memo(MarkdownPreviewComponent);
