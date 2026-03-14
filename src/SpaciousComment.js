import Comment from './Comment'
import CommentButton from './CommentButton'
import CommentLayers from './CommentLayers'
import LiveTimestamp from './LiveTimestamp'
import PrototypeRegistry from './PrototypeRegistry'
import SpaciousCommentActions from './SpaciousCommentActions'
import SpaciousCommentLayers from './SpaciousCommentLayers'
import cd from './loader/cd'
import { isInline } from './shared/utils-general'

/**
 * @typedef {object} ReplaceSignatureWithHeaderReturnItem
 * @property {string} pageName
 * @property {HTMLAnchorElement} link
 */

/** @typedef {ReplaceSignatureWithHeaderReturnItem[]} ReplaceSignatureWithHeaderReturn */

/**
 * A spacious comment class. Handles spacious comment formatting with author/date headers and
 * structured layout.
 *
 * @template {boolean} [OpeningSection=boolean]
 * @augments Comment<OpeningSection>
 */
class SpaciousComment extends Comment {
	/**
	 * Comment layers for spacious comments.
	 *
	 * @type {SpaciousCommentLayers | undefined}
	 * @override
	 */
	// @ts-expect-error: Narrowing parent type
	layers

	/**
	 * Comment actions for spacious comments.
	 *
	 * @type {SpaciousCommentActions}
	 * @override
	 */
	// @ts-expect-error: Narrowing parent type
	actions

	/**
	 * Header element for spacious comments.
	 *
	 * @type {HTMLElement}
	 */
	headerElement

	/**
	 * Author element within the header.
	 *
	 * @type {HTMLElement}
	 */
	authorElement

	/**
	 * Date element within the header.
	 *
	 * @type {HTMLElement}
	 */
	dateElement

	/**
	 * Comment header jQuery wrapper.
	 *
	 * @type {JQuery}
	 */
	$header

	/**
	 * Comment menu jQuery wrapper.
	 *
	 * @type {JQuery}
	 */
	$menu

	/**
	 * Create the comment's underlay and overlay with contents for spacious comments.
	 *
	 * @fires commentLayersCreated
	 * @protected
	 * @override
	 */
	createLayers() {
		// Create spacious layers
		this.layers = new SpaciousCommentLayers(this)
		this.layers.create()

		/**
		 * An underlay and overlay have been created for a comment.
		 *
		 * @event commentLayersCreated
		 * @param {Comment} comment
		 * @param {object} cd {@link convenientDiscussions} object.
		 */
		mw.hook('convenientDiscussions.commentLayersCreated').fire(this, cd)
	}

	/**
	 * Update the toggle child threads button implementation for spacious comments.
	 * Uses SVG icons from prototypes.
	 *
	 * @this {this & { actions: { toggleChildThreadsButton: { element: HTMLElement } } }}
	 * @override
	 */
	updateToggleChildThreadsButtonImpl() {
		this.actions.toggleChildThreadsButton.element.innerHTML = ''
		this.actions.toggleChildThreadsButton.element.append(
			SpaciousComment.prototypes.get(
				this.areChildThreadsCollapsed()
					? 'expandChildThreadsButtonSvg'
					: 'collapseChildThreadsButtonSvg',
			),
		)
	}

	/**
	 * Update the main timestamp element for spacious comments. Only updates if there are extra
	 * signatures (timestamp is handled in header otherwise).
	 *
	 * @param {string} timestamp
	 * @param {string} title
	 * @override
	 */
	updateMainTimestampElement(timestamp, title) {
		if (!this.hasTimestamp() || !this.extraSignatures.length) return

		this.timestampElement.textContent = timestamp
		this.timestampElement.title = title
		new LiveTimestamp(this.timestampElement, this.date, !this.hideTimezone).init()
	}

	/**
	 * Get separators for change note links in spacious comments.
	 * Uses short format with dot separators.
	 *
	 * @param {string} stringName
	 * @param {import('./Button').default} [_refreshLink]
	 * @returns {{ noteText: string, refreshLinkSeparator: string, diffLinkSeparator: string }}
	 * @override
	 */
	getChangeNoteSeparators(stringName, _refreshLink) {
		return {
			noteText: cd.s(stringName + '-short'),
			refreshLinkSeparator: cd.sParse('dot-separator'),
			diffLinkSeparator: cd.sParse('dot-separator'),
		}
	}

	/**
	 * Implementation-specific structure initialization for spacious comments.
	 * Replaces signature with header and adds menu.
	 *
	 * @returns {ReplaceSignatureWithHeaderReturn} Pages to check existence of.
	 * @override
	 */
	initializeCommentStructureImpl() {
		this.actions = new SpaciousCommentActions(this)
		const pagesToCheckExistence = this.replaceSignatureWithHeader()
		this.addMenu()

		return pagesToCheckExistence
	}

	/**
	 * _For internal use._ Add a comment header to the top highlightable element. Remove the comment
	 * signature unless there is more than one of them.
	 *
	 * @returns {ReplaceSignatureWithHeaderReturn} Pages to check existence of.
	 */
	replaceSignatureWithHeader() {
		const pagesToCheckExistence = []

		const headerWrapper = SpaciousComment.prototypes.get('headerWrapperElement')
		this.headerElement = /** @type {HTMLElement} */ (headerWrapper.firstChild)
		// eslint-disable-next-line no-one-time-vars/no-one-time-vars
		const authorWrapper = /** @type {HTMLElement} */ (this.headerElement.firstChild)
		const userInfoCardButton = /** @type {HTMLAnchorElement} */ (authorWrapper.firstChild)
		const authorLink = /** @type {HTMLAnchorElement} */ (userInfoCardButton.nextElementSibling)
		const authorLinksWrapper = /** @type {HTMLElement} */ (authorLink.nextElementSibling)
		const bdiElement = /** @type {HTMLElement} */ (authorLink.firstChild)
		const authorTalkLink = /** @type {HTMLAnchorElement} */ (authorLinksWrapper.firstElementChild)
		let contribsLink
		if (this.showContribsLink) {
			contribsLink = /** @type {HTMLAnchorElement} */ (authorLinksWrapper.lastElementChild)
			if (!this.author.isRegistered()) {
				const contribsLinkPreviousSibling = /** @type {HTMLElement} */ (
					contribsLink.previousSibling
				)
				contribsLinkPreviousSibling.remove()
				contribsLink.remove()
			}
		}

		if (mw.user.options.get('checkuser-userinfocard-enable') && this.author.isRegistered()) {
			userInfoCardButton.dataset.username = this.author.getName()
			if (this.author.isTemporary()) {
				const span = /** @type {HTMLElement} */ (userInfoCardButton.firstChild)
				span.classList.remove('ext-checkuser-userinfocard-button__icon--userAvatar')
				span.classList.add('ext-checkuser-userinfocard-button__icon--userTemporary')
			}
		} else {
			userInfoCardButton.remove()
		}

		if (this.authorLink) {
			// Move the existing author link to the header.

			if (this.extraSignatures.length) {
				this.authorLink = /** @type {HTMLAnchorElement} */ (this.authorLink.cloneNode(true))
			}

			// eslint-disable-next-line no-one-time-vars/no-one-time-vars
			const beforeAuthorLinkParseReturn = cd.config.beforeAuthorLinkParse?.(
				this.authorLink,
				authorLink,
			)
			authorLink.replaceWith(this.authorLink)
			this.authorLink.classList.add('cd-comment-author')
			this.authorLink.innerHTML = ''
			this.authorLink.append(bdiElement)

			cd.config.afterAuthorLinkParse?.(this.authorLink, beforeAuthorLinkParseReturn)
		} else {
			// Use the bootstrap author link.
			this.authorLink = authorLink
			let pageName
			if (this.author.isRegistered()) {
				pageName = 'User:' + this.author.getName()
				pagesToCheckExistence.push({
					pageName,
					link: this.authorLink,
				})
			} else {
				pageName = `${cd.g.contribsPages[0]}/${this.author.getName()}`
			}
			this.authorLink.title = pageName
			this.authorLink.href = mw.util.getUrl(pageName)
		}

		if (this.authorTalkLink) {
			// Move the existing author talk link to the header.
			if (this.extraSignatures.length) {
				this.authorTalkLink = /** @type {HTMLAnchorElement} */ (this.authorTalkLink.cloneNode(true))
			}
			authorTalkLink.replaceWith(this.authorTalkLink)
			this.authorTalkLink.textContent = cd.s('comment-author-talk')
		} else {
			// Use the bootstrap author talk link.
			this.authorTalkLink = authorTalkLink
			const pageName = 'User talk:' + this.author.getName()
			pagesToCheckExistence.push({
				pageName,
				link: this.authorTalkLink,
			})
			this.authorTalkLink.title = pageName
			this.authorTalkLink.href = mw.util.getUrl(pageName)
		}

		bdiElement.textContent = this.author.getName()

		if (contribsLink && this.author.isRegistered()) {
			const pageName = `${cd.g.contribsPages[0]}/${this.author.getName()}`
			contribsLink.title = pageName
			contribsLink.href = mw.util.getUrl(pageName)
		}

		if (this.timestamp) {
			/**
			 * "Copy link" button.
			 *
			 * @type {CommentButton}
			 */
			this.actions.copyLinkButton = new CommentButton({
				label: this.reformattedTimestamp || this.timestamp,
				tooltip: this.timestampTitle,
				classes: ['cd-comment-button-labeled', 'cd-comment-timestamp', 'mw-selflink-fragment'],
				action: this.copyLink,
				href: this.dtId && '#' + this.dtId,
			})

			this.headerElement.append(this.actions.copyLinkButton.element)
			this.timestampElement = this.actions.copyLinkButton.labelElement
			if (this.date) {
				new LiveTimestamp(this.timestampElement, this.date, !this.hideTimezone).init()
			}
		}

		this.$header = /** @type {JQuery} */ ($(this.headerElement))

		this.rewrapHighlightables()
		this.highlightables[0].insertBefore(headerWrapper, this.highlightables[0].firstChild)

		if (!this.extraSignatures.length) {
			this.cleanUpSignature()
			this.signatureElement.remove()
		}

		return pagesToCheckExistence
	}

	/**
	 * Clean up the signature and elements in front of it.
	 *
	 * @protected
	 */
	cleanUpSignature() {
		let previousNode = this.signatureElement.previousSibling

		// Cases like https://ru.wikipedia.org/?diff=117350706
		if (!previousNode) {
			const parentElement = this.signatureElement.parentElement
			const parentPreviousNode = parentElement?.previousSibling
			if (parentPreviousNode && isInline(parentPreviousNode, true)) {
				const parentPreviousElementNode = parentElement.previousElementSibling

				// Make sure we don't erase some blockquote with little content.
				if (!parentPreviousElementNode || isInline(parentPreviousElementNode)) {
					previousNode = parentPreviousNode
				}
			}
		}

		const previousPreviousNode = previousNode?.previousSibling

		// Use this to tell the cases where a styled element should be kept
		// https://commons.wikimedia.org/?diff=850489596 from cases where it should be removed
		// https://en.wikipedia.org/?diff=1229675944
		// eslint-disable-next-line no-one-time-vars/no-one-time-vars
		const isPpnSpaced = previousNode?.textContent.startsWith(' ')

		this.processPossibleSignatureNode(previousNode)
		if (
			previousNode &&
			previousPreviousNode &&
			(!previousNode.parentNode || !previousNode.textContent.trim())
		) {
			// eslint-disable-next-line no-one-time-vars/no-one-time-vars
			const previousPreviousPreviousNode = previousPreviousNode.previousSibling
			// eslint-disable-next-line no-one-time-vars/no-one-time-vars
			const isPppnSpaced = previousPreviousNode.textContent.startsWith(' ')
			this.processPossibleSignatureNode(previousPreviousNode, isPpnSpaced)

			// Rare cases like https://en.wikipedia.org/?diff=1022471527
			if (!previousPreviousNode.parentNode) {
				this.processPossibleSignatureNode(previousPreviousPreviousNode, isPppnSpaced)
			}
		}
	}

	/**
	 * Process a possible signature node or a node that contains text which is part of a signature.
	 *
	 * @param {?Node} node
	 * @param {boolean} [isSpaced] Was the previously removed node start with a space.
	 * @private
	 */
	processPossibleSignatureNode(node, isSpaced = false) {
		if (!node) return

		// Remove text at the end of the element that looks like a part of the signature.
		if (
			cd.config.signaturePrefixRegexp &&
			(node instanceof Text || (node instanceof Element && !node.children.length))
		) {
			node.textContent = node.textContent
				.replace(cd.config.signaturePrefixRegexp, '')
				.replace(cd.config.signaturePrefixRegexp, '')
		}

		// Remove the entire element.
		if (
			node instanceof Element &&
			node.textContent.length < 30 &&
			((!isSpaced &&
				(node.getAttribute('style') || ['SUP', 'SUB'].includes(node.tagName)) &&
				// Templates like "citation needed" or https://ru.wikipedia.org/wiki/Template:-:
				!node.classList.length) || // https://ru.wikipedia.org/wiki/Обсуждение_участника:Adamant.pwn/Архив/2023#c-Adamant.pwn-20230722131600-Rampion-20230722130800
				// Cases like https://ru.wikipedia.org/?diff=119667594
				((node.getAttribute('style') ||
					// https://en.wikipedia.org/?oldid=1220458782#c-Dxneo-20240423211700-Dilettante-20240423210300
					['B', 'STRONG'].includes(node.tagName)) &&
					node.textContent.toLowerCase() === this.author.getName().toLowerCase()))
		) {
			node.remove()
		}
	}

	/**
	 * Implementation-specific logic for adding change note to spacious comments.
	 * Adds the note to the header.
	 *
	 * @param {JQuery} $changeNote
	 * @protected
	 * @override
	 */
	addChangeNoteImpl($changeNote) {
		this.$header.append($changeNote)
	}

	/**
	 * Get the start point for selection range in spacious comments.
	 * Uses the end of header element.
	 *
	 * @returns {{ startNode: Node, startOffset: number }}
	 * @protected
	 * @override
	 */
	getSelectionStartPoint() {
		return {
			startNode: this.headerElement,
			startOffset: this.headerElement.childNodes.length,
		}
	}

	/**
	 * Get the end point for selection range in spacious comments.
	 * Uses the beginning of menu element.
	 *
	 * @returns {{ endNode: Node, endOffset: number }}
	 * @protected
	 * @override
	 */
	getSelectionEndPoint() {
		return {
			endNode: this.menuElement || this.headerElement,
			endOffset: 0,
		}
	}

	/**
	 * Get the end boundary element for spacious comments.
	 * Uses the menu element as the boundary.
	 *
	 * @returns {HTMLElement}
	 * @protected
	 * @override
	 */
	getSelectionEndBoundary() {
		return this.menuElement || this.headerElement
	}

	/**
	 * _For internal use._ Add a menu to the bottom highlightable element of the comment and fill it
	 * with buttons. Used when comment reformatting is enabled.
	 */
	addMenu() {
		const menuElement = document.createElement('div')
		menuElement.className = 'cd-comment-menu'
		this.menuElement = menuElement
		this.$menu = $(menuElement)

		this.actions.create()

		// The menu may be re-added (after a comment's content is updated). We need to restore
		// something.
		this.actions.maybeAddGoToChildButton()

		// We need a wrapper to ensure correct positioning in LTR-in-RTL situations and vice versa.
		const menuWrapper = document.createElement('div')
		menuWrapper.className = 'cd-comment-menu-wrapper'
		menuWrapper.append(this.menuElement)

		this.highlightables[this.highlightables.length - 1].append(menuWrapper)
	}

	/**
	 * @type {PrototypeRegistry<{
	 *   headerWrapperElement: HTMLElement
	 *   collapseChildThreadsButtonSvg: SVGElement
	 *   expandChildThreadsButtonSvg: SVGElement
	 *   underlay: HTMLElement
	 *   overlay: HTMLElement
	 * }>}
	 */
	static prototypes = new PrototypeRegistry()

	/**
	 * Initialize prototypes for spacious comments. Creates header wrapper and SVG icon prototypes.
	 *
	 * @override
	 */
	static initPrototypes() {
		// Initialize shared layer prototypes (underlay, overlay)
		CommentLayers.initPrototypes()

		// Create header wrapper element
		const headerElement = document.createElement('div')
		headerElement.className = 'cd-comment-header'

		const authorWrapper = document.createElement('div')
		authorWrapper.className = 'cd-comment-author-wrapper'
		headerElement.append(authorWrapper)

		// Add user info card button
		authorWrapper.append(Comment.createUserInfoCardButton())

		const authorLink = document.createElement('a')
		authorLink.className = 'cd-comment-author mw-userlink'
		authorWrapper.append(authorLink)

		const bdiElement = document.createElement('bdi')
		authorLink.append(bdiElement)

		const authorLinksWrapper = document.createElement('span')
		authorLinksWrapper.className = 'cd-comment-author-links'

		const authorTalkLink = document.createElement('a')
		authorTalkLink.textContent = cd.s('comment-author-talk')
		authorLinksWrapper.append(cd.mws('parentheses-start'), authorTalkLink)

		if (cd.settings.get('showContribsLink')) {
			const separator = document.createElement('span')
			separator.innerHTML = cd.sParse('dot-separator')

			const contribsLink = document.createElement('a')
			contribsLink.textContent = cd.s('comment-author-contribs')

			authorLinksWrapper.append(separator, contribsLink)
		}

		authorLinksWrapper.append(cd.mws('parentheses-end'))
		authorWrapper.append(' ', authorLinksWrapper)

		// We need a wrapper to ensure correct positioning in LTR-in-RTL situations and vice versa.
		const headerWrapper = document.createElement('div')
		headerWrapper.className = 'cd-comment-header-wrapper'
		headerWrapper.append(headerElement)

		this.prototypes.add('headerWrapperElement', headerWrapper)

		// Create SVG icon prototypes for toggle child threads button
		this.prototypes.add(
			'collapseChildThreadsButtonSvg',
			cd.utils.createSvg(16, 16, 20, 20).html(`<path d="M4 9h12v2H4z" />`)[0],
		)
		this.prototypes.add(
			'expandChildThreadsButtonSvg',
			cd.utils.createSvg(16, 16, 20, 20).html(`<path d="M11 9V4H9v5H4v2h5v5h2v-5h5V9z" />`)[0],
		)

		// Initialize spacious-specific action prototypes
		SpaciousCommentActions.initPrototypes()
	}
}

export default SpaciousComment
