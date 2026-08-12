export function lobbyContinuationHref(cursor: string, code?: string): string {
  const params = new URLSearchParams({ cursor });
  if (code) params.set('code', code);
  return `/lobbies?${params.toString()}`;
}
