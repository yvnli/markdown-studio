import { SearchIndex } from '../services/search/searchIndex';
import type { SearchWorkerRequest, SearchWorkerResponse } from '../types/workspace';

// The index lives inside the Worker: the main thread only sends queries and incremental patches.
const index = new SearchIndex();

self.onmessage = (event: MessageEvent<SearchWorkerRequest>) => {
  const request = event.data;
  switch (request.type) {
    case 'set-index':
      index.setIndex(request.files);
      return;
    case 'update-index':
      index.update(request.files);
      return;
    case 'reset-overrides':
      index.resetOverrides(request.paths);
      return;
    case 'matching-paths': {
      const response: SearchWorkerResponse = {
        id: request.id,
        paths: index.matchingPaths({
          query: request.query,
          useRegex: request.useRegex,
          caseSensitive: request.caseSensitive,
        }),
      };
      self.postMessage(response);
      return;
    }
    case 'search': {
      const response: SearchWorkerResponse = {
        id: request.id,
        ...index.search({
          query: request.query,
          useRegex: request.useRegex,
          caseSensitive: request.caseSensitive,
          maxResults: request.maxResults,
        }),
      };
      self.postMessage(response);
      return;
    }
  }
};
