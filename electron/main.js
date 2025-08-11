// electron/main.js
const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let mainWin, mongo, server;

const MONGO_PORT = 27018; // avoid conflicts with local installs
const APPDATA_DIR = app.getPath('userData');
const MONGO_DIR = path.join(APPDATA_DIR, 'mongo');
const DBPATH = path.join(MONGO_DIR, 'data');

function ensureDirs() {
  if (!fs.existsSync(MONGO_DIR)) fs.mkdirSync(MONGO_DIR, { recursive: true });
  if (!fs.existsSync(DBPATH)) fs.mkdirSync(DBPATH, { recursive: true });
}

function startMongo() {
  // mongod.exe is packed via extraResources to process.resourcesPath/mongodb/win64
  const mongoBin = path.join(process.resourcesPath, 'mongodb', 'win64', 'mongod.exe');
  mongo = spawn(mongoBin, ['--dbpath', DBPATH, '--port', String(MONGO_PORT), '--bind_ip', '127.0.0.1'], {
    stdio: 'ignore',
    windowsHide: true
  });
  mongo.on('exit', code => console.log('mongod exited', code));
}

function startServer() {
  // Your server build should end up at server/dist/index.js (pack it via extraResources)
  const serverEntry = path.join(process.resourcesPath, 'server', 'dist', 'index.js');
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    OFFLINE_MODE: '1',  // your server should check this to skip auth and create Guest-*
    AUTO_BOTS: '1',     // auto-fill seats with bots
    PORT: '9000',
    MONGO_URI: `mongodb://127.0.0.1:${MONGO_PORT}/dev`,
  };
  // Use the current electron binary (Node) to run server JS
  server = spawn(process.execPath, [serverEntry], { env, stdio: 'ignore', windowsHide: true });
  server.on('exit', code => console.log('server exited', code));
}

async function createWindow() {
  const isDev = !app.isPackaged;

  mainWin = new BrowserWindow({
    width: 1360,
    height: 820,
    show: false,
    backgroundColor: '#121212',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  // In dev, you still hit your dev server. In prod, you also hit the local server.
  const startURL = isDev ? 'http://127.0.0.1:9000' : 'http://127.0.0.1:9000';

  // Small wait to let server boot
  await new Promise(r => setTimeout(r, 1200));
  await mainWin.loadURL(startURL);
  mainWin.once('ready-to-show', () => mainWin.show());

  mainWin.on('closed', () => { mainWin = null; });
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

  app.on('ready', () => {
    ensureDirs();
    startMongo();
    // tiny delay to ensure mongod is listening before server connects
    setTimeout(() => {
      startServer();
      createWindow();
    }, 800);
  });

  // Clean exit: kill server + mongod
  function cleanup() {
    try { if (server) server.kill(); } catch {}
    try { if (mongo) mongo.kill(); } catch {}
  }

  app.on('before-quit', cleanup);
  app.on('window-all-closed', () => { cleanup(); if (process.platform !== 'darwin') app.quit(); });
  app.on('activate', () => { if (mainWin === null) createWindow(); });
}
