import { describe, test, expect, beforeEach } from 'vitest'

import Page from '../src/Page'
import pageRegistry from '../src/pageRegistry'

describe('Page#isArchive', () => {
	beforeEach(() => {
		Page.pagesMaps = undefined
		global.convenientDiscussions.config = /** @type {any} */ ({ archivePaths: [/\/Archive/] })
		global.convenientDiscussions.loader = /** @type {any} */ ({
			pageWhitelistRegexp: /^Wikipedia:Requests/,
		})
	})

	const isArchive = (/** @type {number} */ namespaceId, /** @type {string} */ title) =>
		new Page(new mw.Title(namespaceId, title), pageRegistry).isArchive()

	test('matches an archive path', () => {
		expect(isArchive(4, 'Requests/Archive/2020')).toBe(true)
		expect(isArchive(3, 'Foo/Archive 5')).toBe(true)
	})

	test('matches an archive path in a talk namespace whose subject page is not whitelisted', () => {
		expect(isArchive(5, 'Village pump/Archive 5')).toBe(true)
	})

	test('excludes the talk page of a whitelisted page', () => {
		expect(isArchive(5, 'Requests/Archive/2020')).toBe(false)
		expect(isArchive(5, 'Requests/Archive')).toBe(false)
	})
})
