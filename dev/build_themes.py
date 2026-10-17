"""Generate the VS Code color themes in ../themes/.

Run:  python build_themes.py

Each theme carries three things: workbench colors for the editor surface, TextMate
tokenColors for everything outside JSON, and semanticTokenColors mapping level1
through level20 onto the palette, cycling once the palette runs out.

Copyright (C) 2026 Lance Duvall
SPDX-License-Identifier: AGPL-3.0-or-later
Project: <https://github.com/lanz/vscode-deep-json>
Licensed under the GNU Affero General Public License, version 3 or later.
See LICENSE, or <https://www.gnu.org/licenses/>.
"""
import io
import json
import os

import brackets as B
import palettes as P

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "themes")

# Sublime global -> VS Code workbench color, for the Neue base that ships as data
NEUE_UI_MAP = {
    "background": "editor.background",
    "foreground": "editor.foreground",
    "caret": "editorCursor.foreground",
    "line_highlight": "editor.lineHighlightBackground",
    "selection": "editor.selectionBackground",
    "invisibles": "editorWhitespace.foreground",
    "find_highlight": "editor.findMatchHighlightBackground",
}


def neue_base(filename):
    """Globals and tokenColors from a base palette extracted from a .tmTheme."""
    path = os.path.join(HERE, "palettes", filename)
    with io.open(path, encoding="utf-8") as fh:
        doc = json.load(fh)

    ui = {}
    for sublime_key, vscode_key in NEUE_UI_MAP.items():
        if sublime_key in doc["globals"]:
            ui[vscode_key] = doc["globals"][sublime_key]
    # a couple VS Code wants explicitly rather than inheriting
    ui.setdefault("editorLineNumber.foreground", "#7C7865")
    ui["editorBracketMatch.background"] = ui.get("editor.background", "#252526")
    ui["editorBracketMatch.border"] = doc["globals"].get(
        "brackets_foreground", "#F8F8F2A5"
    )

    tokens = []
    for rule in doc["rules"]:
        settings = {}
        if rule.get("foreground"):
            settings["foreground"] = rule["foreground"]
        if "font_style" in rule:
            settings["fontStyle"] = rule["font_style"]
        if not settings:
            continue
        entry = {"scope": rule["scope"], "settings": settings}
        if rule.get("name"):
            entry["name"] = rule["name"]
        tokens.append(entry)
    return ui, tokens


def token_colors(rules):
    out = []
    for name, scope, foreground, font_style in rules:
        settings = {"foreground": foreground}
        if font_style is not None:
            settings["fontStyle"] = font_style
        out.append({"name": name, "scope": scope, "settings": settings})
    return out


def semantic_colors(levels):
    """level1..level20 mapped onto the palette, cycling when it runs out."""
    size = len(levels)
    out = {}
    for level in range(1, P.MAX_LEVEL + 1):
        out["*.level%d" % level] = levels[P.palette_index(level, size) - 1]
    return out


def vscode_base(filename):
    """Colors and tokenColors from a flattened VS Code theme.

    Nothing to convert: a VS Code theme already speaks this format, so the base
    palette and all of its syntax rules are used as they are and only the depth
    rules are added on top.
    """
    path = os.path.join(HERE, "palettes", filename)
    with io.open(path, encoding="utf-8") as fh:
        doc = json.load(fh)
    return dict(doc["colors"]), list(doc["tokenColors"])


def build(theme, style):
    if "neue_base" in theme:
        ui, tokens = neue_base(theme["neue_base"])
    elif "vscode_base" in theme:
        ui, tokens = vscode_base(theme["vscode_base"])
    else:
        ui, tokens = dict(theme["ui"]), token_colors(theme["tokens"])

    background = ui.get("editor.background", "#1E1E1E")
    bracket_ui, report = B.bracket_colors(theme["levels"], background, style["id"])
    ui.update(bracket_ui)

    # Indent guides, matching the Sublime schemes. A palette may declare its own
    # trio; otherwise they are derived from its colors. VS Code has no equivalent
    # of Sublime's stack_guide, so that one is unused here.
    guide, _stack, active_guide = B.resolve_guides(
        theme.get("guides"), theme["levels"], background
    )
    ui["editorIndentGuide.background1"] = guide
    ui["editorIndentGuide.activeBackground1"] = active_guide

    label = P.BRAND + P.LABEL_SEPARATOR + theme["name"] + style["suffix"]
    doc = {
        "$schema": "vscode://schemas/color-theme",
        "name": label,
        "type": "dark",
        "semanticHighlighting": True,
        "colors": ui,
        "tokenColors": tokens,
        "semanticTokenColors": semantic_colors(theme["levels"]),
    }
    doc["semanticTokenColors"].update(
        B.punctuation_colors(theme["levels"], background, style["id"],
                             P.MAX_LEVEL)
    )

    if not os.path.isdir(OUT):
        os.makedirs(OUT)
    filename = "%s-%s-color-theme.json" % (theme["filename"], style["slug"])
    path = os.path.join(OUT, filename)
    text = json.dumps(doc, indent=2, ensure_ascii=False) + "\n"
    io.open(path, "w", encoding="utf-8", newline="\n").write(text)
    return label, filename, len(tokens), report


def update_manifest(entries):
    """Rewrite contributes.themes so the manifest always matches themes/."""
    path = os.path.join(os.path.dirname(HERE), "package.json")
    with io.open(path, encoding="utf-8") as fh:
        manifest = json.load(fh)
    manifest["contributes"]["themes"] = [
        {"label": label, "uiTheme": "vs-dark", "path": "./themes/" + filename}
        for label, filename in entries
    ]
    io.open(path, "w", encoding="utf-8", newline="\n").write(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"
    )
    return len(entries)


def slug(label):
    """A label as a directory name.

    Screenshots live in a folder per theme, and a label like
    "Deep JSON: Monokai Classic" cannot be a directory on Windows, where a colon is
    not legal. The mapping is written out rather than recomputed in each tool, so
    the capture harness and the verifier cannot drift apart on it.
    """
    out = []
    for ch in label.lower():
        out.append(ch if ch.isalnum() else "-")
    while "--" in "".join(out):
        out = list("".join(out).replace("--", "-"))
    return "".join(out).strip("-")


def write_theme_dirs(entries):
    """Generate dev/theme_dirs.json, mapping each label to its screenshot folder."""
    mapping = {label: slug(label) for label, _filename in entries}
    if len(set(mapping.values())) != len(mapping):
        raise ValueError("two themes would share a screenshot folder")
    path = os.path.join(HERE, "theme_dirs.json")
    io.open(path, "w", encoding="utf-8", newline="\n").write(
        json.dumps(mapping, indent=2, ensure_ascii=False) + "\n"
    )
    return len(mapping)


def write_theme_labels(entries):
    """Generate src/theme_labels.js from the labels just written.

    The reconciler has to know whether the active theme is one of ours, and the API
    exposes only a theme's kind, never its name. So it compares workbench.colorTheme
    against these labels. Generating the list keeps it correct across a rename, which
    a hand-maintained copy would not survive.
    """
    labels = [label for label, _filename in entries]
    for label in labels:
        if "'" in label:
            raise ValueError("label %r needs quote escaping" % label)
    out = ["'use strict';", "", "/**",
           " * Labels of the themes this extension contributes.",
           " *",
           " * Generated by dev/build_themes.py. Do not edit by hand.",
           " *",
           " * Copyright (C) 2026 Lance Duvall",
           " * SPDX-License-Identifier: AGPL-3.0-or-later",
           " * Project: <https://github.com/lanz/vscode-deep-json>",
           " * Licensed under the GNU Affero General Public License, version 3 or"
           " later.",
           " * See LICENSE, or <https://www.gnu.org/licenses/>.",
           " */", "", "module.exports = ["]
    out += ["  '%s'," % label for label in labels]
    out += ["];", ""]
    path = os.path.join(os.path.dirname(HERE), "src", "theme_labels.js")
    io.open(path, "w", encoding="utf-8", newline="\n").write("\n".join(out))
    return len(labels)


def prune(entries):
    """Delete theme files in themes/ that this run did not write.

    Renaming a theme changes its filename, and a leftover file would still be
    picked up by anything that globs the directory.
    """
    keep = {filename for _label, filename in entries}
    removed = []
    for name in sorted(os.listdir(OUT)):
        if name.endswith("-color-theme.json") and name not in keep:
            os.remove(os.path.join(OUT, name))
            removed.append(name)
    return removed


def main():
    entries = []
    for theme in P.THEMES:
        print("\n  %s   palette of %d" % (theme["name"], len(theme["levels"])))
        for style in B.STYLES:
            label, filename, rules, report = build(theme, style)
            entries.append((label, filename))
            shown = "  ".join("%s" % new for _i, _old, new, _r in report)
            worst = min(r for _i, _o, _n, r in report)
            print("    %-18s %s   lowest contrast %.1f:1"
                  % (style["id"], shown, worst))
    count = update_manifest(entries)
    labels = write_theme_labels(entries)
    dirs = write_theme_dirs(entries)
    stale = prune(entries)
    print("")
    print("  %d themes written; package.json, src/theme_labels.js and "
          "dev/theme_dirs.json updated to match (%d labels, %d folders)"
          % (count, labels, dirs))
    if stale:
        print("  removed %d stale theme file(s): %s"
              % (len(stale), ", ".join(stale)))


if __name__ == "__main__":
    main()
