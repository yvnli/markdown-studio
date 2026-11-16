export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function downloadText(text: string, filename: string, mimeType = 'text/plain;charset=utf-8'): void {
  downloadBlob(new Blob([text], { type: mimeType }), filename);
}

export function safeFilename(value: string, fallback = 'untitled'): string {
  return (
    value
      .trim()
      .replace(/\.(md|markdown|mdown|mkd|txt)$/i, '')
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\p{Cc}/gu, '-')
      .replace(/\s+/g, ' ')
      .replace(/^\.+/, '')
      .slice(0, 80)
      .trim() || fallback
  );
}
