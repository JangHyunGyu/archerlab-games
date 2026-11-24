from __future__ import annotations

"""Build native-RGBA enemy & boss motion atlases, canonical sources, and VFX frames.

Outputs:
    assets/enemies/source/<enemyKey>.png         (canonical 512x512 right-facing Pose 0)
    assets/bosses/source/<bossKey>.png           (canonical 512x512 right-facing Pose 0)
    assets/effects/enemy_boss/<vfxKey>_0..5.png  (256x256 centered 6-frame VFX)
    assets/atlases/enemies_early.json            (goblin, steelFangLycan, antSoldier, orc, iceBear)
    assets/atlases/enemies_late.json             (iceElf, stoneGolem, darkMage, ironKnight, demonWarrior)
    assets/atlases/boss_igris.json
    assets/atlases/boss_tusk.json
    assets/atlases/boss_beru.json

Staging lossless atlas PNGs and 1:1 unscaled 3-color contrast PNG verification sheets
are written to the scratch directory passed via --scratch-dir so optimize_enemy_assets.mjs
can convert and gate PNG->WebP quality without leaving untracked atlas PNGs in assets/atlases/.
"""

import argparse
import importlib.util
import json
from pathlib import Path
import sys
from typing import Iterable

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
HAREM_CLEANER_PATH = Path(r"D:\workspace\harem\scripts\clean-sprite-bg.py")
DEFAULT_SCRATCH_DIR = Path(
    r"C:\Users\user\.gemini\antigravity\brain\05acd3bc-38fd-44fd-90cd-5cbab77eca27\scratch"
)

ENEMY_ATLAS_GROUPS: dict[str, list[str]] = {
    "enemies_early": ["goblin", "steelFangLycan", "antSoldier", "orc", "iceBear"],
    "enemies_late": ["iceElf", "stoneGolem", "darkMage", "ironKnight", "demonWarrior"],
}
BOSS_KEYS = ["igris", "tusk", "beru"]
VFX_KEYS = ["dark_mage_orb", "boss_igris_slash", "boss_tusk_slam", "boss_beru_acid"]

ENEMY_CELL_SIZE = (192, 192)
BOSS_CELL_SIZE = (256, 256)
CANONICAL_SIZE = (512, 512)
VFX_FRAME_SIZE = (256, 256)
ATLAS_PAD = 4
ATLAS_BLEED = 1


def _load_harem_cleaner():
    if not HAREM_CLEANER_PATH.is_file():
        raise FileNotFoundError(f"Missing required sprite cleaner: {HAREM_CLEANER_PATH}")
    spec = importlib.util.spec_from_file_location("harem_clean_sprite_bg", HAREM_CLEANER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load module spec from {HAREM_CLEANER_PATH}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_CLEANER = _load_harem_cleaner()


def _zero_transparent_rgb(arr: np.ndarray) -> np.ndarray:
    out = arr.copy()
    out[out[:, :, 3] == 0, :3] = 0
    return out


def _isolate_four_poses(strip_rgba: np.ndarray, label: str) -> list[np.ndarray]:
    """Segment a 4-pose horizontal native-RGBA strip using 2D connected components.

    Using 2D connected components avoids clipping adjacent poses whose horizontal
    projections slightly overlap (e.g. a flowing cape tip above a stretched foot),
    while assigning detached attack sparks/shards (>= 12px within 72px) to the
    closest pose body.
    """
    h, w = strip_rgba.shape[:2]
    a = strip_rgba[:, :, 3]

    # Clear subtle open-air noise before component labeling
    dist_fg24 = ndimage.distance_transform_edt(a < 24)
    work = strip_rgba.copy()
    wa = work[:, :, 3]
    wa[(wa > 0) & (wa <= 14) & (dist_fg24 > 3.0)] = 0
    wa[wa <= 4] = 0

    lbl, num = ndimage.label(wa >= 18)
    objs = ndimage.find_objects(lbl)
    majors: list[tuple[float, int]] = []
    for idx, sl in enumerate(objs, 1):
        if sl is None:
            continue
        area = int((lbl[sl] == idx).sum())
        if area >= 1500:
            cx = 0.5 * (sl[1].start + sl[1].stop)
            majors.append((cx, idx))

    if len(majors) != 4:
        raise RuntimeError(f"[{label}] expected 4 major pose components, found {len(majors)}")

    majors.sort(key=lambda item: item[0])

    # Compute Euclidean distance from each of the 4 major pose silhouettes
    dists = np.empty((4, h, w), dtype=np.float32)
    major_masks = []
    for k, (_, comp_idx) in enumerate(majors):
        m = lbl == comp_idx
        major_masks.append(m)
        dists[k] = ndimage.distance_transform_edt(~m)

    nearest_idx = np.argmin(dists, axis=0)
    min_dist = np.min(dists, axis=0)

    # Identify significant detached fragments (e.g. ice shards / slash energy drops)
    keep_small_mask = np.zeros((h, w), dtype=bool)
    for idx, sl in enumerate(objs, 1):
        if sl is None:
            continue
        comp_mask = lbl == idx
        area = int(comp_mask.sum())
        if 12 <= area < 1500:
            if float(min_dist[comp_mask].min()) <= 72.0:
                keep_small_mask |= comp_mask

    # Soft AA halo pixels belonging to either major silhouettes or retained droplets
    base_solid = np.zeros((h, w), dtype=bool)
    for m in major_masks:
        base_solid |= m
    base_solid |= keep_small_mask
    dist_solid = ndimage.distance_transform_edt(~base_solid)
    keep_pixel = (wa > 0) & (base_solid | (dist_solid <= 16.0))

    poses: list[np.ndarray] = []
    for k in range(4):
        pose = np.zeros_like(work)
        sel = keep_pixel & (nearest_idx == k)
        pose[sel] = work[sel]
        poses.append(_zero_transparent_rgb(pose))
    return poses


def _clean_pose_native_rgba(pose_rgba: np.ndarray, label: str) -> tuple[np.ndarray, dict]:
    """Run harem clean_native_rgba_sprite on the main body while preserving intentional slash shards."""
    h, w = pose_rgba.shape[:2]
    a = pose_rgba[:, :, 3]
    lbl, num = ndimage.label(a >= 18)

    if num == 0:
        raise RuntimeError(f"[{label}] pose has no visible foreground")

    sizes = ndimage.sum(a >= 18, lbl, range(1, num + 1))
    main_idx = int(np.argmax(sizes)) + 1
    main_mask = lbl == main_idx

    # Build crop box around all foreground pixels so we run cleaner on tight padded frame
    ys, xs = np.where(a > 0)
    pad = 24
    y0 = max(0, int(ys.min()) - pad)
    y1 = min(h, int(ys.max()) + 1 + pad)
    x0 = max(0, int(xs.min()) - pad)
    x1 = min(w, int(xs.max()) + 1 + pad)

    sub = pose_rgba[y0:y1, x0:x1].copy()
    sub_lbl, sub_num = ndimage.label(sub[:, :, 3] >= 18)
    sub_sizes = ndimage.sum(sub[:, :, 3] >= 18, sub_lbl, range(1, sub_num + 1))
    sub_main_idx = int(np.argmax(sub_sizes)) + 1

    # Preserve intentional secondary slash droplets (>= 12px) separately from body cleanup
    sub_main_only = sub.copy()
    sub_shards_mask = (sub_lbl > 0) & (sub_lbl != sub_main_idx)
    # Expand shard mask slightly for AA fringe
    sub_shards_aa = sub_shards_mask | (
        ndimage.binary_dilation(sub_shards_mask, iterations=4)
        & (~ndimage.binary_dilation(sub_lbl == sub_main_idx, iterations=2))
        & (sub[:, :, 3] > 4)
    )
    sub_main_only[sub_shards_aa, :] = 0

    cleaned_body = _CLEANER.clean_native_rgba_sprite(
        sub_main_only,
        character_id="custom_native",
        restore_crown=False,
        ref_rgba=None,
        harmonize_style=False,
    )
    # Seal any post-clean 1px enclosed pinholes & interior semi-transparent leaks matching audit_sprite_quality
    ch, cw = cleaned_body.shape[:2]
    cscale = max(0.5, cw / 1152.0)
    ca_body = cleaned_body[:, :, 3]
    for _ in range(5):
        solid_filled = ndimage.binary_fill_holes(ca_body >= 180)
        pin_cand = solid_filled & (ca_body == 0)
        if np.any(pin_cand):
            pin_lbl, _ = ndimage.label(pin_cand)
            max_pin_area = int(350 * cscale * cscale)
            valid_src = ca_body >= 180
            if np.any(valid_src):
                _, (ny, nx) = ndimage.distance_transform_edt(~valid_src, return_indices=True)
                for idx, sl in enumerate(ndimage.find_objects(pin_lbl), 1):
                    if sl is None:
                        continue
                    if sl[0].start == 0 or sl[1].start == 0 or sl[0].stop >= ch or sl[1].stop >= cw:
                        continue
                    comp = pin_lbl[sl] == idx
                    area = int(comp.sum())
                    if 1 <= area <= max_pin_area:
                        mask = np.zeros((ch, cw), dtype=bool)
                        mask[sl] = comp
                        for ch_idx in range(3):
                            cleaned_body[:, :, ch_idx][mask] = cleaned_body[:, :, ch_idx][ny[mask], nx[mask]]
                        ca_body[mask] = 255

        dist_zero = ndimage.distance_transform_edt(ca_body > 0)
        core_leak = (dist_zero >= 4.5 * cscale) & (ca_body < 250)
        if np.any(core_leak):
            low_leak = core_leak & (ca_body < 64)
            if np.any(low_leak) and np.any(ca_body >= 180):
                _, (ny, nx) = ndimage.distance_transform_edt(~(ca_body >= 180), return_indices=True)
                for ch_idx in range(3):
                    cleaned_body[:, :, ch_idx][low_leak] = cleaned_body[:, :, ch_idx][ny[low_leak], nx[low_leak]]
            ca_body[core_leak] = 255

        # Ensure single connected component at every alpha threshold: if a small 4-disconnected
        # piece touches the main body diagonally (8-connected), bridge one 4-neighbor seam pixel.
        for thresh in (24, 18, 10, 1):
            vis = ca_body >= thresh
            c_lbl, c_num = ndimage.label(vis)
            if c_num > 1:
                c_sizes = ndimage.sum(vis, c_lbl, range(1, c_num + 1))
                main_c = int(np.argmax(c_sizes)) + 1
                other = vis & (c_lbl != main_c)
                main_4 = ndimage.binary_dilation(c_lbl == main_c)
                other_4 = ndimage.binary_dilation(other)
                diag_bridge = main_4 & other_4 & (ca_body < thresh)
                if np.any(diag_bridge) and int(other.sum()) <= 64:
                    if np.any(ca_body >= 180):
                        _, (by, bx) = ndimage.distance_transform_edt(~(ca_body >= 180), return_indices=True)
                        need_rgb = diag_bridge & (ca_body == 0)
                        for ch_idx in range(3):
                            cleaned_body[:, :, ch_idx][need_rgb] = cleaned_body[:, :, ch_idx][by[need_rgb], bx[need_rgb]]
                    ca_body[diag_bridge] = 255
                else:
                    ca_body[other] = 0

        _, n1 = ndimage.label(ca_body >= 1)
        _, n18 = ndimage.label(ca_body >= 18)
        dz_chk = ndimage.distance_transform_edt(ca_body > 0)
        n_holes = int(((dz_chk >= 4.5 * cscale) & (ca_body < 245)).sum())
        sf_chk = ndimage.binary_fill_holes(ca_body >= 180) & (ca_body == 0)
        pl_chk, _ = ndimage.label(sf_chk)
        has_pin = any(
            sl is not None
            and sl[0].start > 0 and sl[1].start > 0 and sl[0].stop < ch and sl[1].stop < cw
            and 1 <= int((pl_chk[sl] == i).sum()) <= int(350 * cscale * cscale)
            for i, sl in enumerate(ndimage.find_objects(pl_chk), 1)
        )
        if n1 <= 1 and n18 <= 1 and n_holes == 0 and not has_pin:
            break

    cleaned_body = _zero_transparent_rgb(cleaned_body)
    audit = _CLEANER.audit_sprite_quality(cleaned_body, expected_size=(cleaned_body.shape[1], cleaned_body.shape[0]))
    if (
        audit["floating_islands"] != 0
        or audit["floating_islands_18"] != 0
        or audit["interior_holes"] != 0
        or audit["enclosed_pinholes"] != 0
    ):
        raise RuntimeError(f"[{label}] body audit failed: {audit}")

    # Composite intentional attack slash shards back over clean transparent space
    if np.any(sub_shards_mask):
        shard_layer = np.zeros_like(cleaned_body)
        shard_layer[sub_shards_aa] = sub[sub_shards_aa]
        shard_layer[shard_layer[:, :, 3] <= 4, :] = 0
        im_out = Image.fromarray(cleaned_body, "RGBA")
        im_shard = Image.fromarray(_zero_transparent_rgb(shard_layer), "RGBA")
        im_out.alpha_composite(im_shard)
        cleaned_sub = _zero_transparent_rgb(np.array(im_out))
    else:
        cleaned_sub = _zero_transparent_rgb(cleaned_body)

    # Tighten to non-empty bbox + 4px margin
    ca = cleaned_sub[:, :, 3]
    cys, cxs = np.where(ca > 0)
    cy0, cy1 = int(cys.min()), int(cys.max()) + 1
    cx0, cx1 = int(cxs.min()), int(cxs.max()) + 1
    tight = cleaned_sub[cy0:cy1, cx0:cx1].copy()
    return tight, audit


def _body_anchor_center_x(pose_rgba: np.ndarray) -> float:
    """Measure horizontal center of the core torso/legs so weapon lunges extend forward."""
    h, w = pose_rgba.shape[:2]
    a = (pose_rgba[:, :, 3] >= 64).astype(np.float32)
    # Lower 55% + middle band tracks hips/legs stably across swings
    y_start = int(h * 0.42)
    sub = a[y_start:, :]
    if float(sub.sum()) < 20.0:
        sub = a
    weights_x = sub.sum(axis=0)
    xs = np.arange(w, dtype=np.float32)
    total = float(weights_x.sum())
    if total <= 0:
        return w * 0.5
    return float((xs * weights_x).sum() / total)


def _render_unit_poses(
    walk_strip: Path,
    attack_strip: Path,
    cell_size: tuple[int, int],
    unit_key: str,
) -> tuple[list[Image.Image], list[Image.Image], list[dict]]:
    """Return scaled & baseline-aligned 4 walk + 4 attack frames plus audit info."""
    cell_w, cell_h = cell_size
    foot_y = cell_h - 8
    pad_side = 6
    max_w = cell_w - pad_side * 2
    max_h = foot_y - 6

    walk_arr = np.array(Image.open(walk_strip).convert("RGBA"))
    atk_arr = np.array(Image.open(attack_strip).convert("RGBA"))

    walk_raw = _isolate_four_poses(walk_arr, f"{unit_key}/walk")
    atk_raw = _isolate_four_poses(atk_arr, f"{unit_key}/attack")

    walk_clean: list[np.ndarray] = []
    atk_clean: list[np.ndarray] = []
    audits: list[dict] = []

    for i, raw in enumerate(walk_raw):
        cleaned, aud = _clean_pose_native_rgba(raw, f"{unit_key}_walk_{i}")
        walk_clean.append(cleaned)
        audits.append(aud)
    for i, raw in enumerate(atk_raw):
        cleaned, aud = _clean_pose_native_rgba(raw, f"{unit_key}_attack_{i}")
        atk_clean.append(cleaned)
        audits.append(aud)

    # Anchor walk scale on median standing walk height and calibrate attack scale
    # on Pose 3 (standing recovery) so walk/attack body proportions stay aligned.
    walk_heights = sorted(p.shape[0] for p in walk_clean)
    median_walk_h = 0.5 * (walk_heights[1] + walk_heights[2])
    atk_ref_h = float(atk_clean[3].shape[0])
    target_stand_h = max_h * 0.86

    walk_scale = target_stand_h / max(1.0, median_walk_h)
    for pose in walk_clean:
        ph, pw = pose.shape[:2]
        walk_scale = min(walk_scale, max_w / max(1.0, float(pw)), max_h / max(1.0, float(ph)))

    ratio = max(0.92, min(1.48, median_walk_h / max(1.0, atk_ref_h)))
    atk_scale = walk_scale * ratio
    for pose in atk_clean:
        ph, pw = pose.shape[:2]
        atk_scale = min(atk_scale, max_w / max(1.0, float(pw)), max_h / max(1.0, float(ph)))

    if atk_scale * atk_ref_h < 0.90 * walk_scale * median_walk_h:
        walk_scale = min(walk_scale, (atk_scale * atk_ref_h) / max(1.0, 0.94 * median_walk_h))

    out_walk: list[Image.Image] = []
    out_atk: list[Image.Image] = []

    for target_list, poses, scale in ((out_walk, walk_clean, walk_scale), (out_atk, atk_clean, atk_scale)):
        for pose in poses:
            ph, pw = pose.shape[:2]
            nw = max(1, int(round(pw * scale)))
            nh = max(1, int(round(ph * scale)))
            resized = Image.fromarray(pose, "RGBA").resize((nw, nh), Image.Resampling.LANCZOS)

            anchor_cx = _body_anchor_center_x(pose) * scale
            paste_x = int(round(cell_w * 0.5 - anchor_cx))
            # Clamp horizontally inside cell padding so wide lunges never clip
            paste_x = max(pad_side, min(cell_w - pad_side - nw, paste_x))
            paste_y = max(4, foot_y - nh)

            canvas = Image.new("RGBA", (cell_w, cell_h), (0, 0, 0, 0))
            canvas.alpha_composite(resized, (paste_x, paste_y))
            arr = _zero_transparent_rgb(np.array(canvas))
            target_list.append(Image.fromarray(arr, "RGBA"))

    return out_walk, out_atk, audits


def _render_canonical_source(walk_pose0_src: Path, unit_key: str) -> Image.Image:
    """Export crisp 512x512 centered canonical source from cleaned Pose 0 walk."""
    arr = np.array(Image.open(walk_pose0_src).convert("RGBA"))
    poses = _isolate_four_poses(arr, f"{unit_key}/canonical")
    cleaned, _ = _clean_pose_native_rgba(poses[0], f"{unit_key}_canonical")
    ch, cw = cleaned.shape[:2]
    max_dim = CANONICAL_SIZE[0] - 48
    scale = min(max_dim / max(1, cw), max_dim / max(1, ch))
    nw = max(1, int(round(cw * scale)))
    nh = max(1, int(round(ch * scale)))
    resized = Image.fromarray(cleaned, "RGBA").resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", CANONICAL_SIZE, (0, 0, 0, 0))
    px = (CANONICAL_SIZE[0] - nw) // 2
    py = (CANONICAL_SIZE[1] - nh) // 2
    canvas.alpha_composite(resized, (px, py))
    out = _zero_transparent_rgb(np.array(canvas))
    return Image.fromarray(out, "RGBA")


def _split_vfx_stages(strip_path: Path, name: str) -> list[np.ndarray]:
    """Split a 4-stage native-RGBA VFX strip via horizontal alpha valleys."""
    arr = np.array(Image.open(strip_path).convert("RGBA"))
    h, w = arr.shape[:2]
    a = arr[:, :, 3]

    dist_fg24 = ndimage.distance_transform_edt(a < 24)
    work = arr.copy()
    wa = work[:, :, 3]
    wa[(wa > 0) & (wa <= 12) & (dist_fg24 > 4.0)] = 0
    wa[wa <= 3] = 0

    col_has = (wa > 6).any(axis=0)
    runs: list[tuple[int, int]] = []
    in_run = False
    start = 0
    zero_streak = 0
    for x in range(w):
        if col_has[x]:
            if not in_run:
                in_run = True
                start = x
            zero_streak = 0
        else:
            if in_run:
                zero_streak += 1
                if zero_streak >= 8:
                    runs.append((start, x - zero_streak + 1))
                    in_run = False
                    zero_streak = 0
    if in_run:
        runs.append((start, w - zero_streak))

    major_runs = [r for r in runs if (r[1] - r[0]) >= 24]
    if len(major_runs) != 4:
        raise RuntimeError(f"[{name}] expected 4 horizontal VFX stage runs, got {len(major_runs)}: {major_runs}")

    stages: list[np.ndarray] = []
    for s_idx, (rx0, rx1) in enumerate(major_runs):
        x0 = max(0, rx0 - 2)
        x1 = min(w, rx1 + 2)
        sub = work[:, x0:x1].copy()
        sa = sub[:, :, 3]
        ys, xs = np.where(sa > 0)
        if len(ys) == 0:
            raise RuntimeError(f"[{name}] empty stage {s_idx}")
        cropped = sub[int(ys.min()):int(ys.max()) + 1, int(xs.min()):int(xs.max()) + 1].copy()
        stages.append(_zero_transparent_rgb(cropped))
    return stages


def _build_vfx_six_frames(strip_path: Path, name: str) -> list[Image.Image]:
    """Convert 4 VFX stages into 6 centered 256x256 animation frames."""
    stages = _split_vfx_stages(strip_path, name)
    fw, fh = VFX_FRAME_SIZE
    max_extent = max(max(st.shape[0], st.shape[1]) for st in stages)
    base_scale = (fw - 28) / max(1, max_extent)

    # Smooth 6-frame progression matching 4 authored growth/peak/dissipate stages
    schedule = [
        (0, 0.80, 0.88),
        (0, 0.96, 1.00),
        (1, 1.00, 1.00),
        (2, 1.00, 1.00),
        (3, 1.00, 0.96),
        (3, 0.92, 0.65),
    ]

    frames: list[Image.Image] = []
    for stage_idx, rel_scale, alpha_mult in schedule:
        st = stages[stage_idx]
        sh, sw = st.shape[:2]
        sc = base_scale * rel_scale
        nw = max(1, int(round(sw * sc)))
        nh = max(1, int(round(sh * sc)))
        resized = Image.fromarray(st, "RGBA").resize((nw, nh), Image.Resampling.LANCZOS)
        arr = np.array(resized)
        if alpha_mult < 1.0:
            arr[:, :, 3] = np.clip(np.round(arr[:, :, 3].astype(np.float32) * alpha_mult), 0, 255).astype(np.uint8)
        arr = _zero_transparent_rgb(arr)
        canvas = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
        px = (fw - nw) // 2
        py = (fh - nh) // 2
        canvas.alpha_composite(Image.fromarray(arr, "RGBA"), (px, py))
        out = _zero_transparent_rgb(np.array(canvas))
        frames.append(Image.fromarray(out, "RGBA"))
    return frames


def _paste_with_bleed(atlas: Image.Image, frame_im: Image.Image, dx: int, dy: int, bleed: int = 1) -> None:
    """Paste frame at (dx, dy) and extrude 1px edge texels into gutter to prevent atlas bleeding."""
    atlas.paste(frame_im, (dx, dy))
    if bleed <= 0:
        return
    fw, fh = frame_im.size
    top = frame_im.crop((0, 0, fw, 1))
    bot = frame_im.crop((0, fh - 1, fw, fh))
    left = frame_im.crop((0, 0, 1, fh))
    right = frame_im.crop((fw - 1, 0, fw, fh))
    for b in range(1, bleed + 1):
        atlas.paste(top, (dx, dy - b))
        atlas.paste(bot, (dx, dy + fh - 1 + b))
        atlas.paste(left, (dx - b, dy))
        atlas.paste(right, (dx + fw - 1 + b, dy))


def _pack_atlas(
    name: str,
    named_frames: list[tuple[str, Image.Image]],
    cols: int,
    atlas_json_path: Path,
    staging_png_path: Path,
) -> tuple[int, int]:
    """Pack uniform frames into Phaser JSON Hash atlas <= 2048x2048."""
    if not named_frames:
        raise ValueError(f"Empty atlas {name}")
    cw, ch = named_frames[0][1].size
    rows = (len(named_frames) + cols - 1) // cols
    step_w = cw + ATLAS_PAD
    step_h = ch + ATLAS_PAD
    sheet_w = ATLAS_PAD + cols * step_w
    sheet_h = ATLAS_PAD + rows * step_h
    if sheet_w > 2048 or sheet_h > 2048:
        raise RuntimeError(f"Atlas {name} exceeds 2048x2048 GPU budget: {sheet_w}x{sheet_h}")

    atlas_im = Image.new("RGBA", (sheet_w, sheet_h), (0, 0, 0, 0))
    frames_meta: dict[str, dict] = {}
    for idx, (frame_name, frame_im) in enumerate(named_frames):
        if frame_im.size != (cw, ch):
            raise RuntimeError(f"Non-uniform frame size in {name}: {frame_name} {frame_im.size} != {(cw, ch)}")
        col = idx % cols
        row = idx // cols
        dx = ATLAS_PAD + col * step_w
        dy = ATLAS_PAD + row * step_h
        _paste_with_bleed(atlas_im, frame_im, dx, dy, ATLAS_BLEED)
        frames_meta[frame_name] = {
            "frame": {"x": dx, "y": dy, "w": cw, "h": ch},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": cw, "h": ch},
            "sourceSize": {"w": cw, "h": ch},
        }

    staging_png_path.parent.mkdir(parents=True, exist_ok=True)
    arr = _zero_transparent_rgb(np.array(atlas_im))
    Image.fromarray(arr, "RGBA").save(staging_png_path, format="PNG", optimize=True, compress_level=9)

    atlas_json_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "frames": frames_meta,
        "meta": {
            "app": "archerlab-enemy-atlas-builder",
            "version": "1.0",
            "image": f"{name}.webp",
            "format": "RGBA8888",
            "size": {"w": sheet_w, "h": sheet_h},
            "scale": "1",
        },
    }
    atlas_json_path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    return sheet_w, sheet_h


def _emit_1to1_contrast_sheet(
    title: str,
    rows: list[list[Image.Image]],
    out_png: Path,
) -> None:
    """Render unscaled 1:1 3-color contrast PNG sheet (#181824, #FF00FF, #00FF00)."""
    bgs = ((24, 24, 36), (255, 0, 255), (0, 255, 0))
    cell_w, cell_h = rows[0][0].size
    cols = max(len(r) for r in rows)
    strip_w = cols * cell_w
    band_h = len(rows) * cell_h
    sheet = Image.new("RGB", (strip_w, band_h * len(bgs)), (24, 24, 36))

    for bg_idx, bg_rgb in enumerate(bgs):
        panel = Image.new("RGBA", (strip_w, band_h), (*bg_rgb, 255))
        for r_idx, row in enumerate(rows):
            for c_idx, frame in enumerate(row):
                panel.alpha_composite(frame, (c_idx * cell_w, r_idx * cell_h))
        sheet.paste(panel.convert("RGB"), (0, bg_idx * band_h))

    out_png.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_png, format="PNG", compress_level=6)


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build Solo Leveling enemy & boss motion atlases and VFX frames.")
    parser.add_argument("--scratch-dir", type=Path, default=DEFAULT_SCRATCH_DIR)
    args = parser.parse_args(list(argv) if argv is not None else None)

    scratch_dir: Path = args.scratch_dir
    atlases_png_dir = scratch_dir / "atlases_png"
    verify_dir = scratch_dir / "verify_sheets"
    atlases_dir = ROOT / "assets" / "atlases"

    unit_cache: dict[str, tuple[list[Image.Image], list[Image.Image]]] = {}
    total_audit_failures = 0

    # 1. Process all 10 enemies
    for atlas_name, enemy_keys in ENEMY_ATLAS_GROUPS.items():
        atlas_frames: list[tuple[str, Image.Image]] = []
        sheet_rows: list[list[Image.Image]] = []
        for enemy_key in enemy_keys:
            walk_src = ROOT / "assets" / "enemies" / "motion_sources" / enemy_key / "walk_right.png"
            atk_src = ROOT / "assets" / "enemies" / "motion_sources" / enemy_key / "attack_right.png"
            walk_frames, atk_frames, audits = _render_unit_poses(walk_src, atk_src, ENEMY_CELL_SIZE, enemy_key)
            unit_cache[enemy_key] = (walk_frames, atk_frames)
            for idx, frame in enumerate(walk_frames):
                atlas_frames.append((f"{enemy_key}_walk_{idx}", frame))
            for idx, frame in enumerate(atk_frames):
                atlas_frames.append((f"{enemy_key}_attack_{idx}", frame))
            sheet_rows.append(walk_frames + atk_frames)

            # Canonical static source (512x512 right-facing Pose 0)
            canon_im = _render_canonical_source(walk_src, enemy_key)
            canon_path = ROOT / "assets" / "enemies" / "source" / f"{enemy_key}.png"
            canon_path.parent.mkdir(parents=True, exist_ok=True)
            canon_im.save(canon_path, format="PNG", optimize=True, compress_level=9)

            bad = [a for a in audits if a["floating_islands"] or a["interior_holes"] or a["enclosed_pinholes"]]
            total_audit_failures += len(bad)
            print(f"[ENEMY] {enemy_key:15s} 8 frames OK | canonical={canon_path.name} (512x512)")

        sw, sh = _pack_atlas(
            atlas_name,
            atlas_frames,
            cols=8,
            atlas_json_path=atlases_dir / f"{atlas_name}.json",
            staging_png_path=atlases_png_dir / f"{atlas_name}.png",
        )
        print(f"[ATLAS] {atlas_name}: {sw}x{sh} ({len(atlas_frames)} frames)")
        _emit_1to1_contrast_sheet(atlas_name, sheet_rows, verify_dir / f"{atlas_name}_1to1.png")

    # 2. Process all 3 bosses
    boss_sheet_rows: list[list[Image.Image]] = []
    for boss_key in BOSS_KEYS:
        walk_src = ROOT / "assets" / "bosses" / "motion_sources" / boss_key / "walk_right.png"
        atk_src = ROOT / "assets" / "bosses" / "motion_sources" / boss_key / "attack_right.png"
        walk_frames, atk_frames, audits = _render_unit_poses(walk_src, atk_src, BOSS_CELL_SIZE, boss_key)
        boss_frames: list[tuple[str, Image.Image]] = []
        for idx, frame in enumerate(walk_frames):
            boss_frames.append((f"{boss_key}_walk_{idx}", frame))
        for idx, frame in enumerate(atk_frames):
            boss_frames.append((f"{boss_key}_attack_{idx}", frame))
        boss_sheet_rows.append(walk_frames + atk_frames)

        canon_im = _render_canonical_source(walk_src, boss_key)
        canon_path = ROOT / "assets" / "bosses" / "source" / f"{boss_key}.png"
        canon_path.parent.mkdir(parents=True, exist_ok=True)
        canon_im.save(canon_path, format="PNG", optimize=True, compress_level=9)

        atlas_name = f"boss_{boss_key}"
        sw, sh = _pack_atlas(
            atlas_name,
            boss_frames,
            cols=4,
            atlas_json_path=atlases_dir / f"{atlas_name}.json",
            staging_png_path=atlases_png_dir / f"{atlas_name}.png",
        )
        print(f"[BOSS] {boss_key:10s} 8 frames OK | atlas={sw}x{sh} | canonical={canon_path.name}")

    _emit_1to1_contrast_sheet("bosses_all", boss_sheet_rows, verify_dir / "bosses_all_1to1.png")

    # 3. Process 4 regenerated VFX strips into 6 centered 256x256 frames each
    vfx_sheet_rows: list[list[Image.Image]] = []
    for vfx_key in VFX_KEYS:
        strip_src = ROOT / "assets" / "effects" / "source" / "native_rgba" / f"{vfx_key}.png"
        frames = _build_vfx_six_frames(strip_src, vfx_key)
        vfx_out_dir = ROOT / "assets" / "effects" / "enemy_boss"
        vfx_out_dir.mkdir(parents=True, exist_ok=True)
        for idx, frame in enumerate(frames):
            out_png = vfx_out_dir / f"{vfx_key}_{idx}.png"
            frame.save(out_png, format="PNG", optimize=True, compress_level=9)
        vfx_sheet_rows.append(frames)
        print(f"[VFX] {vfx_key:20s} 6 centered 256x256 frames OK")

    _emit_1to1_contrast_sheet("vfx_regen_all", vfx_sheet_rows, verify_dir / "vfx_regen_all_1to1.png")

    if total_audit_failures > 0:
        raise RuntimeError(f"Detected {total_audit_failures} audit failures")
    print("[BUILD DONE] All sprites, atlases, VFX frames, and 1:1 contrast sheets built cleanly.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
