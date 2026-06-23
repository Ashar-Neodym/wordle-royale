# @wordle-royale/design-tokens

Crown Grid Arena design-token source for Wordle Royale.

## Exports

- TypeScript source tokens for color, typography, spacing, radius, shadow/elevation, borders, motion, tile feedback, rank/score chips, lobby badges, connection states, and share-card constants.
- `cssVariables` and `cssThemeVariables` for web CSS custom-property export.
- `nativeTheme` and `nativeThemeVariants` for Expo/React Native consumers. Pixel values are converted to numbers when safe.

## Accessibility metadata

Tile, lobby, rank/score, and connection tokens include text labels, icons/patterns, ARIA live-region hints, and `colorOnlySafe: false` where UI must not rely on color alone. Reduced-motion metadata disables tile flip/shake/pulse/confetti-style feedback.
