'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactElement } from 'react';
import { buildChallengeUrl } from '../lib/challenge-persistence';
import { canonicalizeChallengeId, createChallengeId } from '../lib/challenge-id';
import styles from './challenge.module.css';

export function ChallengeHub(): ReactElement {
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [openId, setOpenId] = useState('');
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [manualCopy, setManualCopy] = useState(false);
  const generatedHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const manualCopyRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => { if (generatedUrl) generatedHeadingRef.current?.focus(); }, [generatedUrl]);
  useEffect(() => { if (manualCopy) manualCopyRef.current?.focus(); }, [manualCopy]);

  const create = (): void => {
    setError('');
    setCopyStatus('');
    setManualCopy(false);
    try {
      const getRandomValues = globalThis.crypto?.getRandomValues?.bind(globalThis.crypto);
      if (!getRandomValues) throw new Error('Cryptographic randomness is unavailable.');
      const challengeId = createChallengeId(getRandomValues);
      const url = buildChallengeUrl(window.location.origin, challengeId);
      if (!url) throw new Error('This browser origin cannot create a challenge link.');
      setGeneratedUrl(url);
    } catch {
      setGeneratedUrl(null);
      setError('A challenge could not be created because secure browser randomness is unavailable. No weaker random fallback was used.');
    }
  };

  const copy = async (): Promise<void> => {
    if (!generatedUrl) return;
    setManualCopy(false);
    try {
      await navigator.clipboard.writeText(generatedUrl);
      setCopyStatus('Challenge link copied.');
    } catch {
      setCopyStatus('Could not copy automatically. Manual copy is available below.');
      setManualCopy(true);
    }
  };

  const open = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const value = openId.trim();
    const canonicalId = canonicalizeChallengeId(value);
    if (!canonicalId) {
      setError('Enter a complete, valid challenge ID. Check the link and try again.');
      return;
    }
    window.location.assign(`/challenge/${canonicalId}`);
  };

  return (
    <section className={styles.hub} aria-labelledby="challenge-hub-heading">
      <header className={styles.intro}>
        <p className={styles.mode}>Asynchronous · browser-local · unrated</p>
        <h1 id="challenge-hub-heading">Same-Puzzle Challenges</h1>
        <p>Create a link so other people can play the same puzzle on their own device and schedule.</p>
        <p className={styles.disclosure}><strong>Not authoritative or cheat-resistant.</strong> The puzzle and progress live in each browser. No account or API requests are made.</p>
      </header>

      <div className={styles.cards}>
        <section className={styles.card} aria-labelledby="create-challenge-heading">
          <h2 id="create-challenge-heading">Create a challenge</h2>
          <p>Secure browser randomness creates an opaque ID. The answer is not shown while creating or sharing the link.</p>
          <button className={styles.primaryButton} type="button" onClick={create}>Create challenge</button>
          {generatedUrl ? (
            <div className={styles.generated}>
              <h3 ref={generatedHeadingRef} tabIndex={-1} aria-live="polite">Challenge link generated</h3>
              <p className={styles.url}>{generatedUrl}</p>
              <button type="button" onClick={() => void copy()}>Copy challenge link</button>
              <p role="status" aria-live="polite">{copyStatus}</p>
              {manualCopy ? (
                <div className={styles.manualCopy}>
                  <label htmlFor="challenge-link-manual-copy">Copy link manually</label>
                  <p id="challenge-link-copy-instructions">Select the link, then use your device&apos;s copy command.</p>
                  <textarea id="challenge-link-manual-copy" ref={manualCopyRef} aria-describedby="challenge-link-copy-instructions" readOnly value={generatedUrl} />
                </div>
              ) : null}
              <a href={generatedUrl}>Open this challenge</a>
            </div>
          ) : null}
        </section>

        <section className={styles.card} aria-labelledby="open-challenge-heading">
          <h2 id="open-challenge-heading">Open a challenge</h2>
          <form onSubmit={open} noValidate>
            <label htmlFor="challenge-id">Challenge ID</label>
            <input id="challenge-id" value={openId} onChange={(event) => setOpenId(event.target.value)} autoComplete="off" spellCheck={false} placeholder="c01-00000000-00" />
            <button type="submit">Open challenge</button>
          </form>
          <p>Paste only the ID from a challenge link. Invalid IDs never open a random puzzle.</p>
        </section>
      </div>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <footer className={styles.links}><a href="/practice">Practice</a><a href="/learn/rules">Rules</a></footer>
    </section>
  );
}
