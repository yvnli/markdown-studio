import { useEffect, useRef } from 'react';
import { IS_MAC } from '../utils/platform';

interface HotkeyHandlers {
  onSave: () => void;
  onOpenFolder: () => void;
  onNewDocument: () => void;
  onNewFile: () => void;
  onFind: () => void;
  onReplace: () => void;
  onGlobalSearch: () => void;
  onSettings: () => void;
}

export function useGlobalHotkeys(handlers: HotkeyHandlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier) return;
      const key = event.key.toLowerCase();
      const code = event.code;

      if (key === 's') {
        event.preventDefault();
        handlersRef.current.onSave();
        return;
      }
      if (key === 'o') {
        event.preventDefault();
        handlersRef.current.onOpenFolder();
        return;
      }
      if (key === 'n' && event.shiftKey) {
        event.preventDefault();
        handlersRef.current.onNewFile();
        return;
      }
      if (key === 'n') {
        event.preventDefault();
        handlersRef.current.onNewDocument();
        return;
      }
      if (code === 'KeyF' && event.altKey) {
        event.preventDefault();
        handlersRef.current.onReplace();
        return;
      }
      if (key === 'h' && !IS_MAC) {
        event.preventDefault();
        handlersRef.current.onReplace();
        return;
      }
      if (key === 'f' && event.shiftKey) {
        event.preventDefault();
        handlersRef.current.onGlobalSearch();
        return;
      }
      if (key === 'f') {
        event.preventDefault();
        handlersRef.current.onFind();
        return;
      }
      if (key === ',') {
        event.preventDefault();
        handlersRef.current.onSettings();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
