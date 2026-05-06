from pathlib import Path
import math

from PIL import Image, ImageDraw, ImageEnhance

from image_formats import save_png_and_webp


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "player" / "player_idle.png"
OUT = ROOT / "assets" / "player" / "motion"
SHEET = ROOT / "assets" / "player" / "player_motion_sheet.png"
W, H = 96, 128


def resample():
    return Image.Resampling.BICUBIC


def load_base():
    img = Image.open(SRC).convert("RGBA")
    return img.resize((W, H), resample())


def affine(img, scale_x=1.0, scale_y=1.0, shear=0.0, rotate=0.0, tx=0.0, ty=0.0):
    work = Image.new("RGBA", (W * 2, H * 2), (0, 0, 0, 0))
    scaled = img.resize((round(W * scale_x), round(H * scale_y)), resample())
    if abs(shear) > 0.001:
        extra = int(abs(shear) * scaled.height) + 4
        sheared = Image.new("RGBA", (scaled.width + extra, scaled.height), (0, 0, 0, 0))
        matrix = (1, -shear, max(0, shear) * scaled.height, 0, 1, 0)
        scaled = scaled.transform(sheared.size, Image.Transform.AFFINE, matrix, resample())
    if abs(rotate) > 0.001:
        scaled = scaled.rotate(rotate, resample=resample(), expand=True)

    x = (work.width - scaled.width) // 2 + round(tx)
    y = (work.height - scaled.height) // 2 + round(ty)
    work.alpha_composite(scaled, (x, y))
    return work.crop((W // 2, H // 2, W // 2 + W, H // 2 + H))


def tint(img, color, alpha):
    overlay = Image.new("RGBA", img.size, (*color, alpha))
    out = Image.alpha_composite(img, overlay)
    out.putalpha(img.getchannel("A"))
    return out


def brighten(img, factor):
    rgb = ImageEnhance.Brightness(img.convert("RGB")).enhance(factor).convert("RGBA")
    rgb.putalpha(img.getchannel("A"))
    return rgb


def fade_alpha(img, factor):
    out = img.copy()
    alpha = out.getchannel("A").point(lambda v: int(v * factor))
    out.putalpha(alpha)
    return out


def crop_piece(img, box):
    return img.crop(box), box[0], box[1]


def paste_piece(canvas, piece, x, y, angle=0, tx=0, ty=0, scale=1.0, alpha=1.0):
    if scale != 1.0:
        piece = piece.resize((round(piece.width * scale), round(piece.height * scale)), resample())
    if alpha < 1.0:
        piece = fade_alpha(piece, alpha)

    rotated = piece.rotate(angle, resample=resample(), expand=True)
    px = round(x + tx - (rotated.width - piece.width) / 2)
    py = round(y + ty - (rotated.height - piece.height) / 2)
    canvas.alpha_composite(rotated, (px, py))


def make_core(base):
    core = base.copy()
    alpha = core.getchannel("A")
    draw = ImageDraw.Draw(alpha)
    for box in [(21, 35, 43, 90), (53, 35, 75, 90), (31, 70, 49, 126), (47, 70, 66, 126)]:
        overlay = Image.new("L", (W, H), 0)
        od = ImageDraw.Draw(overlay)
        od.rounded_rectangle(box, radius=4, fill=255)
        alpha = Image.composite(alpha.point(lambda v: int(v * 0.3)), alpha, overlay)
    core.putalpha(alpha)
    return core


def front_stride_frame(base, step, direction="down"):
    core = make_core(base)
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))

    left_arm, lax, lay = crop_piece(base, (20, 34, 43, 89))
    right_arm, rax, ray = crop_piece(base, (53, 34, 76, 89))
    left_leg, llx, lly = crop_piece(base, (30, 70, 49, 127))
    right_leg, rlx, rly = crop_piece(base, (47, 70, 67, 127))

    stride = math.sin(step)
    contact = abs(stride)
    rear_alpha = 0.74
    left_forward = stride >= 0

    # Back leg first, then core, then front leg and arms.
    if left_forward:
        paste_piece(canvas, right_leg, rlx, rly, angle=2.5, tx=1.2, ty=-1.2, scale=0.965, alpha=rear_alpha)
        canvas.alpha_composite(core, (0, round(-contact * 0.55)))
        paste_piece(canvas, left_leg, llx, lly, angle=-3.4, tx=-1.4, ty=1.5, scale=1.025)
        paste_piece(canvas, left_arm, lax, lay, angle=5.0, tx=-1.1, ty=-0.8, alpha=0.86)
        paste_piece(canvas, right_arm, rax, ray, angle=-7.0, tx=1.3, ty=1.4, scale=1.02)
    else:
        paste_piece(canvas, left_leg, llx, lly, angle=-2.5, tx=-1.2, ty=-1.2, scale=0.965, alpha=rear_alpha)
        canvas.alpha_composite(core, (0, round(-contact * 0.55)))
        paste_piece(canvas, right_leg, rlx, rly, angle=3.4, tx=1.4, ty=1.5, scale=1.025)
        paste_piece(canvas, right_arm, rax, ray, angle=-5.0, tx=1.1, ty=-0.8, alpha=0.86)
        paste_piece(canvas, left_arm, lax, lay, angle=7.0, tx=-1.3, ty=1.4, scale=1.02)

    if abs(stride) < 0.08:
        canvas = affine(base, scale_y=0.997, ty=0.2)

    if direction == "up":
        canvas = up_hint(brighten(canvas, 0.9))

    return canvas


def up_hint(img):
    return img


def side_hint(img, direction):
    sign = 1 if direction == "right" else -1
    out = affine(img, scale_x=0.92, scale_y=1.0, shear=-0.018 * sign, tx=1.0 * sign)
    return out


def add_ground_shadow(img, strength=70):
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(shadow, "RGBA")
    draw.ellipse((27, 116, 69, 125), fill=(3, 0, 12, strength))
    return Image.alpha_composite(shadow, img)


def save(name, img):
    OUT.mkdir(parents=True, exist_ok=True)
    save_png_and_webp(img, OUT / name)


def make_idle(base):
    for i in range(4):
        p = math.sin(i * math.tau / 4)
        frame = affine(base, scale_x=1 - p * 0.004, scale_y=1 + p * 0.012, ty=-p * 0.8)
        save(f"player_idle_{i}.png", add_ground_shadow(frame, 58))


def make_walk(base):
    directions = ("down", "right", "up", "left")
    for direction in directions:
        for i in range(4):
            phase = i * math.tau / 4
            step = math.sin(phase)
            footfall = abs(step)
            frame = front_stride_frame(base, phase, "up" if direction == "up" else "down")

            if direction in ("left", "right"):
                frame = side_hint(frame, direction)
                side_shift = step * (1.2 if direction == "right" else -1.2)
                frame = affine(frame, tx=side_shift, ty=-footfall * 0.25)
                if direction == "left":
                    frame = frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT)

            save(f"player_walk_{direction}_{i}.png", add_ground_shadow(frame, 54 + round(footfall * 5)))


def make_attack(base):
    specs = [
        (-0.06, 1.04, -4.5, -3, 0),
        (-0.02, 1.02, -8.0, -5, -1),
        (0.04, 0.98, 6.5, 4, -1),
        (0.07, 0.95, 9.0, 7, 0),
        (0.03, 0.98, 4.5, 3, 0),
        (0.00, 1.00, 0.0, 0, 0),
    ]
    for i, (sx_delta, sy, rot, tx, ty) in enumerate(specs):
        frame = affine(base, scale_x=1 + sx_delta, scale_y=sy, shear=-0.035 + i * 0.012, rotate=rot, tx=tx, ty=ty)
        if i in (2, 3):
            frame = brighten(frame, 1.08)
        save(f"player_attack_{i}.png", add_ground_shadow(frame, 66))


def make_hit(base):
    recoil = affine(base, scale_x=0.92, scale_y=1.08, shear=-0.04, rotate=-4.0, tx=-3, ty=1)
    recoil = tint(recoil, (255, 40, 40), 52)
    save("player_hit_0.png", add_ground_shadow(recoil, 70))
    save("player_hit_1.png", add_ground_shadow(base, 58))


def make_sheet():
    files = [
        *(f"player_idle_{i}.png" for i in range(4)),
        *(f"player_walk_down_{i}.png" for i in range(4)),
        *(f"player_walk_right_{i}.png" for i in range(4)),
        *(f"player_walk_up_{i}.png" for i in range(4)),
        *(f"player_walk_left_{i}.png" for i in range(4)),
        *(f"player_attack_{i}.png" for i in range(6)),
        *(f"player_hit_{i}.png" for i in range(2)),
    ]
    cols = 7
    sheet = Image.new("RGBA", (cols * W, math.ceil(len(files) / cols) * H), (0, 0, 0, 0))
    for idx, name in enumerate(files):
        frame = Image.open(OUT / name).convert("RGBA")
        sheet.alpha_composite(frame, ((idx % cols) * W, (idx // cols) * H))
    save_png_and_webp(sheet, SHEET)


def main():
    base = load_base()
    make_idle(base)
    make_walk(base)
    make_attack(base)
    make_hit(base)
    make_sheet()
    print(f"generated {len(list(OUT.glob('player_*.png')))} frames in {OUT}")
    print(f"sheet: {SHEET}")


if __name__ == "__main__":
    main()
