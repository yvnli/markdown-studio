'use strict';

const { app, BrowserWindow, Menu, dialog, ipcMain, session, shell } = require('electron');
const fs = require('node:fs/promises');
const { watch: watchFs } = require('node:fs');
const path = require('node:path');
const { WorkspaceFs, IGNORED_NAMES } = require('./workspaceFs.cjs');

const isMac = process.platform === 'darwin';
const DEV_URL = process.env.ELECTRON_START_URL || '';
const ALLOWED_PERMISSIONS = new Set(['clipboard-sanitized-write']);
let mainWindow = null;
let workspace = null;
let workspaceWatcher = null;
let watchTimer = null;

app.setName('Markdown studio');

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

function configPath() {
  return path.join(app.getPath('userData'), 'last-workspace.json');
}

async function writeLastWorkspace(rootPath) {
  try {
    await fs.mkdir(path.dirname(configPath()), { recursive: true });
    await fs.writeFile(configPath(), JSON.stringify({ path: rootPath }, null, 2), 'utf8');
  } catch (error) {
    console.warn('Could not persist last workspace:', error);
  }
}

async function readLastWorkspacePath() {
  try {
    const parsed = JSON.parse(await fs.readFile(configPath(), 'utf8'));
    return typeof parsed.path === 'string' ? parsed.path : null;
  } catch {
    return null;
  }
}

function isIgnoredWatchPath(filename) {
  const parts = String(filename).split(/[\\/]/);
  return parts.some((part) => part.startsWith('.') || IGNORED_NAMES.has(part));
}

function stopWorkspaceWatcher() {
  if (watchTimer) {
    clearTimeout(watchTimer);
    watchTimer = null;
  }
  if (workspaceWatcher) {
    workspaceWatcher.close();
    workspaceWatcher = null;
  }
}

function scheduleWorkspaceChanged() {
  if (watchTimer) clearTimeout(watchTimer);
  watchTimer = setTimeout(() => {
    watchTimer = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('workspace:changed');
    }
  }, 250);
}

/**
 * 原生文件监听只负责“通知”，具体扫描仍由渲染层统一执行（与 Web 轮询共用一条路径）。
 * 递归监听在部分平台不可用，失败时静默退回 5 秒轮询。
 */
function startWorkspaceWatcher(instance) {
  stopWorkspaceWatcher();
  try {
    workspaceWatcher = watchFs(instance.rootPath, { recursive: true }, (_event, filename) => {
      if (filename && isIgnoredWatchPath(filename)) return;
      scheduleWorkspaceChanged();
    });
    workspaceWatcher.on('error', () => stopWorkspaceWatcher());
  } catch {
    workspaceWatcher = null;
  }
}

async function adoptWorkspace(rootPath, persist = true) {
  const instance = await new WorkspaceFs(rootPath).initialize();
  const previous = workspace;
  workspace = instance;
  if (previous && previous !== instance) stopWorkspaceWatcher();
  startWorkspaceWatcher(instance);
  if (persist) await writeLastWorkspace(instance.rootPath);
  return instance;
}

function requireWorkspace() {
  if (!workspace) throw new Error('No workspace is open.');
  return workspace;
}

function assertString(value, label) {
  if (typeof value !== 'string') throw new Error(`Invalid ${label}.`);
  return value;
}

/**
 * 只接受来自主窗口主 frame 的 IPC，避免被嵌入的 iframe 或其它 webContents 调用。
 */
function isTrustedSender(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents) return false;
  return event.senderFrame === event.sender.mainFrame;
}

function handle(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedSender(event)) throw new Error('Unauthorized IPC sender.');
    return handler(event, ...args);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 880,
    minHeight: 620,
    show: false,
    backgroundColor: '#f5f5f7',
    title: 'Markdown studio',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 16, y: 20 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  // 默认拒绝一切导航；只有显式标记为外部链接的 http(s) 交给系统浏览器。
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (mainWindow && url === mainWindow.webContents.getURL()) return;
    event.preventDefault();
    if (/^https?:/i.test(url)) void shell.openExternal(url);
  });

  if (DEV_URL) {
    void mainWindow.loadURL(DEV_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerIpcHandlers() {
  handle('workspace:choose', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '打开 Markdown 工作区',
      buttonLabel: '打开工作区',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const instance = await adoptWorkspace(result.filePaths[0]);
    return { name: instance.name };
  });

  handle('workspace:last', async () => {
    if (workspace) return { name: workspace.name };
    const lastPath = await readLastWorkspacePath();
    if (!lastPath) return null;
    try {
      const instance = await adoptWorkspace(lastPath, false);
      return { name: instance.name };
    } catch {
      return null;
    }
  });

  handle('workspace:forget', async () => {
    stopWorkspaceWatcher();
    workspace = null;
    await fs.rm(configPath(), { force: true }).catch(() => undefined);
  });

  handle('workspace:scan', async () => {
    return requireWorkspace().scan();
  });

  handle('workspace:read', async (_event, relativePath) => {
    return requireWorkspace().readTextFile(assertString(relativePath, 'path'));
  });

  handle('workspace:write', async (_event, relativePath, content) => {
    return requireWorkspace().writeTextFile(
      assertString(relativePath, 'path'),
      assertString(content, 'content'),
    );
  });

  handle('workspace:exists', async (_event, relativePath) => {
    return requireWorkspace().exists(assertString(relativePath, 'path'));
  });

  handle('workspace:mkdir', async (_event, relativePath) => {
    await requireWorkspace().createDirectory(assertString(relativePath, 'path'));
  });

  handle('workspace:remove', async (_event, relativePath) => {
    await requireWorkspace().removeEntry(assertString(relativePath, 'path'));
  });

  handle('workspace:rename', async (_event, oldPath, newPath) => {
    await requireWorkspace().renameEntry(
      assertString(oldPath, 'source path'),
      assertString(newPath, 'target path'),
    );
  });

  handle('workspace:save-image', async (_event, payload) => {
    if (!payload || typeof payload.directory !== 'string' || typeof payload.fileName !== 'string') {
      throw new Error('Invalid image payload.');
    }
    const data = payload.data instanceof ArrayBuffer
      ? Buffer.from(new Uint8Array(payload.data))
      : Buffer.from(payload.data);
    return requireWorkspace().saveImage(payload.directory, payload.fileName, data);
  });

  handle('workspace:asset-data-url', async (_event, relativePath) => {
    return requireWorkspace().readAssetDataUrl(assertString(relativePath, 'path'));
  });

  handle('workspace:read-markdown-files', async () => {
    return requireWorkspace().readMarkdownFiles();
  });
}

function installMenu() {
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: '文件',
      submenu: [
        {
          label: '打开文件夹…',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('menu:open-folder'),
        },
        { role: 'close' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: '显示',
      submenu: [
        { role: 'toggleDevTools', visible: !app.isPackaged },
        { type: 'separator', visible: !app.isPackaged },
        { role: 'reload', visible: !app.isPackaged },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function startupWorkspaceArgument() {
  const equalsArg = process.argv.find((argument) => argument.startsWith('--workspace='));
  if (equalsArg) return equalsArg.slice('--workspace='.length);
  const index = process.argv.indexOf('--workspace');
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return process.env.MARKDOWN_STUDIO_WORKSPACE || null;
}

function installDownloadHandler() {
  session.defaultSession.on('will-download', (_event, item) => {
    try {
      item.pause();
    } catch {
      // 已经结束的下载直接忽略。
      return;
    }
    void dialog
      .showSaveDialog(mainWindow, {
        title: '保存导出文件',
        defaultPath: path.join(app.getPath('downloads'), item.getFilename()),
        buttonLabel: '保存',
      })
      .then((result) => {
        if (result.canceled || !result.filePath) {
          item.cancel();
          return;
        }
        item.setSavePath(result.filePath);
        item.resume();
      })
      .catch(() => item.cancel());
  });
}

function installPermissionHandlers() {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) =>
    ALLOWED_PERMISSIONS.has(permission),
  );
}

if (hasSingleInstanceLock) {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    const startupPath = startupWorkspaceArgument();
    if (startupPath) {
      try {
        await adoptWorkspace(startupPath);
      } catch (error) {
        console.error('Unable to open startup workspace:', error);
      }
    } else {
      const lastPath = await readLastWorkspacePath();
      if (lastPath) {
        try {
          await adoptWorkspace(lastPath, false);
        } catch (error) {
          console.warn('Unable to restore workspace:', error);
        }
      }
    }

    registerIpcHandlers();
    installMenu();
    installPermissionHandlers();
    installDownloadHandler();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (!isMac) app.quit();
  });

  app.on('before-quit', stopWorkspaceWatcher);
}
