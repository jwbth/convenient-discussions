import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import SpaciousComment from '../src/SpaciousComment'
import cd from '../src/loader/cd'

import { revealIpButtonHtml } from './utils-checkuser'

const authorName = '~2026-58191-23'
const timestamp = '00:00, 1 January 2026 (UTC)'

beforeEach(() => {
	cd.config.excludeFromHeadlineClasses = ['signature-decoration']
	cd.g.timestampTools = /** @type {any} */ ({ content: { regexp: /00:00, 1 January 2026 \(UTC\)/ } })
	cd.g.signatureEndingRegexp = undefined
	cd.g.wholeStringSignaturePrefixRegexp = undefined
	cd.config.beforeAuthorLinkParse = null
	cd.config.afterAuthorLinkParse = null
	cd.s = (name) => name === 'comment-author-tooltip-signature-prefix' ? 'Signature' : name
	cd.mws = () => ': '
	SpaciousComment.prototypesInitted = true
	SpaciousComment.initPrototypes()
	vi.stubGlobal('$', (element) => ({
		clone: (withDataAndEvents) => {
			expect(withDataAndEvents).toBe(true)
			return [element.cloneNode(true)]
		},
	}))
})

afterEach(() => {
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
	document.body.replaceChildren()
})

function createComment() {
	const comment = /** @type {SpaciousComment} */ (Object.create(SpaciousComment.prototype))
	const part = document.createElement('p')
	part.innerHTML = `Comment. <span class="cd-signature"><a href="/wiki/User:${authorName}">${authorName}</a>${revealIpButtonHtml} (<a href="/wiki/User_talk:${authorName}">talk</a>) <span class="signature-decoration">decoration</span>${timestamp}</span>`
	document.body.append(part)
	comment.signatureElement = part.querySelector('.cd-signature')
	comment.authorLink = part.querySelector('a')
	comment.authorTalkLink = part.querySelector('a[href*="User_talk:"]')
	comment.author = /** @type {any} */ ({
		getName: () => authorName,
		isRegistered: () => true,
		isTemporary: () => true,
	})
	comment.extraSignatures = []
	comment.highlightables = [part]
	vi.spyOn(/** @type {any} */ (comment), 'rewrapHighlightables').mockImplementation(() => {})
	return comment
}

test('the author tooltip excludes the CheckUser button and configured decorations', () => {
	const comment = createComment()
	comment.cleanSignatureText = (/** @type {any} */ (comment)).getCleanSignatureText()
	comment.setAuthorLinkTitle()

	expect(comment.authorLink.title).toBe(`Signature: ${authorName} (talk)`)
	expect(comment.signatureElement.textContent).toContain('Show IP')
})

test.each([false, true])('the CheckUser button follows the header author link (extra signatures: %s)', (hasExtraSignatures) => {
	const comment = createComment()
	const originalAuthorLink = comment.authorLink
	const originalTalkLink = comment.authorTalkLink
	const originalButton = comment.signatureElement.querySelector('.ext-checkuser-tempaccount-reveal-ip-button')
	if (hasExtraSignatures) {
		comment.extraSignatures = /** @type {any} */ ([{}])
	}

	comment.replaceSignatureWithHeader()

	const headerButton = comment.authorLink.nextElementSibling
	expect(headerButton?.outerHTML).toBe(revealIpButtonHtml)
	expect(comment.headerElement.contains(headerButton)).toBe(true)
	expect(headerButton.nextElementSibling.className).toBe('cd-comment-author-links')
	if (hasExtraSignatures) {
		expect(headerButton).not.toBe(originalButton)
		expect(comment.signatureElement.contains(originalButton)).toBe(true)
		expect(comment.signatureElement.contains(originalAuthorLink)).toBe(true)
		expect(comment.signatureElement.contains(originalTalkLink)).toBe(true)
	} else {
		expect(headerButton).toBe(originalButton)
		expect(comment.signatureElement.isConnected).toBe(false)
	}
})
