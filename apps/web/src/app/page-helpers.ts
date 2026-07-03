export type SearchParamsInput = Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined> | undefined;

export type RankedActionState = {
  action: string | undefined;
  status: string | undefined;
  message: string | undefined;
  lobbyId: string | undefined;
  lobbyCode: string | undefined;
  matchId: string | undefined;
  roundId: string | undefined;
  guessStatus: string | undefined;
};

export async function resolveSearchParams(searchParams: SearchParamsInput): Promise<Record<string, string | string[] | undefined>> {
  return await (searchParams ?? Promise.resolve({}));
}

export function searchValue(params: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export function rankedActionState(params: Record<string, string | string[] | undefined>): RankedActionState {
  return {
    action: searchValue(params, 'action'),
    status: searchValue(params, 'status'),
    message: searchValue(params, 'message'),
    lobbyId: searchValue(params, 'lobbyId'),
    lobbyCode: searchValue(params, 'lobbyCode'),
    matchId: searchValue(params, 'matchId'),
    roundId: searchValue(params, 'roundId'),
    guessStatus: searchValue(params, 'guessStatus'),
  };
}
