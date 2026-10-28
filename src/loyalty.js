import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { textPart } from './connectors/base.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LOYALTY_PATH = path.join(ROOT, 'loyalty.json');

const SAVE_DELAY = 2000;
const LEADERBOARD_SIZE = 50;
const LEADERBOARD_THROTTLE = 1000;

const fmt = (n) => Math.round(n).toLocaleString('pt-BR');

/** Identity is per platform for now (e.g. "tiktok:login"); linking accounts comes later. */
export function userKey(msg) {
  const id = (msg.user?.login || msg.user?.name || '').toLowerCase().replace(/^@/, '').trim();
  return msg.platform && id ? `${msg.platform}:${id}` : '';
}

/** Accepts "!pontos, !points" and returns ['!pontos', '!points']. */
function commandList(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .map((s) => (s.startsWith('!') ? s : `!${s}`));
}

export function sortedRanks(ranks) {
  return (Array.isArray(ranks) ? ranks : [])
    .filter((r) => r && String(r.name || '').trim())
    .map((r) => ({ name: String(r.name).trim(), min: Math.max(0, Number(r.min) || 0) }))
    .sort((a, b) => a.min - b.min);
}

/**
 * Points, ranks and chat commands. Listens to the hub's 'incoming' event,
 * which fires for every message *before* filters (so "!" commands still work
 * when "hide commands" is on, and hidden gifts/follows still earn points).
 */
export class Loyalty {
  constructor(hub, getConfig, file = LOYALTY_PATH) {
    this.hub = hub;
    this.getConfig = getConfig;
    this.file = file;
    this.users = new Map();
    this.lastCommand = new Map();
    this.saveTimer = null;
    this.boardTimer = null;
    this.dirty = false;
    this.load();
    hub.on('incoming', (msg) => {
      try {
        this.handle(msg);
      } catch (err) {
        console.error('[pontos]', err?.message || err);
      }
    });
  }

  get cfg() {
    return this.getConfig().loyalty || {};
  }

  // ---------- storage ----------
  load() {
    let raw;
    try {
      raw = fs.readFileSync(this.file, 'utf8');
    } catch {
      return; // first run
    }
    try {
      const data = JSON.parse(raw);
      for (const [key, u] of Object.entries(data.users || {})) this.users.set(key, u);
    } catch (err) {
      // Never overwrite a file we could not read: keep a copy and start fresh.
      const backup = this.file.replace(/\.json$/, `.corrompido-${Date.now()}.json`);
      try {
        fs.copyFileSync(this.file, backup);
      } catch {
        /* ignore */
      }
      console.error(`[pontos] loyalty.json ilegível (${err.message}). Cópia salva em ${path.basename(backup)}.`);
    }
  }

  scheduleSave() {
    this.dirty = true;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, SAVE_DELAY);
  }

  /** Synchronous so it can run from process 'exit'. Writes to a temp file, then renames. */
  flush() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (!this.dirty) return;
    const data = { version: 1, savedAt: new Date().toISOString(), users: Object.fromEntries(this.users) };
    const tmp = `${this.file}.tmp`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(data));
      fs.renameSync(tmp, this.file);
      this.dirty = false;
    } catch (err) {
      console.error('[pontos] não consegui salvar loyalty.json:', err.message);
    }
  }

  // ---------- users and ranks ----------
  touch(key, msg, now) {
    let u = this.users.get(key);
    if (!u) {
      u = { platform: msg.platform, login: key.slice(key.indexOf(':') + 1), name: '', points: 0, messages: 0, firstSeen: now };
      this.users.set(key, u);
    }
    if (msg.user?.name) u.name = msg.user.name;
    if (msg.user?.avatar) u.avatar = msg.user.avatar;
    u.lastSeen = now;
    this.scheduleSave();
    return u;
  }

  add(u, points) {
    const n = Math.round(Number(points) || 0);
    if (n <= 0) return;
    u.points += n;
    this.scheduleSave();
    this.leaderboardChanged();
  }

  rankOf(points) {
    const ranks = sortedRanks(this.cfg.ranks);
    let current = null;
    let next = null;
    for (const r of ranks) {
      if (points >= r.min) current = r;
      else {
        next = r;
        break;
      }
    }
    return { current, next };
  }

  sortedUsers() {
    return [...this.users.entries()]
      .filter(([, u]) => u.points > 0)
      .sort((a, b) => b[1].points - a[1].points || (a[1].firstSeen || 0) - (b[1].firstSeen || 0));
  }

  top(limit = 10) {
    return this.sortedUsers()
      .slice(0, limit)
      .map(([key, u], i) => ({
        key,
        pos: i + 1,
        platform: u.platform,
        name: u.name || u.login,
        login: u.login,
        avatar: u.avatar || '',
        points: u.points,
        rank: this.rankOf(u.points).current?.name || '',
      }));
  }

  stats() {
    let points = 0;
    for (const u of this.users.values()) points += u.points;
    return { users: this.users.size, points };
  }

  reset() {
    this.users.clear();
    this.lastCommand.clear();
    this.dirty = true;
    this.flush();
    this.leaderboardChanged();
  }

  leaderboardChanged() {
    if (this.boardTimer) return;
    this.boardTimer = setTimeout(() => {
      this.boardTimer = null;
      this.hub.emit('broadcast', { type: 'leaderboard', top: this.top(LEADERBOARD_SIZE) });
    }, LEADERBOARD_THROTTLE);
  }

  // ---------- events ----------
  handle(msg) {
    const cfg = this.cfg;
    if (!cfg.enabled || msg.test || msg.type === 'bot') return;
    const key = userKey(msg);
    if (!key) return;
    const now = Date.now();

    switch (msg.type) {
      case 'chat': {
        const cmd = this.matchCommand(msg);
        if (cmd) return this.runCommand(cmd, key, msg, now);
        const u = this.touch(key, msg, now);
        u.messages = (u.messages || 0) + 1;
        if (now - (u.lastPointAt || 0) >= Math.max(0, Number(cfg.messageCooldown) || 0) * 1000) {
          u.lastPointAt = now;
          this.add(u, cfg.pointsPerMessage);
        }
        return;
      }
      case 'gift':
        return this.add(this.touch(key, msg, now), (Number(msg.diamonds) || 0) * (Number(cfg.pointsPerDiamond) || 0));
      case 'follow': {
        const u = this.touch(key, msg, now);
        if (u.followed) return; // unfollow/follow again does not farm points
        u.followed = true;
        return this.add(u, cfg.pointsPerFollow);
      }
      case 'sub': {
        const count = msg.subCount ?? 1;
        if (count <= 0) return;
        return this.add(this.touch(key, msg, now), count * (Number(cfg.pointsPerSub) || 0));
      }
      case 'donation': {
        const u = this.touch(key, msg, now);
        if (msg.bits) return this.add(u, msg.bits * (Number(cfg.pointsPerBit) || 0));
        if (msg.value) return this.add(u, msg.value * (Number(cfg.pointsPerSuperChat) || 0));
        return;
      }
    }
  }

  // ---------- commands ----------
  matchCommand(msg) {
    const first = msg.parts?.[0];
    if (first?.type !== 'text') return null;
    const word = first.text.trim().split(/\s+/)[0]?.toLowerCase();
    if (!word?.startsWith('!')) return null;
    const cmds = this.cfg.commands || {};
    for (const name of ['points', 'rank', 'top']) {
      if (commandList(cmds[name]).includes(word)) return name;
    }
    return null;
  }

  runCommand(cmd, key, msg, now) {
    const cooldown = Math.max(0, Number(this.cfg.commandCooldown) || 0) * 1000;
    const cdKey = `${key}|${cmd}`;
    if (now - (this.lastCommand.get(cdKey) || 0) < cooldown) return;
    this.lastCommand.set(cdKey, now);

    const u = this.touch(key, msg, now);
    const who = `@${msg.user?.name || u.name || u.login}`;
    let text;
    if (cmd === 'points') {
      text = `${who} tem ${fmt(u.points)} ${u.points === 1 ? 'ponto' : 'pontos'}.`;
    } else if (cmd === 'rank') {
      const { current, next } = this.rankOf(u.points);
      const pos = this.sortedUsers().findIndex(([k]) => k === key) + 1;
      text = `${who}: ${current ? `rank ${current.name}` : 'ainda sem rank'} · ${fmt(u.points)} pts`;
      if (pos) text += ` · #${pos} no geral`;
      text += next ? ` · faltam ${fmt(next.min - u.points)} para ${next.name}.` : current ? ' · rank máximo!' : '.';
    } else {
      const top = this.top(5);
      text = top.length
        ? `🏆 Top ${top.length}: ${top.map((t) => `${t.pos}. ${t.name} (${fmt(t.points)})`).join(' · ')}`
        : 'Ninguém tem pontos ainda.';
    }
    this.reply(msg.platform, text);
  }

  /** Replies show up in the overlay only (UltraChat is read-only on every platform). */
  reply(platform, text) {
    const name = String(this.cfg.botName || '').trim() || 'UltraChat';
    // Deferred so the reply appears after the command that triggered it.
    setImmediate(() =>
      this.hub.publish({
        platform,
        type: 'bot',
        user: { name, login: '', roles: ['bot'], color: '#a78bfa' },
        parts: [textPart(text)],
      }),
    );
  }
}
