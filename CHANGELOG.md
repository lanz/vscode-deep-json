# Change Log

## 2.0.0

First release, numbered to match the Sublime Text package it is ported from rather
than starting over at 1.0.0. Six palettes that give every level of JSON nesting its
own color, ported from my Sublime Text schemes of the same names.

- Deep JSON: Monokai Classic
- Deep JSON: Monokai Chalk
- Deep JSON: Monokai Neon
- Deep JSON: Monokai Neue
- Deep JSON: Jazz Solo Cup
- Deep JSON: VS Code Dark

Each ships in two bracket styles: the plain name colors brackets exactly like the
content at that depth, and a "(Muted Brackets)" variant desaturates them so they
read as structure.

Depth coloring covers object keys, string values, array elements, numbers and
`true`/`false`/`null`, to 20 levels, with each palette cycling once it runs out.

The provider reports edits as deltas rather than resending every token, so
editing a large document stays cheap: renaming a property in a 5 MB file
changes one integer of token data.

A palette can be used without selecting the theme it belongs to. *Deep JSON: Add Depth
Colors to Current Theme* writes a palette's level colors into
`editor.semanticTokenColorCustomizations` scoped to whatever theme is active, so JSON gets
depth coloring while everything else stays as it was. It touches only the rules it wrote.
*Deep JSON: Remove Depth Colors from Current Theme* takes them back, including after
switching themes. The add command accepts a palette name, so either can be bound to a key
or called from another extension.

Brackets and braces follow depth too. VS Code's built-in bracket colorizer has
six color slots and repeats after level 6, so matching brackets any deeper means
suppressing it for JSON. `deepJson.deepBrackets` controls when that
happens, defaulting to following the active theme, and the *Deep JSON: Bracket Depth*
command switches between the three modes. A
`editor.language.colorizedBracketPairs` value you set yourself is never changed
or removed.
