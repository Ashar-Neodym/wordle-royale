import type { ReactElement } from 'react';
import { PlaceholderPage } from '../../components/PageFrame';

export default function SettingsPage(): ReactElement {
  return (
    <PlaceholderPage eyebrow="Settings" title="Account settings placeholder">
      <p>Authentication, account settings, notifications, privacy controls, and accessibility preferences are not production-ready yet. This preview uses explicit demo sessions only: no password or email signup, no durable accounts, and preview sessions/data may reset.</p>
    </PlaceholderPage>
  );
}
