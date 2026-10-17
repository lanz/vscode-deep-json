'use strict';

/**
 * A tolerant JSON scanner that reports the nesting level of every value.
 *
 * It deliberately does not validate. Half-typed and malformed documents are the
 * normal case in an editor, so the scanner reports what it can and keeps going.
 * JSONC comments and trailing commas are accepted.
 *
 * Levels match the Sublime Text schemes this is a port of: a token's level is the
 * number of containers enclosing it, counting objects and arrays alike. A key and
 * the value it points at are therefore the same level, and so is an array element
 * at the same depth.
 *
 *   {"a": 1}                  "a" and 1 are level 1
 *   {"a": {"b": 2}}           "b" and 2 are level 2
 *   {"a": ["x"]}              "x" is level 2
 *
 * A value at the top level with no container around it has level 0 and is skipped,
 * which is what the Sublime schemes do too.
 *
 * Copyright (C) 2026 Lance Duvall
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Project: <https://github.com/lanz/vscode-deep-json>
 * Licensed under the GNU Affero General Public License, version 3 or later.
 * See LICENSE, or <https://www.gnu.org/licenses/>.
 */

const OBJECT = 'object';
const ARRAY = 'array';

/** Token kinds the scanner reports. These map to semantic token types. */
const PROPERTY = 'property';
const STRING = 'string';
const NUMBER = 'number';
const KEYWORD = 'keyword';
/** A brace or bracket. Carries the depth of the container it opens or closes. */
const PUNCTUATION = 'punctuation';

function isWhitespace(ch) {
  return ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n';
}

function isDigit(ch) {
  return ch >= '0' && ch <= '9';
}

/**
 * Index of the next character that is neither whitespace nor a comment.
 * Used to look ahead for the ':' that marks a string as an object key.
 */
function skipTrivia(text, i) {
  while (i < text.length) {
    const ch = text[i];
    if (isWhitespace(ch)) {
      i++;
    } else if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
    } else if (ch === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i += 2;
    } else {
      return i;
    }
  }
  return i;
}

/**
 * Scan `text` and return tokens in document order.
 *
 * Each token is {line, startChar, length, kind, level} with zero-based line and
 * character, which is what VS Code's SemanticTokensBuilder expects.
 */
function scan(text) {
  const tokens = [];
  const stack = [];
  let i = 0;
  let line = 0;
  let lineStart = 0;

  /** Record a token that lies on a single line. */
  function emit(start, end, kind) {
    const level = stack.length;
    if (level < 1) return; // a container-less value, as in a bare "string" file
    tokens.push({
      line,
      startChar: start - lineStart,
      length: end - start,
      kind,
      level,
    });
  }

  while (i < text.length) {
    const ch = text[i];

    if (ch === '\n') {
      line++;
      i++;
      lineStart = i;
      continue;
    }
    if (isWhitespace(ch)) {
      i++;
      continue;
    }

    // comments
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        if (text[i] === '\n') {
          line++;
          lineStart = i + 1;
        }
        i++;
      }
      i += 2;
      continue;
    }

    // containers
    if (ch === '{' || ch === '[') {
      stack.push(ch === '{' ? OBJECT : ARRAY);
      // emitted after the push, so the bracket takes the depth of the container
      // it opens -- the outermost { is level 1, matching its closing }
      emit(i, i + 1, PUNCTUATION);
      i++;
      continue;
    }
    if (ch === '}' || ch === ']') {
      // emitted before the pop, for the same reason
      emit(i, i + 1, PUNCTUATION);
      // tolerate a stray closer rather than going negative
      if (stack.length > 0) stack.pop();
      i++;
      continue;
    }

    // strings: either an object key or a string value
    if (ch === '"') {
      const start = i;
      i++;
      while (i < text.length) {
        const c = text[i];
        if (c === '\\') {
          i += 2;
          continue;
        }
        if (c === '"') {
          i++;
          break;
        }
        if (c === '\n') break; // unterminated; do not run past the line
        i++;
      }
      const end = i;
      const inObject = stack[stack.length - 1] === OBJECT;
      const nextCh = text[skipTrivia(text, i)];
      emit(start, end, inObject && nextCh === ':' ? PROPERTY : STRING);
      continue;
    }

    // numbers
    if (isDigit(ch) || (ch === '-' && isDigit(text[i + 1]))) {
      const start = i;
      if (ch === '-') i++;
      while (i < text.length && isDigit(text[i])) i++;
      if (text[i] === '.') {
        i++;
        while (i < text.length && isDigit(text[i])) i++;
      }
      if (text[i] === 'e' || text[i] === 'E') {
        i++;
        if (text[i] === '+' || text[i] === '-') i++;
        while (i < text.length && isDigit(text[i])) i++;
      }
      emit(start, i, NUMBER);
      continue;
    }

    // true / false / null
    let matched = null;
    for (const word of ['true', 'false', 'null']) {
      if (text.startsWith(word, i)) {
        matched = word;
        break;
      }
    }
    if (matched) {
      emit(i, i + matched.length, KEYWORD);
      i += matched.length;
      continue;
    }

    i++; // anything else, including ':' and ',', carries no color
  }

  return tokens;
}

module.exports = { scan, PROPERTY, STRING, NUMBER, KEYWORD, PUNCTUATION };
