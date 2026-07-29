import { publicWebIdentity } from '../../../lib/public-web-identity.ts';

export const dynamic = 'force-dynamic';

export function GET(): Response {
  try {
    return Response.json(publicWebIdentity(), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  } catch {
    return Response.json({ status: 'unavailable' }, { status: 503, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  }
}
