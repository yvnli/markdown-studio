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
  /** Rebuild the whole index; call this only when the directory tree signature changes. */
  setIndex: (files: SearchFileInput[]) => void;
  /** Incrementally update a few files, such as unsaved open documents. */
  updateIndex: (files: SearchFileInput[]) => void;
  /** Undo incremental overrides and restore the baseline content from the index. */
  resetOverrides: (paths: string[]) => void;
  search: (payload: SearchQuery) => Promise<SearchResponse>;
  /** Return every matching file path for "Replace all" without copying content to the main thread. */
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
      request.reject(new Error(event.message || 'Search worker failed.'));
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
