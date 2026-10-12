import { describe, expect, test } from 'vitest'

import { escapePipesOutsideLinks } from '../src/shared/utils-wikitext'

describe('escapePipesOutsideLinks', () => {
	test('keeps pipes in links, including file links with nested links', () => {
		expect(
			escapePipesOutsideLinks('a|b [[A|B]] [[File:X.svg|link=Y|15px|C [[D|E]]]] {c}'),
		).toBe('a{{!}}b [[A|B]] [[File:X.svg|link=Y|15px|C [[D|E]]]] &#123;c&#125;')
	})
})
