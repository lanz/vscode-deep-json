'use strict';

/**
 * Capture one screenshot per theme per sample, straight out of the editor.
 *
 * VS Code is an Electron app, so it accepts --remote-debugging-port and can be
 * driven over the Chrome DevTools Protocol. That is worth the trouble over a
 * desktop screen grab: the renderer is captured directly, so the window does not
 * need to be visible or focused, and the clip rectangle is computed from the DOM
 * rather than guessed, which keeps every theme's image identical in geometry.
 *
 * Each capture gets a throwaway user-data-dir, so the real editor's settings and
 * selected theme are never touched, and a throwaway extensions-dir holding only
 * this extension. The deep-bracket policy is left at its default of "auto", so
 * each run also exercises the reconciler against each theme.
 *
 * Knowing when to press the shutter is the whole problem. Three things land
 * asynchronously and independently: the lines render, the semantic tokens arrive,
 * and the reconciler's setting takes effect. Weaker signals were tried, and each
 * one produced wrong screenshots:
 *
 *   - a count of distinct colors is satisfied by plain TextMate coloring
 *   - so is the presence of every palette color, for Monokai Neue, whose
 *     palette is the base Monokai token set
 *   - neither notices that the built-in bracket colorizer is still painting, which
 *     shows up as brackets past level 6 cycling through its six slots
 *
 * So readiness is checked against the scanner itself. Every token's expected color
 * is computed from src/scanner.js and the theme, and the capture waits until each
 * line in the DOM carries the colors it should. That makes a captured frame correct
 * by construction, and dev/verify_screenshots.py then checks the written pixels.
 *
 * Windows only as written, because of the executable path and taskkill.
 *
 * Run:  node dev/capture_screenshots.js
 *       node dev/capture_screenshots.js "Deep JSON: Monokai Chalk"   (one theme)
 *       SHOT_SAMPLE=mixed node dev/capture_screenshots.js            (one sample)
 *
 * Copyright (C) 2026 Lance Duvall
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Project: <https://github.com/lanz/vscode-deep-json>
 * Licensed under the GNU Affero General Public License, version 3 or later.
 * See LICENSE, or <https://www.gnu.org/licenses/>.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const THEME_LABELS = require(path.join(REPO, 'src', 'theme_labels.js'));
const { scan, PUNCTUATION } = require(path.join(REPO, 'src', 'scanner.js'));
// label -> screenshot folder. Generated, because a label like
// "Deep JSON: Monokai Classic" cannot be a directory name on Windows.
const THEME_DIRS = require(path.join(__dirname, 'theme_dirs.json'));
// derived, so renaming the extension or bumping its version cannot leave a
// stale path here
const MANIFEST = JSON.parse(
  fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')
);
// The one VSIX in the repository root, whatever it is called. dev/package.js
// decides that name and clears any other, so reconstructing it here would just be
// a second place to keep it.
const VSIX = (() => {
  const found = fs.readdirSync(REPO).filter((f) => f.endsWith('.vsix'));
  if (found.length > 1) {
    throw new Error(
      'more than one VSIX in ' + REPO + ': ' + found.join(', ') +
        '\n  delete the stale ones, or run:  npm run package'
    );
  }
  return found.length ? path.join(REPO, found[0]) : path.join(REPO, 'extension.vsix');
})();
const MAX_LEVEL = 20;

/**
 * Where VS Code is installed.
 *
 * It can be per-user or system-wide, and VSCodium is a drop-in for these
 * purposes, so the install is searched for rather than assumed. This mirrors
 * SEARCH_ROOTS in dev/extract_vscode_dark_base.py; a hardcoded per-user path here
 * broke the moment the editor was reinstalled for all users. VSCODE_EXE still
 * overrides, for an install somewhere else entirely.
 */
function findCode() {
  if (process.env.VSCODE_EXE) return process.env.VSCODE_EXE;
  const roots = [
    [process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe'],
    [process.env.ProgramFiles, 'Microsoft VS Code', 'Code.exe'],
    [process.env['ProgramFiles(x86)'], 'Microsoft VS Code', 'Code.exe'],
    [process.env.LOCALAPPDATA, 'Programs', 'VSCodium', 'VSCodium.exe'],
    [process.env.ProgramFiles, 'VSCodium', 'VSCodium.exe'],
  ];
  for (const parts of roots) {
    if (!parts[0]) continue;
    const candidate = path.join(...parts);
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    'could not find VS Code. Looked in:\n  ' +
    roots.filter((p) => p[0]).map((p) => path.join(...p)).join('\n  ') +
    '\n  Set VSCODE_EXE to the executable to use another install.'
  );
}

const CODE_EXE = findCode();

const TMP = path.join(os.tmpdir(), 'vsc-shots');
const USER_DATA = path.join(TMP, 'user-data');
const EXTENSIONS = path.join(TMP, 'extensions');
const PORT = Number(process.env.CDP_PORT || 9333);
// Matches the font size set in the real editor, so the images look like what
// the author actually sees. Override with SHOT_FONT_SIZE.
const FONT_SIZE = Number(process.env.SHOT_FONT_SIZE || 15);

// sample -> how many lines carry content
// sample -> how many lines carry content. openapi.json is here for the README:
// it is realistic rather than synthetic, so its rows carry several levels each
// and the pixel verifier cannot attribute them. The per-token check below still
// validates every one of its colors before the shutter fires.
const SAMPLES = { object: 21, array: 29, mixed: 30, openapi: 56 };

// padding around the tight content box, in CSS pixels
const PAD = { left: 0, top: 6, right: 16, bottom: 6 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --------------------------------------------------------------- profile ----

function writeSettings(themeLabel) {
  const settings = {
    'workbench.colorTheme': themeLabel,
    // the shipped default, so the screenshots show default behavior and every run
    // re-tests the reconciler
    'deepJson.deepBrackets': 'auto',
    'editor.fontFamily': 'Consolas, monospace',
    'editor.fontSize': FONT_SIZE,
    'editor.semanticHighlighting.enabled': true,
    // everything below exists to keep the pixels deterministic
    'editor.minimap.enabled': false,
    'editor.renderLineHighlight': 'none',
    'editor.cursorBlinking': 'solid',
    // the cursor parks beside the outermost brace, and bracket matching would
    // otherwise draw a box around it and its partner
    'editor.matchBrackets': 'never',
    // Off by default: guides are vertical lines through the content area, and
    // the pixel verifier bands rows and takes a dominant color, which they
    // would pollute. SHOT_GUIDES=1 turns them on to look at them.
    'editor.guides.indentation': !!process.env.SHOT_GUIDES,
    'editor.guides.highlightActiveIndentation': !!process.env.SHOT_GUIDES,
    'editor.guides.bracketPairs': false,
    'editor.stickyScroll.enabled': false,
    'editor.renderWhitespace': 'none',
    'editor.scrollBeyondLastLine': false,
    'editor.occurrencesHighlight': 'off',
    'editor.selectionHighlight': false,
    'editor.lineNumbers': 'on',
    'editor.folding': false,
    'window.zoomLevel': 0,
    'window.restoreWindows': 'none',
    'files.hotExit': 'off',
    'workbench.startupEditor': 'none',
    'workbench.tips.enabled': false,
    'extensions.ignoreRecommendations': true,
    'telemetry.telemetryLevel': 'off',
    'update.mode': 'none',
  };
  fs.mkdirSync(path.join(USER_DATA, 'User'), { recursive: true });
  fs.writeFileSync(
    path.join(USER_DATA, 'User', 'settings.json'),
    JSON.stringify(settings, null, 2) + '\n'
  );
}

/**
 * Locate out/cli.js inside the install.
 *
 * bin/code.cmd is only a wrapper: it sets ELECTRON_RUN_AS_NODE and hands cli.js to
 * Code.exe. Calling the .cmd from here would need a shell, and the install path
 * contains spaces, so the wrapper is reproduced directly instead. cli.js sits under
 * a build-hash directory that changes with every update, hence the search.
 */
function findCli() {
  const root = path.dirname(CODE_EXE);
  const tail = path.join('resources', 'app', 'out', 'cli.js');
  const direct = path.join(root, tail);
  if (fs.existsSync(direct)) return direct;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const nested = path.join(root, entry.name, tail);
    if (fs.existsSync(nested)) return nested;
  }
  throw new Error('could not find cli.js under ' + root);
}

/**
 * Files that change what gets rendered and are newer than the VSIX itself.
 *
 * The manifest, the themes and the sources, not the whole payload: editing the
 * README would otherwise invalidate a VSIX that renders identically.
 *
 * The VSIX is what gets installed, so a stale one captures the previous build.
 * A theme added since it was packaged is simply absent, VS Code falls back to
 * its own default, and every expected color goes missing at once. That reads
 * exactly like a broken theme, which is worth an assertion rather than an
 * afternoon.
 */
function staleAgainst(vsixAt) {
  const newer = [];
  const visit = (target) => {
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(target)) visit(path.join(target, entry));
    } else if (stat.mtimeMs > vsixAt) {
      newer.push(path.relative(REPO, target));
    }
  };
  for (const entry of ['package.json', 'themes', 'src']) visit(path.join(REPO, entry));
  return newer.sort();
}

function installExtension() {
  if (!fs.existsSync(VSIX)) {
    throw new Error(
      'package the extension first; no VSIX at ' + VSIX + '\n' +
      '  npm run package'
    );
  }
  const newer = staleAgainst(fs.statSync(VSIX).mtimeMs);
  if (newer.length) {
    throw new Error(
      path.basename(VSIX) + ' is older than ' + newer.length + ' file(s) it ' +
      'would carry, starting with ' + newer.slice(0, 3).join(', ') + '.\n' +
      '  Repackage, then capture again:  npm run package'
    );
  }
  fs.mkdirSync(EXTENSIONS, { recursive: true });
  try {
    execFileSync(
      CODE_EXE,
      [findCli(), '--extensions-dir', EXTENSIONS, '--install-extension', VSIX, '--force'],
      { stdio: 'pipe', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }
    );
  } catch (error) {
    const detail = [error.stdout, error.stderr]
      .filter(Boolean)
      .map((b) => b.toString().trim())
      .join(' / ');
    throw new Error('installing the extension failed: ' + (detail || error.message));
  }
}

// ------------------------------------------------------------ what to see ----

/** "#AABBCC" as the rgb() string getComputedStyle hands back. */
function toRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return 'rgb(' + ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255) + ')';
}

function readTheme(manifest, themeLabel) {
  const entry = manifest.contributes.themes.find((t) => t.label === themeLabel);
  if (!entry) throw new Error('no manifest entry for theme ' + themeLabel);
  return JSON.parse(
    fs.readFileSync(path.join(REPO, 'themes', path.basename(entry.path)), 'utf8')
  );
}

/**
 * [[lineNumber, [color, ...]], ...]: the colors each line has to be showing.
 *
 * Taken from the scanner, so it covers keys, values and brackets at every depth,
 * and from the theme, so the muted variants' separate bracket colors are expected
 * where they apply. Colons and commas are not tokens here, so they are left out.
 */
function expectedByLine(text, theme) {
  const rules = theme.semanticTokenColors;
  const byLine = new Map();
  for (const token of scan(text)) {
    const level = Math.min(token.level, MAX_LEVEL);
    const bracket = rules['jsonPunctuation.level' + level];
    const hex =
      token.kind === PUNCTUATION && bracket ? bracket : rules['*.level' + level];
    const line = token.line + 1;
    if (!byLine.has(line)) byLine.set(line, new Set());
    byLine.get(line).add(toRgb(hex));
  }
  return [...byLine.entries()].map(([line, colors]) => [line, [...colors]]);
}

// ------------------------------------------------------------------- cdp ----

/** A minimal DevTools Protocol client. Node's WebSocket is built in, so the repo
 *  stays dependency free. */
function cdp(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  return {
    ready,
    close: () => ws.close(),
    send(method, params) {
      const mid = ++id;
      return new Promise((resolve, reject) => {
        pending.set(mid, { resolve, reject });
        ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
      });
    },
  };
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitForPage(timeoutMs, titleFragment) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://127.0.0.1:' + PORT + '/json/list');
      const list = await response.json();
      // matching on the title matters: a second window, or one still showing the
      // watermark, is also a page target, and capturing that one yields an empty
      // editor
      const page = list.find(
        (t) =>
          t.type === 'page' &&
          t.webSocketDebuggerUrl &&
          t.title &&
          t.title.indexOf(titleFragment) >= 0
      );
      if (page) return page;
    } catch {
      // the port is not listening yet
    }
    await sleep(250);
  }
  throw new Error(
    'no page titled like ' + titleFragment + ' within ' + timeoutMs + 'ms'
  );
}

// ------------------------------------------------------------ the editor ----

/**
 * Measure the content box, and report which expected colors are still absent.
 *
 * Returns null while the editor is not yet worth capturing: too few lines rendered,
 * or something covering it.
 */
function probeExpression(wantLines, expected) {
  return [
    '(() => {',
    '  const expected = ' + JSON.stringify(expected) + ';',
    "  const editor = document.querySelector('.monaco-editor');",
    '  if (!editor) return null;',
    "  const margin = editor.querySelector('.margin');",
    '  if (!margin) return null;',
    "  const rendered = [...editor.querySelectorAll('.view-line')]",
    '    .filter((l) => l.getBoundingClientRect().height > 0);',
    '  const lines = rendered',
    '    .filter((l) => l.textContent.trim().length > 0)',
    '    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);',
    '  if (lines.length !== ' + wantLines + ') return null;',
    '',
    '  let top = Infinity, bottom = -Infinity, right = -Infinity;',
    '  for (const line of lines) {',
    '    const box = line.getBoundingClientRect();',
    '    top = Math.min(top, box.top);',
    '    bottom = Math.max(bottom, box.bottom);',
    "    for (const span of line.querySelectorAll('span span')) {",
    '      const sbox = span.getBoundingClientRect();',
    '      if (sbox.width > 0) right = Math.max(right, sbox.right);',
    '    }',
    '  }',
    '',
    '  const missing = [];',
    '  for (const pair of expected) {',
    '    const line = lines[pair[0] - 1];',
    '    if (!line) { missing.push(String(pair[0])); continue; }',
    '    const present = new Set(',
    "      [...line.querySelectorAll('span span')].map((s) => getComputedStyle(s).color)",
    '    );',
    '    for (const color of pair[1]) {',
    '      if (!present.has(color)) missing.push(pair[0] + " " + color);',
    '    }',
    '  }',
    '',
    '  // the trailing blank line still has a gutter number, and six pixels of',
    '  // bottom padding is enough to catch the top of it',
    '  let nextTop = Infinity;',
    '  for (const line of rendered) {',
    '    const t = line.getBoundingClientRect().top;',
    '    if (t >= bottom - 1) nextTop = Math.min(nextTop, t);',
    '  }',
    '',
    '  const mbox = margin.getBoundingClientRect();',
    '  const ebox = editor.getBoundingClientRect();',
    '  const hit = document.elementFromPoint((mbox.left + right) / 2, (top + bottom) / 2);',
    "  const covered = !hit || !hit.closest('.view-lines');",
    '  return {',
    '    left: mbox.left, top: top, bottom: bottom, right: right,',
    '    editorTop: ebox.top,',
    '    nextTop: isFinite(nextTop) ? nextTop : -1,',
    '    missing: missing,',
    '    covered: covered,',
    '    dpr: window.devicePixelRatio,',
    '  };',
    '})()',
  ].join('\n');
}

/** Poll until nothing is missing, nothing covers the editor, and the box is still. */
async function settled(client, wantLines, expected) {
  const expression = probeExpression(wantLines, expected);
  let previous = null;
  let last = null;
  for (let i = 0; i < 100; i++) {
    const now = await evaluate(client, expression);
    if (now) {
      last = now;
      const geometry = JSON.stringify([now.left, now.top, now.bottom, now.right]);
      if (!now.missing.length && !now.covered && previous === geometry) return now;
      previous = geometry;
    }
    await sleep(250);
  }
  if (!last) throw new Error('never rendered ' + wantLines + ' lines of content');
  if (last.covered) throw new Error('something is covering the editor');
  throw new Error(
    last.missing.length +
      ' expected color(s) never appeared, first: ' +
      last.missing.slice(0, 3).join(', ')
  );
}

function kill(pid) {
  try {
    execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } catch {
    // already gone
  }
}

function launch(file, extra) {
  const child = spawn(
    CODE_EXE,
    [
      '--user-data-dir', USER_DATA,
      '--extensions-dir', EXTENSIONS,
      '--new-window',
      '--disable-workspace-trust',
      '--skip-release-notes',
      '--disable-updates',
      // grayscale antialiasing. Subpixel rendering puts orange and blue fringes on
      // a one-pixel bracket stroke, so its core never reaches the palette color and
      // the image cannot be checked against it.
      '--disable-lcd-text',
      ...extra,
      file,
    ],
    { detached: true, stdio: 'ignore' }
  );
  child.unref();
  return child;
}

/**
 * Launch once and throw the window away.
 *
 * A brand new profile greets you with a modal, currently a Copilot sign-in panel,
 * which sits over the editor and gets captured instead of the code. Launching once
 * lets VS Code record that it has shown it, so the real captures come up clean.
 */
async function warmUp() {
  writeSettings(THEME_LABELS[0]);
  const child = launch(path.join(REPO, 'samples', 'object.json'), []);
  await sleep(12000);
  kill(child.pid);
  await sleep(1000);
}

async function capture(themeLabel, sample, wantLines, expected) {
  writeSettings(themeLabel);
  const child = launch(path.join(REPO, 'samples', sample + '.json'), [
    '--remote-debugging-port=' + PORT,
  ]);

  try {
    const page = await waitForPage(45000, sample + '.json');
    const client = cdp(page.webSocketDebuggerUrl);
    await client.ready;
    await client.send('Runtime.enable');
    await client.send('Page.enable');

    // Monaco only puts visible lines in the DOM, so a file taller than the window
    // never reports all of its lines and the readiness check can never pass. Sizing
    // the viewport to the content is the fix, and it also pins the geometry so every
    // theme's image comes out identical rather than depending on the window.
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1400,
      height: Math.max(900, wantLines * 24 + 240),
      deviceScaleFactor: 1,
      mobile: false,
    });

    // an unfocused editor draws no caret
    await evaluate(client, 'document.activeElement && document.activeElement.blur()');
    const box = await settled(client, wantLines, expected);
    if (box.dpr !== 1) {
      throw new Error('devicePixelRatio is ' + box.dpr + ', expected 1');
    }
    // never reach above the editor itself, or the tab bar creeps into the image
    const yTop = Math.max(box.editorTop, box.top - PAD.top);
    // and never reach down into the next line's gutter number
    const limit = box.nextTop > 0 ? box.nextTop : Infinity;
    const yBottom = Math.min(box.bottom + PAD.bottom, limit);
    const clip = {
      x: Math.round(box.left - PAD.left),
      y: Math.round(yTop),
      width: Math.round(box.right - box.left + PAD.left + PAD.right),
      height: Math.round(yBottom - yTop),
      scale: 1,
    };
    const shot = await client.send('Page.captureScreenshot', {
      format: 'png',
      clip,
      captureBeyondViewport: false,
    });
    client.close();

    const folder = THEME_DIRS[themeLabel];
    if (!folder) throw new Error('no screenshot folder for ' + themeLabel);
    const dir = path.join(REPO, 'screenshots', folder);
    fs.mkdirSync(dir, { recursive: true });
    const out = path.join(dir, sample + '.png');
    fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
    return { clip, bytes: fs.statSync(out).size };
  } finally {
    kill(child.pid);
    await sleep(600);
  }
}

/** Launching can lose a race, so give each capture a couple of chances. */
async function captureWithRetry(themeLabel, sample, wantLines, expected) {
  let last = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await capture(themeLabel, sample, wantLines, expected);
    } catch (error) {
      last = error;
      await sleep(1000);
    }
  }
  throw last;
}

// ------------------------------------------------------------------ main ----

async function main() {
  const only = process.argv[2];
  const themes = only ? THEME_LABELS.filter((l) => l === only) : THEME_LABELS;
  if (!themes.length) {
    console.error('no such theme: ' + only);
    console.error('known: ' + THEME_LABELS.join(', '));
    process.exit(1);
  }

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log('  installing the extension into a throwaway profile');
  installExtension();
  console.log('  warming the profile so first-run dialogs are out of the way');
  await warmUp();

  const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
  const onlySample = process.env.SHOT_SAMPLE;
  const wanted = Object.keys(SAMPLES).filter((s) => !onlySample || s === onlySample);
  if (!wanted.length) {
    console.error('no such sample: ' + onlySample);
    console.error('known: ' + Object.keys(SAMPLES).join(', '));
    process.exit(1);
  }
  const text = {};
  for (const sample of Object.keys(SAMPLES)) {
    text[sample] = fs.readFileSync(
      path.join(REPO, 'samples', sample + '.json'),
      'utf8'
    );
  }

  let made = 0;
  const failures = [];
  const sizes = new Map();

  for (const themeLabel of themes) {
    const theme = readTheme(manifest, themeLabel);
    console.log('\n  ' + themeLabel);
    for (const sample of wanted) {
      const expected = expectedByLine(text[sample], theme);
      const colors = expected.reduce((n, pair) => n + pair[1].length, 0);
      try {
        const r = await captureWithRetry(
          themeLabel, sample, SAMPLES[sample], expected
        );
        made++;
        const size = r.clip.width + 'x' + r.clip.height;
        // every theme renders identical text, so a sample's geometry must not vary
        if (!sizes.has(sample)) sizes.set(sample, size);
        const drift =
          sizes.get(sample) === size ? '' : '  DRIFT from ' + sizes.get(sample);
        console.log(
          '    %s %s  %s colors verified across %s lines  %s KB%s',
          sample.padEnd(8),
          size.padEnd(9),
          String(colors).padStart(2),
          String(expected.length).padStart(2),
          String(Math.round(r.bytes / 1024)).padStart(3),
          drift
        );
      } catch (error) {
        failures.push(themeLabel + '/' + sample + ': ' + error.message);
        console.log('    %s FAILED  %s', sample.padEnd(8), error.message);
      }
    }
  }

  console.log('\n  %d screenshots written, %d failed', made, failures.length);
  for (const f of failures) console.log('    ' + f);
  process.exit(failures.length ? 1 : 0);
}

main().catch((error) => {
  console.error('FAILED: ' + error.message);
  process.exit(1);
});
