import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CaseSensitive,
  FileText,
  Loader2,
  RefreshCw,
  Replace,
  Search,
  X,
} from 'lucide-react';
import { useUIStore } from '../../app/uiStore';
import { useWorkspaceStore } from '../../app/workspaceStore';
import { isDocumentDirty } from '../../domain/document';
import { useWorkspaceActionsContext } from '../../hooks/WorkspaceActionsContext';
import { createSearchClient, type SearchClient } from '../../services/search/searchClient';
import { createMatcher } from '../../services/search/searchCore';
import { workspaceService } from '../../services/file-system';
import { SAMPLE_FILES } from '../../data/sampleWorkspace';
import type { RevealTarget } from '../../types/document';
import type { FileNode, SearchFileInput, SearchFileResult, SearchMatch, SearchResponse, TreeNode } from '../../types/workspace';
import { cn } from '../../utils/cn';

interface SearchPanelProps {
  active: boolean;
  onOpenFile: (path: string, target?: RevealTarget) => void;
}

interface IndexCache {
  key: string;
  paths: string[];
}

const EMPTY_RESPONSE: SearchResponse = {
  results: [],
  total: 0,
  truncated: false,
  durationMs: 0,
};

export function SearchPanel({ active, onOpenFile }: SearchPanelProps) {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const workspaceStatus = useWorkspaceStore((state) => state.workspaceStatus);
  const pushToast = useUIStore((state) => state.pushToast);
  const { refreshWorkspace } = useWorkspaceActionsContext();
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [useRegex, setUseRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [response, setResponse] = useState<SearchResponse>(EMPTY_RESPONSE);
  const [loading, setLoading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [indexProgress, setIndexProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const workerRef = useRef<SearchClient | null>(null);
  const indexRef = useRef<IndexCache | null>(null);
  const appliedOverridesRef = useRef<Map<string, string>>(new Map());
  const indexPromiseRef = useRef<{ key: string; promise: Promise<string[]> } | null>(null);
  const runIdRef = useRef(0);

  const connected = workspace.kind === 'file-system' && workspaceStatus === 'connected';
  const treeSignature = useMemo(() => signatureForTree(workspace.tree), [workspace.tree]);

  useEffect(() => {
    workerRef.current = createSearchClient();
    return () => {
      workerRef.current?.dispose();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (active) {
      window.setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [active]);

  useEffect(() => {
    setResponse(EMPTY_RESPONSE);
    setError(null);
    setQuery('');
    indexRef.current = null;
    indexPromiseRef.current = null;
    appliedOverridesRef.current = new Map();
  }, [workspace.kind, workspace.openedAt]);

  const ensureIndex = useCallback(async (): Promise<string[]> => {
    const cacheKey = `${workspace.kind}:${workspace.name}:${workspace.openedAt}:${treeSignature}`;
    if (indexRef.current?.key === cacheKey) return indexRef.current.paths;
    if (indexPromiseRef.current?.key === cacheKey) return indexPromiseRef.current.promise;
    setIndexing(true);
    setIndexProgress(null);
    const promise = (async () => {
      try {
        const files =
          workspace.kind === 'sample'
            ? SAMPLE_FILES.map((file) => ({ path: file.path, content: file.content }))
            : await workspaceService.collectMarkdownFiles(workspace.tree, {
                onProgress: (loaded, total) => setIndexProgress({ loaded, total }),
              });
        const paths = files.map((file) => file.path);
        indexRef.current = { key: cacheKey, paths };
        appliedOverridesRef.current = new Map();
        // The index is sent once here; later queries only send the search criteria.
        workerRef.current?.setIndex(files);
        return paths;
      } finally {
        if (indexPromiseRef.current?.key === cacheKey) indexPromiseRef.current = null;
        setIndexing(false);
        setIndexProgress(null);
      }
    })();
    indexPromiseRef.current = { key: cacheKey, promise };
    return promise;
  }, [treeSignature, workspace]);

  useEffect(() => {
    if (workspace.kind !== 'file-system' || workspaceStatus !== 'connected') return;
    if (workspace.fileCount > 2000) return;
    const timer = window.setTimeout(() => {
      void ensureIndex().catch(() => undefined);
    }, 900);
    return () => window.clearTimeout(timer);
    // Indexing is intentionally triggered by workspace changes, not tree re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.kind, workspace.openedAt, workspace.fileCount, workspaceStatus, treeSignature]);

  /**
   * Sync open documents (including unsaved content) to the worker as incremental patches.
   * Only documents whose content changed are sent; closing one restores the disk content.
   */
  const syncOpenDocumentOverrides = (worker: SearchClient) => {
    const documents = useWorkspaceStore.getState().documents.filter((document) => document.path);
    const next = new Map<string, string>();
    for (const document of documents) next.set(document.path as string, document.content);
    const changed: SearchFileInput[] = [];
    for (const [path, content] of next) {
      if (appliedOverridesRef.current.get(path) !== content) changed.push({ path, content });
    }
    const reset: string[] = [];
    for (const path of appliedOverridesRef.current.keys()) {
      if (!next.has(path)) reset.push(path);
    }
    appliedOverridesRef.current = next;
    worker.updateIndex(changed);
    // The worker keeps the baseline content; on close, just tell it to drop the override.
    worker.resetOverrides(reset);
  };

  const runSearch = useCallback(
    async (searchQuery: string) => {
      const trimmed = searchQuery.trim();
      if (!trimmed) {
        setResponse(EMPTY_RESPONSE);
        setError(null);
        setLoading(false);
        return;
      }
      const runId = runIdRef.current + 1;
      runIdRef.current = runId;
      setLoading(true);
      setError(null);
      try {
        await ensureIndex();
        const worker = workerRef.current;
        if (!worker) return;
        syncOpenDocumentOverrides(worker);
        const next = await worker.search({
          query: trimmed,
          useRegex,
          caseSensitive,
          maxResults: 600,
        });
        if (runId !== runIdRef.current) return;
        if (next.error) {
          setError(next.error);
          setResponse(EMPTY_RESPONSE);
        } else {
          setResponse(next);
        }
      } catch (searchError) {
        if (runId === runIdRef.current) {
          setError(searchError instanceof Error ? searchError.message : 'Search failed.');
          setResponse(EMPTY_RESPONSE);
        }
      } finally {
        if (runId === runIdRef.current) setLoading(false);
      }
    },
    [caseSensitive, ensureIndex, useRegex],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void runSearch(query);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query, runSearch]);

  const results = response.results;

  const openResult = (result: SearchFileResult, match?: SearchMatch) => {
    onOpenFile(
      result.path,
      match ? { line: match.line, column: match.column, length: match.matchLength } : undefined,
    );
  };

  const refreshIndex = () => {
    indexRef.current = null;
    void runSearch(query);
  };

  const writeFileReplacement = useCallback(
    async (path: string, nextContent: string): Promise<boolean> => {
      const lastModified = await workspaceService.writeTextFile(path, nextContent);
      const openDocument = useWorkspaceStore
        .getState()
        .documents.find((document) => document.path === path && document.origin === 'workspace');
      if (openDocument) {
        useWorkspaceStore.getState().syncDocumentFromDisk(openDocument.id, nextContent, lastModified);
      }
      return true;
    },
    [],
  );

  const replaceAll = async () => {
    if (!connected) {
      pushToast({ title: 'Sample workspace is read-only', description: 'Open a local folder to replace text.', tone: 'default' });
      return;
    }
    if (!query.trim()) return;
    const worker = workerRef.current;
    if (!worker) return;
    await ensureIndex();
    try {
      createMatcher(query, useRegex, caseSensitive);
    } catch (regexError) {
      pushToast({
        title: 'Invalid regular expression',
        description: regexError instanceof Error ? regexError.message : undefined,
        tone: 'error',
      });
      return;
    }
    const matchingPaths = await worker.matchingPaths({ query, useRegex, caseSensitive });
    if (!matchingPaths.length) return;
    if (!window.confirm(`Replace all matches in ${matchingPaths.length} files?`)) return;

    setReplacing(true);
    let changedFiles = 0;
    let skippedDirty = 0;
    try {
      const openDocuments = useWorkspaceStore.getState().documents;
      for (const path of matchingPaths) {
        const dirtyDocument = openDocuments.find(
          (document) => document.path === path && document.origin === 'workspace' && isDocumentDirty(document),
        );
        if (dirtyDocument) {
          skippedDirty += 1;
          continue;
        }
        const latest = await workspaceService.readTextFile(path);
        const fileRegex = createMatcher(query, useRegex, caseSensitive);
        const nextContent = latest.content.replace(fileRegex, replacement);
        if (nextContent !== latest.content) {
          await writeFileReplacement(path, nextContent);
          changedFiles += 1;
        }
      }
      indexRef.current = null;
      await refreshWorkspace({ silent: true });
      await runSearch(query);
      pushToast({
        title: 'Replace complete',
        description:
          skippedDirty > 0
            ? `${changedFiles} files updated, ${skippedDirty} with unsaved changes skipped`
            : `${changedFiles} files updated`,
        tone: 'success',
        durationMs: 3600,
      });
    } catch (replaceError) {
      pushToast({
        title: 'Replace failed',
        description: replaceError instanceof Error ? replaceError.message : undefined,
        tone: 'error',
        durationMs: 4200,
      });
    } finally {
      setReplacing(false);
    }
  };

  const replaceSingle = async (result: SearchFileResult, matchIndex: number) => {
    if (!connected) return;
    const match = result.matches[matchIndex];
    const dirtyDocument = useWorkspaceStore
      .getState()
      .documents.find(
        (document) => document.path === result.path && document.origin === 'workspace' && isDocumentDirty(document),
      );
    if (dirtyDocument) {
      pushToast({ title: 'This file has unsaved changes', description: 'Save it before replacing.', tone: 'default' });
      return;
    }
    setReplacing(true);
    try {
      const latest = await workspaceService.readTextFile(result.path);
      const lines = latest.content.split(/\r?\n/);
      const lineText = lines[match.line - 1];
      if (lineText === undefined) throw new Error('The file changed. Search again.');
      const regex = createMatcher(query, useRegex, caseSensitive);
      let candidate: RegExpExecArray | null = null;
      let found: RegExpExecArray | null;
      while ((found = regex.exec(lineText)) !== null) {
        if (found[0].length === 0) break;
        candidate = found;
        if (found.index + 1 >= match.column) break;
      }
      if (!candidate) throw new Error('The match moved. Search again.');
      lines[match.line - 1] =
        lineText.slice(0, candidate.index) +
        replacement +
        lineText.slice(candidate.index + candidate[0].length);
      await writeFileReplacement(result.path, lines.join('\n'));
      indexRef.current = null;
      await refreshWorkspace({ silent: true });
      await runSearch(query);
      pushToast({ title: 'Replaced 1 match', tone: 'success', durationMs: 1600 });
    } catch (replaceError) {
      pushToast({
        title: 'Replace failed',
        description: replaceError instanceof Error ? replaceError.message : undefined,
        tone: 'error',
      });
    } finally {
      setReplacing(false);
    }
  };

  const summary = useMemo(() => {
    if (!query.trim()) return 'Search Markdown across the workspace';
    if (loading) return 'Searching…';
    const resultLabel = response.total === 1 ? 'result' : 'results';
    if (response.truncated) return `Showing first ${response.total} ${resultLabel}`;
    return `${response.total} ${resultLabel} · ${Math.max(1, Math.round(response.durationMs))} ms`;
  }, [loading, query, response.durationMs, response.total, response.truncated]);

  return (
    <div className="search-panel">
      <div className="search-field-row">
        <div className="search-field">
          <Search size={14} className="search-field-icon" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            placeholder="Search workspace"
            aria-label="Search workspace"
            onChange={(event) => setQuery(event.target.value)}
          />
          {query ? (
            <button type="button" className="search-clear" aria-label="Clear search" onClick={() => setQuery('')}>
              <X size={12} />
            </button>
          ) : null}
        </div>
        <button
          type="button"
          className={cn('search-option-button', showReplace && 'is-active')}
          aria-label="Show replace"
          aria-pressed={showReplace}
          onClick={() => setShowReplace((value) => !value)}
          data-tip="Show replace"
        >
          <Replace size={14} />
        </button>
      </div>

      <div className="search-options-row">
        <button
          type="button"
          className={cn('search-option-button', useRegex && 'is-active')}
          aria-pressed={useRegex}
          onClick={() => setUseRegex((value) => !value)}
          title="Use regular expression"
        >
          .*
        </button>
        <button
          type="button"
          className={cn('search-option-button', caseSensitive && 'is-active')}
          aria-pressed={caseSensitive}
          onClick={() => setCaseSensitive((value) => !value)}
          title="Match case"
        >
          <CaseSensitive size={14} />
        </button>
        <span className="search-summary">{summary}</span>
        <button type="button" className="search-refresh" onClick={refreshIndex} title="Rebuild search index" aria-label="Rebuild search index">
          <RefreshCw size={12} className={indexing ? 'spin' : undefined} />
        </button>
      </div>

      {showReplace ? (
        <div className="search-replace-row">
          <input
            type="text"
            value={replacement}
            placeholder={connected ? 'Replace with…' : 'Open a folder to replace'}
            disabled={!connected}
            aria-label="Replace with"
            onChange={(event) => setReplacement(event.target.value)}
          />
          <button
            type="button"
            className="search-replace-all"
            disabled={!connected || !query.trim() || replacing || loading}
            onClick={() => void replaceAll()}
          >
            {replacing ? <Loader2 size={12} className="spin" /> : null}
            Replace all
          </button>
        </div>
      ) : null}

      {indexing ? (
        <div className="search-progress" role="status">
          <Loader2 size={12} className="spin" />
          {indexProgress
            ? `Indexing ${indexProgress.loaded}/${indexProgress.total}`
            : 'Building search index…'}
        </div>
      ) : null}

      {error ? <div className="search-error">{error}</div> : null}

      <div className="search-results">
        {!loading && !indexing && query.trim() && !results.length && !error ? (
          <div className="search-empty">
            <Search size={18} />
            <span>No matches found</span>
          </div>
        ) : null}
        {results.map((result) => (
          <section key={result.path} className="search-result-group">
            <button
              type="button"
              className="search-result-file"
              onClick={() => openResult(result, result.matches[0])}
            >
              <FileText size={13} />
              <span>{result.fileName}</span>
              <small>{result.matches.length}</small>
            </button>
            <div className="search-result-matches">
              {result.matches.map((match, index) => {
                const before = match.preview.slice(0, match.matchStart);
                const matched = match.preview.slice(
                  match.matchStart,
                  match.matchStart + match.matchLength,
                );
                const after = match.preview.slice(match.matchStart + match.matchLength);
                return (
                  <div className="search-match-row" key={`${result.path}:${match.line}:${match.column}`}>
                    <button
                      type="button"
                      className="search-match"
                      title={`${result.path}:${match.line}:${match.column}`}
                      onClick={() => openResult(result, match)}
                    >
                      <span className="search-match-line">{match.line}</span>
                      <span className="search-snippet">
                        {before}
                        <mark>{matched}</mark>
                        {after}
                      </span>
                    </button>
                    {showReplace ? (
                      <button
                        type="button"
                        className="search-single-replace"
                        disabled={!connected || replacing}
                        onClick={() => void replaceSingle(result, index)}
                        title="Replace this match"
                      >
                        <Replace size={11} />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}


function signatureForTree(nodes: TreeNode[]): string {
  const segments: string[] = [];
  const walk = (list: TreeNode[]) => {
    for (const node of list) {
      if (node.kind === 'file') {
        segments.push(`${(node as FileNode).path}:${(node as FileNode).lastModified}:${(node as FileNode).size}`);
      } else {
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return segments.join('|');
}
