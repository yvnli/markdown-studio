import { useEffect, useId, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { renderMermaidSvg } from '../../services/markdown/mermaidTheme';

interface MermaidDiagramProps {
  chart: string;
  theme: 'light' | 'dark';
}

interface MermaidState {
  svg: string;
  error: string | null;
}

export function MermaidDiagram({ chart, theme }: MermaidDiagramProps) {
  const reactId = useId();
  const [state, setState] = useState<MermaidState>({ svg: '', error: null });

  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      try {
        const id = `mdstudio-mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}-${Math.random().toString(36).slice(2, 7)}`;
        const svg = await renderMermaidSvg(chart, theme, id);
        if (!cancelled) setState({ svg, error: null });
      } catch (error) {
        if (!cancelled) {
          setState({
            svg: '',
            error: error instanceof Error ? error.message : 'Could not parse the Mermaid syntax.',
          });
        }
      }
    };
    void render();
    return () => {
      cancelled = true;
    };
  }, [chart, reactId, theme]);

  if (state.error) {
    return (
      <div className="mermaid-block mermaid-block-error" role="alert">
        <div className="mermaid-error-title">
          <AlertCircle size={15} aria-hidden="true" />
          <span>Diagram syntax needs attention</span>
        </div>
        <pre className="mermaid-error-message">{state.error}</pre>
        <pre className="mermaid-error-source">
          <code>{chart}</code>
        </pre>
      </div>
    );
  }

  if (!state.svg) {
    return (
      <div className="mermaid-block mermaid-block-loading" aria-busy="true">
        <span className="mermaid-loading-dot" />
        Drawing diagram…
      </div>
    );
  }

  return (
    <div
      className="mermaid-block"
      role="img"
      aria-label="Mermaid diagram"
      dangerouslySetInnerHTML={{ __html: state.svg }}
    />
  );
}
