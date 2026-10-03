// Cloudflare Turnstile for starting and registering a run. The server decides whether it is on:
// GET ?config=1 returns the public site key, or null when no keys are configured (the default).
// With no key nothing is loaded and play is unchanged. Any failure here resolves to "no token";
// the server then makes the call, so a blocked script never leaves a player with a hung button.
type Widget = {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  execute(widget: string): void;
  remove(widget: string): void;
};
declare global { interface Window { turnstile?: Widget } }

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TIMEOUT_MS = 20000;
let siteKey: Promise<string | null> | null = null;
let script: Promise<Widget | null> | null = null;

function loadSiteKey(api: string): Promise<string | null> {
  siteKey ??= fetch(`${api}?config=1`).then(response => response.ok ? response.json() as Promise<{ turnstileSiteKey?: string | null } | null> : null)
    .then(data => typeof data?.turnstileSiteKey === 'string' ? data.turnstileSiteKey : null)
    .catch(() => null);
  return siteKey;
}
function loadScript(): Promise<Widget | null> {
  script ??= new Promise(resolve => {
    if (window.turnstile) return resolve(window.turnstile);
    const element = document.createElement('script');
    element.src = SCRIPT; element.async = true;
    element.onload = () => resolve(window.turnstile ?? null);
    element.onerror = () => resolve(null);
    document.head.appendChild(element);
  });
  return script;
}
export async function turnstileToken(api: string, action: 'start' | 'register'): Promise<string | undefined> {
  const key = await loadSiteKey(api);
  if (!key) return undefined;
  const turnstile = await loadScript();
  if (!turnstile) return undefined;
  return new Promise<string | undefined>(resolve => {
    const holder = document.createElement('div');
    // Hidden unless Cloudflare needs the player to tick a box.
    holder.style.cssText = 'position:fixed;inset:0;display:none;place-items:center;z-index:2147483000;background:rgba(0,0,0,.45)';
    document.body.appendChild(holder);
    let widget = '', done = false;
    const finish = (token?: string) => {
      if (done) return;
      done = true; clearTimeout(timer);
      try { if (widget) turnstile.remove(widget); } catch { /* Already gone. */ }
      holder.remove(); resolve(token);
    };
    const timer = setTimeout(() => finish(undefined), TIMEOUT_MS);
    try {
      widget = turnstile.render(holder, {
        sitekey: key, action, execution: 'execute', appearance: 'interaction-only',
        callback: (token: string) => finish(token),
        'error-callback': () => finish(undefined),
        'timeout-callback': () => finish(undefined),
        'before-interactive-callback': () => { holder.style.display = 'grid'; },
        'after-interactive-callback': () => { holder.style.display = 'none'; },
      });
      turnstile.execute(widget);
    } catch { finish(undefined); }
  });
}
