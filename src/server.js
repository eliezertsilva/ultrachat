import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { loadConfig, saveConfig } from './config.js';
import { Hub } from './hub.js';
import { Loyalty } from './loyalty.js';
import { TwitchConnector } from './connectors/twitch.js';
import { TikTokConnector } from './connectors/tiktok.js';
import { YouTubeConnector } from './connectors/youtube.js';
import { KickConnector } from './connectors/kick.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = '127.0.0.1';

let config = loadConfig();
const hub = new Hub(() => config);
const loyalty = new Loyalty(hub, () => config);

const connectors = {
  twitch: new TwitchConnector(hub),
  tiktok: new TikTokConnector(hub),
  youtube: new YouTubeConnector(hub),
  kick: new KickConnector(hub),
};

/** Starts/stops each connector; only touches the ones whose settings changed. */
function applyConnectors(prev) {
  for (const [name, conn] of Object.entries(connectors)) {
    const now = config[name];
    const changed = !prev || JSON.stringify(prev[name]) !== JSON.stringify(now);
    if (!changed) continue;
    if (now.enabled) conn.start({ ...now });
    else conn.stop();
  }
}

// ---------- HTTP ----------
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(ROOT, 'public')));

app.get('/api/config', (_req, res) => res.json(config));

// OBS loads browser sources before this server is up; a source pointing at the
// local loader page waits for the server instead of showing an error page.
app.get('/api/source-url', (_req, res) => {
  const loader = pathToFileURL(path.join(ROOT, 'dock-loader.html')).href;
  const to = `http://localhost:${config.port}/overlay.html`;
  res.json({ url: `${loader}?to=${encodeURIComponent(to)}` });
});

app.post('/api/config', (req, res) => {
  const prev = config;
  config = saveConfig(req.body || {});
  applyConnectors(prev);
  broadcast({ type: 'config', overlay: config.overlay });
  loyalty.leaderboardChanged(); // rank names may have changed
  res.json({ ok: true, config, restartNeeded: prev.port !== config.port });
});

app.post('/api/reconnect', (_req, res) => {
  applyConnectors(null);
  res.json({ ok: true });
});

app.post('/api/clear', (_req, res) => {
  hub.clear();
  res.json({ ok: true });
});

app.post('/api/test', (_req, res) => {
  sendTestMessages();
  res.json({ ok: true });
});

app.get('/api/loyalty', (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 50));
  res.json({ top: loyalty.top(limit), ...loyalty.stats() });
});

app.post('/api/loyalty/reset', (_req, res) => {
  loyalty.reset();
  res.json({ ok: true });
});

app.post('/api/shutdown', (_req, res) => {
  res.json({ ok: true });
  console.log('Encerrando a pedido do OBS...');
  setTimeout(() => process.exit(0), 200);
});

// ---------- WebSocket for overlays and the panel ----------
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('error', () => {}); // listen errors are handled on `server` below

function broadcast(payload) {
  const data = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(data);
  }
}

hub.on('broadcast', broadcast);

wss.on('connection', (ws) => {
  ws.send(
    JSON.stringify({
      type: 'hello',
      overlay: config.overlay,
      history: hub.history,
      status: hub.status,
      leaderboard: loyalty.top(50),
    }),
  );
});

// Keep sockets alive behind OBS's browser (it can silently drop idle sockets).
setInterval(() => {
  for (const client of wss.clients) if (client.readyState === 1) client.ping();
}, 30_000);

function sendTestMessages() {
  const samples = [
    {
      platform: 'tiktok',
      user: { name: 'Fã do TikTok', login: 'fa_tiktok', roles: ['sub'] },
      parts: [{ type: 'text', text: 'Mensagem de teste vinda do TikTok! 🎉' }],
    },
    {
      platform: 'twitch',
      user: { name: 'ViewerTwitch', login: 'viewertwitch', color: '#1E90FF', roles: ['mod'] },
      parts: [
        { type: 'text', text: 'Olá do chat da Twitch ' },
        { type: 'emote', url: 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0', alt: 'Kappa' },
      ],
    },
    {
      platform: 'youtube',
      user: { name: '@inscritoYT', login: 'inscritoyt', roles: ['member'] },
      parts: [{ type: 'text', text: 'Teste do YouTube funcionando 👍' }],
    },
    {
      platform: 'kick',
      user: { name: 'KickFan', login: 'kickfan', color: '#53FC18', roles: ['vip'] },
      parts: [{ type: 'text', text: 'Kick também aparece aqui!' }],
    },
    {
      platform: 'tiktok',
      type: 'gift',
      user: { name: 'Doador', login: 'doador' },
      highlight: 'enviou 5x Rosa',
      amount: '5 💎',
      parts: [],
    },
    {
      platform: 'twitch',
      type: 'bot',
      user: { name: config.loyalty.botName || 'UltraChat', roles: ['bot'], color: '#a78bfa' },
      parts: [{ type: 'text', text: '@ViewerTwitch: rank Veterano · 2.340 pts · #3 no geral · faltam 7.660 para Elite.' }],
    },
  ];
  // Test messages never earn points or run commands.
  for (const s of samples) s.test = true;
  samples.forEach((s, i) => setTimeout(() => hub.publish(s), i * 600));
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`A porta ${config.port} já está em uso — provavelmente o UltraChat já está rodando.`);
    process.exit(0);
  }
  throw err;
});

server.listen(config.port, HOST, () => {
  const base = `http://localhost:${config.port}`;
  console.log('');
  console.log('  UltraChat para OBS rodando!');
  console.log(`  Painel de configuração: ${base}/`);
  console.log(`  Overlay (Fonte de Navegador): ${base}/overlay.html`);
  console.log(`  Dock (chat para você ler): ${base}/overlay.html?dock=1`);
  console.log('');
  applyConnectors(null);
});

// Save points before exiting (process.exit from /api/shutdown, Ctrl+C, closing the window).
process.on('exit', () => loyalty.flush());
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => process.exit(0));

process.on('unhandledRejection', (err) => console.error('[erro]', err?.message || err));
process.on('uncaughtException', (err) => {
  if (err?.code === 'EADDRINUSE') {
    console.log(`A porta ${config.port} já está em uso — o UltraChat provavelmente já está rodando.`);
    process.exit(0);
  }
  console.error('[erro]', err?.message || err);
});
