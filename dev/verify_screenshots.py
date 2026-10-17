"""Verify every screenshot's per-level colors against its theme's own palette.

Ported from the Sublime repo's verifier, with two differences. Palettes are read out
of the generated theme JSON rather than out of .sublime-color-scheme variables, and
brackets are checked as well as content, because a bracket carries the depth of the
container it opens or closes and the muted themes color it differently on purpose.

The level each line should be is not hardcoded. It is derived by walking the sample
with the same rule the extension's scanner uses, and the content lines are then
checked against the table that was verified by hand in Sublime Text. So if the walk
is wrong, the run says so instead of quietly validating against itself.

Matching happens two ways, because a line of text and a lone bracket are not alike:

  exact      A long run of text has glyph cores that are the palette color exactly.
             This is the preferred path, and the only one that can tell apart two
             palette entries that look the same, as Monokai Classic's levels 5 and 8
             nearly do.
  direction  A bracket is a one pixel stroke, so antialiasing means no pixel ever
             reaches the pure color. Every pixel is background + alpha * (color -
             background) though, so the direction of (pixel - background) in RGB is
             alpha independent and identifies the color. Captures use grayscale
             antialiasing for exactly this reason; subpixel rendering gives each
             channel its own alpha and breaks the relationship.

Needs Pillow (pip install pillow); nothing else in dev/ has a dependency.
Run:  python dev/verify_screenshots.py

Copyright (C) 2026 Lance Duvall
SPDX-License-Identifier: AGPL-3.0-or-later
Project: <https://github.com/lanz/vscode-deep-json>
Licensed under the GNU Affero General Public License, version 3 or later.
See LICENSE, or <https://www.gnu.org/licenses/>.
"""
import collections
import io
import json
import math
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
MAX_LEVEL = 20

# how far off a direction match may be, in degrees
TOLERANCE = 4.0
# a pixel this far from the background in summed channel difference is ink
INK = 40
# exact matches below this count are treated as noise
EXACT_MIN = 3

# Content line -> nesting level, as verified by hand in Sublime Text. Used to check
# the walk below, not to check the images directly.
KNOWN = {
    "object": {r: r - 1 for r in range(2, 12)},
    "array": {2: 1, 3: 2, 5: 3, 7: 4, 9: 5, 11: 6, 13: 7, 15: 8, 17: 9, 19: 10},
    "mixed": {2: 1, 3: 2, 5: 3, 8: 3, 9: 4, 10: 4, 12: 5, 13: 6, 15: 7, 17: 8,
              18: 9, 20: 10},
}


def walk(text):
    """line -> (kind, level), applying the scanner's rule.

    A value takes the depth of the container holding it. A bracket takes the depth
    of the container it opens or closes, so an opener counts after the push and a
    closer before the pop, which makes a matched pair share a level.

    Where a line holds both, the value wins: it has far more glyphs, so it is what
    dominates that row.
    """
    depth = 0
    line = 1
    values = {}
    brackets = {}
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch == "\n":
            line += 1
            i += 1
        elif ch == '"':
            j = i + 1
            while j < n and not (text[j] == '"' and text[j - 1] != "\\"):
                j += 1
            if depth >= 1:
                values.setdefault(line, depth)
            i = j + 1
        elif ch == "-" or ch.isdigit() or ch in "tfn":
            # a number, or true/false/null; strings are consumed above, so these
            # can only be values
            j = i
            while j < n and (text[j].isalnum() or text[j] in "+-."):
                j += 1
            if depth >= 1:
                values.setdefault(line, depth)
            i = j
        elif ch in "{[":
            depth += 1
            brackets.setdefault(line, depth)
            i += 1
        elif ch in "}]":
            brackets.setdefault(line, depth)
            depth -= 1
            i += 1
        else:
            i += 1

    out = {}
    for ln, level in brackets.items():
        out[ln] = ("bracket", level)
    for ln, level in values.items():
        out[ln] = ("value", level)
    return out


def theme_dirs():
    """label -> screenshot folder, as written by build_themes.py.

    Labels carry a colon, which cannot appear in a directory name on Windows, so
    the folders are slugs and the mapping is generated rather than guessed.
    """
    with io.open(os.path.join(HERE, "theme_dirs.json"), encoding="utf-8") as fh:
        return json.load(fh)


def themes():
    with io.open(os.path.join(REPO, "package.json"), encoding="utf-8") as fh:
        manifest = json.load(fh)
    for entry in manifest["contributes"]["themes"]:
        name = os.path.basename(entry["path"])
        with io.open(os.path.join(REPO, "themes", name), encoding="utf-8") as fh:
            yield entry["label"], json.load(fh)


def palettes(theme):
    """(value colors, bracket colors), each level1..20, lowercased hex."""
    rules = theme["semanticTokenColors"]
    values, brackets = [], []
    for level in range(1, MAX_LEVEL + 1):
        value = rules["*.level%d" % level].lower()
        values.append(value)
        brackets.append(rules.get("jsonPunctuation.level%d" % level, value).lower())
    return values, brackets


def ignore_colors(theme):
    """Colors the theme paints with that are not depth colors.

    Colons and commas are not semantic tokens, so they keep whatever the TextMate
    rules or the editor foreground give them. A lone bracket often shares its row
    with a comma, and with nowhere for that ink to go it drags the direction
    estimate away from the bracket's own color.
    """
    out = set()
    colors = theme.get("colors", {})
    for key in ("editor.foreground", "editorLineNumber.foreground"):
        if colors.get(key):
            out.add(colors[key][:7].lower())
    for rule in theme.get("tokenColors", []):
        foreground = (rule.get("settings") or {}).get("foreground")
        if foreground:
            out.add(foreground[:7].lower())
    return sorted(out)


def hex2rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def l1(a, b):
    return sum(abs(x - y) for x, y in zip(a, b))


def unit(vector):
    size = math.sqrt(sum(c * c for c in vector))
    return tuple(c / size for c in vector) if size else (0.0, 0.0, 0.0)


def degrees_between(a, b):
    dot = max(-1.0, min(1.0, sum(x * y for x, y in zip(a, b))))
    return math.degrees(math.acos(dot))


def content_x(px, size, bg):
    """Where the code starts, past the line-number gutter.

    Found rather than assumed: the gutter is a run of columns with glyphs, then a
    gap, then the code. Gutter width moves with the digit count.
    """
    w, h = size
    filled = [
        any(l1(px[x, y], bg) > 90 for y in range(h))
        for x in range(w)
    ]
    first = next((x for x, f in enumerate(filled) if f), None)
    if first is None:
        return 0
    gap = 0
    for x in range(first, w):
        if filled[x]:
            gap = 0
        else:
            gap += 1
            if gap >= 4:
                return x
    return 0


def bands(px, size, bg, cutoff):
    """Row groups that carry a line number, one per rendered line."""
    w, h = size
    rows = [
        y for y in range(h)
        if any(l1(px[x, y], bg) > 90 for x in range(cutoff))
    ]
    out = []
    for y in rows:
        if out and y - out[-1][-1] <= 3:
            out[-1].append(y)
        else:
            out.append([y])
    return out


def identify(pixels, bg, candidates, ignore, shared, want):
    """(matched, got, method, detail) for one row's ink."""
    exact = collections.Counter(p for p in pixels if p in candidates)
    if exact:
        rgb, count = exact.most_common(1)[0]
        if count >= EXACT_MIN:
            got = candidates[rgb]
            return got == want, got, "exact", ""

    # Every ink pixel votes for whichever color its direction points at, weighted
    # by how far from the background it is. Non-depth colors are on the ballot so a
    # comma sharing the row does not have to vote for a depth color.
    ballot = {}
    for color in set(candidates.values()):
        ballot[color] = unit(tuple(a - b for a, b in zip(hex2rgb(color), bg)))
    for index, color in enumerate(ignore):
        ballot["ignore %d" % index] = unit(
            tuple(a - b for a, b in zip(hex2rgb(color), bg))
        )
    if want not in ballot:
        return False, None, "vote", "expected color is not on the ballot"

    # Weighted by how far the pixel is from the background. One pixel one vote was
    # tried and measured worse, because a glyph's faint outer fringe then counts as
    # much as its core.
    votes = collections.Counter()
    for pixel in pixels:
        direction = unit(tuple(a - b for a, b in zip(pixel, bg)))
        choice = min(ballot.items(), key=lambda kv: degrees_between(direction, kv[1]))
        votes[choice[0]] += float(l1(pixel, bg))

    depth = {k: v for k, v in votes.items() if not k.startswith("ignore ")}
    if not depth:
        return False, None, "vote", "every pixel matched a non-depth color"
    got = max(depth, key=lambda k: depth[k])
    if got == want:
        share = depth[got] / float(sum(votes.values()))
        note = "" if share >= 0.5 else "only %.0f%% of the ink" % (share * 100)
        return True, got, "vote", note
    if got in shared:
        # The theme paints ordinary text this color too, and this row holds a
        # bracket next to a comma, so the ink cannot be attributed to either. In
        # Monokai Neon, for one, level 1 and the default foreground are both
        # #F8F8F2. Not a fault in the image, and not something pixels can settle.
        return None, got, "vote", "%s doubles as non-depth text" % got
    off = degrees_between(ballot[want], ballot[got])
    return False, got, "vote", "%s is %.1f deg away" % (want, off)


def check(path, expect, value_pal, bracket_pal, ignore, shared):
    im = Image.open(path).convert("RGB")
    size = im.size
    px = im.load()
    w, h = size

    counts = collections.Counter(px[x, y] for x in range(w) for y in range(h))
    bg = counts.most_common(1)[0][0]
    cutoff = content_x(px, size, bg)
    if not cutoff:
        return None, "could not separate the gutter"

    rows = bands(px, size, bg, cutoff)
    wanted = max(expect)
    if len(rows) < wanted:
        return None, "banded %d lines, need at least %d" % (len(rows), wanted)

    # every color either palette can produce, so a wrong slot is detectable
    candidates = {}
    for level in range(MAX_LEVEL):
        candidates.setdefault(hex2rgb(value_pal[level]), value_pal[level])
        candidates.setdefault(hex2rgb(bracket_pal[level]), bracket_pal[level])

    ok = 0
    exact_used = 0
    notes = []
    bad = []
    for index, band in enumerate(rows, 1):
        if index not in expect:
            continue
        kind, level = expect[index]
        want = (bracket_pal if kind == "bracket" else value_pal)[
            min(level, MAX_LEVEL) - 1
        ]
        pixels = [
            px[x, y]
            for y in band
            for x in range(cutoff, w)
            if l1(px[x, y], bg) > INK
        ]
        if not pixels:
            bad.append("line %d: %s level %d, no ink found" % (index, kind, level))
            continue

        matched, got, method, detail = identify(
            pixels, bg, candidates, ignore, shared, want
        )
        if matched is None:
            notes.append("line %d: %s level %d, %s" % (index, kind, level, detail))
            continue
        if matched:
            ok += 1
            if method == "exact":
                exact_used += 1
            if detail:
                notes.append("line %d: %s" % (index, detail))
        else:
            bad.append("line %d: %s level %d wants %s, got %s%s"
                       % (index, kind, level, want, got,
                          " (" + detail + ")" if detail else ""))
    return (ok, exact_used, bad, notes), None


def main():
    samples = {}
    for name in ("object", "array", "mixed"):
        path = os.path.join(REPO, "samples", name + ".json")
        with io.open(path, encoding="utf-8") as fh:
            found = walk(fh.read())
        for line, level in KNOWN[name].items():
            got = found.get(line)
            if got != ("value", level):
                raise SystemExit(
                    "the walk disagrees with the verified table: %s line %d is %r, "
                    "expected ('value', %d)" % (name, line, got, level)
                )
        samples[name] = found

    print("  walk agrees with the hand-verified table for all three samples")
    for name, found in samples.items():
        values = sum(1 for k, _ in found.values() if k == "value")
        brackets = sum(1 for k, _ in found.values() if k == "bracket")
        print("    %-8s %2d value lines, %2d bracket-only lines"
              % (name, values, brackets))

    print("\n  samples/openapi.json is screenshot-only: its rows carry several levels")
    print("  each, which the dominant-color test cannot attribute. Its colors are")
    print("  checked per token by dev/capture_screenshots.js instead.")

    folders = theme_dirs()
    total_ok = 0
    total_bad = 0
    total_exact = 0
    missing = []
    ambiguous = 0
    for label, theme in themes():
        value_pal, bracket_pal = palettes(theme)
        depth_colors = {hex2rgb(c) for c in value_pal + bracket_pal}
        ignore = [c for c in ignore_colors(theme)
                  if hex2rgb(c) not in depth_colors]
        # colors doing double duty as a depth color and as ordinary text
        shared = {c for c in ignore_colors(theme) if hex2rgb(c) in depth_colors}
        cycle = len(set(value_pal[:10]))
        style = "muted" if any(
            bracket_pal[i] != value_pal[i] for i in range(MAX_LEVEL)
        ) else "vivid"
        print("\n=== %s   (%d-color cycle, %s brackets) ===" % (label, cycle, style))

        for name, found in samples.items():
            folder = folders.get(label)
            if folder is None:
                print("  %-8s no folder mapped for this label" % name)
                missing.append("%s/%s" % (label, name))
                continue
            shot = os.path.join(REPO, "screenshots", folder, name + ".png")
            if not os.path.exists(shot):
                print("  %-8s MISSING" % name)
                missing.append("%s/%s" % (label, name))
                continue
            result, error = check(
                shot, found, value_pal, bracket_pal, ignore, shared
            )
            if error:
                print("  %-8s %s" % (name, error))
                total_bad += 1
                continue
            ok, exact_used, bad, notes = result
            total_ok += ok
            total_bad += len(bad)
            total_exact += exact_used
            ambiguous += len(notes)
            print("  %-8s %2d correct (%d exact), %d wrong"
                  % (name, ok, exact_used, len(bad)))
            for line in bad[:6]:
                print("        " + line)

    print("\n" + "=" * 64)
    print("TOTAL: %d correct, %d wrong" % (total_ok, total_bad))
    print("       %d matched a palette color exactly, %d by antialiasing direction"
          % (total_exact, total_ok - total_exact))
    if ambiguous:
        print("       %d unattributable, where one color serves two purposes"
              % ambiguous)
    if missing:
        print("MISSING: %d screenshot(s): %s" % (len(missing), ", ".join(missing[:6])))
    return 1 if (total_bad or missing) else 0


if __name__ == "__main__":
    raise SystemExit(main())
