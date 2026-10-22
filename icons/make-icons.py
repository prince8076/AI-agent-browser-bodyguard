#!/usr/bin/env python3
"""Generate toolbar PNG icons for AI Agent Browser Bodyguard.

The repo stays TEXT-ONLY (GitHub snapshot pushes reject binaries), so run
this once after cloning:

    pip install pillow
    python icons/make-icons.py

It draws a flat amethyst hex-shield + cyan bolt and writes
icons/icon16.png, icons/icon48.png, icons/icon128.png
next to this script (paths referenced by manifest.json).
"""

from PIL import Image, ImageDraw

AMETHYST = (139, 92, 246, 255)
CYAN = (0, 229, 255, 255)


def draw_shield(draw, s):
    w = h = s
    shield = [
        (w * 0.50, h * 0.05),
        (w * 0.89, h * 0.24),
        (w * 0.89, h * 0.55),
        (w * 0.50, h * 0.95),
        (w * 0.11, h * 0.55),
        (w * 0.11, h * 0.24),
    ]
    draw.polygon(shield, fill=AMETHYST)
    bolt = [
        (w * 0.56, h * 0.27),
        (w * 0.37, h * 0.55),
        (w * 0.48, h * 0.55),
        (w * 0.44, h * 0.75),
        (w * 0.63, h * 0.46),
        (w * 0.52, h * 0.46),
    ]
    draw.polygon(bolt, fill=CYAN)


def main():
    import os

    out_dir = os.path.dirname(os.path.abspath(__file__))
    for size in (16, 48, 128):
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        draw_shield(ImageDraw.Draw(img), size)
        path = os.path.join(out_dir, f"icon{size}.png")
        img.save(path)
        print("wrote", path)


if __name__ == "__main__":
    main()
