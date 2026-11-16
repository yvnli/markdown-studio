const LANGUAGE_LABELS: Record<string, string> = {
  js: 'JavaScript',
  javascript: 'JavaScript',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  jsx: 'JSX',
  tsx: 'TSX',
  py: 'Python',
  python: 'Python',
  sh: 'Shell',
  bash: 'Bash',
  shell: 'Shell',
  zsh: 'Zsh',
  html: 'HTML',
  xml: 'XML',
  css: 'CSS',
  scss: 'SCSS',
  json: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  md: 'Markdown',
  markdown: 'Markdown',
  sql: 'SQL',
  go: 'Go',
  rust: 'Rust',
  java: 'Java',
  c: 'C',
  cpp: 'C++',
  diff: 'Diff',
  plaintext: 'Text',
  text: 'Text',
  mermaid: 'Mermaid',
  latex: 'LaTeX',
};

export function languageLabel(language: string): string {
  return LANGUAGE_LABELS[language.toLowerCase()] ?? (language ? language.toUpperCase() : 'Text');
}

export function languageFromClassName(className: string | undefined): string {
  if (!className) return '';
  const match = /(?:^|\s)language-([^\s]+)/.exec(className);
  return match?.[1]?.toLowerCase() ?? '';
}
