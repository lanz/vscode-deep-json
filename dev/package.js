'use strict';

/**
 * Build the VSIX, under the product's full name.
 *
 * vsce names the file <name>-<version>.vsix, after the Marketplace identity. The
 * Marketplace reserves both an id and a display name permanently once they have
 * been published, and deep-json-color-themes was published and then unpublished,
 * which took both of its forms with it. So the id is deep-json and the display
 * name is Deep JSON, and the artifact is where the full name still fits.
 *
 * Nothing reads the filename. The Marketplace takes the identity from the
 * manifest and `code --install-extension` treats it as a path, so this is purely
 * so the file on disk reads as the product. dev/capture_screenshots.js finds it by
 * looking for the one VSIX in the repository root rather than by reconstructing
 * the name, so it stays written in one place.
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

// Pinned, not derived. The display name is "Deep JSON" and the extension id is
// deep-json, because the Marketplace had already reserved both longer forms;
// naming the artifact for the product keeps the full name somewhere it is free.
const ARTIFACT = 'deep-json-color-themes';

const out = ARTIFACT + '-' + MANIFEST.version + '.vsix';

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
