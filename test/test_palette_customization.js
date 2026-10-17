'use strict';

/**
 * Tests for putting a palette on top of someone else's theme.
 *
 * This module edits a setting that belongs to the user and may already hold other
 * people's work: rules for other themes, other fields under the same theme, and
 * rules the user wrote by hand for the very names it writes. So the cases worth
 * enumerating are the ones where it must keep its hands off something, and the
 * ones where it must clean up after itself.
 *
 * Expected values are written out literally rather than computed from the input,
 * so they constrain the implementation instead of restating it.
 *
 * Run with: node test/test_palette_customization.js
 *
 * Copyright (C) 2026 Lance Duvall
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Project: <https://github.com/lanz/vscode-deep-json>
 * Licensed under the GNU Affero General Public License, version 3 or later.
 * See LICENSE, or <https://www.gnu.org/licenses/>.
 */

const pc = require('../src/palette_customization');

let checks = 0;
let failures = 0;

function check(cond, msg) {
  checks++;
  if (!cond) {
    failures++;
    console.log('  FAIL ' + msg);
  }
}

function same(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  checks++;
  if (a !== b) {
    failures++;
    console.log('  FAIL ' + msg);
    console.log('       expected ' + b);
    console.log('       actual   ' + a);
  }
}

// A two-rule palette and a one-rule palette, enough to exercise growing and
// shrinking without burying the cases in hex.
const TWO = { '*.level1': '#111111', '*.level2': '#222222' };
const ONE = { '*.level1': '#AAAAAA' };

// ----------------------------------------------------------------- basics ----

same(pc.themeKey('Dark Modern'), '[Dark Modern]', 'themeKey brackets the label');
same(pc.themeKey('Deep JSON: Monokai Chalk'), '[Deep JSON: Monokai Chalk]',
  'themeKey leaves a colon alone');

same(pc.rulesFromTheme({ semanticTokenColors: TWO }), TWO, 'rules come straight out');
same(pc.rulesFromTheme({}), {}, 'a theme with no semantic rules gives none');
same(pc.rulesFromTheme(null), {}, 'a missing theme gives none');
same(pc.rulesFromTheme({ semanticTokenColors: 'nope' }), {},
  'a non-object semanticTokenColors is ignored rather than trusted');

{
  const theme = { semanticTokenColors: TWO };
  const taken = pc.rulesFromTheme(theme);
  taken['*.level1'] = '#CHANGED';
  same(theme.semanticTokenColors['*.level1'], '#111111',
    'rulesFromTheme copies, so the caller cannot edit the theme file in memory');
}

// ------------------------------------------------------------ first apply ----

{
  const r = pc.apply({ existing: undefined, themeLabel: 'Dark Modern', rules: TWO });
  same(r.value, {
    '[Dark Modern]': {
      enabled: true,
      rules: { '*.level1': '#111111', '*.level2': '#222222' },
    },
  }, 'a first apply writes the palette under the theme key');
  same(r.owned, {
    theme: 'Dark Modern',
    names: ['*.level1', '*.level2'],
    enabledAdded: true,
  }, 'and claims both rules and the enabled flag');
}

// --------------------------------------------------- other people's things ----

{
  const existing = { '[Solarized Light]': { enabled: true, rules: { '*.level1': '#999' } } };
  const r = pc.apply({ existing, themeLabel: 'Dark Modern', rules: ONE });
  same(r.value['[Solarized Light]'], { enabled: true, rules: { '*.level1': '#999' } },
    'another theme key is left exactly as it was');
  same(r.value['[Dark Modern]'].rules, ONE, 'and ours is added alongside it');
}

{
  // the user has their own rule for a name the palette also sets
  const existing = { '[Dark Modern]': { rules: { '*.level1': '#USER00' } } };
  const r = pc.apply({ existing, themeLabel: 'Dark Modern', rules: TWO });
  same(r.value['[Dark Modern]'].rules, {
    '*.level1': '#USER00',
    '*.level2': '#222222',
  }, "a rule the user wrote wins over the palette's value for the same name");
  same(r.owned.names, ['*.level2'],
    'and is not claimed, so a later revert will not remove it');
}

{
  // a rule of theirs we never write at all
  const existing = { '[Dark Modern]': { rules: { 'variable.readonly': '#USER00' } } };
  const r = pc.apply({ existing, themeLabel: 'Dark Modern', rules: ONE });
  same(r.value['[Dark Modern]'].rules, {
    'variable.readonly': '#USER00',
    '*.level1': '#AAAAAA',
  }, 'an unrelated rule of theirs survives');
}

{
  const existing = { '[Dark Modern]': { enabled: true } };
  const r = pc.apply({ existing, themeLabel: 'Dark Modern', rules: ONE });
  same(r.owned.enabledAdded, false,
    'enabled already true is theirs, so we do not claim it');
}

{
  const existing = { '[Dark Modern]': { enabled: false } };
  const r = pc.apply({ existing, themeLabel: 'Dark Modern', rules: ONE });
  same(r.value['[Dark Modern]'].enabled, true,
    'enabled false has to become true or none of this shows');
  same(r.owned.enabledAdded, true, 'and that change is ours to undo');
}

// --------------------------------------------------------------- reapplying ----

{
  // switching from a two-rule palette to a one-rule one
  const first = pc.apply({ existing: undefined, themeLabel: 'Dark Modern', rules: TWO });
  const second = pc.apply({
    existing: first.value, themeLabel: 'Dark Modern', rules: ONE, owned: first.owned,
  });
  same(second.value, {
    '[Dark Modern]': { enabled: true, rules: { '*.level1': '#AAAAAA' } },
  }, 'a rule we wrote that the new palette drops is removed');
  same(second.owned.names, ['*.level1'], 'and ownership shrinks to match');
}

{
  const first = pc.apply({ existing: undefined, themeLabel: 'Dark Modern', rules: TWO });
  const again = pc.apply({
    existing: first.value, themeLabel: 'Dark Modern', rules: TWO, owned: first.owned,
  });
  same(again.value, first.value, 'applying the same palette twice changes nothing');
  same(again.owned, first.owned, 'and ownership is unchanged');
}

{
  // the palette changed under us, which is the drift that copy-and-paste cannot fix
  const first = pc.apply({ existing: undefined, themeLabel: 'Dark Modern', rules: ONE });
  const updated = pc.apply({
    existing: first.value, themeLabel: 'Dark Modern',
    rules: { '*.level1': '#NEW000' }, owned: first.owned,
  });
  same(updated.value['[Dark Modern]'].rules, { '*.level1': '#NEW000' },
    'reapplying picks up a changed palette value');
}

{
  // applied under one theme, then applied again under another
  const first = pc.apply({ existing: undefined, themeLabel: 'Dark Modern', rules: TWO });
  const moved = pc.apply({
    existing: first.value, themeLabel: 'Quiet Light', rules: ONE, owned: first.owned,
  });
  same(moved.value, {
    '[Quiet Light]': { enabled: true, rules: { '*.level1': '#AAAAAA' } },
  }, 'the key we wrote under the old theme is cleaned up, not orphaned');
  same(moved.owned.theme, 'Quiet Light', 'and ownership follows the new theme');
}

{
  // same, but the old theme's entry also holds something of theirs
  const existing = {
    '[Dark Modern]': { enabled: true, rules: { '*.level1': '#111111', 'x': '#USER00' } },
  };
  const owned = { theme: 'Dark Modern', names: ['*.level1'], enabledAdded: false };
  const moved = pc.apply({ existing, themeLabel: 'Quiet Light', rules: ONE, owned });
  same(moved.value['[Dark Modern]'], { enabled: true, rules: { 'x': '#USER00' } },
    'cleaning up the old theme keeps what was theirs, including enabled');
}

// ------------------------------------------------------------------ revert ----

{
  const first = pc.apply({ existing: undefined, themeLabel: 'Dark Modern', rules: TWO });
  const back = pc.revert({ existing: first.value, owned: first.owned });
  same(back.value, undefined,
    'reverting the only thing in the setting removes the setting');
  same(back.owned, null, 'and drops the record');
}

{
  const existing = {
    '[Dark Modern]': { enabled: true, rules: { '*.level1': '#111111', 'x': '#USER00' } },
  };
  const owned = { theme: 'Dark Modern', names: ['*.level1'], enabledAdded: false };
  const back = pc.revert({ existing, owned });
  same(back.value, { '[Dark Modern]': { enabled: true, rules: { 'x': '#USER00' } } },
    'revert takes our rule and leaves theirs, and leaves an enabled we did not add');
}

{
  const existing = { '[Dark Modern]': { enabled: true, rules: { '*.level1': '#111111' } } };
  const owned = { theme: 'Dark Modern', names: ['*.level1'], enabledAdded: true };
  const back = pc.revert({ existing, owned });
  same(back.value, undefined, 'an enabled flag we added goes back too');
}

{
  const existing = {
    '[Solarized Light]': { rules: { '*.level1': '#999' } },
    '[Dark Modern]': { enabled: true, rules: { '*.level1': '#111111' } },
  };
  const owned = { theme: 'Dark Modern', names: ['*.level1'], enabledAdded: true };
  const back = pc.revert({ existing, owned });
  same(back.value, { '[Solarized Light]': { rules: { '*.level1': '#999' } } },
    'another theme keeps the setting alive after ours is removed');
}

{
  const existing = { '[Dark Modern]': { rules: { 'x': '#USER00' } } };
  const back = pc.revert({ existing, owned: null });
  same(back.value, existing, 'with nothing claimed, revert changes nothing');
}

{
  // the record names a rule that is already gone, because the user deleted it
  const existing = { '[Dark Modern]': { rules: { 'x': '#USER00' } } };
  const owned = { theme: 'Dark Modern', names: ['*.level1'], enabledAdded: false };
  const back = pc.revert({ existing, owned });
  same(back.value, existing, 'a claimed rule that is already gone is not a problem');
}

{
  const back = pc.revert({ existing: undefined, owned: null });
  same(back.value, undefined, 'reverting nothing at all is safe');
}

// ---------------------------------------------------------------- appliedTo ----

check(pc.appliedTo({ theme: 'Dark Modern', names: ['*.level1'] }, 'Dark Modern'),
  'appliedTo is true for the theme we wrote');
check(!pc.appliedTo({ theme: 'Dark Modern', names: ['*.level1'] }, 'Quiet Light'),
  'appliedTo is false under a different theme');
check(!pc.appliedTo({ theme: 'Dark Modern', names: [] }, 'Dark Modern'),
  'appliedTo is false when nothing was actually written');
check(!pc.appliedTo(null, 'Dark Modern'), 'appliedTo is false with no record');

// ----------------------------------------------------------------- hasClaim ----
// Removal is offered on the strength of this, so a false here is a customization
// the user cannot get rid of through the command.

check(pc.hasClaim({ theme: 'Dark Modern', names: ['*.level1'], enabledAdded: false }),
  'hasClaim is true when we wrote rules');
check(pc.hasClaim({ theme: 'Dark Modern', names: [], enabledAdded: true }),
  'hasClaim is true for a lone enabled flag, which is all we own when the user '
  + 'had already written every level rule');
check(!pc.hasClaim({ theme: 'Dark Modern', names: [], enabledAdded: false }),
  'hasClaim is false when we wrote nothing at all');
check(!pc.hasClaim(null), 'hasClaim is false with no record');
check(!pc.hasClaim({ names: ['*.level1'] }), 'hasClaim needs a theme to act on');

// the point of the distinction: still removable after switching themes
{
  const owned = { theme: 'Dark Modern', names: ['*.level1'], enabledAdded: true };
  check(!pc.appliedTo(owned, 'Quiet Light'),
    'appliedTo is false once another theme is active');
  check(pc.hasClaim(owned),
    'but hasClaim is still true, so removal is still offered');
  const existing = {
    '[Dark Modern]': { enabled: true, rules: { '*.level1': '#111111' } },
  };
  const back = pc.revert({ existing, owned });
  same(back.value, undefined,
    'and reverting cleans the theme it was written under, not the active one');
}

// ------------------------------------------------------- no silent mutation ----

{
  const existing = { '[Dark Modern]': { enabled: true, rules: { 'x': '#USER00' } } };
  const snapshot = JSON.stringify(existing);
  pc.apply({ existing, themeLabel: 'Dark Modern', rules: TWO });
  same(JSON.stringify(existing), snapshot,
    'apply does not edit the object it was handed');
}

{
  const existing = { '[Dark Modern]': { enabled: true, rules: { '*.level1': '#111111' } } };
  const snapshot = JSON.stringify(existing);
  pc.revert({
    existing,
    owned: { theme: 'Dark Modern', names: ['*.level1'], enabledAdded: true },
  });
  same(JSON.stringify(existing), snapshot,
    'revert does not edit the object it was handed');
}

console.log('\n  %d checks, %d failures', checks, failures);
process.exit(failures ? 1 : 0);
