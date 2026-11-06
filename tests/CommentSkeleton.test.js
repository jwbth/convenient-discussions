import '../src/worker/extendDomhandler'

import { parseDocument } from 'htmlparser2'
import { afterEach, describe, expect, test, vi } from 'vitest'

import CommentSkeleton from '../src/shared/CommentSkeleton'

import { revealIpButtonHtml } from './utils-checkuser'

afterEach(() => {
	vi.restoreAllMocks()
})

describe.each(['browser', 'worker'])('signature text (%s DOM)', (environment) => {
	function createComment(content) {
		const comment = /** @type {any} */ (Object.create(CommentSkeleton.prototype))
		if (environment === 'worker') {
			comment.signatureElement = parseDocument(`<span>${content}</span>`, {
				decodeEntities: false,
			}).firstChild
		} else {
			comment.signatureElement = document.createElement('span')
			comment.signatureElement.innerHTML = content
		}
		return comment
	}

	test.each([
		['default', undefined],
		['empty', []],
	])('ordinary signatures avoid cloning (%s exclusions)', (_name, excludeClasses) => {
		const comment = createComment('<a><b>Alice &amp; Bob</b></a> (talk) 00:00, 1 January 2026 (UTC)')
		const cloneSpy = vi.spyOn(comment.signatureElement, 'cloneNode')

		expect(comment.getSignatureText(excludeClasses)).toBe('Alice & Bob (talk) 00:00, 1 January 2026 (UTC)')
		expect(cloneSpy).not.toHaveBeenCalled()
	})

	test.each([false, true])('CheckUser controls are excluded (configured exclusions: %s)', (excludeDecoration) => {
		const comment = createComment(`<a>Alice</a>${revealIpButtonHtml} <span class="decoration">decoration</span>timestamp`)
		const originalHtml = comment.signatureElement.innerHTML

		expect(comment.getSignatureText(excludeDecoration ? ['decoration'] : [])).toBe(
			excludeDecoration ? 'Alice timestamp' : 'Alice decorationtimestamp',
		)
		expect(comment.signatureElement.innerHTML).toBe(originalHtml)
	})

	test('configured exclusions apply without a CheckUser control', () => {
		const comment = createComment('<a>Alice</a> <span class="decoration"><b>decoration</b></span>timestamp')
		const originalHtml = comment.signatureElement.innerHTML

		expect(comment.getSignatureText(['decoration'])).toBe('Alice timestamp')
		expect(comment.signatureElement.innerHTML).toBe(originalHtml)
	})
})
