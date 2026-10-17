'use strict';

/**
 * Encoding and diffing of semantic token data.
 *
 * VS Code wants tokens as a flat Uint32Array, five integers per token, each one
 * delta-encoded against the token before it:
 *
 *   deltaLine, deltaStart, length, tokenType, tokenModifiers
 *
 * deltaStart is relative to the previous token when both are on the same line,
 * and absolute otherwise. That encoding is why reporting edits is worth doing: a
 * change on one line usually perturbs only the few integers around it, because
 * every later token is described relative to its neighbour rather than absolutely.
 *
 * Kept separate from extension.js so it can be tested without the editor.
 *
 * Copyright (C) 2026 Lance Duvall
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Project: <https://github.com/lanz/vscode-deep-json>
 * Licensed under the GNU Affero General Public License, version 3 or later.
 * See LICENSE, or <https://www.gnu.org/licenses/>.
 */

/**
 * Flatten scanner tokens into the delta-encoded form VS Code expects.
 *
 * @param {Array} tokens from scanner.scan()
 * @param {Map<string, number>} typeIndex token kind -> legend index
 * @param {number} maxLevel deepest level with a modifier of its own
 * @returns {Uint32Array}
 */
function encode(tokens, typeIndex, maxLevel) {
  const data = new Uint32Array(tokens.length * 5);
  let at = 0;
  let prevLine = 0;
  let prevStart = 0;

  for (const token of tokens) {
    const type = typeIndex.get(token.kind);
    if (type === undefined) continue;

    const deltaLine = token.line - prevLine;
    const deltaStart = deltaLine === 0 ? token.startChar - prevStart : token.startChar;
    const level = Math.min(token.level, maxLevel);

    data[at++] = deltaLine;
    data[at++] = deltaStart;
    data[at++] = token.length;
    data[at++] = type;
    data[at++] = 1 << (level - 1); // exactly one modifier per token

    prevLine = token.line;
    prevStart = token.startChar;
  }

  return at === data.length ? data : data.subarray(0, at);
}

/**
 * The single contiguous edit that turns `before` into `after`.
 *
 * Trims the matching head and tail and reports what is left, which is what the
 * semantic tokens edits API takes. Returns null when the two are identical.
 *
 * @returns {{start: number, deleteCount: number, data: Uint32Array}|null}
 */
function diff(before, after) {
  const n = before.length;
  const m = after.length;

  let head = 0;
  const limit = Math.min(n, m);
  while (head < limit && before[head] === after[head]) head++;

  if (head === n && head === m) return null; // identical

  let tail = 0;
  while (
    tail < limit - head &&
    before[n - 1 - tail] === after[m - 1 - tail]
  ) {
    tail++;
  }

  return {
    start: head,
    deleteCount: n - head - tail,
    data: after.subarray(head, m - tail),
  };
}

module.exports = { encode, diff };
