import type { ReactElement } from 'react';
import { PlaceholderPage } from '../../components/PageFrame';

export default function SettingsPage(): ReactElement {
  return (
    <PlaceholderPage eyebrow="Settings" title="Account settings placeholder">
      <p>Authentication, account settings, notifications, privacy controls, and accessibility preferences are not production-ready yet. For now, Wordle Royale uses a local/stub player profile for demo play.</p>
    </PlaceholderPage>
  );
}
