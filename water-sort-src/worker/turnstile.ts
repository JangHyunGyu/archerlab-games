// Cloudflare Turnstile gate for starting and registering a run.
//
// Configuration (both optional; without them the gate is OFF and play is unchanged):
//   TURNSTILE_SITE_KEY    public widget key, served to the page by GET ?config=1
//   TURNSTILE_SECRET_KEY  secret key (wrangler secret), used only for siteverify
//
// Failure design: a missing or rejected token blocks the request. If Cloudflare's verification
// service itself cannot be reached, the request is allowed ("fail open") and logged, because a
// verification outage must not stop every real player. The start rate limit and the pour-timing
// check still apply in that case.
export type TurnstileEnv = { TURNSTILE_SITE_KEY?: string; TURNSTILE_SECRET_KEY?: string };
export type TurnstileResult = 'skipped' | 'passed' | 'missing' | 'failed' | 'unavailable';
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const turnstileEnabled = (env: TurnstileEnv = {}) => Boolean(env.TURNSTILE_SECRET_KEY && env.TURNSTILE_SITE_KEY);
export const turnstileSiteKey = (env: TurnstileEnv = {}) => turnstileEnabled(env) ? env.TURNSTILE_SITE_KEY! : null;

export async function verifyTurnstile(env: TurnstileEnv = {}, token: unknown, address: string | null, action: 'start' | 'register'): Promise<TurnstileResult> {
  if (!turnstileEnabled(env)) return 'skipped';
  if (typeof token !== 'string' || token.length < 10 || token.length > 2048) return 'missing';
  try {
    const form = new FormData();
    form.set('secret', env.TURNSTILE_SECRET_KEY!);
    form.set('response', token);
    if (address) form.set('remoteip', address);
    const response = await fetch(VERIFY_URL, { method: 'POST', body: form, signal: AbortSignal.timeout(4000) });
    if (!response.ok) { console.warn('turnstile_unavailable', response.status); return 'unavailable'; }
    const result = await response.json() as { success?: boolean; action?: string };
    if (!result.success) return 'failed';
    // The widget echoes the action it was rendered for; a start token cannot be replayed to register.
    if (result.action && result.action !== action) return 'failed';
    return 'passed';
  } catch (error) {
    console.warn('turnstile_unavailable', error instanceof Error ? error.message : 'unknown');
    return 'unavailable';
  }
}
