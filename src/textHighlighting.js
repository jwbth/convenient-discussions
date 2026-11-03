/** @type {WeakMap<Element, { original: Text, nodes: ChildNode[] }[]>} */
const highlightedNodes = new WeakMap()

/**
 * Highlight a trimmed, case-insensitive phrase in an element's text.
 * Remove this element's highlights before highlighting it again.
 *
 * @param {Element} element
 * @param {string} query
 * @returns {boolean} Whether the phrase matches.
 */
export function highlightText(element, query) {
	const phrase = query.trim()
	if (!phrase) return false

	const pattern = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`), 'giu')
	const matches = [...element.textContent.matchAll(pattern)].map((match) => ({
		start: match.index,
		end: match.index + match[0].length,
	}))
	if (!matches.length) return false

	const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT)
	const nodes = []
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		nodes.push(/** @type {Text} */ (node))
	}

	/** @type {{ original: Text, nodes: ChildNode[] }[]} */
	const replacements = []
	let offset = 0
	nodes.forEach((node) => {
		const ranges = matches
			.map((match) => ({
				start: Math.max(match.start - offset, 0),
				end: Math.min(match.end - offset, node.length),
			}))
			.filter((range) => range.start < range.end)
		offset += node.length
		if (!ranges.length) return

		const fragment = element.ownerDocument.createDocumentFragment()
		let end = 0
		ranges.forEach((range) => {
			fragment.append(node.data.slice(end, range.start))
			const highlight = element.ownerDocument.createElement('span')
			highlight.className = 'cd-searchHighlight'
			highlight.textContent = node.data.slice(range.start, range.end)
			fragment.append(highlight)
			end = range.end
		})
		fragment.append(node.data.slice(end))

		// Retain the detached originals so clearing preserves adjacent and empty text nodes too.
		replacements.push({ original: node, nodes: [...fragment.childNodes] })
		node.replaceWith(fragment)
	})
	highlightedNodes.set(element, replacements)

	return true
}

/**
 * Remove an element's highlights, restoring its original text nodes.
 *
 * @param {Element} element
 */
export function removeHighlights(element) {
	highlightedNodes.get(element)?.forEach(({ original, nodes }) => {
		nodes[0].replaceWith(original)
		nodes.slice(1).forEach((node) => node.remove())
	})
	highlightedNodes.delete(element)
}
