// Registers (or removes) MultiChat in OBS: the auto-start script in every
// scene collection and two custom browser docks. OBS must be closed.
// Usage: node tools/configure-obs.js install|uninstall
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OBS_DIR = path.join(process.env.APPDATA || '', 'obs-studio');
const SCRIPT_PATH = path.join(ROOT, 'obs-multichat.lua').replace(/\\/g, '/');
const PORT = 8787;
// Docks open a local loader page that waits for the server before showing it.
const LOADER = `file:///${path.join(ROOT, 'dock-loader.html').replace(/\\/g, '/')}`;
const viaLoader = (url) => `${LOADER}?to=${encodeURIComponent(url)}`;
const DOCKS = [
  { title: 'MultiChat - Chat', url: viaLoader(`http://localhost:${PORT}/overlay.html?dock=1`) },
  { title: 'MultiChat - Painel', url: viaLoader(`http://localhost:${PORT}/`) },
];

const mode = process.argv[2] || 'install';
const isOurs = (p) => /obs-multichat\.lua$/i.test(p || '');

function backup(file) {
  const bak = `${file}.multichat-backup`;
  if (!fs.existsSync(bak)) fs.copyFileSync(file, bak);
}

function updateSceneCollections() {
  const dir = path.join(OBS_DIR, 'basic', 'scenes');
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

function updateDocks() {
  // OBS 30+ keeps docks in user.ini; older versions in global.ini.
  const file = ['user.ini', 'global.ini'].map((f) => path.join(OBS_DIR, f)).find((f) => fs.existsSync(f));
  if (!file) return false;
  const text = fs.readFileSync(file, 'utf8');
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
  docks = docks.filter((d) => !DOCKS.some((x) => x.title === d.title));
  if (mode === 'install') docks.push(...DOCKS.map((d) => ({ ...d, uuid: randomUUID() })));
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
  fs.writeFileSync(file, lines.join('\r\n'));
  return true;
}

if (!fs.existsSync(OBS_DIR)) {
  console.log('OBS não encontrado para este usuário — nada a configurar.');
  process.exit(0);
}
const n = updateSceneCollections();
const docks = updateDocks();
console.log(`${mode}: script em ${n} coleção(ões) de cenas; docks ${docks ? 'ok' : 'não alterados'}.`);
