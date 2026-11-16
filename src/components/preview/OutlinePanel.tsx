import { useEffect } from 'react';
import { ListTree, X } from 'lucide-react';
import type { OutlineItem } from '../../services/markdown/slug';

interface OutlinePanelProps {
  open: boolean;
  items: OutlineItem[];
  onClose: () => void;
  onSelect: (id: string) => void;
}

export function OutlinePanel({ open, items, onClose, onSelect }: OutlinePanelProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="outline-panel" aria-label="文档大纲">
      <div className="outline-header">
        <span>
          <ListTree size={14} />
          文档大纲
        </span>
        <button type="button" className="icon-button icon-button-sm" onClick={onClose} aria-label="关闭大纲">
          <X size={13} />
        </button>
      </div>
      <nav className="outline-list">
        {items.length ? (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="outline-item"
              style={{ paddingLeft: `${10 + (item.level - 1) * 14}px` }}
              onClick={() => onSelect(item.id)}
            >
              {item.text}
            </button>
          ))
        ) : (
          <p className="outline-empty">文档中还没有标题</p>
        )}
      </nav>
    </div>
  );
}
