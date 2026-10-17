'use strict';

/**
 * Check the scanner against the levels already verified in Sublime Text.
 *
 * The line-to-level maps below are the same expectations used to verify the
 * Sublime schemes pixel by pixel, so agreement here means the two editors color
 * identical JSON identically. Run with: node test/test_scanner.js
 *
 * Copyright (C) 2026 Lance Duvall
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Project: <https://github.com/lanz/vscode-deep-json>
 * Licensed under the GNU Affero General Public License, version 3 or later.
 * See LICENSE, or <https://www.gnu.org/licenses/>.
 */

const fs = require('fs');
const path = require('path');
const { scan, PROPERTY, STRING, PUNCTUATION } = require('../src/scanner');

const SAMPLES = path.join(__dirname, '..', 'samples');

// one-based line number -> expected nesting level
const EXPECT = {
  'object.json': { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 7, 9: 8, 10: 9, 11: 10 },
  'array.json': { 2: 1, 3: 2, 5: 3, 7: 4, 9: 5, 11: 6, 13: 7, 15: 8, 17: 9, 19: 10 },
  'mixed.json': {
    2: 1, 3: 2, 5: 3, 8: 3, 9: 4, 10: 4, 12: 5, 13: 6, 15: 7, 17: 8, 18: 9, 20: 10,
  },
};

let failures = 0;
let checks = 0;

function fail(msg) {
  failures++;
  console.log('  FAIL ' + msg);
}

function check(cond, msg) {
  checks++;
  if (!cond) fail(msg);
}

// ---------------------------------------------------------------- samples ----
for (const [file, expected] of Object.entries(EXPECT)) {
  const text = fs.readFileSync(path.join(SAMPLES, file), 'utf8');
  const tokens = scan(text);
  // brackets are checked separately below; here we care about keys and values
  const byLine = new Map();
  for (const t of tokens) {
    if (t.kind === PUNCTUATION) continue;
    if (!byLine.has(t.line + 1)) byLine.set(t.line + 1, []);
    byLine.get(t.line + 1).push(t);
  }

  let ok = 0;
  for (const [lineStr, level] of Object.entries(expected)) {
    const lineNo = Number(lineStr);
    const onLine = byLine.get(lineNo) || [];
    if (onLine.length === 0) {
      fail(`${file} line ${lineNo}: no token found, expected level ${level}`);
      continue;
    }
    checks++;
    const wrong = onLine.filter((t) => t.level !== level);
    if (wrong.length) {
      fail(
        `${file} line ${lineNo}: expected level ${level}, got ` +
          wrong.map((t) => t.level).join(',')
      );
    } else {
      ok++;
    }
  }
  // no token should appear on a line we did not expect one on
  for (const lineNo of byLine.keys()) {
    checks++;
    if (!(lineNo in expected)) {
      fail(`${file} line ${lineNo}: unexpected token(s)`);
    }
  }
  console.log(`  ${file}: ${ok}/${Object.keys(expected).length} lines correct`);
}

// ---------------------------------------------------- keys versus values ----
{
  const tokens = scan('{"a": "b", "c": [1, 2]}').filter(
    (t) => t.kind !== PUNCTUATION
  );
  const kinds = tokens.map((t) => t.kind);
  check(kinds[0] === PROPERTY, `"a" should be a property, got ${kinds[0]}`);
  check(kinds[1] === STRING, `"b" should be a string, got ${kinds[1]}`);
  check(kinds[2] === PROPERTY, `"c" should be a property, got ${kinds[2]}`);
  check(
    tokens.slice(0, 3).every((t) => t.level === 1),
    'the keys and the string value are level 1'
  );
  check(
    tokens.slice(3).every((t) => t.level === 2),
    'the array elements are one level deeper than the key holding the array'
  );
  check(tokens.length === 5, `expected 5 tokens, got ${tokens.length}`);
}

// a string inside an array is never a key, even though it is inside an object too
{
  const tokens = scan('{"a": ["x"]}').filter((t) => t.kind !== PUNCTUATION);
  check(tokens[1].kind === STRING, '"x" in an array is a value, not a key');
  check(tokens[1].level === 2, `"x" should be level 2, got ${tokens[1].level}`);
}

// ------------------------------------------------------------- tolerance ----
{
  const cases = [
    ['{"a": 1,}', 'trailing comma'],
    ['{"a": 1 // note\n}', 'line comment'],
    ['{/* note */ "a": 1}', 'block comment'],
    ['{"a": ', 'truncated after a colon'],
    ['{"unterminated', 'unterminated string'],
    ['}]}', 'stray closers'],
    ['', 'empty document'],
    ['[[[[[]]]]]', 'only containers'],
  ];
  for (const [text, label] of cases) {
    checks++;
    try {
      scan(text);
    } catch (e) {
      fail(`threw on ${label}: ${e.message}`);
    }
  }
}

// a comment containing a newline must not desynchronise line numbers
{
  const tokens = scan('{\n/* two\nlines */\n"a": 1\n}').filter(
    (t) => t.kind !== PUNCTUATION
  );
  check(tokens.length === 2, `expected 2 tokens, got ${tokens.length}`);
  check(
    tokens[0].line === 3,
    `"a" should be on zero-based line 3, got ${tokens[0].line}`
  );
}

// escapes must not end a string early
{
  const tokens = scan('{"a\\"b": 1}').filter((t) => t.kind !== PUNCTUATION);
  check(tokens.length === 2, `escaped quote split the string: ${tokens.length} tokens`);
  check(tokens[0].kind === PROPERTY, 'the escaped-quote string is still a key');
}

// a bare top-level value has no container, so no level and no color
{
  check(scan('"hello"').length === 0, 'a container-less value should be skipped');
  check(scan('42').length === 0, 'a container-less number should be skipped');
}

// ------------------------------------------------------------- brackets ----
// A bracket takes the depth of the container it opens or closes, so a matched
// pair must share a level. That is the invariant worth testing.
for (const sample of ['object.json', 'array.json', 'mixed.json',
  'openapi.json']) {
  const text = fs.readFileSync(path.join(SAMPLES, sample), 'utf8');
  const lines = text.split('\n');
  const open = [];
  let mismatched = 0;
  let count = 0;
  for (const t of scan(text)) {
    if (t.kind !== PUNCTUATION) continue;
    count++;
    const ch = lines[t.line][t.startChar];
    checks++;
    if (!'{}[]'.includes(ch)) {
      fail(`${sample}: bracket token points at ${JSON.stringify(ch)}`);
      continue;
    }
    if (ch === '{' || ch === '[') {
      open.push({ ch, level: t.level });
    } else {
      const opener = open.pop();
      checks++;
      if (!opener) {
        fail(`${sample}: closer with no opener at ${t.line + 1}`);
      } else if (opener.level !== t.level) {
        mismatched++;
        fail(
          `${sample}: pair levels differ, opener ${opener.level} closer ${t.level}`
        );
      }
    }
  }
  checks++;
  if (open.length) fail(`${sample}: ${open.length} unclosed bracket(s)`);
  console.log(
    `  ${sample}: ${count} brackets, ${mismatched} mismatched pairs, ` +
      `${open.length} unclosed`
  );
}

// the outermost bracket is level 1, and depth increases inward
{
  const tokens = scan('{"a": [{"b": 1}]}').filter((t) => t.kind === PUNCTUATION);
  const levels = tokens.map((t) => t.level).join(',');
  check(levels === '1,2,3,3,2,1', `bracket levels were ${levels}`);
}

// numbers, booleans and null
{
  const tokens = scan('{"n": -12.5e+3, "t": true, "f": false, "z": null}').filter(
    (t) => t.kind !== PUNCTUATION
  );
  const kinds = tokens.map((t) => t.kind).join(',');
  check(
    kinds === 'property,number,property,keyword,property,keyword,property,keyword',
    `unexpected kinds: ${kinds}`
  );
}

// depth beyond the sample files still counts correctly
{
  const deep = '{"a":'.repeat(30) + '1' + '}'.repeat(30);
  const tokens = scan(deep).filter((t) => t.kind !== PUNCTUATION);
  const last = tokens[tokens.length - 1];
  check(last.level === 30, `deepest value should be level 30, got ${last.level}`);
  check(tokens[0].level === 1, 'outermost key should be level 1');
}

// positions must be usable: every token must sit where it says it does
{
  const text = fs.readFileSync(path.join(SAMPLES, 'mixed.json'), 'utf8');
  const lines = text.split('\n');
  for (const t of scan(text)) {
    checks++;
    const slice = lines[t.line].substr(t.startChar, t.length);
    if (!/^("|-|\d|true|false|null|[{}[\]])/.test(slice)) {
      fail(`token at ${t.line}:${t.startChar} points at ${JSON.stringify(slice)}`);
    }
  }
}

console.log(`\n  ${checks} checks, ${failures} failures`);
process.exit(failures ? 1 : 0);
