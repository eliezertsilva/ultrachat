import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MEDIA_DIR = path.join(ROOT, 'media');
export const GIFTS_PATH = path.join(ROOT, 'gifts.json');

const MAX_REPEAT = 10;
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.m4v']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.apng', '.svg']);
const AUDIO_EXT = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.opus']);

export function mediaKind(file) {
  const ext = path.extname(file).toLowerCase();
  if (VIDEO_EXT.has(ext)) return 'video';
  if (IMAGE_EXT.has(ext)) return 'image';
  if (AUDIO_EXT.has(ext)) return 'audio';
  return '';
}

// ---------- media files ----------
export function listMedia() {
  try {
    return fs
      .readdirSync(MEDIA_DIR, { withFileTypes: true })
      .filter((d) => d.isFile() && mediaKind(d.name))
      .map((d) => ({ name: d.name, kind: mediaKind(d.name), size: fs.statSync(path.join(MEDIA_DIR, d.name)).size }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/** Keeps letters, digits, dot, dash, underscore and space; never overwrites an existing file. */
export function saveMedia(originalName, data) {
  const ext = path.extname(originalName).toLowerCase();
  if (!mediaKind(originalName)) throw new Error('Tipo de arquivo não suportado.');
  const base =
    path
      .basename(originalName, path.extname(originalName))
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\w .-]+/g, '')
      .trim()
      .slice(0, 60) || 'midia';
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  let name = `${base}${ext}`;
  for (let i = 2; fs.existsSync(path.join(MEDIA_DIR, name)); i++) name = `${base}-${i}${ext}`;
  fs.writeFileSync(path.join(MEDIA_DIR, name), data);
  return name;
}

export function deleteMedia(name) {
  const file = path.join(MEDIA_DIR, path.basename(String(name)));
  if (file.startsWith(MEDIA_DIR + path.sep) && fs.existsSync(file)) fs.unlinkSync(file);
}

const mediaUrl = (name) => (name && mediaKind(name) ? `/media/${encodeURIComponent(path.basename(name))}` : '');

// ---------- events ----------
export const EVENT_LABELS = {
  gift: 'Presente',
  follow: 'Novo seguidor',
  share: 'Compartilhamento',
  sub: 'Sub / membro',
  subgift: 'Subs de presente',
  bits: 'Bits',
  superchat: 'Super Chat',
  raid: 'Raid',
};

const DEFAULT_TEXT = {
  gift: '{nome} enviou {quantidade}x {presente}!',
  follow: '{nome} começou a seguir!',
  share: '{nome} compartilhou a live!',
  sub: '{nome} se inscreveu!',
  subgift: '{nome} presenteou {quantidade} subs!',
  bits: '{nome} mandou {quantidade} bits!',
  superchat: '{nome} mandou {valor}!',
  raid: 'Raid de {nome} com {quantidade} pessoas!',
};

function textOf(msg) {
  return (msg.parts || [])
    .map((p) => (p.type === 'text' ? p.text : p.alt || ''))
    .join('')
    .trim();
}

/**
 * Turns a hub message into an alert event: { event, amount, vars }.
 * `amount` is what the rule's min/max compare against.
 */
export function eventOf(msg) {
  const vars = {
    nome: msg.user?.name || '',
    plataforma: msg.platform,
    mensagem: textOf(msg),
    valor: msg.amount || '',
    quantidade: 1,
    presente: '',
    meses: msg.months || '',
  };
  switch (msg.type) {
    case 'gift':
      vars.presente = msg.gift?.name || '';
      vars.quantidade = msg.gift?.count || 1;
      return { event: 'gift', amount: Number(msg.diamonds) || 0, gift: msg.gift, vars };
    case 'follow':
      return { event: 'follow', amount: 0, vars };
    case 'share':
      return { event: 'share', amount: 0, vars };
    case 'raid':
      vars.quantidade = msg.viewers || '';
      return { event: 'raid', amount: Number(msg.viewers) || 0, vars };
    case 'donation':
      if (msg.bits) {
        vars.quantidade = msg.bits;
        return { event: 'bits', amount: msg.bits, vars };
      }
      return { event: 'superchat', amount: Number(msg.value) || 0, vars };
    case 'sub': {
      const kind = String(msg.kind || '');
      if (/gift/i.test(kind) && !/paidupgrade/i.test(kind)) {
        const n = msg.giftCount || 1;
        vars.quantidade = n;
        return { event: 'subgift', amount: n, kind, vars };
      }
      return { event: 'sub', amount: Number(msg.months) || 0, vars };
    }
  }
  return null;
}

function fill(template, vars) {
  return String(template || '').replace(/\{(\w+)\}/g, (all, k) => (k in vars ? String(vars[k]) : all));
}

const norm = (s) => String(s || '').trim().toLowerCase();

/**
 * Alerts: rules ("when X happens on platform P, play this video/sound/text")
 * evaluated for every message the hub receives, before display filters.
 * The overlay (alerts.html) keeps the queue so alerts never overlap.
 */
export class Alerts {
  constructor(hub, getConfig, giftsFile = GIFTS_PATH) {
    this.hub = hub;
    this.getConfig = getConfig;
    this.giftsFile = giftsFile;
    this.gifts = this.loadGifts();
    this.lastFired = new Map();
    this.massGifts = new Map(); // twitch gifter -> individual "subgift" notices still to swallow
    hub.on('incoming', (msg) => {
      try {
        this.handle(msg);
      } catch (err) {
        console.error('[alertas]', err?.message || err);
      }
    });
  }

  get cfg() {
    return this.getConfig().alerts || {};
  }

  // ---------- TikTok gift catalog (learned from the live) ----------
  loadGifts() {
    try {
      return JSON.parse(fs.readFileSync(this.giftsFile, 'utf8')) || {};
    } catch {
      return {};
    }
  }

  rememberGift(g) {
    if (!g?.name) return;
    const key = norm(g.name);
    const prev = this.gifts[key];
    const next = { name: g.name, diamonds: g.unitDiamonds || prev?.diamonds || 0, image: g.image || prev?.image || '' };
    if (prev && prev.diamonds === next.diamonds && prev.image === next.image) return;
    this.gifts[key] = next;
    try {
      fs.writeFileSync(this.giftsFile, JSON.stringify(this.gifts, null, 1));
    } catch {
      /* ignore */
    }
  }

  giftList() {
    return Object.values(this.gifts).sort((a, b) => a.diamonds - b.diamonds || a.name.localeCompare(b.name));
  }

  // ---------- matching ----------
  handle(msg) {
    if (msg.type === 'gift') this.rememberGift(msg.gift);
    if (!this.cfg.enabled || msg.test || msg.type === 'bot') return;
    const ev = eventOf(msg);
    if (!ev || this.swallowTwitchGift(msg, ev)) return;
    const rule = this.match(msg.platform, ev);
    if (!rule) return;
    const now = Date.now();
    const cooldown = Math.max(0, Number(rule.cooldown) || 0) * 1000;
    if (now - (this.lastFired.get(rule.id) || 0) < cooldown) return;
    this.lastFired.set(rule.id, now);

    const times = ev.event === 'gift' && rule.combo === 'each' ? Math.min(MAX_REPEAT, ev.vars.quantidade || 1) : 1;
    for (let i = 0; i < times; i++) this.fire(rule, ev.vars);
  }

  /** A Twitch gift of N subs = 1 summary + N individual notices. Alert once, on the summary. */
  swallowTwitchGift(msg, ev) {
    if (msg.platform !== 'twitch' || ev.event !== 'subgift') return false;
    const gifter = msg.user?.login || '';
    if (/mysterygift/i.test(ev.kind)) {
      this.massGifts.set(gifter, { left: ev.amount, until: Date.now() + 30_000 });
      return false;
    }
    const pending = this.massGifts.get(gifter);
    if (pending && pending.left > 0 && Date.now() < pending.until) {
      pending.left--;
      return true;
    }
    return false;
  }

  match(platform, ev) {
    const rules = (this.cfg.rules || []).filter((r) => {
      if (!r || r.enabled === false || r.event !== ev.event) return false;
      if (r.platform && r.platform !== 'any' && r.platform !== platform) return false;
      if (r.gift && norm(r.gift) !== norm(ev.gift?.name)) return false;
      const min = Number(r.min) || 0;
      const max = Number(r.max) || 0;
      if (ev.amount < min) return false;
      if (max && ev.amount > max) return false;
      return true;
    });
    // Most specific wins: a named gift, then a specific platform, then the highest minimum.
    rules.sort(
      (a, b) =>
        !!b.gift - !!a.gift ||
        (b.platform && b.platform !== 'any') - (a.platform && a.platform !== 'any') ||
        (Number(b.min) || 0) - (Number(a.min) || 0),
    );
    return rules[0] || null;
  }

  fire(rule, vars) {
    const media = rule.media && mediaKind(rule.media) !== 'audio' ? rule.media : '';
    this.hub.emit('broadcast', {
      type: 'alert',
      alert: {
        id: randomUUID(),
        rule: rule.id,
        media: media ? { url: mediaUrl(media), kind: mediaKind(media) } : null,
        sound: rule.sound ? mediaUrl(rule.sound) : '',
        volume: Math.min(100, Math.max(0, Number(rule.volume ?? 80))) / 100,
        text: fill(rule.text || DEFAULT_TEXT[rule.event] || '{nome}', vars),
        duration: Math.max(0, Number(rule.duration ?? 6)),
        position: rule.position || 'center',
        fontSize: Number(rule.fontSize) || 42,
        color: rule.color || '#ffffff',
        mediaSize: Number(rule.mediaSize) || 60,
      },
    });
  }

  /** "Testar" button: fires the rule with sample values. */
  test(ruleId) {
    const rule = (this.cfg.rules || []).find((r) => r.id === ruleId);
    if (!rule) return false;
    const sample = {
      nome: 'Fulano',
      plataforma: rule.platform && rule.platform !== 'any' ? rule.platform : 'tiktok',
      mensagem: 'Mensagem de teste!',
      valor: rule.event === 'superchat' ? 'R$ 10,00' : '',
      quantidade: rule.event === 'raid' ? 42 : rule.event === 'bits' ? 100 : rule.event === 'subgift' ? 5 : 3,
      presente: rule.gift || 'Rosa',
      meses: 6,
    };
    this.fire(rule, sample);
    return true;
  }
}

export const DEFAULT_RULE_TEXT = DEFAULT_TEXT;
