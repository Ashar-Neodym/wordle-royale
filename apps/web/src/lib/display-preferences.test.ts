import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_DISPLAY_PREFERENCES,
  DISPLAY_PREFERENCES_STORAGE_KEY,
  DISPLAY_PREFERENCES_VERSION,
  MAX_DISPLAY_PREFERENCES_CHARS,
  applyDisplayPreferences,
  displayPreferencesBootstrapScript,
  getDisplayStorage,
  parseStoredDisplayPreferences,
  readDisplayPreferences,
  resetDisplayPreferences,
  serializeDisplayPreferences,
  writeDisplayPreferences,
  type DisplayStorageLike,
} from './display-preferences.ts';

class MemoryStorage implements DisplayStorageLike {
  values = new Map<string, string>();
  removed: string[] = [];
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.removed.push(key); this.values.delete(key); }
}

const enhanced = { motion: 'reduce', contrast: 'enhanced' } as const;

describe('display preference persistence', () => {
  it('has frozen defaults and round-trips the exact versioned closed schema', () => {
    assert.deepEqual(DEFAULT_DISPLAY_PREFERENCES, { motion: 'system', contrast: 'standard' });
    assert.equal(Object.isFrozen(DEFAULT_DISPLAY_PREFERENCES), true);
    const serialized = serializeDisplayPreferences(enhanced);
    assert.deepEqual(JSON.parse(serialized), { version: DISPLAY_PREFERENCES_VERSION, ...enhanced });
    assert.deepEqual(parseStoredDisplayPreferences(JSON.parse(serialized)), enhanced);
    assert.ok(serialized.length <= MAX_DISPLAY_PREFERENCES_CHARS);
  });

  it('rejects every open, malformed, type-confused, and future-version shape', () => {
    for (const hostile of [
      null, [], 'record', 1,
      {}, { version: 1, motion: 'system' },
      { version: 1, motion: 'system', contrast: 'standard', extra: true },
      { version: 2, motion: 'system', contrast: 'standard' },
      { version: 1, motion: 'auto', contrast: 'standard' },
      { version: 1, motion: 'system', contrast: 'high' },
      { version: '1', motion: 'system', contrast: 'standard' },
    ]) assert.equal(parseStoredDisplayPreferences(hostile), null);
  });

  it('uses defaults for missing records and persists, loads, and resets valid preferences', () => {
    const storage = new MemoryStorage();
    assert.deepEqual(readDisplayPreferences(storage), { preferences: DEFAULT_DISPLAY_PREFERENCES, persistent: true });
    assert.equal(writeDisplayPreferences(storage, enhanced), true);
    assert.deepEqual(readDisplayPreferences(storage), { preferences: enhanced, persistent: true });
    assert.equal(resetDisplayPreferences(storage), true);
    assert.equal(storage.values.has(DISPLAY_PREFERENCES_STORAGE_KEY), false);
  });

  it('fails closed and best-effort discards malformed, oversized, and future records', () => {
    const storage = new MemoryStorage();
    for (const raw of [
      '{bad',
      'x'.repeat(MAX_DISPLAY_PREFERENCES_CHARS + 1),
      JSON.stringify({ version: 999, motion: 'reduce', contrast: 'enhanced' }),
      JSON.stringify({ version: 1, motion: 'reduce', contrast: 'enhanced', injected: true }),
    ]) {
      storage.values.set(DISPLAY_PREFERENCES_STORAGE_KEY, raw);
      assert.deepEqual(readDisplayPreferences(storage).preferences, DEFAULT_DISPLAY_PREFERENCES);
      assert.equal(storage.values.has(DISPLAY_PREFERENCES_STORAGE_KEY), false);
    }
    assert.equal(storage.removed.length, 4);
  });

  it('survives throwing localStorage getter and every throwing storage method', () => {
    const global = Object.defineProperty({}, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });
    assert.equal(getDisplayStorage(global), null);
    const hostile: DisplayStorageLike = {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('quota'); },
      removeItem() { throw new Error('blocked'); },
    };
    assert.deepEqual(readDisplayPreferences(hostile), { preferences: DEFAULT_DISPLAY_PREFERENCES, persistent: false });
    assert.equal(writeDisplayPreferences(hostile, enhanced), false);
    assert.equal(resetDisplayPreferences(hostile), false);
    const removeBlocked: DisplayStorageLike = {
      getItem() { return '{bad'; },
      setItem() {},
      removeItem() { throw new Error('blocked'); },
    };
    assert.deepEqual(readDisplayPreferences(removeBlocked), { preferences: DEFAULT_DISPLAY_PREFERENCES, persistent: false });
    assert.equal(writeDisplayPreferences(null, enhanced), false);
    assert.equal(resetDisplayPreferences(null), false);
  });

  it('applies only stable root data attributes', () => {
    const root = { dataset: {} } as Pick<HTMLElement, 'dataset'>;
    applyDisplayPreferences(root, enhanced);
    assert.deepEqual(root.dataset, { wrMotion: 'reduce', wrContrast: 'enhanced' });
  });
});

describe('pre-paint bootstrap', () => {
  function execute(raw: string | null | 'throw'): Record<string, string> {
    const dataset: Record<string, string> = {};
    const storage = raw === 'throw'
      ? Object.defineProperty({}, 'getItem', { value() { throw new Error('blocked'); } })
      : { getItem() { return raw; }, removeItem() {} };
    Function('window', 'document', displayPreferencesBootstrapScript())(
      { localStorage: storage },
      { documentElement: { dataset } },
    );
    return dataset;
  }

  it('uses persisted values before paint and defaults for absent or hostile values', () => {
    assert.deepEqual(execute(serializeDisplayPreferences(enhanced)), { wrMotion: 'reduce', wrContrast: 'enhanced' });
    for (const raw of [null, '{bad', JSON.stringify({ version: 2, ...enhanced }), 'throw'] as const) {
      assert.deepEqual(execute(raw), { wrMotion: 'system', wrContrast: 'standard' });
    }
  });
});
