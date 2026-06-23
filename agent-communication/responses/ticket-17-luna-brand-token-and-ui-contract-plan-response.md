# Ticket 17 — Brand Token and UI Contract Plan — Response

## Summary

Converted the selected `Crown Grid Arena` brand direction into an implementation-ready token and UI state contract plan for Wordle Royale frontend work.

This response defines token naming, concrete values where possible, tile feedback states with colorblind support, ranked/score/lobby/status visual contracts, share-card rules, web/mobile token mapping, and the UI states frontend components must support.

This is a planning/spec ticket. No app code was implemented.

## Decisions / Recommendations

- Use `wr.` as the design token namespace so Wordle Royale tokens stay distinct from third-party library tokens.
- Store source tokens in TypeScript first, then export CSS custom properties for Next.js and plain objects for Expo React Native.
- Treat tile feedback as a multi-signal system: color, pattern, icon, border, and accessible label. Color alone is not enough.
- Lock `Crown Grid Arena` as the default launch theme:
  - Dark shell.
  - Tile-first UI.
  - Crown gold for rank/winner emphasis.
  - Electric blue for focus and secondary interaction.
  - Green/amber/gray tile feedback, with shape/pattern support.
- Build theme variants from the start: default dark, light/casual, high contrast, colorblind, and reduced motion.
- Keep ranked visuals compact and precise. Use score/MMR chips, tier badges, and placement cards instead of noisy effects.
- Keep casual lobby visuals softer. Lobby code, share action, ready states, and player count should be clearer than rating/ranked detail.
- Do not use local UI state as game authority. Components render server-shaped state from Ticket 10 and emit user intents only.

## Detailed Output

### 1. Token naming scheme

Use a hierarchical token naming scheme:

```text
wr.{category}.{role}.{variant}.{state}
```

Examples:

```text
wr.color.bg.app
wr.color.surface.card
wr.color.text.primary
wr.color.action.primary.bg
wr.color.tile.correct.bg
wr.color.tile.correct.pattern
wr.color.status.reconnecting.bg
wr.radius.card.md
wr.shadow.elevation.2
wr.type.size.body.md
wr.motion.duration.fast
```

Recommended token categories:

```text
wr.color
wr.type
wr.space
wr.radius
wr.shadow
wr.border
wr.motion
wr.opacity
wr.z
wr.size
wr.tile
wr.rank
wr.score
wr.lobby
wr.connection
wr.shareCard
```

Recommended source files:

```text
packages/design-tokens/src/
  color.ts
  typography.ts
  spacing.ts
  radius.ts
  shadow.ts
  border.ts
  motion.ts
  tile.ts
  rank.ts
  score.ts
  lobby.ts
  connection.ts
  share-card.ts
  themes.ts
  index.ts
```

### 2. Core color tokens

#### Base palette

| Token | Value | Use |
|---|---:|---|
| `wr.color.base.midnightNavy` | `#101827` | Primary dark app background |
| `wr.color.base.deepSlate` | `#172033` | Cards, lobby panels, modals |
| `wr.color.base.slateInk` | `#223049` | Raised surfaces, table rows |
| `wr.color.base.tileCream` | `#F7F1DF` | Light tiles, casual surfaces |
| `wr.color.base.paperWhite` | `#F8FAFC` | Text on dark, light surfaces |
| `wr.color.base.crownGold` | `#F4C542` | Rank, winner, logo, primary CTA accents |
| `wr.color.base.royalGreen` | `#2FA66A` | Correct tile, success |
| `wr.color.base.signalAmber` | `#D89B2B` | Present tile, warning |
| `wr.color.base.ashGray` | `#6B7280` | Absent tile, muted states |
| `wr.color.base.electricBlue` | `#4F8CFF` | Focus, links, secondary action |
| `wr.color.base.errorRed` | `#E04F5F` | Error, invalid, destructive |
| `wr.color.base.offlineRed` | `#B4232F` | Offline/blocking connection state |
| `wr.color.base.successBright` | `#45D483` | Positive score/rating delta on dark |
| `wr.color.base.warningSoft` | `#FFE3A3` | Warning text/bg on light surfaces |

#### Semantic color tokens

| Token | Value | Notes |
|---|---:|---|
| `wr.color.bg.app` | `#101827` | Default app background |
| `wr.color.bg.hero` | `#0C1322` | Landing hero / ranked emphasis |
| `wr.color.bg.casual` | `#F7F1DF` | Casual lobby/landing light sections |
| `wr.color.surface.card` | `#172033` | Default dark card |
| `wr.color.surface.cardRaised` | `#223049` | Elevated card / selected row |
| `wr.color.surface.modal` | `#172033` | Modal/drawer surface |
| `wr.color.surface.tileEmpty` | `#24324A` | Empty tile on dark theme |
| `wr.color.text.primary` | `#F8FAFC` | Primary text on dark |
| `wr.color.text.secondary` | `#CBD5E1` | Secondary text on dark |
| `wr.color.text.muted` | `#94A3B8` | Hints/meta text |
| `wr.color.text.inverse` | `#101827` | Text on light/gold surfaces |
| `wr.color.border.default` | `#334155` | Standard border |
| `wr.color.border.strong` | `#64748B` | Strong border/table divisions |
| `wr.color.border.focus` | `#4F8CFF` | Keyboard/focus state |
| `wr.color.action.primary.bg` | `#F4C542` | Main CTA / ranked CTA |
| `wr.color.action.primary.text` | `#101827` | Text on gold button |
| `wr.color.action.secondary.bg` | `#223049` | Secondary button |
| `wr.color.action.secondary.text` | `#F8FAFC` | Secondary button text |
| `wr.color.action.success.bg` | `#2FA66A` | Ready, success |
| `wr.color.action.danger.bg` | `#E04F5F` | Delete, destructive |

### 3. Typography scale

Recommended font stack:

- Display/logo: `Sora`, fallback `Space Grotesk`, `Inter`, `system-ui`.
- UI/body: `Inter`, `Geist`, `SF Pro Text`, `system-ui`, `sans-serif`.
- Numeric/stat: `Roboto Mono`, `SF Mono`, `ui-monospace`, `monospace`.

| Token | Value | Use |
|---|---:|---|
| `wr.type.family.display` | `Sora, Space Grotesk, Inter, system-ui, sans-serif` | Logo, hero, major result |
| `wr.type.family.body` | `Inter, Geist, system-ui, sans-serif` | UI/body |
| `wr.type.family.mono` | `Roboto Mono, SFMono-Regular, ui-monospace, monospace` | Timer, score, rating delta |
| `wr.type.size.xs` | `12px` | Badges, labels |
| `wr.type.size.sm` | `14px` | Meta text, helper text |
| `wr.type.size.md` | `16px` | Body/default |
| `wr.type.size.lg` | `18px` | Card titles |
| `wr.type.size.xl` | `24px` | Screen headings |
| `wr.type.size.2xl` | `32px` | Hero/sub-report placement |
| `wr.type.size.3xl` | `44px` | Landing hero / final placement |
| `wr.type.lineHeight.tight` | `1.1` | Big display headings |
| `wr.type.lineHeight.normal` | `1.45` | Body text |
| `wr.type.lineHeight.relaxed` | `1.6` | Legal/privacy copy |
| `wr.type.weight.regular` | `400` | Body |
| `wr.type.weight.medium` | `500` | Form labels |
| `wr.type.weight.semibold` | `600` | Buttons/card headings |
| `wr.type.weight.bold` | `700` | Result/rank emphasis |

Implementation note: timers and scores must use tabular numerals on web via `font-variant-numeric: tabular-nums`; for React Native use a mono font or platform equivalent.

### 4. Spacing, radius, shadow, border, and size tokens

#### Spacing

| Token | Value |
|---|---:|
| `wr.space.0` | `0` |
| `wr.space.1` | `4px` |
| `wr.space.2` | `8px` |
| `wr.space.3` | `12px` |
| `wr.space.4` | `16px` |
| `wr.space.5` | `20px` |
| `wr.space.6` | `24px` |
| `wr.space.8` | `32px` |
| `wr.space.10` | `40px` |
| `wr.space.12` | `48px` |
| `wr.space.16` | `64px` |

#### Radius

| Token | Value | Use |
|---|---:|---|
| `wr.radius.none` | `0` | Tile grid hard alignments where needed |
| `wr.radius.xs` | `4px` | Small badges |
| `wr.radius.sm` | `8px` | Inputs, keys |
| `wr.radius.md` | `12px` | Buttons, small cards |
| `wr.radius.lg` | `16px` | Desktop cards/modals |
| `wr.radius.xl` | `20px` | Mobile cards/bottom sheets |
| `wr.radius.full` | `999px` | Pills/chips |

#### Shadow / elevation

| Token | Web value | RN mapping |
|---|---|---|
| `wr.shadow.none` | `none` | elevation `0` |
| `wr.shadow.1` | `0 1px 2px rgba(0,0,0,.25)` | elevation `1` |
| `wr.shadow.2` | `0 8px 24px rgba(0,0,0,.28)` | elevation `3` |
| `wr.shadow.3` | `0 18px 48px rgba(0,0,0,.35)` | elevation `6` |
| `wr.shadow.goldGlow` | `0 0 0 1px rgba(244,197,66,.45), 0 0 24px rgba(244,197,66,.20)` | shadowColor `#F4C542`, opacity `.25` |
| `wr.shadow.focus` | `0 0 0 3px rgba(79,140,255,.42)` | use border/focus ring substitute |

#### Border

| Token | Value |
|---|---:|
| `wr.border.width.none` | `0` |
| `wr.border.width.sm` | `1px` |
| `wr.border.width.md` | `2px` |
| `wr.border.width.lg` | `3px` |
| `wr.border.style.default` | `solid` |

#### Component size tokens

| Token | Value | Use |
|---|---:|---|
| `wr.size.touch.min` | `44px` | Minimum mobile touch target |
| `wr.size.tile.mobile` | `52px` | Default mobile word tile target |
| `wr.size.tile.web` | `58px` | Desktop word tile |
| `wr.size.tile.compact` | `36px` | Share/report mini grids |
| `wr.size.key.mobile.height` | `48px` | Mobile keyboard key height |
| `wr.size.key.web.height` | `44px` | Web keyboard key height |
| `wr.size.appShell.sidebar` | `264px` | Desktop sidebar width |
| `wr.size.topBar.height` | `56px` | Mobile top status bar |

### 5. Motion tokens

| Token | Value | Use |
|---|---:|---|
| `wr.motion.duration.instant` | `0ms` | Reduced motion replacement |
| `wr.motion.duration.fast` | `120ms` | Button/hover/focus |
| `wr.motion.duration.normal` | `180ms` | Modal/card transitions |
| `wr.motion.duration.tileFlip` | `260ms` | Tile reveal, normal motion only |
| `wr.motion.duration.roundTransition` | `400ms` | Round/result transition |
| `wr.motion.easing.standard` | `cubic-bezier(.2,0,0,1)` | Default |
| `wr.motion.easing.emphasis` | `cubic-bezier(.2,.8,.2,1)` | Result emphasis |

Reduced-motion contract:

- `tileFlip`, invalid row shake, confetti, score burst, and countdown pulse must switch to `instant` or simple opacity changes.
- Text feedback remains mandatory even when motion is enabled.

### 6. Tile feedback visual states

Tile state enum for UI components:

```ts
type TileFeedbackState =
  | 'empty'
  | 'filled'
  | 'pending'
  | 'submitted'
  | 'correct'
  | 'present'
  | 'absent'
  | 'invalid'
  | 'locked'
  | 'disabled';
```

#### Tile state token table

| State | Background | Border | Text | Pattern/icon | Accessibility note |
|---|---:|---:|---:|---|---|
| `empty` | `#24324A` | `#334155` | `#F8FAFC` | none | Announce as empty cell only when focused or relevant |
| `filled` | `#2C3A55` | `#64748B` | `#F8FAFC` | none | Letter should be read clearly |
| `pending` | `#2C3A55` | `#F4C542` | `#F8FAFC` | subtle outline | Use while waiting for server confirmation |
| `submitted` | `#223049` | `#4F8CFF` | `#F8FAFC` | small clock/dot | Indicates locked but not revealed yet |
| `correct` | `#2FA66A` | `#A7F3D0` | `#07130D` | check or top-right filled corner | Must not rely only on green |
| `present` | `#D89B2B` | `#FFE3A3` | `#111827` | diagonal stripe or centered dot | Must not rely only on amber/yellow |
| `absent` | `#6B7280` | `#9CA3AF` | `#F8FAFC` | dash/minus marker | Distinct from disabled by icon/label |
| `invalid` | `#E04F5F` | `#FCA5A5` | `#FFFFFF` | exclamation icon | Always pair with text feedback like "Not in word list" |
| `locked` | `#172033` | `#64748B` | `#CBD5E1` | lock icon optional | Read-only state after solve/fail/time out |
| `disabled` | `#1C2638` | `#334155` | `#64748B` | none | Use for unavailable input |

#### Colorblind tile variant

Colorblind mode should keep the same approximate hue family but add stronger visual coding:

| State | Color | Pattern/icon |
|---|---:|---|
| `correct` | `#2FA66A` | checkmark + thick border |
| `present` | `#D89B2B` | diagonal stripes + dot |
| `absent` | `#6B7280` | dash marker + muted fill |
| `invalid` | `#E04F5F` | exclamation + text feedback |

Implementation rules:

- Web can use CSS pseudo-elements, masks, or inline SVG icons for patterns.
- React Native should use explicit child views/icons for markers rather than CSS-only patterns.
- Share cards should use pattern-safe tile variants because screenshots/images may be viewed outside app settings.

### 7. Ranked badges and score/rating display tokens

#### Ranked/rating tokens

| Token | Value | Use |
|---|---:|---|
| `wr.rank.color.rated.bg` | `#2A2210` | Rated badge background |
| `wr.rank.color.rated.border` | `#F4C542` | Rated badge border |
| `wr.rank.color.rated.text` | `#FFE8A3` | Rated badge text |
| `wr.rank.color.unrated.bg` | `#223049` | Casual/unrated badge background |
| `wr.rank.color.unrated.border` | `#64748B` | Casual badge border |
| `wr.rank.color.unrated.text` | `#CBD5E1` | Casual badge text |
| `wr.rank.color.provisional.bg` | `#102A43` | Provisional badge background |
| `wr.rank.color.provisional.border` | `#4F8CFF` | Provisional badge border |
| `wr.rank.color.provisional.text` | `#BFDBFE` | Provisional text |
| `wr.score.delta.positive.bg` | `#123524` | MMR gain chip bg |
| `wr.score.delta.positive.text` | `#45D483` | MMR gain text |
| `wr.score.delta.negative.bg` | `#3A1419` | MMR loss chip bg |
| `wr.score.delta.negative.text` | `#FF8A98` | MMR loss text |
| `wr.score.delta.neutral.bg` | `#24324A` | No-change chip bg |
| `wr.score.delta.neutral.text` | `#CBD5E1` | No-change text |

#### Suggested rank tier visual tokens

Rank names are not fully locked, so use generic token keys until Athena/Elisa confirm tier names.

| Token | Value | Suggested tier role |
|---|---:|---|
| `wr.rank.tier.1` | `#A8A29E` | Bronze/Starter equivalent |
| `wr.rank.tier.2` | `#CBD5E1` | Silver equivalent |
| `wr.rank.tier.3` | `#F4C542` | Gold equivalent |
| `wr.rank.tier.4` | `#4F8CFF` | Platinum/Diamond equivalent |
| `wr.rank.tier.5` | `#A78BFA` | Elite/Master equivalent |

Accessibility notes:

- Rating gains/losses cannot rely on green/red alone. Include `+14 MMR`, `-8 MMR`, or `No change` text.
- Badges need text labels: `Rated`, `Unrated`, `Provisional`, `Ranked beta`.
- Use tabular numerals for MMR, score, timers, and solve time.

### 8. Lobby state badge tokens

Lobby state enum for UI components:

```ts
type LobbyUiState =
  | 'created'
  | 'waiting'
  | 'ready'
  | 'starting'
  | 'in_progress'
  | 'completed'
  | 'abandoned'
  | 'cancelled'
  | 'expired'
  | 'full'
  | 'locked'
  | 'host_left'
  | 'settings_changed';
```

| State | Background | Border | Text | Required label |
|---|---:|---:|---:|---|
| `waiting` | `#172033` | `#4F8CFF` | `#BFDBFE` | Waiting |
| `ready` | `#123524` | `#2FA66A` | `#A7F3D0` | Ready |
| `starting` | `#2A2210` | `#F4C542` | `#FFE8A3` | Starting |
| `in_progress` | `#102A43` | `#4F8CFF` | `#BFDBFE` | In progress |
| `completed` | `#24324A` | `#64748B` | `#CBD5E1` | Completed |
| `abandoned` | `#3A1419` | `#E04F5F` | `#FCA5A5` | Abandoned |
| `cancelled` | `#3A1419` | `#E04F5F` | `#FCA5A5` | Cancelled |
| `expired` | `#3A2A12` | `#D89B2B` | `#FFE3A3` | Expired |
| `full` | `#3A2A12` | `#D89B2B` | `#FFE3A3` | Full |
| `locked` | `#24324A` | `#64748B` | `#CBD5E1` | Locked |
| `host_left` | `#3A2A12` | `#D89B2B` | `#FFE3A3` | Host transferred / host left |
| `settings_changed` | `#102A43` | `#4F8CFF` | `#BFDBFE` | Settings changed |

Accessibility notes:

- Badges must include text, not only color.
- Ready state must be visible in player rows with label text and icon.
- Host indicator should use crown icon plus `Host` label.
- Rated/private/public states should use text chips: `Rated`, `Casual`, `Private`, `Public`.

### 9. Reconnect, error, loading, and empty state visual language

#### Connection state enum

```ts
type ConnectionUiState =
  | 'live'
  | 'unstable'
  | 'reconnecting'
  | 'resyncing'
  | 'reconnected'
  | 'offline'
  | 'failed';
```

| State | Background | Border | Text | Icon | Accessibility requirement |
|---|---:|---:|---:|---|---|
| `live` | `#123524` | `#2FA66A` | `#A7F3D0` | signal | Do not over-announce |
| `unstable` | `#3A2A12` | `#D89B2B` | `#FFE3A3` | warning | Announce politely |
| `reconnecting` | `#3A2A12` | `#D89B2B` | `#FFE3A3` | spinner/signal | Input may be disabled; announce |
| `resyncing` | `#102A43` | `#4F8CFF` | `#BFDBFE` | sync | Announce "Resyncing match state" |
| `reconnected` | `#123524` | `#2FA66A` | `#A7F3D0` | check | Toast, polite announcement |
| `offline` | `#3A1419` | `#E04F5F` | `#FCA5A5` | offline | Blocking banner, assertive if gameplay input stops |
| `failed` | `#3A1419` | `#E04F5F` | `#FCA5A5` | error | Provide retry/return action |

#### Loading state language

- Skeleton cards use `wr.color.surface.cardRaised` with animated shimmer disabled in reduced-motion mode.
- Buttons show inline spinner and retain stable width.
- Gameplay server submission uses `pending`/`submitted` row states, not a full-screen loading overlay.
- Match start can use countdown tokens, but must avoid aggressive motion.

#### Empty state language

| Empty state | Visual treatment | Primary action |
|---|---|---|
| No recent matches | Card with muted grid icon | Quick Join |
| No public lobbies | Empty lobby card with globe/people icon | Create Lobby / Clear filters |
| No rating history | Provisional rank card | Play Ranked |
| Empty leaderboard | Trophy outline, season copy | Play Ranked |
| No match history | Small grid icon | Play Now |

#### Error state language

- Inline form errors: red border, red helper text, text label.
- Domain recoverable errors: card/banner with specific recovery action.
- Blocking errors: full-screen error state with retry and return home.
- Destructive actions: red background/border plus confirmation text.

Accessibility notes:

- Error copy must be specific. Avoid only generic "Something went wrong" except as fallback.
- Use ARIA live regions for gameplay and connection errors on web.
- React Native should use accessibility announcements for connection and gameplay feedback where supported.

### 10. Share-card visual rules

#### Share-card token values

| Token | Value | Use |
|---|---:|---|
| `wr.shareCard.size.square` | `1080x1080` | Default social share |
| `wr.shareCard.size.story` | `1080x1920` | Optional story format |
| `wr.shareCard.bg` | `#101827` | Default share background |
| `wr.shareCard.accent` | `#F4C542` | Crown/top divider |
| `wr.shareCard.text.primary` | `#F8FAFC` | Main result text |
| `wr.shareCard.text.secondary` | `#CBD5E1` | Supporting stats |
| `wr.shareCard.tile.size` | `56px` | Square card mini grid |
| `wr.shareCard.tile.gap` | `6px` | Tile grid gap |
| `wr.shareCard.radius` | `32px` | Card radius if rendered as image panel |

#### Share-card content rules

Always safe:

- Product name.
- Player placement.
- Total score.
- Rated/unrated label.
- MMR delta if rated.
- Rounds solved count.
- Spoiler-safe tile pattern.
- App URL.

Do not include unless explicitly approved:

- Target answer words.
- Other players' private handles beyond public display policy.
- Full guess text.
- Internal rating formulas.
- Anti-cheat or suspicious status.

Visual rules:

- Use dark navy background, crown gold accent, and tile-grid result pattern.
- Include `spoilerSafe: true` indicator in share data when generated by API.
- Use colorblind-safe tile markers even in exported images.
- Avoid tiny text; share card should still read on phone previews.

### 11. Web/mobile token sharing approach

#### Source of truth

Use `packages/design-tokens/src/*.ts` as source of truth:

```ts
export const colors = {
  bg: {
    app: '#101827',
    hero: '#0C1322',
  },
  tile: {
    correct: { bg: '#2FA66A', border: '#A7F3D0', text: '#07130D' },
  },
} as const;
```

#### Web output

Generate or manually export CSS variables:

```css
:root {
  --wr-color-bg-app: #101827;
  --wr-color-surface-card: #172033;
  --wr-color-tile-correct-bg: #2FA66A;
  --wr-radius-card-md: 12px;
}

[data-theme="high-contrast"] {
  --wr-color-border-focus: #FFFFFF;
}
```

Web usage:

```tsx
<div className="card" style={{ background: 'var(--wr-color-surface-card)' }} />
```

#### Expo React Native output

Export plain objects:

```ts
export const wrTheme = {
  color: {
    bg: { app: '#101827' },
    tile: { correct: { bg: '#2FA66A' } },
  },
  radius: { cardMd: 12 },
  space: { 4: 16 },
} as const;
```

React Native usage:

```tsx
<View style={{ backgroundColor: wrTheme.color.bg.app }} />
```

#### Platform caveats

- CSS pseudo-elements can draw tile patterns on web; RN should use child views/icons.
- Web can use `box-shadow`; RN needs `shadow*` + `elevation` approximations.
- Web uses CSS media query `prefers-reduced-motion`; RN should read accessibility reduce-motion settings and app settings.
- Web uses ARIA live regions; RN uses `accessibilityLiveRegion` where available and explicit announcements where needed.

### 12. UI state inventory frontend components must support

#### Auth/profile/onboarding states

- Anonymous
- Authenticated/profile incomplete
- Authenticated/consent incomplete
- Authenticated/onboarding complete
- Login loading
- Register loading
- Invalid credentials
- Email already used
- Password reset sent
- Handle available
- Handle unavailable
- Handle validation error
- Consent saved
- Consent save failed

#### Home/dashboard states

- Initial loading
- Empty/new player
- Recent matches available
- Active/rejoinable lobby
- Active/rejoinable match
- Ranked provisional
- Ranked unavailable
- Maintenance notice

#### Lobby states

- Created
- Waiting
- Ready
- Starting
- In progress
- Completed
- Abandoned
- Cancelled
- Expired
- Full
- Public
- Private
- Rated
- Unrated
- Ranked-compatible
- Ranked-incompatible
- Host
- Non-host
- Player ready
- Player not ready
- Player disconnected
- Host transferred
- Settings changed
- Start disabled: not enough players
- Start disabled: players not ready
- Start disabled: invalid ranked settings
- Join failed: not found
- Join failed: full
- Join failed: expired
- Join failed: already started
- Join failed: rank requirement not met

#### Match/gameplay states

From Ticket 10, frontend must support:

```ts
type MatchState =
  | 'initializing'
  | 'countdown'
  | 'in_progress'
  | 'round_intermission'
  | 'finalizing'
  | 'completed'
  | 'abandoned'
  | 'cancelled'
  | 'voided';

type RoundState =
  | 'pending'
  | 'countdown'
  | 'active'
  | 'finalizing'
  | 'completed'
  | 'voided';

type PlayerRoundState =
  | 'not_started'
  | 'active'
  | 'solved'
  | 'failed'
  | 'timed_out'
  | 'forfeited'
  | 'disconnected'
  | 'voided';
```

Gameplay UI must also support:

- Empty row
- Filled row
- Pending submit
- Server accepted guess
- Server rejected invalid word
- Submitted but unrevealed
- Solved
- Failed
- Timed out
- Forfeited
- Disconnected
- Input disabled during reconnect/resync
- Input disabled after round complete
- Match voided
- Round intermission
- Match finalizing
- Match completed

#### Match report/profile/leaderboard states

- Casual match report
- Rated match report
- MMR gain
- MMR loss
- No MMR change
- Provisional before/after
- Placement tie
- Match abandoned
- Match voided
- Participant-only report denied
- Share card enabled
- Share card disabled
- Share card loading
- Leaderboard loading
- Leaderboard empty
- User unranked
- Rating history empty
- Match history empty

#### Global status states

- Loading
- Empty
- Inline error
- Blocking error
- Rate limited
- Unauthorized
- Forbidden
- Offline
- Reconnecting
- Resyncing
- Reconnected
- Server unavailable
- Maintenance

## Open Questions

1. Legal/product: is `Wordle Royale` approved for public launch, or is a rename required before final logo/app-icon work?
2. Theme default: should launch default to dark mode only, system theme, or dark plus optional light/casual theme?
3. Rank tiers: what are the final tier names and thresholds? Current tokens use generic tier keys.
4. Logo assets: should frontend use placeholder crown/grid assets until a visual designer produces final SVGs?
5. Share cards: should target words ever be revealed after match completion, or should all share exports stay spoiler-safe by default?
6. Typography licensing: are `Sora`/`Inter` acceptable as open-source defaults, or does Ashar want a custom/premium typeface?
7. Component library choice: should implementation use platform-native styling with shared tokens, NativeWind/Tailwind, Tamagui, or another cross-platform system?
8. High contrast: should high-contrast be a separate theme toggle or follow OS/browser setting only?

## Follow-up Tickets

### Ticket: Implement design token package

- Target agent: Luna
- Why that agent is needed: Frontend implementation needs source-of-truth tokens before building components.
- Exact task: Create `packages/design-tokens` with TypeScript source tokens for color, typography, spacing, radius, shadow, motion, tile, rank, lobby, connection, and share-card values. Export web CSS variables and Expo React Native objects.
- Inputs/context they need: Ticket 17 response, Ticket 09 brand direction, Athena decision locks.
- Expected output back to Athena: Token package files, example usage, commands run with exit codes.

### Ticket: Implement tile feedback primitives

- Target agent: Luna
- Why that agent is needed: Tile feedback is core to gameplay and accessibility.
- Exact task: Build WordTile and KeyboardKey primitives supporting empty, filled, pending, submitted, correct, present, absent, invalid, locked, disabled, colorblind, high-contrast, and reduced-motion variants.
- Inputs/context they need: Ticket 17 tile state table, Ticket 03 gameplay UX, Ticket 10 state contract.
- Expected output back to Athena: Component files, fixture/demo states, accessibility notes, verification evidence.

### Ticket: Build UI state fixture catalog

- Target agent: Luna
- Why that agent is needed: Frontend screens need stable mock states before backend integration.
- Exact task: Create fixture data for auth, onboarding, dashboard, lobby, gameplay, reconnect, match report, leaderboard, profile, settings, empty/error/loading states.
- Inputs/context they need: Ticket 17 state inventory, Ticket 10 amended contract, Ticket 12 fixture strategy.
- Expected output back to Athena: Fixture files and scenario index, with commands/tests run.

### Ticket: Create brand/component preview surface

- Target agent: Luna
- Why that agent is needed: Tokens and states need visual review before full screen implementation.
- Exact task: Build Storybook or a lightweight `/dev/components` preview showing color tokens, typography, buttons, cards, badges, tile states, lobby badges, connection banners, score chips, and share-card sample.
- Inputs/context they need: Implemented token package, Ticket 17 token/state contract.
- Expected output back to Athena: Preview route/tool, screenshots or inspection evidence, known issues.

### Ticket: Accessibility validation of token contract

- Target agent: Jasmine
- Why that agent is needed: Independent QA should validate contrast, colorblind support, reduced motion, and screen-reader state language.
- Exact task: Review Ticket 17 tokens and implemented previews for WCAG contrast, colorblind distinguishability, keyboard focus visibility, and state-label clarity.
- Inputs/context they need: Ticket 17 response, implemented token/component previews, Ticket 03 accessibility requirements.
- Expected output back to Athena: Pass/fail accessibility report with required token/component fixes.

### Ticket: Logo and app icon concept pass

- Target agent: Luna or visual design specialist
- Why that agent is needed: Final brand assets should be selected before app-store and production polish.
- Exact task: Produce concrete Crown Grid Arena logo and app icon concepts, including SVG-friendly marks, one-color versions, small-size tests, and favicon/mobile icon notes.
- Inputs/context they need: Ticket 09 brand direction, Ticket 17 token plan, legal/product name decision.
- Expected output back to Athena: Concept sheet and recommended asset direction.

### Ticket: Confirm brand/legal and theme decisions

- Target agent: Athena or human owner
- Why that agent is needed: Implementation should not overcommit to final public brand assets until legal/name/theme decisions are locked.
- Exact task: Decide product-name safety, default theme, rank tier names, typography defaults, and share-card spoiler policy.
- Inputs/context they need: Ticket 17 open questions, Ticket 09 branding response, legal/trademark concerns.
- Expected output back to Athena: Updated decision lock file.

## Files Changed

- `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-17-luna-brand-token-and-ui-contract-plan-response.md`

## Tests / Commands Run

None — planning/spec task only. No shell commands or project tests were run.

## Evidence / Result

- Read assigned ticket: `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/tickets/ticket-17-luna-brand-token-and-ui-contract-plan.md`.
- Reviewed Ticket 09 branding response: `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-09-luna-branding-visual-direction-response.md`.
- Reviewed Ticket 03 UX response already present in context: `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-03-luna-ux-flow-wireframe-plan-response.md`.
- Reviewed Athena decision locks: `/home/ashar/Desktop/hermes-projects/wordle-royale/docs/2026-06-22-athena-decision-locks-after-tickets-01-10.md`.
- Reviewed Ticket 10 reconciliation response: `/home/ashar/Desktop/hermes-projects/wordle-royale/agent-communication/responses/ticket-10-elisa-contract-reconciliation-amendments-response.md`.
- Created the required response file in `agent-communication/responses/`.
- The response includes token naming scheme, concrete token values, accessibility notes for feedback states, web/Expo token mapping, UI state inventory, open brand/legal questions, and follow-up implementation/mockup tickets.

## Risks / Blockers

- Token values are implementation-ready recommendations, but they still need contrast/colorblind QA before final production use.
- Final brand assets are blocked on legal/product review of the `Wordle Royale` name.
- Rank tier names and thresholds are not locked, so this plan uses generic tier token names.
- Share-card spoiler policy still needs final product confirmation.
- Styling/tooling choices are not locked, so the token approach intentionally stays library-agnostic.
