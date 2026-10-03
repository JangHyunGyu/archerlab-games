// Start-request rate limit. The client key is a salted SHA-256 of the caller address (IPv6 by /64),
// stored on the run row itself, so counting needs no extra table and the raw address is never kept.
export type StartLimit = { windowMs: number; max: number };
export const START_LIMITS: readonly StartLimit[] = [
  { windowMs: 10 * 60 * 1000, max: 20 },       // Plenty for restarts and shared Wi-Fi.
  { windowMs: 24 * 60 * 60 * 1000, max: 150 },
];

function v6Prefix(address: string) {
  const [head, tail = ''] = address.split('::');
  const first = head ? head.split(':') : [], last = address.includes('::') && tail ? tail.split(':') : [];
  const groups = [...first, ...Array(Math.max(0, 8 - first.length - last.length)).fill('0'), ...last];
  return groups.slice(0, 4).map(group => group.toLowerCase().replace(/^0+(?=.)/, '')).join(':');
}
export async function clientKey(request: Request, salt = ''): Promise<string | null> {
  const address = request.headers.get('CF-Connecting-IP')?.trim();
  if (!address) return null; // Local development has no edge header; production always does.
  const subject = address.includes(':') ? v6Prefix(address) : address;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`water-sort|${salt}|${subject}`));
  return Array.from(new Uint8Array(digest).slice(0, 16), byte => byte.toString(16).padStart(2, '0')).join('');
}
// Returns seconds to wait, or 0 when another start is allowed.
export async function startRetryAfter(db: D1Database, key: string | null, now: number, limits: readonly StartLimit[] = START_LIMITS): Promise<number> {
  if (!key) return 0;
  let wait = 0;
  for (const { windowMs, max } of limits) {
    const row = await db.prepare('SELECT COUNT(*) AS used, MIN(created_at) AS oldest FROM water_sort_runs WHERE ip_hash = ? AND created_at > ?')
      .bind(key, now - windowMs).first<{ used: number; oldest: number | null }>();
    if (row && row.used >= max && row.oldest !== null) wait = Math.max(wait, Math.ceil((row.oldest + windowMs - now) / 1000));
  }
  return wait;
}
