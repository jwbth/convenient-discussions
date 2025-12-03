// import {
//   Compartment,
//   EditorSelection,
//   EditorState,
//   EditorView,
//   Extension,
//   StateEffect,
//   LanguageSupport,
//   LintSource,
//   ViewUpdate
// } from 'ext.CodeMirror.v6.lib';

import type { LanguageSupport } from '@codemirror/language'
import type { LintSource } from '@codemirror/lint'
import type { Compartment, Extension } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'

// Use the file from the actual CodeMirror extension for types as long as we don't need upstream
// CodeMirror imports from there (TypeScript engine can't handle imports like `require(
// 'ext.CodeMirror.v6.lib' )`).
import type CodeMirrorPreferences from '../../mediawiki-extensions-CodeMirror/resources/codemirror.preferences.js'
// import CodeMirrorPreferences from './CodeMirrorPreferences';

// import CodeMirrorLint from './codemirror.lint.js';
// import CodeMirrorTextSelection from './codemirror.textSelection.js';
// import CodeMirrorSearch from './codemirror.search.js';
// import CodeMirrorGotoLine from './codemirror.gotoLine.js';
// import CodeMirrorPreferences from './codemirror.preferences.js';
// import CodeMirrorKeymap from './codemirror.keymap.js';
// import CodeMirrorExtensionRegistry from './codemirror.extensionRegistry.js';
// import CodeMirrorChild from './codemirror.child.js';

/**
 * Interface for the CodeMirror editor.
 *
 * This class is a wrapper around the CodeMirror library,
 * providing a simplified interface for creating and managing CodeMirror instances in MediaWiki.
 *
 * ## Lifecycle
 *
 * * {@link CodeMirror#initialize initialize}
 * * {@link CodeMirror#activate activate}
 * * {@link CodeMirror#toggle toggle}
 * * {@link CodeMirror#deactivate deactivate}
 * * {@link CodeMirror#destroy destroy}
 */
declare class CodeMirror {
	/**
	 * The textarea that CodeMirror is bound to.
	 */
	textarea: HTMLTextAreaElement

	/**
	 * jQuery instance of the textarea for use with WikiEditor and jQuery plugins.
	 */
	$textarea: JQuery

	/**
	 * The VisualEditor surface CodeMirror is bound to.
	 */
	surface: ve.ui.Surface | null

	/**
	 * The function to lint the code in the editor.
	 */
	lintSource: LintSource | undefined

	/**
	 * Language support and its extension(s).
	 */
	langExtension: LanguageSupport

	/**
	 * The editor user interface.
	 */
	view: EditorView // | null;

	/**
	 * Whether the CodeMirror instance is active.
	 */
	isActive: boolean

	/**
	 * The .ext-codemirror-wrapper container. This houses both
	 * the original textarea and the CodeMirror editor.
	 */
	container: HTMLDivElement // | null;

	/**
	 * Whether the textarea is read-only.
	 */
	readOnly: boolean

	/**
	 * The CodeMirror "mode" (language).
	 */
	mode: string

	/**
	 * jQuery.textSelection overrides for CodeMirror.
	 */
	textSelection: CodeMirrorTextSelection | null

	/**
	 * CodeMirror key mappings and help dialog.
	 */
	keymap: CodeMirrorKeymap

	/**
	 * Registry of CodeMirror Extensions.
	 */
	extensionRegistry: CodeMirrorExtensionRegistry

	/**
	 * Compartment to control the direction of the editor.
	 */
	dirCompartment: Compartment

	/**
	 * The CodeMirror preferences panel.
	 */
	preferences: CodeMirrorPreferences

	/**
	 * The CodeMirror search panel.
	 */
	search: CodeMirrorSearch

	/**
	 * The go-to line panel.
	 */
	gotoLine: CodeMirrorGotoLine

	/**
	 * The form `submit` event handler.
	 */
	private formSubmitEventHandler: AnyFunction | null

	/**
	 * Mapping of mw.hook handlers added by CodeMirror.
	 * Handlers added here will be removed during deactivation.
	 */
	private hooks: Record<string, Set<AnyFunction>>

	/**
	 * The edit recovery handler.
	 */
	private editRecoveryHandler?: AnyFunction

	/**
	 * Instantiate a new CodeMirror instance.
	 *
	 * @param {HTMLTextAreaElement | JQuery | string} textarea Textarea to add syntax highlighting to.
	 * @param {LanguageSupport} [langSupport] Language support and its extension(s).
	 */
	constructor(textarea: HTMLTextAreaElement | JQuery | string, langSupport?: LanguageSupport)

	/**
	 * Default extensions used by CodeMirror.
	 * Extensions here should be applicable to all theoretical uses of CodeMirror in MediaWiki.
	 * This getter can be overridden to apply additional extensions before
	 * initialization. To apply a new extension after initialization,
	 * use {@link CodeMirror#applyExtension applyExtension()}, or through
	 * {@link CodeMirrorExtensionRegistry} using
	 * {@link CodeMirrorExtensionRegistry#register register()} if it needs
	 * to be reconfigured (such as toggling on and off).
	 */
	get defaultExtensions(): Extension | Extension[]

	/**
	 * Extension to bubble some DOM events to the original textarea.
	 */
	protected get domEventHandlersExtension(): Extension

	/**
	 * Extension for highlighting the active line.
	 */
	get activeLineExtension(): Extension

	/**
	 * Extension for line wrapping.
	 */
	get lineWrappingExtension(): Extension

	/**
	 * Extension for line numbering.
	 */
	get lineNumberingExtension(): Extension

	/**
	 * Extension for search and goto line functionality.
	 */
	get searchExtension(): Extension

	/**
	 * This extension adds bracket matching to the CodeMirror editor.
	 */
	get bracketMatchingExtension(): Extension

	/**
	 * This extension adds automatic closing of brackets to the CodeMirror editor.
	 */
	get closeBracketsExtension(): Extension

	/**
	 * This extension listens for changes in the CodeMirror editor and fires
	 * the `ext.CodeMirror.input` hook with the ViewUpdate object.
	 */
	get updateExtension(): Extension

	/**
	 * This extension sets the height of the CodeMirror editor to match the
	 * textarea. This getter can be overridden to
	 * change the height of the editor, but it's usually simpler to set the
	 * height of the textarea using CSS prior to initialization.
	 */
	get heightExtension(): Extension

	/**
	 * This specifies which attributes get added to the CodeMirror contenteditable `.cm-content`.
	 * Subclasses are safe to override this method, but attributes here are considered vital.
	 */
	protected get contentAttributesExtension(): Extension

	/**
	 * This specifies which attributes get added to the `.cm-editor` element (the entire editor).
	 * Subclasses are safe to override this method, but attributes here are considered vital.
	 */
	protected get editorAttributesExtension(): Extension

	/**
	 * Overrides for the CodeMirror library's internalization system.
	 */
	protected get phrasesExtension(): Extension

	/**
	 * We give a small subset of special characters a tooltip explaining what they are.
	 * The messages and for what characters are defined here.
	 * Any character that does not have a message will instead use CM6 defaults,
	 * which is the localization of 'codemirror-control-character' followed by the Unicode number.
	 */
	protected get specialCharsExtension(): Extension

	/**
	 * This extension highlights whitespace characters.
	 */
	get whitespaceExtension(): Extension

	/**
	 * This extension adds the ability to change the direction of the editor.
	 */
	protected get dirExtension(): Extension

	/**
	 * This extension adds the ability to lint the code in the editor.
	 */
	protected get lintExtension(): Extension

	/**
	 * Setup CodeMirror and add it to the DOM. This will hide the original textarea.
	 *
	 * This method should only be called once per instance. Use {@link CodeMirror#toggle toggle},
	 * {@link CodeMirror#activate activate}, and {@link CodeMirror#deactivate deactivate}
	 * to enable or disable the same CodeMirror instance programmatically, and restore or hide
	 * the original textarea.
	 *
	 * @param {Extension | Extension[]} [extensions] Extensions to use.
	 */
	initialize(extensions?: Extension | Extension[]): void

	/**
	 * Use a MutationObserver to watch for CSS class changes to the <html> element,
	 * and update the CodeMirror editor's theme accordingly. This is only necessary
	 * for non-wikitext, where we don't use our own CSS classes during tokenization.
	 */
	addDarkModeMutationObserver(): void

	/**
	 * Add a handler for the given Hook.
	 * This method is used to ensure no hook handlers are duplicated across lifecycle methods,
	 * All handlers will be removed during deactivation.
	 *
	 * @param {string} hook
	 * @param {AnyFunction} fn
	 */
	protected addMwHook(hook: string, fn: AnyFunction): void

	/**
	 * Set a new edit recovery handler.
	 */
	protected addEditRecoveredHandler(): void

	/**
	 * Define jQuery hook for .val() on the textarea.
	 */
	protected addTextAreaJQueryHook(): void

	/**
	 * Sync the CodeMirror editor with the original textarea on form submission.
	 */
	protected addFormSubmitHandler(): void

	/**
	 * Apply an Extension to the CodeMirror editor.
	 * This is accomplished through top-level reconfiguration of the EditorView.
	 *
	 * If the extension needs to be reconfigured (such as toggling on and off), use the
	 * extensionRegistry instead.
	 *
	 * @param {Extension} extension
	 */
	applyExtension(extension: Extension): void

	/**
	 * Toggle CodeMirror on or off from the textarea.
	 * This will call initialize if CodeMirror
	 * is being enabled for the first time.
	 *
	 * @param {boolean} [force] `true` to enable CodeMirror, `false` to disable.
	 *   Note that the ext.CodeMirror.toggle
	 *   hook will not be fired if this parameter is set.
	 */
	toggle(force?: boolean): void

	/**
	 * Activate CodeMirror on the textarea.
	 * This sets the state property and shows the editor view,
	 * hiding the original textarea.
	 *
	 * initialize is expected to be called before this method.
	 */
	protected activate(): void

	/**
	 * Deactivate CodeMirror on the textarea, restoring the original
	 * textarea and hiding the editor. This life-cycle method should retain the
	 * view but discard the state.
	 */
	protected deactivate(): void

	/**
	 * Destroy the CodeMirror instance and revert to the original textarea.
	 * This action should be considered irreversible.
	 */
	destroy(): void

	/**
	 * Log usage of CodeMirror.
	 *
	 * @param {string} action
	 */
	protected logEditFeature(action: string): void

	/**
	 * Add hook handlers to log usage of CodeMirror features.
	 */
	protected setupFeatureLogging(): void

	/**
	 * Save CodeMirror enabled preference.
	 *
	 * @param {boolean} prefValue `true` to enable CodeMirror where possible on page load.
	 */
	static setCodeMirrorPreference(prefValue: boolean): void

	/**
	 * jQuery.textSelection overrides for CodeMirror.
	 */
	private get cmTextSelection(): {
		getContents: () => string
		setContents: (content: string) => void
		getCaretPosition: (options?: object) => number
		scrollToCaretPosition: () => void
		getSelection: () => string
		setSelection: (options: object) => void
		replaceSelection: (value: string) => void
		encapsulateSelection: (options: object) => void
	}

	/**
	 * Get a CodeMirrorChild object for use on other textareas that
	 * should have preferences synced with this CodeMirror instance.
	 */
	get child(): CodeMirrorChild
}

export default CodeMirror
