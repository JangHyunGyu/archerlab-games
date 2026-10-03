import { challengeApi, type ChallengeEnv } from './challenge-api.ts';

// A separate allowlist keeps the challenge endpoint stricter than legacy APIs.
const PRODUCTION_ORIGINS = ['https://game.archerlab.dev', 'https://archerlab.dev', 'https://www.archerlab.dev'];
export async function waterSortRoute(request: Request, db: D1Database, env: ChallengeEnv = {}): Promise<Response> {
  const url = new URL(request.url);
  const origins = [...PRODUCTION_ORIGINS];
  // Local development never enables localhost origins on the production Worker.
  if (['localhost', '127.0.0.1'].includes(url.hostname)) origins.push('http://127.0.0.1:3010', 'http://localhost:3010');
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin && !origins.includes(origin)) return Response.json({ error: 'origin' }, { status: 403 });
  const headers = new Headers({ 'Cache-Control': 'no-store', Vary: 'Origin' });
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  const response = await challengeApi(request, db, origins, env);
  for (const [key, value] of headers) response.headers.set(key, value);
  return response;
}
