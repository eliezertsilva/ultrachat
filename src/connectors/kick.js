import WebSocket from 'ws';
import { BaseConnector, BROWSER_UA, cleanName, textPart } from './base.js';

// Kick's public chat goes through Pusher. Kick rotates this key from time to time
// (last change: Oct/2026); it can be overridden in the panel ("Pusher key").
export const DEFAULT_PUSHER_KEY = '34bf7a0ff419a2a775b9';
const pusherUrl = (key) =>
  `wss://ws-us2.pusher.com/app/${key}?protocol=7&client=js&version=8.4.0&flash=false`;

/** Kick writes emotes inline as [emote:ID:name]. */
function kickParts(content) {
  const parts = [];
  const re = /\[emote:(\d+):([^\]]*)\]/g;
  let last = 0;
  let m;
  while ((m = re.exec(content))) {
    if (m.index > last) parts.push(textPart(content.slice(last, m.index)));
    parts.push({ type: 'emote', url: `https://files.kick.com/emotes/${m[1]}/fullsize`, alt: m[2] });
    last = re.lastIndex;
  }
  if (last < content.length) parts.push(textPart(content.slice(last)));
  return parts;
}

function rolesFrom(badges) {
  const roles = [];
  for (const b of badges || []) {
    if (b.type === 'broadcaster') roles.push('owner');
    else if (b.type === 'moderator') roles.push('mod');
    else if (b.type === 'vip' || b.type === 'og') roles.push('vip');
    else if (b.type === 'subscriber' || b.type === 'founder' || b.type === 'sub_gifter') roles.push('sub');
    else if (b.type === 'verified') roles.push('verified');
  }
  return [...new Set(roles)];
}

async function lookupChatroomId(slug) {
  const res = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`, {
    headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const id = json?.chatroom?.id;
  if (!id) throw new Error('resposta sem chatroom');
  return String(id);
}

export class KickConnector extends BaseConnector {
  constructor(hub) {
    super(hub, 'kick');
    this.ws = null;
    this.cachedIds = {};
  }

  async connect(gen) {
    const slug = cleanName(this.cfg.channel, /^https?:\/\/(www\.)?kick\.com\//i).toLowerCase();
    if (!slug && !this.cfg.chatroomId) return this.setStatus('error', 'Informe o canal da Kick.');

    this.setStatus('connecting', 'Buscando sala do chat...');
    let chatroomId = String(this.cfg.chatroomId || '').trim() || this.cachedIds[slug];
    if (!chatroomId) {
      try {
        chatroomId = await lookupChatroomId(slug);
        this.cachedIds[slug] = chatroomId;
      } catch (err) {
        if (!this.isCurrent(gen)) return;
        this.setStatus(
          'error',
          `A Kick bloqueou a busca automática (${err.message}). Preencha o "Chatroom ID" manualmente (veja o README).`,
        );
        return this.retry(120_000, gen);
      }
    }
    if (!this.isCurrent(gen)) return;

    const key = String(this.cfg.pusherKey || '').trim() || DEFAULT_PUSHER_KEY;
    let retryMs = 5000;
    const ws = new WebSocket(pusherUrl(key), { headers: { Origin: 'https://kick.com', 'User-Agent': BROWSER_UA } });
    this.ws = ws;

    ws.on('message', (raw) => {
      if (!this.isCurrent(gen)) return;
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      switch (msg.event) {
        case 'pusher:connection_established':
          ws.send(JSON.stringify({ event: 'pusher:subscribe', data: { auth: '', channel: `chatrooms.${chatroomId}.v2` } }));
          break;
        case 'pusher_internal:subscription_succeeded':
          this.setStatus('connected', slug || `sala ${chatroomId}`);
          break;
        case 'pusher:ping':
          ws.send(JSON.stringify({ event: 'pusher:pong', data: {} }));
          break;
        case 'pusher:error':
          if (msg.data?.code === 4001) {
            retryMs = 300_000;
            this.setStatus('error', 'A Kick trocou a chave do chat. Atualize o projeto ou preencha a "Pusher key" no painel. Tentando de novo em 5 min.');
          } else {
            this.setStatus('error', msg.data?.message || 'Erro no chat da Kick.');
          }
          return;
        default:
          this.onEvent(msg);
      }
    });

    ws.on('close', () => {
      if (!this.isCurrent(gen)) return;
      if (retryMs === 5000) this.setStatus('connecting', 'Conexão caiu, reconectando...');
      this.retry(retryMs, gen);
    });
    ws.on('error', (err) => {
      if (this.isCurrent(gen)) this.setStatus('error', err.message);
    });
  }

  onEvent(msg) {
    let data;
    try {
      data = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data;
    } catch {
      return;
    }
    if (msg.event === 'App\\Events\\ChatMessageEvent') {
      const s = data.sender || {};
      this.publish({
        sourceId: data.id,
        user: {
          name: s.username || 'Kick',
          login: (s.slug || s.username || '').toLowerCase(),
          color: s.identity?.color || '',
          roles: rolesFrom(s.identity?.badges),
        },
        parts: kickParts(data.content || ''),
      });
    } else if (msg.event === 'App\\Events\\MessageDeletedEvent') {
      if (data?.message?.id) this.hub.deleteMessage('kick', data.message.id);
    } else if (msg.event === 'App\\Events\\SubscriptionEvent') {
      this.publish({ type: 'sub', user: { name: data.username || 'Kick' }, highlight: 'se inscreveu!', parts: [] });
    } else if (msg.event === 'App\\Events\\GiftedSubscriptionsEvent') {
      const n = data.gifted_usernames?.length || 1;
      this.publish({ type: 'sub', user: { name: data.gifter_username || 'Kick' }, highlight: `presenteou ${n} sub(s)!`, parts: [] });
    }
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
