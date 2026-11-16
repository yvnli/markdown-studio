import tokensCss from '../../styles/tokens.css?raw';
import previewCss from '../../styles/preview.css?raw';
import type { ExportOptions, ExportRequest, ExportResult } from '../../types/export';
import { safeFilename } from '../../utils/download';
import { createExportPage, EXPORT_PAGE_CSS, escapeHtml } from './exportPage';

const KATEX_CSS_URL = 'https://cdn.jsdelivr.net/npm/katex@0.19.1/dist/katex.min.css';

export async function exportDocument(request: ExportRequest): Promise<ExportResult> {
  const { format } = request.options;
  if (format === 'docx') {
    const { createDocxExport } = await import('./exportDocx');
    return createDocxExport(request);
  }
  if (format === 'html') return exportHtml(request);
  if (format === 'png') return exportPng(request);
  return exportPdf(request);
}

async function exportHtml(request: ExportRequest): Promise<ExportResult> {
  const { markdown, title, documentPath, options } = request;
  const page = await createExportPage(markdown, title, documentPath, options);
  try {
    const pageMarkup = page.page.outerHTML;
    const html = `<!doctype html>
<html lang="en" data-theme="${options.theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Markdown studio">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="${KATEX_CSS_URL}">
<style>
${tokensCss}
${previewCss}
${EXPORT_PAGE_CSS}
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; }
body {
  background: var(--bg);
  color: var(--ink);
  font-family: var(--font-ui);
}
html body .export-page {
  margin: 38px auto;
  border: 0.5px solid var(--line);
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.09);
  overflow: hidden;
}
@media (max-width: 840px) {
  html body .export-page {
    width: 100%;
    margin: 0;
    border: 0;
    border-radius: 0;
    padding: 36px 22px 48px;
  }
}
@media print {
  html body .export-page {
    width: auto;
    max-width: none;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }
}
</style>
</head>
<body>
${pageMarkup}
</body>
</html>`;
    return {
      blob: new Blob([html], { type: 'text/html;charset=utf-8' }),
      filename: `${safeFilename(title)}.html`,
      mimeType: 'text/html',
    };
  } finally {
    page.cleanup();
  }
}

async function capturePage(page: HTMLElement, options: ExportOptions): Promise<HTMLCanvasElement> {
  const html2canvas = (await import('html2canvas')).default;
  return html2canvas(page, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: options.theme === 'dark' ? '#1c1c1e' : '#ffffff',
    windowWidth: Math.max(794, page.scrollWidth),
    width: page.scrollWidth,
    height: page.scrollHeight,
    scrollX: 0,
    scrollY: 0,
  });
}

async function exportPng(request: ExportRequest): Promise<ExportResult> {
  const { markdown, title, documentPath, options } = request;
  const page = await createExportPage(markdown, title, documentPath, options);
  try {
    const canvas = await capturePage(page.page, options);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not generate the long image.');
    return {
      blob,
      filename: `${safeFilename(title)}.png`,
      mimeType: 'image/png',
    };
  } finally {
    page.cleanup();
  }
}

async function exportPdf(request: ExportRequest): Promise<ExportResult> {
  const { markdown, title, documentPath, options } = request;
  const page = await createExportPage(markdown, title, documentPath, options);
  try {
    const canvas = await capturePage(page.page, options);
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 36;
    const contentWidth = pageWidth - margin * 2;
    const contentHeight = pageHeight - margin * 2;
    const scale = canvas.width / contentWidth;
    const sliceHeight = Math.max(1, Math.floor(contentHeight * scale));
    const pages = Math.ceil(canvas.height / sliceHeight);

    for (let index = 0; index < pages; index += 1) {
      if (index > 0) pdf.addPage();
      const sourceY = index * sliceHeight;
      const sourceHeight = Math.min(sliceHeight, canvas.height - sourceY);
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = sourceHeight;
      const context = slice.getContext('2d');
      if (!context) throw new Error('Could not create the PDF page.');
      context.fillStyle = options.theme === 'dark' ? '#1c1c1e' : '#ffffff';
      context.fillRect(0, 0, slice.width, slice.height);
      context.drawImage(
        canvas,
        0,
        sourceY,
        canvas.width,
        sourceHeight,
        0,
        0,
        canvas.width,
        sourceHeight,
      );
      const renderedHeight = sourceHeight / scale;
      pdf.addImage(
        slice.toDataURL('image/jpeg', 0.92),
        'JPEG',
        margin,
        margin,
        contentWidth,
        renderedHeight,
        undefined,
        'FAST',
      );
      if (options.includeFooter) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(120, 120, 125);
        pdf.text(`${index + 1} / ${pages}`, pageWidth / 2, pageHeight - 16, { align: 'center' });
      }
    }

    return {
      blob: pdf.output('blob'),
      filename: `${safeFilename(title)}.pdf`,
      mimeType: 'application/pdf',
    };
  } finally {
    page.cleanup();
  }
}
