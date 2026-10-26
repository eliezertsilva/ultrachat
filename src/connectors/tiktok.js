import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import { BaseConnector, cleanName, textPart } from './base.js';

function firstUrl(img) {
  if (!img) return '';
  if (Array.isArray(img.url)) return img.url[0] || '';
  if (Array.isArray(img.urlList)) return img.urlList[0] || '';
  if (Array.isArray(img.url_list)) return img.url_list[0] || '';
  return '';
}

function userFrom(data) {
  const u = data.user || {};
  const id = data.userIdentity || {};
  const roles = [];
  if (id.isAnchor) roles.push('owner');
  if (id.isModeratorOfAnchor) roles.push('mod');
  if (id.isSubscriberOfAnchor) roles.push('sub');
  if (u.verified) roles.push('verified');
  const login = (u.uniqueId || u.displayId || '').toLowerCase();
  return {
    name: u.nickname || u.uniqueId || 'TikTok',
    login,
    avatar: firstUrl(u.avatarThumb) || firstUrl(u.profilePicture) || firstUrl(u.avatarMedium),
    roles,
  };
}

export class TikTokConnector extends BaseConnector {
  constructor(hub) {
    super(hub, 'tiktok');
    this.conn = null;
  }

  async connect(gen) {
    const username = cleanName(this.cfg.username, /^https?:\/\/(www\.|m\.)?tiktok\.com\/@?/i);
    if (!username) return this.setStatus('error', 'Informe o @ do TikTok.');

    this.setStatus('connecting', `Procurando a live de @${username}...`);
    const conn = new TikTokLiveConnection(username, {
      signApiKey: this.cfg.signApiKey || undefined,
      // The gift list endpoint needs a paid Euler plan; gift name/image already come in each gift event.
      enableExtendedGiftInfo: false,
      processInitialData: false,
    });
    this.conn = conn;
    const cfg = this.cfg;
    const live = (fn) => (data) => {
      if (this.isCurrent(gen)) fn(data);
    };

    conn.on(
      WebcastEvent.CHAT,
      live((d) => {
        this.publish({ sourceId: d.common?.msgId, user: userFrom(d), parts: [textPart(d.content ?? d.comment ?? '')] });
      }),
    );

    conn.on(
      WebcastEvent.GIFT,
      live((d) => {
        if (!cfg.showGifts) return;
        const g = d.giftDetails || {};
        // Streakable gifts (type 1) fire repeatedly; only show the final count.
        if (g.giftType === 1 && !d.repeatEnd) return;
        const name = g.giftName || d.extendedGiftInfo?.name || 'presente';
        const count = d.repeatCount || 1;
        const image = firstUrl(g.giftImage) || firstUrl(g.icon) || firstUrl(d.extendedGiftInfo?.image);
        const diamonds = (g.diamondCount || d.extendedGiftInfo?.diamond_count || 0) * count;
        this.publish({
          type: 'gift',
          user: userFrom(d),
          highlight: `enviou ${count > 1 ? count + 'x ' : ''}${name}`,
          amount: diamonds ? `${diamonds} 💎` : undefined,
          image,
          parts: [],
        });
      }),
    );

    conn.on(
      WebcastEvent.FOLLOW,
      live((d) => {
        if (cfg.showFollows) this.publish({ type: 'follow', user: userFrom(d), highlight: 'começou a seguir', parts: [] });
      }),
    );

    conn.on(
      WebcastEvent.SHARE,
      live((d) => {
        if (cfg.showShares) this.publish({ type: 'event', user: userFrom(d), highlight: 'compartilhou a live', parts: [] });
      }),
    );

    conn.on(
      WebcastEvent.MEMBER,
      live((d) => {
        if (cfg.showJoins) this.publish({ type: 'event', user: userFrom(d), highlight: 'entrou na live', parts: [] });
      }),
    );

    conn.on(
      WebcastEvent.SUBSCRIBE,
      live((d) => {
        this.publish({ type: 'sub', user: userFrom(d), highlight: 'se inscreveu!', parts: [] });
      }),
    );

    conn.on(
      WebcastEvent.STREAM_END,
      live(() => {
        this.setStatus('waiting', 'A live terminou. Vou checar de novo em 60s.');
        this.retry(60_000, gen);
      }),
    );

    conn.on(
      ControlEvent.DISCONNECTED,
      live(() => {
        this.setStatus('connecting', 'Desconectado, tentando de novo em 15s...');
        this.retry(15_000, gen);
      }),
    );

    conn.on(ControlEvent.ERROR, () => {}); // errors are handled below; avoid crash on unhandled 'error'

    try {
      const state = await conn.connect();
      if (!this.isCurrent(gen)) return conn.disconnect();
      this.setStatus('connected', `@${username} (sala ${state.roomId})`);
    } catch (err) {
      if (!this.isCurrent(gen)) return;
      const msg = err?.message || String(err);
      const offline = err?.name === 'UserOfflineError' || /offline|not.*live|isn't online|ended/i.test(msg);
      if (offline) {
        this.setStatus('waiting', `@${username} não está ao vivo. Vou checar de novo em 60s.`);
        this.retry(60_000, gen);
      } else if (/rate.?limit/i.test(msg)) {
        this.setStatus('error', 'Limite do servidor de assinatura do TikTok atingido. Tentando de novo em 2 min (uma API key resolve).');
        this.retry(120_000, gen);
      } else {
        this.setStatus('error', `${msg}. Tentando de novo em 30s.`);
        this.retry(30_000, gen);
      }
    }
  }

  disconnect() {
    if (this.conn) {
      const c = this.conn;
      this.conn = null;
      try {
        c.removeAllListeners?.();
        c.on?.('error', () => {});
        c.disconnect();
      } catch {
        /* ignore */
      }
    }
  }
}
