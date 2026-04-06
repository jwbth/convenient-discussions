// eslint-disable-next-line jsdoc/require-jsdoc
export default function getOoUiInputCodeMirrorClass() {
	const codeMirrorExt = /** @type {typeof import('./CodeMirrorWikiEditor').default} */ (
		mw.loader.getState('ext.CodeMirror.v6.WikiEditor') === 'ready'
			? mw.loader.require('ext.CodeMirror.v6.WikiEditor')
			: // eslint-disable-next-line jsdoc/require-jsdoc
				class {}
	)

	// HACK: Name it CodeMirrorChild instead of OoUiInputCodeMirror to prevent focusing in
	// https://github.com/wikimedia/mediawiki-extensions-CodeMirror/blob/master/resources/codemirror.js

	/**
	 * Our CodeMirror extension for OOUI inputs.
	 */
	class CodeMirrorChild extends codeMirrorExt {
		/**
		 * @param {import('./MultilineTextInputWidget').default} input
		 */
		constructor(input) {
			super(input.$input, mw.loader.require('ext.CodeMirror.v6.mode.mediawiki')())

			/**
			 * @typedef {object} Lib
			 * @property {typeof import('@codemirror/state').Compartment} Compartment
			 * @property {typeof import('@codemirror/view').EditorView} EditorView
			 * @property {import('@codemirror/view').placeholder} placeholder
			 */

			/**
			 * @type {Lib}
			 */
			this.lib = mw.loader.require('ext.CodeMirror.v6.lib')
			this.cdPlaceholderCompartment = new this.lib.Compartment()
			this.cdChangeExtension = this.lib.EditorView.updateListener.of((update) => {
				// Make CodeMirror dispatch `input` events like OOUI's TextInputWidget. Also maintain `value`,
				// `selectionStart`, and `selectionEnd` properties on the textarea (for autocomplete by
				// Tribute).

				// Only calculate if the selection actually changed to avoid layout thrashing.
				if (update.selectionSet) {
					const target = /** @type {any} */ (update.view.contentDOM)

					// Sync the state to the DOM element properties. Third-party scripts usually check .value
					// and selection indices.
					target.value = update.state.doc.toString()
					target.selectionStart = update.state.selection.main.from
					target.selectionEnd = update.state.selection.main.to

					// Set the update object on the target element for other scripts to use.
					target.cdCodeMirrorUpdate = update

					if (!target.value) {
						// Natively it doesn't emit for some reason
						document.dispatchEvent(new Event('selectionchange'))
					}
				}

				// Dispatch the event from the contenteditable element.
				if (update.docChanged) {
					update.view.contentDOM.dispatchEvent(
						new Event('input', {
							bubbles: true,
							cancelable: true,
						}),
					)
				}
			})
			this.cdContentClassExtension = this.lib.EditorView.contentAttributes.of({
				class: 'ime-position-inside',
			})

			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			this.addMwHook?.(
				'ext.CodeMirror.preferences.apply',
				(/** @type {string} */ prefName, /** @type {boolean} */ enabled) => {
					if (enabled !== this.preferences.getPreference(prefName)) {
						if (this.extensionRegistry.isRegistered(prefName, this.view)) {
							this.extensionRegistry.toggle(prefName, this.view, enabled)
						}

						// Only update the preferences property directly to avoid making API calls already made by
						// the primary instance.
						// @ts-expect-error: the source library uses "@type {Object}"
						this.preferences.preferences[prefName] = enabled
					}
				},
			)
		}

		/**
		 * @param {import('@codemirror/state').Extension[]} [extensions]
		 * @param {string} [placeholderText]
		 * @override
		 */
		initialize(extensions = [], placeholderText = '') {
			this.mode = 'mediawiki'
			extensions.push(
				this.cdPlaceholderCompartment.of(this.lib.placeholder(placeholderText)),
				this.cdChangeExtension,
				this.cdContentClassExtension,
			)

			// Use `try` to monkey-patch some logging error thrown in field() in codemirror6.bundle.lib.js
			// when trying to open settings for a *second* comment form on the page (so it's an error caused
			// by creating multiple instances of a comment form on one page). MusikAnimal, if you see this,
			// consider fixing it in the source xD
			try {
				super.initialize([this.defaultExtensions, ...extensions])
			} catch {
				// Empty
			}
		}

		/**
		 * @param {string} text
		 */
		updatePlaceholder(text) {
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			this.view?.dispatch({
				effects: this.cdPlaceholderCompartment.reconfigure(this.lib.placeholder(text)),
			})
		}

		/**
		 * @override
		 */
		destroy() {
			try {
				super.destroy()
			} catch {
				// Empty
			}

			// Monkey-patch an error in CodeMirror in codemirror.wikieditor.js on line `button.setValue(
			// searchPanelOpen( this.view.state ) );` when closing a *second* comment form on the page (so
			// it's an error caused by creating multiple instances of a comment form on one page).
			// `dispatch()` lets to avoid another error when *opening* a new comment form. MusikAnimal, if
			// you see this, consider fixing it in the source xD
			this.view = {
				// @ts-ignore
				state: { field: () => null, config: { compartments: { get: () => null } } },
				dispatch: () => null,
			}
		}

		/**
		 * @param {boolean} enabled
		 */
		updateAutocompletePreference(enabled) {
			if (!this.extensionRegistry.isRegistered('autocomplete', this.view)) return

			this.preferences.lockPreference('autocomplete', this.view, enabled)
		}
	}

	return CodeMirrorChild
}
