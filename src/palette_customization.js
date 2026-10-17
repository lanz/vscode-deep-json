'use strict';

/**
 * Puts one of this extension's palettes on top of someone else's theme.
 *
 * VS Code has one theme at a time and no per-language option, so a palette
 * cannot be selected for JSON alone the way a Sublime color scheme can. It does not
 * have to be: the depth coloring comes from the semantic token provider, not from
 * the theme, and the provider runs under whatever theme is active and labels only
 * JSON. All a theme supplies is the level-to-color mapping, and the user can supply
 * that themselves through editor.semanticTokenColorCustomizations.
 *
 * Doing that by hand means copying twenty to forty hex values into settings.json,
 * under a key that has to match the active theme's label exactly, and recopying
 * them whenever a palette changes. This module is the part of doing it for them
 * that is worth testing: merging into a setting that belongs to the user, and
 * knowing afterwards which of its entries are ours.
 *
 * Kept free of the vscode module so the whole table can be exercised offline.
 *
 * WHAT OWNERSHIP IS FOR
 *
 * The setting is shared. It may already hold rules for other themes, other fields
 * under this theme's key, and rules the user wrote by hand for the very names this
 * writes. So an ownership record travels with it:
 *
 *   { theme: 'Dark Modern', names: ['*.level1', ...], enabledAdded: true }
 *
 * and three things follow from it. A rule the record does not name is the user's
 * and is never overwritten or removed. A rule the record names but the new palette
 * does not is ours and stale, so it goes. And applying under a different theme
 * cleans up the key it last wrote, rather than leaving an orphan behind that does
 * nothing and explains nothing.
 *
 * Copyright (C) 2026 Lance Duvall
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Project: <https://github.com/lanz/vscode-deep-json>
 * Licensed under the GNU Affero General Public License, version 3 or later.
 * See LICENSE, or <https://www.gnu.org/licenses/>.
 */

/** The bracketed form VS Code uses to scope a customization to one theme. */
function themeKey(label) {
  return '[' + label + ']';
}

/** Plain data throughout, so this is enough, and it works on every supported
 *  Node. structuredClone is not available on the oldest engine we declare. */
function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isEmpty(object) {
  return !object || Object.keys(object).length === 0;
}

/** The level rules out of a theme file, or nothing if it has none. */
function rulesFromTheme(theme) {
  const rules = theme && theme.semanticTokenColors;
  return rules && typeof rules === 'object' ? clone(rules) : {};
}

/** Drop the rules a record claims from one theme's entry, and tidy up after. */
function strip(customizations, record) {
  if (!record || !record.theme) return customizations;
  const key = themeKey(record.theme);
  const entry = customizations[key];
  if (!entry) return customizations;

  if (entry.rules) {
    for (const name of record.names || []) delete entry.rules[name];
    if (isEmpty(entry.rules)) delete entry.rules;
  }
  if (record.enabledAdded) delete entry.enabled;
  // an entry we have emptied was ours alone, so it should not linger
  if (isEmpty(entry)) delete customizations[key];
  return customizations;
}

/**
 * Merge a palette into editor.semanticTokenColorCustomizations.
 *
 * @param {object}  args
 * @param {object=} args.existing   the setting's current value, if any
 * @param {string}  args.themeLabel the active theme, from workbench.colorTheme
 * @param {object}  args.rules      semanticTokenColors from the chosen palette
 * @param {object=} args.owned      the record from the last apply, if any
 * @returns {{ value: object|undefined, owned: object }}
 */
function apply(args) {
  const { themeLabel, rules } = args;
  const next = clone(args.existing) || {};

  // If the last apply went to another theme, that key is ours to clean up.
  if (args.owned && args.owned.theme && args.owned.theme !== themeLabel) {
    strip(next, args.owned);
  }

  const key = themeKey(themeLabel);
  const entry = next[key] || {};
  const before = clone(entry.rules) || {};
  const ourNames = new Set(
    (args.owned && args.owned.theme === themeLabel && args.owned.names) || []
  );

  // Start from what is there, minus the rules we put there last time. What
  // survives is the user's, and it wins over the palette.
  const merged = {};
  for (const [name, color] of Object.entries(before)) {
    if (!ourNames.has(name)) merged[name] = color;
  }
  const written = [];
  for (const [name, color] of Object.entries(rules)) {
    if (Object.prototype.hasOwnProperty.call(merged, name)) continue;
    merged[name] = color;
    written.push(name);
  }

  // Semantic highlighting has to be on for any of this to show, and a theme that
  // is not ours may well leave it off. Whether we introduced the flag is recorded
  // so that reverting can put the setting back exactly as it was.
  //
  // The claim is sticky. On a second apply the flag is already true because we set
  // it the first time, so recomputing from the current value would quietly hand it
  // back to the user and leave it behind on revert.
  const keptClaim = !!(
    args.owned && args.owned.theme === themeLabel && args.owned.enabledAdded
  );
  const enabledAdded = keptClaim || entry.enabled !== true;
  entry.enabled = true;
  if (!isEmpty(merged)) entry.rules = merged;
  next[key] = entry;

  return {
    value: next,
    owned: { theme: themeLabel, names: written, enabledAdded },
  };
}

/**
 * Take back exactly what apply added, and nothing else.
 *
 * @returns {{ value: object|undefined, owned: null }} value undefined means the
 *          setting should be removed rather than written as an empty object.
 */
function revert(args) {
  const owned = args.owned;
  if (!owned || !owned.theme) {
    return { value: clone(args.existing), owned: null };
  }
  const next = strip(clone(args.existing) || {}, owned);
  return { value: isEmpty(next) ? undefined : next, owned: null };
}

/** Is this record describing a palette currently applied to this theme? */
function appliedTo(owned, themeLabel) {
  return !!(owned && owned.theme === themeLabel && (owned.names || []).length);
}

/**
 * Is there anything of ours left anywhere, whatever theme is active now?
 *
 * Deliberately not appliedTo. Removal has to be offered after switching themes,
 * since what we wrote is still in the settings and attached to the theme we wrote
 * it under; asking someone to switch back to the old theme to undo this would be
 * absurd. It also counts a lone enabled flag, which is all we own if the user had
 * already written every level rule themselves.
 */
function hasClaim(owned) {
  if (!owned || !owned.theme) return false;
  return (owned.names || []).length > 0 || !!owned.enabledAdded;
}

module.exports = {
  themeKey,
  rulesFromTheme,
  apply,
  revert,
  appliedTo,
  hasClaim,
};
