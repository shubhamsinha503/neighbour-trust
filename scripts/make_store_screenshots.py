"""Turn raw app screenshots into framed, captioned Play Store screenshots.

Play allows (and good listings use) framed marketing shots: the real app screen
on a branded background with a one-line caption. This takes raw captures and
produces consistent, on-brand 1080x1920 (9:16) images — nothing invented, just
your actual screens presented well.

Capture the raw screens from the BUILT APK (not Expo Go — Expo Go overlays a dev
button that is not part of the app), drop them in design/play/screenshots/raw/
named 01.png, 02.png, … to control order, then:

    python -m scripts.make_store_screenshots

Captions are matched to files by order via CAPTIONS below; edit them to taste.
A screen with no caption is still framed. Output lands in
design/play/screenshots/framed/.
"""

from __future__ import annotations

import pathlib

from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / "design" / "play" / "screenshots" / "raw"
OUT = ROOT / "design" / "play" / "screenshots" / "framed"

# Play phone screenshot: 9:16 is safe and crisp. 1080x1920 is the sweet spot.
W, H = 1080, 1920

# Nestra brand. Background is a soft pink wash so the pink UI pops without
# clashing; the caption uses the ink colour from the app theme.
BRAND = (247, 37, 117)
BG_TOP = (255, 232, 242)
BG_BOTTOM = (255, 245, 250)
INK = (16, 33, 58)

# One caption per screen, in file order (01.png, 02.png, …). Honest and short —
# each describes what that screen actually shows. Trim or extend to match how
# many screenshots you ship.
CAPTIONS = [
    "Know a neighbourhood before you commit",
    "Every number shows its source",
    "Flood risk — flagged, dated and linked",
    "Air, schools, water and connectivity at a glance",
    "See the sun and shadow through the day",
    "Honest data in five languages",
]


def _font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    """A clean sans, falling back to PIL's default if no TTF is installed."""
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold
        else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold
        else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for path in candidates:
        if pathlib.Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def _gradient(w: int, h: int, top: tuple, bottom: tuple) -> Image.Image:
    base = Image.new("RGB", (w, h), top)
    for y in range(h):
        t = y / max(1, h - 1)
        base.paste(
            tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)),
            (0, y, w, y + 1),
        )
    return base


def _rounded(img: Image.Image, radius: int) -> Image.Image:
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, *img.size], radius=radius, fill=255)
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


def _wrap(draw: ImageDraw.ImageDraw, text: str, font, max_w: int) -> list[str]:
    words, lines, line = text.split(), [], ""
    for w in words:
        trial = f"{line} {w}".strip()
        if draw.textlength(trial, font=font) <= max_w:
            line = trial
        else:
            if line:
                lines.append(line)
            line = w
    if line:
        lines.append(line)
    return lines


def frame_one(shot: Image.Image, caption: str) -> Image.Image:
    canvas = _gradient(W, H, BG_TOP, BG_BOTTOM)
    draw = ImageDraw.Draw(canvas)

    # Caption block at the top.
    top_pad = 90
    cap_font = _font(58, bold=True)
    y = top_pad
    if caption:
        for line in _wrap(draw, caption, cap_font, W - 150):
            lw = draw.textlength(line, font=cap_font)
            draw.text(((W - lw) / 2, y), line, font=cap_font, fill=INK)
            y += 74
    y += 40

    # Scale the screenshot to fit the remaining space, keeping aspect.
    avail_h = H - y - 90
    avail_w = W - 180
    scale = min(avail_w / shot.width, avail_h / shot.height)
    sw, sh = max(1, round(shot.width * scale)), max(1, round(shot.height * scale))
    shot = shot.resize((sw, sh), Image.LANCZOS)

    framed = _rounded(shot, radius=48)
    x = (W - sw) // 2

    # Soft drop shadow so the screen lifts off the background.
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow)
    sdraw.rounded_rectangle([x, y + 10, x + sw, y + sh + 10], radius=48, fill=(16, 33, 58, 60))
    try:
        from PIL import ImageFilter

        shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    except Exception:
        pass
    canvas = Image.alpha_composite(canvas.convert("RGBA"), shadow)
    canvas.alpha_composite(framed, (x, y))
    return canvas.convert("RGB")


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    raws = sorted(RAW.glob("*.png")) + sorted(RAW.glob("*.jpg")) + sorted(RAW.glob("*.jpeg"))
    if not raws:
        print(f"No raw screenshots found in {RAW}. Drop 01.png, 02.png, … there first.")
        print("Capture them from the built APK (not Expo Go — it adds a dev button).")
        return 1
    for i, path in enumerate(raws):
        caption = CAPTIONS[i] if i < len(CAPTIONS) else ""
        shot = Image.open(path).convert("RGB")
        out = frame_one(shot, caption)
        dest = OUT / f"{i + 1:02d}.png"
        out.save(dest)
        print(f"  {path.name:20s} -> {dest.relative_to(ROOT)}  ({caption or 'no caption'})")
    print(f"\nWrote {len(raws)} framed screenshots to {OUT.relative_to(ROOT)}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
