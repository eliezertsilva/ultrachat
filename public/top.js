// Ranking overlay. URL options:
//   ?limit=5            how many people (1–50)
//   ?title=Top%20da%20live   heading (empty = no heading)
//   ?platforms=tiktok,twitch only these platforms
//   ?fontSize=20        base size in px
//   ?avatars=0          hide profile pictures
(() => {
  const params = new URLSearchParams(location.search);
  const limit = Math.min(50, Math.max(1, Number(params.get('limit')) || 5));
  const only = (params.get('platforms') || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const showAvatars = !['0', 'false'].includes(params.get('avatars'));
  const title = params.has('title') ? params.get('title') : `Top ${limit}`;
  if (params.get('fontSize')) document.documentElement.style.setProperty('--font-size', `${Number(params.get('fontSize'))}px`);

  const titleEl = document.getElementById('title');
  titleEl.textContent = title;
  titleEl.hidden = !title;
  const list = document.getElementById('list');
  const empty = document.getElementById('empty');
  const safeUrl = (u) => (typeof u === 'string' && /^https:\/\//i.test(u) ? u : '');
  const fmt = (n) => Number(n).toLocaleString('pt-BR');

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  let lastPoints = new Map();

  function render(board) {
    const rows = (board || []).filter((t) => !only.length || only.includes(t.platform)).slice(0, limit);
    const seen = new Map();
    list.replaceChildren(
      ...rows.map((t, i) => {
        const li = el('li', `row pos-${i + 1}`);
        li.dataset.platform = t.platform;
        li.append(el('span', 'pos', String(i + 1)));
        if (showAvatars && safeUrl(t.avatar)) {
          const av = el('img', 'avatar');
          av.src = t.avatar;
          av.alt = '';
          av.referrerPolicy = 'no-referrer';
          av.onerror = () => av.remove();
          li.append(av);
        }
        const who = el('span', 'who');
        const line = el('span', 'line');
        line.append(MC.icon(t.platform), el('span', 'name', t.name));
        who.append(line);
        if (t.rank) who.append(el('span', 'rank', t.rank));
        li.append(who, el('span', 'points', fmt(t.points)));
        const before = lastPoints.get(t.key);
        if (before !== undefined && before !== t.points) li.classList.add('bump');
        seen.set(t.key, t.points);
        return li;
      }),
    );
    lastPoints = seen;
    empty.hidden = rows.length > 0;
  }

  function connect() {
    const ws = new WebSocket(`ws://${location.host}/ws`);
    ws.onmessage = (ev) => {
      const data = JSON.parse(ev.data);
      if (data.type === 'hello') render(data.leaderboard);
      else if (data.type === 'leaderboard') render(data.top);
    };
    ws.onclose = () => setTimeout(connect, 2000);
  }

  connect();
})();
