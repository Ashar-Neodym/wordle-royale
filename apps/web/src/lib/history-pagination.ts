export function historyContinuationHref(cursor: string): string {
  return `/history?${new URLSearchParams({ cursor }).toString()}`;
}