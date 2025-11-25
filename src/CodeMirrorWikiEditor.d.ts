// import { EditorView, StateCommand, Extension, LanguageSupport } from 'ext.CodeMirror.v6.lib';
// import CodeMirror from 'ext.CodeMirror.v6';
import type { LanguageSupport } from '@codemirror/language';
import type { Extension, StateCommand } from '@codemirror/state';

import CodeMirrorExtension from './CodeMirror';

/**
 * CodeMirror integration with WikiEditor.
 *
 * Use this class if you want WikiEditor's toolbar. If you don't need the toolbar,
 * using {@link CodeMirror} directly will be considerably more efficient.
 */
export default class CodeMirrorWikiEditor extends CodeMirrorExtension {
	/**
	 * The Realtime Preview handler.
	 */
	realtimePreviewHandler: AnyFunction | null;

	/**
	 * The WikiEditor search button, which is usurped to open the CodeMirror search panel.
	 */
	$searchBtn: JQuery | null;

	/**
	 * The old WikiEditor search button, to be restored if CodeMirror is disabled.
	 */
	$oldSearchBtn: JQuery | null;

	/**
	 * @param {HTMLTextAreaElement | JQuery | string} textarea Textarea to add syntax highlighting
	 *   to.
	 * @param {CodeMirror} [langSupport] Language support and its extension(s).
	 */
	constructor(textarea: HTMLTextAreaElement | JQuery | string, langSupport?: LanguageSupport);

	/**
	 * Default extensions used by CodeMirror.
	 * Extensions here should be applicable to all theoretical uses of CodeMirror in MediaWiki.
	 */
	get defaultExtensions(): Extension | Extension[];

	/**
	 * Setup CodeMirror and add it to the DOM. This will hide the original textarea.
	 *
	 * @param {Extension | Extension[]} [extensions] Extensions to use.
	 */
	initialize(extensions?: Extension | Extension[]): void;

	/**
	 * Toggle CodeMirror on or off from the textarea.
	 *
	 * @param {boolean} [force] `true` to enable CodeMirror, `false` to disable.
	 */
	toggle(force?: boolean): void;

	/**
	 * Activate CodeMirror on the textarea.
	 */
	protected activate(): void;

	/**
	 * Deactivate CodeMirror on the textarea, restoring the original
	 * textarea and hiding the editor.
	 */
	protected deactivate(): void;

	/**
	 * Destroy the CodeMirror instance and revert to the original textarea.
	 * This action should be considered irreversible.
	 */
	destroy(): void;

	/**
	 * Log usage of CodeMirror to the VisualEditorFeatureUse schema.
	 *
	 * @param {string} action
	 */
	logEditFeature(action: string): void;

	/**
	 * The WikiEditor context.
	 */
	get context(): object;

	/**
	 * Get the WikiEditor configuration for a tool that runs a Command.
	 *
	 * @param {string} name
	 * @param {AnyFunction} command
	 * @param {string} [label]
	 * @param {string} [icon]
	 */
	private getTool(name: string, command: AnyFunction, label?: string, icon?: string): object;

	/**
	 * Get the WikiEditor configuration for a toggle button that controls a preference.
	 * This will toggle the extension with the given `name`.
	 *
	 * @param {string} name
	 * @param {string} icon
	 */
	private getToggleTool(name: string, icon: string): object;

	/**
	 * The WikiEditor configuration for the preferences tool.
	 */
	private get preferencesTool(): object;

	/**
	 * StateCommand interface for CodeMirror operations.
	 */
	private get stateCommand(): StateCommand;

	/**
	 * Fire the deprecated switch hook.
	 */
	private fireSwitchHook(): void;

	/**
	 * Adds the Realtime Preview handler.
	 */
	private addRealtimePreviewHandler(): void;

	/**
	 * For use in non-wikitext modes.
	 */
	private addCodeFormattingButtonsToToolbar(): void;

	/**
	 * The switch hook (deprecated).
	 */
	private switchHook?: any;
}
