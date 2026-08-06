import type { ReactElement } from 'react';
import type { AuthPresentationPublic } from '../lib/auth-presentation';
import { siteNavModel, type DesktopNavItem, type NavLinkModel } from './site-nav-model';
import styles from './web-shell.module.css';

function MenuLink({ href, label, note }: NavLinkModel): ReactElement {
  return (
    <a className={styles.menuLink} href={href}>
      <span>{label}</span>
      {note ? <small>{note}</small> : null}
    </a>
  );
}

function NavMenu({ label, links }: { label: string; links: readonly NavLinkModel[] }): ReactElement {
  return (
    <details className={styles.navMenu}>
      <summary aria-label={`${label} menu`}>{label}</summary>
      <div className={styles.menuPanel}>
        {links.map((link) => <MenuLink key={`${label}-${link.href}-${link.label}`} {...link} />)}
      </div>
    </details>
  );
}

function DesktopItem({ item }: { item: DesktopNavItem }): ReactElement {
  if (item.kind === 'menu') return <NavMenu label={item.label} links={item.links} />;
  if (item.kind === 'account') return (
    <a className={styles.profileButton} href={item.href} aria-label="Open account and session"><span aria-hidden="true">♟</span> {item.label}</a>
  );
  return <a href={item.href}>{item.label}</a>;
}

export function SiteNav({ presentation }: { presentation: AuthPresentationPublic }): ReactElement {
  const model = siteNavModel(presentation);
  return (
    <nav className={styles.nav} aria-label="Primary">
      <a className={styles.brand} href="/">
        <span className={styles.logoMark} aria-hidden="true">wr</span>
        <span>Wordle Royale</span>
      </a>
      <div className={styles.navLinks}>
        {model.desktop.map((item) => <DesktopItem key={`${item.kind}-${item.label}`} item={item} />)}
      </div>
      <details className={styles.mobileMenu}>
        <summary aria-label="Open site menu">Menu</summary>
        <div className={styles.mobileMenuPanel}>
          {model.mobile.map((link) => <a key={`${link.href}-${link.label}`} href={link.href}>{link.label}</a>)}
        </div>
      </details>
    </nav>
  );
}
