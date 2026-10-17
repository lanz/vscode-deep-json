"""Palettes and base syntax colors, shared with the Sublime Text schemes.

These are vendored rather than imported so this repository stands alone. They must
stay identical to the Sublime version; dev/check_palettes.py verifies that whenever
the sublime-deep-json checkout is available alongside this one.

Levels are the author's own values, recovered from the original ST2/ST3 .tmTheme
files. Level 1 is the outermost key; depth counts objects and arrays alike.

Copyright (C) 2026 Lance Duvall
SPDX-License-Identifier: AGPL-3.0-or-later
Project: <https://github.com/lanz/vscode-deep-json>
Licensed under the GNU Affero General Public License, version 3 or later.
See LICENSE, or <https://www.gnu.org/licenses/>.
"""

MONOKAI_LEVELS = [
    "#FFFFFF", "#FFFFAA", "#FFAAFF", "#AAFFFF", "#AAAAFF",
    "#AAFFAA", "#FFAAAA", "#AAAAFA", "#AAFAAA", "#E6DB74",
]

MONOKAI_CHALK_LEVELS = [
    "#D6D5E3", "#AAFFAA", "#FFAAFF", "#AAFFFF", "#AAAAFF",
    "#FFAAAA", "#FFFFAA", "#967BB6", "#FF80AA", "#21ABCD",
]

MONOKAI_NEON_LEVELS = [
    "#F8F8F2", "#F92672", "#FD971F", "#E6DB74", "#A6E22E",
    "#66D9EF", "#AE81FF", "#4CF0A9", "#3692E2", "#F04CC5",
]

# Monokai Neue's own ramp: six accents on a six-level cycle, as its author wrote it.
MONOKAI_NEUE_LEVELS = [
    "#66D9EF", "#AE81FF", "#F92672", "#A6E22E", "#FD971F", "#E6DB74",
]

JAZZ_LEVELS = [
    "#FFFFFF", "#00B1B3", "#BC9CF0", "#94A2FF", "#0BE9BF",
    "#B8C9EE", "#FFAAFF", "#0B9CBF", "#A094A0", "#C76FB2",
]

# --------------------------------------------------------------------------
# Editor colors.
#
# Sublime's globals map onto VS Code's workbench color IDs. Only editor-surface
# keys are set; the rest of the workbench inherits VS Code's dark defaults, which
# is deliberate -- a Sublime color scheme never described a VS Code sidebar.
# --------------------------------------------------------------------------

MONOKAI_UI = {
    "editor.background": "#272822",
    "editor.foreground": "#F8F8F2",
    "editorCursor.foreground": "#F8F8F0",
    "editor.lineHighlightBackground": "#3E3D32",
    "editor.selectionBackground": "#49483E",
    "editor.inactiveSelectionBackground": "#49483E80",
    "editor.findMatchHighlightBackground": "#FFE79255",
    "editorWhitespace.foreground": "#3B3A32",
    "editorLineNumber.foreground": "#90908A",
    "editorLineNumber.activeForeground": "#F8F8F2",
    "editorBracketMatch.background": "#272822",
    "editorBracketMatch.border": "#F8F8F2A5",
}

JAZZ_UI = {
    "editor.background": "#121719",
    "editor.foreground": "#A094A0",
    "editorCursor.foreground": "#9473FF",
    "editor.lineHighlightBackground": "#1C3438",
    "editor.selectionBackground": "#1C3438",
    "editor.inactiveSelectionBackground": "#1C343880",
    "editor.findMatchHighlightBackground": "#FFE79255",
    "editorWhitespace.foreground": "#0BE9BF40",
    "editorLineNumber.foreground": "#5A6A6C",
    "editorLineNumber.activeForeground": "#A094A0",
    "editorBracketMatch.background": "#121719",
    "editorBracketMatch.border": "#00B1B3",
}

# --------------------------------------------------------------------------
# Base syntax rules, outside JSON.
#
# Both editors use TextMate scope names, so these are the Sublime rules with
# "fontStyle" spelled the way VS Code expects.
# --------------------------------------------------------------------------

# --------------------------------------------------------------------------
# Markdown
#
# The .tmTheme files these palettes came from carried three markup rules between
# them, all of them for diffs, so a Markdown file rendered as one flat color.
# Monokai Neue and VS Code Dark get Markdown from the themes they are built on;
# this gives the other four the same treatment.
#
# Scope names differ between the two editors in about half of these cases, so a
# rule lists both spellings and the one the other editor never emits simply never
# matches. The names were read out of ST4's bundled Markdown syntax and VS Code's
# markdown-basics grammar rather than recalled.
#
# Every structural mark, the hashes and fence ticks and quote arrows and table
# pipes, takes the "marker" role, which is the palette's comment color. The prose
# stays the thing you read; the punctuation holding it up recedes.
#
# (name, role, font style, scope)
MARKDOWN = [
    ("Markdown: heading", "heading", "bold",
     "markup.heading, markup.heading entity.name"),
    ("Markdown: heading punctuation", "marker", None,
     "punctuation.definition.heading.markdown,"
     " punctuation.definition.heading.begin.markdown,"
     " punctuation.definition.heading.end.markdown,"
     " punctuation.definition.heading.setext.markdown"),
    ("Markdown: bold", "emphasis", "bold", "markup.bold"),
    ("Markdown: italic", "emphasis", "italic", "markup.italic"),
    ("Markdown: emphasis punctuation", "marker", None,
     "punctuation.definition.bold.markdown,"
     " punctuation.definition.bold.begin.markdown,"
     " punctuation.definition.bold.end.markdown,"
     " punctuation.definition.italic.markdown,"
     " punctuation.definition.italic.begin.markdown,"
     " punctuation.definition.italic.end.markdown"),
    ("Markdown: strikethrough", "marker", None,
     "markup.strikethrough,"
     " punctuation.definition.strikethrough.markdown,"
     " punctuation.definition.strikethrough.begin.markdown,"
     " punctuation.definition.strikethrough.end.markdown"),
    ("Markdown: inline code", "code", None,
     "markup.raw.inline, markup.inline.raw"),
    # The body of a fenced block keeps the foreground, or its own syntax when the
    # fence names a language. Only the ticks and the language label are colored.
    ("Markdown: code fence", "marker", None,
     "punctuation.definition.raw.markdown,"
     " punctuation.definition.raw.begin.markdown,"
     " punctuation.definition.raw.end.markdown,"
     " punctuation.definition.raw.code-fence.begin.markdown,"
     " punctuation.definition.raw.code-fence.end.markdown,"
     " punctuation.definition.markdown,"
     " fenced_code.block.language"),
    ("Markdown: quote", "quote", "italic", "markup.quote"),
    ("Markdown: quote punctuation", "marker", None,
     "punctuation.definition.blockquote.markdown,"
     " punctuation.definition.quote.begin.markdown"),
    # The bullet alone. In ST4 markup.list is a meta scope over the whole item, so
    # coloring that would recolor every list's prose.
    ("Markdown: list bullet", "bullet", None,
     "markup.list.unnumbered.bullet.markdown,"
     " markup.list.numbered.bullet.markdown,"
     " punctuation.definition.list_item.markdown,"
     " punctuation.definition.list.begin.markdown"),
    ("Markdown: link", "link", "underline", "markup.underline.link"),
    ("Markdown: link text and title", "linktext", None,
     "meta.link.inline.description.markdown,"
     " meta.link.reference.description.markdown,"
     " string.other.link.description.markdown,"
     " string.other.link.title.markdown,"
     " string.other.link.description.title.markdown"),
    ("Markdown: link punctuation", "marker", None,
     "punctuation.definition.link.markdown,"
     " punctuation.definition.link.begin.markdown,"
     " punctuation.definition.link.end.markdown,"
     " punctuation.definition.link.description.begin.markdown,"
     " punctuation.definition.link.description.end.markdown,"
     " punctuation.definition.link.title.begin.markdown,"
     " punctuation.definition.link.title.end.markdown,"
     " punctuation.definition.image.begin.markdown,"
     " punctuation.definition.image.end.markdown,"
     " punctuation.definition.metadata.markdown,"
     " punctuation.definition.metadata.begin.markdown,"
     " punctuation.definition.metadata.end.markdown,"
     " punctuation.definition.string.begin.markdown,"
     " punctuation.definition.string.end.markdown"),
    ("Markdown: reference", "reference", None,
     "constant.other.reference.link.markdown,"
     " punctuation.definition.constant.markdown,"
     " punctuation.definition.constant.begin.markdown,"
     " punctuation.definition.constant.end.markdown"),
    ("Markdown: escape", "reference", None, "constant.character.escape.markdown"),
    ("Markdown: thematic break", "marker", "bold",
     "meta.separator, punctuation.definition.thematic-break.markdown"),
    ("Markdown: table punctuation", "marker", None,
     "punctuation.separator.table-cell.markdown,"
     " punctuation.separator.table.markdown,"
     " punctuation.definition.table.markdown,"
     " punctuation.definition.table-cell-alignment.markdown,"
     " punctuation.section.table-header.markdown"),
]

# Monokai's own accents. Headings take the orange it gives parameters, emphasis the
# pink it gives keywords, code the yellow it gives strings.
MONOKAI_MARKDOWN = {
    "heading": "#FD971F",
    "emphasis": "#F92672",
    "marker": "#75715E",
    "code": "#E6DB74",
    "quote": "#66D9EF",
    "link": "#66D9EF",
    "linktext": "#A6E22E",
    "bullet": "#F92672",
    "reference": "#AE81FF",
}

# Jazz is a wide teal stroke with a thin purple zig-zag above it, so the teal is the
# base and the purple is the accent. Prose takes the teal, which is what text.html
# sets, and the purple family carries the structure sitting on top of it: violet for
# the headings and bullets, lavender for the quotes and links. References and escapes
# take white so they stand apart from both.
JAZZ_MARKDOWN = {
    "heading": "#9473FF",
    "emphasis": "#FF9BEC",
    "marker": "#A094A0",
    "code": "#0BE9BF",
    "quote": "#BC9CF0",
    "link": "#BC9CF0",
    "linktext": "#9473FF",
    "bullet": "#9473FF",
    "reference": "#FFFFFF",
}


def markdown_tokens(roles):
    """MARKDOWN as token rules, each role resolved to this palette's color."""
    return [
        (name, scope, roles[role], style)
        for name, role, style, scope in MARKDOWN
    ]


MONOKAI_TOKENS = [
    ("Comment", "comment", "#75715E", None),
    ("String", "string", "#E6DB74", None),
    ("Number", "constant.numeric", "#AE81FF", None),
    ("Built-in constant", "constant.language", "#AE81FF", None),
    ("User-defined constant", "constant.character, constant.other", "#AE81FF", None),
    ("Keyword", "keyword", "#F92672", None),
    ("Storage", "storage", "#F92672", ""),
    ("Storage type", "storage.type", "#66D9EF", "italic"),
    ("Class name", "entity.name.class", "#A6E22E", "underline"),
    ("Inherited class", "entity.other.inherited-class", "#A6E22E", "italic underline"),
    ("Function name", "entity.name.function", "#A6E22E", ""),
    ("Function argument", "variable.parameter", "#FD971F", "italic"),
    ("Tag name", "entity.name.tag", "#F92672", ""),
    ("Tag attribute", "entity.other.attribute-name", "#A6E22E", ""),
    ("Library function", "support.function", "#66D9EF", ""),
    ("Library constant", "support.constant", "#66D9EF", ""),
    ("Library class/type", "support.type, support.class", "#66D9EF", "italic"),
    ("Invalid", "invalid", "#F8F8F0", ""),
    ("Invalid deprecated", "invalid.deprecated", "#F8F8F0", ""),
    ("diff header", "meta.diff, meta.diff.header", "#75715E", None),
    ("diff deleted", "markup.deleted", "#F92672", None),
    ("diff inserted", "markup.inserted", "#A6E22E", None),
    ("diff changed", "markup.changed", "#E6DB74", None),
] + markdown_tokens(MONOKAI_MARKDOWN)

JAZZ_TOKENS = [
    ("Comment", "comment", "#A094A0", None),
    ("String", "string", "#0BE9BF", None),
    # Jazz colors prose rather than leaving it the default grey. The teal is the
    # base of the design, so it is the prose and not an accent.
    ("Plaintext", "text.html", "#00B1B3", None),
    ("Number", "constant.numeric", "#FF9BEC", None),
    ("Built-in constant", "constant.language", "#FF9BEC", None),
    ("User-defined constant", "constant.character, constant.other", "#00B1B3", None),
    ("Keyword", "keyword", "#FF9BEC", None),
    ("Storage", "storage", "#FF9BEC", ""),
    ("Storage type", "storage.type", "#00B1B3", "italic"),
    ("Class name", "entity.name.class", "#00B1B3", "underline"),
    ("Inherited class", "entity.other.inherited-class", "#00B1B3", "italic underline"),
    ("Function name", "entity.name.function", "#FFFFFF", ""),
    ("Function argument", "variable.parameter", "#0BE9BF", "italic"),
    ("Tag name", "entity.name.tag", "#00B1B3", ""),
    ("Tag attribute", "entity.other.attribute-name", "#BC9CF0", ""),
    ("Library function", "support.function", "#FFFFFF", ""),
    ("Library constant", "support.constant", "#BC9CF0", ""),
    ("Library class/type", "support.type, support.class", "#BC9CF0", "italic"),
    ("Invalid", "invalid", "#F8F8F0", ""),
    ("Invalid deprecated", "invalid.deprecated", "#F8F8F0", ""),
    ("diff header", "meta.diff, meta.diff.header", "#75715E", None),
    ("diff deleted", "markup.deleted", "#00B1B3", None),
    ("diff inserted", "markup.inserted", "#BC9CF0", None),
    ("diff changed", "markup.changed", "#BC9CF0", None),
] + markdown_tokens(JAZZ_MARKDOWN)

# --------------------------------------------------------------------------
# The themes.
#
# "neue_base" pulls globals and all 152 syntax rules out of
# palettes/monokai-neue-base.json instead of the lists above.
# --------------------------------------------------------------------------

# The family name every theme carries, so the ten of them group together in the
# picker instead of scattering between whatever else is installed.
BRAND = "Deep JSON"
# VS Code labels join with a colon. Sublime Text cannot: its picker title is the
# scheme's filename, and a colon is not legal in a filename.
LABEL_SEPARATOR = ": "
# Sublime Text joins with a hyphen instead, for the same reason.
SUBLIME_SEPARATOR = " - "

# Deep JSON: VS Code Dark, built on the Dark 2026 theme that ships with Visual
# Studio Code. Levels 1 to 6 are its own signature syntax colors, in the order its
# rules use them. It has only six that are mutually distinct: its two blues sit
# 15.2 apart in CIELAB and its two greys 16.8, too close to tell apart five levels
# down, so #A5D6FF, #8B949E and #C9D1D9 are left out. Levels 7 to 10 are chosen to
# stay as far from the first six as possible, which is how Monokai Neon fills its
# deep end too. Three of them come from dark_modern, which Dark 2026 includes, so
# they belong to the same family.
#
# Minimum pairwise distance 22.6 dE, minimum contrast 5.3:1 against #121314.
VSCODE_DARK_LEVELS = [
    "#BBBEBF",  # 1  editor foreground
    "#79C0FF",  # 2  constants, properties
    "#FFA657",  # 3  entity names, variables
    "#7EE787",  # 4  tags, escapes
    "#FF7B72",  # 5  keywords, storage
    "#D2A8FF",  # 6  functions
    "#4EC9B0",  # 7  classic VS Code teal
    "#B267E6",  # 8  its debug-token purple
    "#D7BA7D",  # 9  classic VS Code tan
    "#B5CEA8",  # 10 classic VS Code sage
]

THEMES = [
    {
        "name": "Monokai Classic",
        "filename": "monokai-classic",
        "levels": MONOKAI_LEVELS,
        # Only the active guide is declared: Hazenberg's own orange, which
        # belongs on the faithful variant. The quieter two derive, because the
        # orange at half alpha made a loud stack. Chalk and Neon depart from the
        # palette, so they derive all three.
        "guides": (None, None, "#9D550FB0"),
        "ui": MONOKAI_UI,
        "tokens": MONOKAI_TOKENS,
    },
    {
        "name": "Monokai Chalk",
        "filename": "monokai-chalk",
        "levels": MONOKAI_CHALK_LEVELS,
        "ui": MONOKAI_UI,
        "tokens": MONOKAI_TOKENS,
    },
    {
        "name": "Monokai Neon",
        "filename": "monokai-neon",
        "levels": MONOKAI_NEON_LEVELS,
        "ui": MONOKAI_UI,
        "tokens": MONOKAI_TOKENS,
    },
    {
        "name": "Monokai Neue",
        "filename": "monokai-neue",
        "levels": MONOKAI_NEUE_LEVELS,
        # Level 1's blue, rather than the purple that deriving from level 2 gives.
        # The quieter two still derive, and are a muted form of this same blue, so
        # the active guide reads as a brighter version of the stack behind it.
        "guides": (None, None, "#66D9EFB0"),
        "neue_base": "monokai-neue-base.json",
    },
    {
        "name": "Jazz Solo Cup",
        "filename": "jazz-solo-cup",
        "levels": JAZZ_LEVELS,
        # Hand-picked rather than derived. Jazz's level 1 is white, so deriving
        # the guides from it gives neutral grey and loses the teal the design is
        # built on. The stack is the active color at half alpha, which is the
        # idiom Sublime's own schemes use.
        "guides": ("#1C3438", "#00B1B380", "#00B1B3"),
        "ui": JAZZ_UI,
        "tokens": JAZZ_TOKENS,
    },
    {
        "name": "VS Code Dark",
        "filename": "vscode-dark",
        "levels": VSCODE_DARK_LEVELS,
        "vscode_base": "vscode-dark-base.json",
        # Dark 2026's own guide colors. The stack sits between the two, since VS
        # Code has no equivalent of Sublime's third guide.
        "guides": ("#8384854D", "#83848599", "#838485"),
    },
]

# Deepest level with a modifier of its own. Must match MAX_LEVEL in src/extension.js.
MAX_LEVEL = 20


def palette_index(level, palette_size):
    """1-based palette slot for `level`, cycling every `palette_size` levels."""
    return (min(level, MAX_LEVEL) - 1) % palette_size + 1
