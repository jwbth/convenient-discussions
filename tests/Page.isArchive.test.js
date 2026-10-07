import { describe, test, expect, beforeAll, beforeEach } from 'vitest'

import Page from '../src/Page'
import pageRegistry from '../src/pageRegistry'

const isArchive = (/** @type {number} */ namespaceId, /** @type {string} */ title) =>
	new Page(new mw.Title(namespaceId, title), pageRegistry).isArchive()

describe('Page#isArchive', () => {
	beforeEach(() => {
		Page.pagesMaps = undefined
		global.convenientDiscussions.config = /** @type {any} */ ({
			archivePaths: [
				{
					source: 'Wikipedia:Village pump/$1',
					archive: 'Wikipedia:Village pump/Archive/$1/',
					replacements: [/[^/]+/],
				},
				/\/Archive/,
			],
		})
	})

	test('matches an archive path', () => {
		expect(isArchive(4, 'Requests/Archive/2020')).toBe(true)
		expect(isArchive(3, 'Foo/Archive 5')).toBe(true)
		expect(isArchive(1, 'Article/Archive 1')).toBe(true)
		expect(isArchive(5, 'Manual of Style/Archive 200')).toBe(true)
	})

	test('matches an archive path entry with replacements', () => {
		expect(isArchive(4, 'Village pump/Archive/Technical/2020')).toBe(true)
	})

	test("doesn't match pages outside archive paths", () => {
		expect(isArchive(4, 'Requests')).toBe(false)
		expect(isArchive(3, 'Foo')).toBe(false)
		expect(isArchive(4, 'Village pump/Technical')).toBe(false)
	})

})

describe('Page#isArchive with the ruwiki config', () => {
	beforeAll(async () => {
		// The config module registers hooks and styles on import.
		Object.assign(mw, { hook: () => ({ add: () => {} }) })
		Object.assign(mw.util, { addCSS: () => {} })
		mw.config.set('wgFormattedNamespaces', {
			0: '',
			1: 'Обсуждение',
			2: 'Участник',
			3: 'Обсуждение участника',
			4: 'Википедия',
			5: 'Обсуждение Википедии',
			104: 'Проект',
			105: 'Обсуждение проекта',
		})

		const { default: config } = await import('../config/wikis/w-ru.js')
		global.convenientDiscussions.config = /** @type {any} */ (config)
		Page.pagesMaps = undefined
	})

	test('matches "Архив" and "Архивы" subpages', () => {
		expect(isArchive(3, 'Пример/Архив')).toBe(true)
		expect(isArchive(3, 'Пример/Архив/2020')).toBe(true)
		expect(isArchive(3, 'Пример/Архив 5')).toBe(true)
		expect(isArchive(3, 'Пример/Архивы')).toBe(true)
		expect(isArchive(3, 'Пример/Архивы/2020')).toBe(true)
		expect(isArchive(1, 'Статья/Архив/1')).toBe(true)
		expect(isArchive(4, 'Форум/Архив/Общий/2020')).toBe(true)
		expect(isArchive(5, 'Форум/Архив/Общий/2020')).toBe(true)
	})

	test('matches explicit archive paths', () => {
		expect(isArchive(4, 'Форум/Архив/Форум арбитров/2020')).toBe(true)
		expect(isArchive(4, 'Форум/Архив/Технический/2020')).toBe(true)
	})

	test("doesn't match words starting with \"Архив\"", () => {
		expect(isArchive(3, 'Пример/Архивация')).toBe(false)
		expect(isArchive(3, 'Пример/Архивариус')).toBe(false)
		expect(isArchive(3, 'Пример/Архивный')).toBe(false)
	})

	test("doesn't match active pages", () => {
		expect(isArchive(4, 'Форум/Общий')).toBe(false)
		expect(isArchive(3, 'Пример')).toBe(false)
	})
})
