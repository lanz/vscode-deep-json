'use strict';

/**
 * Decides whether the deep-bracket setting should be written, cleared, or left be.
 *
 * Coloring brackets past level 6 means suppressing VS Code's built-in bracket
 * colorizer, whose six editorBracketHighlight slots cycle and whose decorations
 * paint over semantic tokens. The only way to suppress it is the language-scoped
 * setting editor.language.colorizedBracketPairs, and an empty list is the value
 * that does it. `colorizedBracketPairs` is absent from the extension API, so a
 * language configuration contribution cannot be used: that applies to every theme
 * at once, which would strip bracket colors from JSON for people using a theme
 * from somewhere else entirely.
 *
 * So the setting is the mechanism, and this module is the policy. It is kept pure
 * and separate from the vscode module so the whole table can be tested offline.
 *
 * Copyright (C) 2026 Lance Duvall
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Project: <https://github.com/lanz/vscode-deep-json>
 * Licensed under the GNU Affero General Public License, version 3 or later.
 * See LICENSE, or <https://www.gnu.org/licenses/>.
 */

/** Follow the active theme: on for ours, off for anyone else's. The default. */
const AUTO = 'auto';
/** On under every theme. */
const ON = 'on';
/** Never on; the built-in six-color colorizer keeps the brackets. */
const OFF = 'off';

const POLICIES = [AUTO, ON, OFF];

const SET = 'set';
const CLEAR = 'clear';
const LEAVE = 'leave';

/** Anything unrecognized falls back to the default rather than throwing. */
function normalize(policy) {
  return POLICIES.includes(policy) ? policy : AUTO;
}

/**
 * @param {object} state
 * @param {string} state.policy       one of AUTO, ON, OFF
 * @param {boolean} state.themeIsOurs is the active theme one this extension ships
 * @param {boolean} state.hasValue    is the setting currently present for this language
 * @param {boolean} state.weOwnIt     did this extension write the present value
 * @returns {'set'|'clear'|'leave'}
 */
function decide(state) {
  const policy = normalize(state.policy);

  // A value we did not write is the user's, whatever the policy says. Clearing it
  // would be exactly the kind of overreach a global contribution commits.
  if (state.hasValue && !state.weOwnIt) return LEAVE;

  const wanted = policy === ON || (policy === AUTO && state.themeIsOurs);
  if (wanted) return state.hasValue ? LEAVE : SET;
  return state.hasValue ? CLEAR : LEAVE;
}

module.exports = { decide, normalize, POLICIES, AUTO, ON, OFF, SET, CLEAR, LEAVE };
