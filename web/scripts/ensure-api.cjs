const {spawn} = require('child_process');
const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const HOST = process.env.API_HOST || '127.0.0.1';
const PORT = Number(process.env.API_PORT || 8777);
const PYTHON = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

function ping() {
  return new Promise((resolve) => {
    const req = http.get(`http://${HOST}:${PORT}/api/health`, (res) => {
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

function stopChild(child) {
  if (!child || !child.pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(child.pid), '/F', '/T'], {windowsHide: true, stdio: 'ignore'});
    return;
  }
  try {
    child.kill('SIGTERM');
  } catch {
    /* ignore */
  }
}

async function main() {
  if (await ping()) {
    console.log(`[api] 已有后端在 ${HOST}:${PORT}，复用`);
    setInterval(() => {}, 1 << 30);
    return;
  }

  console.log(`[api] 启动 uvicorn @ ${HOST}:${PORT}（cwd=${ROOT}）`);
  const child = spawn(
    PYTHON,
    ['-m', 'uvicorn', 'backend.main:app', '--reload', '--host', HOST, '--port', String(PORT)],
    {
      cwd: ROOT,
      stdio: 'inherit',
      env: {...process.env, PYTHONUNBUFFERED: '1'},
      windowsHide: true,
    },
  );

  const onSignal = () => stopChild(child);
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  child.on('exit', (code, signal) => {
    process.exit(code == null ? (signal ? 1 : 0) : code);
  });
}

main().catch((error) => {
  console.error('[api]', error instanceof Error ? error.message : error);
  process.exit(1);
});
