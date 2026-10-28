import WebSocket from 'ws';
import { BaseConnector, cleanName, textPart } from './base.js';

// Anonymous, read-only connection to Twitch chat (no login needed).
const IRC_URL = 'wss://irc-ws.chat.twitch.tv:443';

function unescapeTag(v) {
  return v.replace(/\\(.)/g, (_, c) => ({ s: ' ', ':': ';', '\\': '\\', r: '\r', n: '\n' })[c] ?? c);
}

export function parseIrc(line) {
  const tags = {};
  let rest = line;
  if (rest.startsWith('@')) {
    const sp = rest.indexOf(' ');
    for (const kv of rest.slice(1, sp).split(';')) {
      const eq = kv.indexOf('=');
      if (eq === -1) tags[kv] = '';
      else tags[kv.slice(0, eq)] = unescapeTag(kv.slice(eq + 1));
    }
    rest = rest.slice(sp + 1);
  }
  let prefix = '';
  if (rest.startsWith(':')) {
    const sp = rest.indexOf(' ');
    prefix = rest.slice(1, sp);
    rest = rest.slice(sp + 1);
  }
  let trailing = null;
  const ti = rest.indexOf(' :');
  if (ti !== -1) {
    trailing = rest.slice(ti + 2);
    rest = rest.slice(0, ti);
  }
  const [command, ...params] = rest.split(' ');
  return { tags, prefix, command, params, trailing };
}

/** Splits a message into text and emote pieces using the `emotes` tag. */
export function twitchParts(text, emotesTag) {
  const chars = Array.from(text); // Twitch positions count code points
  const ranges = [];
  for (const entry of (emotesTag || '').split('/')) {
    const [id, positions] = entry.split(':');
    if (!positions) continue;
    for (const r of positions.split(',')) {
      const [s, e] = r.split('-').map(Number);
      ranges.push({ s, e, id });
    }
  }
  ranges.sort((a, b) => a.s - b.s);
  const parts = [];
  let i = 0;
  for (const r of ranges) {
    if (r.s < i) continue;
    if (r.s > i) parts.push(textPart(chars.slice(i, r.s).join('')));
    parts.push({
      type: 'emote',
      url: `https://static-cdn.jtvnw.net/emoticons/v2/${r.id}/default/dark/2.0`,
      alt: chars.slice(r.s, r.e + 1).join(''),
    });
    i = r.e + 1;
  }
  if (i < chars.length) parts.push(textPart(chars.slice(i).join('')));
  return parts;
}

function rolesFromBadges(badges) {
  const roles = [];
  for (const b of (badges || '').split(',')) {
    const name = b.split('/')[0];
    if (name === 'broadcaster') roles.push('owner');
    else if (name === 'moderator') roles.push('mod');
    else if (name === 'vip') roles.push('vip');
    else if (name === 'subscriber' || name === 'founder') roles.push('sub');
    else if (name === 'partner') roles.push('verified');
  }
  return [...new Set(roles)];
}

export class TwitchConnector extends BaseConnector {
  constructor(hub) {
    super(hub, 'twitch');
    this.ws = null;
  }

  async connect(gen) {
    const channel = cleanName(this.cfg.channel, /^https?:\/\/(www\.|m\.)?twitch\.tv\//i).toLowerCase();
    if (!channel) return this.setStatus('error', 'Informe o nome do canal da Twitch.');

    this.setStatus('connecting', `Entrando em #${channel}...`);
    const ws = new WebSocket(IRC_URL);
    this.ws = ws;

    ws.on('open', () => {
      ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      ws.send('PASS SCHMOOPIIE');
      ws.send(`NICK justinfan${Math.floor(10000 + Math.random() * 89999)}`);
      ws.send(`JOIN #${channel}`);
    });

    ws.on('message', (data) => {
      if (!this.isCurrent(gen)) return;
      for (const line of data.toString().split('\r\n')) {
        if (line) this.handleLine(ws, parseIrc(line), channel);
      }
    });

    ws.on('close', () => {
      if (!this.isCurrent(gen)) return;
      this.setStatus('connecting', 'Conexão caiu, reconectando...');
      this.retry(5000, gen);
    });

    ws.on('error', (err) => {
      if (this.isCurrent(gen)) this.setStatus('error', err.message);
    });
  }

  handleLine(ws, m, channel) {
    switch (m.command) {
      case 'PING':
        ws.send(`PONG :${m.trailing ?? 'tmi.twitch.tv'}`);
        break;
      case 'ROOMSTATE':
        this.setStatus('connected', `#${channel}`);
        break;
      case 'RECONNECT':
        ws.close();
        break;
      case 'NOTICE':
        if (/msg_channel_suspended|invalid/i.test(m.tags['msg-id'] || '')) {
          this.setStatus('error', m.trailing || 'Canal inválido.');
        }
        break;
      case 'PRIVMSG':
        this.onPrivmsg(m);
        break;
      case 'USERNOTICE':
        this.onUserNotice(m);
        break;
      case 'CLEARMSG':
        if (m.tags['target-msg-id']) this.hub.deleteMessage('twitch', m.tags['target-msg-id']);
        break;
      case 'CLEARCHAT':
        if (m.trailing) this.hub.deleteUser('twitch', m.trailing);
        break;
    }
  }

  userFrom(m) {
    const login = m.tags.login || m.prefix.split('!')[0];
    return {
      name: m.tags['display-name'] || login,
      login: (login || '').toLowerCase(),
      color: m.tags.color || '',
      roles: rolesFromBadges(m.tags.badges),
    };
  }

  onPrivmsg(m) {
    let text = m.trailing || '';
    let action = false;
    const me = /^\u0001ACTION (.*)\u0001$/.exec(text);
    if (me) {
      text = me[1];
      action = true;
    }
    const bits = Number(m.tags.bits || 0);
    this.publish({
      sourceId: m.tags.id,
      type: bits ? 'donation' : 'chat',
      amount: bits ? `${bits} bits` : undefined,
      bits: bits || undefined,
      action,
      user: this.userFrom(m),
      parts: twitchParts(text, m.tags.emotes),
    });
  }

  onUserNotice(m) {
    const kind = m.tags['msg-id'] || '';
    const isSub = /sub|gift|primepaidupgrade|giftpaidupgrade/i.test(kind);
    const isRaid = kind === 'raid';
    if (!isSub && !isRaid) return;
    const user = this.userFrom(m);
    // A gift of N subs arrives as one "submysterygift" summary plus N "subgift" notices: count only the latter.
    const subCount = /mysterygift/i.test(kind) || user.login === 'ananonymousgifter' ? 0 : 1;
    this.publish({
      sourceId: m.tags.id,
      type: isRaid ? 'raid' : 'sub',
      subCount,
      user,
      highlight: m.tags['system-msg'] || '',
      parts: m.trailing ? twitchParts(m.trailing, m.tags.emotes) : [],
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.removeAllListeners('close');
      this.ws.on('error', () => {});
      this.ws.terminate();
      this.ws = null;
    }
  }
}
