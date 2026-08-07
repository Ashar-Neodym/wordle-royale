import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, it } from 'node:test';
import type { AuthPresentationConfiguration } from './auth-presentation.ts';
import {
  GATED_PUBLIC_PAGE_ROUTES,
  LOCAL_PUBLIC_PAGE_PATTERNS,
  RESTRICTED_ROUTE_CONTENT,
  resolveRestrictedRoute,
  type RestrictedRouteId,
} from './restricted-route-presentation.ts';

const disabled = { status: 'configured', appEnvironment: 'production', mode: 'disabled', registrationMode: null } as const;
const preview = { status: 'configured', appEnvironment: 'preview', mode: 'preview_demo', registrationMode: null } as const;
const durable = { status: 'configured', appEnvironment: 'production', mode: 'durable', registrationMode: 'closed' } as const;
const routeIds = Object.keys(RESTRICTED_ROUTE_CONTENT) as RestrictedRouteId[];

function configurationResolver(configuration: Extract<AuthPresentationConfiguration, { status: 'configured' }>, reads: { count: number }) {
  return () => {
    reads.count += 1;
    return configuration;
  };
}

describe('restricted route mode-first resolver', () => {
  for (const routeId of routeIds) {
    it(`${routeId} resolves disabled before request/API traps`, async () => {
      const authReads = { count: 0 };
      let operationalReads = 0;
      const hostileRequestInputs = {
        get params(): never { throw new Error('params trap was read'); },
        get searchParams(): never { throw new Error('searchParams trap was read'); },
        get headers(): never { throw new Error('headers trap was read'); },
        get cookies(): never { throw new Error('cookies trap was read'); },
      };
      const result = await resolveRestrictedRoute(routeId, async () => {
        operationalReads += 1;
        void hostileRequestInputs.params;
        throw new Error('API trap was read');
      }, configurationResolver(disabled, authReads));

      assert.equal(result.kind, 'disabled');
      assert.equal(result.routeId, routeId);
      assert.equal(authReads.count, 1);
      assert.equal(operationalReads, 0);
    });

    for (const [name, configuration] of [['preview_demo', preview], ['durable', durable]] as const) {
      it(`${routeId} invokes the ${name} loader exactly once and preserves its result`, async () => {
        const authReads = { count: 0 };
        let operationalReads = 0;
        const sentinel = { routeId, name, identity: Symbol(routeId) };
        const result = await resolveRestrictedRoute(routeId, async (presentation) => {
          operationalReads += 1;
          assert.equal(presentation.mode, configuration.mode);
          return sentinel;
        }, configurationResolver(configuration, authReads));

        assert.equal(result.kind, 'operational');
        assert.equal(result.value, sentinel);
        assert.equal(authReads.count, 1);
        assert.equal(operationalReads, 1);
      });
    }
  }
});

describe('public page routing coverage', () => {
  it('enumerates every public page in exactly one local or shared-resolver manifest', () => {
    const appRoot = new URL('../app/', import.meta.url);
    const actualPatterns = readdirSync(appRoot, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name === 'page.tsx')
      .map((entry) => {
        const relative = `${entry.parentPath}/page.tsx`.slice(new URL(appRoot).pathname.length).replace(/\/page\.tsx$/u, '');
        return relative === '' ? '/' : `/${relative}`;
      })
      .sort();
    const manifestPatterns = [...LOCAL_PUBLIC_PAGE_PATTERNS, ...GATED_PUBLIC_PAGE_ROUTES.map(({ pattern }) => pattern)].sort();
    assert.deepEqual(actualPatterns, manifestPatterns);
    assert.equal(new Set(manifestPatterns).size, manifestPatterns.length);
    assert.equal(LOCAL_PUBLIC_PAGE_PATTERNS.length, 8);
    assert.equal(GATED_PUBLIC_PAGE_ROUTES.length, 7);
  });

  it('binds every API-backed page to its closed shared resolver ID', () => {
    for (const route of GATED_PUBLIC_PAGE_ROUTES) {
      assert.equal(route.apiBacked, true);
      const source = readFileSync(new URL(`../app${route.pattern.replace(/\[(?:handle|matchId)\]/u, (value) => value) === '/' ? '' : route.pattern}/page.tsx`, import.meta.url), 'utf8');
      assert.match(source, new RegExp(`resolveRestrictedRoute\\('${route.id}'`, 'u'), `${route.pattern} must use its resolver ID`);
      assert.match(source, /route\.kind === 'disabled'/u);
    }
  });

  it('keeps disabled shared navigation browser-local and free of restricted links', () => {
    const source = readFileSync(new URL('../components/DisabledRoute.tsx', import.meta.url), 'utf8');
    const hrefs = [...source.matchAll(/href="([^"]+)"/gu)].map((match) => match[1]);
    assert.deepEqual(hrefs, ['/practice', '/learn/rules', '/']);
  });
});
