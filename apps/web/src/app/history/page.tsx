import type { ReactElement } from 'react';
import { PlaceholderPage } from '../../components/PageFrame';

export default function HistoryPage(): ReactElement {
  return (
    <PlaceholderPage eyebrow="History" title="Match history coming later">
      <p>Future match history will show completed match reports, rating movement, and replay/analysis links. No history API is added in this ticket, so active-match answer data remains unavailable here.</p>
    </PlaceholderPage>
  );
}
