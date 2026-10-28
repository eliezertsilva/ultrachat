/**
 * Shared lifecycle for every platform connector.
 * `gen` increases on each start/stop so callbacks from an old
 * connection can tell they are stale and do nothing.
 */
export class BaseConnector {
  constructor(hub, platform) {
    this.hub = hub;
    this.platform = platform;
    this.gen = 0;
    this.stopped = true;
    this.retryTimer = null;
    this.cfg = null;
  }

  setStatus(state, detail = '') {
    this.hub.setStatus(this.platform, { state, detail });
  }

  start(cfg) {
    this.stop(true);
    this.cfg = cfg;
    this.stopped = false;
    const gen = ++this.gen;
    Promise.resolve(this.connect(gen)).catch((err) => {
      if (!this.isCurrent(gen)) return;
      this.setStatus('error', err?.message || String(err));
      this.retry(30_000, gen);
    });
  }

  stop(silent = false) {
    this.stopped = true;
    this.gen++;
    clearTimeout(this.retryTimer);
    try {
      this.disconnect();
    } catch {
      /* ignore */
    }
    if (!silent) this.setStatus('off');
  }

  isCurrent(gen) {
    return !this.stopped && gen === this.gen;
  }

  retry(ms, gen) {
    if (!this.isCurrent(gen)) return;
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      if (!this.isCurrent(gen)) return;
      Promise.resolve(this.connect(gen)).catch((err) => {
        if (!this.isCurrent(gen)) return;
        this.setStatus('error', err?.message || String(err));
        this.retry(30_000, gen);
      });
    }, ms);
  }

  publish(msg) {
    this.hub.publish({ platform: this.platform, ...msg });
  }

  // Overridden by subclasses
  async connect() {}
  disconnect() {}
}

export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

/** Strips URLs, @ and slashes so users can paste a link or a name. */
export function cleanName(input, hostPattern) {
  let s = String(input || '').trim();
  if (hostPattern) s = s.replace(hostPattern, '');
  return s.replace(/^[@#]/, '').split(/[/?#\s]/)[0];
}

export function textPart(text) {
  return { type: 'text', text: String(text ?? '') };
}

/**
 * Turns a display amount like "R$ 10,00", "$5.99" or "1.000 ₫" into a number.
 * A final separator followed by 1–2 digits is the decimal point; any other is a thousands separator.
 */
export function parseMoney(input) {
  const s = String(input ?? '').replace(/[^\d.,]/g, '');
  if (!s) return 0;
  const m = /^(.*?)[.,](\d{1,2})$/.exec(s);
  const whole = (m ? m[1] : s).replace(/[.,]/g, '');
  return Number(`${whole || 0}.${m ? m[2] : 0}`) || 0;
}
