"""Generate Nestra's app icons, splash mark and Play Store graphics.

The native app (apps/mobile) shipped with no launcher icon, so Expo fell back to
its default. This draws the real set from the brand tokens in
apps/mobile/src/theme.ts — brand #F72575, brandDeep #D91361, ink #10213A — so the
icon, splash and store art all match the app and each other, and regenerating is
one command rather than a trip through a design tool.

Outputs:
  apps/mobile/assets/icon.png            1024, full-bleed pink, white N (iOS + base)
  apps/mobile/assets/adaptive-icon.png   1024, white N on transparent (Android
                                         adaptive foreground; bg colour in app.json)
  apps/mobile/assets/splash-icon.png     1024, rounded pink tile + white N, for the
                                         light splash background
  design/play/icon-512.png               512, full-bleed, the Play listing icon
  design/play/feature-graphic.png        1024x500, the Play feature graphic

The feature graphic deliberately shows NO numeric score. The product's whole
claim is that it never presents an invented figure as fact, so the store art
shows what the app is honest about — each category tagged with its real source —
rather than a made-up "94".

Run: python -m scripts.make_nestra_assets
"""

from __future__ import annotations

import pathlib

from PIL import Image, ImageDraw, ImageFont

# Brand tokens, from apps/mobile/src/theme.ts.
BRAND = (247, 37, 117)       # #F72575
BRAND_DEEP = (217, 19, 97)   # #D91361
INK = (16, 33, 58)           # #10213A
INK_MUTED = (120, 128, 140)
WHITE = (255, 255, 255)
SURFACE = (255, 255, 255)
PAGE = (251, 251, 250)       # splash background (#FBFBFA)

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def vgradient(w: int, h: int, top: tuple, bottom: tuple) -> Image.Image:
    """Vertical gradient, drawn a row at a time (fast, no per-pixel loop)."""
    image = Image.new("RGB", (w, h))
    draw = ImageDraw.Draw(image)
    for y in range(h):
        t = y / max(1, h - 1)
        draw.line(
            [(0, y), (w, y)],
            fill=tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)),
        )
    return image


def centered_text(draw, cx, cy, text, fnt, fill):
    box = draw.textbbox((0, 0), text, font=fnt)
    draw.text(
        (cx - (box[2] - box[0]) / 2 - box[0], cy - (box[3] - box[1]) / 2 - box[1]),
        text, font=fnt, fill=fill,
    )


def app_icon(size: int) -> Image.Image:
    """Full-bleed pink gradient with a white N. Used for iOS, legacy Android, Play."""
    image = vgradient(size, size, BRAND, BRAND_DEEP)
    draw = ImageDraw.Draw(image)
    centered_text(draw, size / 2, size / 2, "N", font(FONT_BOLD, round(size * 0.6)), WHITE)
    return image


def adaptive_foreground(size: int) -> Image.Image:
    """White N on transparent, kept inside the adaptive safe zone (~62%)."""
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    centered_text(draw, size / 2, size / 2, "N", font(FONT_BOLD, round(size * 0.42)),
                  WHITE + (255,))
    return image


def splash_mark(size: int) -> Image.Image:
    """A rounded pink tile with a white N, on transparent, for the light splash."""
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    pad = round(size * 0.28)
    tile = vgradient(size - 2 * pad, size - 2 * pad, BRAND, BRAND_DEEP).convert("RGBA")
    mask = Image.new("L", tile.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, tile.size[0], tile.size[1]), radius=round(tile.size[0] * 0.24), fill=255
    )
    image.paste(tile, (pad, pad), mask)
    centered_text(draw, size / 2, size / 2, "N", font(FONT_BOLD, round(size * 0.3)),
                  WHITE + (255,))
    return image


# --- Feature graphic -------------------------------------------------------

W, H = 1024, 500
MARGIN = 56


def feature_graphic() -> Image.Image:
    image = vgradient(W, H, BRAND, BRAND_DEEP)
    # Faint map lines, like the app header.
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for a, b, wdt in [((0, 96), (W, 150), 4), ((0, 410), (W, 356), 4), ((300, 0), (380, H), 3)]:
        od.line([a, b], fill=(255, 255, 255, 30), width=wdt)
    image = Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")
    draw = ImageDraw.Draw(image, "RGBA")

    # Wordmark: rounded white tile + pink N, then "Nestra".
    tile = 54
    tx, ty = MARGIN, MARGIN
    draw.rounded_rectangle((tx, ty, tx + tile, ty + tile), radius=16, fill=WHITE + (255,))
    centered_text(draw, tx + tile / 2, ty + tile / 2, "N", font(FONT_BOLD, 34), BRAND + (255,))
    draw.text((tx + tile + 16, ty + 10), "Nestra", font=font(FONT_BOLD, 30), fill=WHITE)

    # Headline + subline (left column, clear of the right card).
    draw.text((MARGIN, 168), "Know here you live", font=font(FONT_BOLD, 46), fill=WHITE)
    for i, line in enumerate((
        "Sourced, dated neighbourhood data for",
        "Indian home buyers. Every number shows",
        "where it came from and how old it is.",
    )):
        draw.text((MARGIN, 248 + i * 34), line, font=font(FONT_REG, 21), fill=(255, 255, 255, 235))

    # Right card: category rows tagged with their real sources. No score.
    card_w, card_h = 372, 300
    cx = W - MARGIN - card_w
    cy = (H - card_h) // 2
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    for i in range(16, 0, -1):
        ld.rounded_rectangle((cx - i, cy - i + 5, cx + card_w + i, cy + card_h + i + 5),
                             radius=24 + i, fill=(0, 0, 0, 4))
    ld.rounded_rectangle((cx, cy, cx + card_w, cy + card_h), radius=24, fill=SURFACE + (255,))
    ld.text((cx + 26, cy + 22), "Koramangala", font=font(FONT_BOLD, 24), fill=INK + (255,))
    ld.text((cx + 26, cy + 56), "Bengaluru", font=font(FONT_REG, 16), fill=INK_MUTED + (255,))

    rows = [
        ("Air quality", "CPCB · OpenAQ"),
        ("Schools", "UDISE · OpenStreetMap"),
        ("Connectivity", "OpenStreetMap"),
        ("Safety signals", "local press"),
    ]
    ry = cy + 96
    for label, src in rows:
        ld.ellipse((cx + 26, ry + 6, cx + 36, ry + 16), fill=BRAND + (255,))
        ld.text((cx + 48, ry), label, font=font(FONT_BOLD, 17), fill=INK + (255,))
        ld.text((cx + 48, ry + 23), src, font=font(FONT_REG, 13), fill=INK_MUTED + (255,))
        ry += 50
    image = Image.alpha_composite(image.convert("RGBA"), layer).convert("RGB")
    return image


def main() -> None:
    assets = pathlib.Path("apps/mobile/assets")
    play = pathlib.Path("design/play")
    assets.mkdir(parents=True, exist_ok=True)
    play.mkdir(parents=True, exist_ok=True)

    written = []
    app_icon(1024).save(assets / "icon.png", optimize=True); written.append(assets / "icon.png")
    adaptive_foreground(1024).save(assets / "adaptive-icon.png", optimize=True)
    written.append(assets / "adaptive-icon.png")
    splash_mark(1024).save(assets / "splash-icon.png", optimize=True)
    written.append(assets / "splash-icon.png")
    app_icon(512).save(play / "icon-512.png", optimize=True); written.append(play / "icon-512.png")
    feature_graphic().save(play / "feature-graphic.png", optimize=True)
    written.append(play / "feature-graphic.png")

    for p in written:
        print(f"  {p}  {p.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
