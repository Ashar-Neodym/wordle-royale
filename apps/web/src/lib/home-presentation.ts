import type { AuthPresentationPublic } from './auth-presentation.ts';

export type HomePresentation<TSnapshot> =
  | Readonly<{ kind: 'disabled'; presentation: AuthPresentationPublic }>
  | Readonly<{ kind: 'operational'; presentation: AuthPresentationPublic; api: TSnapshot }>;

/** Resolve strict deployment presentation before deciding whether Home may read server state. */
export async function resolveHomePresentation<TSnapshot>(
  resolvePresentation: () => AuthPresentationPublic,
  loadSnapshot: () => Promise<TSnapshot>,
): Promise<HomePresentation<TSnapshot>> {
  const presentation = resolvePresentation();
  if (presentation.mode === 'disabled') return { kind: 'disabled', presentation };
  const api = await loadSnapshot();
  return { kind: 'operational', presentation, api };
}
