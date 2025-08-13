// electron/main.js
const { app, BrowserWindow, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');

let mainWin, mongo, server;
const isDev = !app.isPackaged;

// ---- Paths ----
const APPDATA_DIR = app.getPath('userData');
const LOGDIR = path.join(APPDATA_DIR, 'logs');
const MONGO_DIR = path.join(APPDATA_DIR, 'mongo');
const DBPATH = path.join(MONGO_DIR, 'data');

// ---- Ports / DB ----
const MONGO_PORT = 27028;        // avoid conflicts with a local mongod
const SERVER_PORT = 9000;
const DB_NAME = 'dev';

function ensureDirs() {
  for (const p of [LOGDIR, MONGO_DIR, DBPATH]) {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  }
}

function waitForPort(port, host = '127.0.0.1', timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const s = net.connect(port, host, () => { s.end(); resolve(true); });
      s.on('error', () => {
        s.destroy();
        if (Date.now() - start > timeoutMs) reject(new Error(`port ${host}:${port} not ready`));
        else setTimeout(tick, 300);
      });
    };
    tick();
  });
}

function logLine(file, line) {
  try { fs.appendFileSync(path.join(LOGDIR, file), `[${new Date().toISOString()}] ${line}\n`); } catch {}
}

function resolveMongoBin() {
  const devPath = path.join(__dirname, '..', 'resources', 'mongodb', 'win64', 'mongod.exe');
  const prodPath = path.join(process.resourcesPath, 'mongodb', 'win64', 'mongod.exe');
  if (fs.existsSync(isDev ? devPath : prodPath)) return isDev ? devPath : prodPath;
  if (fs.existsSync(prodPath)) return prodPath;
  throw new Error(`mongod.exe not found. Tried:\n${devPath}\n${prodPath}`);
}

function resolveServerEntry() {
  // Use the app server built by esbuild
  if (app.isPackaged) {
    const entry = path.join(
      process.resourcesPath, 'app.asar',
      'app', 'public', 'dist', 'server', 'app', 'index.js'
    );
    if (!fs.existsSync(entry)) throw new Error(`Missing server entry at ${entry}`);
    return entry;
  } else {
    const entry = path.join(__dirname, '..', 'app', 'public', 'dist', 'server', 'app', 'index.js');
    if (!fs.existsSync(entry)) throw new Error(`Missing server entry at ${entry}`);
    return entry;
  }
}

function startMongo() {
  const mongoBin = resolveMongoBin();
  const mout = fs.openSync(path.join(LOGDIR, 'mongod-out.log'), 'a');
  const merr = fs.openSync(path.join(LOGDIR, 'mongod-err.log'), 'a');

  const args = [
    '--dbpath', DBPATH,
    '--port', String(MONGO_PORT),
    '--bind_ip', '127.0.0.1',
    '--noauth',
    '--logpath', path.join(LOGDIR, 'mongod.log'),
    '--quiet'
  ];

  mongo = spawn(mongoBin, args, { stdio: ['ignore', mout, merr], windowsHide: true });
  mongo.on('error', e => logLine('launcher.log', `mongod error: ${e.message}`));
  mongo.on('exit', c => logLine('launcher.log', `mongod exited ${c}`));
}

// ---- NEW: seed bots once after Mongo is up ----
// seed "botv2" from db-commands/botv2.json (Extended JSON -> real BSON)
async function seedBotsOnce() {
  const log = (m) => logLine('launcher.log', m);
  try {
    const { MongoClient } = require('mongodb');
    const { EJSON } = require('bson'); // Extended JSON parser

    const uri = `mongodb://127.0.0.1:${MONGO_PORT}/${DB_NAME}`;
    const client = new MongoClient(uri);
    await client.connect();

    const db = client.db(DB_NAME);
    const col = db.collection('botv2'); // lowercase

    const count = await col.estimatedDocumentCount().catch(() => 0);
    if (count > 0) { log(`botv2 already has ${count} docs; skipping seed`); await client.close(); return; }

    // packaged & dev search paths
    const candidates = [
      path.join(process.resourcesPath, 'app.asar', 'db-commands', 'botv2.json'),
      path.join(process.resourcesPath, 'db-commands', 'botv2.json'),
      path.join(__dirname, '..', 'db-commands', 'botv2.json'),
    ];
    const jsonPath = candidates.find(p => fs.existsSync(p));
    if (!jsonPath) { log(`botv2.json not found. Tried:\n${candidates.join('\n')}`); await client.close(); return; }

    const raw = fs.readFileSync(jsonPath, 'utf8');

    // Use EJSON so "$oid", "$date", etc. become ObjectId/Date
    let docs = EJSON.parse(raw, { relaxed: false });

    // Some exports wrap the array, try common keys
    if (!Array.isArray(docs)) {
      if (Array.isArray(docs.documents)) docs = docs.documents;
      else if (Array.isArray(docs.data)) docs = docs.data;
      else docs = [docs];
    }

    if (!docs.length) { log('botv2.json parsed but no documents found'); await client.close(); return; }

    try {
      await col.insertMany(docs, { ordered: false });
      const after = await col.estimatedDocumentCount();
      log(`Seeded botv2 with ${after} docs from ${jsonPath}`);
    } catch (e) {
      // ignore dup keys but surface other errors
      if (e && e.code === 11000) {
        const after = await col.estimatedDocumentCount();
        log(`botv2 insert had duplicates, current count=${after}`);
      } else {
        throw e;
      }
    }

    await client.close();
  } catch (e) {
    logLine('launcher.log', `Seed bots error: ${e.stack || e}`);
  }
}

function startServer() {
  const serverEntry = resolveServerEntry();
  const out = fs.openSync(path.join(LOGDIR, 'server-out.log'), 'a');
  const err = fs.openSync(path.join(LOGDIR, 'server-err.log'), 'a');

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',  // run Electron as Node for the spawned script
    NODE_ENV: 'production',
    OFFLINE_MODE: '1',
    AUTO_BOTS: process.env.AUTO_BOTS || '1',
    PORT: String(SERVER_PORT),
    MONGO_URI: `mongodb://127.0.0.1:${MONGO_PORT}/${DB_NAME}`,
    RESOURCES_PATH: process.resourcesPath  // handy if server code needs it
  };

  server = spawn(process.execPath, [serverEntry], {
    cwd: app.isPackaged ? process.resourcesPath : path.dirname(serverEntry),
    env,
    stdio: ['ignore', out, err],
    windowsHide: true
  });

  server.on('error', e => logLine('launcher.log', `server spawn error: ${e.message}`));
  server.on('exit', (code, sig) => logLine('launcher.log', `server exited ${code} ${sig || ''}`));
}

async function createWindow() {
  mainWin = new BrowserWindow({
    width: 1360,
    height: 820,
    backgroundColor: '#121212',
    show: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });

  await mainWin.loadURL(
    'data:text/html,<body style="background:#121212;color:#ddd;font:16px sans-serif;padding:24px">Starting local services…</body>'
  );

  try {
    await waitForPort(SERVER_PORT, '127.0.0.1', 45000);
    await mainWin.loadURL(`http://127.0.0.1:${SERVER_PORT}`);
  } catch (e) {
    dialog.showErrorBox('Server failed to start', String(e));
    logLine('launcher.log', `Window load error: ${e.message}`);
  }

  mainWin.on('closed', () => { mainWin = null; });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.on('second-instance', () => {
    if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.focus(); }
  });

  app.on('ready', async () => {
    ensureDirs();
    try {
      startMongo();
      await waitForPort(MONGO_PORT, '127.0.0.1', 30000);
      await seedBotsOnce();            // <-- NEW: seed bots if collection empty
    } catch (e) {
      dialog.showErrorBox('MongoDB failed to start', String(e));
      logLine('launcher.log', `Mongo start error: ${e.message}`);
      return;
    }

    try { startServer(); }
    catch (e) {
      dialog.showErrorBox('Server bootstrap error', String(e));
      logLine('launcher.log', `Server bootstrap error: ${e.message}`);
      return;
    }

    await createWindow();
  });

  function cleanup() {
    try { if (server && !server.killed) server.kill('SIGINT'); } catch {}
    try { if (mongo && !mongo.killed) mongo.kill('SIGINT'); } catch {}
  }

  app.on('before-quit', cleanup);
  app.on('window-all-closed', () => { cleanup(); if (process.platform !== 'darwin') app.quit(); });
  app.on('activate', () => { if (mainWin === null) createWindow(); });
}
