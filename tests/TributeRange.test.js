import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/utils-window', () => ({ inputPropsAffectingCoords: [] }))

import TributeRange from '../src/tribute/TributeRange'

describe('replaceTriggerText', () => {
	it('passes the text typed after the trigger with its trailing space', () => {
		const element = document.createElement('textarea')
		element.value = '[[#tech ]]'
		element.selectionStart = element.selectionEnd = 8
		const selectTemplate = vi.fn(() => [])
		const range = new TributeRange(
			/** @type {any} */ ({
				current: { element, collection: { selectTemplate } },
				collection: [{ trigger: '[[#', requireLeadingSpace: true }],
				allowSpaces: true,
			}),
		)

		range.replaceTriggerText(undefined, new KeyboardEvent('keydown'))

		expect(selectTemplate).toHaveBeenCalledWith(
			undefined,
			expect.anything(),
			expect.objectContaining({ triggerText: '[[#', query: 'tech ', mentionPosition: 0 }),
		)
	})
})
