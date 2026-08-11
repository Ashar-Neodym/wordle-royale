import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const component = readFileSync(new URL('./DisplaySettings.tsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/settings/page.tsx', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');
const globalCss = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const shellCss = readFileSync(new URL('./web-shell.module.css', import.meta.url), 'utf8');

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return (0.2126 * channels[0]!) + (0.7152 * channels[1]!) + (0.0722 * channels[2]!);
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort((left, right) => right - left);
  return (lighter! + 0.05) / (darker! + 0.05);
}

function cssHex(source: string, pattern: RegExp): string {
  const match = pattern.exec(source)?.[1];
  assert.ok(match, `missing CSS color for ${pattern}`);
  return match;
}

describe('settings presentation and accessible DOM contract', () => {
  it('is the same useful local settings page in every account mode', () => {
    assert.match(page, /<DisplaySettings \/>/);
    assert.match(page, /browser.*local|browser/i);
    assert.match(page, /not account-synced/i);
    assert.match(page, /href="\/account"/);
    assert.doesNotMatch(page, /requireAuthPresentationConfiguration|preview_demo|mode ===|fetch\s*\(|api-client/);
  });

  it('uses labeled semantic radio groups and explicit Apply and Reset controls', () => {
    assert.equal((component.match(/<fieldset/g) ?? []).length, 2);
    assert.equal((component.match(/<legend>/g) ?? []).length, 2);
    for (const value of ['system', 'reduce', 'standard', 'enhanced']) assert.match(component, new RegExp(`type="radio"[^>]+value="${value}"`));
    for (const label of ['Follow system', 'Reduce motion', 'Standard', 'Enhanced contrast', '>Apply<', '>Reset to defaults<']) assert.match(component, new RegExp(label));
  });

  it('announces every repeated operation distinctly and truthfully warns about memory-only changes', () => {
    assert.match(component, /eventId\.current \+= 1/);
    assert.match(component, /key=\{announcement\.eventId\}/);
    assert.match(component, /aria-live="polite"/);
    assert.match(component, /aria-atomic="true"/);
    assert.match(component, /in memory for this page only/i);
    assert.match(component, /may be lost when you leave or reload/i);
  });

  it('documents and implements reset focus on the first Motion radio', () => {
    assert.match(component, /Reset always returns keyboard focus to the first setting/);
    assert.match(component, /ref=\{firstControl\}/);
    assert.match(component, /requestAnimationFrame\(\(\) => firstControl\.current\?\.focus\(\)\)/);
  });

  it('never uses cookies, an API, network fetch, or account persistence', () => {
    assert.doesNotMatch(component, /fetch\s*\(|document\.cookie|api-client|\/api\//i);
  });
});

describe('global bootstrap and CSS contract', () => {
  it('installs the shared parser bootstrap before interactive and declares stable html defaults', () => {
    assert.match(layout, /displayPreferencesBootstrapScript/);
    assert.match(layout, /strategy="beforeInteractive"/);
    assert.match(layout, /data-wr-motion=\{DEFAULT_DISPLAY_PREFERENCES\.motion\}/);
    assert.match(layout, /data-wr-contrast=\{DEFAULT_DISPLAY_PREFERENCES\.contrast\}/);
    assert.match(layout, /suppressHydrationWarning/);
  });

  it('keeps explicit reduction independent from system reduction', () => {
    assert.match(globalCss, /html\[data-wr-motion='reduce'\][^{]+\{/);
    assert.match(globalCss, /prefers-reduced-motion: reduce/);
    assert.match(globalCss, /html\[data-wr-motion='system'\]/);
  });

  it('provides a stronger documented palette, focus cue, retained game patterns, and responsive settings layout', () => {
    assert.match(globalCss, /Enhanced palette/);
    assert.match(globalCss, /data-wr-contrast='enhanced'/);
    assert.match(globalCss, /outline-width: 4px/);
    assert.match(shellCss, /tile_diagonal_stripe/);
    assert.match(shellCss, /tile_check/);
    assert.match(shellCss, /tile_dash/);
    assert.match(shellCss, /\.settingsFields/);
    assert.match(shellCss, /\.miniStats, \.settingsFields \{ grid-template-columns: 1fr/);
  });

  it('keeps primary-button normal and hover text at WCAG AA contrast in enhanced mode', () => {
    const foreground = cssHex(shellCss, /\.primaryButton \{[^}]*(?:^|;)\s*color:\s*(#[0-9a-f]{6})/im);
    const normal = cssHex(globalCss, /--wr-human-link-dark:\s*(#[0-9a-f]{6})/i);
    const hover = cssHex(globalCss, /--wr-human-link-dark-hover:\s*(#[0-9a-f]{6})/i);
    assert.match(shellCss, /\.primaryButton:hover:not\(:disabled\) \{ background: var\(--wr-human-link-dark-hover\); \}/);
    for (const [state, background] of [['normal', normal], ['hover', hover]] as const) {
      const ratio = contrast(foreground, background);
      assert.ok(ratio >= 4.5, `${state} primary-button contrast is ${ratio.toFixed(2)}:1`);
    }
  });
});
