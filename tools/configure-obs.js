// Registers (or removes) UltraChat in OBS: the auto-start script in every
// scene collection and two custom browser docks. OBS must be closed.
// Works on Windows, macOS and Linux (including the Flatpak OBS).
// Usage: node tools/configure-obs.js install|uninstall
// For tests, OBS_CONFIG_DIR points at a single obs-studio folder.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT_PATH = path.join(ROOT, 'obs-ultrachat.lua').replace(/\\/g, '/');
const PORT = 8787;
// Docks open a local loader page that waits for the server before showing it.
const LOADER = pathToFileURL(path.join(ROOT, 'dock-loader.html')).href;
const viaLoader = (url) => `${LOADER}?to=${encodeURIComponent(url)}`;
const DOCKS = [
  { title: 'UltraChat - Chat', url: viaLoader(`http://localhost:${PORT}/overlay.html?dock=1`) },
  { title: 'UltraChat - Painel', url: viaLoader(`http://localhost:${PORT}/`) },
];

const mode = process.argv[2] || 'install';
// Also matches the old "MultiChat" names so upgrades replace them instead of duplicating.
const isOurs = (p) => /obs-(ultra|multi)chat\.lua$/i.test(p || '');
const isOurDock = (title) => /^(Ultra|Multi)Chat - /.test(title || '');

/** Every OBS settings folder that exists for this user. */
function obsDirs() {
  if (process.env.OBS_CONFIG_DIR) return [process.env.OBS_CONFIG_DIR];
  const home = os.homedir();
  let candidates;
  if (process.platform === 'win32') {
    candidates = [path.join(process.env.APPDATA || '', 'obs-studio')];
  } else if (process.platform === 'darwin') {
    candidates = [path.join(home, 'Library', 'Application Support', 'obs-studio')];
  } else {
    candidates = [
      path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'obs-studio'),
      path.join(home, '.var', 'app', 'com.obsproject.Studio', 'config', 'obs-studio'), // Flatpak
    ];
  }
  return candidates.filter((d) => fs.existsSync(d));
}

function backup(file) {
  const bak = `${file}.ultrachat-backup`;
  if (!fs.existsSync(bak)) fs.copyFileSync(file, bak);
}

function updateSceneCollections(obsDir) {
  const dir = path.join(obsDir, 'basic', 'scenes');
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    const file = path.join(dir, name);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      continue; // skip unreadable files
    }
    data.modules ??= {};
    const list = (data.modules['scripts-tool'] || []).filter((s) => !isOurs(s.path));
    if (mode === 'install') list.push({ path: SCRIPT_PATH, settings: {} });
    data.modules['scripts-tool'] = list;
    backup(file);
    fs.writeFileSync(file, JSON.stringify(data, null, 4));
    count++;
  }
  return count;
}

function updateDocks(obsDir) {
  // OBS 30+ keeps docks in user.ini; older versions in global.ini.
  const file = ['user.ini', 'global.ini'].map((f) => path.join(obsDir, f)).find((f) => fs.existsSync(f));
  if (!file) return false;
  const text = fs.readFileSync(file, 'utf8');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const idx = lines.findIndex((l) => l.startsWith('ExtraBrowserDocks='));
  let docks = [];
  if (idx !== -1) {
    try {
      docks = JSON.parse(lines[idx].slice('ExtraBrowserDocks='.length)) || [];
    } catch {
      docks = [];
    }
  }
  // Reuse the old dock's uuid (OBS keys the dock position on it) so the layout survives upgrades.
  const oldUuid = {};
  for (const d of docks) if (isOurDock(d.title) && d.uuid) oldUuid[d.title.replace(/^\w+Chat/, '')] = d.uuid;
  docks = docks.filter((d) => !isOurDock(d.title));
  if (mode === 'install') {
    docks.push(...DOCKS.map((d) => ({ ...d, uuid: oldUuid[d.title.replace(/^\w+Chat/, '')] || randomUUID() })));
  }
  const line = `ExtraBrowserDocks=${JSON.stringify(docks)}`;
  if (idx !== -1) lines[idx] = line;
  else {
    let sec = lines.findIndex((l) => l.trim() === '[BasicWindow]');
    if (sec === -1) {
      lines.push('[BasicWindow]');
      sec = lines.length - 1;
    }
    lines.splice(sec + 1, 0, line);
  }
  backup(file);
  fs.writeFileSync(file, lines.join(eol));
  return true;
}

const dirs = obsDirs();
if (!dirs.length) {
  console.log('OBS não encontrado para este usuário — abra o OBS uma vez e rode a instalação de novo.');
  process.exit(0);
}
for (const dir of dirs) {
  const n = updateSceneCollections(dir);
  const docks = updateDocks(dir);
  console.log(`${mode} (${dir}): script em ${n} coleção(ões) de cenas; docks ${docks ? 'ok' : 'não alterados'}.`);
}
