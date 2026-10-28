(() => {
  const form = document.getElementById('form');
  const base = location.origin;
  const urls = {
    overlayUrl: `${base}/overlay.html`,
    dockUrl: `${base}/overlay.html?dock=1`,
    panelUrl: `${base}/`,
    topUrl: `${base}/top.html`,
    alertsUrl: `${base}/alerts.html`,
  };
  for (const [id, url] of Object.entries(urls)) document.getElementById(id).textContent = url;
  document.getElementById('preview').src = urls.overlayUrl;

  // For the OBS source, prefer the loader URL: it survives OBS starting before the server.
  fetch('/api/source-url')
    .then((r) => r.json())
    .then(({ url }) => {
      urls.overlayUrl = url;
      document.getElementById('overlayUrl').textContent = url;
      if (url.includes('%2Foverlay.html')) {
        for (const page of ['top', 'alerts']) {
          urls[`${page}Url`] = url.replace('%2Foverlay.html', `%2F${page}.html`);
          document.getElementById(`${page}Url`).textContent = urls[`${page}Url`];
        }
      }
    })
    .catch(() => {});

  document.querySelectorAll('[data-icon]').forEach((el) => el.append(MC.icon(el.dataset.icon)));

  document.querySelectorAll('[data-copy]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const text = urls[btn.dataset.copy];
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = Object.assign(document.createElement('textarea'), { value: text });
        document.body.append(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      const old = btn.textContent;
      btn.textContent = 'Copiado!';
      setTimeout(() => (btn.textContent = old), 1200);
    }),
  );

  // ---------- form <-> config ----------
  let current = null;

  const get = (obj, pathStr) => pathStr.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  function set(obj, pathStr, value) {
    const keys = pathStr.split('.');
    let o = obj;
    for (const k of keys.slice(0, -1)) o = o[k] ??= {};
    o[keys.at(-1)] = value;
  }

  function fill(cfg) {
    for (const input of form.elements) {
      if (!input.name) continue;
      const v = get(cfg, input.name);
      if (input.type === 'checkbox') input.checked = !!v;
      else input.value = v ?? '';
    }
    ranksBox.value = (cfg.loyalty?.ranks || []).map((r) => `${r.name} = ${r.min}`).join('\n');
    AlertsEditor.load(cfg.alerts?.rules);
    updateOutputs();
  }

  function read() {
    const cfg = structuredClone(current);
    for (const input of form.elements) {
      if (!input.name) continue;
      let v;
      if (input.type === 'checkbox') v = input.checked;
      else if (input.type === 'number' || input.type === 'range') v = Number(input.value);
      else v = input.value.trim();
      set(cfg, input.name, v);
    }
    cfg.loyalty.ranks = parseRanks(ranksBox.value);
    cfg.alerts.rules = AlertsEditor.read();
    return cfg;
  }

  // "Nome = 500" per line (":" also works); lines without a number are ignored.
  const ranksBox = document.getElementById('ranks');
  function parseRanks(text) {
    const out = [];
    for (const line of text.split('\n')) {
      const m = /^(.+?)\s*[=:]\s*(\d[\d.]*)\s*$/.exec(line.trim());
      if (m) out.push({ name: m[1].trim(), min: Number(m[2].replace(/\./g, '')) });
    }
    return out.sort((a, b) => a.min - b.min);
  }

  function updateOutputs() {
    document.querySelectorAll('output[data-for]').forEach((o) => {
      const input = form.elements[o.dataset.for];
      o.textContent = input.name.endsWith('fontSize') ? `${input.value}px` : `${Math.round(input.value * 100)}%`;
    });
  }
  form.addEventListener('input', updateOutputs);

  async function api(path, body) {
    const res = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return res.json();
  }

  async function save() {
    const r = await api('/api/config', read());
    current = r.config;
    ranksBox.value = current.loyalty.ranks.map((x) => `${x.name} = ${x.min}`).join('\n');
    const saved = document.getElementById('saved');
    saved.textContent = r.restartNeeded ? 'Salvo — reinicie o UltraChat para trocar a porta' : 'Salvo ✓';
    saved.hidden = false;
    clearTimeout(save.t);
    save.t = setTimeout(() => (saved.hidden = true), 2500);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    save();
  });

  // Appearance changes apply live as you tweak them.
  let liveTimer;
  form.addEventListener('change', (e) => {
    if (!e.target.name?.startsWith('overlay.')) return;
    clearTimeout(liveTimer);
    liveTimer = setTimeout(save, 150);
  });

  document.getElementById('testBtn').onclick = () => api('/api/test', {});
  document.getElementById('clearBtn').onclick = () => api('/api/clear', {});
  document.getElementById('reconnectBtn').onclick = () => api('/api/reconnect', {});

  // ---------- ranking ----------
  const fmt = (n) => Number(n).toLocaleString('pt-BR');
  const boardBody = document.getElementById('board');

  function renderBoard(top) {
    boardBody.replaceChildren(
      ...top.map((t) => {
        const tr = document.createElement('tr');
        const pos = document.createElement('td');
        pos.textContent = t.pos;
        const who = document.createElement('td');
        who.className = 'who';
        who.append(MC.icon(t.platform), document.createTextNode(` ${t.name}`));
        who.title = `${t.platform}:${t.login}`;
        const rank = document.createElement('td');
        rank.textContent = t.rank || '—';
        const pts = document.createElement('td');
        pts.className = 'num';
        pts.textContent = fmt(t.points);
        tr.append(pos, who, rank, pts);
        return tr;
      }),
    );
    document.getElementById('boardEmpty').hidden = top.length > 0;
  }

  async function loadBoard() {
    const r = await api('/api/loyalty?limit=50');
    renderBoard(r.top);
    document.getElementById('boardStats').textContent = r.users
      ? `${fmt(r.users)} pessoas · ${fmt(r.points)} pontos distribuídos`
      : '';
  }

  document.getElementById('resetPointsBtn').onclick = async () => {
    if (!confirm('Zerar os pontos de TODO mundo? Isso não pode ser desfeito.')) return;
    await api('/api/loyalty/reset', {});
    loadBoard();
  };

  // ---------- live status ----------
  const LABELS = {
    off: 'Desligado',
    connecting: 'Conectando',
    connected: 'Conectado',
    waiting: 'Aguardando live',
    error: 'Erro',
  };

  function showStatus(status) {
    document.querySelectorAll('[data-status]').forEach((el) => {
      const s = status[el.dataset.status] || { state: 'off', detail: '' };
      el.className = `status ${s.state}`;
      el.textContent = `${LABELS[s.state] || s.state}${s.detail ? ' — ' + s.detail : ''}`;
    });
  }

  function connectWs() {
    const pill = document.getElementById('conn');
    const ws = new WebSocket(`ws://${location.host}/ws`);
    ws.onopen = () => {
      pill.textContent = 'servidor ativo';
      pill.className = 'pill ok';
    };
    ws.onmessage = (ev) => {
      const data = JSON.parse(ev.data);
      if (data.status) showStatus(data.status);
      if (data.type === 'leaderboard') loadBoard();
      if (data.type === 'twitchAuth') showTwitchAuth(data.auth);
    };
    ws.onclose = () => {
      pill.textContent = 'servidor desligado';
      pill.className = 'pill off';
      setTimeout(connectWs, 2000);
    };
  }

  // ---------- pages (menu on the left) ----------
  const PAGES = [...document.querySelectorAll('.page')].map((p) => p.dataset.page);
  function showPage() {
    const page = PAGES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'inicio';
    document.querySelectorAll('.page').forEach((p) => (p.hidden = p.dataset.page !== page));
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === page));
    document.querySelector('.content').scrollTop = 0;
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', showPage);
  showPage();

  // ---------- Twitch login (device code: the user types a code on twitch.tv/activate) ----------
  const tw = {
    text: document.getElementById('twitchAuthText'),
    code: document.getElementById('twitchCode'),
    codeValue: document.getElementById('twitchCodeValue'),
    codeLink: document.getElementById('twitchCodeLink'),
    connect: document.getElementById('twitchConnect'),
    disconnect: document.getElementById('twitchDisconnect'),
  };
  let twPoll = null;

  function showTwitchAuth(s) {
    const available = s.available || s.state === 'connected';
    document.getElementById('twitchAuth').hidden = !available;
    document.getElementById('alertsTwitchHint').hidden = !available;
    document.getElementById('twitchLoginSoon').hidden = available;
    AlertsEditor.setTwitchFollow(available);
    tw.code.hidden = s.state !== 'pending';
    tw.connect.hidden = s.state === 'connected' || s.state === 'pending';
    tw.disconnect.hidden = s.state !== 'connected';
    tw.disconnect.textContent = 'Desconectar';
    tw.text.className = s.state === 'connected' ? 'ok' : 'muted';
    if (s.state === 'connected') tw.text.textContent = `Conectada: ${s.login}${s.detail ? ' · ' + s.detail : ''}`;
    else if (s.state === 'pending') {
      tw.text.textContent = 'Esperando você autorizar…';
      tw.codeValue.textContent = s.userCode;
      tw.codeLink.href = s.verificationUri || 'https://www.twitch.tv/activate';
    } else tw.text.textContent = s.error || 'Não conectada';
    clearInterval(twPoll);
    if (s.state === 'pending') twPoll = setInterval(refreshTwitchAuth, 3000);
  }

  async function refreshTwitchAuth() {
    showTwitchAuth(await api('/api/twitch/auth'));
  }

  tw.connect.onclick = async () => {
    tw.connect.disabled = true;
    await save(); // uses the Client ID typed in the panel
    const s = await api('/api/twitch/auth/start', {});
    tw.connect.disabled = false;
    showTwitchAuth(s);
    if (s.state === 'pending') window.open(s.verificationUri, '_blank', 'noopener');
  };
  tw.disconnect.onclick = async () => {
    if (!confirm('Desconectar a conta da Twitch?')) return;
    showTwitchAuth(await api('/api/twitch/auth/logout', {}));
  };

  api('/api/info').then((i) => (document.getElementById('version').textContent = `v${i.version}`)).catch(() => {});
  api('/api/config').then((cfg) => {
    current = cfg;
    fill(cfg);
  });
  refreshTwitchAuth().catch(() => {});
  showStatus({});
  AlertsEditor.init({ save });
  loadBoard();
  connectWs();
})();
