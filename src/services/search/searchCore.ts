import type { SearchFileInput, SearchResponse } from '../../types/workspace';

export interface SearchOptions {
  files: SearchFileInput[];
  query: string;
  useRegex: boolean;
  caseSensitive: boolean;
  maxResults: number;
}

export type SearchCoreResult = Omit<SearchResponse, 'id'>;

function fileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

export function createMatcher(
  query: string,
  useRegex: boolean,
  caseSensitive: boolean,
): RegExp {
  const source = useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(source, `g${caseSensitive ? '' : 'i'}`);
}

export function searchFiles(options: SearchOptions): SearchCoreResult {
  const started = performance.now();
  const { files, query, useRegex, caseSensitive, maxResults } = options;
  if (!query) {
    return { results: [], total: 0, truncated: false, durationMs: 0 };
  }

  let matcher: RegExp;
  try {
    matcher = createMatcher(query, useRegex, caseSensitive);
  } catch (error) {
    return {
      results: [],
      total: 0,
      truncated: false,
      durationMs: performance.now() - started,
      error: error instanceof Error ? error.message : '正则表达式无效。',
    };
  }

  const results: SearchCoreResult['results'] = [];
  let total = 0;
  let truncated = false;

  for (const file of files) {
    const matches: SearchCoreResult['results'][number]['matches'] = [];
    const lines = file.content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      matcher.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = matcher.exec(line)) !== null) {
        if (match[0].length === 0) {
          matcher.lastIndex = match.index + 1;
          continue;
        }
        total += 1;
        const snippetStart = Math.max(0, Math.min(match.index - 70, line.length - 280));
        const snippet = line.slice(snippetStart, snippetStart + 280);
        matches.push({
          path: file.path,
          fileName: fileName(file.path),
          line: index + 1,
          column: match.index + 1,
          preview: snippet,
          matchStart: match.index - snippetStart,
          matchLength: match[0].length,
        });
        if (total >= maxResults) {
          truncated = true;
          break;
        }
      }
      if (truncated) break;
    }
    if (matches.length) results.push({ path: file.path, fileName: fileName(file.path), matches });
    if (truncated) break;
  }

  return {
    results,
    total,
    truncated,
    durationMs: performance.now() - started,
  };
}
