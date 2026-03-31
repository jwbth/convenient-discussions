import type { Extension } from '@codemirror/state'
import type { EditorView, Panel } from '@codemirror/view'

import CodeMirrorCodex from './CodeMirrorCodex'

/**
 * Abstract class for a panel that can be used with CodeMirror.
 * This class provides methods to create CSS-only Codex components.
 *
 * @abstract
 */
export default abstract class CodeMirrorPanel extends CodeMirrorCodex {
	/**
	 * The current EditorView instance.
	 */
	view: EditorView

	/**
	 * @class
	 */
	constructor()

	/**
	 * Get the panel and any associated keymaps as an Extension.
	 * For use only during CodeMirror initialization.
	 *
	 * @abstract
	 */
	abstract get extension(): Extension

	/**
	 * Get the Panel object.
	 *
	 * @abstract
	 */
	abstract get panel(): Panel
}
