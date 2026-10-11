import { beforeAll, describe, expect, test } from 'vitest'

import PageSource from '../src/PageSource'

import { initCommonsGlobals } from './utils-wikiGlobals'

beforeAll(() => {
	initCommonsGlobals()
})

const pageCode = ['Intro.', '', '== First ==', 'Text.', ''].join('\n')
const topicCode = '== New ==\nNew text.\n'

/**
 * @param {string} [code]
 * @returns {PageSource}
 */
function makeSource(code = pageCode) {
	const source = new PageSource(/** @type {import('../src/Page').default} */ ({}))
	source.setCode(code)

	return source
}

describe('PageSource#modifyContext', () => {
	test('appends the topic when new topics go to the bottom', () => {
		expect(
			makeSource().modifyContext({
				commentCode: topicCode,
				isNewTopicOnTop: false,
				isNewSectionApi: false,
			}).contextCode,
		).toBe('Intro.\n\n== First ==\nText.\n\n== New ==\nNew text.\n')
	})

	test('puts the topic above the first section when new topics go on top', () => {
		expect(
			makeSource().modifyContext({
				commentCode: topicCode,
				isNewTopicOnTop: true,
				isNewSectionApi: false,
			}).contextCode,
		).toBe('Intro.\n\n== New ==\nNew text.\n\n== First ==\nText.\n')
	})

	test('appends the topic when new topics go on top but the page has no sections', () => {
		expect(
			makeSource('Intro.\n').modifyContext({
				commentCode: topicCode,
				isNewTopicOnTop: true,
				isNewSectionApi: false,
			}).contextCode,
		).toBe('Intro.\n\n== New ==\nNew text.\n')
	})

	test('returns the topic code alone with the new section API', () => {
		expect(
			makeSource().modifyContext({
				commentCode: topicCode,
				isNewTopicOnTop: false,
				isNewSectionApi: true,
			}).contextCode,
		).toBe(topicCode)
	})
})
