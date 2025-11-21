import type { Extension, StateEffectType, StateField } from '@codemirror/state';
import type { EditorView, Panel } from '@codemirror/view';

import CodeMirrorPanel from './CodeMirrorPanel';

/**
 * CodeMirrorPreferences is a panel that allows users to configure CodeMirror preferences.
 * It is toggled by pressing `Ctrl`-`Shift`-`,` (or `Command`-`Shift`-`,` on macOS).
 * Only the commonly used "primary" preferences with a visual effect are shown in the panel,
 * in order to reduce in-editor clutter. An "advanced" link is provided to open a dialog
 * with all available preferences. This can also be opened by pressing `Alt`-`Shift`-`,`.
 *
 * Note that this code, like MediaWiki Core, refers to the user's preferences as "options".
 * In this class, "preferences" refer to the user's preferences for CodeMirror, which
 * are stored as a single user 'option' in the database.
 */
export default class CodeMirrorPreferences extends CodeMirrorPanel {
  /**
   * The name of the user option that stores the preferences.
   */
  optionName: string;

  /**
   * Registry of CodeMirror Extensions.
   */
  extensionRegistry: CodeMirrorExtensionRegistry;

  /**
   * The CodeMirror mode being used, e.g. 'mediawiki', 'javascript', etc.
   */
  mode: string;

  /**
   * Whether the VE 2017 editor is being used.
   */
  isVisualEditor: boolean;

  /**
   * MediaWiki API instance.
   */
  api: mw.Api;

  /**
   * State effect for toggling the preferences panel.
   */
  prefsToggleEffect: StateEffectType<boolean>;

  /**
   * State field for managing the panel's visibility.
   */
  panelStateField: StateField<boolean>;

  /**
   * The user's CodeMirror preferences.
   */
  preferences: Record<string, boolean>;

  /**
   * Preferences that are shown in the preferences panel, as defined by
   * `$wgCodeMirrorPrimaryPreferences`. These "primary" preferences should:
   * - Be commonly used,
   * - Be easy to understand,
   * - Have an immediate visual effect, and
   * - Limited to a small subset to avoid consuming too much in-editor space.
   */
  primaryPreferences: string[];

  /**
   * Configuration for the full preferences dialog.
   *
   * Each key is a section name having an i18n message key
   * of the form `codemirror-prefs-section-<section>`.
   *
   * Values are arrays of preference names that belong to that section.
   * Any preference not listed here will be shown in the "Other" section.
   */
  dialogConfig: Record<string, string[]>;

  /**
   * Cached default preferences.
   */
  private defaultPreferences?: Record<string, boolean>;

  /**
   * The current EditorView instance.
   */
  view: EditorView;

  /**
   * @param {CodeMirrorExtensionRegistry} extensionRegistry
   * @param {string} mode The CodeMirror mode being used, e.g. 'mediawiki', 'javascript', etc.
   * @param {boolean} [isVisualEditor] Whether the VE 2017 editor is being used.
   */
  constructor(extensionRegistry: CodeMirrorExtensionRegistry, mode: string, isVisualEditor?: boolean);

  /**
   * MediaWiki config for default preferences.
   */
  private get mwConfigDefaults(): Record<string, boolean | number[] | string[]>;

  /**
   * MediaWiki config for primary preferences.
   */
  private get mwConfigPrimary(): Record<string, boolean>;

  /**
   * The default CodeMirror preferences, as defined by `$wgCodeMirrorPreferences`
   * and taking into account the page namespace and the CodeMirror mode.
   */
  getDefaultPreferences(): Record<string, boolean>;

  /**
   * Fetch the user's CodeMirror preferences from the user options API,
   * or clientside storage for unnamed users.
   */
  fetchPreferences(): Record<string, boolean>;

  /**
   * Internal method to fetch raw preferences from storage.
   */
  private fetchPreferencesInternal(): Record<string, number>;

  /**
   * Set the given CodeMirror preference and update the user option in the database,
   * or clientside storage for unnamed users.
   *
   * @param {string} key
   * @param {boolean} value
   */
  setPreference(key: string, value: boolean): void;

  /**
   * Internal method to save preferences to storage.
   *
   * @param {object | null} storageObj
   */
  private setPreferencesInternal(storageObj: Record<string, number> | null): void;

  /**
   * Fire the preferences apply hook.
   *
   * @param {string} prefName
   */
  private firePreferencesApplyHook(prefName: string): void;

  /**
   * Get the value of the given CodeMirror preference.
   *
   * @param {string} prefName
   */
  getPreference(prefName: string): boolean;

  /**
   * Check if the user has any preferences that differ from the defaults.
   * This is used to determine whether EventLogging should happen.
   */
  hasNonDefaultPreferences(): boolean;

  /**
   * Register an Extension with CodeMirrorExtensionRegistry
   * and enable it if the corresponding preference is set.
   *
   * @param {string} name
   * @param {Extension} extension
   * @param {EditorView} view
   */
  registerExtension(name: string, extension: Extension, view: EditorView): void;

  /**
   * Toggle an Extension on or off with CodeMirrorExtensionRegistry
   * and update the preference.
   *
   * @param {string} name
   * @param {EditorView} view
   */
  toggleExtension(name: string, view: EditorView): void;

  /**
   * Get the panel and any associated keymaps as an Extension.
   * For use only during CodeMirror initialization.
   */
  get extension(): Extension;

  /**
   * Get the Panel object.
   */
  get panel(): Panel;

  /**
   * Get help links for the preferences panel.
   */
  private getHelpLinks(): HTMLSpanElement;

  /**
   * Get a fieldset containing checkboxes for the given preferences.
   *
   * @param {string[]} prefNames Names of preferences to include.
   * @param {string | HTMLElement} [title] Title of the fieldset.
   */
  private getCheckboxesFieldset(prefNames: string[], title?: string | HTMLElement): HTMLFieldSetElement;

  /**
   * Toggle display of the preferences panel.
   *
   * @param {EditorView} view
   * @param {boolean} [force] Force the panel to open or close.
   */
  toggle(view: EditorView, force?: boolean): boolean;

  /**
   * Handle keydown events on the preferences panel.
   *
   * @param {KeyboardEvent} event
   */
  onKeydownPanel(event: KeyboardEvent): void;

  /**
   * Show the dialog with all available preferences.
   *
   * @param {EditorView} view
   */
  showPreferencesDialog(view: EditorView): boolean;

  /**
   * Get a CSS-only Codex Checkbox with event handlers for preferences.
   * Overrides the parent method to add preference-specific functionality.
   *
   * @param {string} name
   * @param {string} label
   * @param {boolean} [checked]
   */
  getCheckbox(name: string, label: string, checked?: boolean): [HTMLElement, HTMLInputElement];
}
