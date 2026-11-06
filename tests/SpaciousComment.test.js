import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import SpaciousComment from '../src/SpaciousComment'
import cd from '../src/loader/cd'
import Parser from '../src/shared/Parser'

import { revealIpButtonHtml } from './utils-checkuser'
import { initCommonsGlobals } from './utils-wikiGlobals'

const authorName = '~2026-58191-23'
const timestamp = '00:00, 1 January 2026 (UTC)'

beforeEach(() => {
	initCommonsGlobals()
	cd.g.serverName = 'test.wikipedia.org'
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
	vi.stubGlobal('$', (element) => [element])
})

afterEach(() => {
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
	document.body.replaceChildren()
})

test.each([
	['before parsing', false],
	['after parsing', false],
	['after header', false],
	['before parsing', true],
	['after parsing', true],
	['after header', true],
])(
	'CheckUser startup %s adds a working header button to a contributions signature (extra signatures: %s)',
	async (insertionTime, hasExtraSignatures) => {
		const comment = createComment()
		const content = document.createElement('div')
		content.id = 'bodyContent'
		const parserOutput = document.createElement('div')
		parserOutput.className = 'mw-parser-output'
		parserOutput.append(comment.highlightables[0])
		content.append(parserOutput)
		document.body.append(content)
		comment.highlightables[0].innerHTML = `<span data-mw-comment-start="" id="c-${authorName}-20260101000000"></span>Comment. <span data-mw-comment-sig="c-${authorName}-20260101000000"></span><a rel="mw:WikiLink" href="https://test.wikipedia.org/wiki/Special:Contributions/${authorName}" class="mw-tempuserlink">${authorName}</a> <a href="https://test.wikipedia.org/wiki/User_talk:JWBTH/CD_test_page#c-${authorName}-20260101000000" class="ext-discussiontools-init-timestamplink">${timestamp}</a><span data-mw-comment-end="c-${authorName}-20260101000000"></span>`
		const originalAuthorLink = content.querySelector('.mw-tempuserlink')

		// initOnLoad scans #bodyContent once; ipReveal inserts a widget after each temp user link.
		const addButtons = () => content.querySelectorAll('.mw-parser-output .mw-tempuserlink').forEach((link) => {
			const template = document.createElement('template')
			template.innerHTML = revealIpButtonHtml
			const button = template.content.firstElementChild
			// CheckUser's handler closes over its widget, including when a lookup fails.
			button.querySelector('a').addEventListener('click', () => Promise.resolve().then(() => {
				const result = document.createElement('span')
				result.className = 'ext-checkuser-tempaccount-reveal-ip'
				result.textContent = 'Lookup failed'
				button.replaceWith(result)
			}), { once: true })
			link.after(button)
		})
		if (insertionTime === 'before parsing') addButtons()

		const parser = new Parser(/** @type {any} */ ({ rootElement: parserOutput }))
		parser.noSignatureElements = []
		Parser.punctuationRegexp = /[.!?]/
		const signature = (/** @type {any} */ (parser)).getSignatureFromTimestamp({
			element: content.querySelector('.ext-discussiontools-init-timestamplink'),
		})
		expect(signature.authorName).toBe(authorName)
		expect(signature.authorLink).toBeUndefined()
		expect(signature.contribsNotForeignLink).toBe(originalAuthorLink)
		comment.signatureElement = signature.element
		comment.authorLink = signature.authorLink
		comment.authorTalkLink = signature.authorTalkLink
		comment.contribsNotForeignLink = signature.contribsNotForeignLink
		if (hasExtraSignatures) comment.extraSignatures = /** @type {any} */ ([{}])
		if (insertionTime === 'after parsing') addButtons()
		const originalButton = originalAuthorLink.nextElementSibling
		comment.replaceSignatureWithHeader()
		if (insertionTime === 'after header') addButtons()

		const headerButton = comment.authorLink.nextElementSibling
		expect(headerButton?.classList.contains(SpaciousComment.revealIpButtonClass)).toBe(true)
		expect(comment.headerElement.contains(headerButton)).toBe(true)
		if (insertionTime !== 'after header') expect(headerButton).toBe(originalButton)
		headerButton.querySelector('a').click()
		await Promise.resolve()
		expect(comment.authorLink.nextElementSibling.textContent).toBe('Lookup failed')
	},
)

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
		expect(comment.signatureElement.contains(originalAuthorLink)).toBe(true)
		expect(comment.signatureElement.contains(originalTalkLink)).toBe(true)
	} else {
		expect(comment.signatureElement.isConnected).toBe(false)
	}
	expect(headerButton).toBe(originalButton)
})
