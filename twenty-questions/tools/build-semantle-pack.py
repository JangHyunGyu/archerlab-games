#!/usr/bin/env python3
"""Build semantle-ko/v2: full 1.50M Hangul vocabulary, expanded headword Top-1k, and hot/cold quantized vector packs."""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import io
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
NEWSJELLY_SECRETS_URL = "https://raw.githubusercontent.com/NewsJelly/semantle-ko/master/data/secrets.txt"
NEWSJELLY_FREQ_URL = "https://raw.githubusercontent.com/NewsJelly/semantle-ko/master/data/frequent_words.txt"
MECAB_BASE_URL = "https://raw.githubusercontent.com/lindera/mecab-ko-dic/main/"
MECAB_CSVS = [
    "NNG.csv",
    "Foreign.csv",
    "CoinedWord.csv",
    "VV.csv",
    "VA.csv",
    "MAG.csv",
    "XR.csv",
    "IC.csv",
    "Wikipedia.csv",
    "Group.csv",
]

HANGUL_WORD_RE = re.compile(r"^[가-힣]{1,15}$")
SECRET_WORD_RE = re.compile(r"^[가-힣]{2,7}$")

SLUR_EXCLUSIONS: Set[str] = {
    "새끼", "씨발", "병신", "미친놈", "개새끼", "존나", "창녀", "걸레",
}

SECRET_EXCLUSIONS: Set[str] = SLUR_EXCLUSIONS | {
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
    "흑인", "백인", "황인", "장애인", "병자", "자살", "강간", "살인", "마약",
}

DIMS = 300
HOT_COUNT = 120000
COLD_BLOCK_WORDS = 64
SECRET_STRIDE = 24576
TOP_K = 1000


def download_file(url: str, dest: Path, label: str) -> None:
    if dest.exists() and dest.stat().st_size > 0:
        print(f"[cache] {label}: {dest} ({dest.stat().st_size:,} bytes)")
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    print(f"[download] {label} -> {dest}")
    req = urllib.request.Request(url, headers={"User-Agent": "ArcherLab-SemantleBuilder/2.0"})
    with urllib.request.urlopen(req, timeout=120) as resp, open(tmp, "wb") as out:
        while True:
            chunk = resp.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)
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


def load_word_list(txt_path: Path) -> List[str]:
    words: List[str] = []
    seen: Set[str] = set()
    with open(txt_path, "r", encoding="utf-8") as f:
        for line in f:
            s = line.strip()
            if not s or s.startswith("#"):
                continue
            token = unicodedata.normalize("NFC", s)
            if HANGUL_WORD_RE.match(token) and token not in seen:
                seen.add(token)
                words.append(token)
    return words


def load_mecab_headwords(mecab_dir: Path) -> Set[str]:
    words: Set[str] = set()
    noun_like = {"NNG.csv", "Foreign.csv", "CoinedWord.csv", "MAG.csv", "IC.csv", "Wikipedia.csv", "Group.csv"}
    for name in MECAB_CSVS:
        path = mecab_dir / name
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            reader = csv.reader(f)
            for row in reader:
                if not row:
                    continue
                surface = unicodedata.normalize("NFC", row[0].strip())
                if not surface or not re.match(r"^[가-힣]+$", surface):
                    continue
                if name in noun_like:
                    if HANGUL_WORD_RE.match(surface):
                        words.add(surface)
                    for suffix in ("하다", "되다"):
                        cand = surface + suffix
                        if HANGUL_WORD_RE.match(cand):
                            words.add(cand)
                elif name in ("VV.csv", "VA.csv"):
                    cand = surface + "다"
                    if HANGUL_WORD_RE.match(cand):
                        words.add(cand)
                elif name == "XR.csv":
                    for suffix in ("하다", "스럽다", "롭다"):
                        cand = surface + suffix
                        if HANGUL_WORD_RE.match(cand):
                            words.add(cand)
    return words


def decode_quantized_norm(scale_f16: np.float16, q_i8: np.ndarray) -> np.ndarray:
    vec = q_i8.astype(np.float32) * float(scale_f16)
    norm = float(np.linalg.norm(vec))
    if not np.isfinite(norm) or norm < 1e-8:
        return np.zeros(DIMS, dtype=np.float32)
    return vec / norm


def stream_all_fasttext_quantized(
    vec_gz_path: Path, dims: int = DIMS
) -> Tuple[List[str], np.ndarray, np.ndarray]:
    """Stream all unique NFC pure Hangul words (1..15 syllables) and quantize to f16-scale + int8[300]."""
    print(f"[parse] Streaming ALL pure Hangul words from {vec_gz_path.name}...")
    words: List[str] = []
    seen: Set[str] = set()

    cap = 1550000
    scales = np.empty(cap, dtype="<f2")
    quants = np.empty((cap, dims), dtype=np.int8)
    count = 0

    with gzip.open(vec_gz_path, "rt", encoding="utf-8", errors="ignore") as gz:
        header = gz.readline().strip().split()
        total_lines = int(header[0]) if header and header[0].isdigit() else 0
        for idx, line in enumerate(gz, 1):
            sp = line.find(" ")
            if sp <= 0:
                continue
            word = unicodedata.normalize("NFC", line[:sp])
            if word in seen or not HANGUL_WORD_RE.match(word):
                continue
            vec = np.fromstring(line[sp + 1 :], dtype=np.float32, sep=" ")
            if vec.shape[0] != dims:
                continue
            norm = float(np.linalg.norm(vec))
            if not np.isfinite(norm) or norm < 1e-8:
                continue
            unit = vec / norm
            max_abs = float(np.max(np.abs(unit)))
            scale_f16 = np.float16(max(max_abs / 127.0, 1e-6))
            scale_f32 = float(scale_f16)
            q = np.clip(np.rint(unit / scale_f32), -127, 127).astype(np.int8)

            if count >= cap:
                new_cap = int(cap * 1.2)
                scales_new = np.empty(new_cap, dtype="<f2")
                scales_new[:count] = scales[:count]
                scales = scales_new
                quants_new = np.empty((new_cap, dims), dtype=np.int8)
                quants_new[:count] = quants[:count]
                quants = quants_new
                cap = new_cap

            seen.add(word)
            words.append(word)
            scales[count] = scale_f16
            quants[count] = q
            count += 1
            if idx % 400000 == 0:
                print(f"  ... scanned {idx:,}/{total_lines:,}, kept {count:,} Hangul words")

    print(f"[parse] Kept {count:,} unique normalized Hangul words")
    return words, scales[:count], quants[:count]


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def build_pack(scratch_dir: Path, max_secrets: int = 5000) -> None:
    scratch_dir.mkdir(parents=True, exist_ok=True)
    out_dir = scratch_dir / "out-v2"
    out_dir.mkdir(parents=True, exist_ok=True)

    zip_path = scratch_dir / "ko-aff-dic-0.7.92.zip"
    wikt_path = scratch_dir / "wikt_ko_5800.json"
    vec_gz_path = scratch_dir / "cc.ko.300.vec.gz"
    nj_secrets_path = scratch_dir / "semantle_secrets.txt"
    nj_freq_path = scratch_dir / "semantle_frequent.txt"
    mecab_dir = scratch_dir / "mecab"

    download_file(HUNSPELL_URL, zip_path, "Korean Hunspell ko.dic")
    download_file(WIKT_API_URL, wikt_path, "Wiktionary Korean_5800")
    download_file(FASTTEXT_URL, vec_gz_path, "FastText cc.ko.300.vec.gz")
    download_file(NEWSJELLY_SECRETS_URL, nj_secrets_path, "NewsJelly secrets.txt")
    download_file(NEWSJELLY_FREQ_URL, nj_freq_path, "NewsJelly frequent_words.txt")
    for csv_name in MECAB_CSVS:
        download_file(MECAB_BASE_URL + csv_name, mecab_dir / csv_name, f"mecab {csv_name}")

    dic_words = load_hunspell_words(zip_path)
    wikt_words = load_wiktionary_words(wikt_path)
    nj_secrets = load_word_list(nj_secrets_path)
    nj_freq = load_word_list(nj_freq_path)
    mecab_words = load_mecab_headwords(mecab_dir)

    ranked_vocab = (dic_words | mecab_words | set(wikt_words) | set(nj_freq) | set(nj_secrets)) - SLUR_EXCLUSIONS
    print(
        f"[dict] hunspell={len(dic_words):,}, mecab={len(mecab_words):,}, "
        f"wikt={len(wikt_words):,}, nj_freq={len(nj_freq):,}, ranked_vocab={len(ranked_vocab):,}"
    )

    all_words, all_scales, all_quants = stream_all_fasttext_quantized(vec_gz_path, dims=DIMS)
    word_to_all_idx: Dict[str, int] = {w: i for i, w in enumerate(all_words)}

    # Build clean candidate secret list from NewsJelly secrets + Wiktionary ordered list
    candidate_words: List[str] = []
    seen_cand: Set[str] = set()
    for w in [*nj_secrets, *wikt_words]:
        if w in seen_cand:
            continue
        if SECRET_WORD_RE.match(w) and w not in SECRET_EXCLUSIONS and w in word_to_all_idx:
            seen_cand.add(w)
            candidate_words.append(w)
            ranked_vocab.add(w)

    print(f"[secrets] Candidate secret words: {len(candidate_words):,}")

    # Build normalized matrix ONLY for ranked_vocab subset to compute clean Top-1,000 neighbors fast
    ranked_all_indices = [i for i, w in enumerate(all_words) if w in ranked_vocab]
    ranked_words = [all_words[i] for i in ranked_all_indices]
    ranked_word_to_pos = {w: pos for pos, w in enumerate(ranked_words)}

    print(f"[rank] Decoding {len(ranked_words):,} ranked-headword vectors...")
    r_scales = all_scales[ranked_all_indices].astype(np.float32)[:, None]
    r_mat = all_quants[ranked_all_indices].astype(np.float32) * r_scales
    r_norms = np.maximum(np.linalg.norm(r_mat, axis=1, keepdims=True), 1e-8)
    r_mat /= r_norms
    r_mat_t = r_mat.T

    cand_positions = [ranked_word_to_pos[w] for w in candidate_words]

    secret_meta_list: List[Tuple[str, int, int, int]] = []
    top1k_records_bytes: List[bytes] = []
    kept_secret_words: Set[str] = set()

    batch_size = 128
    for start in range(0, len(cand_positions), batch_size):
        batch_pos = cand_positions[start : start + batch_size]
        sims_batch = r_mat[batch_pos] @ r_mat_t
        for row_idx, r_pos in enumerate(batch_pos):
            sims = sims_batch[row_idx]
            sims[r_pos] = -2.0
            part = np.argpartition(sims, -TOP_K)[-TOP_K:]
            sorted_r_pos = part[np.argsort(sims[part])[::-1]]
            sorted_sims = sims[sorted_r_pos]

            top1_sim = float(sorted_sims[0])
            top10_sim = float(sorted_sims[9])
            top1000_sim = float(sorted_sims[TOP_K - 1])
            if top1_sim < 0.30 or top1_sim > 0.98 or top1000_sim < 0.15:
                continue

            sec_word = ranked_words[r_pos]
            all_i = word_to_all_idx[sec_word]

            buf = bytearray(SECRET_STRIDE)
            buf[0:2] = all_scales[all_i].tobytes()
            buf[2 : 2 + DIMS] = all_quants[all_i].tobytes()
            offset = 2 + DIMS
            struct.pack_into("<H", buf, offset, TOP_K)
            offset += 2
            for k_i in range(TOP_K):
                nbr_word = ranked_words[int(sorted_r_pos[k_i])]
                wb = nbr_word.encode("utf-8")
                sim_centi = max(-10000, min(10000, round(float(sorted_sims[k_i]) * 10000)))
                assert len(wb) <= 255
                assert offset + 1 + len(wb) + 2 <= SECRET_STRIDE, f"Secret record exceeded {SECRET_STRIDE}B on {sec_word}"
                buf[offset] = len(wb)
                offset += 1
                buf[offset : offset + len(wb)] = wb
                offset += len(wb)
                struct.pack_into("<h", buf, offset, sim_centi)
                offset += 2

            secret_meta_list.append((
                sec_word,
                round(top1_sim * 10000),
                round(top10_sim * 10000),
                round(top1000_sim * 10000),
            ))
            top1k_records_bytes.append(bytes(buf))
            kept_secret_words.add(sec_word)
            if len(secret_meta_list) >= max_secrets:
                break
        if len(secret_meta_list) >= max_secrets:
            break
        if (start // batch_size) % 4 == 3 or start + batch_size >= len(cand_positions):
            print(f"  ... processed {min(start + batch_size, len(cand_positions)):,}/{len(cand_positions):,}, kept {len(secret_meta_list):,}")

    # Free ranking matrices before packing shards
    del r_mat, r_mat_t, r_scales, r_norms
    print(f"[secrets] Final verified secrets: {len(secret_meta_list):,}")

    # Partition into HOT (first HOT_COUNT in frequency order + any rare secret) and COLD (remaining)
    hot_idx_set: Set[int] = set(range(min(HOT_COUNT, len(all_words))))
    for sw in kept_secret_words:
        hot_idx_set.add(word_to_all_idx[sw])

    hot_indices = sorted(hot_idx_set, key=lambda i: all_words[i].encode("utf-8"))
    cold_indices = sorted((i for i in range(len(all_words)) if i not in hot_idx_set), key=lambda i: all_words[i].encode("utf-8"))
    print(f"[pack] Hot={len(hot_indices):,}, Cold={len(cold_indices):,}, Total={len(hot_indices) + len(cold_indices):,}")

    # Write secrets-top1k.bin
    top1k_path = out_dir / "secrets-top1k.bin"
    with open(top1k_path, "wb") as f:
        for chunk in top1k_records_bytes:
            f.write(chunk)

    # Write hot-pack.bin: SMH2 header + offsets[N+1] + alignedWords + vecs(302B*N)
    hot_path = out_dir / "hot-pack.bin"
    h_count = len(hot_indices)
    word_bytes_list = [all_words[i].encode("utf-8") for i in hot_indices]
    words_blob_raw_len = sum(len(b) for b in word_bytes_list)
    aligned_words_len = (words_blob_raw_len + 3) & ~3

    hot_offsets = np.empty(h_count + 1, dtype="<u4")
    pos = 0
    for k, wb in enumerate(word_bytes_list):
        hot_offsets[k] = pos
        pos += len(wb)
    hot_offsets[h_count] = pos

    hot_vec_block = bytearray(h_count * 302)
    for k, orig_i in enumerate(hot_indices):
        off = k * 302
        hot_vec_block[off : off + 2] = all_scales[orig_i].tobytes()
        hot_vec_block[off + 2 : off + 302] = all_quants[orig_i].tobytes()

    with open(hot_path, "wb") as f:
        f.write(b"SMH2")
        f.write(struct.pack("<III", h_count, aligned_words_len, 0))
        f.write(hot_offsets.tobytes())
        for wb in word_bytes_list:
            f.write(wb)
        pad = aligned_words_len - words_blob_raw_len
        if pad:
            f.write(b"\x00" * pad)
        f.write(hot_vec_block)
    del word_bytes_list, hot_offsets, hot_vec_block

    # Write cold shards (2 shards <= 240 MB each) + cold-index.bin
    blocks: List[Tuple[bytes, bytes]] = []
    for b_start in range(0, len(cold_indices), COLD_BLOCK_WORDS):
        b_slice = cold_indices[b_start : b_start + COLD_BLOCK_WORDS]
        first_word_b = all_words[b_slice[0]].encode("utf-8")
        parts = bytearray()
        for orig_i in b_slice:
            wb = all_words[orig_i].encode("utf-8")
            assert len(wb) <= 255
            parts.append(len(wb))
            parts.extend(wb)
            parts.extend(all_scales[orig_i].tobytes())
            parts.extend(all_quants[orig_i].tobytes())
        blocks.append((first_word_b, bytes(parts), len(b_slice)))

    mid_block = len(blocks) // 2
    shard_paths = [out_dir / "cold-0.bin", out_dir / "cold-1.bin"]
    first_words_blob = bytearray()
    index_entries = bytearray()

    for shard_id, block_range in enumerate([range(0, mid_block), range(mid_block, len(blocks))]):
        offset = 0
        with open(shard_paths[shard_id], "wb") as sf:
            for bi in block_range:
                first_b, b_bytes, b_cnt = blocks[bi]
                sf.write(b_bytes)
                first_words_blob.extend(first_b)
                assert len(b_bytes) <= 65535
                index_entries.extend(struct.pack("<IIHBB", len(first_words_blob), offset, len(b_bytes), shard_id, b_cnt))
                offset += len(b_bytes)
        assert offset < 260 * 1024 * 1024, f"cold-{shard_id}.bin too large: {offset}"

    cold_index_path = out_dir / "cold-index.bin"
    with open(cold_index_path, "wb") as f:
        f.write(b"SMC2")
        f.write(struct.pack("<II", len(blocks), len(first_words_blob)))
        f.write(index_entries)
        f.write(first_words_blob)

    # Write secrets-meta.json
    meta_path = out_dir / "secrets-meta.json"
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "version": "semantle-ko-v2",
                "dims": DIMS,
                "totalVocab": len(all_words),
                "rankedVocab": len(ranked_words),
                "hotCount": h_count,
                "coldCount": len(cold_indices),
                "secretStride": SECRET_STRIDE,
                "secrets": secret_meta_list,
            },
            f,
            ensure_ascii=False,
            separators=(",", ":"),
        )

    # Self-verify lookups & math
    hot_buf = hot_path.read_bytes()
    cold_idx_buf = cold_index_path.read_bytes()
    shard_bufs = [p.read_bytes() for p in shard_paths]

    def test_lookup(word: str) -> Tuple[str, np.ndarray | None]:
        wb = word.encode("utf-8")
        # 1) hot binary search
        lo, hi = 0, h_count - 1
        words_base = 16 + (h_count + 1) * 4
        vecs_base = words_base + aligned_words_len
        while lo <= hi:
            mid = (lo + hi) >> 1
            s_off, e_off = struct.unpack_from("<II", hot_buf, 16 + mid * 4)
            cur = hot_buf[words_base + s_off : words_base + e_off]
            if cur == wb:
                v_off = vecs_base + mid * 302
                sc = np.frombuffer(hot_buf[v_off : v_off + 2], dtype="<f2")[0]
                qi = np.frombuffer(hot_buf[v_off + 2 : v_off + 302], dtype=np.int8)
                return "hot", decode_quantized_norm(sc, qi)
            if cur < wb:
                lo = mid + 1
            else:
                hi = mid - 1
        # 2) cold index binary search
        b_cnt_total = len(blocks)
        fw_base = 12 + b_cnt_total * 12
        lo, hi, cand = 0, b_cnt_total - 1, -1
        while lo <= hi:
            mid = (lo + hi) >> 1
            prev_end = struct.unpack_from("<I", cold_idx_buf, 12 + (mid - 1) * 12)[0] if mid > 0 else 0
            cur_end = struct.unpack_from("<I", cold_idx_buf, 12 + mid * 12)[0]
            fw = cold_idx_buf[fw_base + prev_end : fw_base + cur_end]
            if fw <= wb:
                cand = mid
                lo = mid + 1
            else:
                hi = mid - 1
        if cand < 0:
            return "miss", None
        _, b_off, b_len, sh_id, w_cnt = struct.unpack_from("<IIHBB", cold_idx_buf, 12 + cand * 12)
        blk = shard_bufs[sh_id][b_off : b_off + b_len]
        p = 0
        for _ in range(w_cnt):
            wl = blk[p]
            p += 1
            cur = blk[p : p + wl]
            p += wl
            if cur == wb:
                sc = np.frombuffer(blk[p : p + 2], dtype="<f2")[0]
                qi = np.frombuffer(blk[p + 2 : p + 302], dtype=np.int8)
                return f"cold-{sh_id}", decode_quantized_norm(sc, qi)
            p += 302
        return "miss", None

    probes = [
        "드라이기", "헤어드라이어", "아메리카노", "에어프라이어", "민트초코",
        "떡볶이", "삼겹살", "유튜브", "퇴근길", "사람", "학교", "행복",
    ]
    for probe in probes:
        tier, vec = test_lookup(probe)
        assert vec is not None, f"Missing expected Korean probe word: {probe}"
        print(f"  [probe] {probe} -> {tier} (norm={np.linalg.norm(vec):.5f})")

    out_files = [
        "secrets-meta.json",
        "secrets-top1k.bin",
        "hot-pack.bin",
        "cold-index.bin",
        "cold-0.bin",
        "cold-1.bin",
    ]
    manifest = {
        "version": "semantle-ko-v2",
        "dims": DIMS,
        "totalVocab": len(all_words),
        "rankedVocab": len(ranked_words),
        "hotCount": h_count,
        "coldCount": len(cold_indices),
        "secretCount": len(secret_meta_list),
        "files": {
            name: {
                "bytes": (out_dir / name).stat().st_size,
                "sha256": sha256_file(out_dir / name),
            }
            for name in out_files
        },
    }
    manifest_path = out_dir / "manifest.json"
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print("[verify] Semantle v2 pack integrity passed!")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Korean Semantle v2 max-vocab pack")
    parser.add_argument("--scratch", type=Path, default=DEFAULT_SCRATCH)
    parser.add_argument("--max-secrets", type=int, default=5000)
    args = parser.parse_args()
    build_pack(args.scratch, max_secrets=args.max_secrets)


if __name__ == "__main__":
    main()
