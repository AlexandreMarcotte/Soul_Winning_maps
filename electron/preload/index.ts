import { contextBridge, ipcRenderer } from 'electron';

const api = {
  loadDefaultProject: (): Promise<{ path: string; json: string } | null> =>
    ipcRenderer.invoke('project:loadDefault'),

  openProject: (): Promise<{ path: string; json: string } | null> =>
    ipcRenderer.invoke('project:open'),

  saveProject: (json: string, path: string | null): Promise<string | null> =>
    ipcRenderer.invoke('project:save', json, path),

  saveProjectAs: (json: string, suggestedName: string): Promise<string | null> =>
    ipcRenderer.invoke('project:saveAs', json, suggestedName),

  autosaveProject: (json: string, path: string | null): Promise<string> =>
    ipcRenderer.invoke('project:autosave', json, path),

  showFileInFolder: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('shell:showFile', filePath),

  exportPdf: (bytes: Uint8Array, defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke('pdf:export', bytes, defaultName),

  onMenu: (channel: 'open' | 'save' | 'saveAs' | 'exportPdf' | 'about', cb: () => void): (() => void) => {
    const event = `menu:${channel}`;
    const listener = (): void => cb();
    ipcRenderer.on(event, listener);
    return () => ipcRenderer.removeListener(event, listener);
  },

  toggleFullscreen: (): Promise<void> => ipcRenderer.invoke('window:toggleFullscreen'),

  onFullscreenChange: (cb: (isFullscreen: boolean) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, value: boolean): void => cb(value);
    ipcRenderer.on('window:fullscreen-changed', listener);
    return () => ipcRenderer.removeListener('window:fullscreen-changed', listener);
  },
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
