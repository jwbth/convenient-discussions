import { describe, test, expect, beforeEach } from 'vitest'

import TextMasker from '../src/TextMasker'
import cd from '../src/shared/cd'

describe('TextMasker', () => {
	beforeEach(() => {
		// Set up minimal cd.config for tests
		cd.config = /** @type {typeof cd.config} */ ({
			paragraphTemplates: ['pb'],
		})
		cd.g = /** @type {typeof cd.g} */ ({
			letterPattern: String.raw`a-zA-Z\xC0-\uFFFF`,
			piePattern: 'br|p|span|div',
			pniePattern:
				'BLOCKQUOTE|DD|DIV|DL|DT|FORM|H1|H2|H3|H4|H5|H6|HR|INPUT|LI|LINK|OL|P|PRE|STYLE|TABLE|TBODY|TR|TH|TD|UL',
		})
	})

	describe('maskTemplatesRecursively', () => {
		test('should mask a single template', () => {
			const masker = new TextMasker('Text {{template}} more text')
			masker.maskTemplatesRecursively()
			const text = masker.getText()

			expect(text).toMatch(/Text \u0001\d+_template[^\u0002]*\u0002 more text/)
		})

		test('should mask nested templates', () => {
			const masker = new TextMasker('{{outer|{{inner}}}}')
			masker.maskTemplatesRecursively()
			const text = masker.getText()

			expect(text).toMatch(/\u0001\d+_template[^\u0002]*\u0002/)
		})

		test('should mask three consecutive templates', () => {
			const masker = new TextMasker('{{pb}}{{pb}}{{pb}}')
			masker.maskTemplatesRecursively()
			const text = masker.getText()

			// Should have three separate markers
			const markers = text.match(/\u0001\d+_template[^\u0002]*\u0002/g)
			expect(markers).toHaveLength(3)
		})

		test('should unmask three consecutive templates', () => {
			const masker = new TextMasker('{{pb}}{{pb}}{{pb}}')
			masker.maskTemplatesRecursively()
			masker.unmask()
			const text = masker.getText()

			expect(text).toBe('{{pb}}{{pb}}{{pb}}')
		})

		test('should handle masking and unmasking with text transformations', () => {
			const masker = new TextMasker('Start {{pb}}{{pb}}{{pb}} End')
			masker.maskTemplatesRecursively()

			// Simulate some text transformation
			masker.withText((text) => text.replace(/Start/, 'Begin'))

			masker.unmask()
			const text = masker.getText()

			expect(text).toBe('Begin {{pb}}{{pb}}{{pb}} End')
		})
	})

	describe('unmaskText', () => {
		test('should unmask text with markers', () => {
			const masker = new TextMasker('dummy', ['{{template1}}', '{{template2}}'])

			const result = masker.unmaskText('\u00011_template\u0002 and \u00012_template\u0002')

			expect(result).toBe('{{template1}} and {{template2}}')
		})

		test('should handle markers with additional suffixes', () => {
			const masker = new TextMasker('dummy', ['{{template}}'])

			const result = masker.unmaskText('\u00011_template_123\u0002')

			expect(result).toBe('{{template}}')
		})
	})
})
