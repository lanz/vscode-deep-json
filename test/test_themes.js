'use strict';

/**
 * End-to-end check: scanner level -> theme color, for every sample and theme.
 *
 * This is the VS Code equivalent of the pixel verification done on the Sublime
 * screenshots. It resolves what color each token would actually be painted, by
 * taking the level the scanner reports and looking up the theme's rule for it,
 * then compares that against the palette the theme declares.
 *
 * Run with: node test/test_themes.js
 *
 * Copyright (C) 2026 Lance Duvall
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Project: <https://github.com/lanz/vscode-deep-json>
 * Licensed under the GNU Affero General Public License, version 3 or later.
 * See LICENSE, or <https://www.gnu.org/licenses/>.
 */

const fs = require('fs');
const path = require('path');
const { scan, PUNCTUATION } = require('../src/scanner');

const ROOT = path.join(__dirname, '..');
const SAMPLES = path.join(ROOT, 'samples');
const THEMES = path.join(ROOT, 'themes');

// one-based line -> expected nesting level, as verified in Sublime Text
const EXPECT = {
  'object.json': { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 7, 9: 8, 10: 9, 11: 10 },
  'array.json': { 2: 1, 3: 2, 5: 3, 7: 4, 9: 5, 11: 6, 13: 7, 15: 8, 17: 9, 19: 10 },
  'mixed.json': {
    2: 1, 3: 2, 5: 3, 8: 3, 9: 4, 10: 4, 12: 5, 13: 6, 15: 7, 17: 8, 18: 9, 20: 10,
  },
};

const MAX_LEVEL = 20;

let failures = 0;
let checks = 0;

function fail(msg) {
  failures++;
  console.log('  FAIL ' + msg);
}

/** The color a theme would paint a token of `kind` at `level`. */
function colorFor(theme, level, kind) {
  const n = Math.min(level, MAX_LEVEL);
  // a jsonPunctuation rule wins over the generic one, as in the editor
  if (kind === PUNCTUATION) {
    const specific = theme.semanticTokenColors['jsonPunctuation.level' + n];
    if (specific) return specific;
  }
  return theme.semanticTokenColors['*.level' + n];
}

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

// The reconciler identifies the active theme by its label, because the API exposes
// only a theme's kind. So the generated list has to track the manifest exactly; if
// it drifts, deep brackets silently stop following the theme.
const THEME_LABELS = require('../src/theme_labels');
const manifestLabels = manifest.contributes.themes.map((entry) => entry.label);

checks++;
if (THEME_LABELS.length !== manifestLabels.length) {
  fail(
    `src/theme_labels.js has ${THEME_LABELS.length} labels, ` +
      `manifest has ${manifestLabels.length}`
  );
}
for (const label of manifestLabels) {
  checks++;
  if (!THEME_LABELS.includes(label)) {
    fail(`src/theme_labels.js is missing ${JSON.stringify(label)}; rerun build_themes.py`);
  }
}
for (const label of THEME_LABELS) {
  checks++;
  if (!manifestLabels.includes(label)) {
    fail(`src/theme_labels.js has stale label ${JSON.stringify(label)}`);
  }
}

// vivid takes the plain name and muted is suffixed, so the two styles are
// distinguishable in the picker and each palette appears exactly twice
const muted = manifestLabels.filter((l) => / \(Muted Brackets\)$/.test(l));
checks++;
if (muted.length * 2 !== manifestLabels.length) {
  fail(`${muted.length} muted labels against ${manifestLabels.length} themes`);
}
for (const label of muted) {
  checks++;
  const plain = label.replace(/ \(Muted Brackets\)$/, '');
  if (!manifestLabels.includes(plain)) {
    fail(`${JSON.stringify(label)} has no plain counterpart ${JSON.stringify(plain)}`);
  }
}
checks++;
if (manifestLabels.some((l) => /Vivid/.test(l))) {
  fail('no label should still say Vivid; vivid takes the plain theme name');
}

for (const entry of manifest.contributes.themes) {
  const file = path.join(ROOT, entry.path.replace(/^\.\//, ''));
  const theme = JSON.parse(fs.readFileSync(file, 'utf8'));

  checks++;
  if (theme.name !== entry.label) {
    fail(`${entry.path}: manifest label ${entry.label} but theme name ${theme.name}`);
  }
  checks++;
  if (theme.semanticHighlighting !== true) {
    fail(`${entry.path}: semanticHighlighting must be true or depth coloring is off`);
  }

  // the palette, in level order, taken from the theme itself
  const distinct = [];
  for (let n = 1; n <= MAX_LEVEL; n++) {
    const c = colorFor(theme, n);
    checks++;
    if (!c) {
      fail(`${theme.name}: no rule for *.level${n}`);
      continue;
    }
    if (!/^#[0-9A-Fa-f]{6}$/.test(c)) {
      fail(`${theme.name}: *.level${n} is ${c}, which is not a 6-digit hex color`);
    }
    if (!distinct.includes(c)) distinct.push(c);
  }
  const size = distinct.length;

  // cycling: level N and level N+size must agree
  for (let n = 1; n + size <= MAX_LEVEL; n++) {
    checks++;
    if (colorFor(theme, n) !== colorFor(theme, n + size)) {
      fail(`${theme.name}: level ${n} and ${n + size} should share a color`);
    }
  }

  // the two styles must actually differ: muted overrides brackets at every
  // level, vivid leaves them to the generic rules
  const punctRules = Object.keys(theme.semanticTokenColors).filter((k) =>
    k.startsWith('jsonPunctuation.')
  );
  checks++;
  if (/Muted/.test(theme.name)) {
    if (punctRules.length !== MAX_LEVEL) {
      fail(`${theme.name}: expected ${MAX_LEVEL} bracket rules, got ${punctRules.length}`);
    }
    for (let n = 1; n <= MAX_LEVEL; n++) {
      checks++;
      if (colorFor(theme, n, PUNCTUATION) === colorFor(theme, n)) {
        fail(`${theme.name}: bracket and content share a color at level ${n}`);
      }
    }
  } else if (punctRules.length !== 0) {
    fail(`${theme.name}: vivid should have no bracket overrides`);
  }

  // every sample token resolves to the color its level dictates
  let resolved = 0;
  for (const [sample, expected] of Object.entries(EXPECT)) {
    const text = fs.readFileSync(path.join(SAMPLES, sample), 'utf8');
    for (const token of scan(text)) {
      if (token.kind === PUNCTUATION) {
        // brackets appear on container lines too; check only that they resolve
        checks++;
        if (!colorFor(theme, token.level, token.kind)) {
          fail(`${theme.name}: bracket at level ${token.level} has no color`);
        }
        continue;
      }
      const wantLevel = expected[token.line + 1];
      checks++;
      if (wantLevel === undefined) {
        fail(`${sample} line ${token.line + 1}: token on an unexpected line`);
        continue;
      }
      if (token.level !== wantLevel) {
        fail(
          `${sample} line ${token.line + 1}: level ${token.level}, expected ${wantLevel}`
        );
        continue;
      }
      const color = colorFor(theme, token.level, token.kind);
      if (!color) {
        fail(`${theme.name}: level ${token.level} has no color`);
        continue;
      }
      resolved++;
    }
  }
  console.log(
    `  ${theme.name.padEnd(22)} ${size}-color cycle, ${resolved} tokens resolved`
  );
}

console.log(`\n  ${checks} checks, ${failures} failures`);
process.exit(failures ? 1 : 0);
