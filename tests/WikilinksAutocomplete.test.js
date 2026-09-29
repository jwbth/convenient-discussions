import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const cdMock = vi.hoisted(() => ({
	s: (/** @type {string} */ key) => key,
	mws: () => ' ',
	getApi: vi.fn(),
	g: {
		phpCharToUpper: {},
		isProbablyWmfSulWiki: false,
		userLanguage: 'en',
		serverName: 'test.wikipedia.org',
		msInMin: 60_000,
	},
	debug: { logWarn: () => {} },
}))

vi.mock('../src/loader/cd', () => ({ default: cdMock }))
vi.mock('../src/shared/cd', () => ({ default: cdMock }))

vi.mock('../src/utils-window', () => ({
	interlanguagePrefixes: new Set(['en', 'de', 'simple']),
}))

vi.mock('../src/utils-api', () => ({
	handleApiReject: (/** @type {unknown} */ error) => {
		throw error
	},
}))

vi.mock('../src/shared/utils-general', async (importOriginal) => ({
	...(await importOriginal()),
	parseWikiUrl: (/** @type {string} */ url) => {
		const [, hostname, pageName] = /** @type {RegExpMatchArray} */ (
			url.match(/^https:\/\/([^/]+)\/wiki\/(.*)$/)
		)

		return { hostname, pageName: decodeURIComponent(pageName).replace(/_/g, ' ') }
	},
}))

// A title parser just smart enough for namespace prefixes, aliases, and first-letter case.
vi.mock('../src/CrossSiteMwTitle', () => {
	const localNamespaceIds = { user: 2, wikipedia: 4, wp: 4, file: 6, category: 14 }
	const wikidataNamespaceIds = { ...localNamespaceIds, property: 120, lexeme: 146 }
	/** @type {Record<number, string>} */
	const namespaceNames = {
		2: 'User',
		4: 'Wikipedia',
		6: 'File',
		14: 'Category',
		120: 'Property',
		146: 'Lexeme',
	}

	class FakeCrossSiteMwTitle {
		static loadHostData = vi.fn()

		/**
		 * @param {string} text
		 * @param {number} [_namespace]
		 * @param {string} [hostname]
		 */
		static newFromText(text, _namespace, hostname = 'test.wikipedia.org') {
			return text.replace(/^:/, '') ? new this(text, hostname) : null
		}

		/**
		 * @param {string} text
		 * @param {string} hostname
		 */
		constructor(text, hostname) {
			const [, prefix, rest] =
				text
					.replace(/^:/, '')
					.replace(/_/g, ' ')
					.match(/^(?:([^:]+):)?(.*)$/) || []
			const ids = hostname === 'www.wikidata.org' ? wikidataNamespaceIds : localNamespaceIds
			const namespace = prefix === undefined ? undefined : ids[prefix.toLowerCase()]
			const main = namespace === undefined && prefix !== undefined ? prefix + ':' + rest : rest
			this.namespace = namespace ?? 0
			this.alias = namespace === undefined ? undefined : prefix
			this.title = main.charAt(0).toUpperCase() + main.slice(1)
			this.hostname = hostname
		}

		getNamespaceId() {
			return this.namespace
		}

		getMainText() {
			return this.title
		}

		getNamespacePrefix() {
			return this.namespace ? namespaceNames[this.namespace] + ':' : ''
		}

		getPrefixedText() {
			return this.getNamespacePrefix() + this.title
		}

		getOriginalNamespaceAlias() {
			return this.alias
		}
	}

	return { default: FakeCrossSiteMwTitle }
})

import BaseAutocomplete from '../src/BaseAutocomplete'
import CrossSiteMwTitle from '../src/CrossSiteMwTitle'
import WikilinksAutocomplete from '../src/WikilinksAutocomplete'

BaseAutocomplete.delay = 0

// Partial globals; cast through `any`.
const anyMw = /** @type {any} */ (mw)
const anyWindow = /** @type {any} */ (window)

/** @type {any} */
let autocomplete
/** @type {import('vitest').Mock} */
let fetchMock
/** @type {import('vitest').Mock} */
let foreignApiGet
/** @type {Record<string, string>} Interwiki link → URL, as `getUrlFromInterwikiLink` would resolve */
let interwikiUrls

/**
 * @param {string} text
 */
const title = (text, hostname = 'test.wikipedia.org') =>
	/** @type {any} */ (CrossSiteMwTitle).newFromText(text, undefined, hostname)

/**
 * Get the text that selecting the entry inserts, as `[[start` + `content` + `end`.
 *
 * @param {object} entry
 * @param {{ shift?: boolean, selectedText?: string }} [options]
 */
const insert = (entry, { shift = false, selectedText } = {}) => {
	const insertion = autocomplete.getInsertionFromEntry(entry, selectedText)
	if (shift) {
		insertion.shiftModify()
	}

	return insertion.start + (insertion.content ?? '') + insertion.end
}

/**
 * @param {Array<{ title: string, matched_title?: string }>} pages
 */
const respondWithPages = (pages) => {
	fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ pages }) })
}

beforeEach(() => {
	Object.entries({
		wgNamespaceIds: { '': 0, 'user': 2, 'wikipedia': 4, 'wp': 4, 'file': 6, 'category': 14 },
		wgCaseSensitiveNamespaces: [],
		wgServerName: 'test.wikipedia.org',
		wgScriptPath: '/w',
	}).forEach(([name, value]) => mw.config.set(name, value))
	cdMock.getApi.mockReset()
	fetchMock = vi.fn()
	vi.stubGlobal('fetch', fetchMock)
	foreignApiGet = vi.fn()
	const get = foreignApiGet
	anyMw.ForeignApi = class {
		get = get
	}
	interwikiUrls = {
		'en:': 'https://en.wikipedia.org/wiki/',
		'w:en:': 'https://en.wikipedia.org/wiki/',
		'wikt:': 'https://en.wiktionary.org/wiki/',
		'd:': 'https://www.wikidata.org/wiki/',
		'test:': 'https://test.wikipedia.org/wiki/',
	}
	anyWindow.getUrlFromInterwikiLink = vi.fn(async (/** @type {string} */ text) => {
		const prefix = Object.keys(interwikiUrls)
			.sort((a, b) => b.length - a.length)
			.find((p) => text.startsWith(p))

		return prefix && interwikiUrls[prefix] + encodeURIComponent(text.slice(prefix.length))
	})
	autocomplete = new WikilinksAutocomplete()
})

afterEach(() => {
	vi.unstubAllGlobals()
	autocomplete.cache.destroy()
})

describe('getInsertionFromEntry', () => {
	it('inserts pageName in preference to the canonical prefixed text', () => {
		expect(insert({ title: title('Wikipedia:Foo'), pageName: 'WP:Foo' })).toBe('[[WP:Foo]]')
		expect(insert({ title: title('wp:foo') })).toBe('[[Wikipedia:Foo]]')
	})

	it('adds a leading colon to Category links, so that they link instead of categorizing', () => {
		expect(insert({ title: title('Category:Foo'), pageName: 'Category:Foo' })).toBe(
			'[[:Category:Foo]]',
		)
	})

	it('does not double the colon the user already typed', () => {
		expect(
			insert({ title: title('Category:Foo'), pageName: 'Category:Foo', colonPrefix: true }),
		).toBe('[[:Category:Foo]]')
		expect(
			insert({
				title: title('Foo', 'en.wikipedia.org'),
				pageName: 'Foo',
				interwikiPrefix: 'en:',
				colonPrefix: true,
			}),
		).toBe('[[:en:Foo]]')
	})

	it('keeps a colon the user typed before a namespace that does not need it', () => {
		expect(insert({ title: title('File:X.png'), pageName: 'File:X.png', colonPrefix: true })).toBe(
			'[[:File:X.png]]',
		)
	})

	it('adds a leading colon to local titles starting with "/", so that they are not relative links', () => {
		expect(insert({ title: title('/dev/null'), pageName: '/dev/null' })).toBe('[[:/dev/null]]')
	})

	it.each([
		['en:', '[[:en:Foo]]'],
		['en:wikt:', '[[:en:wikt:Foo]]'],
		['w:en:', '[[w:en:Foo]]'],
		['wikt:', '[[wikt:Foo]]'],
		['wikt:en:', '[[wikt:en:Foo]]'],
	])(
		'adds a leading colon only when the first interwiki prefix is interlanguage (%s)',
		(interwikiPrefix, expected) => {
			expect(
				insert({ title: title('Foo', 'en.wikipedia.org'), pageName: 'Foo', interwikiPrefix }),
			).toBe(expected)
		},
	)

	it('adds a leading colon to a remote Category even behind a non-interlanguage prefix', () => {
		expect(
			insert({
				title: title('Category:Foo', 'en.wikipedia.org'),
				pageName: 'Category:Foo',
				interwikiPrefix: 'w:',
			}),
		).toBe('[[:w:Category:Foo]]')
	})

	it('does not treat a remote title starting with "/" as a relative link', () => {
		expect(
			insert({
				title: title('/dev/null', 'en.wiktionary.org'),
				pageName: '/dev/null',
				interwikiPrefix: 'wikt:',
			}),
		).toBe('[[wikt:/dev/null]]')
	})

	it('appends the section fragment', () => {
		expect(insert({ title: title('Foo'), pageName: 'Foo', fragment: 'Bar baz' })).toBe(
			'[[Foo#Bar baz]]',
		)
	})

	describe('shiftModify', () => {
		it('makes a piped link labeled with the page name, without the interwiki prefix', () => {
			expect(
				insert(
					{
						title: title('Foo', 'en.wikipedia.org'),
						pageName: 'Foo',
						interwikiPrefix: 'en:',
						fragment: 'Sec',
					},
					{ shift: true },
				),
			).toBe('[[:en:Foo#Sec|Foo#Sec]]')
		})

		it('labels Wikidata entities with their display label', () => {
			expect(
				insert(
					{
						title: title('Q42', 'www.wikidata.org'),
						pageName: 'Q42',
						interwikiPrefix: 'd:',
						isWikidataEntity: true,
						displayLabel: 'Douglas Adams',
					},
					{ shift: true },
				),
			).toBe('[[d:Q42|Douglas Adams]]')
		})

		it('keeps the selected text as the label', () => {
			expect(
				insert({ title: title('Foo'), pageName: 'Foo' }, { shift: true, selectedText: 'text' }),
			).toBe('[[Foo|text]]')
		})
	})
})

describe('validateInput', () => {
	it.each([
		'Foo',
		'Category:Foo',
		':Category:Foo',
		'category:foo',
		':File:X.png',
		// Candidate interwikis pass, to be resolved later
		'en:Foo',
		':en:Foo',
		'w:en:Foo',
		'wikt:foo',
		'en:Category:Foo',
		'Foo#',
		'Foo#Bar baz',
		':Category:Foo#Sec',
		'en:Foo#Sec',
		'Foo#Sec with # inside',
		'Foo:Bar',
	])('accepts %j', (text) => {
		expect(autocomplete.validateInput(text)).toBe(true)
	})

	it.each([
		['', 'empty'],
		[':', 'a bare colon'],
		[':Foo', 'a colon before a main-namespace title'],
		[':Category', 'a colon before a namespace name without its colon'],
		['Foo|Bar', 'a pipe'],
		['Foo]]', 'brackets'],
		['Foo{{', 'braces'],
		['<b>', 'angle brackets'],
		['#Sec', 'a fragment without a page name'],
		['Foo#Sec|label', 'a pipe in the fragment'],
		['Foo#Sec]]', 'brackets in the fragment'],
		['a'.repeat(256), 'over 255 characters'],
		['Foo#' + 'a'.repeat(256), 'a fragment over 255 characters'],
		['a b c d e f g h i j k', '10 word separators'],
	])('rejects %j (%s)', (text) => {
		expect(autocomplete.validateInput(text)).toBe(false)
	})

	it('accepts 9 word separators', () => {
		expect(autocomplete.validateInput('a b c d e f g h i j')).toBe(true)
	})
})

describe('detectSectionFragment', () => {
	it('splits at the first "#"', () => {
		expect(autocomplete.detectSectionFragment('Foo#Bar#baz')).toEqual({
			pageName: 'Foo',
			fragment: 'Bar#baz',
		})
	})

	it('keeps the leading colon and interwiki prefix in the page name', () => {
		expect(autocomplete.detectSectionFragment(':en:Foo#')).toEqual({
			pageName: ':en:Foo',
			fragment: '',
		})
	})

	it.each(['Foo', '#Sec', 'Foo|x#Sec'])('returns nothing for %j', (text) => {
		expect(autocomplete.detectSectionFragment(text)).toBeUndefined()
	})
})

describe('extractInterwikiPrefix', () => {
	it.each([
		['en:Foo', 'Foo', 'en:'],
		['w:en:Foo', 'Foo', 'w:en:'],
		['en:Category:Foo', 'Category:Foo', 'en:'],
		// The remote page name may be normalized; only the colon count matters.
		['en:foo_bar ', 'Foo bar', 'en:'],
		['Foo', 'Foo', ''],
		['Category:Foo', 'Category:Foo', ''],
	])('extracts from %j with remote page %j: %j', (text, remotePageName, expected) => {
		expect(autocomplete.extractInterwikiPrefix(text, remotePageName)).toBe(expected)
	})
})

describe('normalizeSectionName', () => {
	it('lowercases and turns underscores into spaces', () => {
		expect(autocomplete.normalizeSectionName('Foo_Bar baz')).toBe('foo bar baz')
	})
})

describe('useOriginalFirstCharCase', () => {
	it.each([
		['Foo bar', 'foo', 'foo bar'],
		['Foo bar', 'Foo', 'Foo bar'],
		['Ärger', 'ä', 'ärger'],
		// All caps first word is an acronym
		['ABBA songs', 'abba', 'ABBA songs'],
		// A single capital letter is not an acronym
		['A song', 'a', 'a song'],
	])('turns %j typed as %j into %j', (result, query, expected) => {
		expect(autocomplete.useOriginalFirstCharCase(result, query)).toBe(expected)
	})
})

describe('keepAsEnd', () => {
	/**
	 * @param {string} textAfterCaret
	 * @returns {[string, string] | undefined} The replaced text and the kept delimiter
	 */
	const matchEnd = (textAfterCaret) => {
		const match = autocomplete.getCollectionProperties().keepAsEnd.exec(textAfterCaret)

		return match ? [match[0], match[1]] : undefined
	}

	it.each([
		[']] and more', [']]', ']]']],
		[' (disambiguation)]] text', [' (disambiguation)]]', ']]']],
		['ar|label]]', ['ar|', '|']],
		['ar#Section]]', ['ar#', '#']],
		['x'.repeat(50) + ']]', ['x'.repeat(50) + ']]', ']]']],
	])('in %j, replaces %j', (textAfterCaret, expected) => {
		expect(matchEnd(textAfterCaret)).toEqual(expected)
	})

	it.each([
		['text', 'no delimiter'],
		['x'.repeat(51) + ']]', 'a tail over 50 chars'],
		[' text\nmore]]', 'a newline'],
		[' see [[Other]]', 'another link opening first'],
		[' {{tl|x}}', 'a template'],
		['] text', 'a lone bracket'],
	])('replaces nothing in %j (%s)', (textAfterCaret) => {
		expect(matchEnd(textAfterCaret)).toBeUndefined()
	})
})

describe('getOptionsFromEntries', () => {
	it('deduplicates by label and turns plain strings into entries', () => {
		const entry = { title: title('Foo'), pageName: 'Foo', label: 'Foo' }
		const options = autocomplete.getOptionsFromEntries([entry, 'Foo', 'bar', undefined])

		expect(options.map((/** @type {any} */ option) => option.label)).toEqual(['Foo', 'bar'])
		expect(options[0].entry).toBe(entry)
		expect(insert(options[1].entry)).toBe('[[bar]]')
	})
})

describe('searchLocal', () => {
	it('matches labels containing the text, prefix matches first', () => {
		const labels = ['Xfoo', 'Foo', 'Bar', 'foo.bar']
		const result = autocomplete.searchLocal(
			'foo',
			labels.map((label) => ({ label })),
		)

		expect(result.map((/** @type {any} */ entry) => entry.label)).toEqual([
			'Foo',
			'foo.bar',
			'Xfoo',
		])
	})
})

describe('getPageSuggestions', () => {
	it('keeps the typed first-letter case for main-namespace titles', async () => {
		respondWithPages([{ title: 'Foo bar' }, { title: 'Category:Foo' }])

		const entries = await autocomplete.makeApiRequest('foo')

		expect(entries.map((/** @type {any} */ entry) => entry.label)).toEqual([
			'foo bar',
			'Category:Foo',
		])
		expect(insert(entries[0])).toBe('[[foo bar]]')
		expect(insert(entries[1])).toBe('[[:Category:Foo]]')
	})

	it('uses the API case on wikis with a case-sensitive main namespace', async () => {
		mw.config.set('wgCaseSensitiveNamespaces', [0])
		respondWithPages([{ title: 'Foo bar' }])

		const [entry] = await autocomplete.makeApiRequest('foo')

		expect(entry.pageName).toBe('Foo bar')
	})

	it('searches without the leading colon and keeps it in the label and insertion', async () => {
		respondWithPages([{ title: 'Category:Foo' }])

		const [entry] = await autocomplete.makeApiRequest(':Category:F')

		expect(new URL(fetchMock.mock.calls[0][0], 'https://x').searchParams.get('q')).toBe(
			'Category:F',
		)
		expect(entry.label).toBe(':Category:Foo')
		expect(insert(entry)).toBe('[[:Category:Foo]]')
	})

	it('does not resolve namespace prefixes as interwikis', async () => {
		respondWithPages([])

		await autocomplete.makeApiRequest('category:Foo')

		expect(window.getUrlFromInterwikiLink).not.toHaveBeenCalled()
	})

	it('treats interwiki prefixes pointing to the current wiki as local', async () => {
		respondWithPages([{ title: 'Foo' }])

		await autocomplete.makeApiRequest('test:Foo')

		expect(fetchMock.mock.calls[0][0]).toMatch(/^\/w\/rest\.php/)
	})

	it('lists a redirect source after its target', async () => {
		respondWithPages([{ title: 'Foo bar', matched_title: 'Foobar' }])

		const entries = await autocomplete.makeApiRequest('foob')

		expect(entries).toMatchObject([
			{ label: 'foo bar' },
			{ label: 'foobar', isRedirectSource: true, redirectTarget: 'foo bar' },
		])
	})

	it(
		'names a redirect source after the redirect, keeping the typed namespace alias',
		async () => {
			respondWithPages([
				{ title: 'Wikipedia:Village pump', matched_title: 'Wikipedia:VP' },
				{ title: 'Wikipedia:Verifiability', matched_title: 'Wikipedia:V' },
			])

			const entries = await autocomplete.makeApiRequest('WP:V')

			expect(entries.map((/** @type {any} */ entry) => entry.pageName)).toEqual([
				'Wikipedia:Village pump',
				'WP:VP',
				'Wikipedia:Verifiability',
				'WP:V',
			])
		},
	)
})

describe('getCrossSitePageSuggestions', () => {
	it.each([
		['en:foo', 'en:Foo bar', '[[:en:Foo bar]]'],
		[':en:foo', ':en:Foo bar', '[[:en:Foo bar]]'],
		['w:en:foo', 'w:en:Foo bar', '[[w:en:Foo bar]]'],
		['wikt:foo', 'wikt:Foo bar', '[[wikt:Foo bar]]'],
	])('searches the remote wiki for %j', async (text, label, expected) => {
		respondWithPages([{ title: 'Foo bar' }])

		const [entry] = await autocomplete.makeApiRequest(text)

		expect(fetchMock.mock.calls[0][0]).toMatch(/^https:\/\/en\.wik\w+\.org\/w\/rest\.php.*q=foo/)
		expect(entry.label).toBe(label)
		expect(insert(entry)).toBe(expected)
	})

	it('keeps the API case of remote titles', async () => {
		respondWithPages([{ title: 'Foo' }])

		const [entry] = await autocomplete.makeApiRequest('wikt:foo')

		expect(entry.pageName).toBe('Foo')
	})

	it('keeps the interwiki prefix in redirect sources', async () => {
		respondWithPages([{ title: 'Foo bar', matched_title: 'Foob' }])

		const entries = await autocomplete.makeApiRequest('en:Foob')

		expect(entries[1]).toMatchObject({
			label: 'en:Foob',
			interwikiPrefix: 'en:',
			isRedirectSource: true,
			redirectTarget: 'Foo bar',
		})
	})

	it.each([
		['d:douglas', 'item', 'douglas', 'Q42'],
		['d:Property:instance', 'property', 'instance', 'Property:P31'],
	])('searches Wikidata entities for %j', async (text, type, search, entityTitle) => {
		foreignApiGet.mockResolvedValue({
			search: [
				{
					title: entityTitle,
					display: { label: { value: 'Label' }, description: { value: 'Desc' } },
				},
			],
		})

		const [entry] = await autocomplete.makeApiRequest(text)

		expect(foreignApiGet).toHaveBeenCalledWith(expect.objectContaining({ type, search }))
		expect(entry).toMatchObject({
			label: 'Label',
			displayLabel: 'Label',
			description: 'Desc',
			isWikidataEntity: true,
		})
		expect(insert(entry)).toBe(`[[d:${entityTitle}]]`)
		expect(fetchMock).not.toHaveBeenCalled()
	})
})

describe('resolveInterwikiPrefix', () => {
	it('retries loading the resolver script after a failed load', async () => {
		delete anyWindow.getUrlFromInterwikiLink
		cdMock.g.isProbablyWmfSulWiki = true
		const getScript = vi.fn().mockRejectedValueOnce(new Error()).mockResolvedValueOnce(undefined)
		anyMw.loader.getScript = getScript

		try {
			expect(await autocomplete.resolveInterwikiPrefix('en:Foo')).toBeUndefined()
			await autocomplete.resolveInterwikiPrefix('en:Foo')

			expect(getScript).toHaveBeenCalledTimes(2)
		} finally {
			cdMock.g.isProbablyWmfSulWiki = false
			delete WikilinksAutocomplete.getUrlFromInterwikiLinkPromise
		}
	})

	it('gives up when the resolver throws', async () => {
		anyWindow.getUrlFromInterwikiLink = () => Promise.reject(new Error())

		expect(await autocomplete.resolveInterwikiPrefix('en:Foo')).toBeUndefined()
	})
})

describe('getSectionSuggestions', () => {
	/**
	 * @param {string[]} lines
	 */
	const respondWithSections = (lines) => {
		const parse = {
			sections: lines.map((line) => ({ line, linkAnchor: line.replace(/ /g, '_') })),
		}
		const get = vi.fn().mockResolvedValue({ parse })
		cdMock.getApi.mockReturnValue({ get })
		foreignApiGet.mockResolvedValue({ parse })

		return get
	}

	it('filters sections by the fragment, prefix matches first', async () => {
		const get = respondWithSections(['Intro', 'Old history', 'History', 'Other'])

		const entries = await autocomplete.makeApiRequest('foo#hist')

		expect(get).toHaveBeenCalledWith(expect.objectContaining({ page: 'Foo' }))
		expect(entries.map((/** @type {any} */ entry) => entry.label)).toEqual([
			'Foo#History',
			'Foo#Old history',
		])
		expect(insert(entries[0])).toBe('[[Foo#History]]')
	})

	it('lists all sections for an empty fragment', async () => {
		respondWithSections(['A', 'B'])

		const entries = await autocomplete.makeApiRequest('Foo#')

		expect(entries.map((/** @type {any} */ entry) => entry.fragment)).toEqual(['A', 'B'])
	})

	it('keeps the leading colon', async () => {
		respondWithSections(['Sec'])

		const [entry] = await autocomplete.makeApiRequest(':Category:Foo#')

		expect(entry.label).toBe(':Category:Foo#Sec')
		expect(insert(entry)).toBe('[[:Category:Foo#Sec]]')
	})

	it('fetches sections of remote pages from the remote wiki', async () => {
		respondWithSections(['Sec'])

		const [entry] = await autocomplete.makeApiRequest('w:en:Foo#')

		expect(foreignApiGet).toHaveBeenCalledWith(expect.objectContaining({ page: 'Foo' }))
		expect(cdMock.getApi).not.toHaveBeenCalled()
		expect(entry.label).toBe('w:en:Foo#Sec')
		expect(insert(entry)).toBe('[[w:en:Foo#Sec]]')
	})

	it('falls back to the typed text when the API fails', async () => {
		cdMock.getApi.mockReturnValue({ get: vi.fn().mockRejectedValue(new Error()) })

		const [entry] = await autocomplete.makeApiRequest('Foo#Bar')

		expect(insert(entry)).toBe('[[Foo#Bar]]')
	})

	it(
		'falls back without doubling the leading colon',
		async () => {
			cdMock.getApi.mockReturnValue({ get: vi.fn().mockRejectedValue(new Error()) })

			const [entry] = await autocomplete.makeApiRequest(':Category:Foo#Bar')

			expect(insert(entry)).toBe('[[:Category:Foo#Bar]]')
		},
	)

	it(
		'falls back keeping the interwiki prefix',
		async () => {
			foreignApiGet.mockRejectedValue(new Error())

			const [entry] = await autocomplete.makeApiRequest('w:en:Foo#Bar')

			expect(insert(entry)).toBe('[[w:en:Foo#Bar]]')
		},
	)

	it(
		'does not reuse sections of a same-named page on another wiki',
		async () => {
			respondWithSections(['Local'])
			await autocomplete.makeApiRequest('Foo#')
			foreignApiGet.mockResolvedValue({
				parse: { sections: [{ line: 'Remote', linkAnchor: 'Remote' }] },
			})

			const [entry] = await autocomplete.makeApiRequest('en:Foo#')

			expect(entry.fragment).toBe('Remote')
		},
	)
})
