import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

const HISTORY_SIZE = 100;

/**
 * Central point: connectors publish messages here, and the hub
 * filters them, keeps a short history and broadcasts to every overlay.
 */
export class Hub extends EventEmitter {
  constructor(getConfig) {
    super();
    this.getConfig = getConfig;
    this.history = [];
    this.status = {};
  }

  publish(msg) {
    const full = { id: randomUUID(), ts: Date.now(), type: 'chat', parts: [], ...msg };
    full.user = { name: '', roles: [], ...(msg.user || {}) };
    if (this.isBlocked(full)) return;
    // Listeners (points, commands) see every message before the display filters,
    // including events published with `hidden: true` (counted but not shown).
    this.emit('incoming', full);
    if (full.hidden || this.isHiddenCommand(full)) return;
    this.history.push(full);
    if (this.history.length > HISTORY_SIZE) this.history.shift();
    this.emit('broadcast', { type: 'message', msg: full });
  }

  isFiltered(msg) {
    return this.isBlocked(msg) || this.isHiddenCommand(msg);
  }

  isBlocked(msg) {
    const { filters } = this.getConfig();
    const name = (msg.user.login || msg.user.name || '').toLowerCase().replace(/^@/, '');
    const blocked = (filters.blockedUsers || '')
      .split(',')
      .map((s) => s.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean);
    return blocked.includes(name);
  }

  isHiddenCommand(msg) {
    const { filters } = this.getConfig();
    if (!filters.hideCommands || msg.type !== 'chat') return false;
    const first = msg.parts.find((p) => p.type === 'text');
    return msg.parts[0] === first && !!first?.text.trimStart().startsWith('!');
  }

  deleteMessage(platform, id) {
    this.history = this.history.filter((m) => !(m.platform === platform && m.sourceId === id));
    this.emit('broadcast', { type: 'delete', platform, sourceId: id });
  }

  deleteUser(platform, login) {
    const l = login.toLowerCase();
    this.history = this.history.filter((m) => !(m.platform === platform && m.user.login === l));
    this.emit('broadcast', { type: 'deleteUser', platform, login: l });
  }

  clear() {
    this.history = [];
    this.emit('broadcast', { type: 'clear' });
  }

  setStatus(platform, status) {
    this.status[platform] = status;
    this.emit('broadcast', { type: 'status', status: this.status });
  }
}
