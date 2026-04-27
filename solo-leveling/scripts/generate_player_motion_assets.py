from pathlib import Path
import math

from PIL import Image, ImageDraw, ImageEnhance


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


def up_hint(img):
    out = img.copy()
    draw = ImageDraw.Draw(out, "RGBA")
    draw.rectangle((35, 18, 61, 25), fill=(7, 10, 17, 148))
    draw.polygon([(32, 31), (64, 31), (70, 45), (26, 45)], fill=(18, 24, 38, 70))
    draw.line((35, 37, 61, 37), fill=(72, 91, 122, 82), width=1)
    return out


def side_hint(img, direction):
    sign = 1 if direction == "right" else -1
    out = affine(img, scale_x=0.9, scale_y=1.01, shear=-0.035 * sign, tx=2.0 * sign)
    draw = ImageDraw.Draw(out, "RGBA")
    draw.rectangle((39 if sign > 0 else 49, 18, 58 if sign > 0 else 56, 27), fill=(13, 17, 26, 110))
    return out


def add_ground_shadow(img, strength=70):
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(shadow, "RGBA")
    draw.ellipse((27, 116, 69, 125), fill=(3, 0, 12, strength))
    return Image.alpha_composite(shadow, img)


def save(name, img):
    OUT.mkdir(parents=True, exist_ok=True)
    img.save(OUT / name)


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
            sway = step * 1.9
            bob = -footfall * 1.9
            shear = step * 0.018
            frame = affine(
                base,
                scale_x=1 + footfall * 0.012,
                scale_y=1 - footfall * 0.015,
                shear=shear,
                rotate=step * 0.8,
                tx=sway,
                ty=bob,
            )

            if direction == "up":
                frame = up_hint(brighten(frame, 0.86))
            elif direction in ("left", "right"):
                frame = side_hint(frame, direction)
                if direction == "left":
                    frame = frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT)

            save(f"player_walk_{direction}_{i}.png", add_ground_shadow(frame, 62 + round(footfall * 8)))


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
    sheet.save(SHEET)


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
