const codeMirrorExt = /** @type {typeof import('./CodeMirrorWikiEditor').default} */ (
	mw.loader.getState('ext.CodeMirror.v6.WikiEditor') === 'ready'
		? mw.loader.require('ext.CodeMirror.v6.WikiEditor')
		: // eslint-disable-next-line jsdoc/require-jsdoc
			class {}
)

/**
 * Our CodeMirror-based comment input widget.
 */
export default class CodeMirrorCommentInput extends codeMirrorExt {
	/**
	 * @param {import('./MultilineTextInputWidget').default} commentInput
	 */
	constructor(commentInput) {
		super(commentInput.$input, mw.loader.require('ext.CodeMirror.v6.mode.mediawiki')())

		/**
		 * @type {{
		 *   Compartment: typeof import('@codemirror/state').Compartment
		 *   EditorView: typeof import('@codemirror/view').EditorView
		 *   placeholder: import('@codemirror/view').placeholder
		 * }}
		 */
		this.lib = mw.loader.require('ext.CodeMirror.v6.lib')
		this.cdPlaceholderCompartment = new this.lib.Compartment()
		this.cdChangeExtension = this.lib.EditorView.updateListener.of((update) => {
			if (update.docChanged) {
				this.textarea.dispatchEvent(new KeyboardEvent('input'))
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
					this.extensionRegistry.toggle(prefName, this.view, enabled)
					// Only update the preferences property directly to avoid
					// making API calls already made by the primary instance.
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
		super.destroy()

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
}
