import BaseAutocomplete from './BaseAutocomplete'
import cd from './loader/cd'
import CdError from './shared/CdError'
import { defined, ucFirst } from './shared/utils-general'
import userRegistry from './userRegistry'
import { handleApiReject } from './utils-api'

/**
 * @typedef {string} MentionEntry
 */

/**
 * Autocomplete class for user mentions. Handles `@`-triggered autocomplete for user names,
 * including both registered and unregistered users.
 */
class MentionsAutocomplete extends BaseAutocomplete {
	/**
	 * Get the display label for mentions autocomplete.
	 *
	 * @override
	 * @returns {string}
	 */
	getLabel() {
		return cd.s('cf-autocomplete-mentions-label')
	}

	/**
	 * Get the trigger character for mentions autocomplete.
	 *
	 * @override
	 * @returns {string}
	 */
	getTrigger() {
		return cd.config.mentionCharacter
	}

	/**
	 * Transform a user name entry into insertion data for the Tribute library.
	 *
	 * @override
	 * @param {string} entry The user name to transform
	 * @param {string} [selectedText] Text that was selected before typing the autocomplete trigger
	 * @returns {import('./tribute/Tribute').Insertion & { end: string, content: string }}
	 */
	getInsertionFromEntry(entry, selectedText) {
		const name = entry.trim()
		const user = userRegistry.get(name)
		const userNamespace = user.getNamespaceAlias()
		const pageName = user.isRegistered()
			? `${userNamespace}:${name}`
			: `${cd.g.contribsPages[0]}/${name}`

		// Use selected text as content if available, otherwise use the user name

		return {
			start: `@[[${pageName}|`,
			end: pageName.match(/[(,]/) ? `${name}]]` : ']]',
			content: selectedText || name,
			omitContentCheck() {
				return !selectedText && !this.start.includes('/')
			},
			altModify() {
				this.end += cd.mws('colon-separator', { language: 'content' })
			},
			cmdModify() {
				this.end += cd.mws('colon-separator', { language: 'content' })
			},
		}
	}

	/**
	 * Extract the display label from a mention entry.
	 *
	 * @override
	 * @param {string} entry The mention entry to extract label from
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
			requireLeadingSpace: cd.config.mentionRequiresLeadingSpace,
		}
	}

	/**
	 * Validate input text for mentions autocomplete.
	 *
	 * @override
	 * @param {string} text The input text to validate
	 * @returns {boolean} Whether the input is valid for making API requests
	 */
	validateInput(text) {
		return Boolean(
			text &&
			text.length <= 85 &&
			!/[#<>[\]|{}/@:]/.test(text) &&
			// 5 spaces in a user name seem too many. "Jack who built the house" has 4 :-)
			(text.match(new RegExp(cd.mws('word-separator', { language: 'content' }), 'g')) || [])
				.length <= 4,
		)
	}

	/**
	 * Make an API request to get relevant user names.
	 *
	 * @override
	 * @param {string} text The search text
	 * @returns {Promise<string[]>} Promise resolving to array of user names
	 */
	async makeApiRequest(text) {
		text = ucFirst(text)

		// First, try to use the search to get only users that have talk pages. Most legitimate
		// users do, while spammers don't.
		const userTalkPrefix = mw.config.get('wgFormattedNamespaces')[3]
		const response = await BaseAutocomplete.makeTitleSearchRequest(
			userTalkPrefix + ':' + text,
		)

		const users = response.pages
			.map((page) => (page.title.match(cd.g.userNamespacesRegexp) || [])[1])
			.filter(defined)
			.filter((name) => !name.includes('/'))

		if (users.length) {
			return users
		}

		// If we didn't succeed with search, try the entire users database.
		/** @type {ApiResponseQuery<ApiResponseQueryContentAllUsers>} */
		const allUsersResponse = await cd
			.getApi(BaseAutocomplete.apiConfig)
			.get({
				action: 'query',
				list: 'allusers',
				auprefix: text,
			})
			.catch(handleApiReject)

		if (BaseAutocomplete.currentPromise) {
			BaseAutocomplete.promiseIsNotSuperseded(BaseAutocomplete.currentPromise)
		}

		if (!allUsersResponse.query) {
			throw new CdError({ type: 'response', message: 'No query data in response' })
		}

		return allUsersResponse.query.allusers.map((/** @type {{ name: string }} */ user) => user.name)
	}
}

export default MentionsAutocomplete
