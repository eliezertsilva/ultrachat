import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONFIG_PATH = path.join(ROOT, 'config.json');

export const DEFAULT_CONFIG = {
  port: 8787,
  twitch: { enabled: false, channel: '' },
  tiktok: {
    enabled: false,
    username: '',
    signApiKey: '',
    showGifts: true,
    showFollows: true,
    showShares: false,
    showJoins: false,
  },
  youtube: { enabled: false, channel: '' },
  kick: { enabled: false, channel: '', chatroomId: '', pusherKey: '' },
  filters: {
    hideCommands: true,
    blockedUsers: 'nightbot, streamelements, moobot',
  },
  loyalty: {
    enabled: true,
    pointsPerMessage: 5,
    messageCooldown: 60, // segundos entre mensagens que valem pontos
    pointsPerFollow: 50, // só no primeiro follow de cada pessoa
    pointsPerSub: 500,
    pointsPerDiamond: 10, // TikTok
    pointsPerBit: 1, // Twitch
    pointsPerSuperChat: 100, // YouTube, por unidade da moeda
    commandCooldown: 10, // segundos, por pessoa e por comando
    botName: 'UltraChat',
    commands: { points: '!pontos, !points', rank: '!rank', top: '!top' },
    ranks: [
      { name: 'Novato', min: 0 },
      { name: 'Frequente', min: 500 },
      { name: 'Veterano', min: 2000 },
      { name: 'Elite', min: 10000 },
      { name: 'Lenda', min: 50000 },
    ],
  },
  overlay: {
    theme: 'bubble', // bubble | clean | compact
    fontSize: 18,
    maxMessages: 25,
    hideAfter: 0, // segundos; 0 = nunca some
    showAvatars: true,
    showPlatformIcon: true,
    showBadges: true,
    animation: true,
    bgOpacity: 0.6,
    align: 'left', // left | right
  },
};

function merge(base, extra) {
  if (typeof base !== 'object' || base === null || Array.isArray(base)) {
    return extra === undefined ? base : extra;
  }
  const out = { ...base };
  for (const key of Object.keys(extra || {})) {
    out[key] = key in base ? merge(base[key], extra[key]) : extra[key];
  }
  return out;
}

export function loadConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return merge(DEFAULT_CONFIG, raw);
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}

export function saveConfig(cfg) {
  const full = merge(DEFAULT_CONFIG, cfg);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(full, null, 2));
  return full;
}
