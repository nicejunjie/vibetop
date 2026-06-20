#!/usr/bin/env python3
"""Generate the PWA / home-screen icons for the mini-OS desktop.

Design: a 2x2 "launcher" grid of rounded tiles in the app accent colors
(orange/green/blue/purple — the same per-app accents the taskbar uses) on
the dark theme background. Reads instantly as "apps/desktop" at small sizes.

Rendered at 4x supersample then downscaled (LANCZOS) for smooth corners.
Re-run after changing the design:  python3 generate-icons.py
"""
import os
from PIL import Image, ImageDraw

BG = (14, 17, 23)          # #0e1117 — body background
TILES = [
    (210, 105, 30),        # #d2691e orange  (Start / Home accent)
    (51, 170, 85),         # #33aa55 green   (Terminal)
    (58, 122, 219),        # #3a7adb blue    (Browser)
    (138, 74, 219),        # #8a4adb purple  (Files)
]
SS = 4                     # supersample factor

HERE = os.path.dirname(os.path.abspath(__file__))


def render(size, margin_frac, maskable=False):
    """Return an RGBA icon of `size` px. `margin_frac` is the padding around
    the grid as a fraction of the side (bigger for maskable, to stay inside
    the platform's safe zone)."""
    S = size * SS
    img = Image.new("RGBA", (S, S), BG + (255,))
    d = ImageDraw.Draw(img)

    m = int(S * margin_frac)
    grid = S - 2 * m
    gap = int(S * 0.05)
    tile = (grid - gap) // 2
    rad = int(tile * 0.26)

    for i, color in enumerate(TILES):
        col, row = i % 2, i // 2
        x0 = m + col * (tile + gap)
        y0 = m + row * (tile + gap)
        d.rounded_rectangle([x0, y0, x0 + tile, y0 + tile], radius=rad, fill=color + (255,))

    if not maskable:
        # Subtle rounded vignette so the full-bleed square reads as a tile on
        # platforms that don't mask it (the apple-touch-icon is masked by iOS).
        pass

    return img.resize((size, size), Image.LANCZOS)


def main():
    outputs = [
        ("apple-touch-icon.png", 180, 0.17, False),
        ("icon-192.png", 192, 0.17, False),
        ("icon-512.png", 512, 0.17, False),
        ("icon-512-maskable.png", 512, 0.28, True),   # extra padding for the safe zone
    ]
    for name, size, margin, maskable in outputs:
        img = render(size, margin, maskable)
        path = os.path.join(HERE, name)
        img.save(path)
        print(f"wrote {name} ({size}x{size})")

    # favicon.ico — a multi-size ICO (16/32/48) for browser tabs/bookmarks. Use
    # a small margin so the 2x2 grid still reads at 16px.
    fav = render(64, 0.06)
    fav.save(os.path.join(HERE, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])
    print("wrote favicon.ico (16/32/48)")


if __name__ == "__main__":
    main()
