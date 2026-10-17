'use strict';

/**
 * Tests for the deep-bracket policy, as a full truth table.
 *
 * Four inputs with two values each, times three policies, is 24 cases. All of them
 * are enumerated rather than sampled, because the costly mistakes here are writing
 * to a user's settings when we should not and clearing a value we did not write.
 *
 * Run with: node test/test_deep_brackets.js
 *
 * Copyright (C) 2026 Lance Duvall
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Project: <https://github.com/lanz/vscode-deep-json>
 * Licensed under the GNU Affero General Public License, version 3 or later.
 * See LICENSE, or <https://www.gnu.org/licenses/>.
 */

const policy = require('../src/deep_brackets');
const { decide, SET, CLEAR, LEAVE, AUTO, ON, OFF } = policy;

let checks = 0;
let failures = 0;

function check(cond, msg) {
  checks++;
  if (!cond) {
    failures++;
    console.log('  FAIL ' + msg);
  }
}

const bools = [false, true];

// ------------------------------------------------------------ truth table ----
// Written out literally rather than derived, so it constrains the implementation
// instead of restating it. Key is policy/themeIsOurs/hasValue/weOwnIt.
const EXPECT = {
  // auto: follow the theme
  'auto/false/false/false': LEAVE, // another theme, nothing set
  'auto/false/false/true': LEAVE, // stale ownership flag, nothing to clear
  'auto/false/true/false': LEAVE, // the user's own value
  'auto/false/true/true': CLEAR, // ours, and we have left our themes
  'auto/true/false/false': SET,
  'auto/true/false/true': SET, // stale flag, value absent, so write it
  'auto/true/true/false': LEAVE, // the user's own value
  'auto/true/true/true': LEAVE, // already on

  // on: ignore the theme entirely
  'on/false/false/false': SET,
  'on/false/false/true': SET,
  'on/false/true/false': LEAVE,
  'on/false/true/true': LEAVE,
  'on/true/false/false': SET,
  'on/true/false/true': SET,
  'on/true/true/false': LEAVE,
  'on/true/true/true': LEAVE,

  // off: never on, and clean up anything of ours
  'off/false/false/false': LEAVE,
  'off/false/false/true': LEAVE,
  'off/false/true/false': LEAVE,
  'off/false/true/true': CLEAR,
  'off/true/false/false': LEAVE,
  'off/true/false/true': LEAVE,
  'off/true/true/false': LEAVE,
  'off/true/true/true': CLEAR,
};

// every combination must be covered, or the table has drifted
check(Object.keys(EXPECT).length === 24, 'the table should hold 24 cases');
for (const p of [AUTO, ON, OFF]) {
  for (const themeIsOurs of bools) {
    for (const hasValue of bools) {
      for (const weOwnIt of bools) {
        const key = [p, themeIsOurs, hasValue, weOwnIt].join('/');
        check(key in EXPECT, `${key} is missing from the table`);
      }
    }
  }
}
// and every case must actually decide the way the table says
for (const [key, want] of Object.entries(EXPECT)) {
  const [p, themeIsOurs, hasValue, weOwnIt] = key.split('/');
  const got = decide({
    policy: p,
    themeIsOurs: themeIsOurs === 'true',
    hasValue: hasValue === 'true',
    weOwnIt: weOwnIt === 'true',
  });
  check(got === want, `${key}: expected ${want}, got ${got}`);
}
console.log(`  truth table: ${Object.keys(EXPECT).length} cases`);

// ------------------------------------------------- the invariants that matter ----
// 1. A value the extension did not write is never disturbed, under any policy.
for (const p of [AUTO, ON, OFF]) {
  for (const themeIsOurs of bools) {
    check(
      decide({ policy: p, themeIsOurs, hasValue: true, weOwnIt: false }) === LEAVE,
      `${p}/${themeIsOurs}: a user-set value must be left alone`
    );
  }
}

// 2. Switching away from our themes under auto gives the brackets back.
check(
  decide({ policy: AUTO, themeIsOurs: false, hasValue: true, weOwnIt: true }) === CLEAR,
  'auto must clear its own value once another theme is active'
);

// 3. Off never writes, and cleans up after itself.
check(
  decide({ policy: OFF, themeIsOurs: true, hasValue: false, weOwnIt: false }) === LEAVE,
  'off must not write'
);
check(
  decide({ policy: OFF, themeIsOurs: true, hasValue: true, weOwnIt: true }) === CLEAR,
  'off must clear a value it previously wrote'
);

// 4. On is theme-independent.
for (const themeIsOurs of bools) {
  check(
    decide({ policy: ON, themeIsOurs, hasValue: false, weOwnIt: false }) === SET,
    `on must write regardless of theme (themeIsOurs=${themeIsOurs})`
  );
}

// 5. Already in the wanted state is a no-op, so no redundant settings writes.
check(
  decide({ policy: ON, themeIsOurs: true, hasValue: true, weOwnIt: true }) === LEAVE,
  'an already-correct value must not be rewritten'
);

// ----------------------------------------------------------------- policy ----
check(policy.normalize('auto') === AUTO, 'auto normalizes to itself');
check(policy.normalize('off') === OFF, 'off normalizes to itself');
check(policy.normalize(undefined) === AUTO, 'a missing policy falls back to auto');
check(policy.normalize('nonsense') === AUTO, 'an invalid policy falls back to auto');
check(policy.POLICIES.length === 3, 'there are three policies');

console.log(`\n  ${checks} checks, ${failures} failures`);
process.exit(failures ? 1 : 0);
