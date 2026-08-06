import type { AuthPresentationMode } from '../../lib/auth-presentation.ts';

export const disabledPlayPresentation = {
  eyebrow: 'Play now',
  title: 'Practice is ready',
  description: 'Play a complete Wordle game immediately as a guest—no account needed.',
  facts: [
    'Practice is local and not rated.',
    'Your progress and stats are saved on this device.',
  ],
  primaryAction: { href: '/practice', label: 'Play practice' },
  secondaryActions: [
    { href: '/learn/rules', label: 'Rules' },
    { href: '/', label: 'Home' },
  ],
} as const;

type PlayPageDependencies<Params, Workspace> = Readonly<{
  resolveSearchParams: () => Promise<Params>;
  readRankedWorkspace: (params: Params) => Promise<Workspace>;
}>;

export type PlayPagePresentation<Workspace> =
  | Readonly<{ kind: 'practice'; content: typeof disabledPlayPresentation }>
  | Readonly<{ kind: 'ranked'; workspace: Workspace }>;

/** Keeps disabled production account-free, before query parsing or ranked reads. */
export async function resolvePlayPagePresentation<Params, Workspace>(
  mode: AuthPresentationMode,
  dependencies: PlayPageDependencies<Params, Workspace>,
): Promise<PlayPagePresentation<Workspace>> {
  if (mode === 'disabled') {
    return { kind: 'practice', content: disabledPlayPresentation };
  }

  const params = await dependencies.resolveSearchParams();
  return {
    kind: 'ranked',
    workspace: await dependencies.readRankedWorkspace(params),
  };
}
