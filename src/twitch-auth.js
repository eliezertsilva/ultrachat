import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';
import { fileURLToPath } from 'node:url';
import { cleanName } from './connectors/base.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const AUTH_PATH = path.join(ROOT, 'auth.json');

// Client ID of the UltraChat app registered on dev.twitch.tv (public client, device code flow).
// Can be overridden in the panel (Conexões → Twitch → Client ID).
export const DEFAULT_TWITCH_CLIENT_ID = '';

const SCOPES = ['moderator:read:followers'];
const ID = 'https://id.twitch.tv/oauth2';
const HELIX = 'https://api.twitch.tv/helix';
const EVENTSUB_URL = 'wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30';

/**
 * Optional streamer login for Twitch. Uses the device code flow (the streamer types a code
 * on twitch.tv/activate; no password or client secret ever touches UltraChat) and EventSub over
 * WebSocket for events the anonymous chat cannot see — today: new followers.
 */
export class TwitchAuth {
  constructor(hub, getConfig, file = AUTH_PATH) {
    this.hub = hub;
    this.getConfig = getConfig;
    this.file = file;
    this.data = this.load();
    this.pending = null; // { deviceCode, userCode, verificationUri, expiresAt, interval, timer }
    this.error = '';
    this.detail = '';
    this.ws = null;
    this.wsGen = 0;
    this.watchdog = null;
    this.subscribedFor = '';
  }

  get clientId() {
    return String(this.getConfig().twitch?.clientId || '').trim() || DEFAULT_TWITCH_CLIENT_ID;
  }

  // ---------- storage ----------
  load() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8')).twitch || null;
    } catch {
      return null;
    }
  }

  persist() {
    let all = {};
    try {
      all = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      /* new file */
    }
    if (this.data) all.twitch = this.data;
    else delete all.twitch;
    fs.writeFileSync(this.file, JSON.stringify(all, null, 2), { mode: 0o600 });
  }

  // ---------- status ----------
  status() {
    if (this.pending) {
      return { state: 'pending', userCode: this.pending.userCode, verificationUri: this.pending.verificationUri };
    }
    if (this.data) return { state: 'connected', login: this.data.login, detail: this.detail };
    return { state: 'off', error: this.error };
  }

  announce() {
    this.hub.emit('broadcast', { type: 'twitchAuth', auth: this.status() });
  }

  // ---------- device code login ----------
  async start() {
    this.cancelPending();
    this.error = '';
    if (!this.clientId) {
      this.error = 'Falta o Client ID do app da Twitch (Conexões → Twitch → Client ID).';
      return this.status();
    }
    const res = await fetch(`${ID}/device`, {
      method: 'POST',
      body: new URLSearchParams({ client_id: this.clientId, scopes: SCOPES.join(' ') }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.device_code) {
      this.error = `A Twitch recusou o pedido (${json.message || res.status}). Confira o Client ID.`;
      return this.status();
    }
    this.pending = {
      deviceCode: json.device_code,
      userCode: json.user_code,
      verificationUri: json.verification_uri || 'https://www.twitch.tv/activate',
      expiresAt: Date.now() + (json.expires_in || 1800) * 1000,
      interval: Math.max(2, json.interval || 5) * 1000,
    };
    this.schedulePoll();
    return this.status();
  }

  schedulePoll() {
    const p = this.pending;
    if (!p) return;
    p.timer = setTimeout(() => this.poll().catch((err) => console.error('[twitch-login]', err.message)), p.interval);
  }

  async poll() {
    const p = this.pending;
    if (!p) return;
    if (Date.now() > p.expiresAt) {
      this.pending = null;
      this.error = 'O código expirou. Clique em Conectar de novo.';
      return this.announce();
    }
    const res = await fetch(`${ID}/token`, {
      method: 'POST',
      body: new URLSearchParams({
        client_id: this.clientId,
        scopes: SCOPES.join(' '),
        device_code: p.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (this.pending !== p) return; // cancelled meanwhile
    if (!res.ok) {
      if (/authorization_pending|slow_down/i.test(json.message || '')) return this.schedulePoll();
      this.pending = null;
      this.error = /denied/i.test(json.message || '') ? 'Você recusou a autorização na Twitch.' : `Login falhou: ${json.message || res.status}`;
      return this.announce();
    }
    this.pending = null;
    await this.saveTokens(json);
    const me = await this.helix('/users');
    this.data.userId = me.data?.[0]?.id;
    this.data.login = me.data?.[0]?.login;
    this.persist();
    this.announce();
    this.refreshEvents();
  }

  cancelPending() {
    if (this.pending?.timer) clearTimeout(this.pending.timer);
    this.pending = null;
  }

  async saveTokens(json) {
    this.data = {
      ...(this.data || {}),
      accessToken: json.access_token,
      refreshToken: json.refresh_token || this.data?.refreshToken,
      expiresAt: Date.now() + (json.expires_in || 3600) * 1000,
      scopes: json.scope || SCOPES,
    };
    this.persist();
  }

  async logout() {
    this.cancelPending();
    const token = this.data?.accessToken;
    this.data = null;
    this.error = '';
    this.detail = '';
    this.persist();
    this.closeEvents();
    if (token && this.clientId) {
      fetch(`${ID}/revoke`, { method: 'POST', body: new URLSearchParams({ client_id: this.clientId, token }) }).catch(() => {});
    }
    this.announce();
    return this.status();
  }

  // ---------- API calls ----------
  async token() {
    if (!this.data) throw new Error('não conectado');
    if (Date.now() < this.data.expiresAt - 120_000) return this.data.accessToken;
    // Public clients refresh without a secret; each refresh token works only once.
    const res = await fetch(`${ID}/token`, {
      method: 'POST',
      body: new URLSearchParams({ client_id: this.clientId, grant_type: 'refresh_token', refresh_token: this.data.refreshToken }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.access_token) {
      this.data = null;
      this.persist();
      this.closeEvents();
      this.error = 'A conexão com a Twitch expirou. Conecte de novo.';
      this.announce();
      throw new Error('refresh falhou');
    }
    await this.saveTokens(json);
    return this.data.accessToken;
  }

  async helix(pathname, init = {}) {
    const res = await fetch(`${HELIX}${pathname}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${await this.token()}`,
        'Client-Id': this.clientId,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(json.message || `HTTP ${res.status}`), { status: res.status });
    return json;
  }

  // ---------- EventSub (WebSocket) ----------
  /** (Re)connects when logged in and a Twitch channel is set; call after config changes. */
  refreshEvents() {
    const channel = cleanName(this.getConfig().twitch?.channel, /^https?:\/\/(www\.|m\.)?twitch\.tv\//i).toLowerCase();
    if (!this.data || !channel) return this.closeEvents();
    if (this.ws && this.subscribedFor === channel) return;
    this.closeEvents();
    this.openEvents(EVENTSUB_URL, channel, true);
  }

  closeEvents() {
    this.wsGen++;
    clearTimeout(this.watchdog);
    this.subscribedFor = '';
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.on('error', () => {});
      this.ws.terminate();
      this.ws = null;
    }
  }

  openEvents(url, channel, subscribe) {
    const gen = ++this.wsGen;
    const ws = new WebSocket(url);
    let keepalive = 40;
    const kick = () => {
      clearTimeout(this.watchdog);
      this.watchdog = setTimeout(() => ws.terminate(), (keepalive + 10) * 1000);
    };

    ws.on('message', async (raw) => {
      if (gen !== this.wsGen) return;
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      kick();
      const type = msg.metadata?.message_type;
      if (type === 'session_welcome') {
        const old = this.ws;
        this.ws = ws;
        if (old && old !== ws) {
          old.removeAllListeners();
          old.on('error', () => {});
          old.close();
        }
        keepalive = msg.payload?.session?.keepalive_timeout_seconds || 30;
        kick();
        if (subscribe) await this.subscribe(msg.payload.session.id, channel).catch((err) => this.setDetail(err.message));
      } else if (type === 'session_reconnect') {
        // Twitch moves us: open the new URL; subscriptions carry over (no resubscribe).
        this.openEvents(msg.payload.session.reconnect_url, channel, false);
      } else if (type === 'notification') {
        this.onEvent(msg.payload?.subscription?.type, msg.payload?.event || {});
      } else if (type === 'revocation') {
        this.setDetail('a Twitch cancelou a inscrição de eventos; conecte de novo');
      }
    });

    ws.on('close', () => {
      if (gen !== this.wsGen || ws !== this.ws) return;
      this.ws = null;
      this.subscribedFor = '';
      setTimeout(() => this.refreshEvents(), 5000);
    });
    ws.on('error', () => {});
    if (subscribe) this.ws = ws;
  }

  async subscribe(sessionId, channel) {
    const users = await this.helix(`/users?login=${encodeURIComponent(channel)}`);
    const broadcasterId = users.data?.[0]?.id;
    if (!broadcasterId) throw new Error(`canal ${channel} não encontrado`);
    try {
      await this.helix('/eventsub/subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          type: 'channel.follow',
          version: '2',
          condition: { broadcaster_user_id: broadcasterId, moderator_user_id: this.data.userId },
          transport: { method: 'websocket', session_id: sessionId },
        }),
      });
    } catch (err) {
      if (err.status === 403) throw new Error(`a conta ${this.data.login} não é dona nem moderadora de ${channel}`);
      throw err;
    }
    this.subscribedFor = channel;
    this.setDetail(`recebendo follows de ${channel}`);
  }

  setDetail(text) {
    this.detail = text;
    this.announce();
  }

  onEvent(type, e) {
    if (type === 'channel.follow') {
      this.hub.publish({
        platform: 'twitch',
        type: 'follow',
        user: { name: e.user_name || e.user_login, login: (e.user_login || '').toLowerCase() },
        highlight: 'começou a seguir',
        parts: [],
      });
    }
  }
}
