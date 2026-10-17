'use strict';

/**
 * Tests for the token encoder and the edit diff, plus a measurement of how much
 * an edit actually saves. Run with: node test/test_encode.js
 *
 * Copyright (C) 2026 Lance Duvall
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Project: <https://github.com/lanz/vscode-deep-json>
 * Licensed under the GNU Affero General Public License, version 3 or later.
 * See LICENSE, or <https://www.gnu.org/licenses/>.
 */

const fs = require('fs');
const path = require('path');
const { scan } = require('../src/scanner');
const { encode, diff } = require('../src/encode');

const MAX_LEVEL = 20;
const TYPES = new Map([
  ['property', 0],
  ['string', 1],
  ['number', 2],
  ['keyword', 3],
  ['punctuation', 4],
]);

let checks = 0;
let failures = 0;

function check(cond, msg) {
  checks++;
  if (!cond) {
    failures++;
    console.log('  FAIL ' + msg);
  }
}

const enc = (text) => encode(scan(text), TYPES, MAX_LEVEL);

/** Undo the delta encoding, so the result can be checked against the scanner. */
function decode(data) {
  const out = [];
  let line = 0;
  let start = 0;
  for (let i = 0; i < data.length; i += 5) {
    const deltaLine = data[i];
    const deltaStart = data[i + 1];
    line += deltaLine;
    start = deltaLine === 0 ? start + deltaStart : deltaStart;
    out.push({
      line,
      startChar: start,
      length: data[i + 2],
      type: data[i + 3],
      modifiers: data[i + 4],
    });
  }
  return out;
}

// ------------------------------------------------------------- encoding ----
{
  const text = '{"a": 1}';
  const data = enc(text);
  // two brackets plus a key and a number
  check(data.length === 20, `expected 20 integers, got ${data.length}`);
  const decoded = decode(data);
  const a = decoded[1];
  const b = decoded[2];
  check(a.line === 0 && a.startChar === 1, 'the key starts at 0:1');
  check(a.length === 3, `the key is 3 chars ("a" with quotes), got ${a.length}`);
  check(a.type === 0, 'the key is a property');
  check(a.modifiers === 1, `level 1 is bit 0, got ${a.modifiers}`);
  check(b.type === 2, 'the number is a number');
}

// round trip: decoding must reproduce exactly what the scanner reported
for (const sample of ['object.json', 'array.json', 'mixed.json']) {
  const text = fs.readFileSync(path.join(__dirname, '..', 'samples', sample), 'utf8');
  const tokens = scan(text);
  const back = decode(encode(tokens, TYPES, MAX_LEVEL));
  check(back.length === tokens.length, `${sample}: token count changed`);
  for (let i = 0; i < tokens.length; i++) {
    if (
      back[i].line !== tokens[i].line ||
      back[i].startChar !== tokens[i].startChar ||
      back[i].length !== tokens[i].length
    ) {
      check(false, `${sample}: token ${i} did not round trip`);
      break;
    }
    checks++;
  }
  // the modifier bit must name the level the scanner found
  for (let i = 0; i < tokens.length; i++) {
    const expected = 1 << (Math.min(tokens[i].level, MAX_LEVEL) - 1);
    if (back[i].modifiers !== expected) {
      check(false, `${sample}: token ${i} level bit wrong`);
      break;
    }
  }
  checks++;
}

// levels past the cap collapse onto the last modifier
{
  const deep = '{"a":'.repeat(25) + '1' + '}'.repeat(25);
  // the last token is now the closing brace at level 1; the deepest value
  // is the number in the middle, so skip punctuation (type index 4)
  const last = decode(enc(deep)).filter((t) => t.type !== 4).pop();
  check(
    last.modifiers === 1 << (MAX_LEVEL - 1),
    `level 25 should use the level ${MAX_LEVEL} bit`
  );
}

// ----------------------------------------------------------------- diff ----
{
  const a = enc('{"a": 1}');
  check(diff(a, a) === null, 'identical data should report no edit');
}
{
  const before = enc('{"a": 1}');
  const after = enc('{"a": 1, "b": 2}');
  const d = diff(before, after);
  check(d !== null, 'adding a pair should report an edit');
  // applying the edit must reproduce `after` exactly
  const applied = Array.from(before);
  applied.splice(d.start, d.deleteCount, ...Array.from(d.data));
  check(
    applied.length === after.length && applied.every((v, i) => v === after[i]),
    'applying the edit did not reproduce the new data'
  );
}
{
  // deletion, the other direction
  const before = enc('{"a": 1, "b": 2}');
  const after = enc('{"a": 1}');
  const d = diff(before, after);
  const applied = Array.from(before);
  applied.splice(d.start, d.deleteCount, ...Array.from(d.data));
  check(
    applied.length === after.length && applied.every((v, i) => v === after[i]),
    'applying a deletion edit did not reproduce the new data'
  );
}

// ---------------------------------------------- how much does it save? ----
function makeBig(targetBytes) {
  const block = JSON.stringify(
    { get: { responses: { 200: { content: { 'application/json': {
      schema: { type: 'object', properties: { id: { type: 'string' } } } } } } } } },
    null,
    2
  ).replace(/\n/g, '\n    ');
  const parts = ['{\n  "paths": {\n'];
  let size = 0;
  let i = 0;
  while (size < targetBytes) {
    const e = '    "/r' + i + '": ' + block + ',\n';
    parts.push(e);
    size += e.length;
    i++;
  }
  parts.push('    "/last": {}\n  }\n}\n');
  return parts.join('');
}

console.log('\n  what an edit costs to report, versus sending everything:\n');
for (const mb of [0.5, 2, 5]) {
  const text = makeBig(mb * 1024 * 1024);
  const before = enc(text);

  // a realistic edit: rename one property in the middle of the document
  const mid = Math.floor(text.length / 2);
  const at = text.indexOf('"id"', mid);
  const edited = text.slice(0, at) + '"identifier"' + text.slice(at + 4);
  const after = enc(edited);

  const d = diff(before, after);
  const sent = d ? d.data.length : 0;
  console.log(
    '  %s MB  %s integers total  ->  edit sends %s  (%s%%)',
    mb.toFixed(1).padStart(4),
    before.length.toLocaleString().padStart(9),
    String(sent).padStart(6),
    ((sent / before.length) * 100).toFixed(3).padStart(6)
  );
}

console.log(`\n  ${checks} checks, ${failures} failures`);
process.exit(failures ? 1 : 0);
