// Opens the UltraChat panel in its own app window (no address bar, own taskbar icon).
// Starts the server first when it is not running, so OBS does not need to be open.
// Usage: node tools/app.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROFILE = path.join(ROOT, '.app-profile'); // own browser profile: separate window, remembers its size

function port() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')).port || 8787;
  } catch {
    return 8787;
  }
}

const PORT = port();
const URL_ = `http://localhost:${PORT}/`;

async function serverUp() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/config`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

function startServer() {
  const log = fs.openSync(path.join(ROOT, 'ultrachat.log'), 'a');
  const child = spawn(process.execPath, ['--no-warnings', path.join(ROOT, 'src', 'server.js')], {
    cwd: ROOT,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', log, log],
  });
  child.unref();
}

async function ensureServer() {
  if (await serverUp()) return true;
  startServer();
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if (await serverUp()) return true;
  }
  return false;
}

function firstExisting(paths) {
  return paths.find((p) => p && fs.existsSync(p));
}

function onPath(names) {
  const dirs = (process.env.PATH || '').split(path.delimiter);
  for (const n of names) for (const d of dirs) if (d && fs.existsSync(path.join(d, n))) return path.join(d, n);
  return null;
}

/** A Chromium-based browser that supports --app (Edge ships with Windows 10/11). */
function findBrowser() {
  if (process.platform === 'win32') {
    const pf = process.env.ProgramFiles;
    const pf86 = process.env['ProgramFiles(x86)'];
    const local = process.env.LOCALAPPDATA;
    return firstExisting([
      pf86 && path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      pf && path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      pf && path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      pf86 && path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      local && path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ]);
  }
  if (process.platform === 'darwin') {
    return firstExisting([
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    ]);
  }
  return onPath(['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'brave-browser']);
}

function openDefault(url) {
  const [cmd, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

const ok = await ensureServer();
const browser = findBrowser();
if (browser) {
  spawn(
    browser,
    [`--app=${URL_}`, `--user-data-dir=${PROFILE}`, '--window-size=1180,860', '--no-first-run', '--no-default-browser-check'],
    { detached: true, stdio: 'ignore' },
  ).unref();
} else {
  openDefault(URL_);
}
if (!ok) console.error('O servidor do UltraChat não respondeu. Veja ultrachat.log.');
