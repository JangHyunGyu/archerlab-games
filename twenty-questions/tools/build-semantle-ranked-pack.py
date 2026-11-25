#!/usr/bin/env python3
"""Build semantle packs in which the guessable vocabulary IS the ranked vocabulary (v3, v4, ...).

Why
---
v2 computed each secret's Top-1,000 over a dictionary subset (ko: 135,759 of 1,502,519
words, about 9%), but accepted guesses from the whole FastText vocabulary. A guess outside
the subset (for example '지구과학') could score above the #1,000 cutoff and still show
"1,000위 밖", so similarity and rank disagreed.

This builder removes the split:
    vocab = v2 ranked vocabulary + real words the v2 dictionaries missed
    hot/cold packs contain only vocab, and every Top-1,000 is computed over vocab.
Every guessable word that scores above the #1,000 cutoff is therefore in the list, and rank
is monotonic in similarity. Guesses outside vocab (inflected forms such as '과학을', typos,
rare web-crawl strings, rare multi-word compounds) are rejected as unknown words.

History: v3 (2026-11-25) added only frequent words and let spam/slurs through; it was never
used for a round. v4 keeps the v3 approach with blocklists, a booking-site template filter,
rare single dictionary nouns (마라탕, 메타버스) and frequent English brand/modern words.

Inputs
------
- The deployed v2 pack directory (R2 archerlab-r2/semantle-{ko,en}/v2/). Its int8 vectors are
  exactly the quantized FastText vectors the v2 builders used, so the 1.2 GB FastText download
  is not needed. Files are checked against the v2 manifest.json.
- The v2 builders' dictionary sources (downloaded into --sources-dir with the v2 URLs).
  The v2 ranked vocabulary is rebuilt from them and must match v2's rankedVocab exactly.
  The sha256 of every input and the library versions are recorded in manifest.json.

Secret words and their order are copied from v2, so selectRoundSecretIndex picks the same
answer for every round slot. Only the neighbour lists and benchmarks change.

Additions
---------
ko (kiwipiepy morphological analysis of every v2 word outside the v2 ranked vocabulary):
  - frequent words (v2 hot, top ~120k by FastText frequency): a noun or a noun compound of
    known morphemes (at most 3 parts), no particles/endings/plural or approximation suffix,
    no ambiguous particle-like one-syllable tail;
  - rare words: only a single dictionary noun, excluding likely person names and rare names of
    institutions, facilities and places (school names flooded school-related lists). Rare
    multi-noun compounds are left out: they doubled the share of answer-containing words in
    the Top-100 lists (1.6% -> 3.6%).
  - blocklists for gambling/sexual spam, slurs and pejoratives, and a filter for hotel-booking
    template strings ('요금가격', '욕실장애인').
en:
  - any word Hunspell en_US accepts with affix rules ('smartphones', 'webinars');
  - frequent words not in Hunspell ('youtube', 'netflix', 'blogpost') unless they look like
    typos (one edit from a ranked word, or two edits for 9+ letters), abbreviations,
    letter runs or glued function words ('inthe');
  - a word-boundary blocklist for slurs, profanity and sexual terms.

Similarity is reproduced exactly as the Worker computes it (vectors.mjs decodeInt8Vector:
float32 unit vectors, float64 dot product, Math.round-style centipoints).

Usage
-----
  pip install numpy kiwipiepy==0.25.1 kiwipiepy_model==0.25.0 spylls==0.1.7
  python build-semantle-ranked-pack.py --lang ko --pack v4 --v2-dir <semantle-ko/v2 files> \
      --sources-dir <cache dir> --out-dir <output dir>
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import importlib.util
import json
import struct
import time
from pathlib import Path
from typing import Dict, List, Sequence, Set, Tuple

import numpy as np

DIMS = 300
VEC_BYTES = DIMS + 2  # f16 scale + int8[300]
TOP_K = 1000
COLD_BLOCK_WORDS = 64
MIN_SECRET_STRIDE = 24576
MAX_SHARD_BYTES = 200 * 1024 * 1024
TOOLS_DIR = Path(__file__).resolve().parent

# ---------------------------------------------------------------------------
# Korean selection rules
# ---------------------------------------------------------------------------

KO_NOUN_TAGS = {"NNG", "NNP"}
KO_COMPOUND_TAGS = KO_NOUN_TAGS | {"XPN", "XSN"}
# One-syllable tails that are also particles or copula forms ('과학과', '과학인', '과학도').
KO_AMBIGUOUS_TAILS = set("과와도이가은는의에로만나을를랑서야여아께엔인일임요고며면다지게네든란론엘")
KO_BLOCKED_SUBSTRINGS = (
    # gambling / spam
    "바카라", "사다리게임", "먹튀", "대리랭크", "출장안마", "출장마사지", "출장샵", "토토", "카지노", "도박", "슬롯머신",
    "슬롯사이트", "놀이터", "파워볼", "릴게임", "홀덤사이트", "경마사이트", "로얄경마", "배팅", "베팅", "대출문의", "작업대출",
    # sexual
    "섹스", "야동", "몰카", "조건만남", "성기", "딜도", "정액", "왕가슴", "홀복", "포르노", "야설", "자위", "오르가즘",
    "성인용품", "보지", "자지", "오피걸", "립카페", "키스방", "안마방", "싸롱", "쌀롱", "룸살롱", "텐프로", "원나잇", "노콘",
    "피스팅", "티팬티", "원조교제", "성교", "성인검색", "성인인증", "성인자료",
    # slurs, pejoratives, hate
    "씨발", "시발", "병신", "개새", "새끼", "미친놈", "걸레", "좆", "존나", "창녀", "썅", "니미", "된장녀", "김치녀", "한남충",
    "맘충", "틀딱", "급식충",
    "일베", "메갈", "노빠", "문빠", "박빠", "대깨", "국노", "좌좀", "수꼴", "빨갱", "토착왜구", "쪽바리", "짱깨", "깜둥",
    "홍어족", "똥꼬", "게이새", "정신병자",
)
KO_PEJORATIVE_TAILS = {"충", "녀"}  # 맘충, 개념녀: pejorative labels when attached as a separate morpheme
KO_BOOKING_TERMS = {
    "객실", "무료", "호텔", "조식", "요금", "가격", "예약", "시설", "욕실", "금고", "장애인", "애완동물", "반려동물", "주차",
    "와이파이", "수영장", "피트니스", "세탁", "룸서비스", "편의시설", "편의", "프런트", "프론트", "중간급", "리조트", "숙소",
    "숙박", "체크인", "체크아웃", "금연", "흡연", "에어컨", "냉장고", "미니바", "드라이클리닝", "회의실", "셔틀", "교통편",
    "레스토랑", "라운지", "엘리베이터", "화장실", "샤워", "침대", "욕조", "발코니", "전망", "스위트", "트윈", "더블", "싱글",
    "패밀리룸", "디럭스", "스탠다드", "이그제큐티브", "포함", "추가", "할인", "최대", "기간", "전체", "가능", "제공",
}
# Rare proper nouns that name an institution, facility or place ('검단고등학교', '반송동'). Kiwi knows thousands of
# them; added as rare words they flooded the Top-1,000 of secrets such as school or library words.
KO_RARE_NAME_TAILS = (
    "학교", "대학", "대학원", "학원", "협회", "학회", "도서관", "박물관", "미술관", "기념관", "체육관", "회관", "경찰서",
    "소방서", "위원회", "연구원", "연구소", "교육청", "터미널", "운동장", "경기장", "재단", "공원", "공사", "공단", "센터",
    "의회", "병원", "의원", "교회", "성당", "그룹", "방송", "교통", "시청", "구청", "군청", "도청", "법원", "검찰청",
    "우체국", "은행", "조합", "신문", "일보", "전자", "건설", "증권", "보험", "파크", "타워", "빌딩", "아파트", "마을",
    "대교", "터널", "고속도로", "대로", "시장", "호텔", "리조트", "골프장", "저수지", "발전소", "기지", "부대", "사단",
    "왕후", "옹주", "궁주", "공주", "대군", "왕자", "태자", "부인",
)
KO_PLACE_TAILS = set("역동리면읍군시구")  # 간석역, 반송동, 구포리 (rare names of 3+ syllables)
KO_COMMON_SURNAMES = set("김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하곽성차주우구민진나지엄채원천방공현함변염여추소석선설길연위표명기반왕금옥육인맹제모탁국은편용예경봉")


def classify_ko(word: str, tokens: Sequence[Tuple[str, str, bool]], frequent: bool) -> str:
    """tokens: kiwi top analysis as (form, tag, oov). Returns 'accepted' or a rejection reason."""
    forms = [t[0] for t in tokens]
    tags = [t[1] for t in tokens]
    if not 2 <= len(word) <= 8:
        return "length"
    if "".join(forms) != word:
        return "not_plain_concatenation"
    if any(tag not in KO_COMPOUND_TAGS for tag in tags):
        return "particle_ending_or_predicate"
    if not any(tag in KO_NOUN_TAGS for tag in tags):
        return "no_noun"
    if any(tag == "XSN" and f in ("들", "쯤", "씩") for f, tag in zip(forms, tags)):
        return "plural_or_approximation"
    if len(forms) > 1 and len(forms[-1]) == 1 and forms[-1] in KO_AMBIGUOUS_TAILS:
        return "ambiguous_particle_tail"
    if word.endswith("쯤") or (word.endswith("동안") and len(word) > 2):
        return "glued_phrase"  # 중순쯤, 시간동안
    if any(s in word for s in KO_BLOCKED_SUBSTRINGS) or (len(forms) > 1 and forms[-1] in KO_PEJORATIVE_TAILS):
        return "blocked"
    if sum(f in KO_BOOKING_TERMS for f in forms) >= 2:
        return "booking_template"
    if any(t[2] for t in tokens):
        return "unknown_morpheme"
    if frequent:
        if len(forms) > 3 or (len(forms) == 3 and len(word) > 5):
            return "long_multipart"
        return "accepted"
    if len(forms) != 1:
        return "rare_multipart"
    if tags[0] == "NNP" and (len(word) == 2 or (len(word) == 3 and word[0] in KO_COMMON_SURNAMES)):
        return "likely_person_name"  # 준혁, 배정남
    if tags[0] == "NNP" and (word.endswith(KO_RARE_NAME_TAILS) or (len(word) >= 3 and word[-1] in KO_PLACE_TAILS)):
        return "rare_institution_or_place"
    return "accepted"


# ---------------------------------------------------------------------------
# English selection rules
# ---------------------------------------------------------------------------

EN_BLOCKED_WORDS = {
    "fuck", "shit", "cunt", "bitch", "wank", "wanker", "whore", "slut", "nigger", "nigga", "faggot", "fag", "retard",
    "spic", "chink", "kike", "wetback", "tranny", "dyke", "twat", "cock", "dick", "pussy", "porn", "porno", "xxx", "milf",
    "twink", "cum", "clit", "lube", "perv", "pervert", "scumbag", "illegal", "ho", "hoe", "dildo", "boob", "tit", "titty",
    "jizz", "anal", "blowjob", "handjob", "rimjob", "gangbang", "bukkake", "hentai", "xvideo", "xhamster", "pornhub",
    "redtube", "youporn", "rapist", "pedo", "pedophile", "paedophile", "sodomize", "sodomise", "bastard", "jackass",
    "bugger", "effing", "arse", "arsehole", "asshole", "asshat", "douche", "douchebag", "skank", "bollock", "crap", "piss",
    "dipshit", "dumbass", "motherfucker", "bullshit", "hottie", "nude", "camgirl", "sexting", "shemale", "incel", "thot",
    "coon", "beaner", "gook", "raghead", "towelhead", "pikey", "gypo", "spaz", "mong", "tard", "fap", "smut", "orgasm",
    "horny", "butthole", "schlong", "ladyboy", "upskirt", "sextape", "groupsex", "footjob", "creampie", "cumshot",
    "cameltoe", "bigtit", "softcore", "hardcore", "threesome", "stripper", "escort", "hooker", "sexy", "sexcam",
}
EN_BLOCKED_SUBSTRINGS = ("fuck", "shit", "nigg", "cunt", "porn", "xxx", "pedophil", "paedophil", "blowjob", "handjob",
                         "motherf", "bitch", "whore", "wank", "slut", "faggot", "dildo", "jizz", "bukkake", "hentai",
                         "cumshot", "creampie", "upskirt", "bigtit", "titties", "boobs", "milf", "ladyboy", "sexcam",
                         "dickhead", "cocksuck", "lesbo", "nohomo")
EN_SUFFIXES = ("", "s", "es", "ed", "d", "ing", "er", "ers", "y", "ies", "ie", "ish", "z")
EN_GLUE = {"the", "of", "in", "at", "on", "to", "and", "for", "from", "with", "by", "is", "it", "a", "an", "http",
           "https", "www", "com", "html", "though", "this", "that", "my", "your"}
LETTERS = "abcdefghijklmnopqrstuvwxyz"


def en_blocked(word: str) -> bool:
    if any(s in word for s in EN_BLOCKED_SUBSTRINGS):
        return True
    for suffix in EN_SUFFIXES:
        if suffix and not word.endswith(suffix):
            continue
        base = word[: len(word) - len(suffix)] if suffix else word
        if base in EN_BLOCKED_WORDS or (suffix in ("ed", "ing", "er", "ers") and base + "e" in EN_BLOCKED_WORDS):
            return True
    return False


def edits1(word: str) -> Set[str]:
    splits = [(word[:i], word[i:]) for i in range(len(word) + 1)]
    out = {a + b[1:] for a, b in splits if b}
    out |= {a + b[1] + b[0] + b[2:] for a, b in splits if len(b) > 1}
    out |= {a + c + b[1:] for a, b in splits if b for c in LETTERS}
    out |= {a + c + b for a, b in splits for c in LETTERS}
    out.discard(word)
    return out


def classify_en(word: str, frequent: bool, in_hunspell: bool, ranked: Set[str]) -> str:
    if en_blocked(word):
        return "blocked"
    if len(word) < 3:
        return "short"
    if in_hunspell:
        return "accepted"
    if not frequent:
        return "not_in_hunspell"
    if not any(v in word for v in "aeiouy"):
        return "abbreviation"
    if any(c * 3 in word for c in LETTERS):
        return "repeated_letters"  # sooooo, ahhh
    near = edits1(word)
    if near & ranked:
        return "near_dictionary_word"  # writting, percieved, adn
    if len(word) >= 9 and any(edits1(e) & ranked for e in near):
        return "near_dictionary_word"  # reccomend, proffesional
    for i in range(2, len(word) - 1):
        a, b = word[:i], word[i:]
        if (a in EN_GLUE and b in ranked) or (b in EN_GLUE and a in ranked):
            return "glued_words"  # inthe, athttp
    return "accepted"


# ---------------------------------------------------------------------------
# v2 pack reading
# ---------------------------------------------------------------------------

def read_hot_pack(path: Path) -> Tuple[List[str], np.ndarray]:
    buf = path.read_bytes()
    if buf[:4] != b"SMH2":
        raise SystemExit(f"{path}: not an SMH2 hot pack")
    count, aligned_words_len, _ = struct.unpack_from("<III", buf, 4)
    offsets = np.frombuffer(buf, dtype="<u4", count=count + 1, offset=16)
    words_base = 16 + (count + 1) * 4
    vecs_base = words_base + aligned_words_len
    words = [buf[words_base + offsets[i]: words_base + offsets[i + 1]].decode("utf-8") for i in range(count)]
    raw = np.frombuffer(buf, dtype=np.uint8, count=count * VEC_BYTES, offset=vecs_base)
    return words, raw.reshape(count, VEC_BYTES).copy()


def read_cold_pack(pack_dir: Path) -> Tuple[List[str], np.ndarray]:
    index = (pack_dir / "cold-index.bin").read_bytes()
    if index[:4] != b"SMC2":
        raise SystemExit("cold-index.bin: not an SMC2 index")
    block_count, _ = struct.unpack_from("<II", index, 4)
    shards: Dict[int, bytes] = {}
    words: List[str] = []
    rows: List[np.ndarray] = []
    for b in range(block_count):
        _, offset, length, shard_id, word_count = struct.unpack_from("<IIHBB", index, 12 + b * 12)
        if shard_id not in shards:
            shards[shard_id] = (pack_dir / f"cold-{shard_id}.bin").read_bytes()
        block = shards[shard_id][offset: offset + length]
        p = 0
        for _ in range(word_count):
            wl = block[p]
            p += 1
            words.append(block[p: p + wl].decode("utf-8"))
            p += wl
            rows.append(np.frombuffer(block, dtype=np.uint8, count=VEC_BYTES, offset=p))
            p += VEC_BYTES
    return words, np.stack(rows) if rows else np.zeros((0, VEC_BYTES), dtype=np.uint8)


def read_top1k_words(path: Path, stride: int, count: int) -> Set[str]:
    buf = path.read_bytes()
    seen: Set[str] = set()
    for s in range(count):
        p = s * stride + VEC_BYTES
        n = struct.unpack_from("<H", buf, p)[0]
        p += 2
        for _ in range(n):
            wl = buf[p]
            p += 1
            seen.add(buf[p: p + wl].decode("utf-8"))
            p += wl + 2
    return seen


# ---------------------------------------------------------------------------
# Exact runtime similarity (mirrors vectors.mjs decodeInt8Vector + dotNormalized)
# ---------------------------------------------------------------------------

def runtime_unit_vectors(raw: np.ndarray) -> np.ndarray:
    scales = raw[:, :2].copy().view("<f2").astype(np.float64)  # exact f16 values, (n, 1)
    q = raw[:, 2:].view(np.int8).astype(np.float64)
    val = q * scales  # JS: const val = q * scale (double)
    out32 = val.astype(np.float32)  # JS: out[i] = val (Float32Array)
    norm = np.sqrt(np.sum(val * val, axis=1, keepdims=True))  # JS: sq += val * val (double)
    inv = np.where(norm > 1e-8, 1.0 / np.maximum(norm, 1e-300), 1.0)
    return (out32.astype(np.float64) * inv).astype(np.float32)  # JS: out[i] *= inv


def to_centi(sims: np.ndarray) -> np.ndarray:
    clipped = np.clip(sims, -1.0, 1.0)
    return np.clip(np.floor(clipped * 10000 + 0.5), -10000, 10000).astype(np.int64)  # Math.round


# ---------------------------------------------------------------------------
# Vocabulary
# ---------------------------------------------------------------------------

def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def v2_ranked_vocab_ko(sources: Path) -> Tuple[Set[str], List[Path]]:
    v2 = load_module(TOOLS_DIR / "build-semantle-pack.py", "build_semantle_pack_v2")
    zip_path = sources / "ko-aff-dic-0.7.92.zip"
    secrets_path = sources / "semantle_secrets.txt"
    freq_path = sources / "semantle_frequent.txt"
    mecab_dir = sources / "mecab"
    v2.download_file(v2.HUNSPELL_URL, zip_path, "Korean Hunspell ko.dic")
    v2.download_file(v2.NEWSJELLY_SECRETS_URL, secrets_path, "NewsJelly secrets.txt")
    v2.download_file(v2.NEWSJELLY_FREQ_URL, freq_path, "NewsJelly frequent_words.txt")
    mecab_paths = []
    for csv_name in v2.MECAB_CSVS:
        v2.download_file(v2.MECAB_BASE_URL + csv_name, mecab_dir / csv_name, f"mecab {csv_name}")
        mecab_paths.append(mecab_dir / csv_name)
    vocab = (
        v2.load_hunspell_words(zip_path)
        | v2.load_mecab_headwords(mecab_dir)
        | set(v2.load_word_list(freq_path))
        | set(v2.load_word_list(secrets_path))
    )
    inputs = [zip_path, secrets_path, freq_path, *mecab_paths]
    # NewsJelly frequent_words.txt is a copy of Wiktionary Korean_5800, so the separate
    # Wiktionary fetch adds nothing; the rankedVocab assertion proves it.
    wikt_path = sources / "wikt_ko_5800.json"
    if wikt_path.exists():
        vocab |= set(v2.load_wiktionary_words(wikt_path))
        inputs.append(wikt_path)
    return vocab - v2.SLUR_EXCLUSIONS, inputs


def v2_ranked_vocab_en(sources: Path) -> Tuple[Set[str], List[Path]]:
    v2 = load_module(TOOLS_DIR / "build-semantle-en-pack.py", "build_semantle_en_pack_v2")
    g10k_path = sources / "google-10000-english-usa-no-swears.txt"
    dic_path = sources / "en_index.dic"
    dwyl_path = sources / "words_alpha.txt"
    v2.download_file(v2.GOOGLE_10K_URL, g10k_path, "Google 10k English (no swears)")
    v2.download_file(v2.HUNSPELL_EN_URL, dic_path, "Hunspell English index.dic")
    v2.download_file(v2.DWYL_WORDS_URL, dwyl_path, "DWYL words_alpha.txt")
    _, hunspell_all_lower = v2.load_hunspell_en(dic_path)
    vocab = set(v2.load_word_list(dwyl_path)) | hunspell_all_lower | set(v2.load_word_list(g10k_path))
    return vocab - v2.EN_SLUR_EXCLUSIONS, [g10k_path, dic_path, dwyl_path]


def ko_additions(candidates: Sequence[str], frequent: Set[str]) -> Tuple[List[str], Dict[str, int]]:
    from kiwipiepy import Kiwi

    kiwi = Kiwi(num_workers=4)
    pool = [w for w in candidates if 2 <= len(w) <= 8]
    reasons: Dict[str, int] = {"length": len(candidates) - len(pool)}
    accepted: List[str] = []
    for word, toks in zip(pool, kiwi.tokenize(pool)):
        verdict = classify_ko(word, [(t.form, t.tag, bool(t.oov)) for t in toks], word in frequent)
        reasons[verdict] = reasons.get(verdict, 0) + 1
        if verdict == "accepted":
            accepted.append(word)
    return accepted, reasons


def en_additions(candidates: Sequence[str], frequent: Set[str], ranked: Set[str], sources: Path) -> Tuple[List[str], Dict[str, int], Path]:
    from spylls.hunspell import Dictionary

    v2 = load_module(TOOLS_DIR / "build-semantle-en-pack.py", "build_semantle_en_pack_v2")
    aff_path = sources / "en_index.aff"
    v2.download_file(v2.HUNSPELL_EN_URL.replace("index.dic", "index.aff"), aff_path, "Hunspell English index.aff")
    dictionary = Dictionary.from_files(str(sources / "en_index"))
    accepted: List[str] = []
    reasons: Dict[str, int] = {}
    for word in candidates:
        verdict = classify_en(word, word in frequent, bool(dictionary.lookup(word)), ranked)
        reasons[verdict] = reasons.get(verdict, 0) + 1
        if verdict == "accepted":
            accepted.append(word)
    return accepted, reasons, aff_path


# ---------------------------------------------------------------------------
# Pack writing
# ---------------------------------------------------------------------------

def utf8_key(word: str) -> bytes:
    return word.encode("utf-8")


def write_hot_pack(path: Path, words: List[str], raw: np.ndarray) -> None:
    word_bytes = [utf8_key(w) for w in words]
    raw_len = sum(len(b) for b in word_bytes)
    aligned_len = (raw_len + 3) & ~3
    offsets = np.empty(len(words) + 1, dtype="<u4")
    pos = 0
    for i, wb in enumerate(word_bytes):
        offsets[i] = pos
        pos += len(wb)
    offsets[len(words)] = pos
    with open(path, "wb") as f:
        f.write(b"SMH2")
        f.write(struct.pack("<III", len(words), aligned_len, 0))
        f.write(offsets.tobytes())
        for wb in word_bytes:
            f.write(wb)
        f.write(b"\x00" * (aligned_len - raw_len))
        f.write(np.ascontiguousarray(raw).tobytes())


def write_cold_pack(out_dir: Path, words: List[str], raw: np.ndarray) -> List[str]:
    blocks: List[Tuple[bytes, bytes, int]] = []
    for start in range(0, len(words), COLD_BLOCK_WORDS):
        parts = bytearray()
        for i in range(start, min(start + COLD_BLOCK_WORDS, len(words))):
            wb = utf8_key(words[i])
            assert len(wb) <= 255
            parts.append(len(wb))
            parts.extend(wb)
            parts.extend(raw[i].tobytes())
        assert len(parts) <= 65535
        blocks.append((utf8_key(words[start]), bytes(parts), min(COLD_BLOCK_WORDS, len(words) - start)))

    shard_names: List[str] = []
    first_words_blob = bytearray()
    entries = bytearray()
    shard_id, shard_offset, shard_file = -1, 0, None
    for first_word, block, count in blocks:
        if shard_file is None or shard_offset + len(block) > MAX_SHARD_BYTES:
            if shard_file:
                shard_file.close()
            shard_id += 1
            assert shard_id < 256
            name = f"cold-{shard_id}.bin"
            shard_names.append(name)
            shard_file = open(out_dir / name, "wb")
            shard_offset = 0
        shard_file.write(block)
        first_words_blob.extend(first_word)
        entries.extend(struct.pack("<IIHBB", len(first_words_blob), shard_offset, len(block), shard_id, count))
        shard_offset += len(block)
    if shard_file:
        shard_file.close()

    with open(out_dir / "cold-index.bin", "wb") as f:
        f.write(b"SMC2")
        f.write(struct.pack("<II", len(blocks), len(first_words_blob)))
        f.write(entries)
        f.write(first_words_blob)
    return shard_names


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def library_versions(lang: str) -> Dict[str, str]:
    names = ["numpy"] + (["kiwipiepy", "kiwipiepy_model"] if lang == "ko" else ["spylls"])
    out = {}
    for name in names:
        try:
            out[name] = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            out[name] = "unknown"
    return out


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

def build(lang: str, pack: str, v2_dir: Path, sources: Path, out_dir: Path) -> None:
    t0 = time.time()
    out_dir.mkdir(parents=True, exist_ok=True)
    sources.mkdir(parents=True, exist_ok=True)

    v2_manifest_path = v2_dir / "manifest.json"
    v2_manifest = json.loads(v2_manifest_path.read_text(encoding="utf-8"))
    for name, info in v2_manifest["files"].items():
        if sha256_file(v2_dir / name) != info["sha256"]:
            raise SystemExit(f"v2 input {name} does not match the v2 manifest")
    meta_v2 = json.loads((v2_dir / "secrets-meta.json").read_text(encoding="utf-8"))
    secrets = [row[0] for row in meta_v2["secrets"]]

    hot_words, hot_raw = read_hot_pack(v2_dir / "hot-pack.bin")
    cold_words, cold_raw = read_cold_pack(v2_dir)
    all_words = hot_words + cold_words
    all_raw = np.concatenate([hot_raw, cold_raw])
    if len(all_words) != meta_v2["totalVocab"] or len(set(all_words)) != len(all_words):
        raise SystemExit("v2 pack word count mismatch")
    word_index = {w: i for i, w in enumerate(all_words)}
    hot_set = set(hot_words)
    print(f"[v2] {len(all_words):,} guessable words, {len(hot_words):,} hot, {len(secrets):,} secrets")

    # 1) Rebuild the v2 ranked vocabulary and prove it matches the deployed pack.
    sources_vocab, source_paths = v2_ranked_vocab_ko(sources) if lang == "ko" else v2_ranked_vocab_en(sources)
    ranked_v2 = {w for w in all_words if w in sources_vocab} | set(secrets)
    if len(ranked_v2) != meta_v2["rankedVocab"]:
        raise SystemExit(f"rebuilt v2 ranked vocab {len(ranked_v2):,} != deployed {meta_v2['rankedVocab']:,}")
    listed = read_top1k_words(v2_dir / "secrets-top1k.bin", meta_v2["secretStride"], len(secrets))
    if not listed <= ranked_v2:
        raise SystemExit(f"{len(listed - ranked_v2)} v2 Top-1k words fall outside the rebuilt ranked vocab")
    print(f"[v2] ranked vocabulary rebuilt exactly: {len(ranked_v2):,} words")

    # 2) Add real words the dictionaries missed.
    candidates = sorted(w for w in all_words if w not in ranked_v2)
    if lang == "ko":
        added, reasons = ko_additions(candidates, hot_set)
    else:
        added, reasons, aff_path = en_additions(candidates, hot_set, ranked_v2, sources)
        source_paths.append(aff_path)
    print(f"[add] {len(candidates):,} off-dictionary candidates -> {dict(sorted(reasons.items(), key=lambda kv: -kv[1]))}")

    vocab = sorted(ranked_v2 | set(added), key=utf8_key)
    vocab_pos = {w: i for i, w in enumerate(vocab)}
    raw = all_raw[[word_index[w] for w in vocab]]
    unit = runtime_unit_vectors(raw).astype(np.float64)
    print(f"[vocab] {pack} guessable = ranked = {len(vocab):,} words (+{len(added):,})")

    # 3) Top-1,000 over the whole vocabulary, secrets in v2 order.
    records: List[bytes] = []
    meta_secrets: List[List] = []
    last_centi = np.empty(len(secrets), dtype=np.int64)
    batch = 64
    for start in range(0, len(secrets), batch):
        rows = [vocab_pos[s] for s in secrets[start: start + batch]]
        sims = unit[rows] @ unit.T
        for r, pos in enumerate(rows):
            row = sims[r]
            row[pos] = -2.0
            part = np.argpartition(row, -TOP_K)[-TOP_K:]
            order = part[np.lexsort((part, -row[part]))]  # similarity desc, then word order
            centi = to_centi(row[order])
            body = bytearray(raw[pos].tobytes())
            body += struct.pack("<H", TOP_K)
            for k in range(TOP_K):
                wb = utf8_key(vocab[order[k]])
                body.append(len(wb))
                body += wb
                body += struct.pack("<h", int(centi[k]))
            records.append(bytes(body))
            meta_secrets.append([secrets[start + r], int(centi[0]), int(centi[9]), int(centi[TOP_K - 1])])
            # Monotonicity: no word outside the list may beat the #1,000 similarity.
            outside = row.copy()
            outside[order] = -2.0
            if outside.max() > row[order[-1]]:
                raise SystemExit(f"secret #{start + r}: an unlisted word beats the #1000 similarity")
            last_centi[start + r] = centi[-1]
        if (start // batch) % 10 == 0:
            print(f"  ... {min(start + batch, len(secrets)):,}/{len(secrets):,} secrets ({time.time() - t0:.0f}s)")

    stride = max(MIN_SECRET_STRIDE, -(-max(len(r) for r in records) // 4096) * 4096)
    with open(out_dir / "secrets-top1k.bin", "wb") as f:
        for record in records:
            f.write(record + b"\x00" * (stride - len(record)))

    # 4) Hot pack = words that were hot (frequent) in v2; cold = the rest.
    hot_idx = [i for i, w in enumerate(vocab) if w in hot_set]
    cold_idx = [i for i, w in enumerate(vocab) if w not in hot_set]
    write_hot_pack(out_dir / "hot-pack.bin", [vocab[i] for i in hot_idx], raw[hot_idx])
    shard_names = write_cold_pack(out_dir, [vocab[i] for i in cold_idx], raw[cold_idx])

    meta = {
        "version": f"semantle-{lang}-{pack}",
        "pack": pack,
        "guessableEqualsRanked": True,
        "dims": DIMS,
        "totalVocab": len(vocab),
        "rankedVocab": len(vocab),
        "addedVocab": len(added),
        "hotCount": len(hot_idx),
        "coldCount": len(cold_idx),
        "secretStride": stride,
        "secrets": meta_secrets,
    }
    (out_dir / "secrets-meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )

    # 5) Self-check: read everything back the way the Worker does.
    check_hot, check_hot_raw = read_hot_pack(out_dir / "hot-pack.bin")
    check_cold, check_cold_raw = read_cold_pack(out_dir)
    back = dict(zip(check_hot + check_cold, np.concatenate([check_hot_raw, check_cold_raw])))
    if len(back) != len(vocab) or any(not np.array_equal(back[w], raw[i]) for i, w in enumerate(vocab)):
        raise SystemExit("hot/cold round-trip mismatch")
    if read_top1k_words(out_dir / "secrets-top1k.bin", stride, len(secrets)) - set(vocab):
        raise SystemExit("Top-1k lists contain words outside the vocabulary")
    if [row[0] for row in meta_secrets] != secrets:
        raise SystemExit("secret order changed")

    files = ["secrets-meta.json", "secrets-top1k.bin", "hot-pack.bin", "cold-index.bin", *shard_names]
    manifest = {
        "version": meta["version"],
        "dims": DIMS,
        "totalVocab": len(vocab),
        "rankedVocab": len(vocab),
        "addedVocab": len(added),
        "hotCount": len(hot_idx),
        "coldCount": len(cold_idx),
        "secretCount": len(secrets),
        "secretStride": stride,
        "inputs": {
            "v2Manifest": sha256_file(v2_manifest_path),
            "v2Version": meta_v2.get("version"),
            "sources": {str(p.relative_to(sources)): sha256_file(p) for p in source_paths},
            "libraries": library_versions(lang),
        },
        "files": {name: {"bytes": (out_dir / name).stat().st_size, "sha256": sha256_file(out_dir / name)} for name in files},
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    (out_dir / "added-words.txt").write_text("\n".join(sorted(added)), encoding="utf-8")
    print(f"[done] {lang} {pack} pack in {time.time() - t0:.0f}s: median #1000 centi {int(np.median(last_centi))}")
    print(json.dumps({k: v for k, v in manifest.items() if k not in ("files", "inputs")}, ensure_ascii=False))


def main() -> None:
    parser = argparse.ArgumentParser(description="Build semantle packs whose guessable vocabulary equals the ranked vocabulary")
    parser.add_argument("--lang", choices=["ko", "en"], required=True)
    parser.add_argument("--pack", required=True, help="pack id written into the metadata, e.g. v4 (R2 prefix semantle-<lang>/<pack>/)")
    parser.add_argument("--v2-dir", type=Path, required=True, help="directory holding the deployed v2 pack files incl. manifest.json")
    parser.add_argument("--sources-dir", type=Path, required=True, help="cache directory for dictionary sources")
    parser.add_argument("--out-dir", type=Path, required=True)
    args = parser.parse_args()
    build(args.lang, args.pack, args.v2_dir, args.sources_dir, args.out_dir)


if __name__ == "__main__":
    main()
