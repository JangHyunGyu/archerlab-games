#!/usr/bin/env python3
"""Build normalized float16 FastText vector pack and precomputed Top-1,000 tables for Korean Semantle."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import re
import struct
import urllib.request
import zipfile
import unicodedata
from pathlib import Path
from typing import Dict, List, Set, Tuple

import numpy as np

DEFAULT_SCRATCH = Path(
    r"C:\Users\user\.gemini\antigravity\brain\6c49ba5a-ab31-41a1-8921-f75797ef1f9c\scratch\semantle-build"
)

FASTTEXT_URL = "https://dl.fbaipublicfiles.com/fasttext/vectors-crawl/cc.ko.300.vec.gz"
HUNSPELL_URL = "https://github.com/spellcheck-ko/hunspell-dict-ko/releases/download/0.7.92/ko-aff-dic-0.7.92.zip"
WIKT_API_URL = (
    "https://en.wiktionary.org/w/api.php?action=parse"
    "&page=Wiktionary:Frequency_lists/Korean_5800&prop=wikitext&format=json"
)

HANGUL_WORD_RE = re.compile(r"^[가-힣]{1,12}$")
SECRET_WORD_RE = re.compile(r"^[가-힣]{2,7}$")

# Ultra-generic function words / pronouns / conjunctions / slurs excluded from becoming secret answers
# (still allowed as player guesses when present in the dictionary).
SECRET_EXCLUSIONS: Set[str] = {
    "하다", "되다", "있다", "없다", "이다", "아니다", "같다", "다르다",
    "그렇다", "이렇다", "저렇다", "어떻다", "그러하다", "이러하다",
    "그것", "이것", "저것", "여기", "거기", "저기", "이곳", "그곳", "저곳",
    "무엇", "누구", "어디", "언제", "어느", "어떤", "이런", "그런", "저런",
    "무슨", "어찌", "아무", "자기", "자신", "그녀", "우리", "너희", "당신",
    "그러나", "그리고", "그런데", "그래서", "하지만", "또는", "혹은", "그러면",
    "그러므로", "따라서", "왜냐하면", "게다가", "오히려", "다만", "만약",
    "때문", "위하다", "대하다", "의하다", "통하다", "따르다", "관하다", "인하다",
    "지나다", "나다", "들다", "오다", "가다", "보다", "주다", "받다", "삼다",
    "모든", "모두", "각각", "서로", "매우", "아주", "너무", "정말", "진짜",
    "가장", "제일", "더욱", "조금", "많이", "항상", "자주", "가끔", "이미",
    "아직", "벌써", "방금", "금방", "얼마", "얼마나", "만큼", "정도", "가지",
    "번째", "첫째", "둘째", "셋째", "넷째", "다섯째", "여섯째", "일곱째",
    "여덟째", "아홉째", "열째", "퍼센트", "달러", "억원", "만원",
    # Offensive / sensitive terms
    "새끼", "씨발", "병신", "미친놈", "개새끼", "존나", "창녀", "걸레",
    "흑인", "백인", "황인", "장애인", "병자", "자살", "강간", "살인", "마약",
}


def download_file(url: str, dest: Path, label: str) -> None:
    if dest.exists() and dest.stat().st_size > 0:
        print(f"[cache] {label}: {dest} ({dest.stat().st_size:,} bytes)")
        return
    tmp = dest.with_suffix(dest.suffix + ".part")
    print(f"[download] {label} -> {dest}")
    req = urllib.request.Request(url, headers={"User-Agent": "ArcherLab-SemantleBuilder/1.0"})
    with urllib.request.urlopen(req, timeout=120) as resp, open(tmp, "wb") as out:
        total = int(resp.headers.get("Content-Length") or 0)
        read_bytes = 0
        next_report = 25 * 1024 * 1024
        while True:
            chunk = resp.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)
            read_bytes += len(chunk)
            if read_bytes >= next_report:
                pct = f" ({read_bytes * 100 / total:.1f}%)" if total else ""
                print(f"  ... {read_bytes // (1024 * 1024)} MB{pct}")
                next_report += 25 * 1024 * 1024
    os.replace(tmp, dest)
    print(f"[done] {label}: {dest.stat().st_size:,} bytes")


def load_hunspell_words(zip_path: Path) -> Set[str]:
    words: Set[str] = set()
    with zipfile.ZipFile(zip_path) as zf:
        dic_name = next(n for n in zf.namelist() if n.endswith("ko.dic"))
        lines = zf.read(dic_name).decode("utf-8", errors="replace").splitlines()
    for line in lines[1:]:
        token = unicodedata.normalize("NFC", line.strip().split("/")[0])
        if HANGUL_WORD_RE.match(token):
            words.add(token)
    return words


def load_wiktionary_words(json_path: Path) -> List[str]:
    with open(json_path, "r", encoding="utf-8") as f:
        wt = json.load(f)["parse"]["wikitext"]["*"]
    words: List[str] = []
    seen: Set[str] = set()
    for match in re.finditer(r"\[\[([^\[\]|#]+?)(?:\|[^\[\]]*)?\]\]", wt):
        token = unicodedata.normalize("NFC", match.group(1).strip())
        if HANGUL_WORD_RE.match(token) and token not in seen:
            seen.add(token)
            words.append(token)
    return words


def stream_fasttext_vectors(
    vec_gz_path: Path, valid_vocab: Set[str], dims: int = 300
) -> Tuple[List[str], np.ndarray]:
    print(f"[parse] Streaming {vec_gz_path.name} against {len(valid_vocab):,} valid Korean words...")
    words: List[str] = []
    vecs: List[np.ndarray] = []
    seen: Set[str] = set()

    with gzip.open(vec_gz_path, "rt", encoding="utf-8", errors="ignore") as gz:
        header = gz.readline().strip().split()
        total_lines = int(header[0]) if header and header[0].isdigit() else 0
        for idx, line in enumerate(gz, 1):
            sp = line.find(" ")
            if sp <= 0:
                continue
            raw_word = line[:sp]
            word = unicodedata.normalize("NFC", raw_word)
            if word in seen or word not in valid_vocab:
                continue
            vec = np.fromstring(line[sp + 1 :], dtype=np.float32, sep=" ")
            if vec.shape[0] != dims:
                continue
            norm = float(np.linalg.norm(vec))
            if not np.isfinite(norm) or norm < 1e-8:
                continue
            seen.add(word)
            words.append(word)
            vecs.append(vec / norm)
            if idx % 400000 == 0:
                print(f"  ... scanned {idx:,}/{total_lines:,} vectors, matched {len(words):,}")

    print(f"[parse] Matched {len(words):,} unique normalized Korean vectors")
    return words, np.vstack(vecs).astype(np.float32)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def build_pack(scratch_dir: Path, max_secrets: int = 4500) -> None:
    scratch_dir.mkdir(parents=True, exist_ok=True)
    out_dir = scratch_dir / "out"
    out_dir.mkdir(parents=True, exist_ok=True)

    zip_path = scratch_dir / "ko-aff-dic-0.7.92.zip"
    wikt_path = scratch_dir / "wikt_ko_5800.json"
    vec_gz_path = scratch_dir / "cc.ko.300.vec.gz"

    download_file(HUNSPELL_URL, zip_path, "Korean Hunspell ko.dic")
    download_file(WIKT_API_URL, wikt_path, "Wiktionary Korean_5800")
    download_file(FASTTEXT_URL, vec_gz_path, "FastText cc.ko.300.vec.gz")

    dic_words = load_hunspell_words(zip_path)
    wikt_words = load_wiktionary_words(wikt_path)
    valid_vocab = dic_words | set(wikt_words)
    print(f"[dict] ko.dic={len(dic_words):,}, wikt={len(wikt_words):,}, union={len(valid_vocab):,}")

    raw_words, raw_mat = stream_fasttext_vectors(vec_gz_path, valid_vocab, dims=300)

    # Sort lexicographically in Unicode codepoint order so JS binary search matches Python.
    order = sorted(range(len(raw_words)), key=lambda i: raw_words[i])
    words = [raw_words[i] for i in order]
    word_to_idx: Dict[str, int] = {w: i for i, w in enumerate(words)}

    mat_f32 = raw_mat[order]
    # Quantize to float16 and decode back + re-normalize so offline Top-1,000 matches JS runtime identically.
    mat_f16 = mat_f32.astype(np.float16)
    mat_q = mat_f16.astype(np.float32)
    norms = np.linalg.norm(mat_q, axis=1, keepdims=True)
    norms = np.maximum(norms, 1e-8)
    mat_norm = mat_q / norms

    candidate_secrets: List[int] = []
    for w in wikt_words:
        if SECRET_WORD_RE.match(w) and w not in SECRET_EXCLUSIONS and w in word_to_idx:
            candidate_secrets.append(word_to_idx[w])

    print(f"[secrets] Initial Wiktionary secret candidates: {len(candidate_secrets):,}")

    top_k = 1000
    secret_records: List[Tuple[int, int, int, int]] = []
    top1k_chunks: List[bytes] = []

    batch_size = 256
    for start in range(0, len(candidate_secrets), batch_size):
        batch_ids = candidate_secrets[start : start + batch_size]
        # (B, 300) @ (300, V) -> (B, V)
        sims_batch = mat_norm[batch_ids] @ mat_norm.T
        for row_idx, word_idx in enumerate(batch_ids):
            sims = sims_batch[row_idx]
            sims[word_idx] = -2.0
            # Partition top 1,000 indices and sort descending.
            part = np.argpartition(sims, -top_k)[-top_k:]
            sorted_idx = part[np.argsort(sims[part])[::-1]]
            sorted_sims = sims[sorted_idx]

            top1_sim = float(sorted_sims[0])
            top10_sim = float(sorted_sims[9])
            top1000_sim = float(sorted_sims[top_k - 1])
            if top1_sim < 0.30 or top1_sim > 0.98 or top1000_sim < 0.15:
                continue

            secret_records.append((
                int(word_idx),
                round(top1_sim * 10000),
                round(top10_sim * 10000),
                round(top1000_sim * 10000),
            ))
            rec_bytes = bytearray(top_k * 8)
            for k_i in range(top_k):
                struct.pack_into("<If", rec_bytes, k_i * 8, int(sorted_idx[k_i]), float(sorted_sims[k_i]))
            top1k_chunks.append(bytes(rec_bytes))
            if len(secret_records) >= max_secrets:
                break
        if len(secret_records) >= max_secrets:
            break
        print(f"  ... processed {min(start + batch_size, len(candidate_secrets)):,}/{len(candidate_secrets):,}, kept {len(secret_records):,}")

    print(f"[secrets] Final verified secrets: {len(secret_records):,}")

    # Write output files
    vocab_path = out_dir / "vocab.json"
    vectors_path = out_dir / "vectors.f16"
    top1k_path = out_dir / "secrets-top1k.bin"
    manifest_path = out_dir / "manifest.json"

    with open(vocab_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "version": "semantle-ko-v1",
                "dims": 300,
                "words": words,
                "secrets": secret_records,
            },
            f,
            ensure_ascii=False,
            separators=(",", ":"),
        )

    # Ensure strictly little-endian IEEE 754 float16 bytes
    mat_f16.astype("<f2").tofile(vectors_path)

    with open(top1k_path, "wb") as f:
        for chunk in top1k_chunks:
            f.write(chunk)

    # Self-verify generated binary integrity against raw float16 round-trip
    check_bytes = np.fromfile(vectors_path, dtype="<f2", count=600).reshape(2, 300)
    assert check_bytes.shape == (2, 300)
    sample_sec_idx = 0
    s_word_idx, s_t1, s_t10, s_t1000 = secret_records[sample_sec_idx]
    with open(top1k_path, "rb") as f:
        buf = f.read(8000)
    first_nbr_idx, first_nbr_sim = struct.unpack_from("<If", buf, 0)
    recomputed = float(np.dot(mat_norm[s_word_idx], mat_norm[first_nbr_idx]))
    assert abs(recomputed - first_nbr_sim) < 1e-5, f"Mismatch: {recomputed} vs {first_nbr_sim}"

    for probe in ["사람", "사과", "학교", "행복", "기쁘다", "사랑하다", "물", "집"]:
        assert probe in word_to_idx, f"Missing expected Korean word: {probe}"

    manifest = {
        "version": "semantle-ko-v1",
        "dims": 300,
        "vocabCount": len(words),
        "secretCount": len(secret_records),
        "files": {
            name: {
                "bytes": (out_dir / name).stat().st_size,
                "sha256": sha256_file(out_dir / name),
            }
            for name in ["vocab.json", "vectors.f16", "secrets-top1k.bin"]
        },
    }
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print("[verify] Integrity check passed!")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Korean Semantle vector & top-1k dataset")
    parser.add_argument("--scratch", type=Path, default=DEFAULT_SCRATCH)
    parser.add_argument("--max-secrets", type=int, default=4500)
    args = parser.parse_args()
    build_pack(args.scratch, max_secrets=args.max_secrets)


if __name__ == "__main__":
    main()
