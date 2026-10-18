"""Draw the extension icon from the palette definitions.

The icon is the name set in two rows, DEEP over JSON, with the second row
colored a level at a time. It is generated rather than drawn by hand for the
same reason the themes and the screenshots are: the colors in it are the
colors the extension actually ships, and they cannot drift from them.

Three things in it are deliberate.

Monokai Neon supplies the ramp. Its accents are the palette's full-strength
ones, which is what survives being scaled to the 42 pixels the extensions list
gives an icon; the pastel palettes turn to mush at that size.

The font is monospace, so DEEP and JSON are exactly the same width and their
letters line up in a 2x4 grid. A proportional face breaks that alignment and the
two rows stop reading as a block.

Only the second row is colored. Spreading the ramp across all eight letters is
louder but harder to read, because the eye lands on whichever letter happens to
be brightest rather than at the start of the word.

The result is checked in, so building the extension does not need Pillow or the
font; only regenerating does.

Run:  python dev/make_icon.py
Writes images/icon.png at 256x256.

Copyright (C) 2026 Lance Duvall
SPDX-License-Identifier: AGPL-3.0-or-later
Project: <https://github.com/lanz/vscode-deep-json>
Licensed under the GNU Affero General Public License, version 3 or later.
See LICENSE, or <https://www.gnu.org/licenses/>.
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import palettes as P  # noqa: E402

OUT = os.path.join(os.path.dirname(HERE), "images", "icon.png")

# Drawn large and reduced, so the corner radius and the glyph edges come out
# smooth instead of stair-stepped.
SIZE = 256
SCALE = 4

ROWS = ("DEEP", "JSON")
CORNER = 0.16      # of the canvas
WIDTH = 0.80       # how much of the canvas one row spans
GAP = 0.06         # between the rows

# A bold monospace face, by the names the usual platforms give one.
FONTS = (
    r"C:\Windows\Fonts\consolab.ttf",
    "/Library/Fonts/Menlo.ttc",
    "/System/Library/Fonts/Menlo.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf",
)


def font_path():
    for path in FONTS:
        if os.path.exists(path):
            return path
    raise SystemExit(
        "No bold monospace font found. Looked for:\n  "
        + "\n  ".join(FONTS)
        + "\nPass another by editing FONTS in this file."
    )


def build():
    palette = next(t for t in P.THEMES if t["name"] == "Monokai Neon")
    background = palette["ui"]["editor.background"]
    levels = palette["levels"]

    big = SIZE * SCALE
    image = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(
        [0, 0, big - 1, big - 1], radius=int(CORNER * big), fill=background
    )

    # Size the face so one row spans WIDTH of the canvas. Measured rather than
    # assumed, since a face's advance per character is its own business.
    path = font_path()
    probe = ImageFont.truetype(path, int(big * 0.30))
    advance = draw.textlength("D", font=probe)
    face = ImageFont.truetype(
        path, int(big * 0.30 * (big * WIDTH) / (advance * len(ROWS[0])))
    )
    advance = draw.textlength("D", font=face)

    cap = draw.textbbox((0, 0), "D", font=face)
    height = cap[3] - cap[1]
    gap = big * GAP
    top = (big - (height * len(ROWS) + gap * (len(ROWS) - 1))) / 2

    used = []
    for row, word in enumerate(ROWS):
        x = (big - advance * len(word)) / 2
        y = top + row * (height + gap)
        for column, letter in enumerate(word):
            # white for the name, a level per letter for the language
            color = levels[0] if row == 0 else levels[column + 1]
            used.append(color)
            box = draw.textbbox((0, 0), letter, font=face)
            draw.text(
                (x + (advance - (box[2] - box[0])) / 2 - box[0], y - box[1]),
                letter,
                font=face,
                fill=color,
            )
            x += advance

    return image.resize((SIZE, SIZE), Image.LANCZOS), background, used, path


def main():
    image, background, used, path = build()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    image.save(OUT, "PNG")
    print("  font       %s" % path)
    print("  background %s" % background)
    print("  DEEP       %s" % used[0])
    print("  JSON       %s" % " ".join(used[4:]))
    print("  wrote      %s  %dx%d  %d bytes"
          % (os.path.relpath(OUT, os.path.dirname(HERE)), image.width,
             image.height, os.path.getsize(OUT)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
