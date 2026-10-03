// Server-side nickname policy: format first, then a banned-word screen that survives the usual
// evasions (spacing, punctuation, full-width letters, leetspeak, doubled letters and Hangul
// syllables typed as separate jamo). It cannot be perfect; the leaderboard also re-screens on read.
export const NICKNAME_PATTERN = /^[\p{L}\p{N} _.-]{1,16}$/u;
export type NicknameCheck = { ok: true; name: string } | { ok: false; reason: 'format' | 'banned' };

// ---- Korean -------------------------------------------------------------------------------
// NFKD splits a syllable into conjoining jamo where final consonants have their own code points,
// so a final "ㅈ" (좆) never matches the initial "ㅈ" of the next syllable (조지).
const hangulKey = (text: string) => text.normalize('NFKD');
// Substring matches on the Hangul-only text. Variants (ㅅ/ㅆ, ㅍ/ㅂ ...) are spelled out so short
// everyday words such as 십 (ten) are not swept up.
const KOREAN_WORDS = [
  // 욕설
  '시발', '씨발', '시팔', '씨팔', '시벌', '씨벌', '쉬발', '쒸발', '씨빨', '시빨', '씨이발', '쓰발',
  '개새끼', '개새기', '개색기', '개색끼', '개세끼', '개쉐', '개섀', '개자식', '개자슥', '개년', '개놈',
  '씹새', '씹년', '씹놈', '씹창', '씹할', '씹물', '씹질', '씹쌔', '쌍년', '쌍놈', '쌍욕',
  '병신', '븅신', '빙신', '병쉰', '등신', '지랄', '지럴', '염병', '옘병', '미친놈', '미친년', '미친새끼',
  '좆', '좇', '조까', '존나', '존니', '니미', '니애미', '니엄마', '느금', '느그엄마', '니애비', '너네엄마',
  '닥쳐라', '엿먹', '꺼져라', '뒤져라', '죽어라', '자살',
  // 성적 표현
  '섹스', '섹파', '섹드립', '야동', '야설', '포르노', '자위', '딸딸이', '딸치', '음경', '음순', '음란', '정액', '질내', '오르가즘',
  '강간', '성폭행', '성추행', '몸캠', '조건만남', '원나잇', '보지', '자지', '꼬추', '불알', '걸레', '창녀', '창년', '갈보', '화냥년', '쓰레기년',
  // 혐오·비하
  '한남충', '김치녀', '된장녀', '맘충', '틀딱', '급식충', '개독', '짱깨', '쪽발이', '쪽바리', '똥남아', '깜둥이', '정박아', '장애새끼', '일베충', '히틀러',
];
// Everyday words that contain a banned fragment.
const KOREAN_ALLOWED = ['시발점', '시발역', '시발지', '병신년', '보지않', '보지마', '보지말', '보지못', '자지않', '자지마', '자지말', '자지못'];
// Initialisms typed as stand-alone jamo, matched only against runs of jamo.
const JAMO_WORDS = ['ㅅㅂ', 'ㅆㅂ', 'ㅅㅃ', 'ㅆㅃ', 'ㅂㅅ', 'ㅄ', 'ㅈㄴ', 'ㅈㄹ', 'ㅁㅊ', 'ㅅㄲ', 'ㄱㅅㄲ', 'ㄷㅊ', 'ㄲㅈ', 'ㄴㄱㅁ', 'ㄴㅇㅁ', 'ㅆㅂㄹㅁ', 'ㅈㅅㅂ', 'ㅂㅁㅅ'];
// A syllable spelled out letter by letter (ㅅㅣㅂㅏㄹ) types its last consonant as an initial, so
// stand-alone jamo runs compare with final consonants folded into initials.
const FINAL_TO_INITIAL: Record<string, string> = {};
[...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'].forEach((jamo, i) => { FINAL_TO_INITIAL[String.fromCharCode(0x11A8 + i)] = hangulKey(jamo); });
const flatJamo = (text: string) => [...hangulKey(text)].map(ch => FINAL_TO_INITIAL[ch] ?? ch).join('');

// ---- English ------------------------------------------------------------------------------
// Matched as substrings of the letters-only text (after leetspeak and doubled-letter folding).
const ENGLISH_WORDS = [
  'fuck', 'fuk', 'shit', 'bitch', 'bastard', 'cunt', 'pussy', 'asshole', 'asswipe', 'whore', 'slut', 'faggot', 'retard', 'porn',
  'penis', 'vagina', 'dildo', 'blowjob', 'handjob', 'jerkoff', 'wank', 'twat', 'motherfuck', 'cocksucker', 'dickhead', 'hitler',
  'rapist', 'molest', 'pedophile', 'paedophile', 'hentai', 'cumshot', 'orgasm', 'masturbat', 'tranny', 'sex', 'dumbass',
  'sibal', 'ssibal', 'shibal', 'tlqkf', 'qudtls', 'gaesaekki', 'gesaekki', 'byungshin', 'jiral',
];
// Letters-only text must match these before doubled letters are folded (nigger vs Niger).
const ENGLISH_EXACT = ['nigger', 'nigga', 'niggr', 'niggah'];
// Short words that hide inside innocent ones; only whole words count.
const ENGLISH_WHOLE = ['ass', 'arse', 'cock', 'dick', 'cum', 'anus', 'anal', 'tit', 'tits', 'titty', 'titties', 'boob', 'boobs', 'fag', 'rape', 'nazi', 'kys', 'pedo', 'spic', 'chink', 'gook', 'kike', 'coon', 'milf', 'xxx'];
const ENGLISH_ALLOWED = ['essex', 'sussex', 'wessex', 'middlesex', 'sextant', 'sextet', 'sexton', 'scunthorpe', 'shitake', 'shiitake'];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i', '+': 't', '€': 'e', '|': 'i' };
// Cyrillic and Greek letters that look Latin.
const LOOKALIKE: Record<string, string> = { а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', і: 'i', ѕ: 's', ј: 'j', ο: 'o', α: 'a', ε: 'e', ι: 'i', ρ: 'p', ν: 'v' };

const collapse = (text: string) => text.replace(/(.)\1+/g, '$1');
const latinBase = (text: string) => text.normalize('NFKC').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
const lettersOnly = (text: string) => [...text].map(ch => LOOKALIKE[ch] ?? LEET[ch] ?? ch).join('').replace(/[^a-z]/g, '');

const koreanWords = KOREAN_WORDS.map(hangulKey);
const koreanAllowed = KOREAN_ALLOWED.map(hangulKey);
const jamoWords = [...JAMO_WORDS.map(flatJamo), ...KOREAN_WORDS.map(flatJamo)];
const englishWords = ENGLISH_WORDS.map(word => collapse(word));
const englishExact = ENGLISH_EXACT;

function stripAllowed(text: string, allowed: string[]) {
  return allowed.reduce((rest, word) => rest.split(word).join(' '), text);
}

export function hasBannedWord(input: string): boolean {
  // Korean: keep Hangul only, so spaces, digits, punctuation and Latin letters between syllables do not hide a word.
  const hangul = input.replace(/[^\p{Script=Hangul}]/gu, '');
  if (hangul) {
    const key = stripAllowed(hangulKey(hangul), koreanAllowed);
    if (koreanWords.some(word => key.includes(word))) return true;
    // A syllable followed by a stray consonant, such as 시ㅂ.
    if (/[시씨쉬쒸][ㅂㅍㅃ]/.test(hangul)) return true;
    for (const run of hangul.match(/[\u3131-\u318E]+/g) ?? []) {
      const flat = flatJamo(run);
      if (jamoWords.some(word => flat.includes(word))) return true;
    }
  }
  // English: letters only, with leetspeak and look-alike letters mapped back.
  const letters = lettersOnly(latinBase(input));
  if (letters) {
    if (englishExact.some(word => letters.includes(word))) return true;
    const folded = collapse(stripAllowed(letters, ENGLISH_ALLOWED));
    if (englishWords.some(word => folded.includes(word))) return true;
    if (ENGLISH_WHOLE.some(word => collapse(letters) === collapse(word))) return true;
    // Whole-word check on the original separators: "big ass", "BigAss", "ass_123".
    const tokens = latinBase(input.replace(/([a-z])([A-Z])/g, '$1 $2')).split(/[^a-z@$!+]+/).map(lettersOnly).filter(Boolean);
    if (tokens.some(token => ENGLISH_WHOLE.some(word => collapse(token) === collapse(word)))) return true;
  }
  return false;
}

export function checkNickname(raw: unknown): NicknameCheck {
  if (typeof raw !== 'string') return { ok: false, reason: 'format' };
  const name = raw.trim();
  if (!NICKNAME_PATTERN.test(name)) return { ok: false, reason: 'format' };
  return hasBannedWord(name) ? { ok: false, reason: 'banned' } : { ok: true, name };
}
