import type { ReactElement } from 'react';
import styles from './web-shell.module.css';

type NavLink = {
  href: string;
  label: string;
  note?: string;
};

const playLinks: NavLink[] = [
  { href: '/play', label: 'Play rated', note: 'board and match' },
  { href: '/lobbies?intent=create', label: 'Create lobby', note: 'rated room' },
  { href: '/lobbies?intent=join', label: 'Join by code', note: 'room code' },
];

const learnLinks: NavLink[] = [
  { href: '/learn/rules', label: 'Rules', note: 'how it works' },
  { href: '/learn/rules#scoring', label: 'Scoring', note: 'points and rating' },
  { href: '/learn/rules#fair-play', label: 'Fair play', note: 'spoiler safe' },
];

const profileLinks: NavLink[] = [
  { href: '/profile', label: 'My profile', note: 'mode ratings' },
  { href: '/history', label: 'Match history', note: 'rated games' },
  { href: '/settings', label: 'Settings', note: 'preview account' },
];

function MenuLink({ href, label, note }: NavLink): ReactElement {
  return (
    <a className={styles.menuLink} href={href}>
      <span>{label}</span>
      {note ? <small>{note}</small> : null}
    </a>
  );
}

function NavMenu({ label, links }: { label: string; links: NavLink[] }): ReactElement {
  return (
    <details className={styles.navMenu}>
      <summary aria-label={`${label} menu`}>{label}</summary>
      <div className={styles.menuPanel}>
        {links.map((link) => <MenuLink key={`${label}-${link.href}-${link.label}`} {...link} />)}
      </div>
    </details>
  );
}

export function SiteNav(): ReactElement {
  return (
    <nav className={styles.nav} aria-label="Primary">
      <a className={styles.brand} href="/">
        <span className={styles.logoMark} aria-hidden="true">wr</span>
        <span>Wordle Royale</span>
      </a>
      <div className={styles.navLinks}>
        <NavMenu label="Play" links={playLinks} />
        <a href="/lobbies">Lobbies</a>
        <a href="/leaderboard">Leaderboard</a>
        <NavMenu label="Learn" links={learnLinks} />
        <NavMenu label="Profile" links={profileLinks} />
        <a className={styles.profileButton} href="/profile" aria-label="Open profile and mode ratings"><span aria-hidden="true">♟</span> Profile</a>
        <a href="/server">Server</a>
      </div>
      <details className={styles.mobileMenu}>
        <summary aria-label="Open site menu">Menu</summary>
        <div className={styles.mobileMenuPanel}>
          <a href="/play">Play</a>
          <a href="/lobbies">Lobbies</a>
          <a href="/leaderboard">Ratings</a>
          <a href="/profile">Profile</a>
          <a href="/learn/rules">Rules</a>
          <a href="/history">History</a>
          <a href="/settings">Settings</a>
          <a href="/server">Server</a>
        </div>
      </details>
    </nav>
  );
}
