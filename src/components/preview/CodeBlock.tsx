import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useUIStore } from '../../app/uiStore';
import { languageFromClassName, languageLabel } from '../../services/markdown/language';
import { MermaidDiagram } from './MermaidDiagram';

interface CodeBlockProps {
  code: string;
  className?: string;
  theme: 'light' | 'dark';
}

export function CodeBlock({ code, className, theme }: CodeBlockProps) {
  const language = languageFromClassName(className);
  const pushToast = useUIStore((state) => state.pushToast);
  const [copied, setCopied] = useState(false);
  const [highlighted, setHighlighted] = useState<string | null>(null);

  // highlight.js 体积较大，只在真正出现代码块时按需加载。
  useEffect(() => {
    if (!language || language === 'mermaid') {
      setHighlighted(null);
      return;
    }
    let cancelled = false;
    void import('highlight.js/lib/common')
      .then(({ default: hljs }) => {
        if (cancelled) return;
        if (!hljs.getLanguage(language)) {
          setHighlighted(null);
          return;
        }
        try {
          setHighlighted(hljs.highlight(code, { language, ignoreIllegals: true }).value);
        } catch {
          setHighlighted(null);
        }
      })
      .catch(() => {
        if (!cancelled) setHighlighted(null);
      });
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  if (language === 'mermaid') {
    return <MermaidDiagram chart={code} theme={theme} />;
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      pushToast({ title: '代码已复制', tone: 'success', durationMs: 1600 });
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      pushToast({ title: '复制失败，请手动选择代码', tone: 'error' });
    }
  };

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span className="code-language">{languageLabel(language)}</span>
        <button className="copy-code" type="button" onClick={() => void copy()} aria-label="复制代码">
          {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
          <span>{copied ? '已复制' : '复制'}</span>
        </button>
      </div>
      <pre>
        {highlighted ? (
          <code
            className={`hljs ${className ?? ''}`}
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        ) : (
          <code className={className}>{code}</code>
        )}
      </pre>
    </div>
  );
}
