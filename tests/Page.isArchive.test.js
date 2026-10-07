import { describe, test, expect, beforeAll, beforeEach } from 'vitest'

import Page from '../src/Page'
import pageRegistry from '../src/pageRegistry'
import { mergeRegexps } from '../src/shared/utils-general'

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
		global.convenientDiscussions.loader = /** @type {any} */ ({
			pageWhitelistRegexp: /^Wikipedia:Requests/,
		})
	})

	test('matches an archive path', () => {
		expect(isArchive(4, 'Requests/Archive/2020')).toBe(true)
		expect(isArchive(3, 'Foo/Archive 5')).toBe(true)
		expect(isArchive(1, 'Article/Archive 1')).toBe(true)
	})

	test('matches an archive path entry with replacements', () => {
		expect(isArchive(4, 'Village pump/Archive/Technical/2020')).toBe(true)
	})

	test("doesn't match pages outside archive paths", () => {
		expect(isArchive(4, 'Requests')).toBe(false)
		expect(isArchive(3, 'Foo')).toBe(false)
		expect(isArchive(4, 'Village pump/Technical')).toBe(false)
	})

	test('matches an archive path in a talk namespace whose subject page is not whitelisted', () => {
		expect(isArchive(5, 'Manual of Style/Archive 5')).toBe(true)
	})

	test('excludes the talk page of a whitelisted page', () => {
		expect(isArchive(5, 'Requests/Archive/2020')).toBe(false)
		expect(isArchive(5, 'Requests/Archive')).toBe(false)
	})

	test("doesn't apply the whitelist exclusion to subject namespaces", () => {
		expect(isArchive(4, 'Requests/Archive')).toBe(true)
	})

	test("doesn't apply the whitelist exclusion without a whitelist", () => {
		global.convenientDiscussions.loader = /** @type {any} */ ({})

		expect(isArchive(5, 'Requests/Archive')).toBe(true)
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
		global.convenientDiscussions.loader = /** @type {any} */ ({
			pageWhitelistRegexp: mergeRegexps(config.pageWhitelist),
		})
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

	test('excludes talk pages of whitelisted pages', () => {
		expect(isArchive(105, 'Текущие события/Кандидаты/Недавно умершие/Архив')).toBe(false)
		expect(isArchive(5, 'Форум/Архив/Общий/2020')).toBe(false)
	})

	test('matches archives in talk namespaces whose subject pages are not whitelisted', () => {
		expect(isArchive(5, 'Правила/Архив/1')).toBe(true)
	})
})
