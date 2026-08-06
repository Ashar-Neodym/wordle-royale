import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { authLimitedPresentation } from '../lib/auth-presentation.ts';

const sources = {
  nav: readFileSync(new URL('./SiteNav.tsx', import.meta.url), 'utf8'),
  navModel: readFileSync(new URL('./site-nav-model.ts', import.meta.url), 'utf8'),
  home: readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8'),
  play: readFileSync(new URL('../app/play/page.tsx', import.meta.url), 'utf8'),
  lobby: readFileSync(new URL('./LobbyScreens.tsx', import.meta.url), 'utf8'),
  standard: readFileSync(new URL('./StandardQueuePanel.tsx', import.meta.url), 'utf8'),
  speed: readFileSync(new URL('./SpeedQueuePanel.tsx', import.meta.url), 'utf8'),
  profile: readFileSync(new URL('../app/profile/page.tsx', import.meta.url), 'utf8'),
  history: readFileSync(new URL('../app/history/page.tsx', import.meta.url), 'utf8'),
  profileHistory: readFileSync(new URL('./ProfileHistory.tsx', import.meta.url), 'utf8'),
};

const surfaces = ['Standard queue', 'Speed queue', 'Profile', 'History'] as const;

function assertNoPreviewLanguage(value: { title: string; message: string }): void {
  assert.doesNotMatch(`${value.title} ${value.message}`, /\bpreview\b|\bdemo(?:-session|\s+session)?\b/i);
}

describe('signed-out auth surface presentation', () => {
  it('retains temporary demo copy/actions only in preview', () => {
    for (const surface of surfaces) {
      const value = authLimitedPresentation('preview_demo', surface);
      assert.equal(value.action, 'preview_demo');
      assert.match(value.message, /temporary preview demo session/i);
      assert.match(value.message, /not durable|may reset/i);
    }

  });

  it('offers only account sign-in in durable production, independent of registration', () => {
    for (const surface of surfaces) {
      const value = authLimitedPresentation('durable', surface);
      assert.equal(value.action, 'sign_in');
      assert.match(value.message, /durable account session/i);
      assertNoPreviewLanguage(value);
    }

  });

  it('offers no account or demo action in dormant production', () => {
    for (const surface of surfaces) {
      const value = authLimitedPresentation('disabled', surface);
      assert.equal(value.action, 'none');
      assert.match(value.message, /unavailable/i);
      assertNoPreviewLanguage(value);
    }

  });

  it('wires presentation through play queues, profile, history, nav, home, and lobby', () => {
    assert.match(sources.play, /StandardQueuePanel[^>]+authPresentationMode=\{presentation\.mode\}/);
    assert.match(sources.play, /SpeedQueuePanel[^>]+authPresentationMode=\{presentation\.mode\}/);
    assert.match(sources.standard, /authCopy\.action === 'preview_demo'/);
    assert.match(sources.standard, /authCopy\.action === 'sign_in'/);
    assert.match(sources.speed, /authCopy\.action === 'preview_demo'/);
    assert.match(sources.speed, /authCopy\.action === 'sign_in'/);
    assert.match(sources.profile, /AuthRequiredPanel surface="Profile" authPresentationMode=\{presentation\.mode\}/);
    assert.match(sources.history, /AuthRequiredPanel surface="History" authPresentationMode=\{presentation\.mode\}/);
    assert.match(sources.profileHistory, /presentation\.action === 'preview_demo'/);
    assert.match(sources.profileHistory, /presentation\.action === 'sign_in'/);
    assert.match(sources.nav, /siteNavModel\(presentation\)/);
    assert.match(sources.navModel, /presentation\.mode === 'preview_demo'/);
    assert.match(sources.home, /presentation\.mode === 'durable'/);
    assert.match(sources.lobby, /authPresentationMode === 'durable'/);
  });

  it('keeps registration mode out of queue/profile/history decisions', () => {
    for (const source of [sources.standard, sources.speed, sources.profile, sources.history, sources.profileHistory]) {
      assert.doesNotMatch(source, /registrationMode|canary|registration (?:is )?(?:closed|open)/i);
    }
  });
});
