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

  // highlight.js is large, so load it on demand only when a code block appears.
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
      pushToast({ title: 'Code copied', tone: 'success', durationMs: 1600 });
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      pushToast({ title: 'Could not copy. Select the code manually.', tone: 'error' });
    }
  };

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span className="code-language">{languageLabel(language)}</span>
        <button className="copy-code" type="button" onClick={() => void copy()} aria-label="Copy code">
          {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
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
