'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const IGNORED_NAMES = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '.cache',
  '.DS_Store',
]);
const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mdown', '.mkd', '.txt']);
const IMAGE_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.jfif': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.apng': 'image/apng',
};
const MAX_FILES = 6000;
const MAX_READ_SIZE = 10 * 1024 * 1024;
const MAX_ASSET_SIZE = 25 * 1024 * 1024;

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Math.max(1, Math.min(limit, items.length));
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await mapper(items[index], index);
      }
    }),
  );
  return results;
}

class WorkspaceFs {
  constructor(rootPath) {
    this.rootPath = path.resolve(rootPath);
    this.name = path.basename(this.rootPath);
    this.realRootPath = this.rootPath;
  }

  async initialize() {
    const stat = await fs.stat(this.rootPath);
    if (!stat.isDirectory()) throw new Error('Workbench path is not a folder.');
    // 以真实路径为准，后续所有越界检查都与它比较，避免符号链接绕过。
    this.realRootPath = await fs.realpath(this.rootPath);
    return this;
  }

  resolveRelative(relativePath = '') {
    const normalized = String(relativePath).replaceAll('\\', '/').replace(/^\/+/, '');
    const absolute = path.resolve(this.rootPath, normalized);
    const relative = path.relative(this.rootPath, absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Path escapes the workspace.');
    }
    return absolute;
  }

  /**
   * 对目标（或最近的已存在祖先）做 realpath，确认解析后的路径仍在工作区内。
   * 这一步专门防御“工作区内指向外部的符号链接”。
   */
  async assertInsideWorkspace(absolutePath) {
    let probe = absolutePath;
    for (;;) {
      let real;
      try {
        real = await fs.realpath(probe);
      } catch (error) {
        if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
        const parent = path.dirname(probe);
        if (parent === probe) {
          throw new Error('Path escapes the workspace.', { cause: error });
        }
        probe = parent;
        continue;
      }
      const relative = path.relative(this.realRootPath, real);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('Path escapes the workspace.');
      }
      return;
    }
  }

  toRelative(absolutePath) {
    return path.relative(this.rootPath, absolutePath).split(path.sep).join('/');
  }

  async exists(relativePath) {
    try {
      await fs.access(this.resolveRelative(relativePath));
      return true;
    } catch {
      return false;
    }
  }

  async scan() {
    const counters = { files: 0, markdown: 0 };
    const readDirectory = async (directoryPath, parentPath, depth) => {
      if (depth > 12) return [];
      let entries;
      try {
        entries = await fs.readdir(directoryPath, { withFileTypes: true });
      } catch {
        return [];
      }
      const nodes = await mapLimit(entries, 16, async (entry) => {
        if (counters.files >= MAX_FILES) return null;
        if (IGNORED_NAMES.has(entry.name) || entry.name.startsWith('.')) return null;
        const absolute = path.join(directoryPath, entry.name);
        const relative = this.toRelative(absolute);
        if (entry.isDirectory()) {
          const children = await readDirectory(absolute, relative, depth + 1);
          return { kind: 'directory', name: entry.name, path: relative, children };
        }
        if (!entry.isFile()) return null;
        const stat = await fs.stat(absolute).catch(() => null);
        if (!stat) return null;
        counters.files += 1;
        const extension = path.extname(entry.name).toLowerCase();
        if (MARKDOWN_EXTENSIONS.has(extension)) counters.markdown += 1;
        return {
          kind: 'file',
          name: entry.name,
          path: relative,
          extension,
          size: stat.size,
          lastModified: stat.mtimeMs,
        };
      });
      return nodes.filter(Boolean).sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' });
      });
    };

    return {
      name: this.name,
      tree: await readDirectory(this.rootPath, '', 0),
      fileCount: counters.markdown,
    };
  }

  async readTextFile(relativePath) {
    const absolute = this.resolveRelative(relativePath);
    await this.assertInsideWorkspace(absolute);
    const stat = await fs.stat(absolute);
    if (!stat.isFile()) throw new Error('Target is not a file.');
    if (stat.size > MAX_READ_SIZE) throw new Error('File exceeds the 10 MB editor limit.');
    const content = await fs.readFile(absolute, 'utf8');
    return { content, lastModified: stat.mtimeMs };
  }

  async writeTextFile(relativePath, content) {
    const absolute = this.resolveRelative(relativePath);
    await this.assertInsideWorkspace(absolute);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, String(content), 'utf8');
    const stat = await fs.stat(absolute);
    return { lastModified: stat.mtimeMs };
  }

  async createDirectory(relativePath) {
    const absolute = this.resolveRelative(relativePath);
    await this.assertInsideWorkspace(absolute);
    await fs.mkdir(absolute, { recursive: true });
  }

  async removeEntry(relativePath) {
    const absolute = this.resolveRelative(relativePath);
    if (absolute === this.rootPath) throw new Error('Cannot remove the workspace root.');
    await this.assertInsideWorkspace(absolute);
    await fs.rm(absolute, { recursive: true, force: false });
  }

  async renameEntry(oldRelativePath, newRelativePath) {
    const source = this.resolveRelative(oldRelativePath);
    const destination = this.resolveRelative(newRelativePath);
    if (source === destination) return;
    await this.assertInsideWorkspace(source);
    await this.assertInsideWorkspace(destination);
    if (await this.exists(newRelativePath)) throw new Error('Target already exists.');
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.rename(source, destination);
  }

  async saveImage(directory, fileName, data) {
    const safeName = path.basename(String(fileName));
    if (!Object.keys(IMAGE_MIME).some((extension) => safeName.toLowerCase().endsWith(extension))) {
      throw new Error('Unsupported image format.');
    }
    const directoryAbsolute = this.resolveRelative(directory || 'assets');
    await this.assertInsideWorkspace(directoryAbsolute);
    await fs.mkdir(directoryAbsolute, { recursive: true });
    const absolute = path.join(directoryAbsolute, safeName);
    const relativeCheck = path.relative(this.rootPath, absolute);
    if (relativeCheck.startsWith('..') || path.isAbsolute(relativeCheck)) {
      throw new Error('Image path escapes the workspace.');
    }
    await fs.writeFile(absolute, Buffer.from(data));
    return { path: this.toRelative(absolute) };
  }

  async readAssetDataUrl(relativePath) {
    const absolute = this.resolveRelative(relativePath);
    await this.assertInsideWorkspace(absolute);
    const stat = await fs.stat(absolute).catch(() => null);
    if (!stat || !stat.isFile() || stat.size > MAX_ASSET_SIZE) return null;
    const extension = path.extname(absolute).toLowerCase();
    const mime = IMAGE_MIME[extension];
    if (!mime) return null;
    const data = await fs.readFile(absolute);
    return `data:${mime};base64,${data.toString('base64')}`;
  }

  async readMarkdownFiles() {
    const snapshot = await this.scan();
    const markdownNodes = [];
    const walk = (nodes) => {
      for (const node of nodes) {
        if (node.kind === 'directory') walk(node.children);
        else if (MARKDOWN_EXTENSIONS.has(node.extension)) markdownNodes.push(node);
      }
    };
    walk(snapshot.tree);

    const files = await mapLimit(markdownNodes, 8, async (node) => {
      try {
        const result = await this.readTextFile(node.path);
        return { path: node.path, content: result.content, lastModified: result.lastModified };
      } catch {
        // Skip unreadable files; search should still work for the rest.
        return null;
      }
    });
    return files.filter(Boolean);
  }
}

module.exports = { WorkspaceFs, MARKDOWN_EXTENSIONS, IGNORED_NAMES };
