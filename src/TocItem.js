import cd from './loader/cd'
import CdError from './shared/CdError'
import { isElement, isText } from './shared/utils-general'
import { createSvg } from './loader/convenientDiscussions.util'

/**
 * An item of the table of contents.
 */
export default class TocItem {
	/**
	 * Section link jQuery element.
	 *
	 * @type {JQuery}
	 */
	$link

	/**
	 * Section text jQuery element (including the title, number, and other possible additions).
	 *
	 * @type {JQuery}
	 */
	$text

	/**
	 * Create a table of contents item object.
	 *
	 * @param {HTMLAnchorElement} a
	 * @param {typeof import('./toc').default} toc
	 * @throws {Array.<string|Element>}
	 */
	constructor(a, toc) {
		this.toc = toc
		this.canBeModified = this.toc.canBeModified

		const textSpan = /** @type {HTMLElement | null} */ (
			a.querySelector(this.toc.isInSidebar() ? '.vector-toc-text' : '.toctext')
		)
		if (!textSpan) {
			throw new CdError({ message: `Link text not found`, details: a })
		}

		const li = /** @type {HTMLElement} */ (a.parentNode)
		if (li.tagName !== 'LI') {
			throw new CdError({ message: `Parent is not <li>`, details: a })
		}

		const numberSpan = a.querySelector(this.toc.isInSidebar() ? '.vector-toc-numb' : '.tocnumber')
		let number
		if (numberSpan) {
			number = numberSpan.textContent
		} else {
			console.error(`Couldn't find the number for a TOC link`, a)
			number = '?'
		}

		this.id = /** @type {string} */ (a.getAttribute('href')).slice(1)
		if (!this.id) {
			console.error(`Couldn't find the ID for a TOC link`, a)
		}

		const levelMatch = li.className.match(
			this.toc.isInSidebar() ? /vector-toc-level-(\d+)/ : /\btoclevel-(\d+)/,
		)
		if (levelMatch) {
			this.level = Number(levelMatch[1])
		} else {
			console.error(`Couldn't find the level for a TOC link`, a)
		}
		/** @type {string} */
		this.number = number
		this.$element = $(li)
		this.$link = $(a)
		this.$text = $(textSpan)
	}

	/**
	 * _For internal use._ Generate HTML to use it in the TOC for the section. Only a limited number
	 * of HTML elements is allowed in TOC.
	 *
	 * @param {JQuery} $headline
	 */
	replaceText($headline) {
		if (!this.canBeModified) return

		this.$text
			.contents()
			.filter(
				(_, node) =>
					isText(node) ||
					(isElement(node) && ![...node.classList].some((name) => name.match(/^(cd-|vector-)/))),
			)
			.eq(-1)
			.after(
				...$headline
					.clone()
					.find('*')
					.each((_, el) => {
						if (['B', 'EM', 'I', 'S', 'STRIKE', 'STRONG', 'SUB', 'SUP'].includes(el.tagName)) {
							;[...el.attributes].forEach((attr) => {
								el.removeAttribute(attr.name)
							})
						} else {
							;[...el.childNodes].forEach((child) => {
								el.before(child)
							})
							el.remove()
						}
					})
					.end()
					.contents()
					.get(),
			)
			.end()
			.remove()
	}

	/**
	 * Add/remove a subscription mark to the section's TOC link according to its subscription state
	 * and update the `title` attribute.
	 *
	 * @param {?boolean} subscriptionState
	 */
	updateSubscriptionState(subscriptionState) {
		if (!this.canBeModified) return

		if (subscriptionState) {
			this.$link.find(this.toc.isInSidebar() ? '.vector-toc-text' : '.toctext').append(
				$('<span>').addClass('cd-toc-subscriptionIcon-before'),
				$('<span>')
					.addClass('cd-toc-subscriptionIcon cd-icon')
					.append(
						createSvg(14, 14, 20, 20).html(
							`<path d="M16 7a5.38 5.38 0 0 0-4.46-4.85C11.6 1.46 11.53 0 10 0S8.4 1.46 8.46 2.15A5.38 5.38 0 0 0 4 7v6l-2 2v1h16v-1l-2-2zm-6 13a3 3 0 0 0 3-3H7a3 3 0 0 0 3 3z" />`,
						),
					)
					.attr('title', cd.s('toc-watched')),
			)
		} else {
			this.$link
				.removeAttr('title')
				.find('.cd-toc-subscriptionIcon, .cd-toc-subscriptionIcon-before')
				.remove()
		}
	}
}
