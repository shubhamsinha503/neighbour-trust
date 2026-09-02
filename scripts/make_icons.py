"""Generate the app icon set from the brand mark.

The mark is the same one the site header uses: a white "N" on the brand green
gradient. Drawn here rather than exported from a design tool so the icons stay in
step with globals.css — the two greens below are --color-brand-deep and
--color-brand-bright, and if those change this is the one place to update.

Android needs two shapes of the same icon and treats them differently:

  - **any** — drawn edge to edge, used where the launcher shows the icon as-is.
  - **maskable** — the launcher crops this to whatever shape the device uses
    (circle, squircle, rounded square, teardrop). Only the middle ~80% is
    guaranteed visible, so the mark is drawn smaller inside a full-bleed
    background. A non-maskable icon used as maskable gets its edges shaved off;
    a maskable icon used plain looks like it has too much padding. Both are
    provided rather than picking one and hoping.

Run: python -m scripts.make_icons
"""

from __future__ import annotations

import pathlib

from PIL import Image, ImageDraw, ImageFont

OUT = pathlib.Path("apps/web/public/icons")

BRAND_DEEP = (14, 90, 63)     # --color-brand-deep  #0e5a3f
BRAND_BRIGHT = (27, 175, 122)  # --color-brand-bright #1baf7a

# Android's maskable safe zone: the inner 80% of the canvas is always visible.
# The mark is sized against that rather than the full square.
MASKABLE_SAFE = 0.8


def gradient(size: int) -> Image.Image:
    """The header's 155° green gradient, approximated on the diagonal."""
    image = Image.new("RGB", (size, size))
    pixels = image.load()
    for y in range(size):
        for x in range(size):
            # Diagonal ramp, so the light corner sits bottom-right as on the web.
            t = (x + y) / (2 * size - 2)
            pixels[x, y] = tuple(
                round(BRAND_DEEP[i] + (BRAND_BRIGHT[i] - BRAND_DEEP[i]) * t)
                for i in range(3)
            )
    return image


def _font(px: int) -> ImageFont.FreeTypeFont:
    # DejaVu ships with Pillow, so this needs no system font and renders the
    # same on any machine that builds the icons.
    for name in ("DejaVuSans-Bold.ttf", "arialbd.ttf"):
        try:
            return ImageFont.truetype(name, px)
        except OSError:
            continue
    return ImageFont.load_default()


def draw_icon(size: int, *, maskable: bool) -> Image.Image:
    image = gradient(size)
    draw = ImageDraw.Draw(image)

    usable = size * (MASKABLE_SAFE if maskable else 0.92)
    font = _font(round(usable * 0.62))

    box = draw.textbbox((0, 0), "N", font=font)
    x = (size - (box[2] - box[0])) / 2 - box[0]
    y = (size - (box[3] - box[1])) / 2 - box[1]
    draw.text((x, y), "N", font=font, fill=(255, 255, 255))
    return image


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    written = []

    for size in (192, 512):
        path = OUT / f"icon-{size}.png"
        draw_icon(size, maskable=False).save(path, optimize=True)
        written.append(path)

        path = OUT / f"icon-maskable-{size}.png"
        draw_icon(size, maskable=True).save(path, optimize=True)
        written.append(path)

    # Apple devices ignore the manifest and read this one from the markup.
    path = OUT / "apple-touch-icon.png"
    draw_icon(180, maskable=False).save(path, optimize=True)
    written.append(path)

    # The browser tab favicon.
    icon = draw_icon(64, maskable=False)
    path = pathlib.Path("apps/web/public/favicon.ico")
    icon.save(path, sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    written.append(path)

    for path in written:
        print(f"  {path}  {path.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
