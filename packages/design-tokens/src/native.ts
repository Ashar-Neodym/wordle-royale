import { wrTheme, wrThemeVariants } from './themes.js';

const pxToNumber = (value: string): string | number => {
  if (value === '0') return 0;
  if (/^-?\d+(\.\d+)?px$/.test(value)) return Number(value.slice(0, -2));
  return value;
};

const convert = (value: unknown): unknown => {
  if (typeof value === 'string') return pxToNumber(value);
  if (Array.isArray(value)) return value.map(convert);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, convert(child)]));
  }
  return value;
};

export const nativeTheme = convert(wrTheme) as typeof wrTheme;
export const nativeThemeVariants = convert(wrThemeVariants) as typeof wrThemeVariants;
