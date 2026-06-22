const STORAGE_KEY = 'frontline_roads_radar_preferences_v1';
const QUALITY_VALUES = ['full', 'balanced', 'minimal'];
const ROUTE_VALUES = ['priority', 'all', 'off'];

function safeStorage() {
  try {
    const storage = globalThis.localStorage;
    const key = `${STORAGE_KEY}_probe`;
    storage?.setItem(key, '1');
    storage?.removeItem(key);
    return storage ?? null;
  } catch {
    return null;
  }
}

function defaultPreferences() {
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  return { quality: 'balanced', motion: !reduced, routes: 'priority' };
}

function normalize(value) {
  const defaults = defaultPreferences();
  return {
    quality: QUALITY_VALUES.includes(value?.quality) ? value.quality : defaults.quality,
    motion: typeof value?.motion === 'boolean' ? value.motion : defaults.motion,
    routes: ROUTE_VALUES.includes(value?.routes) ? value.routes : defaults.routes
  };
}

function next(values, current) {
  const index = values.indexOf(current);
  return values[(index + 1) % values.length];
}

const QUALITY_LABELS = Object.freeze({ full: '高精細', balanced: '標準', minimal: '省電力' });
const ROUTE_LABELS = Object.freeze({ priority: '脅威のみ', all: 'すべて', off: '非表示' });

export class RadarPreferences {
  constructor({ onChange = null, storage = safeStorage(), documentRef = globalThis.document } = {}) {
    this.onChange = onChange;
    this.storage = storage;
    this.document = documentRef;
    this.value = this.load();
    this.qualityButton = this.document?.querySelector('#radarQualityButton') ?? null;
    this.motionButton = this.document?.querySelector('#radarMotionButton') ?? null;
    this.routesButton = this.document?.querySelector('#radarRoutesButton') ?? null;
    this.qualityButton?.addEventListener('click', () => this.update({ quality: next(QUALITY_VALUES, this.value.quality) }));
    this.motionButton?.addEventListener('click', () => this.update({ motion: !this.value.motion }));
    this.routesButton?.addEventListener('click', () => this.update({ routes: next(ROUTE_VALUES, this.value.routes) }));
    this.apply();
  }

  load() {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      return normalize(raw ? JSON.parse(raw) : null);
    } catch {
      return defaultPreferences();
    }
  }

  save() {
    try { this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.value)); } catch { /* visual settings remain session-only */ }
  }

  update(patch) {
    this.value = normalize({ ...this.value, ...patch });
    this.save();
    this.apply();
  }

  apply() {
    const root = this.document?.documentElement;
    if (root) {
      root.dataset.radarQuality = this.value.quality;
      root.dataset.radarMotion = this.value.motion ? 'on' : 'off';
      root.dataset.radarRoutes = this.value.routes;
    }
    if (this.qualityButton) this.qualityButton.textContent = `表示品質：${QUALITY_LABELS[this.value.quality]}`;
    if (this.motionButton) {
      this.motionButton.textContent = `アニメーション：${this.value.motion ? 'ON' : 'OFF'}`;
      this.motionButton.setAttribute('aria-pressed', String(this.value.motion));
    }
    if (this.routesButton) this.routesButton.textContent = `敵経路：${ROUTE_LABELS[this.value.routes]}`;
    this.onChange?.({ ...this.value });
  }

  get() {
    return { ...this.value };
  }
}
