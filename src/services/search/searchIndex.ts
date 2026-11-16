import type { SearchFileInput } from '../../types/workspace';
import { createMatcher, searchFiles, type SearchCoreResult } from './searchCore';

export interface SearchIndexQuery {
  query: string;
  useRegex: boolean;
  caseSensitive: boolean;
  maxResults?: number;
}

export type MatchingPathsQuery = Omit<SearchIndexQuery, 'maxResults'>;

/**
 * 搜索索引的唯一实现：基准内容 + 打开文档的增量覆盖。
 * 运行在 Worker 中，渲染层不再需要持有工作区正文副本。
 */
export class SearchIndex {
  private base = new Map<string, string>();
  private overrides = new Map<string, string>();

  setIndex(files: SearchFileInput[]): void {
    this.base = new Map(files.map((file) => [file.path, file.content]));
    this.overrides.clear();
  }

  update(files: SearchFileInput[]): void {
    for (const file of files) this.overrides.set(file.path, file.content);
  }

  resetOverrides(paths: string[]): void {
    for (const path of paths) this.overrides.delete(path);
  }

  has(path: string): boolean {
    return this.base.has(path) || this.overrides.has(path);
  }

  size(): number {
    return this.files().length;
  }

  files(): SearchFileInput[] {
    const merged: SearchFileInput[] = [];
    for (const [path, content] of this.base) {
      merged.push({ path, content: this.overrides.get(path) ?? content });
    }
    for (const [path, content] of this.overrides) {
      if (!this.base.has(path)) merged.push({ path, content });
    }
    return merged;
  }

  search(query: SearchIndexQuery): SearchCoreResult {
    return searchFiles({
      files: this.files(),
      query: query.query,
      useRegex: query.useRegex,
      caseSensitive: query.caseSensitive,
      maxResults: query.maxResults ?? 500,
    });
  }

  /**
   * 返回所有匹配文件路径（不受 maxResults 限制），供“全部替换”使用。
   * 渲染层因此不需要为了筛文件而保留整库正文。
   */
  matchingPaths(query: MatchingPathsQuery): string[] {
    if (!query.query) return [];
    let matcher: RegExp;
    try {
      matcher = createMatcher(query.query, query.useRegex, query.caseSensitive);
    } catch {
      return [];
    }
    const paths: string[] = [];
    for (const [path, content] of this.base) {
      const effective = this.overrides.get(path) ?? content;
      matcher.lastIndex = 0;
      if (matcher.test(effective)) paths.push(path);
    }
    for (const [path, content] of this.overrides) {
      if (this.base.has(path)) continue;
      matcher.lastIndex = 0;
      if (matcher.test(content)) paths.push(path);
    }
    return paths;
  }
}
