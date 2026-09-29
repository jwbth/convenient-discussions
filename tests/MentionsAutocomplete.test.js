import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const cdMock = vi.hoisted(() => ({
	g: {
		msInMin: 60_000,
		phpCharToUpper: {},
		contribsPages: ['Special:Contributions'],
		userNamespacesRegexp: /^User(?: talk)?:([^/]+(?:\/.*)?)$/,
	},
	config: { mentionRequiresLeadingSpace: true },
	debug: { logWarn: () => {} },
	s: (/** @type {string} */ key) => key,
	mws: (/** @type {string} */ key) =>
		/** @type {{ [key: string]: string }} */ ({
			'word-separator': ' ',
			'colon-separator': ': ',
		})[key],
	getApi: vi.fn(),
}))

vi.mock('../src/loader/cd', () => ({ default: cdMock }))
vi.mock('../src/shared/cd', () => ({ default: cdMock }))
vi.mock('../src/utils-api', () => ({
	handleApiReject: (/** @type {unknown} */ error) => {
		throw error
	},
}))
vi.mock('../src/userRegistry', () => ({
	default: {
		get: (/** @type {string} */ name) => ({
			getNamespaceAlias: () => 'User',
			isRegistered: () => !/^\d+\.\d+\.\d+\.\d+$/.test(name),
		}),
	},
}))

import BaseAutocomplete from '../src/BaseAutocomplete'
import MentionsAutocomplete from '../src/MentionsAutocomplete'

/**
 * Assemble the wikitext Tribute inserts for a plain Enter (no modifier keys).
 *
 * @param {import('../src/tribute/Tribute').Insertion} insertion
 * @returns {string}
 */
const assemble = (insertion) =>
	insertion.start +
	((!insertion.omitContentCheck?.() && insertion.content) || '') +
	(insertion.end || '')

/** @type {MentionsAutocomplete} */
let autocomplete

beforeEach(() => {
	autocomplete = new MentionsAutocomplete()
})

afterEach(() => {
	autocomplete.destroy()
})

describe('MentionsAutocomplete.getInsertionFromEntry', () => {
	it('uses the pipe trick for a registered user', () => {
		const insertion = autocomplete.getInsertionFromEntry(' Example ')

		expect(insertion).toMatchObject({ start: '@[[User:Example|', end: ']]', content: 'Example' })
		expect(assemble(insertion)).toBe('@[[User:Example|]]')
	})

	it('uses the selected text as the link text', () => {
		const insertion = autocomplete.getInsertionFromEntry('Example', 'my friend')

		expect(assemble(insertion)).toBe('@[[User:Example|my friend]]')
	})

	it('links an unregistered user to their contributions with the name as the link text', () => {
		expect(assemble(autocomplete.getInsertionFromEntry('1.2.3.4'))).toBe(
			'@[[Special:Contributions/1.2.3.4|1.2.3.4]]',
		)
	})

	it.each(['Foo (bar)', 'Foo, bar'])(
		'spells out the link text for %s, where the pipe trick would mangle it',
		(name) => {
			expect(assemble(autocomplete.getInsertionFromEntry(name))).toBe(`@[[User:${name}|${name}]]`)
		},
	)

	it('uses only the selected text as the link text for a name with a parenthesis', () => {
		expect(assemble(autocomplete.getInsertionFromEntry('Foo (bar)', 'my friend'))).toBe(
			'@[[User:Foo (bar)|my friend]]',
		)
	})

	it.each(['altModify', 'cmdModify'])('appends a colon after the link on %s', (method) => {
		const insertion = autocomplete.getInsertionFromEntry('Example')
		insertion[method]()

		expect(assemble(insertion)).toBe('@[[User:Example|]]: ')
	})
})

describe('MentionsAutocomplete.validateInput', () => {
	it.each([
		['Example', true],
		['Jack who built the house', true],
		['a b c d e f', false],
		['', false],
		['a'.repeat(85), true],
		['a'.repeat(86), false],
		...[...'#<>[]|{}/@:'].map((char) => [`Foo${char}`, false]),
	])('%j → %s', (text, expected) => {
		expect(autocomplete.validateInput(/** @type {string} */ (text))).toBe(expected)
	})
})

it('passes the leading-space requirement from the config to Tribute', () => {
	expect(autocomplete.getCollectionProperties()).toEqual({ requireLeadingSpace: true })
})

describe('MentionsAutocomplete.makeApiRequest', () => {
	beforeEach(() => {
		mw.config.set('wgFormattedNamespaces', { 3: 'User talk' })
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('searches user talk pages with the first letter capitalized and drops subpages', async () => {
		const search = vi.spyOn(BaseAutocomplete, 'makeTitleSearchRequest').mockResolvedValue({
			pages: [
				{ id: 1, key: '', title: 'User talk:Example' },
				{ id: 2, key: '', title: 'User talk:Example/Archive' },
				{ id: 3, key: '', title: 'Talk:Example' },
			],
		})

		expect(await autocomplete.makeApiRequest('example')).toEqual(['Example'])
		expect(search).toHaveBeenCalledWith('User talk:Example')
		expect(cdMock.getApi).not.toHaveBeenCalled()
	})

	it('falls back to the list of all users when the search finds no users', async () => {
		vi.spyOn(BaseAutocomplete, 'makeTitleSearchRequest').mockResolvedValue({ pages: [] })
		const get = vi.fn(async () => ({ query: { allusers: [{ name: 'Example' }, { name: 'Example2' }] } }))
		cdMock.getApi.mockReturnValue({ get })

		expect(await autocomplete.makeApiRequest('ex')).toEqual(['Example', 'Example2'])
		expect(get).toHaveBeenCalledWith(expect.objectContaining({ list: 'allusers', auprefix: 'Ex' }))
	})

	it('rejects when the all-users response has no query data', async () => {
		vi.spyOn(BaseAutocomplete, 'makeTitleSearchRequest').mockResolvedValue({ pages: [] })
		cdMock.getApi.mockReturnValue({ get: async () => ({}) })

		await expect(autocomplete.makeApiRequest('ex')).rejects.toThrow()
	})
})
