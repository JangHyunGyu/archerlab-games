// Server-side nickname policy: length, plus characters that would break the ranking row.
// Symbols and emoji are allowed. There is deliberately no banned-word screen; any nickname
// that passes this check is accepted and shown.
const NICKNAME_MAX = 16;
// C0/C1 controls, line separators, and bidi overrides scramble or split a ranking row.
const REJECTED_NICKNAME = /[\u0000-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069]/;

export type NicknameCheck = { ok: true; name: string } | { ok: false; reason: 'format' };

export function checkNickname(raw: unknown): NicknameCheck {
  if (typeof raw !== 'string') return { ok: false, reason: 'format' };
  const name = raw.trim();
  const length = [...name].length;
  if (length < 1 || length > NICKNAME_MAX || REJECTED_NICKNAME.test(name)) return { ok: false, reason: 'format' };
  return { ok: true, name };
}
