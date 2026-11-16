# Markdown studio · Architecture Optimization Checklist

**English** · [中文](./OPTIMIZATION-CHECKLIST.zh-CN.md)

- Version: v1.1
- Compiled: 2026-11-10
- Implementation update: 2026-11-10 (stage 1, stage 2, and the low-risk P2 items have landed; see section 9)
- Review baseline: 2.0.0 (React 19 · TypeScript 6 · Vite 8 · CodeMirror 6 · Electron 45)
- Companion docs: [Architecture](./ARCHITECTURE.md) · [README](../README.md)
- Purpose: a **checkable execution checklist** broken down by priority, for refactoring scheduling, code review cross-checking, and acceptance

---

## 0. Baseline Data and Overall Assessment

### 0.1 Baseline at Review Time

| Item | Baseline at review | After optimization (2026-11-10) |
| --- | --- | --- |
| TS / TSX / CSS lines of code | 13,630 lines | 15,693 lines (new domain layer, session layer, split hooks and tests) |
| Tests | 8 files / 47 cases | **13 files / 73 cases**, all passing |
| Type check / Lint | passing | passing; `noUnusedLocals` enabled, Electron CJS included in lint |
| Build entry chunk | 1,514.81 kB (gzip 494.85 kB) | **118.27 kB (gzip 36.93 kB)**; first-screen JS totals roughly 288 kB gzip |
| Largest dynamic chunk | `elk` 1,498.94 kB | unchanged (loaded only on the Mermaid path, acceptable) |
| Error boundary | no root-level ErrorBoundary | root-level ErrorBoundary + draft backup export |
| Version control | not a git repository | still not initialized (see the unfinished items under ARCH-20) |

### 0.2 Overall Assessment

The layering intent is clear: `components → app(store) → services → infrastructure`, the two file-system backends are abstracted behind `WorkspaceServiceContract`, heavy dependencies are dynamically imported, search runs in a Worker, and the main process re-validates relative paths.

The problems cluster in four directions rather than "a missing layer":

1. **State granularity**: all documents are crammed into one array, so a single keystroke triggers a global re-render (ARCH-05).
2. **Service boundary**: singletons + implementation chosen at import time + UI wired straight to infrastructure make things untestable and duplicate the two backends (ARCH-12, ARCH-13).
3. **Desktop process responsibilities**: the Electron main process carries heavy I/O such as scanning/indexing, and the security surface can be tightened further (ARCH-04, ARCH-10).
4. **Data-safety semantics**: switching workspaces loses drafts, and document identity is bound to a mutable path (ARCH-01, ARCH-02).

### 0.3 Priority Definitions

| Priority | Meaning | Handling requirement |
| --- | --- | --- |
| **P0** | Data loss, state corruption, missing security boundary | Fix immediately, ahead of any other refactoring |
| **P1** | Clear performance bottleneck or scale ceiling that degrades linearly with data volume | Complete within this iteration, ARCH-05 / ARCH-07 first |
| **P2** | Maintainability, testability, engineering debt | Schedule for following iterations, can run in parallel with features |

---

## 1. Priority Overview

| ID | Title | Priority | Type | Effort | Stage |
| --- | --- | --- | --- | --- | --- |
| ARCH-01 | Switching workspaces silently discards unsaved documents | P0 | Data safety | S | 1 |
| ARCH-02 | Document identity bound to a mutable path | P0 | Correctness | M | 1 |
| ARCH-03 | Actions implicitly depend on the "currently active document" | P0 | Correctness | S | 1 |
| ARCH-04 | Tightening the Electron security surface | P0 | Security | M | 3 |
| ARCH-05 | Every keystroke/cursor move re-renders the whole app | P1 | Performance | M | 2 |
| ARCH-06 | livePreview rebuilds decorations for the whole document | P1 | Performance | S | 2 |
| ARCH-07 | Search index re-transferred to the Worker on every query | P1 | Performance/Architecture | M | 2 |
| ARCH-08 | 5-second polling full scan, no single-flight and no diff | P1 | Performance/Scale | S | 2 |
| ARCH-09 | Session snapshot writes everything to localStorage | P1 | Scale/Data | M | 4 |
| ARCH-10 | Electron main process carries heavy I/O | P1 | Performance | M | 3 |
| ARCH-11 | 1.5 MB single entry chunk on first screen | P1 | Performance | S | 4 |
| ARCH-12 | Duplicate implementations of the two file-system backends | P2 | Maintainability | L | 3 |
| ARCH-13 | Service singleton, implementation chosen at import, UI wired straight to infrastructure | P2 | Testability | M | 3 |
| ARCH-14 | Overloaded action layer + duplicated tree utilities | P2 | Maintainability | M | 2 |
| ARCH-15 | Derived `dirty` state maintained by hand | P2 | Correctness/Simplification | S | 2 |
| ARCH-16 | uiStore mixes concerns; no ErrorBoundary; incomplete state machine | P2 | Maintainability/Robustness | M | 4 |
| ARCH-17 | Hand-written IPC contract; Electron code not linted | P2 | Engineering | M | 3 |
| ARCH-18 | Dead code and contract bloat | P2 | Cleanliness | S | 4 |
| ARCH-19 | 3,200 lines of global CSS namespace | P2 | Maintainability | L | 4 |
| ARCH-20 | Unbalanced test and CI structure | P2 | Engineering | L | 4 |

> Effort estimate: S ≈ 0.5 day, M ≈ 1–2 days, L ≈ 3–5 days (assuming one person familiar with the code).

**Suggested order**: stage 1 (P0 data/identity) → stage 2 (P1 rendering and search) → stage 3 (architecture split + desktop security) → stage 4 (engineering wrap-up).

### 1.1 Implementation Status (2026-11-10)

| Status | Items |
| --- | --- |
| ✅ Implemented (pending on-device/performance verification) | ARCH-01, 02, 03, 04, 06, 07, 08, 09, 11, 14, 15, 18 |
| ◐ Partially done | ARCH-05 (re-renders isolated with selectors + memo, not yet a store split by id), ARCH-10 (parallel I/O done, `utilityProcess` not done), ARCH-16 (ErrorBoundary / Toast done, store split and state machine not done), ARCH-17 (input validation and CJS lint done, shared contract / `checkJs` not done), ARCH-20 (unit tests / CJS lint / syntax check done, E2E / desktop CI / git not done) |
| ⏸ Deferred | ARCH-12 (Adapter split), ARCH-13 (dependency injection), ARCH-19 (CSS Modules) |

> Only sub-items that actually landed are checked; verification items that need a real device, Profiler, or a live browser run stay unchecked. Section 8.4 lists the verifications not yet performed.

---

## 2. P0 · Fix First

### ARCH-01 Switching workspaces silently discards unsaved documents

- [x] Collect dirty documents before opening a new workspace and block/prompt
- [x] Offer three choices: "save all to the original directory / download a copy / discard"
- [x] When restoring a session, filter stale paths against the new workspace tree and turn them into `detached` drafts
- [ ] Add a regression case: dirty documents + switching workspaces

**Current state**: `switchWorkspace` keeps only `scratch` documents; `adoptWorkspace` performs no dirty check at all.

**Evidence**: [workspaceStore.ts](../src/app/workspaceStore.ts#L227-L238), [useWorkspaceActions.ts](../src/hooks/useWorkspaceActions.ts#L57-L72)

**Impact**: when another folder is opened, all unsaved content with `origin === 'workspace'` simply disappears, the session snapshot is then overwritten, and nothing can be recovered. The reverse problem: `restoreWorkspaceSnapshot` keeps every non-sample document, so stale documents from the **previous workspace** can be carried into the new one — the path no longer exists, yet the document is still editable and savable.

**Recommendation**: add a dirty guard at the `openFolder` entry point (reuse the interaction pattern of `CloseDocumentDialog` for the dialog); have `restoreWorkspaceSnapshot` validate paths against the new tree and mark stale documents as `detached` drafts instead of keeping their workspace identity.

**Acceptance**: with dirty workspace documents present, switching workspaces must show a confirmation; after cancelling, the original state is completely unchanged; after confirming, documents are written to disk or downloaded as chosen.

---

### ARCH-02 Document identity bound to a mutable path

- [x] `DocumentTab.id` changed to a stable uuid generated at creation time
- [x] `path` demoted to an ordinary writable field, with a `pathToId` index maintained
- [x] Rename/move only updates `path`, without rebuilding the editor
- [x] Session snapshot remains compatible with the old id format (migration function)

**Current state**: `id: \`file:${path}\``; `updateDocumentPath` / `renameDocumentPaths` rewrite `id`; the editor is rebuilt via `key={document.id}`.

**Evidence**: [workspaceStore.ts](../src/app/workspaceStore.ts#L118), [workspaceStore.ts](../src/app/workspaceStore.ts#L290-L319), [EditorPane.tsx](../src/components/editor/EditorPane.tsx#L102-L104)

**Impact**: after a rename or a drag-and-drop move the CodeMirror instance is destroyed and rebuilt, so **undo history, selection, scroll position, and IME state are all lost**; async operations keyed by id (save, paste, reveal) then miss their target.

**Recommendation**: decouple id from path; generate `doc_<uuid>` on `insert`; have `renameDocumentPaths` change only `path/title` and look documents up through `pathToId`.

**Acceptance**: after renaming an open document, undo still steps back, cursor and scroll position are preserved, and the tab does not flicker.

---

### ARCH-03 Actions implicitly depend on the "currently active document"

- [x] `saveActiveDocument()` → `saveDocument(id)`
- [x] `pasteImage(file)` → `pasteImage(file, documentId)`
- [x] `CloseDocumentDialog` uses the passed-in `documentId` when saving
- [x] `openNode` gained in-flight deduplication (`Map<path, Promise>`)
- [ ] Add concurrency cases: double-click open, switching tabs during a paste

**Current state**: saving and pasting both read the global active document at execution time; the close dialog closes A but saves the active document; `openNode` has no second dedup check across the `await`.

**Evidence**: [useWorkspaceActions.ts](../src/hooks/useWorkspaceActions.ts#L191-L233), [useWorkspaceActions.ts](../src/hooks/useWorkspaceActions.ts#L258-L306), [CloseDocumentDialog.tsx](../src/components/dialogs/CloseDocumentDialog.tsx#L19-L26), [workspaceStore.ts](../src/app/workspaceStore.ts#L109-L133)

**Impact**: switching tabs during an async paste computes the image path from the wrong document's directory; double-clicking a file can open duplicate tabs holding two competing copies of the content.

**Recommendation**: action signatures carry `documentId` explicitly; `openPath`/`openNode` reuse the in-flight Promise and re-check whether the document already exists once it resolves.

**Acceptance**: switching tabs while pasting a large image still inserts the markdown into the document that started the paste; rapidly double-clicking the same file yields only one tab.

---

### ARCH-04 Tightening the Electron security surface

- [ ] Change `sandbox` to `true` (verify preload compatibility)
- [x] Add CSP to the renderer page (meta or `onHeadersReceived`)
- [x] Make `will-navigate` deny by default, allowing only the app's own URL
- [x] Add `fs.realpath` + prefix validation to `workspaceFs.resolveRelative` to block symlink escapes
- [x] IPC validates `event.senderFrame` and validates inputs against a schema
- [x] Disable unused permissions (`setPermissionRequestHandler` denies by default)
- [x] Add a single-instance lock so two instances cannot race over `last-workspace.json`

**Current state**: `sandbox: false`; `index.html` has no CSP; `will-navigate` only intercepts `https?`; path validation uses `path.resolve` with no realpath; IPC has no sender/schema validation.

**Evidence**: [main.cjs](../electron/main.cjs#L60-L66), [index.html](../index.html), [main.cjs](../electron/main.cjs#L76-L82), [workspaceFs.cjs](../electron/workspaceFs.cjs#L44-L52), [preload.cjs](../electron/preload.cjs#L5-L35)

**Impact**: the missing sandbox and CSP amplify the consequences of renderer-layer vulnerabilities; non-http(s) navigation is not intercepted; a symlink inside the workspace that points outside allows reading arbitrary files.

**Recommendation**: enable sandbox/CSP and default navigation to `deny`; `resolveRelative` should `realpath` the final path and compare it against `rootPath`; add a `senderFrame.url` allowlist and zod validation to IPC; make `showSaveDialogSync` ([main.cjs](../electron/main.cjs#L235-L243)) async to avoid blocking the main process.

**Acceptance**: under `electron`, the DevTools Console reports no errors other than CSP violations; after constructing a `workspace -> /etc` symlink, `readFile('workspace/passwd')` is rejected; non-http(s) navigation is blocked.

---

## 3. P1 · Performance and Scale

### ARCH-05 Every keystroke/cursor move re-renders the whole app

- [ ] Move document content into a store split by id (`Map<string, DocSlice>`)
- [x] Store `activeDocumentId` separately; selectors return only primitives
- [ ] Move `updateCursor` out of `documents` into a separate lightweight store / ref
- [x] Wrap `FileTree` in `memo`, stabilize Sidebar callbacks with `useCallback`
- [ ] Profiler verification: FileTree render count = 0 while typing

**Current state**: both `updateDocumentContent` and `updateCursor` do `documents.map(...)`, producing a new array and a new active object; App's selector therefore returns a new object on every keystroke; Sidebar subscribes to `documents` and rebuilds `dirtyPaths`; FileTree is not memoized.

**Evidence**: [workspaceStore.ts](../src/app/workspaceStore.ts#L170-L189), [App.tsx](../src/App.tsx#L36), [Sidebar.tsx](../src/components/sidebar/Sidebar.tsx#L35-L53), [FileTree.tsx](../src/components/sidebar/FileTree.tsx#L48)

**Impact**: every character typed (and every arrow key) re-renders the App shell and the **entire file tree**; the bigger the tree, the worse it gets, directly eroding the architectural goal of "editing experience first".

**Recommendation**: subscribe to content per document; have selectors return primitives such as `title`/`isDirty`/`activeId`; store the cursor separately; FileTree `memo` + stable callbacks.

**Acceptance**: with a 2,000-node file tree and a 65,000-character document, FileTree does not re-render during continuous input, and a single React Profiler commit is < 16 ms.

---

### ARCH-06 livePreview rebuilds decorations for the whole document

- [x] Restrict `syntaxTree(state).iterate` to `view.visibleRanges` (including the active line)
- [x] Cache decorations for inactive lines so they are not fully rebuilt on every selection change
- [x] Fix the "viewport syntax tree" wording in [ARCHITECTURE.md](./ARCHITECTURE.md#L640-L648)

**Current state**: walks the entire syntax tree and, on `docChanged`/`selectionSet`/`viewportChanged`, rebuilds and re-sorts everything.

**Evidence**: [livePreview.ts](../src/components/editor/livePreview.ts#L93-L142), [livePreview.ts](../src/components/editor/livePreview.ts#L177-L181)

**Impact**: on long documents every cursor move is O(whole document), contradicting the document's own claim that "decorations come from the viewport syntax tree" (doc drift).

**Recommendation**: iterate over the visible range; compute the active line separately; throttle selection rebuilds if necessary.

**Acceptance**: moving the cursor continuously in a 65,000-character document keeps a single decoration rebuild < 5 ms (Performance panel).

---

### ARCH-07 Search index re-transferred to the Worker on every query

- [x] Worker holds the index; new `init/update/query` protocol
- [x] Renderer sends only `{query, options}`, no longer `files`
- [x] Incremental updates: file add/remove/change sends only a delta
- [x] `mergeOpenDocuments` overwrites by path instead of copying wholesale
- [x] Main thread keeps only path metadata, no full-text copies

**Current state**: `search()` postMessages the entire workspace `files` array to the Worker on every call; `SearchPanel` invokes it after a 220 ms debounce, and `mergeOpenDocuments` copies the array once more.

**Evidence**: [searchClient.ts](../src/services/search/searchClient.ts#L38-L50), [SearchPanel.tsx](../src/components/sidebar/SearchPanel.tsx#L143-L152), [SearchPanel.tsx](../src/components/sidebar/SearchPanel.tsx#L484-L497)

**Impact**: 1,000 files × tens of KB means a megabyte-scale structured clone per query, and the main thread permanently holds a third copy of the index — which cancels out most of the Worker's benefit.

**Recommendation**: build the index on the Worker side; `SearchPanel` sends only the query; send a delta when the index changes; overlay unsaved document content incrementally.

**Acceptance**: with 1,000 files indexed, the `postMessage` payload per query is < 1 KB; query time (excluding indexing) stays in the millisecond range; no > 16 ms long tasks on the main thread.

---

### ARCH-08 5-second polling full scan, no single-flight and no diff

- [x] `refreshWorkspace` has a single-flight lock (reuse the in-flight run)
- [x] Keep the existing `tree` reference when the scan result signature is unchanged
- [x] Concurrency-limit file stat (e.g. 8–16 concurrent)
- [x] Desktop hooks up native file watching (`fs.watch` recursive, FSEvents underneath on macOS; falls back to polling on failure)
- [x] `signatureForTree` is computed only when the tree actually changes

**Current state**: `scan()` every 5 seconds; both Web and desktop stat every file serially; no in-flight guard; each scan returns a new `tree` reference, triggering FileTree re-renders and full string signature concatenation.

**Evidence**: [useWorkspaceActions.ts](../src/hooks/useWorkspaceActions.ts#L182-L189), [workspaceService.ts](../src/services/file-system/workspaceService.ts#L128-L174), [workspaceFs.cjs](../electron/workspaceFs.cjs#L67-L114), [SearchPanel.tsx](../src/components/sidebar/SearchPanel.tsx#L499-L512)

**Impact**: on large directories a scan taking more than 5 seconds stacks up concurrent runs; the periodic full scan keeps burning CPU/IO and triggers meaningless re-renders.

**Recommendation**: single-flight + diff + concurrency limiting; keep polling on the Web (cross-browser compromise) and switch the desktop to native watching.

**Acceptance**: in a 6,000-file workspace scans do not overlap; an unchanged tree triggers no FileTree re-render.

---

### ARCH-09 Session snapshot writes everything to localStorage

- [x] Migrate to IndexedDB, one record per document
- [x] Persist only the body of dirty and scratch documents
- [x] Store `savedContent` as a hash or omit it
- [x] Add a schema version and migration functions
- [x] Fix capacity checks: count bytes (`Blob`/`TextEncoder`) rather than `string.length`

**Current state**: every 650 ms all documents' `content` + `savedContent` (two copies) are serialized into a single key; the UTF-16 character count is compared against a 4.2 MB byte limit.

**Evidence**: [useSessionPersistence.ts](../src/hooks/useSessionPersistence.ts#L97-L132), [useSessionPersistence.ts](../src/hooks/useSessionPersistence.ts#L107)

**Impact**: large documents + many tabs produce a long task on every persist; for Chinese content the character-count check hits the browser quota first, triggering the "snapshot too large" message and silently stopping saves.

**Recommendation**: store per document in IndexedDB, writing bodies only for dirty documents; backfill on demand at startup; versioned migration.

**Acceptance**: with 10 documents of 200 KB each, editing produces no main-thread task > 16 ms; unsaved content is fully restored after a refresh.

---

### ARCH-10 Electron main process carries heavy I/O

- [ ] Move scanning/indexing to `utilityProcess` (or a Node Worker)
- [ ] Turn `readMarkdownFiles` into streaming progress events
- [ ] `readFileMetadata` uses `fs.stat` instead of reading the whole file
- [x] Parallelize file reads (main process consistent with the Web backend)

**Current state**: `readMarkdownFiles` first scans everything inside the IPC call and then reads each Markdown file sequentially; on desktop `readFileMetadata` reads the entire file just to get mtime.

**Evidence**: [workspaceFs.cjs](../electron/workspaceFs.cjs#L180-L200), [desktopWorkspaceService.ts](../src/services/file-system/desktopWorkspaceService.ts#L83-L89)

**Impact**: the first index of a large workspace blocks the main process (window management, menus, downloads), showing up as UI stutter or even unresponsiveness.

**Recommendation**: move heavy I/O out of the main process and report progress through events; route metadata operations through `stat`.

**Acceptance**: while a 6,000-file workspace is being indexed, the window can be dragged/resized normally and menus respond in < 100 ms.

---

### ARCH-11 1.5 MB single entry chunk on first screen

- [x] `codeSplitting.groups` (replacing the deprecated `manualChunks`) splits react / codemirror / codemirror-markdown / markdown-parse / markdown-render / highlight
- [x] Preview pane or `highlight.js` loaded on demand
- [x] First-screen budget checked against the "entry static import graph": the `initialChunkBudget` plugin enforces a 500 kB budget on first-screen chunks; the global `chunkSizeWarningLimit` is relaxed to 1600, only to make room for pre-bundled single files such as `elk.bundled.js` and the Mermaid parser
- [x] Record a first-screen gzip size baseline

**Current state**: entry `index-*.js` is 1,514.81 kB (gzip 494.85 kB); CodeMirror, react-markdown/unified, KaTeX, and `highlight.js/lib/common` are all statically bundled into the main package; the warning threshold was raised to 1600 to hide it.

**Evidence**: [vite.config.ts](../vite.config.ts#L18-L20), [CodeBlock.tsx](../src/components/preview/CodeBlock.tsx#L3)

**Impact**: high first-screen parse/execute cost hurts first paint on slow networks and low-end devices on the Web; cache granularity is coarse, so any single business change invalidates the whole 1.5 MB cache.

**Recommendation**: vendor chunking + lazy-loaded highlighter + restore the warning threshold.

**Acceptance**: entry gzip < 250 kB; build emits no chunk-size warnings; time-to-interactive no worse than the current 193 ms baseline (local).

---

## 4. P2 · Maintainability and Engineering

### ARCH-12 Duplicate implementations of the two file-system backends

- [ ] Define `FileSystemAdapter` (list/stat/read/write/move/remove/assetUrl)
- [ ] Implement two thin adapters for Web and Electron
- [ ] Converge scanning, caching, tree policy, and asset naming into a single `WorkspaceService`
- [ ] Extract ignored directories / extensions / size limits into `domain/workspacePolicy`
- [ ] Delete the duplicated `relativeTo` (use `paths.relativePath`)
- [ ] Unify the extension regex in `MarkdownPreview`

**Current state**: tree building, markdown extensions, ignored directories, the 10 MB limit, caching, relative path resolution, and asset URLs are each written once for Web and once for desktop, plus a fourth copy of the extension regex.

**Evidence**: [workspaceService.ts](../src/services/file-system/workspaceService.ts#L19-L47), [desktopWorkspaceService.ts](../src/services/file-system/desktopWorkspaceService.ts#L10-L17), [workspaceFs.cjs](../electron/workspaceFs.cjs#L6-L30), [paths.ts](../src/utils/paths.ts#L1), [MarkdownPreview.tsx](../src/components/preview/MarkdownPreview.tsx#L97), [workspaceService.ts](../src/services/file-system/workspaceService.ts#L490-L496)

**Impact**: a policy change has to be synced in 3–4 places; the "10 MB limit" and "markdown extensions" already have multiple definitions and are prone to drift.

**Recommendation**: the Adapter is responsible only for "how to access", the Service for "what to access and how to aggregate"; define policy constants in one place and reuse them on the Electron side through a shared pure-JS module.

**Acceptance**: adding a new ignored directory or extension requires changing exactly 1 place; scan results from both backends match field by field on the same directory (with a new comparison test).

---

### ARCH-13 Service singleton, implementation chosen at import, UI wired straight to infrastructure

- [ ] Inject `WorkspaceService` through a Provider rather than a module-level singleton
- [ ] A composition root (`main.tsx`) selects the Web/Electron implementation
- [ ] UI components no longer import `services/file-system`
- [ ] Stores do not call the file service directly
- [ ] Add tests for actions/stores with an injectable fake

**Current state**: `index.ts` picks the implementation at import time and exports a singleton; `workspaceStore`, `SearchPanel`, `MarkdownImage`, and `exportPage` all depend on it directly.

**Evidence**: [index.ts](../src/services/file-system/index.ts#L5-L12), [workspaceStore.ts](../src/app/workspaceStore.ts#L8), [SearchPanel.tsx](../src/components/sidebar/SearchPanel.tsx#L15), [MarkdownImage.tsx](../src/components/preview/MarkdownImage.tsx#L3), [exportPage.ts](../src/services/export/exportPage.ts#L6)

**Impact**: stores/hooks cannot inject fakes, so all 47 tests sit in pure functions and the service layer, with action orchestration and stores untested by a single line; layering gains a cycle (domain/export → infrastructure).

**Recommendation**: define port interfaces and inject them through a Provider; UI consumes only the actions context; tests use an in-memory implementation.

**Acceptance**: `useWorkspaceActions` and `workspaceStore` have unit tests covering save/switch/paste/rename; tests need no `window.showDirectoryPicker`.

---

### ARCH-14 Overloaded action layer + duplicated tree utilities

- [x] Split into `useWorkspaceLifecycle` / `useDocumentActions` / `useFileTreeActions` / `useAssetActions`
- [x] Converge polling sync into `useWorkspaceLifecycle`
- [x] New `domain/treeIndex.ts` (`byPath` Map)
- [x] Delete 7 duplicated tree traversal implementations
- [x] Sidebar no longer imports utility functions from the hook file

**Current state**: a 391-line hook carries 11 kinds of responsibility and exports `findTreeNode`, which Sidebar depends on in reverse; tree traversal is written out in 7 places.

**Evidence**: [useWorkspaceActions.ts](../src/hooks/useWorkspaceActions.ts), [Sidebar.tsx](../src/components/sidebar/Sidebar.tsx#L17), [useWorkspaceActions.ts](../src/hooks/useWorkspaceActions.ts#L18-L50), [workspaceStore.ts](../src/app/workspaceStore.ts#L340-L350), [SearchPanel.tsx](../src/components/sidebar/SearchPanel.tsx#L499-L512), [FileTree.tsx](../src/components/sidebar/FileTree.tsx#L39-L41)

**Impact**: file responsibility boundaries are blurred and changes are broad; linear recursive lookups are called frequently on a 6,000-node tree.

**Recommendation**: split hooks by responsibility; build the index on `setTree` so lookups become O(1).

**Acceptance**: a single action file < 150 lines; no recursive tree lookup implementations; Sidebar depends only on the actions context.

---

### ARCH-15 Derived `dirty` state maintained by hand

- [x] Remove the persisted `dirty` field and derive it with a selector
- [x] Split `DocumentTab` into `DocumentRecord` (persisted) + editor session (transient state such as cursor)
- [x] Clean up the unused `DocumentDraft` type

**Current state**: `dirty` exists in both the type and the state and is computed separately in 4 places.

**Evidence**: [workspaceStore.ts](../src/app/workspaceStore.ts#L170-L218), [useSessionPersistence.ts](../src/hooks/useSessionPersistence.ts#L62-L74), [document.ts](../src/types/document.ts#L5-L34)

**Impact**: if a new write path forgets to sync the derived field, you get "content changed but the status says unsaved", or drift the other way.

**Recommendation**: keep only `savedContent` and let a selector compute `isDirty = content !== savedContent`; separate transient state from persisted state.

**Acceptance**: exactly one dirty-determination logic in the whole repo; state matches content after session restore.

---

### ARCH-16 uiStore mixes concerns; no ErrorBoundary; incomplete state machine

- [ ] Split `dialogStore` / `toastStore` / `findStore`
- [ ] Move find state into editor-local state (or shard it by view)
- [x] Add a root-level ErrorBoundary (with "export current draft / reload")
- [ ] Turn `workspaceStatus` into an explicit state machine, delete the unreachable `'error'`
- [x] Clean up toast timers on dismiss

**Current state**: `uiStore` simultaneously manages dialog, toast, sidebar, 7 find fields, and reveal requests; there is no root-level error boundary anywhere in the project; `'error'` is never set.

**Evidence**: [uiStore.ts](../src/app/uiStore.ts#L13-L47), [workspaceStore.ts](../src/app/workspaceStore.ts#L14), [useWorkspaceActions.ts](../src/hooks/useWorkspaceActions.ts#L112-L141)

**Impact**: any render exception produces a white screen with no recovery path; state transitions are scattered across 5 setters, making "can the user act right now" hard to reason about.

**Recommendation**: split stores by lifecycle; state machine `idle → opening → connected | permission | failed`; root-level fallback UI.

**Acceptance**: throwing deliberately inside a preview component shows a recoverable UI instead of a white screen; the state machine has exhaustive tests.

---

### ARCH-17 Hand-written IPC contract; Electron code not linted

- [ ] Extract the IPC contract into a shared module (TS types + runtime schema)
- [ ] Renderer and main process share the same definition
- [ ] Bring `electron/*.cjs` into ESLint and `checkJs`
- [ ] Add a contract-consistency check in CI

**Current state**: `types/desktop.ts` manually mirrors preload; `eslint.config.js` only covers `**/*.{ts,tsx}`; IPC return shapes rely on convention.

**Evidence**: [desktop.ts](../src/types/desktop.ts#L30-L47), [eslint.config.js](../eslint.config.js#L10), [preload.cjs](../electron/preload.cjs#L5-L35)

**Impact**: field additions/removals between the main process and the renderer are not caught by the type checker — a textbook silent drift point.

**Recommendation**: shared contract module + zod validation + Electron-side lint.

**Acceptance**: changing an IPC return field makes the renderer's type check or tests fail.

---

### ARCH-18 Dead code and contract bloat

- [x] Delete/wire up: `addDocument`, `autoSaveDraft`/`setAutoSaveDraft`, `DocumentDraft`
- [x] Delete/wire up: `readFileMetadata`, `invalidateCache`, `clear`, `forgetPersistedWorkspace`, `connectedName`
- [x] Delete/wire up: `relativeAssetPath`, `humanFileSize`, `countMarkdownFiles`
- [x] Enable `noUnusedLocals` / `noUnusedParameters` in `tsconfig`
- [x] Evaluate whether `WorkspaceServiceContract` can be shrunk

**Current state**: many exports and contract methods have no callers; `autoSaveDraft` has no entry point in the settings UI either; nobody uses the `DocumentDraft` type.

**Evidence**: [workspaceStore.ts](../src/app/workspaceStore.ts#L70-L85), [preferencesStore.ts](../src/app/preferencesStore.ts#L12), [types.ts](../src/services/file-system/types.ts#L15-L48), [paths.ts](../src/utils/paths.ts#L44-L71), [tsconfig.json](../tsconfig.json#L18-L19)

**Impact**: the contract surface is larger than the used surface, misleading future developers; unused code raises migration cost during refactors.

**Recommendation**: delete before adding; turn on unused checks as an automatic backstop.

**Acceptance**: zero errors with `noUnusedLocals` enabled; every contract method either has a caller or carries an explicit "reserved" comment.

---

### ARCH-19 3,200 lines of global CSS namespace

- [ ] Migrate to CSS Modules per component (sidebar / editor / preview first)
- [ ] Introduce stylelint and a naming convention
- [ ] Clean up unreferenced selectors
- [ ] Keep `tokens.css` as the single source of theme variables

**Current state**: 8 global CSS files, `components.css` at 795 lines, `sidebar.css` at 767 lines, `editor.css` at 707 lines, with class names shared globally.

**Evidence**: [components.css](../src/styles/components.css), [sidebar.css](../src/styles/sidebar.css), [editor.css](../src/styles/editor.css), [preview.css](../src/styles/preview.css)

**Impact**: the risk of style leakage and specificity conflicts grows with every feature; when deleting a component it is hard to tell whether its styles can go.

**Recommendation**: incremental CSS Modules; tackle the three most frequently changed blocks first; keep export-page styles independent (currently inlined in [exportPage.ts](../src/services/export/exportPage.ts#L8-L119)).

**Acceptance**: new components introduce no new global classes; a style file can be deleted per component without affecting other areas.

---

### ARCH-20 Unbalanced test and CI structure

- [ ] Add unit tests for stores/hooks (depends on the injection capability from ARCH-13)
- [ ] Add HTML/DOCX structure tests for the export pipeline
- [ ] Add a Playwright smoke test: open folder → edit → save → search → export
- [ ] Add an Electron directory build to CI (at least `electron-builder --dir`)
- [ ] Bring `electron/*.cjs` into lint; add `npm audit`
- [ ] Initialize a git repository and exclude `dist/`, `release/`, `node_modules/`

**Current state**: all 47 tests live in pure functions and the service layer; Electron main, stores, hooks, export, and UI interactions have no tests; CI only builds the Web on Ubuntu.

**Evidence**: [.github/workflows/ci.yml](../.github/workflows/ci.yml), [package.json](../package.json#L7-L23)

**Impact**: the ARCH-01–ARCH-15 refactors lack a safety net and rely on manual regression; desktop problems are only discovered before release.

**Recommendation**: write the tests tied to the "refactoring targets" before touching the code; keep E2E limited to critical paths.

**Acceptance**: critical paths (open/edit/save/search/export/switch workspace) have automated coverage; PRs show changes in test count and coverage.

---

### Supplementary: Engineering Details (low effort, can be done opportunistically)

- [ ] `dependencies` is completely empty and all runtime dependencies live in `devDependencies` ([package.json](../package.json#L24-L70)): document this or switch to `bundleDependencies`, so future CJS runtime dependencies are not left out of the package
- [x] `dev` and `preview` both on 4173 ([vite.config.ts](../vite.config.ts#L7-L17)): split the ports to support running both in parallel
- [ ] Introduce a shared `vitest.setup.ts` instead of hand-writing `// @vitest-environment jsdom` in every test file
- [ ] Evaluate merging the `vite` `test` config into `vite.config.ts` to unify the build and test entry points
- [ ] Add a version prefix to `workspaceService.openDirectory`'s `id` and to the IndexedDB key, to ease future migrations

---

## 5. Proposed Target Structure

```text
src/
├── domain/                    # pure logic, zero environment dependencies
│   ├── document.ts            # DocumentRecord / derived rules
│   ├── workspaceTree.ts       # byPath index, lookup, flattening
│   ├── workspacePolicy.ts     # ignored directories, extensions, size limits
│   ├── paths.ts
│   └── markdown/              # stats, slug
├── infrastructure/
│   ├── fs/
│   │   ├── adapter.types.ts   # FileSystemAdapter port
│   │   ├── webAdapter.ts      # File System Access
│   │   ├── electronAdapter.ts # preload bridge
│   │   └── workspaceRepository.ts  # scan / cache / tree / asset policy
│   ├── session/               # IndexedDB draft storage
│   └── desktop/               # bridge client + shared IPC contract
├── features/
│   ├── workspace/             # lifecycle / sync / fileTree hooks
│   ├── editor/                # CodeMirror boundary, livePreview, find
│   ├── preview/               # render components
│   ├── search/                # worker-held index + incremental protocol
│   └── export/                # html / pdf / png / docx pipelines
├── app/                       # pure state: stores sliced by document, no I/O
└── ui/                        # base widgets
```

Three principles that must hold:

1. **No I/O in stores**: file reads and writes appear only in the repository and actions layers.
2. **Actions carry `documentId` explicitly**: never infer the target document implicitly from global active state.
3. **Heavy work stays off the UI thread and the Electron main process**: scanning, indexing, layout, and export land in a Worker / utilityProcess / offscreen DOM respectively.

---

## 6. Phased Roadmap

| Stage | Goal | Items | Definition of Done (DoD) | Estimate |
| --- | --- | --- | --- | --- |
| **1. Data safety** | Eliminate irreversible data loss and state corruption | ARCH-01, 02, 03 | Workspace switch is guarded; rename keeps the undo stack; all actions parameterized; 6+ new regression cases | 1–2 days |
| **2. Editing performance** | Keep long documents and large file trees from degrading | ARCH-05, 06, 07, 08, 14, 15 | Zero FileTree re-renders while typing; viewport-level decorations; query payload < 1 KB; single-flight scanning | 2–4 days |
| **3. Architecture and desktop** | Testable service boundary + security hardening | ARCH-04, 10, 12, 13, 17 | Services injectable; both backends share policy; Electron sandbox/CSP enabled; heavy I/O off the main process | 3–5 days |
| **4. Engineering wrap-up** | Lower long-term maintenance cost | ARCH-09, 11, 16, 18, 19, 20 + supplementary items | Sessions in IndexedDB; entry gzip < 250 kB; ErrorBoundary; dead code at zero; CI covers critical paths | 3–5 days |

> The stages depend on each other: the store tests in ARCH-20 are cheapest after ARCH-12/13 are done; ARCH-05 and ARCH-07 are the best value-for-effort items in stage 2 and are best completed in the same batch.

---

## 7. Metrics and Acceptance

### 7.1 Key Metrics

| Metric | Current baseline | Target |
| --- | --- | --- |
| Long task during continuous input in a 65,000-character document | 0 (local) | stay at 0; single commit < 16 ms |
| FileTree renders while typing in a 2,000-node file tree | 1 per keystroke | 0 |
| `postMessage` payload per search over 1,000 files | megabyte-scale | < 1 KB |
| Search query time (excluding indexing) | millisecond range | stay in the millisecond range |
| entry chunk | 117.83 kB / gzip 36.83 kB (after optimization) | < 700 kB / gzip < 250 kB ✅ |
| Window interaction during a 6,000-file workspace scan | not measured | draggable, menu response < 100 ms |
| Session persistence main-thread task | not measured | < 16 ms |
| Root-level error recovery | none | preview failures recoverable, no white screen |

### 7.2 Measurement Methods

- **Rendering**: record 5 seconds of continuous input with the React DevTools Profiler; count FileTree commits and the duration of each commit.
- **Decorations**: record continuous cursor movement in the Performance panel and look for `livePreview`-related long tasks.
- **Search**: log the estimated `structuredClone` size before and after `postMessage`; time with `performance.now()` inside the Worker.
- **Build**: after `npm run build`, read sizes and warnings from `dist/assets`; compare the gzip numbers.
- **Session**: record 10 seconds of editing in the Performance panel and filter tasks > 16 ms.
- **Desktop**: trigger indexing on a 6,000-file workspace while dragging the window/opening menus, and watch for dropped frames.

### 7.3 Regression Check Commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run desktop:dev     # desktop interaction regression
```

---

## 8. Implementation Record (2026-11-10)

### 8.1 Landed

> The table below describes the actual code-level changes; some entries still have unfinished sub-items or items awaiting verification, all of which are listed in 8.2 and 8.4.

| Item | Change summary | Main locations |
| --- | --- | --- |
| ARCH-01 | Auto-save all dirty documents before switching workspaces; abort the switch with a prompt when not connected; on restore, convert documents absent from the new tree into detached drafts | [useWorkspaceActions.ts](../src/hooks/useWorkspaceActions.ts), [workspaceStore.ts](../src/app/workspaceStore.ts) |
| ARCH-02 | Document id changed to a stable uuid generated at creation; rename/move only updates `path`, and the editor is no longer rebuilt | [workspaceStore.ts](../src/app/workspaceStore.ts) |
| ARCH-03 | `saveDocument(id)` / `pasteImage(file, documentId)`; the close dialog saves by id; `openNode` gained in-flight deduplication | [useWorkspaceActions.ts](../src/hooks/useWorkspaceActions.ts), [EditorPane.tsx](../src/components/editor/EditorPane.tsx) |
| ARCH-04 | `sandbox: true`; CSP injected at build time; navigation denied by default; `realpath` blocks symlink escapes; IPC sender / input validation; permissions denied by default; single-instance lock; async "save as" | [main.cjs](../electron/main.cjs), [workspaceFs.cjs](../electron/workspaceFs.cjs), [vite.config.ts](../vite.config.ts) |
| ARCH-05 | App no longer subscribes to document objects; Sidebar subscribes only to primitives and dirty paths; FileTree `memo`; EditorTabs subscribes to a primitive array; no store write when the cursor has not changed | [App.tsx](../src/App.tsx), [Sidebar.tsx](../src/components/sidebar/Sidebar.tsx), [FileTree.tsx](../src/components/sidebar/FileTree.tsx), [EditorTabs.tsx](../src/components/editor/EditorTabs.tsx) |
| ARCH-06 | Live decorations iterate the "viewport + selection" window and deduplicate repeated marks | [livePreview.ts](../src/components/editor/livePreview.ts) |
| ARCH-07 | Worker keeps a resident base index + overlay: `set-index` / `update-index` / `reset-overrides` / `matching-paths` / `search`; the renderer keeps only a path list, and full replacement no longer depends on main-thread body copies | [searchIndex.ts](../src/services/search/searchIndex.ts), [search.worker.ts](../src/workers/search.worker.ts), [searchClient.ts](../src/services/search/searchClient.ts), [SearchPanel.tsx](../src/components/sidebar/SearchPanel.tsx) |
| ARCH-08 | Polling single-flight; skip the state update when the tree signature is unchanged; bounded concurrency for file metadata (Web 12 / desktop 16); native watching on desktop (250 ms debounce + ignored directories) triggering a silent refresh via `workspace:changed` | [useWorkspaceActions.ts](../src/hooks/useWorkspaceActions.ts), [workspaceService.ts](../src/services/file-system/workspaceService.ts), [main.cjs](../electron/main.cjs), [App.tsx](../src/App.tsx) |
| ARCH-09 | Session v3: metadata + one IndexedDB record per document, writing only the documents that changed by reference; localStorage backup written on pagehide; automatic v1/v2 migration; character-count estimate cap | [sessionStore.ts](../src/services/session/sessionStore.ts), [useSessionPersistence.ts](../src/hooks/useSessionPersistence.ts) |
| ARCH-11 | Vendor chunking (`codeSplitting.groups`); PreviewPane / export pipeline / highlight.js lazy-loaded; the 500 kB first-screen budget enforced by the `initialChunkBudget` plugin (the global 1600 threshold only makes room for pre-bundled single files); preview port changed to 4174 | [vite.config.ts](../vite.config.ts), [App.tsx](../src/App.tsx), [ExportDialog.tsx](../src/components/dialogs/ExportDialog.tsx), [CodeBlock.tsx](../src/components/preview/CodeBlock.tsx) |
| ARCH-14 | New `domain/treeIndex.ts` (O(1) lookup + change signature), 6 duplicated traversals deleted; `useWorkspaceActions` split into lifecycle / document / file-tree hooks + a shared helper, with polling converged into lifecycle | [treeIndex.ts](../src/domain/treeIndex.ts), [useWorkspaceActions.ts](../src/hooks/useWorkspaceActions.ts), [workspace/](../src/hooks/workspace) |
| ARCH-15 | Removed the persisted `dirty` and `DocumentDraft` in favor of the derived `isDocumentDirty()` | [document.ts](../src/domain/document.ts), [document.ts](../src/types/document.ts) |
| ARCH-16 | Root-level ErrorBoundary (with draft backup export); toast timers cleaned up on dismiss/prune | [ErrorBoundary.tsx](../src/components/ui/ErrorBoundary.tsx), [uiStore.ts](../src/app/uiStore.ts) |
| ARCH-17 | IPC input type validation + sender validation; `electron/*.cjs` brought into ESLint | [main.cjs](../electron/main.cjs), [eslint.config.js](../eslint.config.js) |
| ARCH-18 | Deleted `addDocument`, `setWorkspace`, `updateDocumentPath`, `countMarkdownFiles`, `readFileMetadata`, `invalidateCache`, `forgetPersistedWorkspace`, `connectedName`, `relativeAssetPath`, `humanFileSize`, `autoSaveDraft`, and more; enabled `noUnusedLocals/Parameters` | [tsconfig.json](../tsconfig.json), file-system contract |
| ARCH-20 | Tests 47 → 73: new store, tree index, session, search index, workspace action, and symlink escape tests; Electron CJS brought into lint and `check:electron` | [workspaceStore.test.ts](../src/app/workspaceStore.test.ts), [useWorkspaceActions.test.tsx](../src/hooks/useWorkspaceActions.test.tsx), [searchIndex.test.ts](../src/services/search/searchIndex.test.ts), [sessionStore.test.ts](../src/services/session/sessionStore.test.ts) |

### 8.2 Unfinished Items and Reasons for Deferral

| Item | Reason / next step |
| --- | --- |
| ARCH-10 (utilityProcess) | Parallel scanning and parallel reads are done, but moving indexing out of the main process requires packaging and lifecycle changes; best done in the same batch as ARCH-13 |
| ARCH-12 (Adapter split) | Affects every file operation path; must be changed together with ARCH-13 and accompanied by dual-backend consistency tests |
| ARCH-13 (dependency injection) | Same batch as ARCH-12; once done, injection-based tests for hooks/actions can be added |
| ARCH-19 (CSS Modules) | Needs a visual regression baseline; better done as a separate iteration with incremental migration |
| ARCH-20 remaining | Playwright smoke tests, the Electron build matrix, `npm audit`, and git initialization all need CI/repository permissions |
| Supplementary remaining | The `dependencies` field documentation and the shared vitest setup are not done |
| ARCH-05 sub-items | Isolation is currently achieved with "precise selectors + FileTree memo"; switching to a store split by id is a structural refactor with limited payoff, so it is deferred for now |
| ARCH-17 sub-items | A shared IPC contract module and `checkJs` need a cross-CJS/TS build solution; runtime validation covers it for now |

### 8.3 Compatibility and Migration Notes

- The session key is upgraded to `mdstudio.session.v3` (metadata + one record per document); on startup `v2` / `v1` are read and migrated automatically, with no manual action needed.
- Old document ids (`file:...` / `sample:...`) remain valid; new documents use uuid. Subsequent renames/moves no longer change the id.
- The `npm run preview` port changes from 4173 to **4174**, so it can run alongside `npm run dev`.
- CSP is injected only in production builds; `npm run dev` is unaffected.
- Desktop has `sandbox: true` enabled; preload and file operations must be verified on a real device before repackaging.

### 8.4 Verification Results

```text
npm run ci        ✅ lint / typecheck / 73 tests / check:electron / build
npm run check:electron  ✅ main / preload / workspaceFs syntax check
```

Build sizes:

```text
entry:  118.27 kB (gzip 36.93 kB)  ← before optimization 1,514.81 kB (gzip 494.85 kB)
first-screen JS total: ~288 kB gzip (React + CodeMirror + editor shell)
loaded on demand: vendor-markdown / vendor-highlight / PreviewPane / export pipeline / Mermaid diagrams
```

Verifications not yet performed: Electron on-device startup and file read/write regression, native file watching behavior on real macOS/Windows machines, browser interaction smoke tests, a 6,000-file workspace measurement, and on-device confirmation of desktop `sandbox: true` and CSP. These must be done before release.

## 9. Changelog

| Version | Date | Description |
| --- | --- | --- |
| v1.3 | 2026-11-10 | Completed the ARCH-14 hook split; added regression tests for switching workspaces / saving by id / pasting images; tests at 73 |
| v1.2 | 2026-11-10 | Completed the ARCH-07 in-memory copy wrap-up, ARCH-08 desktop native watching, and ARCH-09 per-document sessions; extracted the search index into a testable module |
| v1.1 | 2026-11-10 | Implemented stage 1, stage 2, and the low-risk P2 items per the checklist; updated the baseline and implementation status |
| v1.0 | 2026-11-10 | Compiled from a review of the 2.0.0 source: 20 optimization items + 5 engineering details |
