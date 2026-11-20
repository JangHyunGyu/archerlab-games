#!/usr/bin/env python3
"""Build semantle-en/v2: lowercase English FastText vocabulary, Top-1k neighbors, and hot/cold quantized packs."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import re
import struct
import urllib.request
from pathlib import Path
from typing import Dict, List, Set, Tuple

import numpy as np

DEFAULT_SCRATCH = Path(
    r"C:\Users\user\.gemini\antigravity\brain\8794a22b-c998-439a-8a5e-4fd209af8e96\scratch\semantle-en-build"
)

FASTTEXT_EN_URL = "https://dl.fbaipublicfiles.com/fasttext/vectors-crawl/cc.en.300.vec.gz"
GOOGLE_10K_URL = "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa-no-swears.txt"
HUNSPELL_EN_URL = "https://raw.githubusercontent.com/wooorm/dictionaries/main/dictionaries/en/index.dic"
DWYL_WORDS_URL = "https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt"

EN_WORD_RE = re.compile(r"^[a-z]{1,24}$")
EN_SECRET_RE = re.compile(r"^[a-z]{3,12}$")

EN_SLUR_EXCLUSIONS: Set[str] = {
    "fuck", "fucking", "fucked", "fucker", "shit", "shitty", "bitch", "bitches",
    "asshole", "bastard", "cunt", "dick", "cock", "pussy", "whore", "slut",
    "nigger", "nigga", "faggot", "fag", "retard", "retarded", "spic", "chink",
    "kike", "wetback", "tranny", "dyke", "motherfucker", "bullshit", "jackass",
    "dumbass", "dipshit", "crap", "piss", "twat", "wanker", "prick", "douche",
    "douchebag", "arse", "arsehole", "bollocks", "bugger", "skank",
}

EN_SECRET_EXCLUSIONS: Set[str] = EN_SLUR_EXCLUSIONS | {
    # Articles, pronouns, prepositions, conjunctions, determiners, auxiliaries
    "the", "and", "for", "are", "but", "not", "you", "all", "any", "can", "had",
    "her", "was", "one", "our", "out", "has", "his", "how", "its", "may", "did",
    "get", "let", "put", "say", "she", "too", "use", "that", "with", "have",
    "this", "will", "your", "from", "they", "been", "much", "some", "them",
    "than", "then", "only", "also", "such", "here", "must", "into", "more",
    "very", "when", "what", "which", "their", "said", "each", "about", "would",
    "there", "could", "other", "these", "being", "those", "where", "while",
    "should", "through", "before", "after", "between", "under", "above", "below",
    "until", "since", "during", "without", "within", "against", "toward",
    "towards", "upon", "onto", "whom", "whose", "neither", "either", "whether",
    "though", "although", "unless", "whereas", "meanwhile", "moreover",
    "furthermore", "however", "therefore", "nevertheless", "nonetheless",
    "instead", "otherwise", "beside", "besides", "across", "along", "among",
    "around", "behind", "beyond", "despite", "except", "inside", "outside",
    "regarding", "throughout", "underneath", "unlike", "unto", "via", "versus",
    "amid", "amongst", "beneath", "concerning", "considering", "following",
    "including", "minus", "plus", "per", "wherein", "whereby", "myself",
    "yourself", "himself", "herself", "itself", "ourselves", "yourselves",
    "themselves", "someone", "somebody", "something", "somewhere", "anyone",
    "anybody", "anything", "anywhere", "everyone", "everybody", "everything",
    "everywhere", "nobody", "nothing", "nowhere", "whatsoever", "whoever",
    "whatever", "whichever", "whenever", "wherever", "mine", "yours", "hers",
    "ours", "theirs", "shall", "might", "ought", "doing", "done", "were",
    "having", "him", "who", "why", "way", "two", "now", "see", "new", "old",
    "how", "cant", "wont", "dont", "didnt", "isnt", "arent", "wasnt", "werent",
    "hasnt", "havent", "hadnt", "wouldnt", "couldnt", "shouldnt", "mustnt",
    "thats", "theres", "heres", "whats", "whos", "wheres", "whens", "hows",
    "youre", "theyre", "ive", "youve", "weve", "theyve", "youd", "hed", "shed",
    "wed", "theyd", "youll", "hell", "shell", "theyll", "aint", "gonna", "wanna",
    "gotta", "kinda", "sorta", "yeah", "yes", "nope", "okay", "etc",
    # Web, file formats, technical abbreviations
    "http", "https", "www", "html", "htm", "php", "asp", "jsp", "css", "xml",
    "json", "yaml", "yml", "pdf", "jpg", "jpeg", "png", "gif", "svg", "webp",
    "mp3", "mp4", "avi", "mov", "wav", "zip", "rar", "tar", "exe", "dmg",
    "iso", "com", "org", "net", "edu", "gov", "mil", "info", "biz", "api",
    "url", "uri", "sql", "usb", "cpu", "gpu", "ram", "rom", "ssd", "hdd",
    "faq", "ceo", "cfo", "cto", "llc", "inc", "ltd", "corp", "aka", "fyi",
    "lol", "omg", "wtf", "btw", "imo", "tbh", "smh", "nsfw", "wifi", "app",
    "apps", "ios", "mac", "unix", "linux", "gnu", "ascii", "utf", "ftp",
    "ssh", "ssl", "tls", "dns", "tcp", "udp", "vpn", "lan", "wan", "sdk",
    "ide", "cli", "gui", "blog", "blogs", "wiki", "login", "logout", "signup",
    # Timezones, calendar names, Roman numerals
    "utc", "gmt", "pst", "est", "cst", "mst", "kst", "jst", "cet", "edt", "pdt",
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    "mon", "tue", "wed", "thu", "fri", "sat", "sun", "january", "february",
    "march", "april", "june", "july", "august", "september", "october",
    "november", "december", "jan", "feb", "mar", "apr", "jun", "jul", "aug",
    "sep", "sept", "oct", "nov", "dec", "iii", "vii", "viii", "xii",
    # Sensitive / unsuitable secret words
    "suicide", "rape", "murder", "nazi", "porn", "porno", "pornography",
    "cocaine", "heroin", "meth", "methamphetamine", "genocide", "holocaust",
    "terrorist", "terrorism", "pedophile", "incest", "molest", "molestation",
    "abortion", "slaughter", "torture", "prostitute", "prostitution", "brothel",
    "fetish", "orgasm", "ejaculation", "masturbate", "masturbation", "erotic",
    "hentai", "nudity", "nude", "naked", "genital", "genitals", "testicle",
    "vaginal", "anal", "sodomy", "overdose", "corpse", "lynch", "lynching",
    "slavery", "slave", "penis", "vagina", "boobs", "tits", "sexy", "sex",
}

STARTER_WORDS = ["person", "food", "school", "nature", "happy"]

DIMS = 300
HOT_COUNT = 60000
COLD_BLOCK_WORDS = 64
MAX_SHARD_BYTES = 220 * 1024 * 1024
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
    with urllib.request.urlopen(req, timeout=180) as resp, open(tmp, "wb") as out:
        while True:
            chunk = resp.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)
    os.replace(tmp, dest)
    print(f"[done] {label}: {dest.stat().st_size:,} bytes")


def load_word_list(txt_path: Path) -> List[str]:
    words: List[str] = []
    seen: Set[str] = set()
    with open(txt_path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            s = line.strip().lower()
            if not s or s.startswith("#"):
                continue
            if EN_WORD_RE.match(s) and s not in seen:
                seen.add(s)
                words.append(s)
    return words


def load_hunspell_en(dic_path: Path) -> Tuple[Set[str], Set[str]]:
    """Return (lower_lemmas ^[a-z]{3,12}$, all_lower_words ^[a-z]{1,24}$)."""
    lower_lemmas: Set[str] = set()
    all_lower: Set[str] = set()
    with open(dic_path, "r", encoding="utf-8", errors="replace") as f:
        lines = f.read().splitlines()
    for idx, line in enumerate(lines):
        if idx == 0 and line.strip().isdigit():
            continue
        raw_head = line.strip().split("/")[0].split("\t")[0].split(" ")[0]
        if EN_SECRET_RE.match(raw_head):
            lower_lemmas.add(raw_head)
        if EN_WORD_RE.match(raw_head):
            all_lower.add(raw_head)
    return lower_lemmas, all_lower


def is_regular_plural(word: str, lemmas: Set[str]) -> bool:
    if word.endswith("s") and not word.endswith(("ss", "us", "is", "ous", "ics")):
        if word[:-1] in lemmas:
            return True
    if word.endswith(("shes", "ches", "xes", "zes", "sses")) and word[:-2] in lemmas:
        return True
    if word.endswith("ies") and len(word) > 4 and (word[:-3] + "y") in lemmas:
        return True
    return False


def decode_quantized_norm(scale_f16: np.float16, q_i8: np.ndarray) -> np.ndarray:
    vec = q_i8.astype(np.float32) * float(scale_f16)
    norm = float(np.linalg.norm(vec))
    if not np.isfinite(norm) or norm < 1e-8:
        return np.zeros(DIMS, dtype=np.float32)
    return vec / norm


def stream_english_fasttext_quantized(
    vec_gz_path: Path, dims: int = DIMS
) -> Tuple[List[str], np.ndarray, np.ndarray]:
    """Stream strictly lowercase ASCII alphabetic tokens (1..24 chars) and quantize to f16-scale + int8[300]."""
    print(f"[parse] Streaming lowercase ASCII words from {vec_gz_path.name}...")
    words: List[str] = []
    seen: Set[str] = set()

    cap = 650000
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
            word = line[:sp]
            if word in seen or not EN_WORD_RE.match(word):
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
                new_cap = int(cap * 1.25)
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
                print(f"  ... scanned {idx:,}/{total_lines:,}, kept {count:,} lowercase English words")

    print(f"[parse] Kept {count:,} unique lowercase English words")
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
    out_dir = scratch_dir / "out-en-v2"
    out_dir.mkdir(parents=True, exist_ok=True)

    vec_gz_path = scratch_dir / "cc.en.300.vec.gz"
    g10k_path = scratch_dir / "google-10000-english-usa-no-swears.txt"
    dic_path = scratch_dir / "en_index.dic"
    dwyl_path = scratch_dir / "words_alpha.txt"

    download_file(FASTTEXT_EN_URL, vec_gz_path, "FastText cc.en.300.vec.gz")
    download_file(GOOGLE_10K_URL, g10k_path, "Google 10k English (no swears)")
    download_file(HUNSPELL_EN_URL, dic_path, "Hunspell English index.dic")
    download_file(DWYL_WORDS_URL, dwyl_path, "DWYL words_alpha.txt")

    google_10k = load_word_list(g10k_path)
    hunspell_lower_lemmas, hunspell_all_lower = load_hunspell_en(dic_path)
    dwyl_words = set(load_word_list(dwyl_path))

    ranked_vocab = (dwyl_words | hunspell_all_lower | set(google_10k)) - EN_SLUR_EXCLUSIONS
    print(
        f"[dict] google10k={len(google_10k):,}, hunspell_lemmas={len(hunspell_lower_lemmas):,}, "
        f"hunspell_lower={len(hunspell_all_lower):,}, dwyl={len(dwyl_words):,}, ranked_vocab={len(ranked_vocab):,}"
    )

    all_words, all_scales, all_quants = stream_english_fasttext_quantized(vec_gz_path, dims=DIMS)
    word_to_all_idx: Dict[str, int] = {w: i for i, w in enumerate(all_words)}

    # Curate clean common English secret candidates from Google 10k, then top 60k FastText frequency order
    candidate_words: List[str] = []
    seen_cand: Set[str] = set()

    def try_add_candidate(w: str) -> None:
        if w in seen_cand:
            return
        if not EN_SECRET_RE.match(w):
            return
        if w not in hunspell_lower_lemmas:
            return
        if w in EN_SECRET_EXCLUSIONS or w not in word_to_all_idx:
            return
        if is_regular_plural(w, hunspell_lower_lemmas):
            return
        seen_cand.add(w)
        candidate_words.append(w)
        ranked_vocab.add(w)

    for w in google_10k:
        try_add_candidate(w)

    if len(candidate_words) < max_secrets + 500:
        for w in all_words[:60000]:
            try_add_candidate(w)
            if len(candidate_words) >= max_secrets + 1500:
                break

    print(f"[secrets] Candidate secret words: {len(candidate_words):,}")

    # Decode normalized matrix only for ranked_vocab present in FastText
    ranked_all_indices = [i for i, w in enumerate(all_words) if w in ranked_vocab]
    ranked_words = [all_words[i] for i in ranked_all_indices]
    ranked_word_to_pos = {w: pos for pos, w in enumerate(ranked_words)}

    print(f"[rank] Decoding {len(ranked_words):,} ranked-vocabulary vectors...")
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
            if top1_sim < 0.35 or top1_sim > 0.98 or top1000_sim < 0.15:
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

    del r_mat, r_mat_t, r_scales, r_norms
    print(f"[secrets] Final verified secrets: {len(secret_meta_list):,}")
    assert len(secret_meta_list) >= 4500, f"Too few clean secrets: {len(secret_meta_list)}"
    print("[secrets] First 20 sample secrets:", [s[0] for s in secret_meta_list[:20]])

    # Partition into HOT (top HOT_COUNT in FastText frequency order + kept secrets + starter chips) and COLD
    hot_idx_set: Set[int] = set(range(min(HOT_COUNT, len(all_words))))
    for sw in kept_secret_words:
        hot_idx_set.add(word_to_all_idx[sw])
    for st in STARTER_WORDS:
        if st in word_to_all_idx:
            hot_idx_set.add(word_to_all_idx[st])

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

    # Write cold shards dynamically bounded <= 220 MiB + cold-index.bin
    blocks: List[Tuple[bytes, bytes, int]] = []
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

    for stale in out_dir.glob("cold-*.bin"):
        if stale.name != "cold-index.bin":
            stale.unlink()

    shard_paths: List[Path] = []
    first_words_blob = bytearray()
    index_entries = bytearray()

    if blocks:
        shard_id = 0
        offset = 0
        cur_path = out_dir / f"cold-{shard_id}.bin"
        shard_paths.append(cur_path)
        sf = open(cur_path, "wb")
        try:
            for first_b, b_bytes, b_cnt in blocks:
                if offset > 0 and offset + len(b_bytes) > MAX_SHARD_BYTES:
                    assert offset < 250 * 1024 * 1024, f"cold-{shard_id}.bin too large: {offset}"
                    sf.close()
                    shard_id += 1
                    assert shard_id <= 255, "Too many cold shards"
                    offset = 0
                    cur_path = out_dir / f"cold-{shard_id}.bin"
                    shard_paths.append(cur_path)
                    sf = open(cur_path, "wb")
                sf.write(b_bytes)
                first_words_blob.extend(first_b)
                assert len(b_bytes) <= 65535
                index_entries.extend(struct.pack("<IIHBB", len(first_words_blob), offset, len(b_bytes), shard_id, b_cnt))
                offset += len(b_bytes)
            assert offset < 250 * 1024 * 1024, f"cold-{shard_id}.bin too large: {offset}"
        finally:
            sf.close()

    cold_index_path = out_dir / "cold-index.bin"
    with open(cold_index_path, "wb") as f:
        f.write(b"SMC2")
        f.write(struct.pack("<II", len(blocks), len(first_words_blob)))
        f.write(index_entries)
        f.write(first_words_blob)

    meta_path = out_dir / "secrets-meta.json"
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "version": "semantle-en-v2",
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
        "person", "food", "school", "nature", "happy",
        "coffee", "cloud", "milk", "espresso", "apple", "library", "water",
        "love", "music", "computer", "galaxy", "podcast", "youtube",
    ]
    for probe in probes:
        tier, vec = test_lookup(probe)
        assert vec is not None, f"Missing expected English probe word: {probe}"
        if probe in STARTER_WORDS:
            assert tier == "hot", f"Starter chip word {probe} expected in hot tier, got {tier}"
        print(f"  [probe] {probe} -> {tier} (norm={np.linalg.norm(vec):.5f})")

    out_files = [
        "secrets-meta.json",
        "secrets-top1k.bin",
        "hot-pack.bin",
        "cold-index.bin",
        *[p.name for p in shard_paths],
    ]
    manifest = {
        "version": "semantle-en-v2",
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

    print("[verify] Semantle EN v2 pack integrity passed!")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description="Build English Semantle v2 pack")
    parser.add_argument("--scratch", type=Path, default=DEFAULT_SCRATCH)
    parser.add_argument("--max-secrets", type=int, default=5000)
    args = parser.parse_args()
    build_pack(args.scratch, max_secrets=args.max_secrets)


if __name__ == "__main__":
    main()
