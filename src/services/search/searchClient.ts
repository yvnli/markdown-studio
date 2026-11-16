import SearchWorker from '../../workers/search.worker?worker';
import type {
  SearchFileInput,
  SearchResponse,
  SearchWorkerResponse,
} from '../../types/workspace';

export interface SearchQuery {
  query: string;
  useRegex: boolean;
  caseSensitive: boolean;
  maxResults?: number;
}

export interface MatchingPathsQuery {
  query: string;
  useRegex: boolean;
  caseSensitive: boolean;
}

export interface SearchClient {
  /** 重建整个索引；仅在目录树签名变化时调用。 */
  setIndex: (files: SearchFileInput[]) => void;
  /** 增量更新少量文件（例如未保存的打开文档）。 */
  updateIndex: (files: SearchFileInput[]) => void;
  /** 撤销增量覆盖，恢复为索引中的基准内容。 */
  resetOverrides: (paths: string[]) => void;
  search: (payload: SearchQuery) => Promise<SearchResponse>;
  /** 返回全部匹配文件路径，用于“全部替换”而无需把正文复制回主线程。 */
  matchingPaths: (payload: MatchingPathsQuery) => Promise<string[]>;
  dispose: () => void;
}

type PendingRequest = {
  resolve: (value: SearchResponse | string[]) => void;
  reject: (error: Error) => void;
};

export function createSearchClient(): SearchClient {
  const worker = new SearchWorker();
  let nextId = 1;
  const pending = new Map<number, PendingRequest>();

  worker.addEventListener('message', (event: MessageEvent<SearchWorkerResponse>) => {
    const data = event.data;
    if (typeof data.id !== 'number') return;
    const request = pending.get(data.id);
    if (!request) return;
    pending.delete(data.id);
    if ('paths' in data) request.resolve(data.paths);
    else request.resolve(data);
  });

  worker.addEventListener('error', (event) => {
    for (const request of pending.values()) {
      request.reject(new Error(event.message || '搜索 worker 失败。'));
    }
    pending.clear();
  });

  return {
    setIndex(files) {
      worker.postMessage({ type: 'set-index', id: nextId++, files });
    },
    updateIndex(files) {
      if (!files.length) return;
      worker.postMessage({ type: 'update-index', id: nextId++, files });
    },
    resetOverrides(paths) {
      if (!paths.length) return;
      worker.postMessage({ type: 'reset-overrides', id: nextId++, paths });
    },
    search(payload) {
      const id = nextId++;
      return new Promise<SearchResponse>((resolve, reject) => {
        pending.set(id, {
          resolve: (value) => resolve(value as SearchResponse),
          reject,
        });
        worker.postMessage({
          type: 'search',
          id,
          query: payload.query,
          useRegex: payload.useRegex,
          caseSensitive: payload.caseSensitive,
          maxResults: payload.maxResults ?? 500,
        });
      });
    },
    matchingPaths(payload) {
      const id = nextId++;
      return new Promise<string[]>((resolve, reject) => {
        pending.set(id, {
          resolve: (value) => resolve(value as string[]),
          reject,
        });
        worker.postMessage({
          type: 'matching-paths',
          id,
          query: payload.query,
          useRegex: payload.useRegex,
          caseSensitive: payload.caseSensitive,
        });
      });
    },
    dispose() {
      pending.clear();
      worker.terminate();
    },
  };
}
