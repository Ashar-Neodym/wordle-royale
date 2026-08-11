'use client';

import { useEffect, useRef, useState, type ReactElement } from 'react';
import {
  applyDisplayPreferences,
  DEFAULT_DISPLAY_PREFERENCES,
  getDisplayStorage,
  readDisplayPreferences,
  resetDisplayPreferences,
  writeDisplayPreferences,
  type ContrastPreference,
  type DisplayPreferences,
  type MotionPreference,
} from '../lib/display-preferences';
import styles from './web-shell.module.css';

type Announcement = Readonly<{ eventId: number; message: string }>;

export function DisplaySettings(): ReactElement {
  const [draft, setDraft] = useState<DisplayPreferences>(DEFAULT_DISPLAY_PREFERENCES);
  const [storageWarning, setStorageWarning] = useState(false);
  const [announcement, setAnnouncement] = useState<Announcement>({ eventId: 0, message: '' });
  const eventId = useRef(0);
  const firstControl = useRef<HTMLInputElement>(null);

  const announce = (message: string): void => {
    eventId.current += 1;
    setAnnouncement({ eventId: eventId.current, message });
  };

  useEffect(() => {
    const storage = getDisplayStorage(window);
    const loaded = readDisplayPreferences(storage);
    setDraft(loaded.preferences);
    setStorageWarning(!loaded.persistent);
    applyDisplayPreferences(document.documentElement, loaded.preferences);
  }, []);

  const apply = (): void => {
    applyDisplayPreferences(document.documentElement, draft);
    const persisted = writeDisplayPreferences(getDisplayStorage(window), draft);
    setStorageWarning(!persisted);
    announce(persisted
      ? 'Display preferences applied and saved on this device.'
      : 'Display preferences applied for this page. Browser storage is unavailable, so they are only in memory.');
  };

  const reset = (): void => {
    const storage = getDisplayStorage(window);
    const persisted = resetDisplayPreferences(storage);
    setDraft(DEFAULT_DISPLAY_PREFERENCES);
    applyDisplayPreferences(document.documentElement, DEFAULT_DISPLAY_PREFERENCES);
    setStorageWarning(!persisted);
    announce(persisted
      ? 'Display preferences reset to defaults on this device.'
      : 'Display preferences reset for this page. Browser storage is unavailable, so the reset is only in memory.');
    // Reset always returns keyboard focus to the first setting for predictable continuation.
    requestAnimationFrame(() => firstControl.current?.focus());
  };

  return (
    <section className={styles.panelWide} aria-labelledby="display-settings-heading">
      <h2 id="display-settings-heading">Accessibility and display</h2>
      <p className={styles.muted}>These preferences are browser-local and device-specific. They are not synced to an account.</p>
      <div className={styles.settingsFields}>
        <fieldset className={styles.settingsFieldset}>
          <legend>Motion</legend>
          <label><input ref={firstControl} type="radio" name="motion" value="system" checked={draft.motion === 'system'} onChange={() => setDraft({ ...draft, motion: 'system' as MotionPreference })} /> Follow system</label>
          <label><input type="radio" name="motion" value="reduce" checked={draft.motion === 'reduce'} onChange={() => setDraft({ ...draft, motion: 'reduce' as MotionPreference })} /> Reduce motion</label>
          <p>Follow system honors your operating system&apos;s reduced-motion preference.</p>
        </fieldset>
        <fieldset className={styles.settingsFieldset}>
          <legend>Contrast</legend>
          <label><input type="radio" name="contrast" value="standard" checked={draft.contrast === 'standard'} onChange={() => setDraft({ ...draft, contrast: 'standard' as ContrastPreference })} /> Standard</label>
          <label><input type="radio" name="contrast" value="enhanced" checked={draft.contrast === 'enhanced'} onChange={() => setDraft({ ...draft, contrast: 'enhanced' as ContrastPreference })} /> Enhanced contrast</label>
          <p>Enhanced contrast strengthens text, borders, controls, and focus indicators without removing game symbols or patterns.</p>
        </fieldset>
      </div>
      <div className={styles.actionRow}>
        <button className={styles.primaryButton} type="button" onClick={apply}>Apply</button>
        <button className={styles.secondaryButton} type="button" onClick={reset}>Reset to defaults</button>
      </div>
      {storageWarning ? <p className={styles.warningText} role="status">Browser storage is unavailable. Changes work in memory for this page only and may be lost when you leave or reload.</p> : null}
      <div className={styles.srOnly} aria-live="polite" aria-atomic="true">
        {announcement.message ? <span key={announcement.eventId}>{announcement.message}</span> : null}
      </div>
    </section>
  );
}
