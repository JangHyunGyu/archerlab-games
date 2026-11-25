#!/usr/bin/env python3
"""Build semantle v3 packs, in which the guessable vocabulary IS the ranked vocabulary.

Why v3 exists
-------------
v2 computed each secret's Top-1,000 over a dictionary subset (ko: 135,759 of 1,502,519
words, about 9%), but accepted guesses from the whole FastText vocabulary. A guess outside
the subset (for example '지구과학') could score above the #1,000 cutoff and still show
"1,000위 밖", so similarity and rank disagreed.

v3 removes the split:
    vocab_v3 = v2 ranked vocabulary + frequent real nouns the v2 dictionaries missed
    hot/cold packs contain only vocab_v3, and every Top-1,000 is computed over vocab_v3.
Every guessable word that scores above the #1,000 cutoff is therefore in the list, and rank
is monotonic in similarity. Guesses outside vocab_v3 (inflected forms such as '과학을',
typos, rare web-crawl strings) are rejected as unknown words.

Inputs
------
- The deployed v2 pack directory. Its int8 vectors are exactly the quantized FastText
  vectors the v2 builders used, so the 1.2 GB FastText download is not needed.
- The v2 builders' dictionary sources (downloaded into --sources-dir with the v2 URLs).
  The v2 ranked vocabulary is rebuilt from them and must match v2's rankedVocab exactly.

Secret words and their order are copied from v2, so selectRoundSecretIndex picks the same
answer for every round slot. Only the neighbour lists and benchmarks change.

Additions
---------
- ko: frequent (v2 hot) words that kiwipiepy analyses as a noun or a noun compound made of
  dictionary morphemes, with no particles/endings/plural suffix and no ambiguous
  particle-like one-syllable tail. Long multi-part strings, spam and slurs are excluded.
- en: frequent (v2 hot) words accepted by Hunspell en_US including affix rules
  (e.g. 'smartphones', 'webinars'), minus slurs/profanity.

Similarity is reproduced exactly as the Worker computes it (vectors.mjs decodeInt8Vector:
float32 unit vectors, float64 dot product, Math.round-style centipoints).

Usage
-----
  pip install numpy kiwipiepy==0.25.1 spylls==0.1.7
  python build-semantle-v3-pack.py --lang ko --v2-dir <dir with semantle-ko/v2 files> \
      --sources-dir <cache dir> --out-dir <output dir>
"""

from __future__ import annotations

import argparse
import hashlib
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

KO_NOUN_TAGS = {"NNG", "NNP"}
KO_COMPOUND_TAGS = KO_NOUN_TAGS | {"XPN", "XSN"}
# One-syllable tails that are also particles or copula forms ('과학과', '과학인', '과학도').
KO_AMBIGUOUS_TAILS = set("과와도이가은는의에로만나을를랑서야여아께엔인일임요고며면다지게네든란론엘")
# Web-crawl spam fragments and slurs that must not become rankable words.
KO_BLOCKED_SUBSTRINGS = (
    "바카라", "사다리게임", "먹튀", "대리랭크", "출장안마", "출장마사지", "야동", "토토사이트",
    "카지노사이트", "안전놀이터", "메이저놀이터", "사설토토", "씨발", "시발놈", "병신", "개새",
    "좆", "존나", "창녀", "썅년", "섹스",
)
EN_BLOCKED_SUBSTRINGS = (
    "fuck", "shit", "nigg", "cunt", "bitch", "wank", "retard", "fag", "slut", "whore",
    "rape", "pedophil", "paedophil", "sodom", "bastard", "jackass", "bugger", "effing",
    "twat", "cock", "pussy", "porn", "xxx", "dick", "arse", "piss", "douche", "skank",
    "tranny", "dyke", "spic", "chink", "kike", "wetback", "hottie",
)


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


def read_cold_pack(v2_dir: Path) -> Tuple[List[str], np.ndarray]:
    index = (v2_dir / "cold-index.bin").read_bytes()
    if index[:4] != b"SMC2":
        raise SystemExit("cold-index.bin: not an SMC2 index")
    block_count, _ = struct.unpack_from("<II", index, 4)
    shards: Dict[int, bytes] = {}
    words: List[str] = []
    rows: List[np.ndarray] = []
    for b in range(block_count):
        _, offset, length, shard_id, word_count = struct.unpack_from("<IIHBB", index, 12 + b * 12)
        if shard_id not in shards:
            shards[shard_id] = (v2_dir / f"cold-{shard_id}.bin").read_bytes()
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


def v2_ranked_vocab_ko(sources: Path) -> Set[str]:
    v2 = load_module(TOOLS_DIR / "build-semantle-pack.py", "build_semantle_pack_v2")
    zip_path = sources / "ko-aff-dic-0.7.92.zip"
    secrets_path = sources / "semantle_secrets.txt"
    freq_path = sources / "semantle_frequent.txt"
    mecab_dir = sources / "mecab"
    v2.download_file(v2.HUNSPELL_URL, zip_path, "Korean Hunspell ko.dic")
    v2.download_file(v2.NEWSJELLY_SECRETS_URL, secrets_path, "NewsJelly secrets.txt")
    v2.download_file(v2.NEWSJELLY_FREQ_URL, freq_path, "NewsJelly frequent_words.txt")
    for csv_name in v2.MECAB_CSVS:
        v2.download_file(v2.MECAB_BASE_URL + csv_name, mecab_dir / csv_name, f"mecab {csv_name}")
    vocab = (
        v2.load_hunspell_words(zip_path)
        | v2.load_mecab_headwords(mecab_dir)
        | set(v2.load_word_list(freq_path))
        | set(v2.load_word_list(secrets_path))
    )
    # NewsJelly frequent_words.txt is a copy of Wiktionary Korean_5800, so the separate
    # Wiktionary fetch adds nothing; the rankedVocab assertion below proves it.
    wikt_path = sources / "wikt_ko_5800.json"
    if wikt_path.exists():
        vocab |= set(v2.load_wiktionary_words(wikt_path))
    return vocab - v2.SLUR_EXCLUSIONS


def v2_ranked_vocab_en(sources: Path) -> Set[str]:
    v2 = load_module(TOOLS_DIR / "build-semantle-en-pack.py", "build_semantle_en_pack_v2")
    g10k_path = sources / "google-10000-english-usa-no-swears.txt"
    dic_path = sources / "en_index.dic"
    dwyl_path = sources / "words_alpha.txt"
    v2.download_file(v2.GOOGLE_10K_URL, g10k_path, "Google 10k English (no swears)")
    v2.download_file(v2.HUNSPELL_EN_URL, dic_path, "Hunspell English index.dic")
    v2.download_file(v2.DWYL_WORDS_URL, dwyl_path, "DWYL words_alpha.txt")
    _, hunspell_all_lower = v2.load_hunspell_en(dic_path)
    vocab = set(v2.load_word_list(dwyl_path)) | hunspell_all_lower | set(v2.load_word_list(g10k_path))
    return vocab - v2.EN_SLUR_EXCLUSIONS


def ko_additions(candidates: Sequence[str]) -> Tuple[List[str], Dict[str, int]]:
    from kiwipiepy import Kiwi

    kiwi = Kiwi(num_workers=4)
    v2 = load_module(TOOLS_DIR / "build-semantle-pack.py", "build_semantle_pack_v2")
    accepted: List[str] = []
    reasons: Dict[str, int] = {}

    def reject(key: str) -> None:
        reasons[key] = reasons.get(key, 0) + 1

    for word, tokens in zip(candidates, kiwi.tokenize(list(candidates))):
        forms = [t.form for t in tokens]
        tags = [t.tag for t in tokens]
        if len(word) < 2 or len(word) > 8:
            reject("length")
        elif "".join(forms) != word:
            reject("not_plain_concatenation")
        elif any(tag not in KO_COMPOUND_TAGS for tag in tags):
            reject("particle_ending_or_predicate")
        elif not any(tag in KO_NOUN_TAGS for tag in tags):
            reject("no_noun")
        elif any(t.oov for t in tokens):
            reject("unknown_morpheme")
        elif any(t.tag == "XSN" and t.form == "들" for t in tokens):
            reject("plural")
        elif len(tokens) > 1 and len(forms[-1]) == 1 and forms[-1] in KO_AMBIGUOUS_TAILS:
            reject("ambiguous_particle_tail")
        elif len(tokens) > 3 or (len(tokens) == 3 and len(word) > 5):
            reject("long_multipart")
        elif word in v2.SLUR_EXCLUSIONS or any(s in word for s in KO_BLOCKED_SUBSTRINGS):
            reject("blocked")
        else:
            accepted.append(word)
    reasons["accepted"] = len(accepted)
    return accepted, reasons


def en_additions(candidates: Sequence[str], sources: Path) -> Tuple[List[str], Dict[str, int]]:
    from spylls.hunspell import Dictionary

    v2 = load_module(TOOLS_DIR / "build-semantle-en-pack.py", "build_semantle_en_pack_v2")
    aff_path = sources / "en_index.aff"
    v2.download_file(v2.HUNSPELL_EN_URL.replace("index.dic", "index.aff"), aff_path, "Hunspell English index.aff")
    dictionary = Dictionary.from_files(str(sources / "en_index"))
    accepted: List[str] = []
    reasons: Dict[str, int] = {}
    for word in candidates:
        if word in v2.EN_SLUR_EXCLUSIONS or any(s in word for s in EN_BLOCKED_SUBSTRINGS):
            reasons["blocked"] = reasons.get("blocked", 0) + 1
        elif not dictionary.lookup(word):
            reasons["not_in_hunspell"] = reasons.get("not_in_hunspell", 0) + 1
        else:
            accepted.append(word)
    reasons["accepted"] = len(accepted)
    return accepted, reasons


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


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

def build(lang: str, v2_dir: Path, sources: Path, out_dir: Path) -> None:
    t0 = time.time()
    out_dir.mkdir(parents=True, exist_ok=True)
    sources.mkdir(parents=True, exist_ok=True)
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
    sources_vocab = v2_ranked_vocab_ko(sources) if lang == "ko" else v2_ranked_vocab_en(sources)
    ranked_v2 = {w for w in all_words if w in sources_vocab} | set(secrets)
    if len(ranked_v2) != meta_v2["rankedVocab"]:
        raise SystemExit(f"rebuilt v2 ranked vocab {len(ranked_v2):,} != deployed {meta_v2['rankedVocab']:,}")
    listed = read_top1k_words(v2_dir / "secrets-top1k.bin", meta_v2["secretStride"], len(secrets))
    if not listed <= ranked_v2:
        raise SystemExit(f"{len(listed - ranked_v2)} v2 Top-1k words fall outside the rebuilt ranked vocab")
    print(f"[v2] ranked vocabulary rebuilt exactly: {len(ranked_v2):,} words")

    # 2) Add frequent real words the dictionaries missed.
    candidates = sorted(w for w in hot_words if w not in ranked_v2)
    if lang == "ko":
        added, reasons = ko_additions(candidates)
    else:
        added, reasons = en_additions(candidates, sources)
    print(f"[add] {len(candidates):,} frequent off-dictionary candidates -> {reasons}")

    vocab = sorted(ranked_v2 | set(added), key=utf8_key)
    vocab_pos = {w: i for i, w in enumerate(vocab)}
    raw = all_raw[[word_index[w] for w in vocab]]
    unit = runtime_unit_vectors(raw).astype(np.float64)
    print(f"[vocab] v3 guessable = ranked = {len(vocab):,} words (+{len(added):,})")

    # 3) Top-1,000 over the v3 vocabulary, secrets in v2 order.
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

    # 4) Hot pack = v3 words that were hot (frequent) in v2; cold = the rest.
    hot_idx = [i for i, w in enumerate(vocab) if w in hot_set]
    cold_idx = [i for i, w in enumerate(vocab) if w not in hot_set]
    write_hot_pack(out_dir / "hot-pack.bin", [vocab[i] for i in hot_idx], raw[hot_idx])
    shard_names = write_cold_pack(out_dir, [vocab[i] for i in cold_idx], raw[cold_idx])

    meta = {
        "version": f"semantle-{lang}-v3",
        "pack": "v3",
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
        raise SystemExit("Top-1k lists contain words outside the v3 vocabulary")
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
        "source": {"v2Version": meta_v2.get("version"), "v2TotalVocab": meta_v2["totalVocab"], "v2RankedVocab": meta_v2["rankedVocab"]},
        "files": {name: {"bytes": (out_dir / name).stat().st_size, "sha256": sha256_file(out_dir / name)} for name in files},
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    (out_dir / "added-words.txt").write_text("\n".join(sorted(added)), encoding="utf-8")
    print(f"[done] {lang} v3 pack in {time.time() - t0:.0f}s: median #1000 centi {int(np.median(last_centi))}")
    print(json.dumps({k: v for k, v in manifest.items() if k != "files"}, ensure_ascii=False))


def main() -> None:
    parser = argparse.ArgumentParser(description="Build semantle v3 packs (guessable vocabulary == ranked vocabulary)")
    parser.add_argument("--lang", choices=["ko", "en"], required=True)
    parser.add_argument("--v2-dir", type=Path, required=True, help="directory holding the deployed v2 pack files")
    parser.add_argument("--sources-dir", type=Path, required=True, help="cache directory for dictionary sources")
    parser.add_argument("--out-dir", type=Path, required=True)
    args = parser.parse_args()
    build(args.lang, args.v2_dir, args.sources_dir, args.out_dir)


if __name__ == "__main__":
    main()
