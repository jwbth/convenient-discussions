import { vi } from 'vitest'

import Comment from '../src/Comment'
import Section from '../src/Section'
import cd from '../src/loader/cd'
import { maskDistractingCode } from '../src/shared/utils-wikitext'
import userRegistry from '../src/userRegistry'

import defaultPayload from './worker-default-payload'

/**
 * @typedef {import('../src/worker/CommentWorker').default} CommentWorker
 * @typedef {import('../src/worker/SectionWorker').default} SectionWorker
 */

/**
 * @typedef {object} ParsedCase
 * @property {{ headline: string, wikitext: string, html: string }} testCase
 * @property {CommentWorker[]} comments
 * @property {SectionWorker[]} sections
 */

/**
 * @typedef {object} CorpusCase
 * @property {{ headline: string, wikitext: string }} testCase
 * @property {Comment[]} comments Fake comments of the case, in document order.
 * @property {Section[]} sections Fake sections of the case, in document order.
 */

/**
 * @typedef {object} CorpusGroup
 * @property {string} name
 * @property {CorpusCase[]} cases
 * @property {Comment[]} comments Fake comments of all the group's cases, as the comment manager
 *   lists them.
 * @property {Section[]} sections Fake sections of all the group's cases, as the section manager
 *   lists them.
 * @property {string} pageCode The group's cases concatenated, as the page code.
 */

/**
 * Parse each case's HTML with the worker, as the parser tests do. The worker overwrites `cd.g` and
 * `cd.config`, so build the wiki globals after this.
 *
 * @param {{ name: string, tests: { headline: string, wikitext: string, html: string }[] }[]} groups
 * @returns {Promise<{ name: string, cases: ParsedCase[] }[]>}
 */
export async function parseCorpus(groups) {
	// The worker replaces the global document with the one it parses.
	const originalDocument = window.document
	vi.stubGlobal('Worker', class Worker {})
	const postMessageSpy = vi.spyOn(window, 'postMessage').mockImplementation(() => {})
	const consoleSpies = /** @type {const} */ (['log', 'debug']).map((method) =>
		vi.spyOn(console, method).mockImplementation(() => {}),
	)
	await import('../src/worker/worker')

	const parsedGroups = groups.map((group) => ({
		name: group.name,
		cases: group.tests.map((testCase) => {
			postMessageSpy.mockClear()
			const payload = structuredClone(defaultPayload)
			payload.text = testCase.html
			window.dispatchEvent(new MessageEvent('message', { data: payload }))
			const message = postMessageSpy.mock.calls.find((call) => call[0]?.task === 'parse')?.[0]

			return { testCase, comments: message.comments, sections: message.sections }
		}),
	}))

	postMessageSpy.mockRestore()
	consoleSpies.forEach((spy) => {
		spy.mockRestore()
	})
	vi.unstubAllGlobals()
	Object.assign(window, { document: originalDocument })

	return parsedGroups
}

/**
 * Turn an element's HTML from the worker into a DOM element, as the comment's elements are on the
 * page.
 *
 * @param {string} html
 * @returns {HTMLElement}
 */
function htmlToElement(html) {
	const template = document.createElement('template')
	template.innerHTML = html

	return /** @type {HTMLElement} */ (template.content.firstElementChild)
}

/**
 * Approximation of {@link Comment#getText} over the fake's elements: jsdom has no `innerText`,
 * so text content stands in for `$.fn.cdGetText()`.
 *
 * @param {HTMLElement[]} elements
 * @returns {string}
 */
function getText(elements) {
	const dummy = document.createElement('div')
	elements
		.filter((el) => !/^H[1-6]$/.test(el.tagName) && !el.classList.contains('mw-heading'))
		.forEach((el) => {
			dummy.append(el.cloneNode(true))
		})
	const selectorParts = ['.cd-signature', '.cd-changeNote', '.noprint']
	if (cd.config.unsignedClass) {
		selectorParts.push(`.${cd.config.unsignedClass}`)
	}
	dummy.querySelectorAll(selectorParts.join(', ')).forEach((el) => {
		el.remove()
	})
	let text = dummy.textContent

	if (cd.g.signatureEndingRegexp) {
		text = text.replace(cd.g.signatureEndingRegexp, '')
	}
	if (cd.config.signaturePrefixRegexp) {
		text = text.replace(cd.config.signaturePrefixRegexp, '')
	}

	return text
}

/**
 * Whether the comment (or its signature) is inside a table containing only that comment, as
 * {@link CommentManager#findAndUpdateTableComments} finds it on the page.
 *
 * @param {HTMLElement[]} elements
 * @returns {boolean}
 */
function isTableComment(elements) {
	return elements.some(
		(el) =>
			(el.tagName === 'TABLE' && el.querySelector('.cd-signature')) ||
			[...el.children].some(
				(child) => child.tagName === 'TABLE' && child.querySelector('.cd-signature'),
			),
	)
}

/**
 * Split a case's wikitext into the code of each section, as the API returns a requested section
 * (trailing whitespace trimmed) with the newline {@link Section#requestCode} appends.
 *
 * @param {string} wikitext
 * @returns {string[]}
 */
function splitIntoSectionCodes(wikitext) {
	const adjustedCode = maskDistractingCode(wikitext + '\n', true)
	const headingRegexp = /^((=+)(.*)\2[ \t\u0001\u0002]*)\n/gm
	const headings = [...adjustedCode.matchAll(headingRegexp)].map((match) => ({
		index: match.index,
		level: match[2].length,
	}))

	return headings.map(
		({ index, level }, i) =>
			wikitext
				.slice(index, headings.slice(i + 1).find((heading) => heading.level <= level)?.index)
				.trimEnd() + '\n',
	)
}

/**
 * Build fake comments and sections for a group of parsed cases. The fakes are `Comment` and
 * `Section` objects (prototype only, no constructor run) carrying the worker's data plus DOM
 * elements from jsdom; they override only the methods that need the page (`getText`,
 * `getChildren`, `hasFlag`) and the managers. Everything else, including `locateInCode`, runs as
 * in production.
 *
 * @param {{ name: string, cases: ParsedCase[] }} parsedGroup
 * @returns {CorpusGroup}
 */
export function buildCorpusGroup(parsedGroup) {
	/** @type {Map<import('../src/shared/CommentSkeleton').default<any>, Comment>} */
	const commentMap = new Map()
	/** @type {Map<SectionWorker, Section>} */
	const sectionMap = new Map()

	const pageCode = parsedGroup.cases.map(({ testCase }) => testCase.wikitext).join('\n\n') + '\n'
	const sourcePage = { source: { getCode: () => pageCode } }

	/** @type {Comment[]} */
	const groupComments = []
	/** @type {Section[]} */
	const groupSections = []
	const manager = { getAll: () => groupComments }
	const sectionManager = { getAll: () => groupSections }

	const cases = parsedGroup.cases.map(({ testCase, comments, sections }) => {
		const sectionCodes = splitIntoSectionCodes(testCase.wikitext)
		if (sectionCodes.length !== sections.length) {
			throw new Error(
				`"${testCase.headline}": ${sectionCodes.length} headings in the wikitext, ${sections.length} sections parsed`,
			)
		}

		const fakeSections = sections.map((sectionWorker, i) => {
			const section = /** @type {Section} */ (
				Object.assign(Object.create(Section.prototype), {
					id: sectionWorker.id,
					headline: sectionWorker.headline,
					level: sectionWorker.level,
					index: groupSections.length,
					presumedCode: sectionCodes[i],
					sourcePage,
					manager: sectionManager,
				})
			)
			sectionMap.set(sectionWorker, section)
			groupSections.push(section)

			return section
		})

		const fakeComments = comments.map((commentWorker) => {
			const elements = commentWorker.elementHtmls.map((html) =>
				htmlToElement(
					// The worker replaces metadata elements of the comment with markers.
					html.replace(
						/^(\d+)_\w+$/,
						(_s, number) => commentWorker.hiddenElementsData[Number(number) - 1].html,
					),
				),
			)
			const comment = /** @type {Comment} */ (
				Object.assign(Object.create(Comment.prototype), {
					id: commentWorker.id,
					level: commentWorker.level,
					authorName: commentWorker.authorName,
					author: userRegistry.get(commentWorker.authorName),
					timestamp: commentWorker.timestamp,
					date: commentWorker.date,
					followsHeading: commentWorker.followsHeading,
					// Protected in the worker's class, public on the plain object it posts
					openingSection: commentWorker['openingSection'],
					tableComment: isTableComment(elements),
					elements,
					manager,
				})
			)
			/** @type {string | undefined} */
			let text
			Object.assign(comment, {
				getText: () => (text ??= getText(elements)),
				hasFlag: (/** @type {string} */ flag) => flag === 'own' && Boolean(commentWorker.own),
			})
			commentMap.set(commentWorker, comment)
			groupComments.push(comment)

			return comment
		})

		return { testCase, comments: fakeComments, sections: fakeSections }
	})

	parsedGroup.cases.forEach(({ comments, sections }) => {
		comments.forEach((commentWorker) => {
			const comment = /** @type {Comment} */ (commentMap.get(commentWorker))
			const children = commentWorker.children.map((child) => commentMap.get(child))
			Object.assign(comment, {
				section: commentWorker.section && sectionMap.get(commentWorker.section),
				getChildren: () => children,
			})
		})
		sections.forEach((sectionWorker) => {
			Object.assign(/** @type {Section} */ (sectionMap.get(sectionWorker)), {
				comments: sectionWorker.comments.map((comment) => commentMap.get(comment)),
				commentsInFirstChunk: sectionWorker.commentsInFirstChunk.map((comment) =>
					commentMap.get(comment),
				),
				oldestComment: sectionWorker.oldestComment && commentMap.get(sectionWorker.oldestComment),
			})
		})
	})

	return {
		name: parsedGroup.name,
		cases,
		comments: groupComments,
		sections: groupSections,
		pageCode,
	}
}
