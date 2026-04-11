import BaseAutocomplete from './BaseAutocomplete'
import cd from './loader/cd'
import CdError from './shared/CdError'
import { handleApiReject } from './utils-api'

/**
 * @typedef {string} TemplateEntry
 */

/**
 * Autocomplete class for templates. Handles template name validation, TemplateData API integration,
 * and template parameter insertion with Shift+Enter functionality.
 *
 * @augments BaseAutocomplete
 */
class TemplatesAutocomplete extends BaseAutocomplete {
	/**
	 * @override
	 * @returns {string}
	 */
	getLabel() {
		return cd.s('cf-autocomplete-templates-label')
	}

	/**
	 * @override
	 * @returns {string}
	 */
	getTrigger() {
		return '{{'
	}

	/**
	 * @override
	 * @param {string} text The input text to validate
	 * @returns {boolean} Whether the input is valid for templates
	 */
	validateInput(text) {
		return Boolean(
			text &&
			text.length <= 255 &&
			!/[#<>[\]|{}]/.test(text) &&
			// 10 spaces in a page name seems too many.
			(text.match(new RegExp(cd.mws('word-separator', { language: 'content' }), 'g')) || [])
				.length <= 9 &&
			// Don't allow nested templates
			!text.includes('{{'),
		)
	}

	/**
	 * @override
	 * @param {string} text The search text
	 * @returns {Promise<string[]>} Promise resolving to array of template suggestions
	 */
	async makeApiRequest(text) {
		// Determine the search string based on namespace detection
		let searchString
		let isExplicitNamespace = false
		const hasLeadingColon = text.startsWith(':')

		if (hasLeadingColon) {
			// Leading colon means main namespace or explicit namespace
			searchString = text.slice(1)
			isExplicitNamespace = true
		} else {
			// Try to parse as a title to detect if a namespace is specified
			const title = mw.Title.newFromText(text)
			if (title && title.getNamespaceId() !== 10) {
				// Namespace is specified and it's not the Template namespace (ID 10)
				searchString = text
				isExplicitNamespace = true
			} else {
				// No namespace or Template namespace - use default Template: prefix
				searchString = 'Template:' + text
			}
		}

		const response = await BaseAutocomplete.makeOpenSearchRequest({
			search: searchString,
			redirects: 'return',
		})

		return response[1]
			.filter((name) => !/(\/doc(?:umentation)?|\.css)$/.test(name))
			.map((name) => {
				if (isExplicitNamespace) {
					// Keep the full name and preserve leading colon if it was in the original input
					return hasLeadingColon ? ':' + name : name
				}

				// Strip Template: prefix for regular templates
				return name.slice(name.indexOf(':') + 1)
			})
			.map((name) =>
				mw.config.get('wgCaseSensitiveNamespaces').includes(10)
					? name
					: this.useOriginalFirstCharCase(name, text),
			)
	}

	/**
	 * Transform a template name entry into insertion data for the Tribute library.
	 *
	 * @override
	 * @param {string} entry The template name to transform
	 * @param {string} [selectedText] Text that was selected before typing the autocomplete trigger
	 * @returns {import('./tribute/Tribute').InsertData & { end: string }}
	 */
	getInsertionFromEntry(entry, selectedText) {
		return {
			start: '{{' + entry.trim(),
			end: '}}',
			content: selectedText,
			shiftModify() {
				this.start += '|'
			},
		}
	}

	/**
	 * Extract the display label from a template entry.
	 *
	 * @override
	 * @param {string} entry The template entry to extract label from
	 * @returns {string} The display label
	 */
	getLabelFromEntry(entry) {
		return entry
	}

	/**
	 * Get collection-specific properties for Tribute configuration.
	 *
	 * @override
	 * @returns {Partial<import('./tribute/Tribute').TributeCollection>} Collection properties
	 */
	getCollectionProperties() {
		return {
			keepAsEnd: /^(?:\||\}\})/,
			tabSelectsStartOnly: true,
			selectTemplate: (option, event) => {
				if (!option) {
					return ''
				}

				// Handle special template data insertion for templates
				if (this.manager?.useTemplateData && event.shiftKey && !event.altKey) {
					const input = /** @type {import('./TextInputWidget').default} */ (
						/** @type {HTMLElement} */ (this.manager.tribute.current.element).cdInput
					)
					setTimeout(() => this.insertTemplateData(option, input))
				}

				// Get selected text from the input widget if available
				const element = this.manager?.tribute.current.element
				let selectedText
				if (
					element?.cdInput &&
					typeof element.cdInput.getAutocompleteSavedSelection === 'function'
				) {
					const savedSelection = element.cdInput.getAutocompleteSavedSelection()
					if (
						savedSelection &&
						// By this comparison we make sure that the user immediately pressed the trigger
						// character after selecting text.
						savedSelection.start ===
							option.original.autocomplete?.manager?.tribute.current.triggerPos
					) {
						selectedText = savedSelection.selectedText
					}
				}

				return this.getInsertionFromEntry(option.original.entry, selectedText)
			},
		}
	}

	/**
	 * Get autocomplete data for a template and insert template parameters. This method handles the
	 * Shift+Enter functionality for template parameter insertion.
	 *
	 * @param {import('./tribute/Tribute').TributeSearchResults<import('./BaseAutocomplete').Option<string>>} option
	 * @param {import('./TextInputWidget').default} input
	 * @returns {Promise<void>}
	 */
	async insertTemplateData(option, input) {
		input.setDisabled(true).pushPending()

		/** @type {APIResponseTemplateData} */
		let response
		try {
			response = await cd
				.getApi(BaseAutocomplete.apiConfig)
				.get({
					action: 'templatedata',
					titles: `Template:${option.original.label}`,
					redirects: true,
				})
				.catch(handleApiReject)
			if (!Object.keys(response.pages).length) {
				throw new CdError('Template missing.')
			}
		} catch {
			input.setDisabled(false).focus().popPending()

			return
		}

		const pages = response.pages
		let paramsString = ''
		let firstValueIndex = 0
		Object.keys(pages).forEach((key) => {
			const template = pages[key]
			const params = template.params || {}

			// Parameter names
			;(template.paramOrder || Object.keys(params))
				.filter((param) => params[param].required || params[param].suggested)
				.forEach((param) => {
					if (template.format === 'block') {
						paramsString += `\n| ${param} = `
					} else {
						paramsString += Number.isNaN(Number(param)) ? `|${param}=` : `|`
					}
					if (!firstValueIndex) {
						firstValueIndex = paramsString.length
					}
				})
			if (template.format === 'block' && paramsString) {
				paramsString += '\n'
			}
		})

		// Remove leading "|".
		paramsString = paramsString.slice(1)

		input
			.setDisabled(false)
			.insertContent(paramsString)

			// `input.getRange().to` is the current caret index
			.selectRange(/** @type {number} */ (input.getRange().to || 0) + firstValueIndex - 1)

			.popPending()
	}
}

export default TemplatesAutocomplete
