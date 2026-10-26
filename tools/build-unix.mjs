// Builds the macOS and Linux packages: installer/Output/UltraChat-<target>.tar.gz
// Each package has the app, its own node binary and install/uninstall scripts.
// Usage: node tools/build-unix.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NODE_VERSION = process.version; // ship the same Node we build with
const TARGETS = ['darwin-arm64', 'darwin-x64', 'linux-x64', 'linux-arm64'];
const CACHE = path.join(ROOT, 'installer', 'node-cache');
const OUT = path.join(ROOT, 'installer', 'Output');
const APP_DIR = 'UltraChat';

const APP_FILES = ['src', 'public', 'tools', 'node_modules', 'package.json', 'obs-ultrachat.lua', 'start.sh', 'dock-loader.html', 'README.md'];
const EXECUTABLE = new Set(['start.sh', 'install.sh', 'uninstall.sh', 'Instalar UltraChat.command', 'node/bin/node']);

// ---------- download + verify official Node ----------
async function nodeBinary(target) {
  fs.mkdirSync(CACHE, { recursive: true });
  const name = `node-${NODE_VERSION}-${target}.tar.gz`;
  const file = path.join(CACHE, name);
  const base = `https://nodejs.org/dist/${NODE_VERSION}`;
  if (!fs.existsSync(file)) {
    console.log(`baixando ${name}...`);
    const res = await fetch(`${base}/${name}`);
    if (!res.ok) throw new Error(`download falhou: ${res.status} ${name}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  const sums = await (await fetch(`${base}/SHASUMS256.txt`)).text();
  const expected = sums.split('\n').find((l) => l.endsWith(`  ${name}`))?.split(' ')[0];
  const actual = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (!expected || expected !== actual) throw new Error(`checksum não confere para ${name}`);

  // Pull bin/node out of the official archive.
  const tmp = path.join(CACHE, `x-${target}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp);
  execFileSync('tar', ['-xzf', file, '-C', tmp, `node-${NODE_VERSION}-${target}/bin/node`]);
  return fs.readFileSync(path.join(tmp, `node-${NODE_VERSION}-${target}`, 'bin', 'node'));
}

// ---------- minimal tar writer (keeps unix permissions) ----------
function header(name, size, mode, type) {
  const h = Buffer.alloc(512);
  let prefix = '';
  if (Buffer.byteLength(name) > 100) {
    const cut = name.lastIndexOf('/', 154);
    prefix = name.slice(0, cut);
    name = name.slice(cut + 1);
    if (Buffer.byteLength(name) > 100 || Buffer.byteLength(prefix) > 155) throw new Error(`caminho longo demais: ${prefix}/${name}`);
  }
  h.write(name, 0, 100);
  h.write(mode.toString(8).padStart(7, '0') + '\0', 100);
  h.write('0000000\0', 108); // uid
  h.write('0000000\0', 116); // gid
  h.write(size.toString(8).padStart(11, '0') + '\0', 124);
  h.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0', 136);
  h.write('        ', 148); // checksum placeholder
  h.write(type, 156);
  h.write('ustar\0', 257);
  h.write('00', 263);
  h.write(prefix, 345, 155);
  let sum = 0;
  for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  return h;
}

function tarEntries(entries) {
  const chunks = [];
  for (const e of entries) {
    if (e.dir) {
      chunks.push(header(e.name + '/', 0, 0o755, '5'));
    } else {
      chunks.push(header(e.name, e.data.length, e.mode, '0'), e.data);
      const pad = (512 - (e.data.length % 512)) % 512;
      if (pad) chunks.push(Buffer.alloc(pad));
    }
  }
  chunks.push(Buffer.alloc(1024));
  return Buffer.concat(chunks);
}

function walk(abs, rel, out) {
  const st = fs.statSync(abs);
  if (st.isDirectory()) {
    out.push({ name: rel, dir: true });
    for (const child of fs.readdirSync(abs)) walk(path.join(abs, child), `${rel}/${child}`, out);
  } else {
    let data = fs.readFileSync(abs);
    if (rel.endsWith('.sh') || rel.endsWith('.command')) data = Buffer.from(data.toString('utf8').replace(/\r\n/g, '\n'));
    const inner = rel.slice(APP_DIR.length + 1);
    out.push({ name: rel, data, mode: EXECUTABLE.has(inner) ? 0o755 : 0o644 });
  }
}

// ---------- build ----------
fs.mkdirSync(OUT, { recursive: true });
const launcher = '#!/bin/sh\n# Duplo clique para instalar o UltraChat (macOS).\ncd "$(dirname "$0")" && sh install.sh\necho\nprintf "Aperte Enter para fechar..."\nread -r _\n';

for (const target of TARGETS) {
  const entries = [{ name: APP_DIR, dir: true }];
  for (const f of APP_FILES) walk(path.join(ROOT, f), `${APP_DIR}/${f}`, entries);
  for (const f of ['install.sh', 'uninstall.sh']) walk(path.join(ROOT, 'installer', 'unix', f), `${APP_DIR}/${f}`, entries);
  if (target.startsWith('darwin')) {
    entries.push({ name: `${APP_DIR}/Instalar UltraChat.command`, data: Buffer.from(launcher), mode: 0o755 });
  }
  entries.push({ name: `${APP_DIR}/node`, dir: true }, { name: `${APP_DIR}/node/bin`, dir: true });
  entries.push({ name: `${APP_DIR}/node/bin/node`, data: await nodeBinary(target), mode: 0o755 });

  const file = path.join(OUT, `UltraChat-${target}.tar.gz`);
  fs.writeFileSync(file, zlib.gzipSync(tarEntries(entries), { level: 9 }));
  console.log(`ok: ${path.basename(file)} (${(fs.statSync(file).size / 1048576).toFixed(1)} MB)`);
}
