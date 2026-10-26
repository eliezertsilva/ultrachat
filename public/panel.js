(() => {
  const form = document.getElementById('form');
  const base = location.origin;
  const urls = {
    overlayUrl: `${base}/overlay.html`,
    dockUrl: `${base}/overlay.html?dock=1`,
    panelUrl: `${base}/`,
  };
  for (const [id, url] of Object.entries(urls)) document.getElementById(id).textContent = url;
  document.getElementById('preview').src = urls.overlayUrl;

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
    return cfg;
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
    };
    ws.onclose = () => {
      pill.textContent = 'servidor desligado';
      pill.className = 'pill off';
      setTimeout(connectWs, 2000);
    };
  }

  api('/api/config').then((cfg) => {
    current = cfg;
    fill(cfg);
  });
  showStatus({});
  connectWs();
})();
