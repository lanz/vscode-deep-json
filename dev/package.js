'use strict';

/**
 * Build the VSIX, named after the display name rather than the extension id.
 *
 * vsce names the file <name>-<version>.vsix. `name` is the Marketplace identity,
 * and ours is the shorter deep-json-themes because the Marketplace reserves an id
 * permanently once it has been published: deep-json-color-themes was taken, then
 * unpublished, and cannot be used again. The display name kept the longer form,
 * so the artifact is named from that instead.
 *
 * Nothing reads the filename. The Marketplace takes the identity from the
 * manifest and `code --install-extension` treats it as a path, so this is purely
 * so the file on disk reads as the product. dev/capture_screenshots.js finds it by
 * looking for the one VSIX in the repository root rather than by reconstructing
 * this name, which keeps one source of truth for it.
 *
 * Run:  npm run package
 *
 * Copyright (C) 2026 Lance Duvall
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Project: <https://github.com/lanz/vscode-deep-json>
 * Licensed under the GNU Affero General Public License, version 3 or later.
 * See LICENSE, or <https://www.gnu.org/licenses/>.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const MANIFEST = JSON.parse(
  fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')
);

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const out = slug(MANIFEST.displayName) + '-' + MANIFEST.version + '.vsix';

// Stale artifacts under other names would make "the one VSIX in the root"
// ambiguous, and the capture harness refuses to guess between them.
for (const name of fs.readdirSync(REPO)) {
  if (name.endsWith('.vsix') && name !== out) {
    fs.unlinkSync(path.join(REPO, name));
    console.log('  removed stale ' + name);
  }
}

// vsce comes from a global install; see the Development section of the README.
// Through a shell, because on Windows the global binary is a .cmd and Node will
// not launch one directly any more. One command string rather than an argument
// array, so nothing is concatenated unescaped behind our back.
execSync('vsce package --out ' + JSON.stringify(out),
  { cwd: REPO, stdio: 'inherit' });
