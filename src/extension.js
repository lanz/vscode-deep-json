'use strict';

/**
 * Provides semantic tokens for JSON so a color theme can color each level of
 * nesting differently.
 *
 * Every value gets a standard semantic token type (property for object keys,
 * string / number / keyword for values) plus one custom modifier naming its depth:
 * level1 through level20. Themes then color by depth, for example:
 *
 *   "semanticTokenColors": { "*.level3": "#FFAAFF" }
 *
 * Keeping the depth in a modifier rather than in the token type means a theme can
 * color by depth alone with `*.levelN`, or distinguish keys from values at a given
 * depth with `property.levelN`, without this extension having to care.
 *
 * Brackets and braces are reported too, as the custom jsonPunctuation type, each
 * taking the depth of the container it opens or closes. Coloring those past level 6
 * means getting VS Code's own bracket colorizer out of the way, which is what the
 * deep-bracket policy further down manages.
 *
 * The provider also reports edits. The token data is delta-encoded, so a change on
 * one line usually perturbs only a handful of integers; sending that instead of the
 * whole array keeps editing a large document cheap.
 *
 * Copyright (C) 2026 Lance Duvall
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Project: <https://github.com/lanz/vscode-deep-json>
 * Licensed under the GNU Affero General Public License, version 3 or later.
 * See LICENSE, or <https://www.gnu.org/licenses/>.
 */

const vscode = require('vscode');
const { scan } = require('./scanner');
const { encode, diff } = require('./encode');
const THEME_LABELS = require('./theme_labels');
const policy = require('./deep_brackets');
const customize = require('./palette_customization');

/** Deepest level with a modifier of its own; anything deeper reuses the last. */
const MAX_LEVEL = 20;

// jsonPunctuation is ours; the rest are standard types, so a theme without
// rules of our own still falls back to something sensible.
const TOKEN_TYPES = ['property', 'string', 'number', 'keyword',
  'jsonPunctuation'];
const TOKEN_MODIFIERS = [];
for (let n = 1; n <= MAX_LEVEL; n++) TOKEN_MODIFIERS.push('level' + n);

const legend = new vscode.SemanticTokensLegend(TOKEN_TYPES, TOKEN_MODIFIERS);
// scanner kind -> index into TOKEN_TYPES
const TYPE_INDEX = new Map([
  ['property', 0],
  ['string', 1],
  ['number', 2],
  ['keyword', 3],
  ['punctuation', 4],
]);

/**
 * Last result per document, so an edit can be expressed as a delta.
 * Holding one entry per document is enough: VS Code only ever asks for edits
 * against the result id it was last given.
 */
const previous = new Map(); // uri string -> { resultId, data }
let nextResultId = 1;

function buildData(document) {
  return encode(scan(document.getText()), TYPE_INDEX, MAX_LEVEL);
}

function remember(document, data) {
  const resultId = String(nextResultId++);
  previous.set(document.uri.toString(), { resultId, data });
  return resultId;
}

const provider = {
  provideDocumentSemanticTokens(document) {
    const data = buildData(document);
    return new vscode.SemanticTokens(data, remember(document, data));
  },

  provideDocumentSemanticTokensEdits(document, previousResultId) {
    const cached = previous.get(document.uri.toString());
    if (!cached || cached.resultId !== previousResultId) {
      // nothing to diff against, so answer in full
      const data = buildData(document);
      return new vscode.SemanticTokens(data, remember(document, data));
    }

    const data = buildData(document);
    const change = diff(cached.data, data);
    const resultId = remember(document, data);

    if (change === null) {
      return new vscode.SemanticTokensEdits([], resultId);
    }
    return new vscode.SemanticTokensEdits(
      [new vscode.SemanticTokensEdit(change.start, change.deleteCount, change.data)],
      resultId
    );
  },
};

// ------------------------------------------------------- deep brackets ----
// VS Code's built-in bracket colorizer has six color slots and its decorations
// paint over semantic tokens, so brackets stop tracking depth at level 7 while it
// is running. Suppressing it for JSON is what lets the brackets keep going, and
// the only mechanism is this language-scoped setting. See deep_brackets.js for why
// a language configuration contribution cannot be used instead.

const SETTING_SECTION = 'editor.language';
const SETTING_KEY = 'colorizedBracketPairs';
const POLICY_SECTION = 'jsonColorThemes';
const POLICY_KEY = 'deepBrackets';
const NOTIFIED_KEY = 'deepBrackets.notified';
const LANGUAGES = ['json', 'jsonc'];

/** Ownership is tracked per language, so one language's value is never mistaken
 *  for the other's and a value the user wrote is never cleared. */
const ownedKey = (languageId) => 'deepBrackets.owned.' + languageId;

function currentPolicy() {
  return policy.normalize(
    vscode.workspace.getConfiguration(POLICY_SECTION).get(POLICY_KEY)
  );
}

/** ColorTheme in the API exposes only a theme's kind, never its name, so the
 *  active theme has to be identified by the label in workbench.colorTheme. */
function activeThemeIsOurs() {
  const label = vscode.workspace.getConfiguration('workbench').get('colorTheme');
  return THEME_LABELS.includes(label);
}

/**
 * Bring the setting in line with the policy, for each language independently.
 *
 * This also runs on activation, which is what makes the state self-healing: a
 * value left behind by an uninstall, or arriving from another machine through
 * Settings Sync, is cleared the next time the extension starts under a theme
 * that is not one of ours.
 */
async function reconcile(context) {
  const state = { policy: currentPolicy(), themeIsOurs: activeThemeIsOurs() };
  let didSet = false;

  for (const languageId of LANGUAGES) {
    const config = vscode.workspace.getConfiguration(SETTING_SECTION, { languageId });
    const inspected = config.inspect(SETTING_KEY);
    const hasValue = !!inspected && inspected.globalLanguageValue !== undefined;
    const weOwnIt = context.globalState.get(ownedKey(languageId), false);

    const action = policy.decide({ ...state, hasValue, weOwnIt });
    if (action === policy.LEAVE) continue;

    const on = action === policy.SET;
    await config.update(
      SETTING_KEY,
      on ? [] : undefined,
      vscode.ConfigurationTarget.Global,
      true // overrideInLanguage, so it lands in the "[json]" block
    );
    await context.globalState.update(ownedKey(languageId), on);
    didSet = didSet || on;
  }

  if (didSet) await announceOnce(context);
}

/** Fire and forget, but never leave a rejected promise unhandled. A failed write
 *  should cost the brackets their depth coloring, not break activation. */
function reconcileSoon(context) {
  reconcile(context).catch((error) => {
    console.error('Deep JSON Color Themes: bracket policy failed', error);
  });
}

/** Say so the first time, rather than editing the user's settings silently. */
async function announceOnce(context) {
  if (context.globalState.get(NOTIFIED_KEY, false)) return;
  await context.globalState.update(NOTIFIED_KEY, true);
  const change = 'Change...';
  const choice = await vscode.window.showInformationMessage(
    'Deep JSON is now coloring JSON brackets by depth past level 6. ' +
      'That needs editor.language.colorizedBracketPairs set for JSON in your user ' +
      'settings, and it is removed again when you switch to another theme.',
    change
  );
  if (choice === change) await pickPolicy();
}

/** The command. It only ever writes the policy; reconcile owns the real setting. */
async function pickPolicy() {
  const current = currentPolicy();
  const items = [
    {
      value: policy.AUTO,
      label: 'Automatic',
      detail: 'On while a Deep JSON theme is active, off under any other',
    },
    {
      value: policy.ON,
      label: 'Always on',
      detail: 'Color JSON brackets by depth whatever the active theme',
    },
    {
      value: policy.OFF,
      label: 'Off',
      detail: "Leave brackets to VS Code's built-in six-color colorizer",
    },
  ];
  for (const item of items) {
    if (item.value === current) item.label = '$(check) ' + item.label;
  }

  const chosen = await vscode.window.showQuickPick(items, {
    title: 'JSON bracket depth past level 6',
  });
  if (!chosen || chosen.value === current) return;
  // writing this fires onDidChangeConfiguration, which reconciles
  await vscode.workspace
    .getConfiguration(POLICY_SECTION)
    .update(POLICY_KEY, chosen.value, vscode.ConfigurationTarget.Global);
}

// --------------------------------------------- a palette under any theme ----
// VS Code has one theme at a time and no per-language equivalent, so a palette
// cannot be chosen for JSON alone. It does not need to be: the depth coloring is
// the provider's, not the theme's, and a theme only maps level to color. That
// mapping can live in the user's own settings instead, which is what this writes.
// palette_customization.js holds the merge and the ownership; this half is the
// editor interaction and the file reading.

const CUSTOMIZATION_SECTION = 'editor';
const CUSTOMIZATION_KEY = 'semanticTokenColorCustomizations';
const OWNED_PALETTE_KEY = 'palette.owned';

function activeThemeLabel() {
  return vscode.workspace.getConfiguration('workbench').get('colorTheme') || '';
}

/** label -> themes/<file>, read off our own manifest so there is no second list. */
function themePath(context, label) {
  const themes =
    (context.extension.packageJSON.contributes || {}).themes || [];
  const found = themes.find((theme) => theme.label === label);
  return found ? found.path.replace(/^\.\//, '') : null;
}

async function paletteRules(context, label) {
  const relative = themePath(context, label);
  if (!relative) throw new Error('no theme in the manifest labelled ' + label);
  const uri = vscode.Uri.joinPath(context.extensionUri, ...relative.split('/'));
  const bytes = await vscode.workspace.fs.readFile(uri);
  return customize.rulesFromTheme(JSON.parse(Buffer.from(bytes).toString('utf8')));
}

async function writeCustomization(context, result) {
  await vscode.workspace
    .getConfiguration(CUSTOMIZATION_SECTION)
    .update(CUSTOMIZATION_KEY, result.value, vscode.ConfigurationTarget.Global);
  await context.globalState.update(OWNED_PALETTE_KEY, result.owned);
}

function currentCustomization() {
  const inspected = vscode.workspace
    .getConfiguration(CUSTOMIZATION_SECTION)
    .inspect(CUSTOMIZATION_KEY);
  return (inspected && inspected.globalValue) || undefined;
}

async function revertPalette(context) {
  const owned = context.globalState.get(OWNED_PALETTE_KEY, null);
  const result = customize.revert({ existing: currentCustomization(), owned });
  await writeCustomization(context, result);
}

/**
 * Add a palette's depth colors to whatever theme is active.
 *
 * A palette label can be passed in, in which case there is nothing to pick and the
 * confirmation is skipped too. That makes the command usable from a keybinding or
 * another extension, and it is how the command is tested end to end.
 *
 * Taking them back is removeDepthColors, a command of its own rather than an entry
 * in this picker: an off switch nobody can find is not much of an off switch.
 */
async function addDepthColors(context, requested) {
  const themeLabel = activeThemeLabel();
  const owned = context.globalState.get(OWNED_PALETTE_KEY, null);

  if (typeof requested === 'string') {
    if (!THEME_LABELS.includes(requested)) {
      throw new Error(
        'no palette called ' + requested + '; expected one of ' +
          THEME_LABELS.join(', ')
      );
    }
    await applyPalette(context, themeLabel, requested, owned);
    return;
  }

  if (THEME_LABELS.includes(themeLabel)) {
    const anyway = 'Pick one anyway';
    const choice = await vscode.window.showInformationMessage(
      themeLabel + ' is already one of these themes, so its depth colors are ' +
        'in use already. This command is for adding them to a theme from ' +
        'somewhere else.',
      anyway
    );
    if (choice !== anyway) return;
  }

  const items = THEME_LABELS.map((label) => ({
    label: customize.appliedTo(owned, themeLabel) && owned.palette === label
      ? '$(check) ' + label
      : label,
    palette: label,
  }));
  const chosen = await vscode.window.showQuickPick(items, {
    title: themeLabel
      ? 'Color JSON by depth under ' + themeLabel
      : 'Color JSON by depth under your current theme',
    placeHolder: 'Pick a palette; its colors go into your own theme',
  });
  if (!chosen) return;

  await applyPalette(context, themeLabel, chosen.palette, owned);

  // Brackets are the one thing settings alone cannot do, because VS Code's own
  // colorizer paints over semantic tokens and only `on` suppresses it under a
  // theme that is not ours.
  const actions = [];
  if (currentPolicy() !== policy.ON) actions.push('Brackets past level 6');
  actions.push('Undo');
  const choice = await vscode.window.showInformationMessage(
    chosen.palette.replace(/^Deep JSON: /, '') +
      ' is now coloring JSON by nesting depth under ' + themeLabel + '.',
    ...actions
  );
  if (choice === 'Undo') {
    await revertPalette(context);
  } else if (choice === 'Brackets past level 6') {
    await vscode.workspace
      .getConfiguration(POLICY_SECTION)
      .update(POLICY_KEY, policy.ON, vscode.ConfigurationTarget.Global);
  }
}

/** Take back what was added, and say which theme it came off. */
async function removeDepthColors(context) {
  const owned = context.globalState.get(OWNED_PALETTE_KEY, null);
  if (!customize.hasClaim(owned)) {
    vscode.window.showInformationMessage(
      'Deep JSON has not added any depth colors to a theme of yours.'
    );
    return;
  }
  const theme = owned.theme;
  const active = activeThemeLabel();
  await revertPalette(context);
  // Depth colors stay attached to the theme they were added to, so after a theme
  // switch this takes them off that one, not off the theme named in the command.
  // Saying which beats letting the title imply the wrong answer.
  vscode.window.showInformationMessage(
    theme === active
      ? 'Removed the Deep JSON depth colors from ' + theme + '.'
      : 'Removed the Deep JSON depth colors from ' + theme +
        ', which is the theme they were added to.'
  );
}


/** Read the palette and merge it in, remembering which one it was. */
async function applyPalette(context, themeLabel, paletteLabel, owned) {
  const rules = await paletteRules(context, paletteLabel);
  const result = customize.apply({
    existing: currentCustomization(),
    themeLabel,
    rules,
    owned,
  });
  // which palette it was is ours to remember, so the pick can be check-marked
  result.owned.palette = paletteLabel;
  await writeCustomization(context, result);
}

function activate(context) {
  for (const language of ['json', 'jsonc']) {
    context.subscriptions.push(
      vscode.languages.registerDocumentSemanticTokensProvider(
        { language },
        provider,
        legend
      )
    );
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('jsonColorThemes.bracketDepth', pickPolicy)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('jsonColorThemes.addDepthColors', (label) =>
      addDepthColors(context, label).catch((error) => {
        // both, deliberately: the notification is for the user, the log line is
        // what makes a failure diagnosable afterwards
        console.error('Deep JSON Color Themes: adding depth colors failed', error);
        vscode.window.showErrorMessage(
          'Deep JSON could not add those depth colors: ' + error.message
        );
      })
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('jsonColorThemes.removeDepthColors', () =>
      removeDepthColors(context).catch((error) => {
        console.error('Deep JSON Color Themes: removing depth colors failed', error);
        vscode.window.showErrorMessage(
          'Deep JSON could not remove those depth colors: ' + error.message
        );
      })
    )
  );

  // the theme label and our own policy both live in configuration
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration('workbench.colorTheme') ||
        event.affectsConfiguration(POLICY_SECTION + '.' + POLICY_KEY)
      ) {
        reconcileSoon(context);
      }
    })
  );

  reconcileSoon(context);

  // do not hold token data for documents that are gone
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((document) => {
      previous.delete(document.uri.toString());
    })
  );
}

function deactivate() {
  previous.clear();
}

module.exports = { activate, deactivate, MAX_LEVEL, TOKEN_TYPES, TOKEN_MODIFIERS };
