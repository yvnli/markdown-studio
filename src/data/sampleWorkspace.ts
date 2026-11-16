import type { DocumentTab } from '../types/document';
import type { DirectoryNode, FileNode, TreeNode } from '../types/workspace';
import { getBaseName, getExtension, getFileName } from '../utils/paths';

export interface SampleFile {
  path: string;
  content: string;
}

const welcome = `# Put your thoughts on paper

> Writing is not about being seen. It is about giving a vague idea a shape of its own.
>
> — Markdown studio

Welcome to **Markdown studio**, a quiet, focused Markdown writing room inspired by Apple's visual language. Write on the left, watch it become a page on the right; between text and typography, there is only a breath.

---

## Start here

1. Write Markdown in the editor on the left.
2. Switch to "Split" or "Preview" to see the live layout.
3. Use the toolbar or \`⌘ / Ctrl\` shortcuts for common formatting.
4. Open a local folder, and your documents are written back to disk instead of the cloud.

> **Local first**: no account, no uploads, no tracking. Your words belong to you by default.

### What do you want to write today?

- [x] Capture a passing thought
- [x] Give it a quiet paragraph
- [ ] Come back tomorrow and finish it

## Expressive content

Inline math can sit naturally inside a sentence: mass–energy equivalence $E = mc^2$, or a more familiar sum:

$$
\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}
$$

Mermaid turns a code block into a real diagram:

\`\`\`mermaid
flowchart LR
  A[Vague idea] --> B{Write it down}
  B --> C[Clear paragraph]
  B --> D[Keep revising]
  C --> E[Done]
  D --> B
\`\`\`

### A quiet table

| Writing habit | Why it helps | Start today |
| :--- | :--- | ---: |
| Write a little every day | Keep your thinking moving | 15 minutes |
| Finish first, edit later | Lower the barrier to starting | Just once |
| Review regularly | Notice how you have changed | Once a week |

### Code can be quiet too

\`\`\`typescript
type Thought = {
  idea: string;
  clarity: "happens the moment you write it down";
};

const write = (thought: Thought) => thought.clarity;
\`\`\`

---

## May you write freely

You do not have to get it perfect in one pass. Put the sentence on paper first, then let it grow into structure.

*May every sentence of yours arrive where it belongs.*

*Markdown studio · Local first, always.*
`;

const syntax = `# Markdown Syntax

## Headings and emphasis

Use \`#\` through \`######\` to create six levels of headings. Text can be **bold**, *italic*, ~~struck through~~, or written as \`inline code\`.

## Lists

- Unordered list
  - Nested items
  - Continuous writing
- Second item

1. Ordered list
2. Continues automatically
3. Press Tab to indent

- [ ] To-do
- [x] Completed

## Quotes and links

> A quote is a good place for a sentence worth keeping, or a line of narration.

[Markdown Guide](https://commonmark.org) · [Math and Diagrams](<Math and Diagrams.md>)

## Code

\`\`\`javascript
const studio = {
  local: true,
  cloud: false,
  focus: "writing",
};
\`\`\`

## Divider

---

A simple divider gives a long piece room to breathe.
`;

const visuals = `# Math and Diagrams

## LaTeX

Inline math: $a^2 + b^2 = c^2$.

Block math:

$$
\\int_{-\\infty}^{\\infty} e^{-x^2} \\, dx = \\sqrt{\\pi}
$$

Matrices and alignment:

$$
\\begin{aligned}
f(x) &= (x + 1)^2 \\\\
     &= x^2 + 2x + 1
\\end{aligned}
$$

## Mermaid flowchart

\`\`\`mermaid
flowchart TD
  Idea[Idea] --> Draft[First draft]
  Draft --> Feedback{Review}
  Feedback -->|Needs work| Draft
  Feedback -->|Clear enough| Done[Publish]
\`\`\`

## Sequence diagram

\`\`\`mermaid
sequenceDiagram
  participant W as Writer
  participant E as Editor
  participant P as Preview
  W->>E: Type Markdown
  E->>P: Render live
  P-->>W: See the typeset page
\`\`\`

> Diagrams, formulas, and code are all different forms of text.
`;

const ideas = `# Sparks

## Questions worth writing about

- If I did not have to prove anything to anyone, what would I write?
- Which thought has been coming back for a week?
- What small moment today is worth keeping?

## Three openings

1. I have been thinking about one thing for a while.
2. If I said it another way, what would this become?
3. The window is quiet right now, and I remember…

> You do not have to wait until it is clear. Starting is part of thinking.

## To sort out

- [ ] Fragments about "slow writing"
- [ ] An essay with no conclusion
- [ ] Reading notes for next week
`;

const reading = `# Reading List

| Title | Status | Notes |
| --- | --- | --- |
| On Writing | Reading | Re-reading the toolbox chapter |
| Thinking, Fast and Slow | To read | Start with part one |
| Zen and the Art of Motorcycle Maintenance | Read | Want to read it again |

## Excerpts

> You cannot write in a vacuum. You can only write in the world.

## Next steps

- [ ] Organize excerpts once a week
- [ ] Write three sentences for every book
- [ ] Connect the notes
`;

export const SAMPLE_FILES: SampleFile[] = [
  { path: 'Start Writing.md', content: welcome },
  { path: 'Guides/Markdown Syntax.md', content: syntax },
  { path: 'Guides/Math and Diagrams.md', content: visuals },
  { path: 'Notes/Sparks.md', content: ideas },
  { path: 'Notes/Reading List.md', content: reading },
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
  const root: DirectoryNode = { kind: 'directory', name: 'Sample Workspace', path: '', children: [] };
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
    return a.name.localeCompare(b.name, 'en');
  });
  for (const node of nodes) {
    if (node.kind === 'directory') sortTree(node.children);
  }
}

export const SAMPLE_TITLE = getBaseName(SAMPLE_WELCOME_PATH);
export const SAMPLE_FILE_NAME = getFileName(SAMPLE_WELCOME_PATH);
