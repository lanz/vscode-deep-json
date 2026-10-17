"""Verify this repository's colors still match the Sublime Text schemes.

The palettes in palettes.py are copies, so they can drift. This reads the colors
straight out of the generated .sublime-color-scheme files in the sibling checkout
and compares four things: the level colors, the muted delimiter colors, the
indent guides, and the Markdown rules. The delimiters and the guides are derived
rather than copied, by identical code in both repositories against identical
backgrounds, so they are expected to agree exactly and a difference means one
side's math has moved.

If that checkout is not present the check is skipped rather than failed, since this
repository has to build on its own.

Run:  python check_palettes.py [path to sublime-deep-json]

Copyright (C) 2026 Lance Duvall
SPDX-License-Identifier: AGPL-3.0-or-later
Project: <https://github.com/lanz/vscode-deep-json>
Licensed under the GNU Affero General Public License, version 3 or later.
See LICENSE, or <https://www.gnu.org/licenses/>.
"""
import io
import json
import os
import re
import sys

import palettes as P

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)

CANDIDATES = [
    os.path.join(os.path.dirname(REPO), "sublime-deep-json"),
    os.path.join(REPO, "..", "sublime-deep-json"),
    # the name it had before the rename, so an older checkout still works
    os.path.join(os.path.dirname(REPO), "sublime-json-color-schemes"),
    os.path.join(REPO, "..", "sublime-json-color-schemes"),
]


def find_sublime_repo():
    if len(sys.argv) > 1:
        return sys.argv[1]
    for path in CANDIDATES:
        if os.path.isdir(os.path.join(path, "dev")):
            return path
    return None


def guides_from_scheme(path):
    """(guide, stack_guide, active_guide) from a .sublime-color-scheme."""
    raw = io.open(path, encoding="utf-8").read()
    out = []
    for key in ("guide", "stack_guide", "active_guide"):
        m = re.search(r'"%s":\s*"([^"]+)"' % key, raw)
        out.append(m.group(1).upper() if m else None)
    return tuple(out)


def brackets_from_scheme(path):
    """The json_bracket1..N variables, in order, from a .sublime-color-scheme."""
    raw = io.open(path, encoding="utf-8").read()
    out = []
    n = 1
    while True:
        m = re.search(r'"json_bracket%d":\s*"([^"]+)"' % n, raw)
        if not m:
            return out
        out.append(m.group(1).upper())
        n += 1


def levels_from_scheme(path):
    """The json_level1..N variables, in order, from a .sublime-color-scheme."""
    raw = io.open(path, encoding="utf-8").read()
    out = []
    n = 1
    while True:
        m = re.search(r'"json_level%d":\s*"([^"]+)"' % n, raw)
        if not m:
            return out
        out.append(m.group(1).upper())
        n += 1


def markdown_from_scheme(path):
    """Markdown rules from a .sublime-color-scheme, as name -> (color, style).

    The scheme stores a var() reference, so the variables block is resolved first
    to get a comparable color.
    """
    raw = io.open(path, encoding="utf-8").read()
    # Only the variables block. Scanning the whole file would let a rule's own
    # "foreground" overwrite the variable that shares its name.
    block = raw.split('"variables"', 1)[-1].split('"globals"', 1)[0]
    variables = dict(
        (m.group(1), m.group(2).upper())
        for m in re.finditer(r'"([a-z_0-9]+)":\s*"(#[0-9A-Fa-f]+)"', block)
    )
    out = {}
    for block in re.finditer(
        r'\{\s*"name":\s*"(Markdown:[^"]+)",(.*?)\}', raw, re.S
    ):
        name, body = block.group(1), block.group(2)
        color = re.search(r'"foreground":\s*"([^"]+)"', body)
        style = re.search(r'"font_style":\s*"([^"]*)"', body)
        value = color.group(1) if color else None
        if value and value.startswith("var("):
            value = variables.get(value[4:-1], value)
        out[name] = (value, style.group(1) if style else None)
    return out


def markdown_rules_of(theme):
    """The same thing for this repository, from the theme's token list."""
    out = {}
    for name, scope, color, style in theme.get("tokens", []):
        if name.startswith("Markdown:"):
            out[name] = (color.upper(), style)
    return out


def main():
    base = find_sublime_repo()
    if not base:
        print("  sublime-deep-json not found alongside this repo; skipped.")
        print("  pass its path to compare: python check_palettes.py <path>")
        return 0

    print("  comparing against %s" % base)
    problems = 0
    for theme in P.THEMES:
        # the Sublime file carries the brand too, joined with a hyphen rather
        # than a colon; the bare name is accepted as a fallback
        names = [
            P.BRAND + P.SUBLIME_SEPARATOR + theme["name"],
            theme["name"],
        ]
        scheme = None
        for candidate in names:
            path = os.path.join(base, candidate + ".sublime-color-scheme")
            if os.path.exists(path):
                scheme = path
                break
        if scheme is None:
            print("  %-22s no Sublime scheme found; looked for %s"
                  % (theme["name"],
                     " or ".join(n + ".sublime-color-scheme" for n in names)))
            problems += 1
            continue
        theirs = levels_from_scheme(scheme)
        ours = [c.upper() for c in theme["levels"]]
        if ours == theirs:
            print("  %-22s %2d colors, identical" % (theme["name"], len(ours)))
        else:
            problems += 1
            print("  %-22s DRIFTED" % theme["name"])
            print("     sublime: %s" % " ".join(theirs))
            print("     vscode : %s" % " ".join(ours))

        # Indent guides are derived from the palette in both repositories, so
        # they are a third thing that can drift.
        guide, _stack, active = guides_from_scheme(scheme)
        vivid_theme = os.path.join(
            REPO, "themes", theme["filename"] + "-vivid-color-theme.json"
        )
        with io.open(vivid_theme, encoding="utf-8") as fh:
            colors = json.load(fh)["colors"]
        mine = (
            colors["editorIndentGuide.background1"].upper(),
            colors["editorIndentGuide.activeBackground1"].upper(),
        )
        if (guide, active) == mine:
            print("  %-22s    guides identical" % "")
        else:
            problems += 1
            print("  %-22s GUIDES DRIFTED" % theme["name"])
            print("     sublime: %s %s" % (guide, active))
            print("     vscode : %s %s" % mine)

        # Markdown rules are written out by hand in both repositories, from one
        # shared table, so they can drift the way the palettes can. Themes built
        # on someone else's theme get Markdown from that theme and have none of
        # their own, which is why an empty pair counts as agreement.
        # A theme built on someone else's theme carries that theme's Markdown
        # rules, which the two repositories extract separately and name
        # differently, so there is nothing here to compare.
        if "tokens" not in theme:
            print("  %-22s    Markdown comes from its base theme" % "")
            theirs_md = ours_md = {}
        else:
            theirs_md = markdown_from_scheme(scheme)
            ours_md = markdown_rules_of(theme)
        if theirs_md == ours_md:
            if ours_md:
                print("  %-22s    %2d Markdown rules, identical"
                      % ("", len(ours_md)))
        else:
            problems += 1
            print("  %-22s MARKDOWN DRIFTED" % theme["name"])
            for key in sorted(set(theirs_md) | set(ours_md)):
                if theirs_md.get(key) != ours_md.get(key):
                    print("     %-34s sublime %s  vscode %s"
                          % (key, theirs_md.get(key), ours_md.get(key)))

        # The muted schemes carry desaturated delimiter colors, computed by the
        # same function in both repositories against the same background. Only
        # the first `size` slots exist, because the rules index the cycle rather
        # than enumerating every level.
        size = len(theme["levels"])
        muted_scheme = os.path.join(
            base,
            P.BRAND + P.SUBLIME_SEPARATOR + theme["name"]
            + " (Muted Brackets).sublime-color-scheme",
        )
        muted_theme = os.path.join(
            REPO, "themes", theme["filename"] + "-muted-color-theme.json"
        )
        if not (os.path.exists(muted_scheme) and os.path.exists(muted_theme)):
            print("  %-22s muted pair not found, delimiters not compared"
                  % theme["name"])
            problems += 1
            continue
        theirs = brackets_from_scheme(muted_scheme)[:size]
        with io.open(muted_theme, encoding="utf-8") as fh:
            rules = json.load(fh)["semanticTokenColors"]
        ours = [rules["jsonPunctuation.level%d" % n].upper()
                for n in range(1, size + 1)]
        if ours == theirs:
            print("  %-22s %2d muted delimiters, identical"
                  % ("", len(ours)))
        else:
            problems += 1
            print("  %-22s MUTED DELIMITERS DRIFTED" % theme["name"])
            print("     sublime: %s" % " ".join(theirs))
            print("     vscode : %s" % " ".join(ours))

    print("\n  %s" % ("all palettes match" if not problems
                      else "%d theme(s) need attention" % problems))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
