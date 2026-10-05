"""Derive every app icon from the one brand master.

The master is design/brand/nestra-icon-master.png — a white location pin with a
pink check notch, centred on a pink tile. It ships with rounded corners and white
outside them, which is wrong for an app icon: iOS, Android and the Play Store all
apply their own mask, so a pre-rounded source shows white slivers at the corners
once the platform re-rounds it. This script rebuilds the icon full-bleed on the
exact brand pink (#F72575, matching apps/mobile/src/theme.ts and the web
--color-brand token) and writes each surface at the size and shape it needs:

  mobile icon.png          full-bleed pink + pin   (iOS rounds it itself)
  mobile adaptive-icon.png pin on transparent      (Android supplies the pink bg)
  mobile splash-icon.png   rounded pink tile       (shown on the near-white splash)
  web icon-192/512.png     full-bleed pink + pin
  web icon-maskable-*.png  full-bleed pink + pin   (pin sits inside the safe zone)
  web apple-touch-icon.png full-bleed pink + pin
  web favicon.ico          16/32/48 multi-size
  play icon-512.png        full-bleed pink + pin

Re-run after replacing the master. Nothing here invents art; it only re-masks and
resizes the supplied design.

    python -m scripts.derive_icons
"""

from __future__ import annotations

import pathlib

from PIL import Image, ImageChops, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parents[1]
MASTER = ROOT / "design" / "brand" / "nestra-icon-master.png"

BRAND = (247, 37, 117)  # #F72575

# Android adaptive foreground must keep its content inside the central ~66% of
# the layer; everything outside can be cropped to the launcher's shape.
ADAPTIVE_SAFE = 0.66


def _pin_alpha(src: Image.Image) -> Image.Image:
    """An "L" mask for the white pin only — corners and the pink check excluded.

    The pin is white; so are the four rounded-off corners. Whiteness alone cannot
    tell them apart — but the corners (and the antialiased seam where the master's
    rounding meets the frame) are all connected to the image border, while the pin
    is an isolated island floating in pink. So take the white mask and flood-fill
    away everything reachable from the four corners; what remains is the pin. The
    pink check inside the pin is not white, so it stays transparent and shows
    whatever sits behind (pink), which is exactly the design.
    """
    w, h = src.size
    r, g, b = src.split()
    thr = (lambda v: 255 if v > 220 else 0)
    white = ImageChops.multiply(
        ImageChops.multiply(r.point(thr), g.point(thr)), b.point(thr)
    )

    for seed in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        if white.getpixel(seed):
            ImageDraw.floodfill(white, seed, 0, thresh=10)
    return white


def build() -> tuple[Image.Image, Image.Image]:
    """Return (full-bleed pink icon RGB, white pin on transparent RGBA)."""
    src = Image.open(MASTER).convert("RGB")
    alpha = _pin_alpha(src)
    size = src.size

    pin = Image.composite(
        Image.new("RGBA", size, (255, 255, 255, 255)),
        Image.new("RGBA", size, (255, 255, 255, 0)),
        alpha,
    )

    full = Image.new("RGBA", size, (*BRAND, 255))
    full.alpha_composite(pin)
    return full.convert("RGB"), pin


def _resize(img: Image.Image, n: int) -> Image.Image:
    return img.resize((n, n), Image.LANCZOS)


def _rounded(img: Image.Image, radius_frac: float = 0.22) -> Image.Image:
    w, h = img.size
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, w - 1, h - 1], radius=int(w * radius_frac), fill=255
    )
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


def _adaptive(pin: Image.Image, n: int) -> Image.Image:
    """Pin on transparent, scaled to the adaptive safe zone, centred."""
    cropped = pin.crop(pin.split()[-1].getbbox())
    target = int(n * ADAPTIVE_SAFE)
    scale = target / max(cropped.size)
    new = (max(1, round(cropped.size[0] * scale)), max(1, round(cropped.size[1] * scale)))
    cropped = cropped.resize(new, Image.LANCZOS)
    canvas = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    canvas.alpha_composite(cropped, ((n - new[0]) // 2, (n - new[1]) // 2))
    return canvas


def main() -> int:
    full, pin = build()
    bb = pin.split()[-1].getbbox()
    span = max(bb[2] - bb[0], bb[3] - bb[1]) / full.size[0]
    print(f"master {full.size}, pin spans {span:.0%} of the frame")

    mobile = ROOT / "apps" / "mobile" / "assets"
    web = ROOT / "apps" / "web" / "public" / "icons"
    play = ROOT / "design" / "play"

    _resize(full, 1024).save(mobile / "icon.png")
    _adaptive(pin, 1024).save(mobile / "adaptive-icon.png")
    _rounded(_resize(full, 1024)).save(mobile / "splash-icon.png")

    _resize(full, 192).save(web / "icon-192.png")
    _resize(full, 512).save(web / "icon-512.png")
    _resize(full, 192).save(web / "icon-maskable-192.png")
    _resize(full, 512).save(web / "icon-maskable-512.png")
    _resize(full, 180).save(web / "apple-touch-icon.png")

    _resize(full, 512).save(play / "icon-512.png")

    favicon = ROOT / "apps" / "web" / "public" / "favicon.ico"
    _resize(full, 48).save(favicon, sizes=[(16, 16), (32, 32), (48, 48)])

    print("wrote mobile (icon/adaptive/splash), web (5 + favicon), play icon")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
