"""Generate the Play Store feature graphic.

1024x500, no alpha — Google's required size, and the first thing anyone sees on
the listing.

Two decisions worth stating:

**It shows a result, not a logo.** A feature graphic that is a wordmark on a
gradient tells a browser nothing they cannot get from the app icon two
centimetres away. The right half is a real search result — a score, what the
score covers, and a flag — so the graphic demonstrates the product rather than
announcing it. The numbers are from Koramangala's live report.

**Text stays inside a margin.** Play crops and overlays this differently across
surfaces (search results, the listing header, promotional slots), so nothing that
must be read sits near an edge.

Colours and the mark come from apps/web/app/globals.css, same as the app icons.

Run: python -m scripts.make_feature_graphic
"""

from __future__ import annotations

import pathlib

from PIL import Image, ImageDraw, ImageFont

OUT = pathlib.Path("design/play/feature-graphic.png")

W, H = 1024, 500
MARGIN = 56  # keeps content clear of Play's cropping

BRAND_DEEP = (14, 90, 63)      # --color-brand-deep
BRAND_BRIGHT = (27, 175, 122)  # --color-brand-bright
WHITE = (255, 255, 255)
SURFACE = (252, 252, 251)      # --color-surface-1
INK = (11, 11, 11)             # --color-ink-primary
INK_SECOND = (82, 81, 78)      # --color-ink-secondary
INK_MUTED = (137, 135, 129)    # --color-ink-muted
FLAG_RED = (192, 68, 44)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    """A real UI font where one exists, DejaVu otherwise.

    Segoe UI is what the app renders in on Windows via the system font stack, so
    the graphic matches what a screenshot of the app will look like beside it.
    """
    candidates = (
        ["segoeuib.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf"]
        if bold
        else ["segoeui.ttf", "arial.ttf", "DejaVuSans.ttf"]
    )
    for name in candidates:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def background() -> Image.Image:
    image = Image.new("RGB", (W, H))
    pixels = image.load()
    for y in range(H):
        for x in range(W):
            # Diagonal ramp, light toward the bottom-right, as in the app's hero.
            t = (x / W * 0.72) + (y / H * 0.28)
            pixels[x, y] = tuple(
                round(BRAND_DEEP[i] + (BRAND_BRIGHT[i] - BRAND_DEEP[i]) * t)
                for i in range(3)
            )
    return image


def map_lines(draw: ImageDraw.ImageDraw) -> None:
    """The same faint street grid the app header uses."""
    lines = [
        ((0, 120), (W, 168), 5), ((0, 372), (W, 322), 5),
        ((150, 0), (232, H), 3), ((640, 0), (566, H), 3),
        ((0, 250), (W, 236), 2),
    ]
    for start, end, width in lines:
        draw.line([start, end], fill=(255, 255, 255, 0), width=width)
    # PIL has no per-shape alpha on RGB, so draw onto an overlay instead.


def with_map_lines(image: Image.Image) -> Image.Image:
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    for start, end, width in [
        ((0, 96), (W, 138), 4), ((0, 404), (W, 356), 4),
        ((828, 0), (902, H), 3),
    ]:
        d.line([start, end], fill=(255, 255, 255, 34), width=width)
    return Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")


# The card's left edge, so the text column can be sized against it rather than
# guessed at. The headline overran it on the first attempt.
CARD_W = 384
CARD_X = W - MARGIN - CARD_W
TEXT_MAX = CARD_X - MARGIN - 40  # 40px gutter between the two halves


def fit_font(draw, text: str, start: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    """Largest size at which `text` fits the text column.

    Measured rather than chosen. The headline is the one line that must not wrap
    or collide, and its width depends on which font the machine actually has.
    """
    for size in range(start, 18, -1):
        f = font(size, bold=bold)
        if draw.textlength(text, font=f) <= TEXT_MAX:
            return f
    return font(18, bold=bold)


def rounded(draw: ImageDraw.ImageDraw, box, radius: int, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def draw_mark(draw: ImageDraw.ImageDraw, x: int, y: int, size: int) -> None:
    rounded(draw, (x, y, x + size, y + size), radius=size // 4, fill=(255, 255, 255, 255))
    f = font(round(size * 0.6), bold=True)
    box = draw.textbbox((0, 0), "N", font=f)
    draw.text(
        (x + (size - (box[2] - box[0])) / 2 - box[0],
         y + (size - (box[3] - box[1])) / 2 - box[1]),
        "N", font=f, fill=BRAND_DEEP,
    )


def draw_result_card(image: Image.Image) -> None:
    """A real search result, rendered as the app renders it."""
    card_w, card_h = CARD_W, 132
    x = CARD_X
    y = (H - card_h) // 2

    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    # Soft shadow so the card reads as lifted off the gradient.
    for i in range(14, 0, -1):
        d.rounded_rectangle(
            (x - i, y - i + 5, x + card_w + i, y + card_h + i + 5),
            radius=26 + i, fill=(0, 0, 0, 5),
        )
    d.rounded_rectangle((x, y, x + card_w, y + card_h), radius=24, fill=SURFACE + (255,))

    # Score chip.
    chip = 62
    cx, cy = x + 26, y + 26
    d.rounded_rectangle(
        (cx, cy, cx + chip, cy + chip), radius=16,
        fill=(BRAND_BRIGHT[0], BRAND_BRIGHT[1], BRAND_BRIGHT[2], 34),
    )
    f_score = font(30, bold=True)
    box = d.textbbox((0, 0), "94", font=f_score)
    d.text(
        (cx + (chip - (box[2] - box[0])) / 2 - box[0],
         cy + (chip - (box[3] - box[1])) / 2 - box[1]),
        "94", font=f_score, fill=BRAND_DEEP + (255,),
    )
    f_tiny = font(11)
    d.text((cx - 3, cy + chip + 7), "air+schools", font=f_tiny, fill=INK_MUTED + (255,))

    # Name, city, flag — the same three things the app shows.
    tx = cx + chip + 22
    d.text((tx, y + 27), "Koramangala", font=font(23, bold=True), fill=INK + (255,))
    name_w = d.textbbox((0, 0), "Koramangala", font=font(23, bold=True))[2]
    d.text((tx + name_w + 12, y + 33), "Bengaluru", font=font(15), fill=INK_MUTED + (255,))

    d.ellipse((tx + 2, y + 71, tx + 11, y + 80), fill=FLAG_RED + (255,))
    d.text((tx + 20, y + 66), "Violence reported", font=font(16), fill=INK_SECOND + (255,))
    d.text((tx + 20, y + 89), "in local press (4 of 12)", font=font(16),
           fill=INK_SECOND + (255,))

    image.paste(Image.alpha_composite(image.convert("RGBA"), layer).convert("RGB"), (0, 0))


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)

    image = with_map_lines(background())
    draw = ImageDraw.Draw(image, "RGBA")

    draw_mark(draw, MARGIN, MARGIN, 52)
    draw.text((MARGIN + 68, MARGIN + 12), "Neighbour Trust",
              font=font(26, bold=True), fill=WHITE)

    # The full promise, not the punchy half of it. "Know the neighbourhood" alone
    # describes a category; "before you commit to it" is the reason someone opens
    # the app, and it is worth several points of type size.
    head_a, head_b = "Know the neighbourhood", "before you commit to it."
    f_head = min(
        (fit_font(draw, head_a, 52), fit_font(draw, head_b, 52)),
        key=lambda f: f.size,
    )
    line_h = round(f_head.size * 1.12)
    top = 176
    draw.text((MARGIN, top), head_a, font=f_head, fill=WHITE)
    draw.text((MARGIN, top + line_h), head_b, font=f_head, fill=WHITE)

    y = top + line_h * 2 + 24
    for text, size, alpha in (
        ("Air quality, schools, safety and water for", 20, 228),
        ("44 localities in Bengaluru and Gurugram.", 20, 228),
        ("", 8, 0),
        ("Every number says where it came from, how", 17, 170),
        ("old it is, and how much to trust it.", 17, 170),
    ):
        if text:
            f = fit_font(draw, text, size, bold=False)
            draw.text((MARGIN, y), text, font=f, fill=(255, 255, 255, alpha))
        y += round(size * 1.5)

    draw_result_card(image)

    # No alpha: Play rejects a feature graphic with a transparency channel.
    image.convert("RGB").save(OUT, "PNG", optimize=True)
    print(f"{OUT}  {image.size[0]}x{image.size[1]}  {OUT.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
