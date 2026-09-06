import { ipcMain, dialog, shell, BrowserWindow, app } from 'electron';
import { promises as fs } from 'node:fs';
import { execSync, spawn } from 'node:child_process';
import { basename, dirname, join } from 'node:path';

const PROJECT_FILTER = [{ name: 'Canvass Project', extensions: ['canvass.json', 'json'] }];
const PDF_FILTER = [{ name: 'PDF', extensions: ['pdf'] }];

async function atomicWrite(path: string, data: string | Uint8Array): Promise<void> {
  const tmp = `${path}.${process.pid}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, path);
}

const DEFAULT_PROJECT_PATH = 'Json_maps_save/Soulwinning.canvass.json';
/** Default folder for the PDF save dialog, relative to the app (project) root. */
const DEFAULT_PDF_EXPORT_DIR = 'PDF_Soulwinning_Maps';
/** File in userData that remembers user paths between launches. */
const RECENT_FILE_NAME = 'recent.json';

interface RecentState {
  lastProjectPath?: string;
  lastPdfExportDir?: string;
}

function recentFilePath(): string {
  return join(app.getPath('userData'), RECENT_FILE_NAME);
}

async function readRecentState(): Promise<RecentState> {
  try {
    const raw = await fs.readFile(recentFilePath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<RecentState>;
    const out: RecentState = {};
    if (typeof parsed.lastProjectPath === 'string') out.lastProjectPath = parsed.lastProjectPath;
    if (typeof parsed.lastPdfExportDir === 'string') out.lastPdfExportDir = parsed.lastPdfExportDir;
    return out;
  } catch {
    return {};
  }
}

async function updateRecentState(patch: Partial<RecentState>): Promise<void> {
  try {
    const current = await readRecentState();
    const next = { ...current, ...patch };
    await atomicWrite(recentFilePath(), JSON.stringify(next));
  } catch {
    /* best-effort — losing the recent pointer is non-fatal */
  }
}

async function readRecentProjectPath(): Promise<string | null> {
  return (await readRecentState()).lastProjectPath ?? null;
}

async function writeRecentProjectPath(path: string): Promise<void> {
  await updateRecentState({ lastProjectPath: path });
}

async function readRecentPdfExportDir(): Promise<string | null> {
  return (await readRecentState()).lastPdfExportDir ?? null;
}

async function writeRecentPdfExportDir(dir: string): Promise<void> {
  await updateRecentState({ lastPdfExportDir: dir });
}

/** Open a PDF with a dedicated viewer on Linux, falling back to shell.openPath on other platforms. */
function openPdf(filePath: string): void {
  if (process.platform === 'linux') {
    const viewers = ['evince', 'okular', 'atril', 'xreader', 'mupdf'];
    for (const viewer of viewers) {
      try {
        execSync(`which ${viewer}`, { stdio: 'ignore' });
        spawn(viewer, [filePath], { detached: true, stdio: 'ignore' }).unref();
        return;
      } catch { /* viewer not installed, try next */ }
    }
  }
  shell.openPath(filePath);
}

export function registerIpcHandlers(): void {
  ipcMain.handle('project:loadDefault', async () => {
    const remembered = await readRecentProjectPath();
    if (remembered) {
      try {
        const json = await fs.readFile(remembered, 'utf-8');
        return { path: remembered, json };
      } catch {
        /* fall through to bundled default if the remembered file is gone */
      }
    }
    const filePath = join(app.getAppPath(), DEFAULT_PROJECT_PATH);
    try {
      const json = await fs.readFile(filePath, 'utf-8');
      return { path: filePath, json };
    } catch {
      return null;
    }
  });

  ipcMain.handle('project:open', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? undefined;
    const result = await dialog.showOpenDialog(win!, {
      title: 'Open canvass project',
      properties: ['openFile'],
      filters: PROJECT_FILTER,
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const path = result.filePaths[0];
    const json = await fs.readFile(path, 'utf-8');
    await writeRecentProjectPath(path);
    return { path, json };
  });

  ipcMain.handle('project:save', async (_evt, json: string, path: string | null) => {
    if (!path) {
      const win = BrowserWindow.getFocusedWindow() ?? undefined;
      const result = await dialog.showSaveDialog(win!, {
        title: 'Save canvass project',
        defaultPath: 'Soulwinning-26-05-02.canvass.json',
        filters: PROJECT_FILTER,
      });
      if (result.canceled || !result.filePath) return null;
      path = result.filePath;
    }
    await atomicWrite(path, json);
    await writeRecentProjectPath(path);
    return path;
  });

  ipcMain.handle('project:saveAs', async (_evt, json: string, suggestedName: string) => {
    const win = BrowserWindow.getFocusedWindow() ?? undefined;
    const result = await dialog.showSaveDialog(win!, {
      title: 'Save canvass project as',
      defaultPath: suggestedName,
      filters: PROJECT_FILTER,
    });
    if (result.canceled || !result.filePath) return null;
    await atomicWrite(result.filePath, json);
    await writeRecentProjectPath(result.filePath);
    return result.filePath;
  });

  ipcMain.handle('shell:showFile', (_evt, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle('project:autosave', async (_evt, json: string, path: string | null) => {
    const savePath = path ?? join(app.getPath('userData'), 'autosave.canvass.json');
    await atomicWrite(savePath, json);
    const today = new Date().toISOString().slice(0, 10);
    const base = basename(savePath).replace(/\.canvass\.json$/, '');
    const archivePath = join(dirname(savePath), 'Archive', `${base}-${today}.canvass.json`);
    await fs.mkdir(dirname(archivePath), { recursive: true });
    await atomicWrite(archivePath, json);
    return savePath;
  });

  ipcMain.handle('window:toggleFullscreen', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.setFullScreen(!win.isFullScreen());
  });

  ipcMain.handle('pdf:export', async (_evt, bytes: Uint8Array, defaultName: string) => {
    const win = BrowserWindow.getFocusedWindow() ?? undefined;
    const rememberedDir = await readRecentPdfExportDir();
    const baseDir = rememberedDir ?? join(app.getAppPath(), DEFAULT_PDF_EXPORT_DIR);
    const result = await dialog.showSaveDialog(win!, {
      title: 'Export PDF',
      defaultPath: join(baseDir, defaultName),
      filters: PDF_FILTER,
    });
    if (result.canceled || !result.filePath) return null;
    await fs.mkdir(dirname(result.filePath), { recursive: true });
    await atomicWrite(result.filePath, bytes);
    await writeRecentPdfExportDir(dirname(result.filePath));
    openPdf(result.filePath);
    return result.filePath;
  });
}
