import { describe, expect, it } from 'vitest';
import {
  buildTreeIndex,
  findFileNode,
  findTreeNode,
  firstMarkdownFile,
  hasPath,
} from './treeIndex';
import type { TreeNode } from '../types/workspace';

function tree(): TreeNode[] {
  return [
    {
      kind: 'directory',
      name: 'notes',
      path: 'notes',
      children: [
        {
          kind: 'file',
          name: 'alpha.md',
          path: 'notes/alpha.md',
          extension: '.md',
          size: 12,
          lastModified: 100,
        },
        {
          kind: 'file',
          name: 'diagram.png',
          path: 'notes/diagram.png',
          extension: '.png',
          size: 2048,
          lastModified: 120,
        },
      ],
    },
    {
      kind: 'file',
      name: 'README.md',
      path: 'README.md',
      extension: '.md',
      size: 8,
      lastModified: 200,
    },
  ];
}

describe('buildTreeIndex', () => {
  it('indexes every node by path and collects files', () => {
    const index = buildTreeIndex(tree());
    expect(index.byPath.size).toBe(4);
    expect(index.files.map((file) => file.path)).toEqual([
      'notes/alpha.md',
      'notes/diagram.png',
      'README.md',
    ]);
    expect(index.markdownFiles.map((file) => file.path)).toEqual([
      'notes/alpha.md',
      'README.md',
    ]);
    expect(index.imageFiles.map((file) => file.path)).toEqual(['notes/diagram.png']);
    expect(hasPath(index, 'notes')).toBe(true);
    expect(hasPath(index, 'missing.md')).toBe(false);
  });

  it('returns typed lookups without recursive scans', () => {
    const index = buildTreeIndex(tree());
    expect(findFileNode(index, 'README.md')?.size).toBe(8);
    expect(findFileNode(index, 'notes')).toBeNull();
    expect(findTreeNode(index, 'notes')?.kind).toBe('directory');
    expect(firstMarkdownFile(index)?.path).toBe('notes/alpha.md');
  });

  it('changes signature when file metadata changes', () => {
    const first = buildTreeIndex(tree());
    const changed = tree();
    const directory = changed[0];
    if (directory.kind === 'directory') {
      const alpha = directory.children[0];
      if (alpha.kind === 'file') alpha.lastModified = 101;
    }
    const second = buildTreeIndex(changed);
    expect(second.signature).not.toBe(first.signature);
    expect(buildTreeIndex(tree()).signature).toBe(first.signature);
  });
});
