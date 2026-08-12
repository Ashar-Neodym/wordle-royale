type RevisionEnvironment = Record<string, string | undefined>;

const PUBLIC_REVISION_KEYS = [
  'RAILWAY_GIT_COMMIT_SHA',
  'RENDER_GIT_COMMIT',
  'VERCEL_GIT_COMMIT_SHA',
  'GIT_COMMIT_SHA',
  'SOURCE_COMMIT_SHA',
] as const;

export function publicDeploymentRevision(environment: RevisionEnvironment = process.env): string {
  for (const key of PUBLIC_REVISION_KEYS) {
    const candidate = environment[key]?.trim();
    if (!candidate) continue;
    if (/^[a-f0-9]{7,64}$/i.test(candidate)) return candidate.toLowerCase();
    return 'unavailable';
  }
  return environment.NODE_ENV === 'production' ? 'unavailable' : 'development';
}
