import type { ReactElement } from 'react';
import { PageFrame, PageHeader } from '../../../components/PageFrame';
import styles from '../../../components/web-shell.module.css';
import { requireAuthPresentationConfiguration } from '../../../lib/auth-presentation';
import { resolveRulesPresentation } from '../../../lib/rules-presentation';

export default function RulesPage(): ReactElement {
  const rules = resolveRulesPresentation(requireAuthPresentationConfiguration);

  return (
    <PageFrame>
      <PageHeader eyebrow={rules.eyebrow} title={rules.title}>
        <p>{rules.introduction}</p>
      </PageHeader>
      <section className={styles.rulesGrid} aria-label={rules.rulesLabel}>
        {rules.articles.map((article) => (
          <article {...(article.id ? { id: article.id } : {})} className={styles.panel} key={article.title}>
            <h2>{article.title}</h2>
            <p>{article.body}</p>
          </article>
        ))}
      </section>
      <section className={styles.section} aria-labelledby="rules-next-heading">
        <article className={styles.panelWide}>
          <h2 id="rules-next-heading">Ready?</h2>
          <div className={styles.actionRow}>
            {rules.actions.map((action) => (
              <a
                className={action.emphasis === 'primary' ? styles.primaryButton : styles.secondaryButton}
                href={action.href}
                key={action.href}
              >
                {action.label}
              </a>
            ))}
          </div>
        </article>
      </section>
    </PageFrame>
  );
}
