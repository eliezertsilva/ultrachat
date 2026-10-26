// Shared by the overlay and the settings panel.
window.MC = (() => {
  const PLATFORMS = {
    tiktok: {
      label: 'TikTok',
      color: '#FE2C55',
      svg: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64 0 3.33 2.76 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3s-1.88.09-3.24-1.48z"/></svg>',
    },
    twitch: {
      label: 'Twitch',
      color: '#9146FF',
      svg: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4.3 2 3 5.4V19.3h4.7V22h2.7l2.6-2.7h3.9L22 14.2V2H4.3zm15.9 11.3-3.1 3.1h-4.8L9.7 19v-2.6H5.7V3.8h14.5v9.5zM17.3 7v5.3h-1.8V7h1.8zm-4.9 0v5.3h-1.8V7h1.8z"/></svg>',
    },
    youtube: {
      label: 'YouTube',
      color: '#FF0033',
      svg: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8zM9.7 15.1V8.9l5.8 3.1-5.8 3.1z"/></svg>',
    },
    kick: {
      label: 'Kick',
      color: '#53FC18',
      svg: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 3h6v5h2V6h2V4h2V3h6v6h-2v2h-2v2h2v2h2v6h-6v-1h-2v-2h-2v-2H9v5H3z"/></svg>',
    },
  };

  const ROLE_LABELS = {
    owner: { text: 'DONO', cls: 'owner' },
    mod: { text: 'MOD', cls: 'mod' },
    vip: { text: 'VIP', cls: 'vip' },
    sub: { text: 'SUB', cls: 'sub' },
    member: { text: 'MEMBRO', cls: 'sub' },
    verified: { text: '✔', cls: 'verified' },
  };

  function icon(platform) {
    const p = PLATFORMS[platform];
    const el = document.createElement('span');
    el.className = 'pf-icon';
    el.style.color = p ? p.color : '#888';
    el.innerHTML = p ? p.svg : '';
    el.title = p ? p.label : platform;
    return el;
  }

  return { PLATFORMS, ROLE_LABELS, icon };
})();
