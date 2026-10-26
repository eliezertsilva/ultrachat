(() => {
  const params = new URLSearchParams(location.search);
  const isDock = params.has('dock');
  const onlyPlatforms = (params.get('platforms') || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const chat = document.getElementById('chat');
  const offline = document.getElementById('offline');
  let settings = {};

  // Any overlay setting can be overridden per Browser Source via the URL,
  // e.g. overlay.html?theme=compact&fontSize=22
  function withUrlOverrides(base) {
    const out = { ...base };
    for (const [k, v] of params) {
      if (!(k in out)) continue;
      if (typeof out[k] === 'boolean') out[k] = v === '1' || v === 'true';
      else if (typeof out[k] === 'number') out[k] = Number(v);
      else out[k] = v;
    }
    return out;
  }

  function applySettings(overlay) {
    settings = withUrlOverrides(overlay || {});
    const b = document.body;
    b.className = '';
    b.classList.add(`theme-${settings.theme || 'bubble'}`);
    if (isDock) b.classList.add('dock');
    if (settings.align === 'right') b.classList.add('align-right');
    if (settings.animation && !isDock) b.classList.add('animate');
    if (!settings.showAvatars) b.classList.add('no-avatars');
    if (!settings.showPlatformIcon) b.classList.add('no-icons');
    if (!settings.showBadges) b.classList.add('no-badges');
    document.documentElement.style.setProperty('--font-size', `${settings.fontSize || 18}px`);
    document.documentElement.style.setProperty('--bg-alpha', String(settings.bgOpacity ?? 0.6));
    trim();
  }

  // ---------- helpers ----------
  const safeUrl = (u) => (typeof u === 'string' && /^https:\/\//i.test(u) ? u : '');

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function hashColor(name) {
    let h = 0;
    for (const c of name) h = (h * 31 + c.codePointAt(0)) >>> 0;
    return `hsl(${h % 360} 85% 68%)`;
  }

  // Twitch users sometimes pick very dark colors; lift them so they stay readable.
  function readableColor(hex, fallbackName) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return hashColor(fallbackName || '?');
    const n = parseInt(m[1], 16);
    const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (lum >= 90) return `#${m[1]}`;
    const k = 90 / Math.max(lum, 1);
    const lift = (v) => Math.min(255, Math.round(v * k + 40));
    return `rgb(${lift(r)} ${lift(g)} ${lift(b)})`;
  }

  function renderParts(parts) {
    const span = el('span', 'text');
    for (const p of parts || []) {
      if (p.type === 'emote' && safeUrl(p.url)) {
        const img = el('img', 'emote');
        img.src = p.url;
        img.alt = p.alt || '';
        img.title = p.alt || '';
        span.append(img);
      } else if (p.text) {
        span.append(document.createTextNode(p.text));
      }
    }
    return span;
  }

  function renderMessage(m) {
    const row = el('div', 'msg');
    row.dataset.platform = m.platform;
    row.dataset.id = m.id;
    if (m.sourceId) row.dataset.sourceId = m.sourceId;
    if (m.user?.login) row.dataset.login = m.user.login;
    if (m.type && m.type !== 'chat') row.classList.add('event', `type-${m.type}`);

    if (m.user?.avatar && safeUrl(m.user.avatar)) {
      const av = el('img', 'avatar');
      av.src = m.user.avatar;
      av.alt = '';
      av.referrerPolicy = 'no-referrer';
      av.onerror = () => av.remove();
      row.append(av);
    }

    const body = el('div', 'body');
    const head = el('span', 'head');
    head.append(MC.icon(m.platform));

    if (m.user?.badgeUrl && safeUrl(m.user.badgeUrl)) {
      const bi = el('img', 'badge-img');
      bi.src = m.user.badgeUrl;
      head.append(bi);
    }
    for (const r of m.user?.roles || []) {
      const label = MC.ROLE_LABELS[r];
      if (label) head.append(el('span', `role ${label.cls}`, label.text));
    }

    const name = el('span', 'name', m.user?.name || '');
    name.style.color = readableColor(m.user?.color, m.user?.name);
    head.append(name);
    body.append(head);

    if (m.highlight) body.append(document.createTextNode(' '), el('span', 'highlight', m.highlight));
    if (m.amount) body.append(document.createTextNode(' '), el('span', 'amount', m.amount));
    if (m.image && safeUrl(m.image)) {
      const gi = el('img', 'event-img');
      gi.src = m.image;
      gi.alt = '';
      body.append(document.createTextNode(' '), gi);
    }

    const text = renderParts(m.parts);
    if (m.action) text.style.fontStyle = 'italic';
    if (text.childNodes.length) {
      body.append(document.createTextNode(' '), text);
    }

    row.append(body);
    return row;
  }

  // ---------- list management ----------
  function maxMessages() {
    return isDock ? 300 : Math.max(1, settings.maxMessages || 25);
  }

  function trim() {
    const rows = chat.querySelectorAll('.msg:not(.leaving)');
    for (let i = 0; i < rows.length - maxMessages(); i++) rows[i].remove();
  }

  function removeRow(row) {
    if (!row || row.classList.contains('leaving')) return;
    if (!document.body.classList.contains('animate')) return row.remove();
    row.classList.add('leaving');
    setTimeout(() => row.remove(), 500);
  }

  function addMessage(m, fromHistory = false) {
    if (onlyPlatforms.length && !onlyPlatforms.includes(m.platform)) return;
    const hideAfter = isDock ? 0 : Number(settings.hideAfter || 0);
    if (fromHistory && hideAfter && Date.now() - m.ts > hideAfter * 1000) return;

    const atBottom = !isDock || window.innerHeight + window.scrollY >= document.body.scrollHeight - 40;
    const row = renderMessage(m);
    chat.append(row);
    trim();

    if (hideAfter) {
      const left = hideAfter * 1000 - (Date.now() - m.ts);
      setTimeout(() => removeRow(row), Math.max(0, left));
    }
    if (isDock && atBottom) window.scrollTo(0, document.body.scrollHeight);
  }

  // ---------- connection ----------
  function connect() {
    const ws = new WebSocket(`ws://${location.host}/ws`);
    ws.onopen = () => (offline.hidden = true);
    ws.onmessage = (ev) => {
      const data = JSON.parse(ev.data);
      switch (data.type) {
        case 'hello':
          applySettings(data.overlay);
          chat.replaceChildren();
          for (const m of data.history || []) addMessage(m, true);
          break;
        case 'config':
          applySettings(data.overlay);
          break;
        case 'message':
          addMessage(data.msg);
          break;
        case 'delete':
          chat
            .querySelectorAll(`.msg[data-platform="${data.platform}"]`)
            .forEach((r) => r.dataset.sourceId === String(data.sourceId) && removeRow(r));
          break;
        case 'deleteUser':
          chat
            .querySelectorAll(`.msg[data-platform="${data.platform}"]`)
            .forEach((r) => r.dataset.login === data.login && removeRow(r));
          break;
        case 'clear':
          chat.replaceChildren();
          break;
      }
    };
    ws.onclose = () => {
      // Only the dock shows the warning; the stream overlay stays clean.
      if (isDock) offline.hidden = false;
      setTimeout(connect, 2000);
    };
  }

  applySettings({});
  connect();
})();
