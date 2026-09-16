const {app, BrowserWindow, Menu, dialog, session, ipcMain} = require('electron');
const {spawn, spawnSync, execFileSync} = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const PACKAGED = app.isPackaged;
const ENGINE = PACKAGED
  ? path.join(process.resourcesPath, 'engine')
  : path.resolve(__dirname, '..', '..');
const USER_DATA = PACKAGED ? app.getPath('userData') : ENGINE;
const API_HOST = '127.0.0.1';
const API_PORT = Number(process.env.API_PORT || 8777);
const VITE_URL = process.env.ELECTRON_START_URL || 'http://127.0.0.1:5288';
const API_ORIGIN = `http://${API_HOST}:${API_PORT}`;

let apiProcess = null;
let mainWindow = null;
let spawnedByUs = false;
let restarting = false;

function exists(file) {
  try {
    return fs.existsSync(file);
  } catch {
    return false;
  }
}

function pythonCmd() {
  if (process.env.PYTHON) return process.env.PYTHON;
  if (process.platform === 'win32') {
    const bundled = [
      path.join(ENGINE, 'python', 'python.exe'),
      path.join(ENGINE, 'python', 'Scripts', 'python.exe'),
    ];
    const found = bundled.find(exists);
    if (found) return found;
    return 'python';
  }
  const bundled = [path.join(ENGINE, 'python', 'bin', 'python3'), path.join(ENGINE, 'python', 'bin', 'python')];
  const found = bundled.find(exists);
  if (found) return found;
  return 'python3';
}

function extraPath() {
  const parts = [
    path.join(ENGINE, 'ffmpeg'),
    path.join(ENGINE, 'node'),
    path.join(ENGINE, 'node', 'bin'),
  ];
  return parts.filter(exists).join(path.delimiter);
}

function apiEnv() {
  const env = {
    ...process.env,
    PYTHONUNBUFFERED: '1',
    KOUBO_ENGINE: ENGINE,
    KOUBO_USER_DATA: USER_DATA,
    HF_ENDPOINT: process.env.HF_ENDPOINT || 'https://hf-mirror.com',
    PIP_INDEX_URL: process.env.PIP_INDEX_URL || 'https://pypi.tuna.tsinghua.edu.cn/simple',
    PIP_EXTRA_INDEX_URL: process.env.PIP_EXTRA_INDEX_URL || 'https://mirrors.aliyun.com/pytorch-wheels/cpu',
    PUPPETEER_DOWNLOAD_BASE_URL:
      process.env.PUPPETEER_DOWNLOAD_BASE_URL || 'https://cdn.npmmirror.com/binaries/chrome-for-testing',
  };
  if (PACKAGED) {
    env.KOUBO_ENGINE = ENGINE;
    env.KOUBO_USER_DATA = USER_DATA;
  } else {
    delete env.KOUBO_ENGINE;
    delete env.KOUBO_USER_DATA;
  }
  const prefix = extraPath();
  if (prefix) env.PATH = `${prefix}${path.delimiter}${env.PATH || ''}`;
  return env;
}

function pingHealth() {
  return new Promise((resolve) => {
    const req = http.get(`${API_ORIGIN}/api/health`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForApi(timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await pingHealth()) return;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`后端未在 ${API_PORT} 端口就绪`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pidsOnPort(port) {
  const pids = new Set();
  if (process.platform === 'win32') {
    try {
      const out = execFileSync('netstat', ['-ano', '-p', 'TCP'], {encoding: 'utf8', windowsHide: true});
      const needle = `:${port}`;
      for (const line of out.split(/\r?\n/)) {
        if (!line.includes(needle) || !/LISTENING/i.test(line)) continue;
        const pid = line.trim().split(/\s+/).pop();
        if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
      }
    } catch {
      /* ignore */
    }
    return [...pids];
  }
  try {
    const out = execFileSync('lsof', ['-ti', `tcp:${port}`], {encoding: 'utf8'});
    for (const pid of out.split(/\s+/)) {
      if (/^\d+$/.test(pid)) pids.add(pid);
    }
  } catch {
    /* ignore */
  }
  return [...pids];
}

function killPids(pids) {
  for (const pid of pids) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(pid), '/F', '/T'], {windowsHide: true});
    } else {
      try {
        process.kill(Number(pid), 'SIGKILL');
      } catch {
        spawnSync('kill', ['-9', String(pid)]);
      }
    }
  }
}

function killPort(port) {
  killPids(pidsOnPort(port));
}

function startApi() {
  const env = apiEnv();
  spawnedByUs = true;
  apiProcess = spawn(pythonCmd(), ['-m', 'uvicorn', 'backend.main:app', '--host', API_HOST, '--port', String(API_PORT)], {
    cwd: ENGINE,
    windowsHide: true,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  apiProcess.stdout.on('data', (chunk) => process.stdout.write(`[api] ${chunk}`));
  apiProcess.stderr.on('data', (chunk) => process.stderr.write(`[api] ${chunk}`));
  apiProcess.on('exit', (code) => {
    apiProcess = null;
    spawnedByUs = false;
    if (code && code !== 0) {
      console.error(`API 退出，code=${code}`);
    }
  });
}

function stopApi(force = false) {
  const pid = apiProcess && apiProcess.pid;
  const ours = spawnedByUs;
  apiProcess = null;
  spawnedByUs = false;
  if (pid && process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/F', '/T'], {windowsHide: true});
  } else if (pid) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* ignore */
    }
  }
  if (force || ours) killPort(API_PORT);
}

async function restartApi() {
  if (restarting) return {ok: false, message: '正在重启后端'};
  restarting = true;
  const packaged = PACKAGED;
  try {
    stopApi(true);
    await sleep(400);
    killPort(API_PORT);
    await sleep(400);
    if (!packaged) {
      const start = Date.now();
      while (Date.now() - start < 12000) {
        if (await pingHealth()) return {ok: true, message: '后端已重新就绪'};
        await sleep(400);
      }
    }
    startApi();
    await waitForApi(90000);
    return {ok: true, message: '后端已强制重启'};
  } catch (error) {
    return {ok: false, message: error instanceof Error ? error.message : String(error)};
  } finally {
    restarting = false;
  }
}

function rendererUrl() {
  if (!PACKAGED && process.env.ELECTRON_START_URL !== 'api') {
    return VITE_URL;
  }
  return `${API_ORIGIN}/`;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 700,
    title: '口播场记',
    backgroundColor: '#101010',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  Menu.setApplicationMenu(null);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  return mainWindow.loadURL(rendererUrl());
}

app.setName('口播场记');
if (process.platform === 'win32') {
  app.setAppUserModelId('koubo.slate');
}

ipcMain.handle('koubo:restart-api', () => restartApi());

app.whenReady().then(async () => {
  if (PACKAGED) {
    fs.mkdirSync(path.join(USER_DATA, 'data'), {recursive: true});
    fs.mkdirSync(path.join(USER_DATA, 'models'), {recursive: true});
  }
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(
      permission === 'media' ||
        permission === 'display-capture' ||
        permission === 'clipboard-sanitized-write',
    );
  });
  session.defaultSession.setPermissionCheckHandler((_contents, permission) => {
    return (
      permission === 'media' ||
      permission === 'display-capture' ||
      permission === 'clipboard-sanitized-write'
    );
  });
  if (typeof session.defaultSession.setDevicePermissionHandler === 'function') {
    session.defaultSession.setDevicePermissionHandler(() => true);
  }

  try {
    if (!(await pingHealth())) {
      startApi();
      await waitForApi();
    }
    await createWindow();
  } catch (error) {
    dialog.showErrorBox('口播场记启动失败', error instanceof Error ? error.message : String(error));
    app.quit();
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopApi();
});
