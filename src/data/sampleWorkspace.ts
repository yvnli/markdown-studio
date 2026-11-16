import type { DocumentTab } from '../types/document';
import type { DirectoryNode, FileNode, TreeNode } from '../types/workspace';
import { getBaseName, getExtension, getFileName } from '../utils/paths';

export interface SampleFile {
  path: string;
  content: string;
}

const welcome = `# 把想法，安放在纸上

> 写作不是为了被看见，而是为了让某个模糊的念头，终于拥有轮廓。
>
> —— Markdown studio

欢迎来到 **Markdown studio**，一间遵循 Apple 视觉语言、专注而安静的 Markdown 写作室。左边落笔，右边成章；文字与排版之间，只隔一次呼吸。

---

## 从这里开始

1. 在左侧编辑区写下 Markdown 语法。
2. 打开“分屏”或“预览”，查看实时排版。
3. 使用工具栏或 \`⌘ / Ctrl\` 快捷键完成常见格式。
4. 打开本地文件夹后，文档会写回你的磁盘，而不是云端。

> **本地优先**：没有账号、没有上传、没有追踪。你的文字默认只属于你。

### 今天想写点什么？

- [x] 把一闪而过的念头记下来
- [x] 给它一个安静的段落
- [ ] 明天再回来，继续写完

## 富有表现力的内容

行内公式可以自然嵌进句子：质能方程 $E = mc^2$，或者一个更熟悉的求和：

$$
\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}
$$

Mermaid 会把代码块变成一张真正的图：

\`\`\`mermaid
flowchart LR
  A[模糊的想法] --> B{写下来}
  B --> C[清晰的段落]
  B --> D[继续修改]
  C --> E[完成]
  D --> B
\`\`\`

### 一张安静的表格

| 写作习惯 | 为什么有用 | 从今天开始 |
| :--- | :--- | ---: |
| 每天写一点 | 让思考保持流动 | 15 分钟 |
| 先写完再修改 | 降低开始的阻力 | 一次就好 |
| 定期回看 | 发现自己的变化 | 每周一次 |

### 代码也可以很安静

\`\`\`typescript
type Thought = {
  idea: string;
  clarity: "在写下来的那一刻发生";
};

const write = (thought: Thought) => thought.clarity;
\`\`\`

---

## 愿你写得自在

不需要一次写得完美。先把句子放在纸上，再慢慢让它长出结构。

*愿你的每一个句子，都抵达它该去的地方。*

*Markdown studio · Local first, always.*
`;

const syntax = `# Markdown 语法速查

## 标题与强调

使用 \`#\` 到 \`######\` 创建六个层级的标题。文本可以 **加粗**、*斜体*、~~删除~~，也可以写成 \`行内代码\`。

## 列表

- 无序列表
  - 支持嵌套
  - 支持连续书写
- 第二项

1. 有序列表
2. 自动续行
3. 按 Tab 可以缩进

- [ ] 待办事项
- [x] 已完成事项

## 引用与链接

> 引用适合承载一句重要的话，或者一段旁白。

[Markdown 指南](https://commonmark.org) · [公式与图表](公式与图表.md)

## 代码

\`\`\`javascript
const studio = {
  local: true,
  cloud: false,
  focus: "writing",
};
\`\`\`

## 分割线

---

一个简单的分割线，可以让长文有呼吸。
`;

const visuals = `# 公式与图表

## LaTeX

行内公式：$a^2 + b^2 = c^2$。

块级公式：

$$
\\int_{-\\infty}^{\\infty} e^{-x^2} \\, dx = \\sqrt{\\pi}
$$

矩阵与对齐：

$$
\\begin{aligned}
f(x) &= (x + 1)^2 \\\\
     &= x^2 + 2x + 1
\\end{aligned}
$$

## Mermaid 流程图

\`\`\`mermaid
flowchart TD
  Idea[想法] --> Draft[初稿]
  Draft --> Feedback{回看}
  Feedback -->|需要补充| Draft
  Feedback -->|足够清楚| Done[发布]
\`\`\`

## 时序图

\`\`\`mermaid
sequenceDiagram
  participant W as 作者
  participant E as 编辑器
  participant P as 预览
  W->>E: 输入 Markdown
  E->>P: 实时渲染
  P-->>W: 看到排版
\`\`\`

> 图表、公式与代码，都是文字的不同形态。
`;

const ideas = `# 灵感碎片

## 可以写下的问题

- 如果不需要向任何人证明，我会写什么？
- 哪个念头已经反复出现了一周？
- 今天有什么微小的瞬间值得保存？

## 三个开头

1. 我最近一直在想一件事。
2. 如果换一种说法，这件事会变成什么？
3. 此刻窗外很安静，而我想起……

> 不必等到想清楚再开始。开始本身，就是思考的一部分。

## 待整理

- [ ] 关于“慢写作”的片段
- [ ] 一篇没有结论的随笔
- [ ] 下周的阅读笔记
`;

const reading = `# 阅读清单

| 书名 | 状态 | 备注 |
| --- | --- | --- |
| 《写作这回事》 | 在读 | 重读关于工具箱的章节 |
| 《思考，快与慢》 | 待读 | 先读第一部分 |
| 《禅与摩托车维修艺术》 | 已读 | 想再读一遍 |

## 摘录

> 你无法在真空中写作。你只能在世界上写作。

## 下一步

- [ ] 每周整理一次摘录
- [ ] 为每本书写三句话
- [ ] 把笔记连接起来
`;

export const SAMPLE_FILES: SampleFile[] = [
  { path: '开始写作.md', content: welcome },
  { path: '指南/Markdown 语法.md', content: syntax },
  { path: '指南/公式与图表.md', content: visuals },
  { path: '笔记/灵感碎片.md', content: ideas },
  { path: '笔记/阅读清单.md', content: reading },
];

export const SAMPLE_WELCOME_PATH = SAMPLE_FILES[0].path;

export const SAMPLE_TREE: TreeNode[] = buildSampleTree();

export function buildDocumentFromSample(file: SampleFile, now = Date.now()): DocumentTab {
  return {
    id: `sample:${file.path}`,
    title: getBaseName(file.path),
    path: file.path,
    origin: 'sample',
    content: file.content,
    savedContent: file.content,
    lastModified: null,
    createdAt: now,
    cursorLine: 1,
    cursorColumn: 1,
  };
}

export function buildSampleTree(): TreeNode[] {
  const root: DirectoryNode = { kind: 'directory', name: '示例工作区', path: '', children: [] };
  for (const file of SAMPLE_FILES) {
    const parts = file.path.split('/');
    let current = root;
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      const isLeaf = index === parts.length - 1;
      const path = parts.slice(0, index + 1).join('/');
      if (isLeaf) {
        const node: FileNode = {
          kind: 'file',
          name: part,
          path,
          extension: getExtension(part),
          size: new Blob([file.content]).size,
          lastModified: 0,
        };
        current.children.push(node);
      } else {
        let directory = current.children.find(
          (node): node is DirectoryNode => node.kind === 'directory' && node.name === part,
        );
        if (!directory) {
          directory = { kind: 'directory', name: part, path, children: [] };
          current.children.push(directory);
        }
        current = directory;
      }
    }
  }
  sortTree(root.children);
  return root.children;
}

function sortTree(nodes: TreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name, 'zh-CN');
  });
  for (const node of nodes) {
    if (node.kind === 'directory') sortTree(node.children);
  }
}

export const SAMPLE_TITLE = getBaseName(SAMPLE_WELCOME_PATH);
export const SAMPLE_FILE_NAME = getFileName(SAMPLE_WELCOME_PATH);
