// Alerts editor for the settings panel. panel.js calls load() / read() / init().
window.AlertsEditor = (() => {
  const PLATFORMS = [
    ['any', 'Qualquer plataforma'],
    ['tiktok', 'TikTok'],
    ['twitch', 'Twitch'],
    ['youtube', 'YouTube'],
    ['kick', 'Kick'],
  ];
  // Which events each platform can send (without login).
  const EVENTS_BY_PLATFORM = {
    any: ['gift', 'follow', 'share', 'sub', 'subgift', 'bits', 'superchat', 'raid'],
    tiktok: ['gift', 'follow', 'share', 'sub'],
    twitch: ['sub', 'subgift', 'bits', 'raid'], // + 'follow' when the Twitch login is available
    youtube: ['superchat', 'sub'],
    kick: ['sub', 'subgift'],
  };
  const AMOUNT_LABEL = {
    gift: 'diamantes (total)',
    bits: 'bits',
    superchat: 'valor',
    subgift: 'subs',
    raid: 'pessoas',
    sub: 'meses',
  };
  const POSITIONS = [
    ['center', 'Centro'],
    ['top', 'Topo'],
    ['bottom', 'Embaixo'],
    ['full', 'Tela cheia'],
  ];

  let events = {};
  let media = [];
  let gifts = [];
  let rules = [];
  let save = async () => {};
  const openIds = new Set();
  const list = document.getElementById('alertRules');

  const uid = () => Math.random().toString(36).slice(2, 10);

  function el(tag, attrs = {}, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
    }
    e.append(...children.filter(Boolean));
    return e;
  }

  function select(options, value, onChange) {
    const s = el('select', { onchange: (e) => onChange(e.target.value) });
    for (const [v, label] of options) {
      const o = el('option', { value: v, text: label });
      if (v === value) o.selected = true;
      s.append(o);
    }
    return s;
  }

  function field(label, input, cls) {
    return el('label', { class: cls }, label, input);
  }

  function mediaOptions(kinds) {
    return [['', '— nenhum —'], ...media.filter((m) => kinds.includes(m.kind)).map((m) => [m.name, m.name])];
  }

  function newRule() {
    return {
      id: uid(),
      enabled: true,
      platform: 'tiktok',
      event: 'gift',
      gift: '',
      min: 0,
      max: 0,
      media: '',
      sound: '',
      volume: 80,
      text: '',
      duration: 0,
      position: 'center',
      fontSize: 42,
      color: '#ffffff',
      mediaSize: 60,
      cooldown: 0,
      combo: 'once',
    };
  }

  function describe(r) {
    const p = PLATFORMS.find(([v]) => v === (r.platform || 'any'))?.[1] || '';
    let what = events[r.event] || r.event;
    if (r.event === 'gift' && r.gift) what = r.gift;
    const range = r.min || r.max ? ` (${r.min || 0}${r.max ? '–' + r.max : '+'} ${AMOUNT_LABEL[r.event] || ''})` : '';
    return `${p} · ${what}${range}`;
  }

  function render() {
    list.replaceChildren(...rules.map(renderRule));
    document.getElementById('alertsEmpty').hidden = rules.length > 0;
  }

  function renderRule(r) {
    const set = (k, v, rerender = false) => {
      r[k] = v;
      head.querySelector('.rule-title').textContent = describe(r);
      if (rerender) render();
    };
    const num = (k, attrs = {}) =>
      el('input', { type: 'number', value: r[k] ?? 0, min: 0, ...attrs, oninput: (e) => set(k, Number(e.target.value) || 0) });

    const allowed = EVENTS_BY_PLATFORM[r.platform || 'any'];
    if (!allowed.includes(r.event)) r.event = allowed[0];

    const enabled = el('input', { type: 'checkbox', onchange: (e) => set('enabled', e.target.checked) });
    enabled.checked = r.enabled !== false;
    const head = el(
      'div',
      { class: 'rule-head' },
      el('label', { class: 'switch', title: 'Ligar/desligar este alerta' }, enabled, el('span')),
      el('strong', { class: 'rule-title', text: describe(r) }),
      el('button', {
        type: 'button',
        class: 'ghost',
        text: 'Testar',
        onclick: async (e) => {
          e.target.disabled = true;
          await save();
          await fetch('/api/alerts/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: r.id }),
          });
          e.target.disabled = false;
        },
      }),
      el('button', {
        type: 'button',
        class: 'ghost danger',
        text: 'Remover',
        onclick: () => {
          if (!confirm('Remover este alerta?')) return;
          rules = rules.filter((x) => x !== r);
          render();
        },
      }),
    );

    const when = el(
      'div',
      { class: 'grid' },
      field('Plataforma', select(PLATFORMS, r.platform || 'any', (v) => set('platform', v, true))),
      field('Quando', select(allowed.map((e) => [e, events[e] || e]), r.event, (v) => set('event', v, true))),
    );
    if (r.event === 'gift') {
      const giftInput = el('input', {
        list: 'giftList',
        value: r.gift || '',
        placeholder: 'qualquer presente',
        oninput: (e) => set('gift', e.target.value.trim()),
      });
      when.append(field('Presente', giftInput));
    }
    if (AMOUNT_LABEL[r.event]) {
      when.append(
        field(`Mínimo de ${AMOUNT_LABEL[r.event]}`, num('min')),
        field(`Máximo (0 = sem limite)`, num('max')),
      );
    }

    const show = el(
      'div',
      { class: 'grid' },
      field('Vídeo, GIF ou imagem', select(mediaOptions(['video', 'image']), r.media || '', (v) => set('media', v))),
      field('Som extra', select(mediaOptions(['audio']), r.sound || '', (v) => set('sound', v))),
      field('Volume (%)', num('volume', { max: 100 })),
      field('Duração (s, 0 = tempo do vídeo)', num('duration', { max: 120 })),
      field('Posição', select(POSITIONS, r.position || 'center', (v) => set('position', v))),
      field('Tamanho da mídia (% da altura)', num('mediaSize', { min: 10, max: 100 })),
      field('Tamanho do texto (px)', num('fontSize', { min: 10, max: 200 })),
      field('Cor do texto', el('input', { type: 'color', value: r.color || '#ffffff', oninput: (e) => set('color', e.target.value) })),
      field('Intervalo mínimo (s)', num('cooldown')),
    );
    if (r.event === 'gift') {
      show.append(
        field(
          'Combo (ex.: Rosa x10)',
          select(
            [
              ['once', 'Um alerta por combo'],
              ['each', 'Um alerta por presente (até 10)'],
            ],
            r.combo || 'once',
            (v) => set('combo', v),
          ),
        ),
      );
    }

    const text = field(
      'Texto',
      el('input', {
        value: r.text || '',
        placeholder: 'vazio = texto padrão · variáveis: {nome} {quantidade} {presente} {valor} {mensagem} {meses}',
        oninput: (e) => set('text', e.target.value),
      }),
      'wide',
    );

    const box = el('details', { class: 'rule', open: openIds.has(r.id) }, el('summary', {}, head), el('div', { class: 'rule-body' }, when, show, text));
    box.addEventListener('toggle', () => (box.open ? openIds.add(r.id) : openIds.delete(r.id)));
    return box;
  }

  // ---------- media library ----------
  function renderMedia() {
    const box = document.getElementById('mediaList');
    box.replaceChildren(
      ...media.map((m) =>
        el(
          'div',
          { class: 'media-item' },
          el('span', { class: 'kind', text: m.kind === 'video' ? '🎬' : m.kind === 'image' ? '🖼️' : '🔊' }),
          el('a', { href: `/media/${encodeURIComponent(m.name)}`, target: '_blank', text: m.name }),
          el('small', { text: `${(m.size / 1024 / 1024).toFixed(1)} MB` }),
          el('button', {
            type: 'button',
            class: 'ghost danger',
            text: 'Apagar',
            onclick: async () => {
              if (!confirm(`Apagar ${m.name}?`)) return;
              const r = await (await fetch(`/api/media/${encodeURIComponent(m.name)}`, { method: 'DELETE' })).json();
              media = r.media;
              renderMedia();
              render();
            },
          }),
        ),
      ),
    );
    document.getElementById('mediaEmpty').hidden = media.length > 0;
  }

  async function upload(files) {
    const status = document.getElementById('uploadStatus');
    for (const file of files) {
      status.textContent = `Enviando ${file.name}...`;
      const res = await fetch('/api/media', {
        method: 'POST',
        headers: { 'X-File-Name': encodeURIComponent(file.name), 'Content-Type': 'application/octet-stream' },
        body: file,
      });
      const r = await res.json();
      if (!r.ok) {
        status.textContent = `${file.name}: ${r.error}`;
        return;
      }
      media = r.media;
    }
    status.textContent = 'Enviado ✓';
    setTimeout(() => (status.textContent = ''), 2000);
    renderMedia();
    render();
  }

  function renderGifts() {
    const dl = document.getElementById('giftList');
    dl.replaceChildren(...gifts.map((g) => el('option', { value: g.name, label: g.diamonds ? `${g.diamonds} 💎` : '' })));
  }

  async function refreshMeta() {
    const meta = await (await fetch('/api/alerts/meta')).json();
    events = meta.events;
    media = meta.media;
    gifts = meta.gifts;
    renderMedia();
    renderGifts();
    render();
  }

  return {
    init(opts) {
      save = opts.save;
      document.getElementById('addAlert').onclick = () => {
        const r = newRule();
        rules.push(r);
        openIds.add(r.id);
        render();
      };
      const input = document.getElementById('mediaUpload');
      input.onchange = () => {
        upload([...input.files]);
        input.value = '';
      };
      refreshMeta();
    },
    /** Twitch follow alerts need the optional Twitch login. */
    setTwitchFollow(on) {
      const list = EVENTS_BY_PLATFORM.twitch;
      const has = list.includes('follow');
      if (on && !has) list.unshift('follow');
      if (!on && has) list.splice(list.indexOf('follow'), 1);
      if (on !== has) render();
    },
    load(cfgRules) {
      rules = structuredClone(cfgRules || []);
      render();
    },
    read() {
      return structuredClone(rules);
    },
  };
})();
