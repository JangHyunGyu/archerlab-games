"""8프레임 9방향 수비 캐릭터 액션 시트 생성 및 정량 검증 도구."""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import pathlib
from typing import Any

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_STAGE1_DIR = ROOT / "design" / "source-assets" / "defenders-8f-stage1"
DEFAULT_STAGE2_DIR = ROOT / "design" / "source-assets" / "defenders-8f-stage2"
DEFAULT_OUT_DIR = ROOT / "assets" / "images"
DEFAULT_CLEAN_SCRIPT = pathlib.Path(r"D:\workspace\harem\scripts\clean-sprite-bg.py")

CHARS = ("a", "b", "c", "d", "e", "f", "g", "h")
COLS = (4, 5, 6, 7, 8)
MIRROR_PAIRS = ((8, 0), (7, 1), (6, 2), (5, 3))
COL_ANGLES_DEG = {4: -90.0, 5: -75.0, 6: -60.0, 7: -45.0, 8: -30.0}
CELL_W = 320
CELL_H = 480
FOOT_Y = 458
FOOT_CX = 160
SAFE_MARGIN = 8

HAS_ATTACK_ZERO = {"c", "g", "h"}
ACTION_PREFIX = {
    "a": "attack",
    "b": "attack",
    "c": "attack",
    "d": "attack",
    "e": "attack",
    "f": "throw",
    "g": "attack",
    "h": "attack",
}

RELEASE_FRAMES = {
    "a": 1,
    "b": 1,
    "c": 1,
    "d": 1,
    "e": 1,
    "f": 3,
    "g": 1,
    "h": 1,
}

# 교정된 캐릭터별 화면 높이 및 어깨 피벗 좌표
CALIBRATED_HEIGHTS = {
    "a": 268,
    "b": 258,
    "c": 268,
    "d": 256,
    "e": 256,
    "f": 304,
    "g": 278,
    "h": 270,
}

AIM_PIVOTS = {
    "a": (0, -142),
    "b": (2, -146),
    "c": (0, -152),
    "d": (2, -144),
    "e": (2, -144),
    "f": (0, -140),
    "g": (1, -150),
    "h": (0, -148),
}


def load_native_cleaner(clean_script: pathlib.Path) -> tuple[Any, Any]:
    """네이티브 투명 배경 후처리 함수와 정량 검사 함수를 동적 로드."""
    spec = importlib.util.spec_from_file_location("clean_sprite_bg", str(clean_script))
    clean_mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(clean_mod)
    return clean_mod.clean_sprite, clean_mod.audit_sprite_quality


def find_grid_splits_4x2(alpha: np.ndarray) -> tuple[int, list[int], list[int], int, list[int], list[int]]:
    """4x2 원시 시트 알파 골짜기 기준 행/열 분할 경계 탐색."""
    h, w = alpha.shape
    y0, y1 = int(0.40 * h), int(0.60 * h)
    rsum = alpha[y0:y1, :].astype(np.int64).sum(axis=1)
    ry = y0 + int(np.argmin(rsum))
    ry_max = int(alpha[ry, :].max())

    def row_col_splits(sub_a: np.ndarray) -> tuple[list[int], list[int]]:
        splits = [0]
        bmax = []
        for k in (1, 2, 3):
            cx = int(round(w * k / 4.0))
            win0 = max(0, cx - int(0.08 * w))
            win1 = min(w, cx + int(0.08 * w))
            csum = sub_a[:, win0:win1].astype(np.int64).sum(axis=0)
            mval = int(csum.min())
            best = np.where(csum == mval)[0]
            sx = win0 + int(best[len(best) // 2])
            splits.append(sx)
            bmax.append(int(sub_a[:, sx].max()))
        splits.append(w)
        return splits, bmax

    top_splits, tb = row_col_splits(alpha[:ry, :])
    bot_splits, bb = row_col_splits(alpha[ry:, :])
    return ry, top_splits, bot_splits, ry_max, tb, bb


def extract_8_poses(raw_rgba: np.ndarray) -> tuple[list[np.ndarray], dict[str, Any]]:
    """4x2 원시 시트에서 상단 1~4 및 하단 5~8 포즈 추출."""
    a = raw_rgba[:, :, 3]
    ry, ts, bs, ry_max, tb, bb = find_grid_splits_4x2(a)
    poses = [raw_rgba[:ry, ts[i]:ts[i + 1], :] for i in range(4)]
    poses.extend(raw_rgba[ry:, bs[i]:bs[i + 1], :] for i in range(4))
    return poses, {"ry": ry, "ry_max": ry_max, "tb": tb, "bb": bb}


def measure_foot_cx(rgba: np.ndarray, y0: int, y1: int) -> float:
    """하단 14% 발 영역 불투명 픽셀 중심 X 좌표 산출."""
    a = rgba[:, :, 3]
    ch = max(1, y1 - y0)
    fy0 = max(y0, y1 - max(8, int(round(0.14 * ch))))
    _, xs = np.where(a[fy0:y1, :] >= 80)
    if len(xs) == 0:
        _, xs = np.where(a[y0:y1, :] >= 40)
    return float(xs.mean()) if len(xs) else rgba.shape[1] * 0.5


def bbox_and_foot(rgba: np.ndarray) -> tuple[int, int, int, int, float]:
    """불투명 외곽 경계와 발 중심 X 좌표 동시 계산."""
    ys, xs = np.where(rgba[:, :, 3] >= 16)
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    return x0, y0, x1, y1, measure_foot_cx(rgba, y0, y1)


def body_lower_height(rgba: np.ndarray, cid: str) -> int:
    """발바닥~머리 기준 신체 높이 계산 (F는 투척 팔 제외를 위해 적색 모발 최상단 사용)."""
    a = rgba[:, :, 3]
    ys, _ = np.where(a >= 48)
    if len(ys) == 0:
        return 1
    y1 = int(ys.max())
    if cid == "f":
        r = rgba[:, :, 0].astype(np.float32)
        g = rgba[:, :, 1].astype(np.float32)
        b = rgba[:, :, 2].astype(np.float32)
        red_hair = (a >= 80) & (r >= 85.0) & (r > g * 1.35) & (r > b * 1.22) & (g < 115.0)
        rys, _ = np.where(red_hair)
        if len(rys):
            return max(1, y1 - int(rys.min()))
    row_widths = (a >= 48).sum(axis=1)
    max_w = int(row_widths.max())
    head_rows = np.where(row_widths >= max(10, int(0.18 * max_w)))[0]
    y_head = int(head_rows.min()) if len(head_rows) else int(ys.min())
    return max(1, y1 - y_head)


def seal_micro_pinholes(rgba: np.ndarray, max_area: int = 12) -> np.ndarray:
    """축소 보간 후 실루엣 내부 소형 핀홀 및 인접 반투명 링 보정."""
    out = rgba.copy()
    h, w = out.shape[:2]
    a = out[:, :, 3]
    solid = ndimage.binary_fill_holes(a >= 180)
    pin = solid & (a == 0)
    lbl, _ = ndimage.label(pin)
    valid_src = a >= 180
    if not np.any(valid_src):
        return out
    _, (ny, nx) = ndimage.distance_transform_edt(~valid_src, return_indices=True)
    for idx, sl in enumerate(ndimage.find_objects(lbl), 1):
        if sl is None:
            continue
        if sl[0].start == 0 or sl[1].start == 0 or sl[0].stop >= h or sl[1].stop >= w:
            continue
        comp = lbl[sl] == idx
        area = int(comp.sum())
        if 1 <= area <= max_area:
            ys_c, xs_c = np.where(comp)
            gy = ys_c + sl[0].start
            gx = xs_c + sl[1].start
            out[gy, gx, :3] = out[ny[gy, gx], nx[gy, gx], :3]
            out[gy, gx, 3] = 255
    a_after = out[:, :, 3]
    dist_zero = ndimage.distance_transform_edt(a_after > 0)
    deep_leak = (dist_zero >= 2.15) & (a_after > 0) & (a_after < 255)
    if np.any(deep_leak):
        low = deep_leak & (a_after < 160)
        if np.any(low) and np.any(a_after >= 180):
            _, (cy, cx) = ndimage.distance_transform_edt(~(a_after >= 180), return_indices=True)
            out[low, :3] = out[cy[low], cx[low], :3]
        out[deep_leak, 3] = 255
    return out


def measure_muzzle_px(cell: np.ndarray, cid: str, col: int) -> tuple[int, int]:
    """어깨 피벗과 방향 각도 투영 기반 무기 총구/투척 손 끝 픽셀 탐지."""
    h, w = cell.shape[:2]
    a = cell[:, :, 3]
    r = cell[:, :, 0].astype(np.int16)
    g = cell[:, :, 1].astype(np.int16)
    b = cell[:, :, 2].astype(np.int16)

    scale = CALIBRATED_HEIGHTS[cid] / float(CELL_H)
    piv_x = 160.0 + AIM_PIVOTS[cid][0] / scale
    piv_y = float(CELL_H) + AIM_PIVOTS[cid][1] / scale

    angle_rad = math.radians(COL_ANGLES_DEG[col])
    ux, uy = math.cos(angle_rad), math.sin(angle_rad)

    ys, xs = np.where(a >= 120)
    if len(xs) == 0:
        return 160, 140

    pr, pg, pb = r[ys, xs], g[ys, xs], b[ys, xs]
    cand = (ys <= int(round(piv_y + 42))) & (ys >= 6)

    if cid == "a":
        pink_hair = ((pr - pg) > 32) & (pr > 165) & (pb > 120)
        min_x = 186 if col == 4 else (182 if col == 5 else 168)
        cand &= (~pink_hair) & (xs >= min_x) & (ys <= 165)
    elif cid == "b":
        purple_hair = (pb > pg + 16) & (pr > pg)
        min_x = 176 if col == 4 else 168
        cand &= (~purple_hair) & (xs >= min_x)
    elif cid == "c":
        min_x = 178 if col == 4 else (184 if col in (5, 6) else 172)
        min_y = 52 if col in (4, 5, 6) else 6
        cand &= (xs >= min_x) & (ys >= min_y)
    elif cid == "d":
        blonde_hair = (pr > 175) & (pg > 130) & (pb < 135) & ((pr - pb) > 55)
        min_x = 180 if col in (4, 5) else 168
        cand &= (~blonde_hair) & (xs >= min_x)
    elif cid == "f":
        min_x = 175 if col >= 5 else 172
        cand &= (xs >= min_x) & (ys <= 170)
    elif cid == "g":
        min_x = 182 if col == 4 else 168
        cand &= xs >= min_x
    else:
        min_x = 166 if col == 4 else 160
        cand &= xs >= min_x

    if not np.any(cand):
        cand = (xs >= 164) & (ys <= int(round(piv_y + 42)))
    cx = xs[cand].astype(np.float32)
    cy = ys[cand].astype(np.float32)

    proj = (cx - piv_x) * (ux + (0.45 if col == 4 else 0.14)) + (cy - piv_y) * uy
    tip_mask = proj >= np.percentile(proj, 99.0)
    tx = int(round(float(cx[tip_mask].mean())))
    ty = int(round(float(cy[tip_mask].mean())))

    if a[max(0, min(h - 1, ty)), max(0, min(w - 1, tx))] < 120:
        d2 = (cx - tx) ** 2 + (cy - ty) ** 2
        ni = int(np.argmin(d2))
        tx, ty = int(cx[ni]), int(cy[ni])
    return tx, ty


def mirror_cols_to_strip(cols_4_to_8: dict[int, np.ndarray]) -> np.ndarray:
    """우측 기준 방향(4~8)을 좌우 반전해 9방향 2880x480 시트 조립."""
    strip = Image.new("RGBA", (CELL_W * 9, CELL_H), (0, 0, 0, 0))
    for col in COLS:
        im_r = Image.fromarray(cols_4_to_8[col])
        strip.paste(im_r, (col * CELL_W, 0))
    for src_col, dst_col in MIRROR_PAIRS:
        im_src = Image.fromarray(cols_4_to_8[src_col])
        strip.paste(im_src.transpose(Image.Transpose.FLIP_LEFT_RIGHT), (dst_col * CELL_W, 0))
    return np.array(strip)


def px_to_offset(px: int, py: int, cid: str) -> list[int]:
    """320x480 셀 픽셀 좌표를 캐릭터 화면 높이 기준 오프셋으로 변환."""
    scale = CALIBRATED_HEIGHTS[cid] / float(CELL_H)
    return [int(round((px - 160.0) * scale)), int(round((py - float(CELL_H)) * scale))]


def save_png_and_webp(arr: np.ndarray, out_dir: pathlib.Path, stem: str, lossless_webp: bool = False) -> None:
    """PNG와 알파 바이트가 완전히 일치하는 WebP 쌍 저장."""
    png_path = out_dir / f"{stem}.png"
    webp_path = out_dir / f"{stem}.webp"
    im = Image.fromarray(arr)
    im.save(png_path, format="PNG", optimize=True, compress_level=9)
    if lossless_webp:
        im.save(webp_path, format="WEBP", lossless=True, exact=True, method=6)
    else:
        im.save(webp_path, format="WEBP", quality=96, alpha_quality=100, method=6)
    if Image.open(png_path).convert("RGBA").getchannel("A").tobytes() != Image.open(webp_path).convert("RGBA").getchannel("A").tobytes():
        raise RuntimeError(f"[알파 불일치 오류] {stem}")


def run_build(stage1_dir: pathlib.Path, stage2_dir: pathlib.Path, out_dir: pathlib.Path, clean_script: pathlib.Path) -> dict[str, Any]:
    """Stage-1 준비 셀과 Stage-2 4x2 시트를 결합해 8프레임 9방향 프로덕션 시트 생성."""
    clean_sprite, audit_sprite_quality = load_native_cleaner(clean_script)
    out_dir.mkdir(parents=True, exist_ok=True)
    frames_by_char = {cid: {f: {} for f in range(8)} for cid in CHARS}
    muzzles_px = {cid: {f: {} for f in range(8)} for cid in CHARS}

    for cid in CHARS:
        for col in COLS:
            f0_arr = np.array(Image.open(stage1_dir / f"{cid}_c{col}_ready.png").convert("RGBA"))
            f0_bh = body_lower_height(f0_arr, cid)

            raw2_arr = np.array(Image.open(stage2_dir / f"{cid}_c{col}_raw.png").convert("RGBA"))
            raw_poses, grid_info = extract_8_poses(raw2_arr)
            if grid_info["ry_max"] > 12 or max(grid_info["tb"]) > 12 or max(grid_info["bb"]) > 12:
                raise RuntimeError(f"[시트 분할 충돌] {cid}_c{col} {grid_info}")

            cleaned_poses, pose_boxes = [], []
            for p_arr in raw_poses:
                ph, pw = p_arr.shape[:2]
                padded = np.zeros((ph + 32, pw + 32, 4), dtype=np.uint8)
                padded[16:16 + ph, 16:16 + pw] = p_arr
                cp = clean_sprite(padded, restore_crown=False, native_rgba=True)
                cleaned_poses.append(cp)
                pose_boxes.append(bbox_and_foot(cp))

            p1_bh = body_lower_height(cleaned_poses[0], cid)
            s_sheet = f0_bh / float(max(1, p1_bh))
            p_scales = [s_sheet]
            for px0, py0, px1, py1, pfcx in pose_boxes[1:]:
                p_scales.extend([
                    (FOOT_Y - SAFE_MARGIN) / float(max(1, py1 - py0)),
                    (FOOT_CX - SAFE_MARGIN) / max(1.0, pfcx - px0),
                    (CELL_W - SAFE_MARGIN - FOOT_CX) / max(1.0, px1 - pfcx),
                ])
            s_final = min(p_scales)

            cell_list = [f0_arr]
            for f_idx in range(1, 8):
                cp = cleaned_poses[f_idx]
                px0, py0, px1, py1, pfcx = pose_boxes[f_idx]
                nw = max(1, int(round((px1 - px0) * s_final)))
                nh = max(1, int(round((py1 - py0) * s_final)))
                resized = np.array(Image.fromarray(cp[py0:py1, px0:px1]).resize((nw, nh), Image.Resampling.LANCZOS))
                dx = max(SAFE_MARGIN, min(CELL_W - SAFE_MARGIN - nw, int(round(FOOT_CX - (pfcx - px0) * s_final))))
                dy = max(SAFE_MARGIN, FOOT_Y - nh)
                canvas = np.zeros((CELL_H, CELL_W, 4), dtype=np.uint8)
                canvas[dy:dy + nh, dx:dx + nw] = resized
                canvas = clean_sprite(canvas, restore_crown=False, native_rgba=True)
                canvas = seal_micro_pinholes(canvas, max_area=12)
                audit = audit_sprite_quality(canvas, expected_size=(CELL_W, CELL_H))
                if audit["floating_islands"] or audit["floating_islands_18"] or audit["interior_holes"] or audit["edge_clip_top"]:
                    raise RuntimeError(f"[셀 정량 검증 실패] {cid}_c{col}_f{f_idx} {audit}")
                cell_list.append(canvas)

            for f_idx in range(8):
                frames_by_char[cid][f_idx][col] = cell_list[f_idx]
                muzzles_px[cid][f_idx][col] = measure_muzzle_px(cell_list[f_idx], cid, col)

    muzzle_offsets, frame_muzzles = {}, {}
    for cid in CHARS:
        save_png_and_webp(mirror_cols_to_strip(frames_by_char[cid][0]), out_dir, f"character-{cid}")
        prefix = ACTION_PREFIX[cid]
        start_f = 0 if (cid in HAS_ATTACK_ZERO or cid == "f") else 1
        for f_idx in range(start_f, 8):
            save_png_and_webp(
                mirror_cols_to_strip(frames_by_char[cid][f_idx]),
                out_dir,
                f"character-{cid}-{prefix}-{f_idx}",
                lossless_webp=(cid == "f" and f_idx == 7),
            )
        rel_f = RELEASE_FRAMES[cid]
        row_9 = [[0, 0]] * 9
        for col in COLS:
            ox, oy = px_to_offset(*muzzles_px[cid][rel_f][col], cid)
            row_9[col] = [ox, oy]
            if col > 4:
                row_9[8 - col] = [-ox, oy]
        muzzle_offsets[cid] = row_9

        frame_muzzles[cid] = {}
        for f_idx in range(1, 5):
            f_row = [[0, 0]] * 9
            for col in COLS:
                ox, oy = px_to_offset(*muzzles_px[cid][f_idx][col], cid)
                f_row[col] = [ox, oy]
                if col > 4:
                    f_row[8 - col] = [-ox, oy]
            frame_muzzles[cid][str(f_idx)] = f_row

    print(f"[8프레임 수비 시트 생성 완료] out_dir={out_dir} count=68")
    return {"muzzle_offsets": muzzle_offsets, "frame_muzzle_offsets": frame_muzzles}


def main() -> int:
    parser = argparse.ArgumentParser(description="Build 8-frame 9-direction defender sprite sheets")
    parser.add_argument("--stage1-dir", type=pathlib.Path, default=DEFAULT_STAGE1_DIR)
    parser.add_argument("--stage2-dir", type=pathlib.Path, default=DEFAULT_STAGE2_DIR)
    parser.add_argument("--out-dir", type=pathlib.Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--clean-script", type=pathlib.Path, default=DEFAULT_CLEAN_SCRIPT)
    args = parser.parse_args()
    run_build(args.stage1_dir, args.stage2_dir, args.out_dir, args.clean_script)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
