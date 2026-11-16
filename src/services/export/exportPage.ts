import hljs from 'highlight.js/lib/common';
import type { ExportOptions } from '../../types/export';
import { languageFromClassName, languageLabel } from '../markdown/language';
import { renderMermaidSvg } from '../markdown/mermaidTheme';
import { markdownToHtml } from './markdownToHtml';
import { workspaceService } from '../file-system';

export const EXPORT_PAGE_CSS = `
.export-render-host {
  position: fixed;
  top: 0;
  left: -20000px;
  width: 794px;
  z-index: -10;
  pointer-events: none;
}
.export-page {
  box-sizing: border-box;
  width: 794px;
  padding: 56px 58px 64px;
  background: var(--surface);
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: 16px;
  line-height: 1.7;
}
.export-page .markdown-body {
  max-width: none;
}
.export-page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 34px;
  padding-bottom: 12px;
  border-bottom: 0.5px solid var(--line);
  color: var(--faint);
  font-family: var(--font-ui);
  font-size: 10px;
  letter-spacing: 0.02em;
}
.export-brand {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--ink-soft);
  font-weight: 600;
}
.export-brand-cloud {
  display: inline-grid;
  width: 20px;
  height: 20px;
  place-items: center;
  border-radius: 5px;
  background: var(--ink-strong);
  font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif;
  font-size: 12px;
}
.export-toc {
  margin: 0 0 36px;
  padding: 15px 17px;
  border: 0.5px solid var(--line);
  border-radius: 9px;
  background: var(--surface-soft);
}
.export-toc-title {
  margin: 0 0 8px;
  color: var(--muted);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.05em;
}
.export-toc ol {
  margin: 0;
  padding-left: 18px;
}
.export-toc li {
  margin: 3px 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.5;
}
.export-toc a {
  color: var(--ink-soft);
  text-decoration: none;
}
.export-page-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-top: 54px;
  padding-top: 14px;
  border-top: 0.5px solid var(--line);
  color: var(--faint);
  font-family: var(--font-ui);
  font-size: 9.5px;
}
.export-page .code-block {
  box-shadow: none;
}
.export-page .mermaid-block {
  background: var(--surface);
}
.export-page img {
  max-width: 100%;
}
@media print {
  .export-render-host {
    position: static;
    left: 0;
  }
  .export-page {
    width: auto;
    padding: 0;
  }
}
`;

export interface ExportPageResult {
  host: HTMLDivElement;
  page: HTMLDivElement;
  cleanup: () => void;
}

export async function createExportPage(
  markdown: string,
  title: string,
  documentPath: string | null,
  options: ExportOptions,
): Promise<ExportPageResult> {
  ensureExportStyle();
  const contentHtml = await markdownToHtml(markdown);
  const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(new Date());
  const host = document.createElement('div');
  host.className = 'export-render-host';
  host.dataset.theme = options.theme;
  host.setAttribute('aria-hidden', 'true');

  const page = document.createElement('div');
  page.className = 'export-page';
  page.innerHTML = `
    ${options.includeHeader ? `
      <header class="export-page-header">
        <span class="export-brand"><span class="export-brand-cloud">☁️</span>Markdown studio</span>
        <span>${escapeHtml(date)}</span>
      </header>` : ''}
    <div class="export-toc-slot"></div>
    <article class="markdown-body">${contentHtml}</article>
    ${options.includeFooter ? `
      <footer class="export-page-footer">
        <span>Markdown studio · ${escapeHtml(title)}</span>
        <span>Local first · ${escapeHtml(date)}</span>
      </footer>` : ''}
  `;
  host.appendChild(page);
  document.body.appendChild(host);

  const article = page.querySelector<HTMLElement>('.markdown-body');
  if (article) {
    await inlineImages(article, documentPath);
    await renderMermaidBlocks(article, options.theme);
    decorateCodeBlocks(article);
    if (options.includeToc) insertToc(article);
  }

  await document.fonts.ready;
  return {
    host,
    page,
    cleanup: () => host.remove(),
  };
}

function ensureExportStyle(): void {
  if (document.getElementById('mdstudio-export-page-styles')) return;
  const style = document.createElement('style');
  style.id = 'mdstudio-export-page-styles';
  style.textContent = EXPORT_PAGE_CSS;
  document.head.appendChild(style);
}

async function inlineImages(article: HTMLElement, documentPath: string | null): Promise<void> {
  const images = Array.from(article.querySelectorAll<HTMLImageElement>('img'));
  await Promise.all(
    images.map(async (image) => {
      const src = image.getAttribute('src') ?? '';
      if (!src || /^(https?:|data:|blob:)/i.test(src)) return;
      const data = await workspaceService.assetDataUrl(documentPath, src);
      if (data) image.src = data;
    }),
  );
  await Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) resolve();
          else {
            image.addEventListener('load', () => resolve(), { once: true });
            image.addEventListener('error', () => resolve(), { once: true });
          }
        }),
    ),
  );
}

async function renderMermaidBlocks(article: HTMLElement, theme: 'light' | 'dark'): Promise<void> {
  const blocks = Array.from(article.querySelectorAll<HTMLPreElement>('pre'));
  for (const pre of blocks) {
    const code = pre.querySelector('code');
    if (!code) continue;
    const language = languageFromClassName(code.className);
    if (language !== 'mermaid') continue;
    const chart = code.textContent ?? '';
    const wrapper = document.createElement('div');
    wrapper.className = 'mermaid-block';
    try {
      wrapper.innerHTML = await renderMermaidSvg(
        chart,
        theme,
        `export-mermaid-${Math.random().toString(36).slice(2, 9)}`,
      );
    } catch (error) {
      wrapper.classList.add('mermaid-block-error');
      const title = document.createElement('div');
      title.className = 'mermaid-error-title';
      title.textContent = 'Diagram syntax needs attention';
      const message = document.createElement('pre');
      message.className = 'mermaid-error-message';
      message.textContent =
        error instanceof Error ? error.message : 'Mermaid syntax could not be parsed.';
      wrapper.append(title, message);
    }
    pre.replaceWith(wrapper);
  }
}

function decorateCodeBlocks(article: HTMLElement): void {
  const blocks = Array.from(article.querySelectorAll<HTMLPreElement>('pre'));
  for (const pre of blocks) {
    const code = pre.querySelector('code');
    if (!code) continue;
    const language = languageFromClassName(code.className);
    const raw = code.textContent ?? '';
    if (language && hljs.getLanguage(language)) {
      try {
        code.innerHTML = hljs.highlight(raw, { language, ignoreIllegals: true }).value;
        code.classList.add('hljs');
      } catch {
        // Keep the plain source.
      }
    }
    const wrapper = document.createElement('div');
    wrapper.className = 'code-block';
    const header = document.createElement('div');
    header.className = 'code-block-header';
    const label = document.createElement('span');
    label.className = 'code-language';
    label.textContent = languageLabel(language);
    header.appendChild(label);
    pre.parentNode?.insertBefore(wrapper, pre);
    wrapper.append(header, pre);
  }
}

function insertToc(article: HTMLElement): void {
  const headings = Array.from(article.querySelectorAll<HTMLElement>('h1, h2, h3')).filter(
    (heading) => heading.id,
  );
  if (!headings.length) return;
  const slot = article.parentElement?.querySelector<HTMLElement>('.export-toc-slot');
  if (!slot) return;
  const nav = document.createElement('nav');
  nav.className = 'export-toc';
  const title = document.createElement('p');
  title.className = 'export-toc-title';
  title.textContent = 'Table of contents';
  const list = document.createElement('ol');
  for (const heading of headings) {
    const item = document.createElement('li');
    item.style.marginLeft = `${(Number(heading.tagName.slice(1)) - 1) * 12}px`;
    const link = document.createElement('a');
    link.href = `#${heading.id}`;
    link.textContent = heading.textContent?.trim() ?? '';
    item.appendChild(link);
    list.appendChild(item);
  }
  nav.append(title, list);
  slot.replaceWith(nav);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
