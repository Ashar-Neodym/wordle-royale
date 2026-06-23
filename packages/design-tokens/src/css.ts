import { wrTheme, wrThemeVariants } from './themes.js';

type TokenLeaf = string | number | boolean;
type TokenTree = TokenLeaf | { readonly [key: string]: TokenTree } | readonly TokenTree[];

const kebab = (value: string) => value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`).replace(/_/g, '-');

const flattenTokens = (value: TokenTree, path: string[] = []): string[] => {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return [`--wr-${path.map(kebab).join('-')}: ${String(value)};`];
  }
  if (Array.isArray(value)) {
    return value.flatMap((child, index) => flattenTokens(child, [...path, String(index)]));
  }
  return Object.entries(value).flatMap(([key, child]) => flattenTokens(child, [...path, key]));
};

export const cssVariables = `:root {\n${flattenTokens(wrTheme as unknown as TokenTree).map((line) => `  ${line}`).join('\n')}\n}\n\n[data-theme="high-contrast"] {\n  --wr-color-border-focus: #FFFFFF;\n  --wr-color-border-strong: #FFFFFF;\n}\n\n@media (prefers-reduced-motion: reduce) {\n  :root {\n    --wr-motion-duration-tile-flip: 0ms;\n    --wr-motion-duration-round-transition: 0ms;\n  }\n}\n`;

export const cssThemeVariables = {
  defaultDark: cssVariables,
  highContrast: `[data-theme="high-contrast"] {\n${flattenTokens(wrThemeVariants.highContrast as unknown as TokenTree).map((line) => `  ${line}`).join('\n')}\n}\n`,
} as const;
