/**
 * Options for creating a Codex button.
 */
interface CodexButtonOptions {
		/**
		 * Icon name for the button.
		 */
		icon?: string | null;

		/**
		 * Whether the button should be icon-only (no text).
		 */
		iconOnly?: boolean;

		/**
		 * The action type of the button.
		 */
		action?: 'default' | 'progressive' | 'destructive';

		/**
		 * The weight/style of the button.
		 */
		weight?: 'normal' | 'primary' | 'quiet';
}

/**
 * Provides methods to create CSS-only Codex components.
 */
export default class CodeMirrorCodex {
		/**
		 * The current dialog element, if any.
		 */
		dialog: HTMLDivElement | null;

		/**
		 * Keydown event listener for dialog management.
		 */
		private keydownListener?: (event: KeyboardEvent) => void;

		constructor();

		/**
		 * Get a CSS-only Codex TextInput.
		 *
		 * @param {string} name
		 * @param {string} [value]
		 * @param {string} placeholder
		 * @returns {[HTMLDivElement, HTMLInputElement]} [wrapper, input]
		 */
		getTextInput(name: string, value?: string, placeholder?: string): [HTMLDivElement, HTMLInputElement];

		/**
		 * Get a CSS-only Codex Button.
		 *
		 * @param {string} label
		 * @param {CodexButtonOptions} [opts]
		 * @returns {HTMLButtonElement}
		 */
		getButton(label: string, opts?: CodexButtonOptions): HTMLButtonElement;

		/**
		 * Get a CSS-only Codex Checkbox.
		 *
		 * @param {string} name
		 * @param {string} label
		 * @param {boolean} [checked]
		 * @returns {[HTMLSpanElement, HTMLInputElement]} [wrapper, input]
		 */
		getCheckbox(name: string, label: string, checked?: boolean): [HTMLSpanElement, HTMLInputElement];

		/**
		 * Get a CSS-only Codex ToggleButton.
		 *
		 * @param {string} name
		 * @param {string} label
		 * @param {string} icon
		 * @param {boolean} [checked]
		 * @returns {HTMLButtonElement}
		 */
		getToggleButton(name: string, label: string, icon: string, checked?: boolean): HTMLButtonElement;

		/**
		 * Get a CSS-only Codex fieldset with a legend.
		 *
		 * @param {string | HTMLElement} legendText
		 * @param {...HTMLElement[]} fields
		 * @returns {HTMLFieldSetElement}
		 */
		getFieldset(legendText: string | HTMLElement, ...fields: HTMLElement[]): HTMLFieldSetElement;

		/**
		 * Show a Codex Dialog.
		 *
		 * This implements a vanilla JS port of the Codex Dialog component.
		 *
		 * @param {string} title
		 * @param {string} name Constructed into the CSS class `cm-mw-${name}-dialog`
		 * @param {HTMLElement | HTMLElement[]} contents
		 * @param {HTMLElement | HTMLElement[]} [actions] Buttons or other actions to show in the footer.
		 * @returns {HTMLDivElement}
		 */
		showDialog(
				title: string,
				name: string,
				contents: HTMLElement | HTMLElement[],
				actions?: HTMLElement | HTMLElement[]
		): HTMLDivElement;

		/**
		 * Fade the dialog in or out, adjusting for scrollbar widths to prevent shifting of content.
		 * This almost fully mimics the way the Codex handles its Dialog component, with the exception
		 * that we don't force a focus trap, nor do we set aria-hidden on other elements in the DOM.
		 * This is to keep our implementation simple until something like T382532 is realized.
		 *
		 * @param {boolean} open
		 */
		protected animateDialog(open?: boolean): void;
}
