import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceService } from './workspaceService';
import type { DirectoryNode, FileNode } from '../../types/workspace';

class FakeFileHandle {
  kind = 'file' as const;
  name: string;
  private content: BlobPart;
  private type: string;
  private modified: number;

  constructor(name: string, content: BlobPart = '', type = 'text/markdown') {
    this.name = name;
    this.content = content;
    this.type = type;
    this.modified = Date.now();
  }

  async queryPermission() {
    return 'granted' as PermissionState;
  }

  async requestPermission() {
    return 'granted' as PermissionState;
  }

  async getFile() {
    return new File([this.content], this.name, { type: this.type, lastModified: this.modified });
  }

  async createWritable() {
    return {
      write: async (data: BlobPart) => {
        this.content = data;
        this.modified = Date.now() + 1;
      },
      close: async () => undefined,
    };
  }
}

class FakeDirectoryHandle {
  kind = 'directory' as const;
  name: string;
  entries = new Map<string, FakeFileHandle | FakeDirectoryHandle>();

  constructor(name: string) {
    this.name = name;
  }

  async queryPermission() {
    return 'granted' as PermissionState;
  }

  async requestPermission() {
    return 'granted' as PermissionState;
  }

  async *values() {
    for (const entry of this.entries.values()) yield entry;
  }

  async getFileHandle(name: string, options: { create?: boolean } = {}) {
    const existing = this.entries.get(name);
    if (existing) {
      if (existing.kind !== 'file') throw new DOMException('Not a file', 'TypeMismatchError');
      return existing;
    }
    if (!options.create) throw new DOMException('Not found', 'NotFoundError');
    const created = new FakeFileHandle(name);
    this.entries.set(name, created);
    return created;
  }

  async getDirectoryHandle(name: string, options: { create?: boolean } = {}) {
    const existing = this.entries.get(name);
    if (existing) {
      if (existing.kind !== 'directory') throw new DOMException('Not a directory', 'TypeMismatchError');
      return existing;
    }
    if (!options.create) throw new DOMException('Not found', 'NotFoundError');
    const created = new FakeDirectoryHandle(name);
    this.entries.set(name, created);
    return created;
  }

  async removeEntry(name: string) {
    if (!this.entries.delete(name)) throw new DOMException('Not found', 'NotFoundError');
  }

  addFile(name: string, content: string) {
    const file = new FakeFileHandle(name, content);
    this.entries.set(name, file);
    return file;
  }
}

function createRoot() {
  const root = new FakeDirectoryHandle('Vault');
  root.addFile('README.md', '# Vault\n\nOriginal text.');
  const notes = new FakeDirectoryHandle('notes');
  notes.addFile('alpha.md', '# Alpha\n\nSearch target.');
  root.entries.set('notes', notes);
  const assets = new FakeDirectoryHandle('assets');
  assets.addFile('photo.png', 'image');
  assets.addFile('my photo.png', 'image');
  root.entries.set('assets', assets);
  return root;
}

function flatten(nodes: Array<FileNode | DirectoryNode>): string[] {
  return nodes.flatMap((node) =>
    node.kind === 'file' ? [node.path] : [node.path, ...flatten(node.children)],
  );
}

describe('WorkspaceService', () => {
  let root: FakeDirectoryHandle;
  let service: WorkspaceService;

  beforeEach(() => {
    root = createRoot();
    vi.stubGlobal('window', {
      showDirectoryPicker: vi.fn(async () => root),
    });
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    });
    service = new WorkspaceService();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    service.clear();
  });

  it('opens a folder and scans a sorted tree', async () => {
    const snapshot = await service.openDirectory();
    expect(snapshot.name).toBe('Vault');
    expect(snapshot.fileCount).toBe(2);
    expect(flatten(snapshot.tree)).toEqual([
      'assets',
      'assets/my photo.png',
      'assets/photo.png',
      'notes',
      'notes/alpha.md',
      'README.md',
    ]);
  });

  it('reads and writes text files', async () => {
    await service.openDirectory();
    const initial = await service.readTextFile('README.md');
    expect(initial.content).toContain('Original text');
    const modified = await service.writeTextFile('README.md', '# Vault\n\nUpdated.');
    expect(modified).toBeGreaterThan(0);
    expect((await service.readTextFile('README.md')).content).toContain('Updated.');
  });

  it('creates, renames and deletes files and directories', async () => {
    await service.openDirectory();
    await service.createDirectory('drafts');
    await service.createFile('drafts/note.md', 'hello');
    expect((await service.readTextFile('drafts/note.md')).content).toBe('hello');
    await service.renameEntry('drafts/note.md', 'drafts/renamed.md');
    await expect(service.readTextFile('drafts/note.md')).rejects.toThrow();
    expect((await service.readTextFile('drafts/renamed.md')).content).toBe('hello');
    await service.deleteEntry('drafts');
    const snapshot = await service.scan();
    expect(flatten(snapshot.tree)).not.toContain('drafts');
  });

  it('saves pasted images into the configured asset directory', async () => {
    await service.openDirectory();
    const image = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    const saved = await service.saveImage(image, 'notes/alpha.md', 'assets', 'image/png');
    expect(saved.assetPath).toMatch(/^assets\/image_.*\.png$/);
    expect(saved.relativePath).toMatch(/^\.\.\/assets\/image_.*\.png$/);
    expect(await service.entryExists(saved.assetPath)).toBe(true);
  });

  it('resolves image sources relative to the document and workspace root', async () => {
    await service.openDirectory();
    expect(await service.resolveAssetObjectUrl('notes/alpha.md', '../assets/photo.png')).toBe(
      'blob:mock',
    );
    expect(await service.resolveAssetObjectUrl('README.md', './assets/my%20photo.png')).toBe(
      'blob:mock',
    );
    expect(await service.resolveAssetObjectUrl('notes/alpha.md', '/assets/photo.png')).toBe(
      'blob:mock',
    );
    // When missing, keep the original path and let the preview's path hint explain it.
    expect(await service.resolveAssetObjectUrl('notes/alpha.md', 'assets/photo.png')).toBe(
      'assets/photo.png',
    );
  });

  it('collects Markdown files for search and caches content', async () => {
    await service.openDirectory();
    const snapshot = await service.scan();
    const files = await service.collectMarkdownFiles(snapshot.tree);
    expect(files.map((file) => file.path)).toEqual(['notes/alpha.md', 'README.md']);
    expect(files[0].content).toContain('Search target');
  });
});
