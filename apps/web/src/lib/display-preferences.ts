export const DISPLAY_PREFERENCES_STORAGE_KEY = 'wordle-royale:display-preferences:v1';
export const DISPLAY_PREFERENCES_VERSION = 1;
export const MAX_DISPLAY_PREFERENCES_CHARS = 256;

export const MOTION_VALUES = ['system', 'reduce'] as const;
export const CONTRAST_VALUES = ['standard', 'enhanced'] as const;

export type MotionPreference = (typeof MOTION_VALUES)[number];
export type ContrastPreference = (typeof CONTRAST_VALUES)[number];
export type DisplayPreferences = Readonly<{
  motion: MotionPreference;
  contrast: ContrastPreference;
}>;
export type StoredDisplayPreferences = Readonly<{
  version: typeof DISPLAY_PREFERENCES_VERSION;
  motion: MotionPreference;
  contrast: ContrastPreference;
}>;

export interface DisplayStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface DisplayStorageGlobalLike {
  readonly localStorage?: DisplayStorageLike | null;
}

export type DisplayPreferencesRead = Readonly<{
  preferences: DisplayPreferences;
  persistent: boolean;
}>;

export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = Object.freeze({
  motion: 'system',
  contrast: 'standard',
});

const EXACT_KEYS = ['contrast', 'motion', 'version'] as const;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseStoredDisplayPreferences(value: unknown): DisplayPreferences | null {
  if (!isPlainRecord(value)) return null;
  const keys = Object.keys(value).sort();
  if (keys.length !== EXACT_KEYS.length || !keys.every((key, index) => key === EXACT_KEYS[index])) return null;
  if (value.version !== DISPLAY_PREFERENCES_VERSION) return null;
  if (!MOTION_VALUES.includes(value.motion as MotionPreference)) return null;
  if (!CONTRAST_VALUES.includes(value.contrast as ContrastPreference)) return null;
  return { motion: value.motion as MotionPreference, contrast: value.contrast as ContrastPreference };
}

export function serializeDisplayPreferences(preferences: DisplayPreferences): string {
  return JSON.stringify({ version: DISPLAY_PREFERENCES_VERSION, ...preferences });
}

/** Catches environments where reading window.localStorage itself throws. */
export function getDisplayStorage(globalLike: DisplayStorageGlobalLike): DisplayStorageLike | null {
  try {
    return globalLike.localStorage ?? null;
  } catch {
    return null;
  }
}

function safelyRemove(storage: DisplayStorageLike): boolean {
  try {
    storage.removeItem(DISPLAY_PREFERENCES_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Missing or untrusted records always resolve to defaults; invalid records are best-effort discarded. */
export function readDisplayPreferences(storage: DisplayStorageLike | null): DisplayPreferencesRead {
  if (!storage) return { preferences: DEFAULT_DISPLAY_PREFERENCES, persistent: false };
  let raw: string | null;
  try {
    raw = storage.getItem(DISPLAY_PREFERENCES_STORAGE_KEY);
  } catch {
    return { preferences: DEFAULT_DISPLAY_PREFERENCES, persistent: false };
  }
  if (raw === null) return { preferences: DEFAULT_DISPLAY_PREFERENCES, persistent: true };
  if (raw.length > MAX_DISPLAY_PREFERENCES_CHARS) {
    return { preferences: DEFAULT_DISPLAY_PREFERENCES, persistent: safelyRemove(storage) };
  }
  try {
    const preferences = parseStoredDisplayPreferences(JSON.parse(raw) as unknown);
    if (preferences) return { preferences, persistent: true };
  } catch {
    // The record is not JSON and is discarded below.
  }
  return { preferences: DEFAULT_DISPLAY_PREFERENCES, persistent: safelyRemove(storage) };
}

export function writeDisplayPreferences(storage: DisplayStorageLike | null, preferences: DisplayPreferences): boolean {
  if (!storage || parseStoredDisplayPreferences({ version: DISPLAY_PREFERENCES_VERSION, ...preferences }) === null) return false;
  const serialized = serializeDisplayPreferences(preferences);
  if (serialized.length > MAX_DISPLAY_PREFERENCES_CHARS) return false;
  try {
    storage.setItem(DISPLAY_PREFERENCES_STORAGE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}

export function resetDisplayPreferences(storage: DisplayStorageLike | null): boolean {
  return storage !== null && safelyRemove(storage);
}

export function applyDisplayPreferences(root: Pick<HTMLElement, 'dataset'>, preferences: DisplayPreferences): void {
  root.dataset.wrMotion = preferences.motion;
  root.dataset.wrContrast = preferences.contrast;
}

/**
 * This config is the single serialized contract consumed by the pre-paint script.
 * Keep parsing rules in this module so layout and the interactive control cannot drift.
 */
export const DISPLAY_PREFERENCES_BOOTSTRAP_CONFIG = Object.freeze({
  key: DISPLAY_PREFERENCES_STORAGE_KEY,
  version: DISPLAY_PREFERENCES_VERSION,
  maxChars: MAX_DISPLAY_PREFERENCES_CHARS,
  motion: MOTION_VALUES,
  contrast: CONTRAST_VALUES,
  defaults: DEFAULT_DISPLAY_PREFERENCES,
  exactKeys: EXACT_KEYS,
});

export function displayPreferencesBootstrapScript(): string {
  const config = JSON.stringify(DISPLAY_PREFERENCES_BOOTSTRAP_CONFIG);
  return `(()=>{const c=${config},r=document.documentElement,d=c.defaults;let p=d;try{const s=window.localStorage,x=s.getItem(c.key);if(x!==null){if(x.length>c.maxChars){try{s.removeItem(c.key)}catch{}}else{try{const v=JSON.parse(x),k=v&&typeof v==='object'&&!Array.isArray(v)?Object.keys(v).sort():[];if(k.length===c.exactKeys.length&&k.every((z,i)=>z===c.exactKeys[i])&&v.version===c.version&&c.motion.includes(v.motion)&&c.contrast.includes(v.contrast))p=v;else try{s.removeItem(c.key)}catch{}}catch{try{s.removeItem(c.key)}catch{}}}}}catch{}r.dataset.wrMotion=p.motion;r.dataset.wrContrast=p.contrast})()`;
}
