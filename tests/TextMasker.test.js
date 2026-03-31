import { describe, test, expect, beforeEach } from 'vitest'

import TextMasker from '../src/TextMasker'
import cd from '../src/shared/cd'

describe('TextMasker', () => {
	beforeEach(() => {
		// Set up minimal cd.config for tests
		cd.config = {
			paragraphTemplates: ['pb'],
		}
		cd.g = {
			piePattern: 'br|p|span|div',
			pniePattern:
				'BLOCKQUOTE|DD|DIV|DL|DT|FORM|H1|H2|H3|H4|H5|H6|HR|INPUT|LI|LINK|OL|P|PRE|STYLE|TABLE|TBODY|TR|TH|TD|UL',
		}
	})

	describe('maskTemplatesRecursively', () => {
		test('should mask a single template', () => {
			const masker = new TextMasker('Text {{template}} more text')
			masker.maskTemplatesRecursively()
			const text = masker.getText()

			expect(text).toMatch(/Text \u0001\d+_template\u0002 more text/)
		})

		test('should mask nested templates', () => {
			const masker = new TextMasker('{{outer|{{inner}}}}')
			masker.maskTemplatesRecursively()
			const text = masker.getText()

			expect(text).toMatch(/\u0001\d+_template\u0002/)
		})

		test('should mask three consecutive templates', () => {
			const masker = new TextMasker('{{pb}}{{pb}}{{pb}}')
			masker.maskTemplatesRecursively()
			const text = masker.getText()

			// Should have three separate markers
			const markers = text.match(/\u0001\d+_template\u0002/g)
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
			const masker = new TextMasker('dummy')
			masker.maskedTexts = ['{{template1}}', '{{template2}}']

			const result = masker.unmaskText('\u00011_template\u0002 and \u00012_template\u0002')

			expect(result).toBe('{{template1}} and {{template2}}')
		})

		test('should handle markers with additional suffixes', () => {
			const masker = new TextMasker('dummy')
			masker.maskedTexts = ['{{template}}']

			const result = masker.unmaskText('\u00011_template_123\u0002')

			expect(result).toBe('{{template}}')
		})
	})

	describe('Bug: Three consecutive paragraph templates', () => {
		test('should properly mask and unmask three pb templates WITHOUT adding <br>', () => {
			const code = '{{pb}}{{pb}}{{pb}}'
			const masker = new TextMasker(code)

			// Mask templates
			masker.maskTemplatesRecursively()
			const maskedText = masker.getText()

			// Verify we have three markers
			const markers = maskedText.match(/\u0001\d+_template\u0002/g)
			expect(markers).toHaveLength(3)

			// Simulate the regex from CommentSource.toInput() with the fix
			// Using lookahead to not consume the \u0001 marker
			// AND negative lookahead to NOT match when there are 3+ templates
			const transformedText = maskedText.replace(
				/((?:\u0001\d+_template.*?\u0002){2} *)(?=\u0001(?!\d+_template))/g,
				(s, m1) => m1 + '<br>',
			)

			// Unmask
			const result = masker.unmaskText(transformedText)

			// Should not contain any leftover markers like "3_template"
			expect(result).not.toMatch(/\d+_template/)
			// Should not have <br> added
			expect(result).not.toContain('<br>')
			// Should be exactly the original
			expect(result).toBe('{{pb}}{{pb}}{{pb}}')
		})

		test('should handle the exact scenario from CommentSource.toInput()', () => {
			// This simulates what happens in CommentSource.toInput() when processing
			// three consecutive paragraph templates
			const code = '{{pb}}{{pb}}{{pb}}'
			const masker = new TextMasker(code)

			masker.maskSensitiveCode()

			let text = masker.getText()

			// Apply the transformations from toInput() with the fix
			text = text
				.replace(/^((?:\u0001\d+_template.*?\u0002) *)(?=\u0001$)/gm, (_s, m1) => m1 + '<br>')
				.replace(/((?:\u0001\d+_template.*?\u0002){2} *)(?=\u0001(?!\d+_template))/g, (s, m1) =>
					cd.config.paragraphTemplates.length ? m1 + '<br>' : s,
				)

			// Unmask
			const result = masker.unmaskText(text)

			// Should not contain any leftover markers
			expect(result).not.toMatch(/\d+_template/)

			// Should NOT have <br> for 3 consecutive paragraph templates
			expect(result).not.toContain('<br>')

			// All three templates should be present
			const templateCount = (result.match(/\{\{pb\}\}/g) || []).length
			expect(templateCount).toBe(3)

			// Should be exactly the original
			expect(result).toBe('{{pb}}{{pb}}{{pb}}')
		})
	})
})
