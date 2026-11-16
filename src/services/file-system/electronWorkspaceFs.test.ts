import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { DirectoryNode, FileNode } from '../../types/workspace';

interface NativeWorkspaceFs {
  rootPath: string;
  name: string;
  initialize(): Promise<NativeWorkspaceFs>;
  scan(): Promise<{ name: string; tree: Array<FileNode | DirectoryNode>; fileCount: number }>;
  readTextFile(path: string): Promise<{ content: string; lastModified: number }>;
  writeTextFile(path: string, content: string): Promise<{ lastModified: number }>;
  createDirectory(path: string): Promise<void>;
  removeEntry(path: string): Promise<void>;
  renameEntry(oldPath: string, newPath: string): Promise<void>;
  saveImage(directory: string, fileName: string, data: Buffer): Promise<{ path: string }>;
  readAssetDataUrl(path: string): Promise<string | null>;
  readMarkdownFiles(): Promise<Array<{ path: string; content: string }>>;
  resolveRelative(path: string): string;
}

const require = createRequire(import.meta.url);
const { WorkspaceFs } = require('../../../electron/workspaceFs.cjs') as {
  WorkspaceFs: new (rootPath: string) => NativeWorkspaceFs;
};

function flatten(nodes: Array<FileNode | DirectoryNode>): string[] {
  return nodes.flatMap((node) =>
    node.kind === 'file' ? [node.path] : [node.path, ...flatten(node.children)],
  );
}

describe('native WorkspaceFs (Electron)', () => {
  let root: string;
  let fs: NativeWorkspaceFs;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'markdown-studio-'));
    await mkdir(path.join(root, 'notes'));
    await writeFile(path.join(root, 'README.md'), '# Home\n\nSearch target.\n', 'utf8');
    await writeFile(path.join(root, 'notes', 'alpha.md'), '# Alpha\n', 'utf8');
    await writeFile(path.join(root, 'cover.png'), Buffer.from([137, 80, 78, 71]));
    fs = await new WorkspaceFs(root).initialize();
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('scans directories and counts Markdown files', async () => {
    const snapshot = await fs.scan();
    expect(snapshot.name).toBe(path.basename(root));
    expect(snapshot.fileCount).toBe(2);
    expect(flatten(snapshot.tree)).toEqual(['notes', 'notes/alpha.md', 'cover.png', 'README.md']);
  });

  it('reads and writes text and supports CRUD', async () => {
    expect((await fs.readTextFile('README.md')).content).toContain('Search target');
    await fs.writeTextFile('README.md', '# Changed\n');
    expect(await readFile(path.join(root, 'README.md'), 'utf8')).toBe('# Changed\n');
    await fs.createDirectory('drafts');
    await fs.writeTextFile('drafts/new.md', '# New\n');
    await fs.renameEntry('drafts/new.md', 'drafts/renamed.md');
    await expect(fs.readTextFile('drafts/new.md')).rejects.toThrow();
    expect((await fs.scan()).fileCount).toBe(3);
    await fs.removeEntry('drafts');
    expect((await fs.scan()).fileCount).toBe(2);
  });

  it('saves images and returns data URLs', async () => {
    const saved = await fs.saveImage('assets', 'image_test.png', Buffer.from([1, 2, 3]));
    expect(saved.path).toBe('assets/image_test.png');
    expect(await fs.readAssetDataUrl(saved.path)).toMatch(/^data:image\/png;base64,/);
  });

  it('serves data URLs for the extended image formats', async () => {
    await writeFile(path.join(root, 'cover.avif'), Buffer.from([1, 2, 3]));
    await writeFile(path.join(root, 'cover.bmp'), Buffer.from([1, 2, 3]));
    await writeFile(path.join(root, 'cover.ico'), Buffer.from([1, 2, 3]));
    expect(await fs.readAssetDataUrl('cover.avif')).toMatch(/^data:image\/avif;base64,/);
    expect(await fs.readAssetDataUrl('cover.bmp')).toMatch(/^data:image\/bmp;base64,/);
    expect(await fs.readAssetDataUrl('cover.ico')).toMatch(/^data:image\/x-icon;base64,/);
  });

  it('collects Markdown content for search', async () => {
    const files = await fs.readMarkdownFiles();
    expect(files.map((file) => file.path).sort()).toEqual(['README.md', 'notes/alpha.md']);
  });

  it('rejects path traversal outside the workspace', () => {
    expect(() => fs.resolveRelative('../outside.txt')).toThrow(/escapes/);
    expect(() => fs.resolveRelative('/etc/passwd')).not.toThrow();
    expect(fs.resolveRelative('/etc/passwd')).toBe(path.join(root, 'etc', 'passwd'));
  });

  it.skipIf(process.platform === 'win32')(
    'rejects reads and writes that escape through a symlink',
    async () => {
      const outside = await mkdtemp(path.join(tmpdir(), 'markdown-studio-outside-'));
      await writeFile(path.join(outside, 'secret.txt'), 'top secret', 'utf8');
      try {
        await symlink(outside, path.join(root, 'escape'));
        await expect(fs.readTextFile('escape/secret.txt')).rejects.toThrow(/escapes/);
        await expect(fs.readAssetDataUrl('escape/secret.png')).rejects.toThrow(/escapes/);
        await expect(fs.writeTextFile('escape/new.md', '# nope')).rejects.toThrow(/escapes/);
        const snapshot = await fs.scan();
        expect(flatten(snapshot.tree)).not.toContain('escape');
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    },
  );
});
