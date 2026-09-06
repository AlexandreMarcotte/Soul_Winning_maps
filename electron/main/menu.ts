import { Menu, BrowserWindow, app, MenuItemConstructorOptions } from 'electron';

type WindowGetter = () => BrowserWindow | null;

function send(getWin: WindowGetter, channel: string): void {
  const win = getWin();
  win?.webContents.send(channel);
}

export function buildMenu(getWin: WindowGetter): void {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([{ role: 'appMenu' }] as MenuItemConstructorOptions[])
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Project…',
          accelerator: 'CmdOrCtrl+O',
          click: () => send(getWin, 'menu:open'),
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => send(getWin, 'menu:save'),
        },
        {
          label: 'Save As…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => send(getWin, 'menu:saveAs'),
        },
        { type: 'separator' },
        {
          label: 'Export PDF…',
          accelerator: 'CmdOrCtrl+E',
          click: () => send(getWin, 'menu:exportPdf'),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn', accelerator: 'CmdOrCtrl+Plus' },
        { role: 'zoomIn', accelerator: 'CmdOrCtrl+Shift+Plus', visible: false },
        { role: 'zoomIn', accelerator: 'CmdOrCtrl+=', visible: false },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: `About ${app.getName()}`,
          click: () => send(getWin, 'menu:about'),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
