from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "ui" / "menu"


def rgba(hex_color: int, alpha: int = 255) -> tuple[int, int, int, int]:
    return (
        (hex_color >> 16) & 255,
        (hex_color >> 8) & 255,
        hex_color & 255,
        alpha,
    )


def panel_points(x: int, y: int, w: int, h: int, cut: int) -> list[tuple[int, int]]:
    cut = min(cut, w // 4, h // 4)
    return [
        (x + cut, y),
        (x + w - cut, y),
        (x + w, y + cut),
        (x + w, y + h - cut),
        (x + w - cut, y + h),
        (x + cut, y + h),
        (x, y + h - cut),
        (x, y + cut),
    ]


def draw_panel(
    size: tuple[int, int],
    name: str,
    border: int,
    accent: int,
    fill_top: int,
    fill_bottom: int,
    cut: int,
    glow: int,
    border_width: int = 3,
    scanlines: bool = True,
) -> None:
    w, h = size
    pad = max(glow + 8, border_width * 4)
    x, y = pad, pad
    pw, ph = w - pad * 2, h - pad * 2
    pts = panel_points(x, y, pw, ph, cut)

    img = Image.new("RGBA", size, (0, 0, 0, 0))
    glow_layer = Image.new("RGBA", size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow_layer)
    for width, alpha in [(glow, 60), (max(4, glow // 2), 78), (border_width + 2, 130)]:
        gd.line(pts + [pts[0]], fill=rgba(border, alpha), width=width, joint="curve")
    img.alpha_composite(glow_layer.filter(ImageFilter.GaussianBlur(max(1, glow // 3))))

    fill = Image.new("RGBA", size, (0, 0, 0, 0))
    fd = ImageDraw.Draw(fill)
    for row in range(ph + 1):
        t = row / max(ph, 1)
        c = tuple(
            int(rgba(fill_top)[i] * (1 - t) + rgba(fill_bottom)[i] * t)
            for i in range(3)
        )
        fd.line((x, y + row, x + pw, y + row), fill=(*c, 245))

    mask = Image.new("L", size, 0)
    md = ImageDraw.Draw(mask)
    md.polygon(pts, fill=255)
    fill.putalpha(mask)
    img.alpha_composite(fill)

    detail = Image.new("RGBA", size, (0, 0, 0, 0))
    dd = ImageDraw.Draw(detail)
    if scanlines:
        for sy in range(y + 10, y + ph, 8):
            dd.line((x + 8, sy, x + pw - 8, sy), fill=rgba(accent, 18), width=1)
        for sx in range(x + 28, x + pw, 72):
            dd.line((sx, y + 10, sx, y + ph - 10), fill=rgba(accent, 14), width=1)
    dd.rectangle((x + cut, y + 4, x + pw - cut, y + 7), fill=rgba(accent, 78))
    dd.rectangle((x + cut, y + ph - 7, x + pw - cut, y + ph - 4), fill=rgba(accent, 54))
    for dx, dy, sx, sy in [
        (x, y, 1, 1),
        (x + pw, y, -1, 1),
        (x + pw, y + ph, -1, -1),
        (x, y + ph, 1, -1),
    ]:
        dd.line((dx, dy + sy * cut, dx, dy + sy * (cut + 30)), fill=rgba(border, 220), width=border_width)
        dd.line((dx + sx * cut, dy, dx + sx * (cut + 30), dy), fill=rgba(border, 220), width=border_width)
    img.alpha_composite(detail)

    d = ImageDraw.Draw(img)
    d.line(pts + [pts[0]], fill=rgba(border, 230), width=border_width, joint="curve")
    inner = panel_points(x + 8, y + 8, pw - 16, ph - 16, max(0, cut - 8))
    d.line(inner + [inner[0]], fill=rgba(border, 74), width=1, joint="curve")

    img.save(OUT / f"{name}.png", optimize=True)


def draw_rank_card(name: str, border: int, accent: int, fill_top: int, fill_bottom: int) -> None:
    draw_panel((384, 256), name, border, accent, fill_top, fill_bottom, 30, 18, 3)
    img = Image.open(OUT / f"{name}.png").convert("RGBA")
    d = ImageDraw.Draw(img)
    d.ellipse((152, 34, 232, 114), outline=rgba(accent, 120), width=3)
    d.polygon([(192, 48), (204, 76), (235, 78), (211, 96), (220, 126), (192, 109), (164, 126), (173, 96), (149, 78), (180, 76)], fill=rgba(accent, 82))
    d.line((74, 196, 310, 196), fill=rgba(border, 86), width=2)
    img.save(OUT / f"{name}.png", optimize=True)


def draw_button(name: str, border: int, accent: int, fill_top: int, fill_bottom: int, hover: bool = False) -> None:
    draw_panel(
        (960, 160),
        name,
        border,
        accent,
        fill_top,
        fill_bottom,
        32,
        18 if not hover else 24,
        3 if not hover else 4,
    )
    img = Image.open(OUT / f"{name}.png").convert("RGBA")
    d = ImageDraw.Draw(img)
    alpha = 130 if hover else 86
    d.polygon([(92, 80), (126, 58), (126, 102)], fill=rgba(accent, alpha))
    d.polygon([(868, 80), (834, 58), (834, 102)], fill=rgba(accent, alpha))
    d.line((150, 80, 810, 80), fill=rgba(accent, 44 if hover else 30), width=2)
    img.save(OUT / f"{name}.png", optimize=True)


def icon_canvas(name: str, accent: int, draw_fn) -> None:
    size = 192
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((28, 28, 164, 164), outline=rgba(accent, 86), width=10)
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(9)))
    d = ImageDraw.Draw(img)
    d.ellipse((34, 34, 158, 158), fill=rgba(0x06101c, 225), outline=rgba(accent, 218), width=3)
    d.ellipse((48, 48, 144, 144), outline=rgba(0xffffff, 44), width=1)
    draw_fn(d, accent)
    img.save(OUT / f"{name}.png", optimize=True)


def draw_icons() -> None:
    icon_canvas("icon_play", 0x4DD2FF, lambda d, c: d.polygon([(76, 58), (76, 134), (132, 96)], fill=rgba(c, 235)))

    def resume(d: ImageDraw.ImageDraw, c: int) -> None:
        d.arc((58, 56, 136, 134), 35, 312, fill=rgba(c, 235), width=9)
        d.polygon([(120, 52), (147, 58), (130, 81)], fill=rgba(c, 235))
        d.rectangle((84, 74, 96, 118), fill=rgba(c, 210))
        d.rectangle((108, 74, 120, 118), fill=rgba(c, 210))

    icon_canvas("icon_resume", 0xE8B64A, resume)

    def ranking(d: ImageDraw.ImageDraw, c: int) -> None:
        d.rectangle((58, 98, 76, 126), fill=rgba(0xD18B4A, 230))
        d.rectangle((88, 76, 106, 126), fill=rgba(0xE8B64A, 240))
        d.rectangle((118, 90, 136, 126), fill=rgba(0xCFD8E8, 230))
        d.line((52, 130, 142, 130), fill=rgba(c, 220), width=4)
        d.polygon([(97, 47), (106, 66), (128, 67), (111, 80), (117, 101), (97, 89), (77, 101), (83, 80), (66, 67), (88, 66)], fill=rgba(0xE8B64A, 160))

    icon_canvas("icon_ranking", 0xE8B64A, ranking)

    def mail(d: ImageDraw.ImageDraw, c: int) -> None:
        d.rounded_rectangle((52, 68, 140, 124), radius=8, outline=rgba(c, 235), width=5, fill=rgba(0x081522, 170))
        d.line((56, 72, 96, 100, 136, 72), fill=rgba(c, 235), width=4)

    icon_canvas("icon_mail", 0x4DD2FF, mail)

    def chat(d: ImageDraw.ImageDraw, c: int) -> None:
        d.rounded_rectangle((50, 58, 142, 120), radius=24, fill=rgba(0xE8B64A, 230))
        d.polygon([(78, 116), (65, 142), (100, 121)], fill=rgba(0xE8B64A, 230))
        for x in (78, 96, 114):
            d.ellipse((x - 4, 86, x + 4, 94), fill=rgba(0x06101C, 210))

    icon_canvas("icon_kakao", 0xE8B64A, chat)

    def loading(d: ImageDraw.ImageDraw, c: int) -> None:
        d.arc((54, 54, 138, 138), 18, 156, fill=rgba(c, 245), width=8)
        d.arc((66, 66, 126, 126), 204, 342, fill=rgba(0xE8B64A, 220), width=7)
        d.ellipse((88, 88, 104, 104), fill=rgba(0xFFFFFF, 210))

    icon_canvas("icon_loading_core", 0x4DD2FF, loading)

    def empty(d: ImageDraw.ImageDraw, c: int) -> None:
        d.rounded_rectangle((62, 48, 130, 140), radius=8, outline=rgba(c, 225), width=5, fill=rgba(0x081522, 180))
        for y in (76, 96, 116):
            d.line((76, y, 116, y), fill=rgba(c, 132), width=4)
        d.line((72, 56, 124, 132), fill=rgba(0x5A6C7A, 180), width=5)

    icon_canvas("icon_empty_record", 0x5A6C7A, empty)

    def error(d: ImageDraw.ImageDraw, c: int) -> None:
        d.polygon([(96, 48), (144, 96), (96, 144), (48, 96)], fill=rgba(c, 182), outline=rgba(0xFFFFFF, 70))
        d.rectangle((91, 72, 101, 108), fill=rgba(0x02040A, 235))
        d.rectangle((91, 118, 101, 128), fill=rgba(0x02040A, 235))

    icon_canvas("icon_error", 0xFF3344, error)


def draw_preload() -> None:
    icon_canvas("preload_core", 0x4DD2FF, lambda d, c: (
        d.arc((52, 52, 140, 140), 10, 135, fill=rgba(c, 240), width=8),
        d.arc((52, 52, 140, 140), 190, 315, fill=rgba(0xE8B64A, 220), width=8),
        d.polygon([(96, 56), (126, 96), (96, 136), (66, 96)], outline=rgba(c, 210)),
        d.ellipse((86, 86, 106, 106), fill=rgba(0xFFFFFF, 220)),
    ))
    draw_panel((768, 96), "preload_bar_frame", 0x4DD2FF, 0x4DD2FF, 0x07111D, 0x02050A, 22, 14, 3, False)

    img = Image.new("RGBA", (768, 48), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for x in range(768):
        t = x / 767
        color = (
            int(0x26 * (1 - t) + 0xE8 * t),
            int(0xB8 * (1 - t) + 0xB6 * t),
            int(0xFF * (1 - t) + 0x4A * t),
            236,
        )
        d.line((x, 8, x, 40), fill=color)
    d.rectangle((0, 8, 767, 40), outline=rgba(0xFFFFFF, 72), width=2)
    d.line((10, 16, 758, 16), fill=rgba(0xFFFFFF, 92), width=2)
    img.save(OUT / "preload_bar_fill.png", optimize=True)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    draw_panel((512, 256), "hunter_card_normal", 0x1F5C8F, 0x4DD2FF, 0x0C1B2A, 0x030711, 26, 16, 2)
    draw_panel((512, 256), "hunter_card_selected", 0x4DD2FF, 0xE8B64A, 0x102338, 0x040814, 26, 22, 3)
    draw_panel((1024, 768), "modal_frame_cyan", 0x4DD2FF, 0x4DD2FF, 0x081523, 0x02050C, 42, 24, 3)
    draw_panel((1024, 768), "modal_frame_gold", 0xE8B64A, 0xE8B64A, 0x181104, 0x030407, 42, 24, 3)
    draw_rank_card("rank_card_1", 0xE8B64A, 0xFFD36A, 0x241808, 0x050608)
    draw_rank_card("rank_card_2", 0xCFD8E8, 0x4DD2FF, 0x101827, 0x040812)
    draw_rank_card("rank_card_3", 0xD18B4A, 0xFF9D4A, 0x20100A, 0x050608)
    draw_button("start_button_primary_wide", 0x4DD2FF, 0x4DD2FF, 0x102B42, 0x04101C)
    draw_button("start_button_primary_wide_hover", 0x8CEBFF, 0x4DD2FF, 0x183E5F, 0x061424, True)
    draw_button("start_button_secondary_wide", 0xE8B64A, 0xE8B64A, 0x231808, 0x050608)
    draw_button("start_button_secondary_wide_hover", 0xFFD36A, 0xE8B64A, 0x35250C, 0x070708, True)
    draw_icons()
    draw_preload()
    print(f"Generated menu polish assets in {OUT}")


if __name__ == "__main__":
    main()
