import { beforeAll, describe, expect, test } from 'vitest'

import cd from '../src/loader/cd'
import { extractSignatures } from '../src/utils-window'

import { initCommonsGlobals } from './utils-wikiGlobals'

beforeAll(() => {
	initCommonsGlobals()
})

describe('wiki globals built from the Commons configuration', () => {
	test('a signature yields its author and timestamp', () => {
		const [signature] = extractSignatures(
			'Hello. [[User:Example|Example]] ([[User talk:Example|talk]]) 12:34, 5 October 2026 (UTC)\n',
		)

		expect(signature.author.getName()).toBe('Example')
		expect(signature.timestamp).toBe('12:34, 5 October 2026 (UTC)')
		expect(signature.date).toEqual(new Date(Date.UTC(2026, 9, 5, 12, 34)))
	})

	test('an unsigned template yields its author and timestamp', () => {
		const [signature] = extractSignatures(
			'Hello. {{Unsigned|Example|12:34, 5 October 2026 (UTC)}}\n',
		)

		expect(signature.author.getName()).toBe('Example')
		expect(signature.timestamp).toBe('12:34, 5 October 2026 (UTC)')
	})

	test('the signature ending matches the Commons talk link', () => {
		expect(cd.g.signatureEndingRegexp?.test('[[User:Example|Example]] (talk)')).toBe(true)
	})

	test('the remaining patterns locating reads are built', () => {
		expect(cd.g.keepInSectionEnding.some((regexp) => regexp.test('\n{{Clear}}\n'))).toBe(true)
		expect(cd.g.badCommentBeginnings.some((regexp) => regexp.test('<!-- note -->\n'))).toBe(true)
		expect(cd.g.quoteRegexp.test('<blockquote>quote</blockquote>')).toBe(true)
		expect(new RegExp(cd.g.commentAntipatternsPattern).test('<div class="mw-notalk">')).toBe(
			true,
		)
		expect(cd.g.pipeTrickRegexp).toBeInstanceOf(RegExp)
		expect(cd.g.isThumbRegexp.test('[[File:A.png|thumb]]')).toBe(true)
		expect(new RegExp(`^${cd.g.filePrefixPattern}`, 'i').test('Image:A.png')).toBe(true)
		expect(cd.g.piePattern).toContain('SMALL')
		expect(cd.g.pniePattern).toContain('BLOCKQUOTE')
	})
})
