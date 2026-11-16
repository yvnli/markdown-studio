export type ExportFormat = 'pdf' | 'html' | 'docx' | 'png';

export interface ExportOptions {
  format: ExportFormat;
  includeToc: boolean;
  includeHeader: boolean;
  includeFooter: boolean;
  theme: 'light' | 'dark';
}

export interface ExportRequest {
  markdown: string;
  title: string;
  documentPath: string | null;
  options: ExportOptions;
}

export interface ExportResult {
  blob: Blob;
  filename: string;
  mimeType: string;
}
