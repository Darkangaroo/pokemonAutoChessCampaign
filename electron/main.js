// electron/main.js
const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWin;

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1360,
    height: 820,
    show: false,
    backgroundColor: '#121212',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // detect dev vs production
const isDev = !app.isPackaged;
const startURL = isDev
  ? 'http://localhost:9000'
  : `file://${path.join(__dirname, '..', 'app', 'dist', 'index.html')}`;

  mainWin.loadURL(startURL);
  mainWin.once('ready-to-show', () => mainWin.show());

  mainWin.on('closed', () => {
    mainWin = null;
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.focus();
    }
  });
  app.on('ready', createWindow);
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('activate', () => {
    if (mainWin === null) createWindow();
  });
}
