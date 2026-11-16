'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const bridge = {
  isElectron: true,
  platform: process.platform,
  chooseWorkspace: () => ipcRenderer.invoke('workspace:choose'),
  getLastWorkspace: () => ipcRenderer.invoke('workspace:last'),
  forgetWorkspace: () => ipcRenderer.invoke('workspace:forget'),
  scanWorkspace: () => ipcRenderer.invoke('workspace:scan'),
  readFile: (path) => ipcRenderer.invoke('workspace:read', path),
  writeFile: (path, content) => ipcRenderer.invoke('workspace:write', path, content),
  exists: (path) => ipcRenderer.invoke('workspace:exists', path),
  createDirectory: (path) => ipcRenderer.invoke('workspace:mkdir', path),
  removeEntry: (path) => ipcRenderer.invoke('workspace:remove', path),
  renameEntry: (oldPath, newPath) => ipcRenderer.invoke('workspace:rename', oldPath, newPath),
  saveImage: (payload) => ipcRenderer.invoke('workspace:save-image', payload),
  readAssetDataUrl: (path) => ipcRenderer.invoke('workspace:asset-data-url', path),
  readMarkdownFiles: () => ipcRenderer.invoke('workspace:read-markdown-files'),
  onWorkspaceChanged: (callback) => {
    if (globalThis.__mdstudioWorkspaceChangedListener) {
      ipcRenderer.removeListener('workspace:changed', globalThis.__mdstudioWorkspaceChangedListener);
    }
    const listener = () => callback();
    globalThis.__mdstudioWorkspaceChangedListener = listener;
    ipcRenderer.on('workspace:changed', listener);
  },
  offWorkspaceChanged: () => {
    if (globalThis.__mdstudioWorkspaceChangedListener) {
      ipcRenderer.removeListener('workspace:changed', globalThis.__mdstudioWorkspaceChangedListener);
      globalThis.__mdstudioWorkspaceChangedListener = null;
    }
  },
  onOpenFolder: (callback) => {
    if (globalThis.__mdstudioOpenFolderListener) {
      ipcRenderer.removeListener('menu:open-folder', globalThis.__mdstudioOpenFolderListener);
    }
    const listener = () => callback();
    globalThis.__mdstudioOpenFolderListener = listener;
    ipcRenderer.on('menu:open-folder', listener);
  },
  offOpenFolder: () => {
    if (globalThis.__mdstudioOpenFolderListener) {
      ipcRenderer.removeListener('menu:open-folder', globalThis.__mdstudioOpenFolderListener);
      globalThis.__mdstudioOpenFolderListener = null;
    }
  },
};

contextBridge.exposeInMainWorld('markdownStudioDesktop', bridge);
