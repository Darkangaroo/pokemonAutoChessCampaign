const { app, BrowserWindow, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');

let mainWin, mongo, server;

const MONGO_PORT = 27018;                  // avoid conflicts
const APPDATA_DIR = app.getPath('userData');
const MONGO_DIR = path.join(APPDATA_DIR, 'mongo');
const DBPATH = path.join(MONGO_DIR, 'data');
const LOGDIR = path.join(APPDATA_DIR, 'logs');

function ensureDirs() {
  for (const p of [MONGO_DIR, DBPATH, LOGDIR]) {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  }
}

function waitForPort(port, host = '127.0.0.1', timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tryOnce = () => {
      const s = net.connect(port, host, () => { s.end(); resolve(true); });
      s.on('error', () => {
        s.destroy();
        if (Date.now() - start > timeoutMs) reject(new Error(port ${port} not ready));
        else setTimeout(tryOnce, 400);
      });
    };
    tryOnce();
  });
}

function startMongo() {
  const mongoBin = path.join(process.resourcesPath, 'mongodb', 'win64', 'mongod.exe');
  if (!fs.existsSync(mongoBin)) {
    throw new Error(mongod.exe not found at ${mongoBin});
  }
  const mout = fs.openSync(path.join(LOGDIR, 'mongod-out.log'), 'a');
  const merr = fs.openSync(path.join(LOGDIR, 'mongod-err.log'), 'a');

  mongo = spawn(mongoBin, [
    '--dbpath', DBPATH,
    '--port', String(MONGO_PORT),
    '--bind_ip', '127.0.0.1'
  ], { stdio: ['ignore', mout, merr], windowsHide: true });

  mongo.on('error', e => fs.appendFileSync(path.join(LOGDIR,'launcher.log'), mongod error: ${e}\n));
  mongo.on('exit', code => fs.appendFileSync(path.join(LOGDIR,'launcher.log'), mongod exited ${code}\n));
}

function startServer() {
  const serverEntry = path.join(process.resourcesPath, 'server', 'index.js');
  if (!fs.existsSync(serverEntry)) {
    throw new Error(server entry not found at ${serverEntry});
  }

  const out = fs.openSync(path.join(LOGDIR, 'server-out.log'), 'a');
  const err = fs.openSync(path.join(LOGDIR, 'server-err.log'), 'a');

  const env = {
    ...process.env,
    NODE_ENV: 'production',
    OFFLINE_MODE: '1',
    AUTO_BOTS: '1',
    PORT: '9000',
    MONGO_URI: mongodb://127.0.0.1:${MONGO_PORT}/dev,
    RESOURCES_PATH: process.resourcesPath,
  };

  server = spawn(process.execPath, [serverEntry], {
    cwd: process.resourcesPath, 
    env, stdio: ['ignore', out, err], windowsHide: true
  });

  server.on('error', e => fs.appendFileSync(path.join(LOGDIR,'launcher.log'), server error: ${e}\n));
  server.on('exit',  c => fs.appendFileSync(path.join(LOGDIR,'launcher.log'), server exited ${c}\n));
}



async function createWindow() {
  mainWin = new BrowserWindow({
    width: 1360,
    height: 820,
    show: true, // show immediately with a splash
    backgroundColor: '#121212',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  // simple splash while waiting for server
  await mainWin.loadURL('data:text/html,<body style="background:#121212;color:#ddd;font:16px sans-serif;padding:24px">Starting local server…</body>');

  try {
    await waitForPort(9000, '127.0.0.1', 40000);
    await mainWin.loadURL('http://127.0.0.1:9000');
  } catch (e) {
    dialog.showErrorBox('Server failed to start', String(e));
  }

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
    setTimeout(() => {
      startServer();
      createWindow();
    }, 800);
  });

  function cleanup() {
    try { if (server) server.kill(); } catch {}
    try { if (mongo) mongo.kill(); } catch {}
  }

  app.on('before-quit', cleanup);
  app.on('window-all-closed', () => { cleanup(); if (process.platform !== 'darwin') app.quit(); });
  app.on('activate', () => { if (mainWin === null) createWindow(); });
}
