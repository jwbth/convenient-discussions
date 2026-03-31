// Here, we use vanilla JavaScript for recurring operations that together take up a lot of time.

/* eslint-disable unicorn/prefer-dom-node-append */
/* eslint-disable unicorn/prefer-modern-dom-apis */

/**
 * Methods related to parsing a page.
 *
 * @module Parser
 */

import CommentSkeleton from './CommentSkeleton'
import ElementsAndTextTreeWalker from './ElementsAndTextTreeWalker'
import ElementsTreeWalker from './ElementsTreeWalker'
import cd from './cd'
import {
	defined,
	getHeadingLevel,
	isDomHandlerElement,
	isElement,
	isHeadingNode,
	isInline,
	isMetadataNode,
	parseWikiUrl,
	ucFirst,
	underlinesToSpaces,
	unique,
} from './utils-general'
import { parseTimestamp } from './utils-timestamp'

/**
 * @template {AnyNode} [N=AnyNode]
 * @typedef {object} HeadingTarget
 * @property {'heading'} type
 * @property {HTMLElementFor<N>} element
 * @property {boolean} isWrapper
 * @property {number} level
 */

/**
 * @template {AnyNode} [N=AnyNode]
 * @typedef {object} SignatureTarget
 * @property {'signature'} type
 * @property {HTMLElementFor<N>} element
 * @property {HTMLElementFor<N>} [timestampElement]
 * @property {string} [timestampText]
 * @property {Date} [date]
 * @property {HTMLElementFor<N>} [authorLink]
 * @property {HTMLElementFor<N>} [authorTalkLink]
 * @property {string} authorName
 * @property {boolean} isUnsigned
 * @property {boolean} isExtraSignature
 * @property {SignatureTarget<N>[]} extraSignatures
 * @property {CommentSkeleton<N>} [comment]
 */

/**
 * @template {AnyNode} [N=AnyNode]
 * @typedef {HeadingTarget<N> | SignatureTarget<N>} Target
 */

/**
 * Generalization of a web page (not wikitext) parser for the window and worker contexts. Parsing
 * here means "extracting meaningful parts from the page" such as comments, sections, etc. Functions
 * related to wikitext parsing go in {@link module:wikitext}.
 *
 * @template {AnyNode} [N=AnyNode]
 */
class Parser {
	/** @type {RegExp} */
	static punctuationRegexp

	/** @type {AnyElement[]} */
	noSignatureElements

	/** @type {string[]} */
	rejectClasses

	/**
	 * Create a page parser in the provided context.
	 *
	 * @param {ParsingContext<N>} context Collection of classes, functions, and other properties that perform
	 *   the tasks we need in the current context (window or worker).
	 */
	constructor(context) {
		this.context = context
		this.existingCommentIds = /** @type {string[]} */ ([])

		// Workaround to make this.constructor in methods to be type-checked correctly
		/** @type {typeof Parser} */
		// eslint-disable-next-line no-self-assign
		this.constructor = this.constructor
	}

	/**
	 * _For internal use._ Set some properties and find some elements required for parsing.
	 */
	init() {
		this.rejectClasses = [
			'cd-comment-part',

			// Extension:Translate
			'mw-pt-languages',

			// Likely won't have much effect, but won't hurt
			'mw-archivedtalk',

			// For templates like https://ru.wikipedia.org/wiki/Template:Сложное_обсуждение (perhaps they
			// need to be `tmbox` too?).
			'ombox',

			...cd.config.closedDiscussionClasses,
			cd.config.outdentClass,
		]

		// Example of a comment in a figure element:
		// https://ru.wikipedia.org/w/index.php?title=Википедия%3AФорум%2FНовости&diff=prev&oldid=131939933
		const tagSelector = ['blockquote', 'q', 'cite', 'figure', 'th'].join(', ')

		const classSelector = cd.g.noSignatureClasses.map((name) => `.${name}`).join(', ')

		this.noSignatureElements = [
			...this.context.rootElement.querySelectorAll(`${tagSelector}, ${classSelector}`),
		]
	}

	/**
	 * Create a comment instance.
	 *
	 * @param {SignatureTarget<N>} signature
	 * @param {Target<N>[]} targets
	 * @param {N extends import('domhandler').Node ? undefined : import('../commentManager').CommentManager} commentManager
	 * @returns {InstanceType<typeof this.context.CommentClass>}
	 */
	createComment(signature, targets, commentManager) {
		return new this.context.CommentClass(this, signature, targets, commentManager)
	}

	/**
	 * Create a section instance.
	 *
	 * @param {HeadingTarget<N>} heading
	 * @param {Target<N>[]} targets
	 * @param {N extends import('domhandler').Node ? undefined : import('../sectionManager').SectionManager} sectionManager
	 * @param {import('../Subscriptions').default} [subscriptions]
	 * @returns {InstanceType<typeof this.context.SectionClass>}
	 */
	createSection(heading, targets, sectionManager, subscriptions) {
		return new this.context.SectionClass(this, heading, targets, sectionManager, subscriptions)
	}

	/**
	 * _For internal use._ Remove some of the elements added by the DiscussionTools extension (even if
	 * it is disabled in user preferences) or move them away if the topic subscriptions feature of DT
	 * is enabled (to avoid errors being thrown in DT). Prior to that, extract data from them.
	 *
	 * CD already parses comment links from notifications (which seems to be this markup's purpose for
	 * disabled DT) in `BootProcess#processTargets()`. Unless the elements prove useful to CD or other
	 * scripts, it's better to get rid of them rather than deal with them one by one while parsing.
	 */
	processAndRemoveDtMarkup() {
		this.context.processAndRemoveDtElements(
			/** @type {HTMLElementFor<N>[]} */ (
				[...this.context.rootElement.getElementsByTagName('span')]
					.filter(
						(el) =>
							((el.hasAttribute('data-mw-comment-start') ||
								el.hasAttribute('data-mw-comment-end')) &&
								// DT will throw an error if we remove markup from headings (see line `pageThreads.findCommentById($threadMarker.data('mw-thread-id'))`)
								!isHeadingNode(/** @type {Element} */ (el.parentElement))) ||
							// This, in fact, targets the one span at the top of the page, out of sections which makes
							// comments taller (example:
							// https://commons.wikimedia.org/w/index.php?title=User_talk:Jack_who_built_the_house/CD_test_page&oldid=876639400).
							// Check for classes and content because in older DT versions, `data-mw-thread-id` was on
							// the .mw-headline element.
							(el.tagName === 'SPAN' &&
								el.hasAttribute('data-mw-thread-id') &&
								!el.classList.length &&
								!el.textContent),
					)
					.concat([...this.getElementsByClassName('ext-discussiontools-init-replylink-buttons')])
					.filter(unique)
			),
		)
		this.context.removeDtButtonHtmlComments()
	}

	/**
	 * Handle outdent character sequences added by
	 * {@link https://en.wikipedia.org/wiki/User:Alexis_Jazz/Factotum Factotum}.
	 *
	 * @param {string} text
	 * @param {TextLike} node
	 * @private
	 */
	handleFactotumOutdents(text, node) {
		if (
			!/^┌─*┘$/.test(text) ||
			(node.parentElement &&
				Parser.contains(node.parentElement, node) &&
				node.parentElement.classList.contains(cd.config.outdentClass)) ||
			(node.parentElement?.parentElement &&
				Parser.contains(node.parentElement.parentElement, node) &&
				node.parentElement.parentElement.classList.contains(cd.config.outdentClass))
		) {
			return
		}

		const span = Parser.createElement('span')
		span.className = cd.config.outdentClass
		span.textContent = text
		if (isElement(node.nextSibling) && node.nextSibling.tagName === 'BR') {
			Parser.remove(node.nextSibling)
		}

		// Don't have Node#replaceChild() in the worker.
		if (node.parentElement) {
			Parser.insertBefore(node.parentElement, span, node)
		}
		Parser.remove(node)
	}

	/**
	 * @typedef {object} Timestamp
	 * @property {HTMLElementFor<N>} element
	 * @property {Date} date
	 * @property {object} [match]
	 * @memberof Parser
	 * @inner
	 */

	/**
	 * Find a timestamp in a text node.
	 *
	 * @param {TextLike} node
	 * @returns {Timestamp | undefined}
	 * @private
	 */
	findTimestamp(node) {
		const text = node.textContent

		// While we're here, wrap outdents inserted by Factotum into a span.
		this.handleFactotumOutdents(text, node)

		const parsedTimestamp = parseTimestamp(text)
		if (!parsedTimestamp || this.noSignatureElements.some((el) => Parser.contains(el, node))) {
			return
		}

		const { date, match } = parsedTimestamp
		const element = /** @type {HTMLElementFor<N>} */ (Parser.createElement('span'))
		element.classList.add('cd-timestamp')
		Parser.appendChild(element, Parser.createTextNode(match[2]))
		const remainedText = node.textContent.slice(
			// eslint-disable-next-line @typescript-eslint/restrict-plus-operands
			/** @type {number} */ (match.index) + match[0].length,
		)
		const afterNode = remainedText ? document.createTextNode(remainedText) : undefined
		node.textContent = match[1]
		if (node.parentElement) {
			Parser.insertBefore(node.parentElement, element, node.nextSibling || undefined)
			if (afterNode) {
				Parser.insertBefore(node.parentElement, afterNode, element.nextSibling || undefined)
			}
		}

		return { element, date }
	}

	/**
	 * @typedef {object} AuthorData
	 * @property {string | undefined} name
	 * @property {boolean} isLastLinkAuthorLink
	 * @property {ElementLike} [notForeignLink]
	 * @property {ElementLike} [talkNotForeignLink]
	 * @property {ElementLike} [contribsNotForeignLink]
	 * @property {ElementLike} [link]
	 * @property {ElementLike} [talkLink]
	 */

	/**
	 * Collect nodes related to a signature starting from a timestamp node.
	 *
	 * @param {Timestamp} timestamp
	 * @returns {Partial<SignatureTarget<N>> | undefined}
	 * @private
	 */
	getSignatureFromTimestamp(timestamp) {
		let unsignedElement
		{
			/** @type {ElementLike | null} */
			let el = timestamp.element
			while (!unsignedElement && (el = el.parentElement) && isInline(el) !== false) {
				if (el.classList.contains(cd.config.unsignedClass)) {
					unsignedElement = el
				}
			}
		}

		// If the closest block-level timestamp element ancestor has more than one signature, we choose
		// the first signature to consider it the signature of the comment author while keeping the
		// last. There is no point for us to parse them as distinct comments as a reply posted using our
		// script will go below all of them anyway.
		let isExtraSignature = false
		const elementsTreeWalker = new ElementsTreeWalker(this.context.rootElement, timestamp.element)
		while (
			elementsTreeWalker.previousNode() &&
			(isInline(elementsTreeWalker.currentNode) !== false ||
				isMetadataNode(elementsTreeWalker.currentNode))
		) {
			if (elementsTreeWalker.currentNode.classList.contains('cd-signature')) {
				isExtraSignature = true
				break
			}
		}

		const startElement = unsignedElement || timestamp.element
		const treeWalker = new ElementsAndTextTreeWalker(this.context.rootElement, startElement)
		const authorData = /** @type {AuthorData} */ ({})

		let length = 0
		/** @type {ElementLike | undefined} */
		let firstSignatureElement
		/** @type {NodeLike[]} */
		let signatureNodes = []
		if (unsignedElement) {
			firstSignatureElement = startElement
		} else {
			signatureNodes.push(startElement)
			treeWalker.previousSibling()
		}

		// Unsigned template may be of the "undated" kind - containing a timestamp but no author name,
		// so we need to walk the tree anyway.
		/** @type {ElementLike | TextLike | null} */
		let node = treeWalker.currentNode
		do {
			length += node.textContent.length
			if (isElement(node)) {
				authorData.isLastLinkAuthorLink = /** @type {boolean} */ (false)

				if (node.tagName === 'A') {
					if (!this.processLinkData(node, authorData)) break
				} else {
					const links = [...node.getElementsByTagName('a')].reverse()
					for (const link of links) {
						// https://en.wikipedia.org/wiki/Template:Talkback and similar cases
						if (link.classList.contains('external')) continue

						this.processLinkData(link, authorData)
					}
				}

				if (authorData.isLastLinkAuthorLink) {
					firstSignatureElement = node
				}
			}
			signatureNodes.push(node)

			node = treeWalker.previousSibling()
			if (!node && !firstSignatureElement) {
				node = treeWalker.parentNode()
				if (!node || isInline(node) === false) break

				length = 0
				signatureNodes = []
			}
		} while (
			length < cd.config.signatureScanLimit &&
			node &&
			isInline(node, true) !== false &&
			!(
				(authorData.name &&
					// Users may cross out the text ended with their signature and sign again
					// (https://ru.wikipedia.org/?diff=114726134). The strike element shouldn't be
					// considered a part of the signature then.
					((isElement(node) && ['S', 'STRIKE', 'DEL'].includes(node.tagName)) ||
						// Cases with a talk page link at the end of comment's text like
						// https://ru.wikipedia.org/wiki/Википедия:Заявки_на_статус_администратора/Obersachse_3#c-Obersachse-2012-03-11T08:03:00.000Z-Итог
						// Note that this is currently unsupported by our wikitext parser. When edited, such a
						// comment will be cut at the first user link. You would need to discern ". " inside and
						// outside of links or even tags, and this is much work for little gain. This is the
						// cost of us not relying on a DOM -> wikitext correspondence and processing these parts
						// separately.
						(!isElement(node) && Parser.punctuationRegexp.test(node.textContent)) ||
						(isElement(node) &&
							// Invisible pings, like
							// https://he.wikipedia.org/w/index.php?title=שיחה:שפת_אמת&oldid=38365117#c-אייל-20240205174400-אייל-20240205172600
							(/display: *none/.test(node.getAttribute('style') || '') ||
								this.noSignatureElements.includes(node))))) ||
				(isElement(node) &&
					(node.classList.contains('cd-timestamp') ||
						node.classList.contains('cd-signature') ||
						// Workaround for cases like https://en.wikipedia.org/?diff=1042059387 (those should be
						// extremely rare).
						(['S', 'STRIKE', 'DEL'].includes(node.tagName) && node.textContent.length >= 30) ||
						// Cases like
						// https://ru.wikipedia.org/?diff=141883529#c-Супер-Вики-Патруль-20241204140000-Stjn-20241204123400
						node.textContent.length >= cd.config.signatureScanLimit))
			)
		)

		if (!authorData.name) return

		if (!signatureNodes.length) {
			signatureNodes = [startElement]
		}

		const fseIndex = firstSignatureElement ? signatureNodes.indexOf(firstSignatureElement) : -1
		signatureNodes.splice(fseIndex === -1 ? 1 : fseIndex + 1)

		// eslint-disable-next-line no-one-time-vars/no-one-time-vars
		const signatureContainer = /** @type {ElementFor<N>} */ (signatureNodes[0].parentElement)
		// eslint-disable-next-line no-one-time-vars/no-one-time-vars
		const startElementNextSibling = signatureNodes[0].nextSibling
		const element = Parser.createElement('span')
		element.classList.add('cd-signature')
		signatureNodes.reverse().forEach((n) => Parser.appendChild(element, n))
		Parser.insertBefore(signatureContainer, element, startElementNextSibling || undefined)

		return {
			// eslint-disable-next-line object-shorthand
			element: /** @type {HTMLElementFor<N>} */ (element),
			timestampElement: timestamp.element,
			timestampText: timestamp.element.textContent,
			date: timestamp.date,
			authorLink: /** @type {HTMLElementFor<N>} */ (authorData.link),
			authorTalkLink: /** @type {HTMLElementFor<N>} */ (authorData.talkLink),
			authorName: authorData.name,
			isUnsigned: Boolean(unsignedElement),
			isExtraSignature,
		}
	}

	/**
	 * Find outputs of unsigned templates that we weren't able to find using the standard procedure
	 * (in which case they are treated as normal signatures).
	 *
	 * @returns {Partial<SignatureTarget<N>>[]}
	 * @private
	 */
	findRemainingUnsigneds() {
		if (!cd.config.unsignedClass) {
			return []
		}

		/** @type {Partial<SignatureTarget<N>>[]} */
		const unsigneds = []
		const unsignedElements = /** @type {HTMLElementFor<N>[]} */ ([
			...this.context.rootElement.getElementsByClassName(cd.config.unsignedClass),
		])
		unsignedElements
			.filter((element) => {
				// Only templates with no timestamp interest us.
				if (this.context.getElementByClassName(element, 'cd-timestamp')) {
					return false
				}

				// Cases like https://ru.wikipedia.org/?diff=84883816
				for (
					let /** @type {ElementLike | null} */ el = element;
					el && el !== this.context.rootElement;
					el = el.parentElement
				) {
					if (el.classList.contains('cd-signature')) {
						return false
					}
				}

				return true
			})
			.forEach((element) => {
				const elementLinks = /** @type {HTMLElementFor<N>[]} */ ([
					...element.getElementsByTagName('a'),
				])
				elementLinks.some((link) => {
					const { userName: authorName, linkType } = Parser.processLink(link) || {}
					if (authorName) {
						let authorLink
						let authorTalkLink
						if (linkType === 'user') {
							authorLink = /** @type {HTMLElementFor<N>} */ (link)
						} else if (linkType === 'userTalk') {
							authorTalkLink = /** @type {HTMLElementFor<N>} */ (link)
						}
						element.classList.add('cd-signature')
						unsigneds.push({
							element,
							authorName,
							isUnsigned: true,
							authorLink,
							authorTalkLink,
							isExtraSignature: false,
						})

						return true
					}

					return false
				})
			})

		return unsigneds
	}

	/**
	 * _For internal use._ Find signatures under the root element.
	 *
	 * Characters before the author link, like "—", aren't considered a part of the signature.
	 *
	 * @returns {SignatureTarget<N>[]}
	 */
	findSignatures() {
		// Move extra signatures (additional signatures for a comment, if there is more than one) to an
		// array which then assign to a relevant signature (the one which goes first).
		let extraSignatures = /** @type {SignatureTarget<N>[]} */ ([])

		return /** @type {SignatureTarget<N>[]} */ (
			this.context
				.getAllTextNodes()
				.map((node) => this.findTimestamp(node))
				.filter(defined)
				.map((node) => this.getSignatureFromTimestamp(node))
				.filter(defined)
				.concat(this.findRemainingUnsigneds())
				.slice()
				.reverse()
				.map((sig) => {
					if (sig.isExtraSignature) {
						extraSignatures.push(/** @type {SignatureTarget<N>} */ (sig))
					} else {
						sig.extraSignatures = extraSignatures
						extraSignatures = []
					}

					return { ...sig, type: /** @type {const} */ ('signature') }
				})
				.filter((sig) => !sig.isExtraSignature)
		)
	}

	/**
	 * With code like this:
	 *
	 * ```html
	 * Smth. [signature]
	 * :: Smth. [signature]
	 * ```
	 *
	 * one comment (preceded by :: in this case) creates its own list tree, not a subtree, even though
	 * it's a reply to a reply. So we dive as deep to the bottom of the hierarchy of nested lists as
	 * we can to get the top nodes with comment content (and therefore draw comment layers more
	 * accurately). One of the most complex tree structures is this:
	 *
	 * ```html
	 *  Smth. [signature]
	 *  :* Smth.
	 *  :: Smth. [signature]
	 * ```
	 *
	 * (seen here:
	 * {@link https://ru.wikipedia.org/w/index.php?title=Википедия:Форум/Общий&oldid=103760740#201912010211_Mikhail_Ryazanov})
	 * It has a branchy structure that requires a tricky algorithm to be parsed correctly.
	 *
	 * @param {ElementLike} element
	 * @param {boolean} [onlyChildrenWithoutCommentLevel]
	 * @param {typeof Parser.prototype.getChildElements} [getChildElements]
	 * @returns {{
	 *   nodes: ElementLike[];
	 *   levelsPassed: number;
	 * }}
	 */
	getTopElementsWithText(
		element,
		onlyChildrenWithoutCommentLevel = false,
		getChildElements = this.getChildElements.bind(this),
	) {
		// We ignore all spaces as an easy way to ignore only whitespace text nodes between element
		// nodes (this is a bad idea if we deal with inline nodes, but here we deal with lists).
		// eslint-disable-next-line no-one-time-vars/no-one-time-vars
		const partTextNoSpaces = element.textContent.replace(/\s+/g, '')

		let nodes
		let children = [element]
		let levelsPassed = 0
		do {
			nodes = children
			children = nodes.reduce(
				(arr, el) => arr.concat(getChildElements(el)),
				/** @type {ElementLike[]} */ ([]),
			)
			if (['DL', 'UL', 'OL'].includes(nodes[0].tagName)) {
				levelsPassed++
			}
		} while (
			children.length &&
			children.every(
				(child) =>
					(['DL', 'UL', 'OL', 'DD', 'LI'].includes(child.tagName) &&
						(!onlyChildrenWithoutCommentLevel ||
							['DD', 'LI'].includes(child.tagName) ||
							child.classList.contains('cd-commentLevel'))) ||
					// An inline (e.g., <small>) tag wrapped around block tags can give that (due to some errors
					// in the markup).
					(!child.textContent.trim() && isInline(child)),
			) &&
			children
				.map((child) => child.textContent)
				.join('')
				.replace(/\s+/g, '') === partTextNoSpaces
		)

		return { nodes, levelsPassed }
	}

	/**
	 * _For internal use._ Get all headings on the page.
	 *
	 * @returns {HeadingTarget<N>[]}
	 */
	findHeadings() {
		return /** @type {HTMLElementFor<N>[]} */ ([
			...this.context.rootElement.querySelectorAll('h1, h2, h3, h4, h5, h6'),
		])
			.map((element) => {
				for (
					let /** @type {HTMLElementFor<N> | null} */ el = element;
					el && el !== this.context.rootElement;
					el = /** @type {HTMLElementFor<N> | null} */ (el.parentElement)
				) {
					if (el.classList.contains('mw-heading')) {
						return el
					}
				}

				return element
			})
			.filter(
				(element) =>
					element.getAttribute('id') !== 'mw-toc-heading' &&
					!this.noSignatureElements.some((noSigEl) => Parser.contains(noSigEl, element)),
			)
			.map((element) => ({
				type: 'heading',
				isWrapper: !isHeadingNode(element, true),
				level: /** @type {number} */ (getHeadingLevel(element)),
				element,
			}))
	}

	/**
	 * Turn a structure like this
	 *
	 * ```html
	 * <dd>
	 *   <div>Comment. [signature]</div>
	 *   <ul>...</ul>
	 * </dd>
	 * ```
	 *
	 * into a structure like this
	 *
	 * ```html
	 * <dd>
	 *   <div>Comment. [signature]</div>
	 * </dd>
	 * <dd>
	 *   <ul>...</ul>
	 * </dd>
	 * ```
	 *
	 * by splitting the parent node of the given node, moving all the following nodes into the second
	 * node resulting from the split. If there is no following nodes, don't perform the split.
	 *
	 * @param {AnyNode} node Reference node.
	 * @returns {{
	 *   parent: ElementLike,
	 *   clone: ElementLike,
	 * }} The parent nodes resultant from the split (at least one).
	 */
	splitParentAfterNode(node) {
		const parent = /** @type {ElementLike} */ (node.parentElement)

		// TypeScript things...
		const clone = isDomHandlerElement(parent)
			? parent.cloneNode()
			: /** @type {Element} */ (parent.cloneNode())

		let lastChild
		while ((lastChild = parent.lastChild) && lastChild !== node) {
			Parser.insertBefore(clone, lastChild, clone.firstChild || undefined)
		}
		if (this.getChildElements(clone).length > 0 && parent.parentElement) {
			Parser.insertBefore(parent.parentElement, clone, parent.nextSibling || undefined)
		}

		return { parent, clone }
	}

	/**
	 * Given a link node, enrich the author data and return a boolean denoting whether the node is a
	 * part of the signature.
	 *
	 * @param {ElementLike} link
	 * @param {AuthorData} authorData
	 * @returns {boolean}
	 * @private
	 */
	processLinkData(link, authorData) {
		const result = Parser.processLink(link)
		if (result) {
			const { userName, linkType } = result
			authorData.name ??= userName
			if (authorData.name === userName) {
				if (['user', 'userForeign'].includes(linkType)) {
					// Break only when the second user link is a link to another wiki (but not the other way
					// around, see an example: https://en.wikipedia.org/?diff=1012665097).
					if (authorData.notForeignLink && linkType === 'userForeign') {
						return false
					}
					if (linkType !== 'userForeign') {
						authorData.notForeignLink = link
					}
					authorData.link = link
				} else if (['userTalk', 'userTalkForeign'].includes(linkType)) {
					if (authorData.talkNotForeignLink) {
						return false
					}
					if (linkType !== 'userTalkForeign') {
						authorData.talkNotForeignLink = link
					}
					authorData.talkLink = link
				} else if (['contribs', 'contribsForeign'].includes(linkType)) {
					// authorData.contribsNotForeignLink is used only to make sure there are no two contribs
					// links to the current hostname in a signature.
					if (authorData.contribsNotForeignLink && (authorData.link || authorData.talkLink)) {
						return false
					}
					if (linkType !== 'contribsForeign') {
						authorData.contribsNotForeignLink = link
					}
				} else if (['userSubpage', 'userSubpageForeign'].includes(linkType)) {
					// A user subpage link after a user link is OK. A user subpage link before a user link is
					// not OK (example: https://ru.wikipedia.org/?diff=112885854). Perhaps part of the
					// comment.
					if (authorData.link || authorData.talkLink) {
						return false
					}
				} else if (['userTalkSubpage', 'userTalkSubpageForeign'].includes(linkType)) {
					// Same as with a user page above.
					if (authorData.link || authorData.talkLink) {
						return false
					}
				} else if (authorData.link || authorData.talkLink) {
					// Cases like https://ru.wikipedia.org/?diff=115909247
					return false
				}
				authorData.isLastLinkAuthorLink = true
			} else {
				// Don't return false here in case the user mentioned a redirect to their user page here.
			}
		}

		return true
	}

	/**
	 * Get a nesting level of an element relative to the root element.
	 *
	 * @param {ElementFor<N>} element
	 * @returns {number}
	 */
	getNestingLevel(element) {
		// eslint-disable-next-line no-one-time-vars/no-one-time-vars
		const treeWalker = new ElementsTreeWalker(this.context.rootElement, element)
		let nestingLevel = 0
		while (treeWalker.parentNode()) {
			nestingLevel++
		}

		return nestingLevel
	}

	/**
	 * Get the child elements of an element.
	 *
	 * @param {ElementLike} element
	 * @returns {ElementLike[]}
	 */
	getChildElements(element) {
		const children = /** @type {ElementLike[] | HTMLCollection} */ (
			element[/** @type {keyof ElementLike} */ (this.context.childElementsProp)]
		)

		return [...children]
	}

	/**
	 * Get elements under the root element by tag name.
	 *
	 * @param {string} name
	 * @returns {ElementLike[]}
	 */
	getElementsByTagName(name) {
		return /** @type {ElementLike[]} */ ([...this.context.rootElement.getElementsByTagName(name)])
	}

	/**
	 * Get elements under the root element by class name.
	 *
	 * @param {string} name
	 * @returns {ElementLike[]}
	 */
	getElementsByClassName(name) {
		return /** @type {ElementLike[]} */ ([...this.context.rootElement.getElementsByClassName(name)])
	}

	/**
	 * @typedef {'user' | 'userTalk' | 'contribs' | 'userSubpage' | 'userTalkSubpage' | 'userForeign' | 'userTalkForeign' | 'contribsForeign' | 'userSubpageForeign' | 'userTalkSubpageForeign' | 'unknown'} LinkType
	 */

	/**
	 * @typedef {object} ProcessLinkReturn
	 * @property {string} userName User name.
	 * @property {LinkType} linkType Link type.
	 * @memberof Parser
	 * @inner
	 */

	/**
	 * _For internal use._ Get a user name from a link, along with some other data about a page name.
	 *
	 * @param {ElementLike} element
	 * @returns {ProcessLinkReturn | undefined}
	 */
	static processLink(element) {
		const href = element.getAttribute('href')
		let userName
		/** @type {LinkType} */
		let linkType = 'unknown'
		if (href) {
			const { pageName, hostname, fragment } = parseWikiUrl(href) || {}
			if (!pageName || CommentSkeleton.isAnyId(fragment)) {
				return
			}

			const match = pageName.match(cd.g.userNamespacesRegexp)
			if (match) {
				userName = match[1]
				if (cd.g.userLinkRegexp.test(pageName)) {
					linkType = 'user'
				} else if (cd.g.userTalkLinkRegexp.test(pageName)) {
					linkType = 'userTalk'
				} else if (cd.g.userSubpageLinkRegexp.test(pageName)) {
					linkType = 'userSubpage'
				} else if (cd.g.userTalkSubpageLinkRegexp.test(pageName)) {
					linkType = 'userTalkSubpage'
				}

				// Another alternative is a user link to another site where the prefix is specified before
				// the namespace. Enough to capture the user name from, not enough to make any inferences.
			} else if (cd.g.contribsPageLinkRegexp.test(pageName)) {
				userName = pageName.replace(cd.g.contribsPageLinkRegexp, '')
				if (cd.g.isIPv6Address?.(userName)) {
					userName = userName.toUpperCase()
				}
				linkType = 'contribs'
			}
			if (hostname !== cd.g.serverName) {
				linkType += 'Foreign'

				// Some bug in type checking - can't do `linkType = /** @type {LinkType} */ (linkType +
				// 'Foreign');` so that linkType doesn't end up just a string.
				// eslint-disable-next-line no-self-assign
				linkType = /** @type {LinkType} */ (linkType)
			}
			if (!userName) {
				return
			}

			userName = ucFirst(underlinesToSpaces(userName.replace(/\/.*/, ''))).trim()
		} else if (
			element.classList.contains('mw-selflink') &&
			cd.g.namespaceNumber === 3 &&
			!cd.g.pageName.includes('/')
		) {
			// Comments of users that have only the user talk page link in their signature on their talk
			// page.
			userName = cd.g.pageTitle
		} else {
			return
		}

		return { userName, linkType }
	}

	/**
	 * Create an element node.
	 *
	 * @param {string} name
	 * @returns {ElementLike}
	 */
	static createElement(name) {
		return document.createElement(name)
	}

	/**
	 * Create a text node.
	 *
	 * @param {string} text
	 * @returns {TextLike}
	 */
	static createTextNode(text) {
		return document.createTextNode(text)
	}

	/**
	 * Appends a child node to a parent element.
	 *
	 * @param {ElementLike} parent The parent element
	 * @param {NodeLike} child The child node to append
	 * @returns {NodeLike}
	 */
	static appendChild(parent, child) {
		return parent.appendChild(/** @type {any} */ (child))
	}

	/**
	 * Checks if an element contains a node.
	 *
	 * @param {ElementLike} el The element to check the contents of
	 * @param {NodeLike} node The node contained or not
	 * @returns {boolean}
	 */
	static contains(el, node) {
		return el.contains(/** @type {any} */ (node))
	}

	/**
	 * Inserts a node before a reference node within a parent element.
	 *
	 * @param {ElementLike} parent The parent element
	 * @param {NodeLike} node The node to insert
	 * @param {NodeLike | null} [referenceNode] The reference node to insert before
	 * @returns {NodeLike}
	 */
	static insertBefore(parent, node, referenceNode) {
		return parent.insertBefore(/** @type {any} */ (node), /** @type {any} */ (referenceNode))
	}

	/**
	 * Removes a node from the document.
	 *
	 * @param {NodeLike} node The node to remove
	 * @returns {void}
	 */
	static remove(node) {
		const nodeTyped = /** @type {any} */ (node)
		nodeTyped.remove()
	}

	/**
	 * Initialize the class.
	 */
	static init() {
		// Parenthesis for the case `smth). ~~~~`
		// https://ru.wikipedia.org/w/index.php?title=Википедия:Форум/Новости&oldid=138050961#c-Lesless-20240526055500-Deinocheirus-20240525165500
		// Non-Latin punctuation is collected manually from https://en.wikipedia.org/wiki/Full_stop and
		// other sources.
		this.punctuationRegexp = new RegExp(
			`(?:^|[${cd.g.letterPattern}])[)\\]]*(?:[.!?…।։။۔]+ |[。！？]+)`,
		)
	}
}

export default Parser
