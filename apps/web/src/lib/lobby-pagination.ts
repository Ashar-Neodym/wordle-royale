export type LobbyBrowserQuery = {
  mode?: 'ranked' | 'casual';
  status?: 'waiting' | 'ready' | 'in_match' | 'closed';
  visibility?: 'public' | 'private';
  limit: number;
  cursor?: string;
};

export function lobbyContinuationHref(query: LobbyBrowserQuery, cursor: string, code?: string): string {
  const params = new URLSearchParams({ limit: String(query.limit), cursor });
  if (query.mode) params.set('mode', query.mode);
  if (query.status) params.set('status', query.status);
  if (query.visibility) params.set('visibility', query.visibility);
  if (code) params.set('code', code);
  return `/lobbies?${params.toString()}`;
}
