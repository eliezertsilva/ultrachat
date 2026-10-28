// Alerts overlay: plays one alert at a time (video/image, sound, text).
// In OBS, tick "Control audio via OBS" on this Browser Source to get it in the mixer.
// URL options: ?volume=50 (master volume, 0–100) · ?mute=1
(() => {
  const params = new URLSearchParams(location.search);
  const master = params.get('mute') === '1' ? 0 : Math.min(100, Math.max(0, Number(params.get('volume') ?? 100))) / 100;
  const stage = document.getElementById('stage');
  const queue = [];
  const seen = new Set();
  let busy = false;
  const safeUrl = (u) => (typeof u === 'string' && /^\/media\/[^/]+$/.test(u) ? u : '');

  function el(tag, cls) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  // Resolves once the media is ready (or failed), with the video length when known.
  function loadMedia(a) {
    return new Promise((resolve) => {
      const url = safeUrl(a.media?.url);
      if (!url) return resolve({ node: null, length: 0 });
      let node;
      const done = (length = 0) => resolve({ node, length });
      if (a.media.kind === 'video') {
        node = el('video', 'media');
        node.src = url;
        node.playsInline = true;
        node.volume = Math.min(1, (a.volume ?? 0.8) * master);
        node.muted = master === 0;
        node.onloadedmetadata = () => done(Number.isFinite(node.duration) ? node.duration : 0);
        node.onerror = () => done();
      } else {
        node = el('img', 'media');
        node.src = url;
        node.onload = () => done();
        node.onerror = () => done();
      }
      setTimeout(() => done(), 4000); // never stall the queue on a slow file
    });
  }

  async function play(a) {
    const box = el('div', `alert pos-${a.position || 'center'}`);
    const { node, length } = await loadMedia(a);
    if (node) {
      node.style.maxHeight = `${a.mediaSize || 60}vh`;
      box.append(node);
    }
    if (a.text) {
      const t = el('div', 'text');
      t.textContent = a.text;
      t.style.fontSize = `${a.fontSize || 42}px`;
      t.style.color = a.color || '#fff';
      box.append(t);
    }
    stage.append(box);

    if (node?.tagName === 'VIDEO') node.play().catch(() => {});
    let audio;
    if (safeUrl(a.sound)) {
      audio = new Audio(a.sound);
      audio.volume = Math.min(1, (a.volume ?? 0.8) * master);
      audio.play().catch(() => {});
    }

    // duration 0 = as long as the video (or 6 s without a video).
    const seconds = a.duration > 0 ? a.duration : length || 6;
    await new Promise((r) => setTimeout(r, Math.min(seconds, 120) * 1000));

    box.classList.add('leaving');
    if (audio) fade(audio);
    if (node?.tagName === 'VIDEO') fade(node);
    await new Promise((r) => setTimeout(r, 450));
    box.remove();
    audio?.pause();
  }

  function fade(media) {
    const start = media.volume;
    let i = 0;
    const t = setInterval(() => {
      media.volume = Math.max(0, start * (1 - ++i / 8));
      if (i >= 8) clearInterval(t);
    }, 50);
  }

  async function next() {
    if (busy) return;
    busy = true;
    while (queue.length) {
      try {
        await play(queue.shift());
      } catch {
        /* keep going */
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    busy = false;
  }

  function connect() {
    const ws = new WebSocket(`ws://${location.host}/ws`);
    ws.onmessage = (ev) => {
      const data = JSON.parse(ev.data);
      if (data.type !== 'alert' || seen.has(data.alert.id)) return;
      seen.add(data.alert.id);
      queue.push(data.alert);
      next();
    };
    ws.onclose = () => setTimeout(connect, 2000);
  }

  connect();
})();
