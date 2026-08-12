import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { describe, it } from 'node:test';

const src = resolve(import.meta.dirname, '..');
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = resolve(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(?:ts|tsx)$/u.test(name) ? [path] : [];
  });
}
const sources = files(src).filter((path) => !path.endsWith('.test.ts')).map((path) => [path, readFileSync(path, 'utf8')] as const);
const pageRoutes = files(resolve(src, 'app')).filter((path) => path.endsWith('page.tsx')).map((path) => {
  const route = relative(resolve(src, 'app'), path).replace(/(?:^|\/)page\.tsx$/u, '').replace(/\[([^\]]+)\]/gu, ':$1');
  return `/${route}`.replace(/\/$/u, '') || '/';
});
function routeExists(href: string): boolean {
  if (!href.startsWith('/') || href.startsWith('//') || /(?:^|\/)\.\.(?:\/|$)/u.test(href.split(/[?#]/u, 1)[0]!)) return false;
  let url: URL;
  try { url = new URL(href, 'https://wordle.test'); } catch { return false; }
  if (url.origin !== 'https://wordle.test' || url.pathname.includes('..')) return false;
  const pathname = url.pathname;
  return pageRoutes.some((route) => route.split('/').every((part, index) => part.startsWith(':') || part === pathname.split('/')[index])
    && route.split('/').length === pathname.split('/').length);
}

describe('fixture fallback and deep-link truth audit', () => {
  it('keeps production web source free of fixture imports and fixture-backed fallbacks', () => {
    for (const [path, source] of sources) {
      assert.doesNotMatch(source, /(?:@wordle-royale\/fixtures|(?:^|\/)fixtures(?:\.js|\.ts|['"]))/mu, relative(src, path));
    }
  });

  it('resolves every static internal href, including query and fragment deep links', () => {
    for (const [path, source] of sources) {
      for (const match of source.matchAll(/(?:href=|href:)\s*["'](\/(?!\/)[^"']*)["']/gu)) {
        assert.equal(routeExists(match[1]!), true, `${relative(src, path)}: ${match[1]}`);
      }
    }
  });

  it('fails closed for malformed, external, traversal, and invented routes', () => {
    for (const href of ['https://evil.test/play', '//evil.test', 'javascript:alert(1)', '/../../account', '/not-a-route', '/matches']) {
      assert.equal(routeExists(href), false, href);
    }
  });
});