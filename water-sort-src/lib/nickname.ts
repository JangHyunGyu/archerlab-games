// Server-side nickname policy: format only (length and allowed characters). There is deliberately
// no banned-word screen; any nickname that passes the format check is accepted and shown.
export const NICKNAME_PATTERN = /^[\p{L}\p{N} _.-]{1,16}$/u;
export type NicknameCheck = { ok: true; name: string } | { ok: false; reason: 'format' };

export function checkNickname(raw: unknown): NicknameCheck {
  if (typeof raw !== 'string') return { ok: false, reason: 'format' };
  const name = raw.trim();
  return NICKNAME_PATTERN.test(name) ? { ok: true, name } : { ok: false, reason: 'format' };
}
