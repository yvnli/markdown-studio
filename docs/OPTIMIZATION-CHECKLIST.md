# Markdown studio · 架构优化清单

- 版本：v1.1
- 整理日期：2026-11-10
- 实施更新：2026-11-10（阶段 1、阶段 2、低风险 P2 已落地；详见第 9 节）
- 对应评审基线：2.0.0（React 19 · TypeScript 6 · Vite 8 · CodeMirror 6 · Electron 45）
- 配套文档：[架构文档](./ARCHITECTURE.md) · [README](../README.md)
- 用途：按优先级拆解的**可勾选执行清单**，用于重构排期、Code Review 对照和验收

---

## 0. 基线数据与总体判断

### 0.1 评审时的基线

| 项目 | 评审时基线 | 优化后（2026-11-10） |
| --- | --- | --- |
| TS / TSX / CSS 代码量 | 13,630 行 | 15,693 行（新增领域层、会话层、拆分后的 hooks 与测试） |
| 测试 | 8 个文件 / 47 个用例 | **13 个文件 / 73 个用例**，全部通过 |
| 类型检查 / Lint | 通过 | 通过；`noUnusedLocals` 已开启，Electron CJS 纳入 lint |
| 构建 entry chunk | 1,514.81 kB（gzip 494.85 kB） | **118.27 kB（gzip 36.93 kB）**；首屏 JS 合计 gzip 约 288 kB |
| 最大动态 chunk | `elk` 1,498.94 kB | 不变（仅 Mermaid 路径加载，可接受） |
| 错误边界 | 无根级 ErrorBoundary | 根级 ErrorBoundary + 草稿备份导出 |
| 版本控制 | 不是 git 仓库 | 仍未初始化（见 ARCH-20 未完成项） |

### 0.2 总体判断

分层意图清晰：`components → app(store) → services → infrastructure`，双文件系统后端通过 `WorkspaceServiceContract` 抽象，重型依赖动态导入，搜索放入 Worker，主进程对相对路径做二次校验。

问题集中在四个方向，而非"缺少分层"：

1. **状态粒度**：所有文档挤在一个数组里，一次按键触发全局重渲染（ARCH-05）。
2. **服务边界**：单例 + 导入时选择实现 + UI 直连基础设施，导致不可测、双后端重复（ARCH-12、ARCH-13）。
3. **桌面进程职责**：Electron 主进程承担扫描/索引等重 I/O，安全面可再收紧（ARCH-04、ARCH-10）。
4. **数据安全语义**：切换工作区丢草稿、文档身份绑定可变路径（ARCH-01、ARCH-02）。

### 0.3 优先级定义

| 优先级 | 含义 | 处理要求 |
| --- | --- | --- |
| **P0** | 数据丢失、状态错乱、安全边界缺失 | 立即修复，不进入其它重构 |
| **P1** | 明显性能瓶颈或规模上限，随数据量线性恶化 | 本迭代内完成，优先 ARCH-05 / ARCH-07 |
| **P2** | 可维护性、可测试性、工程化欠债 | 排入后续迭代，可与功能并行 |

---

## 1. 优先级总览

| 编号 | 标题 | 优先级 | 类型 | 工作量 | 阶段 |
| --- | --- | --- | --- | --- | --- |
| ARCH-01 | 切换工作区静默丢弃未保存文档 | P0 | 数据安全 | S | 1 |
| ARCH-02 | 文档身份绑定可变路径 | P0 | 正确性 | M | 1 |
| ARCH-03 | 动作隐式依赖"当前激活文档" | P0 | 正确性 | S | 1 |
| ARCH-04 | Electron 安全面收紧 | P0 | 安全 | M | 3 |
| ARCH-05 | 每次按键/光标移动全应用重渲染 | P1 | 性能 | M | 2 |
| ARCH-06 | livePreview 重建整篇文档装饰 | P1 | 性能 | S | 2 |
| ARCH-07 | 搜索索引每次查询重新传输到 Worker | P1 | 性能/架构 | M | 2 |
| ARCH-08 | 5 秒轮询全量扫描，无单飞与 diff | P1 | 性能/规模 | S | 2 |
| ARCH-09 | 会话快照全量写 localStorage | P1 | 规模/数据 | M | 4 |
| ARCH-10 | Electron 主进程承担重 I/O | P1 | 性能 | M | 3 |
| ARCH-11 | 首屏 1.5 MB 单一 entry chunk | P1 | 性能 | S | 4 |
| ARCH-12 | 双文件系统后端重复实现 | P2 | 可维护性 | L | 3 |
| ARCH-13 | 服务单例、导入时选择、UI 直连基础设施 | P2 | 可测试性 | M | 3 |
| ARCH-14 | 动作层过载 + 树工具重复 | P2 | 可维护性 | M | 2 |
| ARCH-15 | 派生状态 `dirty` 手动维护 | P2 | 正确性/简化 | S | 2 |
| ARCH-16 | uiStore 混合关注点；无 ErrorBoundary；状态机不完整 | P2 | 可维护性/健壮性 | M | 4 |
| ARCH-17 | IPC 契约手写；Electron 代码不参与 lint | P2 | 工程化 | M | 3 |
| ARCH-18 | 死代码与契约膨胀 | P2 | 整洁度 | S | 4 |
| ARCH-19 | CSS 全局命名空间 3,200 行 | P2 | 可维护性 | L | 4 |
| ARCH-20 | 测试与 CI 结构失衡 | P2 | 工程化 | L | 4 |

> 工作量估算：S ≈ 0.5 天，M ≈ 1–2 天，L ≈ 3–5 天（单人熟悉代码的前提下）。

**建议顺序**：阶段 1（P0 数据/身份）→ 阶段 2（P1 渲染与搜索）→ 阶段 3（架构拆分 + 桌面安全）→ 阶段 4（工程化收尾）。

### 1.1 实施状态（2026-11-10）

| 状态 | 条目 |
| --- | --- |
| ✅ 实现完成（待真机/性能验证） | ARCH-01、02、03、04、06、07、08、09、11、14、15、18 |
| ◐ 部分完成 | ARCH-05（用 selector + memo 隔离重渲染，未改为按 id 切分的 store）、ARCH-10（并行 I/O 已完成，`utilityProcess` 未做）、ARCH-16（ErrorBoundary / Toast 已完成，store 拆分与状态机未做）、ARCH-17（入参校验与 CJS lint 已完成，共享契约 / `checkJs` 未做）、ARCH-20（单测 / CJS lint / 语法检查已完成，E2E / 桌面 CI / git 未做） |
| ⏸ 延后 | ARCH-12（Adapter 拆分）、ARCH-13（依赖注入）、ARCH-19（CSS Modules） |

> 只有真正落地的子项才勾选；需要真机、Profiler 或浏览器实测的验证项保持未勾选。第 8.4 节列出了尚未执行的验证。

---

## 2. P0 · 优先修复

### ARCH-01 切换工作区会静默丢弃未保存文档

- [x] 打开新工作区前收集 dirty 文档并阻断/提示
- [x] 提供"保存全部到原目录 / 下载副本 / 放弃"三选一
- [x] 恢复会话时按新工作区树过滤失效路径，转为 `detached` 草稿
- [ ] 补充回归用例：dirty 文档 + 切换工作区

**现状**：`switchWorkspace` 只保留 `scratch` 文档；`adoptWorkspace` 没有任何 dirty 检查。

**证据**：[workspaceStore.ts](../src/app/workspaceStore.ts#L227-L238)、[useWorkspaceActions.ts](../src/hooks/useWorkspaceActions.ts#L57-L72)

**影响**：打开另一个文件夹时，所有 `origin === 'workspace'` 的未保存内容直接消失，随后会话快照被覆盖，不可恢复。反向问题：`restoreWorkspaceSnapshot` 保留所有非 sample 文档，可能把**上一个工作区**的旧文档带入新工作区，路径已不存在却仍可编辑保存。

**建议**：在 `openFolder` 入口做 dirty 守卫（弹窗复用 `CloseDocumentDialog` 的交互模式）；`restoreWorkspaceSnapshot` 用新树校验路径，失效文档标记为 `detached` 草稿而非保持 workspace 身份。

**验收**：存在 dirty 工作区文档时切换工作区，必须出现确认；取消后原状态完全不变；确认按选择落盘或下载。

---

### ARCH-02 文档身份绑定可变路径

- [x] `DocumentTab.id` 改为创建时生成的稳定 uuid
- [x] `path` 降级为普通可写字段，维护 `pathToId` 索引
- [x] 重命名/移动只更新 `path`，不重建编辑器
- [x] 会话快照兼容旧 id 格式（迁移函数）

**现状**：`id: \`file:${path}\``；`updateDocumentPath` / `renameDocumentPaths` 会重写 `id`；编辑器以 `key={document.id}` 重建。

**证据**：[workspaceStore.ts](../src/app/workspaceStore.ts#L118)、[workspaceStore.ts](../src/app/workspaceStore.ts#L290-L319)、[EditorPane.tsx](../src/components/editor/EditorPane.tsx#L102-L104)

**影响**：改名或拖拽移动后 CodeMirror 实例被销毁重建，**撤销历史、选区、滚动位置、输入法状态全部丢失**；以 id 为键的异步操作（保存、粘贴、reveal）失配。

**建议**：id 与 path 解耦；`insert` 时生成 `doc_<uuid>`；`renameDocumentPaths` 只改 `path/title` 并用 `pathToId` 查找。

**验收**：重命名一个已打开文档后，撤销仍可回退、光标与滚动位置保持、tab 不闪烁。

---

### ARCH-03 动作隐式依赖"当前激活文档"

- [x] `saveActiveDocument()` → `saveDocument(id)`
- [x] `pasteImage(file)` → `pasteImage(file, documentId)`
- [x] `CloseDocumentDialog` 保存时使用传入的 `documentId`
- [x] `openNode` 增加 in-flight 去重（`Map<path, Promise>`）
- [ ] 补充并发用例：双击打开、粘贴期间切换 tab

**现状**：保存与粘贴都在执行时读取全局 active；关闭对话框关闭 A 却保存 active 文档；`openNode` 在 `await` 前后没有二次去重。

**证据**：[useWorkspaceActions.ts](../src/hooks/useWorkspaceActions.ts#L191-L233)、[useWorkspaceActions.ts](../src/hooks/useWorkspaceActions.ts#L258-L306)、[CloseDocumentDialog.tsx](../src/components/dialogs/CloseDocumentDialog.tsx#L19-L26)、[workspaceStore.ts](../src/app/workspaceStore.ts#L109-L133)

**影响**：异步粘贴期间切换 tab，图片路径按错误文档目录计算；双击文件可能开出重复 tab，产生两份竞争内容。

**建议**：动作签名显式带 `documentId`；`openPath`/`openNode` 复用进行中的 Promise，完成后再次检查文档是否已存在。

**验收**：粘贴大图期间切换 tab，markdown 仍插入发起时的文档；快速双击同一文件只出现一个 tab。

---

### ARCH-04 Electron 安全面收紧

- [ ] `sandbox` 改为 `true`（验证 preload 兼容）
- [x] 为渲染页添加 CSP（meta 或 `onHeadersReceived`）
- [x] `will-navigate` 改为默认拒绝，仅放行应用自身 URL
- [x] `workspaceFs.resolveRelative` 增加 `fs.realpath` + 前缀校验，阻断符号链接逃逸
- [x] IPC 校验 `event.senderFrame`，并用 schema 校验入参
- [x] 关闭未使用的权限（`setPermissionRequestHandler` 默认拒绝）
- [x] 加单实例锁，避免两个实例竞争 `last-workspace.json`

**现状**：`sandbox: false`；`index.html` 无 CSP；`will-navigate` 只拦截 `https?`；路径校验使用 `path.resolve`，不做 realpath；IPC 无 sender/schema 校验。

**证据**：[main.cjs](../electron/main.cjs#L60-L66)、[index.html](../index.html)、[main.cjs](../electron/main.cjs#L76-L82)、[workspaceFs.cjs](../electron/workspaceFs.cjs#L44-L52)、[preload.cjs](../electron/preload.cjs#L5-L35)

**影响**：沙箱与 CSP 缺失放大了渲染层漏洞的后果；非 http(s) 导航未被拦截；工作区内指向外部的符号链接可越界读取任意文件。

**建议**：开启 sandbox/CSP，导航默认 `deny`；`resolveRelative` 对最终路径 `realpath` 后与 `rootPath` 比较；IPC 增加 `senderFrame.url` 白名单和 zod 校验；`showSaveDialogSync`（[main.cjs](../electron/main.cjs#L235-L243)）改为异步，避免阻塞主进程。

**验收**：`electron` 下 DevTools Console 无 CSP 违规外无报错；构造 `workspace -> /etc` 符号链接后 `readFile('workspace/passwd')` 被拒绝；非 http(s) 导航被阻止。

---

## 3. P1 · 性能与规模

### ARCH-05 每次按键/光标移动全应用重渲染

- [ ] 文档内容改为按 id 切分的 store（`Map<string, DocSlice>`）
- [x] `activeDocumentId` 独立存放；选择器只返回原始值
- [ ] `updateCursor` 移出 `documents`，改独立轻量 store / ref
- [x] `FileTree` 加 `memo`，Sidebar 回调 `useCallback` 稳定
- [ ] Profiler 验证：打字时 FileTree render 次数 = 0

**现状**：`updateDocumentContent` 与 `updateCursor` 都 `documents.map(...)`，产生新数组和新 active 对象；App 的 selector 因此每次按键返回新对象；Sidebar 订阅 `documents` 并重建 `dirtyPaths`，FileTree 未 memo。

**证据**：[workspaceStore.ts](../src/app/workspaceStore.ts#L170-L189)、[App.tsx](../src/App.tsx#L36)、[Sidebar.tsx](../src/components/sidebar/Sidebar.tsx#L35-L53)、[FileTree.tsx](../src/components/sidebar/FileTree.tsx#L48)

**影响**：每敲一个字（以及每按一次方向键）都会重渲染 App 外壳和**整棵文件树**；文件树越大越明显，直接侵蚀"编辑体验优先"的架构目标。

**建议**：内容按文档切分订阅；选择器返回 `title`/`isDirty`/`activeId` 等原始值；光标单独存放；FileTree `memo` + 稳定回调。

**验收**：2,000 节点文件树 + 6.5 万字符文档，连续输入时 FileTree 不重渲染，React Profiler 单次提交 < 16 ms。

---

### ARCH-06 livePreview 重建整篇文档装饰

- [x] `syntaxTree(state).iterate` 限定到 `view.visibleRanges`（含活动行）
- [x] 非活动行装饰缓存，避免每次 selection 变化全量重建
- [x] 修正 [ARCHITECTURE.md](./ARCHITECTURE.md#L640-L648) 中"视口语法树"的表述

**现状**：对整棵语法树遍历，并在 `docChanged`/`selectionSet`/`viewportChanged` 时全量重建、全量排序。

**证据**：[livePreview.ts](../src/components/editor/livePreview.ts#L93-L142)、[livePreview.ts](../src/components/editor/livePreview.ts#L177-L181)

**影响**：长文档下每次光标移动都是 O(全文)，与文档中"装饰来自视口语法树"的说法不符（文档漂移）。

**建议**：按可见范围迭代；活动行单独计算；必要时对 selection 重建做节流。

**验收**：6.5 万字符文档中连续移动光标，单次 decoration 重建 < 5 ms（Performance 面板）。

---

### ARCH-07 搜索索引每次查询重新传输到 Worker

- [x] Worker 持有索引，新增 `init/update/query` 协议
- [x] 渲染层只发 `{query, options}`，不再发 `files`
- [x] 增量更新：文件增删改只发差量
- [x] `mergeOpenDocuments` 改为按路径覆盖，避免整体复制
- [x] 主线程只保留路径元数据，不保留正文副本

**现状**：`search()` 每次把全工作区 `files` 数组 postMessage 到 Worker；`SearchPanel` 在 220 ms 防抖后调用，且 `mergeOpenDocuments` 再复制一次数组。

**证据**：[searchClient.ts](../src/services/search/searchClient.ts#L38-L50)、[SearchPanel.tsx](../src/components/sidebar/SearchPanel.tsx#L143-L152)、[SearchPanel.tsx](../src/components/sidebar/SearchPanel.tsx#L484-L497)

**影响**：1,000 文件 × 数十 KB 意味着每次查询 MB 级结构化克隆，主线程长期持有第三份索引副本——这抵消了 Worker 的大部分收益。

**建议**：Worker 侧建索引；`SearchPanel` 只发查询；索引变化时发差量；未保存文档内容以增量覆盖。

**验收**：1,000 文件索引后，单次查询的 `postMessage` 负载 < 1 KB；查询耗时（不含索引）仍为毫秒级；主线程无 > 16 ms 长任务。

---

### ARCH-08 5 秒轮询全量扫描，无单飞与 diff

- [x] `refreshWorkspace` 加单飞锁（进行中则复用）
- [x] 扫描结果签名不变时保持原 `tree` 引用
- [x] 文件 stat 并发限流（如 8–16 并发）
- [x] 桌面端接入原生文件监听（`fs.watch` recursive，macOS 底层为 FSEvents；失败时退回轮询）
- [x] `signatureForTree` 仅在树真正变化时计算

**现状**：每 5 秒 `scan()`；Web 与桌面均串行 stat 每个文件；无 in-flight guard；每次 scan 返回新 `tree` 引用，触发 FileTree 重渲染和全量字符串签名拼接。

**证据**：[useWorkspaceActions.ts](../src/hooks/useWorkspaceActions.ts#L182-L189)、[workspaceService.ts](../src/services/file-system/workspaceService.ts#L128-L174)、[workspaceFs.cjs](../electron/workspaceFs.cjs#L67-L114)、[SearchPanel.tsx](../src/components/sidebar/SearchPanel.tsx#L499-L512)

**影响**：大目录下扫描超过 5 秒会叠加并发；周期性全量扫描持续消耗 CPU/IO 并触发无意义重渲染。

**建议**：单飞 + diff + 并发限流；Web 保留轮询（跨浏览器折中），桌面端换原生监听。

**验收**：6,000 文件工作区，扫描不重叠；树未变化时不触发 FileTree 重渲染。

---

### ARCH-09 会话快照全量写 localStorage

- [x] 迁移到 IndexedDB，按文档一条记录
- [x] 只持久化 dirty 与 scratch 文档的正文
- [x] `savedContent` 用 hash 或省略
- [x] 增加 schema 版本与迁移函数
- [x] 修正容量判断：按字节（`Blob`/`TextEncoder`）而非 `string.length`

**现状**：每 650 ms 把所有文档的 `content` + `savedContent`（双份）序列化进单个 key；用 UTF-16 字符数与 4.2 MB 字节上限比较。

**证据**：[useSessionPersistence.ts](../src/hooks/useSessionPersistence.ts#L97-L132)、[useSessionPersistence.ts](../src/hooks/useSessionPersistence.ts#L107)

**影响**：大文档 + 多标签时每次持久化产生长任务；中文场景按字符数判断会先撞上浏览器配额，触发"快照过大"提示并静默停止保存。

**建议**：IndexedDB 按文档存储，脏文档才写正文；启动时按需回填；版本化迁移。

**验收**：10 篇 200 KB 文档，编辑时持久化不产生 > 16 ms 主线程任务；刷新后可完整恢复未保存内容。

---

### ARCH-10 Electron 主进程承担重 I/O

- [ ] 扫描/索引迁移到 `utilityProcess`（或 Node Worker）
- [ ] `readMarkdownFiles` 改为流式进度事件
- [ ] `readFileMetadata` 使用 `fs.stat` 而非读全文
- [x] 文件读取并发化（主进程与 Web 后端一致）

**现状**：`readMarkdownFiles` 在 IPC 内先全量 scan、再顺序读取每个 Markdown；桌面端 `readFileMetadata` 读整个文件取 mtime。

**证据**：[workspaceFs.cjs](../electron/workspaceFs.cjs#L180-L200)、[desktopWorkspaceService.ts](../src/services/file-system/desktopWorkspaceService.ts#L83-L89)

**影响**：大工作区首次索引会阻塞主进程（窗口管理、菜单、下载），表现为界面卡顿甚至无响应。

**建议**：重 I/O 移出主进程，通过事件回传进度；元数据操作走 `stat`。

**验收**：6,000 文件工作区触发索引期间，窗口可正常拖动/缩放，菜单响应 < 100 ms。

---

### ARCH-11 首屏 1.5 MB 单一 entry chunk

- [x] `codeSplitting.groups`（替代已废弃的 `manualChunks`）拆分 react / codemirror / codemirror-markdown / markdown-parse / markdown-render / highlight
- [x] 预览面板或 `highlight.js` 按需加载
- [x] 首屏预算改为按“入口静态 import 图”检查：`initialChunkBudget` 插件对首屏 chunk 施加 500 kB 预算；全局 `chunkSizeWarningLimit` 放宽到 1600，只为 `elk.bundled.js`、Mermaid 解析器这类预打包单文件让路
- [x] 记录首屏 gzip 体积基线

**现状**：entry `index-*.js` 1,514.81 kB（gzip 494.85 kB）；CodeMirror、react-markdown/unified、KaTeX、`highlight.js/lib/common` 全部静态进主包；警告阈值被调到 1600 掩盖。

**证据**：[vite.config.ts](../vite.config.ts#L18-L20)、[CodeBlock.tsx](../src/components/preview/CodeBlock.tsx#L3)

**影响**：首屏解析/执行成本高，Web 端弱网和低端设备首屏时间受影响；缓存粒度粗，任意一处业务改动都会让整个 1.5 MB 缓存失效。

**建议**：vendor 分块 + 高亮库懒加载 + 恢复告警阈值。

**验收**：entry gzip < 250 kB；构建无 chunk 体积警告；首屏可交互时间不劣于当前 193 ms 基线（本地）。

---

## 4. P2 · 可维护性与工程化

### ARCH-12 双文件系统后端重复实现

- [ ] 定义 `FileSystemAdapter`（list/stat/read/write/move/remove/assetUrl）
- [ ] 实现 Web 与 Electron 两个薄适配器
- [ ] 扫描、缓存、树策略、资产命名收敛到单一 `WorkspaceService`
- [ ] 忽略目录 / 扩展名 / 大小上限抽到 `domain/workspacePolicy`
- [ ] 删除重复的 `relativeTo`（改用 `paths.relativePath`）
- [ ] 统一 `MarkdownPreview` 中的扩展名正则

**现状**：树构建、markdown 扩展名、忽略目录、10 MB 上限、缓存、相对路径解析、资产 URL 在 Web 与桌面各写一遍，另有第四份扩展名正则。

**证据**：[workspaceService.ts](../src/services/file-system/workspaceService.ts#L19-L47)、[desktopWorkspaceService.ts](../src/services/file-system/desktopWorkspaceService.ts#L10-L17)、[workspaceFs.cjs](../electron/workspaceFs.cjs#L6-L30)、[paths.ts](../src/utils/paths.ts#L1)、[MarkdownPreview.tsx](../src/components/preview/MarkdownPreview.tsx#L97)、[workspaceService.ts](../src/services/file-system/workspaceService.ts#L490-L496)

**影响**：策略改动需要同步 3–4 处，已出现 "10 MB 上限" 与 "markdown 扩展名" 的多份定义，容易漂移。

**建议**：Adapter 只负责"如何访问"，Service 负责"访问什么、怎么聚合"；策略常量单点定义，Electron 侧通过共享纯 JS 模块复用。

**验收**：新增一种忽略目录或扩展名只需改 1 处；两个后端的扫描结果在相同目录下逐字段一致（新增对比测试）。

---

### ARCH-13 服务单例、导入时选择、UI 直连基础设施

- [ ] `WorkspaceService` 通过 Provider 注入，而非模块级单例
- [ ] composition root（`main.tsx`）负责选择 Web/Electron 实现
- [ ] UI 组件不再 import `services/file-system`
- [ ] store 不直接调用文件服务
- [ ] 为 actions/store 补可注入 fake 的测试

**现状**：`index.ts` 在 import 时选择实现并导出单例；`workspaceStore`、`SearchPanel`、`MarkdownImage`、`exportPage` 都直接依赖它。

**证据**：[index.ts](../src/services/file-system/index.ts#L5-L12)、[workspaceStore.ts](../src/app/workspaceStore.ts#L8)、[SearchPanel.tsx](../src/components/sidebar/SearchPanel.tsx#L15)、[MarkdownImage.tsx](../src/components/preview/MarkdownImage.tsx#L3)、[exportPage.ts](../src/services/export/exportPage.ts#L6)

**影响**：store/hook 无法注入 fake，导致 47 个测试全部集中在纯函数与 service 层，动作编排与 store 一行未测；层级出现回环（domain/export → infrastructure）。

**建议**：定义端口接口，Provider 注入；UI 只消费 actions 上下文；测试用内存实现。

**验收**：`useWorkspaceActions` 与 `workspaceStore` 有覆盖保存/切换/粘贴/重命名的单元测试；测试中无需 `window.showDirectoryPicker`。

---

### ARCH-14 动作层过载 + 树工具重复

- [x] 拆分 `useWorkspaceLifecycle` / `useDocumentActions` / `useFileTreeActions` / `useAssetActions`
- [x] 轮询同步收敛到 `useWorkspaceLifecycle`
- [x] 新增 `domain/treeIndex.ts`（`byPath` Map）
- [x] 删除 7 份重复的树遍历实现
- [x] Sidebar 不再从 hook 文件 import 工具函数

**现状**：391 行 hook 承担 11 类职责，并导出 `findTreeNode` 被 Sidebar 反向依赖；树遍历在 7 处各写一遍。

**证据**：[useWorkspaceActions.ts](../src/hooks/useWorkspaceActions.ts)、[Sidebar.tsx](../src/components/sidebar/Sidebar.tsx#L17)、[useWorkspaceActions.ts](../src/hooks/useWorkspaceActions.ts#L18-L50)、[workspaceStore.ts](../src/app/workspaceStore.ts#L340-L350)、[SearchPanel.tsx](../src/components/sidebar/SearchPanel.tsx#L499-L512)、[FileTree.tsx](../src/components/sidebar/FileTree.tsx#L39-L41)

**影响**：文件职责边界模糊，改动面大；线性递归查找在 6,000 节点树上被高频调用。

**建议**：按职责拆 hook；`setTree` 时构建索引，查找变 O(1)。

**验收**：单个 action 文件 < 150 行；树查找无递归实现；Sidebar 只依赖 actions 上下文。

---

### ARCH-15 派生状态 `dirty` 手动维护

- [x] 移除持久化的 `dirty` 字段，改为 selector 派生
- [x] `DocumentTab` 拆分为 `DocumentRecord`（持久化）+ editor session（光标等临时态）
- [x] 清理未使用的 `DocumentDraft` 类型

**现状**：`dirty` 同时存在于类型与状态中，并在 4 处各自计算。

**证据**：[workspaceStore.ts](../src/app/workspaceStore.ts#L170-L218)、[useSessionPersistence.ts](../src/hooks/useSessionPersistence.ts#L62-L74)、[document.ts](../src/types/document.ts#L5-L34)

**影响**：新增写入路径若忘记同步派生字段，就会出现"内容已改但状态显示未保存"或反向漂移。

**建议**：只保留 `savedContent`，`isDirty = content !== savedContent` 由 selector 计算；临时状态与持久化状态分离。

**验收**：全仓库只有一处 dirty 判定逻辑；会话恢复后状态与内容一致。

---

### ARCH-16 uiStore 混合关注点；无 ErrorBoundary；状态机不完整

- [ ] 拆分 `dialogStore` / `toastStore` / `findStore`
- [ ] find 状态改为编辑器局部状态（或按 view 分片）
- [x] 增加根级 ErrorBoundary（含"导出当前草稿 / 重新加载"）
- [ ] 将 `workspaceStatus` 改为显式状态机，删除不可达的 `'error'`
- [x] toast 定时器在 dismiss 时清理

**现状**：`uiStore` 同时管理 dialog、toast、sidebar、7 个 find 字段、reveal 请求；全项目无根级错误边界；`'error'` 状态从未被设置。

**证据**：[uiStore.ts](../src/app/uiStore.ts#L13-L47)、[workspaceStore.ts](../src/app/workspaceStore.ts#L14)、[useWorkspaceActions.ts](../src/hooks/useWorkspaceActions.ts#L112-L141)

**影响**：任一渲染异常会白屏且无恢复路径；状态转换散落在 5 个 setter 中，难以推理"当前是否可操作"。

**建议**：按生命周期拆 store；状态机用 `idle → opening → connected | permission | failed`；根级兜底 UI。

**验收**：在预览组件中人为抛错，应用显示可恢复界面而非白屏；状态机有穷举测试。

---

### ARCH-17 IPC 契约手写；Electron 代码不参与 lint

- [ ] IPC 契约抽到共享模块（TS 类型 + 运行时 schema）
- [ ] 渲染层与主进程共用同一份定义
- [ ] `electron/*.cjs` 纳入 ESLint 与 `checkJs`
- [ ] CI 增加契约一致性检查

**现状**：`types/desktop.ts` 手工镜像 preload；`eslint.config.js` 只覆盖 `**/*.{ts,tsx}`；IPC 返回值形状靠约定。

**证据**：[desktop.ts](../src/types/desktop.ts#L30-L47)、[eslint.config.js](../eslint.config.js#L10)、[preload.cjs](../electron/preload.cjs#L5-L35)

**影响**：主进程与渲染层的字段增删不会被类型检查发现，属于典型的静默漂移点。

**建议**：共享 contract 模块 + zod 校验 + Electron 侧 lint。

**验收**：修改 IPC 返回字段时，渲染层类型检查或测试失败。

---

### ARCH-18 死代码与契约膨胀

- [x] 删除/接线：`addDocument`、`autoSaveDraft`/`setAutoSaveDraft`、`DocumentDraft`
- [x] 删除/接线：`readFileMetadata`、`invalidateCache`、`clear`、`forgetPersistedWorkspace`、`connectedName`
- [x] 删除/接线：`relativeAssetPath`、`humanFileSize`、`countMarkdownFiles`
- [x] `tsconfig` 开启 `noUnusedLocals` / `noUnusedParameters`
- [x] 评估 `WorkspaceServiceContract` 是否可收缩

**现状**：多处导出与契约方法无调用方；`autoSaveDraft` 在设置界面也没有入口；`DocumentDraft` 类型无人使用。

**证据**：[workspaceStore.ts](../src/app/workspaceStore.ts#L70-L85)、[preferencesStore.ts](../src/app/preferencesStore.ts#L12)、[types.ts](../src/services/file-system/types.ts#L15-L48)、[paths.ts](../src/utils/paths.ts#L44-L71)、[tsconfig.json](../tsconfig.json#L18-L19)

**影响**：契约面大于使用面，误导后续开发者；未使用代码在重构时增加迁移成本。

**建议**：先删后加；打开未使用检查自动兜底。

**验收**：`noUnusedLocals` 开启后零错误；契约方法全部有调用方或有明确"预留"注释。

---

### ARCH-19 CSS 全局命名空间 3,200 行

- [ ] 按组件迁移到 CSS Modules（优先 sidebar / editor / preview）
- [ ] 引入 stylelint 与命名规范
- [ ] 清理无引用选择器
- [ ] `tokens.css` 保持为唯一主题变量来源

**现状**：8 个全局 CSS 文件，`components.css` 795 行、`sidebar.css` 767 行、`editor.css` 707 行，类名全局共享。

**证据**：[components.css](../src/styles/components.css)、[sidebar.css](../src/styles/sidebar.css)、[editor.css](../src/styles/editor.css)、[preview.css](../src/styles/preview.css)

**影响**：样式泄漏与优先级冲突风险随功能增长；删除组件时难以判断样式是否可删。

**建议**：渐进式 CSS Modules；先处理改动最频繁的三块；导出页样式保持独立（当前已内联在 [exportPage.ts](../src/services/export/exportPage.ts#L8-L119)）。

**验收**：新增组件不引入新的全局类；样式文件可按组件删除而不影响其它区域。

---

### ARCH-20 测试与 CI 结构失衡

- [ ] 为 stores/hooks 补单元测试（依赖 ARCH-13 的注入能力）
- [ ] 为导出流水线补 HTML/DOCX 结构测试
- [ ] 增加 Playwright 冒烟：打开文件夹 → 编辑 → 保存 → 搜索 → 导出
- [ ] CI 增加 Electron 目录构建（至少 `electron-builder --dir`）
- [ ] 将 `electron/*.cjs` 纳入 lint；增加 `npm audit`
- [ ] 初始化 git 仓库并把 `dist/`、`release/`、`node_modules/` 排除

**现状**：47 个测试全部位于纯函数与 service 层；Electron main、store、hooks、导出、UI 交互均无测试；CI 仅在 Ubuntu 构建 Web。

**证据**：[.github/workflows/ci.yml](../.github/workflows/ci.yml)、[package.json](../package.json#L7-L23)

**影响**：ARCH-01～ARCH-15 的重构缺少安全网，只能靠手工回归；桌面端问题只能在发布前发现。

**建议**：先补"重构目标"相关的测试，再动代码；E2E 只覆盖关键路径。

**验收**：关键路径（打开/编辑/保存/搜索/导出/切换工作区）有自动化覆盖；PR 可看到测试数量与覆盖率变化。

---

### 补充：工程细节（低工作量，可随手做）

- [ ] `dependencies` 全空、运行时依赖都在 `devDependencies`（[package.json](../package.json#L24-L70)）：补充说明或改用 `bundleDependencies`，避免未来 CJS 运行时依赖漏打包
- [x] `dev` 与 `preview` 同为 4173（[vite.config.ts](../vite.config.ts#L7-L17)）：拆分端口，支持并行运行
- [ ] 引入共享 `vitest.setup.ts`，替代每个测试文件手写 `// @vitest-environment jsdom`
- [ ] 评估 `vite` 的 `test` 配置合并进 `vite.config.ts`，统一构建与测试入口
- [ ] `workspaceService.openDirectory` 的 `id` 与 IndexedDB key 加版本前缀，便于未来迁移

---

## 5. 建议的目标结构

```text
src/
├── domain/                    # 纯逻辑，零环境依赖
│   ├── document.ts            # DocumentRecord / 派生规则
│   ├── workspaceTree.ts       # byPath 索引、查找、扁平化
│   ├── workspacePolicy.ts     # 忽略目录、扩展名、大小上限
│   ├── paths.ts
│   └── markdown/              # stats、slug
├── infrastructure/
│   ├── fs/
│   │   ├── adapter.types.ts   # FileSystemAdapter 端口
│   │   ├── webAdapter.ts      # File System Access
│   │   ├── electronAdapter.ts # preload bridge
│   │   └── workspaceRepository.ts  # 扫描 / 缓存 / 树 / 资产策略
│   ├── session/               # IndexedDB 草稿存储
│   └── desktop/               # bridge client + 共享 IPC 契约
├── features/
│   ├── workspace/             # lifecycle / sync / fileTree 三个 hook
│   ├── editor/                # CodeMirror 边界、livePreview、find
│   ├── preview/               # 渲染组件
│   ├── search/                # worker 持有索引 + 增量协议
│   └── export/                # html / pdf / png / docx 流水线
├── app/                       # 纯状态：按文档切片的 store，无 I/O
└── ui/                        # 基础控件
```

三条必须成立的原则：

1. **store 里不准有 I/O**：文件读写只出现在 repository 与 actions 层。
2. **动作显式带 `documentId`**：禁止从全局 active 隐式推断目标文档。
3. **重活不放在 UI 线程与 Electron 主进程**：扫描、索引、排版、导出分别落在 Worker / utilityProcess / 离屏 DOM。

---

## 6. 分阶段路线图

| 阶段 | 目标 | 包含项 | 完成定义（DoD） | 预估 |
| --- | --- | --- | --- | --- |
| **1. 数据安全** | 消除不可逆的数据丢失与状态错乱 | ARCH-01、02、03 | 切换工作区有守卫；重命名不丢撤销栈；动作全部参数化；新增 6+ 回归用例 | 1–2 天 |
| **2. 编辑性能** | 让长文档与大文件树不退化 | ARCH-05、06、07、08、14、15 | FileTree 打字零重渲染；装饰为视口级；查询负载 < 1 KB；扫描单飞 | 2–4 天 |
| **3. 架构与桌面** | 可测试的服务边界 + 安全加固 | ARCH-04、10、12、13、17 | 服务可注入；双后端共用策略；Electron 开 sandbox/CSP；重 I/O 移出主进程 | 3–5 天 |
| **4. 工程收尾** | 降低长期维护成本 | ARCH-09、11、16、18、19、20 + 补充项 | 会话入 IndexedDB；entry gzip < 250 kB；ErrorBoundary；死代码清零；CI 覆盖关键路径 | 3–5 天 |

> 阶段之间存在依赖：ARCH-12/13 完成后再做 ARCH-20 的 store 测试成本最低；ARCH-05 与 ARCH-07 是阶段 2 的性价比最高项，建议同批完成。

---

## 7. 度量与验收

### 7.1 关键指标

| 指标 | 当前基线 | 目标 |
| --- | --- | --- |
| 6.5 万字符文档连续输入 long task | 0 条（本地） | 保持 0 条；单次提交 < 16 ms |
| 2,000 节点文件树打字时 FileTree 渲染 | 每次按键 1 次 | 0 次 |
| 1,000 文件搜索单次 `postMessage` 负载 | MB 级 | < 1 KB |
| 搜索查询耗时（不含索引） | 毫秒级 | 保持毫秒级 |
| entry chunk | 117.83 kB / gzip 36.83 kB（优化后） | < 700 kB / gzip < 250 kB ✅ |
| 6,000 文件工作区扫描期间窗口交互 | 未测 | 可拖动，菜单响应 < 100 ms |
| 会话持久化主线程任务 | 未测 | < 16 ms |
| 根级错误恢复 | 无 | 预览异常可恢复，不白屏 |

### 7.2 度量方法

- **渲染**：React DevTools Profiler 录制连续输入 5 秒，统计 FileTree 提交次数与单次提交时长。
- **装饰**：Performance 面板录制光标连续移动，查看 `livePreview` 相关长任务。
- **搜索**：在 `postMessage` 前后打印 `structuredClone` 估算大小；Worker 内 `performance.now()` 计时。
- **构建**：`npm run build` 后读取 `dist/assets` 体积与警告；对比 gzip 数值。
- **会话**：Performance 面板录制编辑 10 秒，筛选 > 16 ms 任务。
- **桌面**：6,000 文件工作区触发索引，同时拖动窗口/打开菜单，观察是否掉帧。

### 7.3 回归检查命令

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run desktop:dev     # 桌面交互回归
```

---

## 8. 实施记录（2026-11-10）

### 8.1 已落地

> 下表描述代码层的实际改动；其中部分条目仍有未完成子项或待验证项，统一列在 8.2 与 8.4。

| 条目 | 变更摘要 | 主要位置 |
| --- | --- | --- |
| ARCH-01 | 切换工作区前自动保存所有 dirty 文档；未连接时中止切换并提示；恢复时把不在新树中的文档转为离线草稿 | [useWorkspaceActions.ts](../src/hooks/useWorkspaceActions.ts)、[workspaceStore.ts](../src/app/workspaceStore.ts) |
| ARCH-02 | 文档 id 改为创建时生成的稳定 uuid；重命名/移动只更新 `path`，编辑器不再重建 | [workspaceStore.ts](../src/app/workspaceStore.ts) |
| ARCH-03 | `saveDocument(id)` / `pasteImage(file, documentId)`；关闭对话框按 id 保存；`openNode` 增加 in-flight 去重 | [useWorkspaceActions.ts](../src/hooks/useWorkspaceActions.ts)、[EditorPane.tsx](../src/components/editor/EditorPane.tsx) |
| ARCH-04 | `sandbox: true`；构建期注入 CSP；导航默认拒绝；`realpath` 防符号链接逃逸；IPC sender / 入参校验；权限默认拒绝；单实例锁；异步“另存为” | [main.cjs](../electron/main.cjs)、[workspaceFs.cjs](../electron/workspaceFs.cjs)、[vite.config.ts](../vite.config.ts) |
| ARCH-05 | App 不再订阅文档对象；Sidebar 只订阅原始值与 dirty 路径；FileTree `memo`；EditorTabs 用原始数组订阅；光标无变化不写 store | [App.tsx](../src/App.tsx)、[Sidebar.tsx](../src/components/sidebar/Sidebar.tsx)、[FileTree.tsx](../src/components/sidebar/FileTree.tsx)、[EditorTabs.tsx](../src/components/editor/EditorTabs.tsx) |
| ARCH-06 | 实时装饰遍历“视口 + 选区”窗口，并对重复 mark 去重 | [livePreview.ts](../src/components/editor/livePreview.ts) |
| ARCH-07 | Worker 常驻基准索引 + 覆盖层：`set-index` / `update-index` / `reset-overrides` / `matching-paths` / `search`；渲染层只保留路径列表，全部替换不再依赖主线程正文副本 | [searchIndex.ts](../src/services/search/searchIndex.ts)、[search.worker.ts](../src/workers/search.worker.ts)、[searchClient.ts](../src/services/search/searchClient.ts)、[SearchPanel.tsx](../src/components/sidebar/SearchPanel.tsx) |
| ARCH-08 | 轮询单飞；树签名不变时跳过状态更新；文件元数据有限并发（Web 12 / 桌面 16）；桌面端原生监听（250 ms 防抖 + 忽略目录）并经 `workspace:changed` 触发静默刷新 | [useWorkspaceActions.ts](../src/hooks/useWorkspaceActions.ts)、[workspaceService.ts](../src/services/file-system/workspaceService.ts)、[main.cjs](../electron/main.cjs)、[App.tsx](../src/App.tsx) |
| ARCH-09 | 会话 v3：元数据 + 每文档一条 IndexedDB 记录，按引用差异只写变化文档；pagehide 写 localStorage 备份；自动迁移 v1/v2；字符数估算上限 | [sessionStore.ts](../src/services/session/sessionStore.ts)、[useSessionPersistence.ts](../src/hooks/useSessionPersistence.ts) |
| ARCH-11 | vendor 分块（`codeSplitting.groups`）；PreviewPane / 导出流水线 / highlight.js 懒加载；首屏 500 kB 预算由 `initialChunkBudget` 插件把关（全局阈值 1600 仅为预打包单文件让路）；preview 端口改为 4174 | [vite.config.ts](../vite.config.ts)、[App.tsx](../src/App.tsx)、[ExportDialog.tsx](../src/components/dialogs/ExportDialog.tsx)、[CodeBlock.tsx](../src/components/preview/CodeBlock.tsx) |
| ARCH-14 | 新增 `domain/treeIndex.ts`（O(1) 查找 + 变更签名），删除 6 处重复遍历；`useWorkspaceActions` 拆为 lifecycle / document / file-tree 三个 hook + 共享 helper，轮询收敛到 lifecycle | [treeIndex.ts](../src/domain/treeIndex.ts)、[useWorkspaceActions.ts](../src/hooks/useWorkspaceActions.ts)、[workspace/](../src/hooks/workspace) |
| ARCH-15 | 删除持久化的 `dirty` 与 `DocumentDraft`，改为 `isDocumentDirty()` 派生 | [document.ts](../src/domain/document.ts)、[document.ts](../src/types/document.ts) |
| ARCH-16 | 根级 ErrorBoundary（含草稿备份导出）；Toast 定时器在 dismiss/裁剪时清理 | [ErrorBoundary.tsx](../src/components/ui/ErrorBoundary.tsx)、[uiStore.ts](../src/app/uiStore.ts) |
| ARCH-17 | IPC 入参类型校验 + sender 校验；`electron/*.cjs` 纳入 ESLint | [main.cjs](../electron/main.cjs)、[eslint.config.js](../eslint.config.js) |
| ARCH-18 | 删除 `addDocument`、`setWorkspace`、`updateDocumentPath`、`countMarkdownFiles`、`readFileMetadata`、`invalidateCache`、`forgetPersistedWorkspace`、`connectedName`、`relativeAssetPath`、`humanFileSize`、`autoSaveDraft` 等；开启 `noUnusedLocals/Parameters` | [tsconfig.json](../tsconfig.json)、文件系统契约 |
| ARCH-20 | 测试 47 → 73：新增 store、树索引、会话、搜索索引、工作区动作、符号链接逃逸测试；Electron CJS 纳入 lint 与 `check:electron` | [workspaceStore.test.ts](../src/app/workspaceStore.test.ts)、[useWorkspaceActions.test.tsx](../src/hooks/useWorkspaceActions.test.tsx)、[searchIndex.test.ts](../src/services/search/searchIndex.test.ts)、[sessionStore.test.ts](../src/services/session/sessionStore.test.ts) |

### 8.2 未完成项与延后原因

| 条目 | 原因 / 下一步 |
| --- | --- |
| ARCH-10（utilityProcess） | 已完成并行扫描与并行读取，但把索引移出主进程需要调整打包与生命周期，建议与 ARCH-13 同批做 |
| ARCH-12（Adapter 拆分） | 影响全部文件操作路径，需要与 ARCH-13 一起改并补双后端一致性测试 |
| ARCH-13（依赖注入） | 与 ARCH-12 同批；完成后可补 hooks/actions 的注入式测试 |
| ARCH-19（CSS Modules） | 需要视觉回归基线，建议独立迭代逐步迁移 |
| ARCH-20 剩余项 | Playwright 冒烟、Electron 构建矩阵、`npm audit`、git 初始化需要 CI/仓库权限 |
| 补充项剩余 | `dependencies` 字段说明、共享 vitest setup 未做 |
| ARCH-05 子项 | 当前用“精确 selector + FileTree memo”达成隔离；改成按 id 切分的 store 属于结构级重构，收益有限，暂不做 |
| ARCH-17 子项 | 共享 IPC 契约模块与 `checkJs` 需要跨 CJS/TS 构建方案，当前用运行时校验兜底 |

### 8.3 兼容性与迁移注意

- 会话键升级为 `mdstudio.session.v3`（元数据 + 每文档一条记录）；启动时自动读取并迁移 `v2` / `v1`，无需手工操作。
- 旧文档 id（`file:...` / `sample:...`）继续有效；新建文档使用 uuid。之后的重命名/移动不再改变 id。
- `npm run preview` 端口由 4173 改为 **4174**，可与 `npm run dev` 同时运行。
- CSP 只在生产构建注入，`npm run dev` 不受影响。
- 桌面端启用了 `sandbox: true`，重新打包前需在真机验证 preload 与文件操作。

### 8.4 验证结果

```text
npm run ci        ✅ lint / typecheck / 73 tests / check:electron / build
npm run check:electron  ✅ main / preload / workspaceFs 语法检查
```

构建体积：

```text
entry:  118.27 kB（gzip 36.93 kB）  ← 优化前 1,514.81 kB（gzip 494.85 kB）
首屏 JS 合计: 约 288 kB gzip（React + CodeMirror + 编辑器外壳）
按需加载: vendor-markdown / vendor-highlight / PreviewPane / 导出流水线 / Mermaid 图表
```

尚未执行的验证：Electron 真机启动与文件读写回归、原生文件监听在 macOS/Windows 的实机行为、浏览器交互冒烟、6,000 文件工作区实测、桌面端 `sandbox: true` 与 CSP 的实机确认。这些需要在发布前补做。

## 9. 变更记录

| 版本 | 日期 | 说明 |
| --- | --- | --- |
| v1.3 | 2026-11-10 | 完成 ARCH-14 hook 拆分；新增切换工作区 / 按 id 保存 / 粘贴图片回归测试；测试 73 |
| v1.2 | 2026-11-10 | 完成 ARCH-07 内存副本收尾、ARCH-08 桌面原生监听、ARCH-09 按文档会话；搜索索引抽为可测模块 |
| v1.1 | 2026-11-10 | 按清单实施阶段 1、阶段 2 与低风险 P2；更新基线与实施状态 |
| v1.0 | 2026-11-10 | 基于 2.0.0 源码评审整理，共 20 项优化 + 5 项工程细节 |
