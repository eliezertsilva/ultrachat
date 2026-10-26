import { Innertube, Log } from 'youtubei.js';
import { BaseConnector, BROWSER_UA, textPart } from './base.js';

// The library prints long parser warnings whenever YouTube adds new fields; they are harmless.
Log.setLevel(Log.Level.NONE);

const ID_RE = /^[\w-]{11}$/;

/**
 * Accepts a video ID/URL, a channel URL, an @handle or a UC... channel ID,
 * and returns the ID of the channel's current live video (or null).
 */
export async function resolveLiveVideoId(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  if (ID_RE.test(s) && !s.startsWith('UC')) return s;

  const direct = /(?:[?&]v=|youtu\.be\/|\/live\/|\/shorts\/)([\w-]{11})/.exec(s);
  if (direct) return direct[1];

  let base;
  const handle = /(?:youtube\.com\/)?(@[\w.\-]+)/.exec(s);
  const chan = /(UC[\w-]{22})/.exec(s);
  const custom = /youtube\.com\/(?:c|user)\/([\w.\-]+)/.exec(s);
  if (handle) base = `https://www.youtube.com/${handle[1]}`;
  else if (chan) base = `https://www.youtube.com/channel/${chan[1]}`;
  else if (custom) base = `https://www.youtube.com/c/${custom[1]}`;
  else base = `https://www.youtube.com/@${s.replace(/^@/, '')}`;

  const res = await fetch(`${base}/live`, {
    headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'pt-BR,pt;q=0.9', Cookie: 'CONSENT=YES+1' },
  });
  if (res.status === 404) throw new Error('Canal do YouTube não encontrado.');
  const html = await res.text();
  const canon = /<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/.exec(html);
  return canon ? canon[1] : null;
}

function partsFromText(text) {
  if (!text) return [];
  if (!Array.isArray(text.runs)) return [textPart(text.toString?.() ?? text.text ?? '')];
  return text.runs.map((run) => {
    const url = run.emoji?.image?.[0]?.url;
    if (url) return { type: 'emote', url, alt: run.text || run.emoji?.shortcuts?.[0] || '' };
    return textPart(run.text);
  });
}

function userFrom(author) {
  const roles = [];
  let badge;
  for (const b of author?.badges || []) {
    const icon = b.icon_type || '';
    if (icon === 'OWNER') roles.push('owner');
    else if (icon === 'MODERATOR') roles.push('mod');
    else if (icon.startsWith('VERIFIED')) roles.push('verified');
    else if (b.custom_thumbnail?.length) {
      roles.push('member');
      badge = b.custom_thumbnail.at(-1)?.url;
    }
  }
  if (author?.is_moderator && !roles.includes('mod')) roles.push('mod');
  const name = author?.name || 'YouTube';
  return {
    name,
    login: name.replace(/^@/, '').toLowerCase(),
    avatar: author?.thumbnails?.[0]?.url || '',
    roles: [...new Set(roles)],
    badgeUrl: badge,
  };
}

export class YouTubeConnector extends BaseConnector {
  constructor(hub) {
    super(hub, 'youtube');
    this.chat = null;
    this.yt = null;
  }

  async connect(gen) {
    if (!String(this.cfg.channel || '').trim()) {
      return this.setStatus('error', 'Informe o @ do canal ou o link da live do YouTube.');
    }
    this.setStatus('connecting', 'Procurando live ativa...');

    if (!this.yt) this.yt = await Innertube.create({ retrieve_player: false, lang: 'pt' });
    const videoId = await resolveLiveVideoId(this.cfg.channel);
    if (!this.isCurrent(gen)) return;
    if (!videoId) {
      this.setStatus('waiting', 'Nenhuma live ativa no canal. Vou checar de novo em 60s.');
      return this.retry(60_000, gen);
    }

    const info = await this.yt.getInfo(videoId);
    if (!this.isCurrent(gen)) return;
    let chat;
    try {
      chat = info.getLiveChat();
    } catch {
      this.setStatus('waiting', 'O vídeo não tem chat ao vivo (ainda). Vou checar de novo em 60s.');
      return this.retry(60_000, gen);
    }
    this.chat = chat;
    const title = info.basic_info?.title || videoId;

    chat.on('start', () => {
      if (!this.isCurrent(gen)) return;
      this.setStatus('connected', title);
      // Default is "Top chat", which hides many messages. Show everything.
      try {
        chat.applyFilter('LIVE_CHAT');
      } catch {
        /* keep default filter */
      }
    });
    chat.on('chat-update', (action) => {
      if (this.isCurrent(gen)) this.handleAction(action);
    });
    chat.on('error', (err) => {
      if (!this.isCurrent(gen)) return;
      this.setStatus('error', `${err?.message || err}. Tentando de novo em 30s.`);
      this.disconnect();
      this.retry(30_000, gen);
    });
    chat.on('end', () => {
      if (!this.isCurrent(gen)) return;
      this.setStatus('waiting', 'A live terminou. Vou checar de novo em 60s.');
      this.disconnect();
      this.retry(60_000, gen);
    });
    chat.start();
  }

  handleAction(action) {
    if (action.type === 'MarkChatItemAsDeletedAction') {
      return this.hub.deleteMessage('youtube', action.target_item_id);
    }
    if (action.type !== 'AddChatItemAction') return;
    const item = action.item;
    if (!item) return;

    switch (item.type) {
      case 'LiveChatTextMessage':
        return this.publish({ sourceId: item.id, user: userFrom(item.author), parts: partsFromText(item.message) });
      case 'LiveChatPaidMessage':
        return this.publish({
          sourceId: item.id,
          type: 'donation',
          amount: item.purchase_amount,
          highlight: 'Super Chat',
          user: userFrom(item.author),
          parts: partsFromText(item.message),
        });
      case 'LiveChatPaidSticker':
        return this.publish({
          sourceId: item.id,
          type: 'donation',
          amount: item.purchase_amount,
          highlight: 'Super Sticker',
          image: item.sticker?.[0]?.url,
          user: userFrom(item.author),
          parts: [],
        });
      case 'LiveChatMembershipItem':
        return this.publish({
          sourceId: item.id,
          type: 'sub',
          highlight: item.header_subtext?.toString?.() || 'Novo membro!',
          user: userFrom(item.author),
          parts: partsFromText(item.message),
        });
    }
  }

  disconnect() {
    if (this.chat) {
      const c = this.chat;
      this.chat = null;
      try {
        c.removeAllListeners?.();
        c.stop();
      } catch {
        /* ignore */
      }
    }
  }
}
