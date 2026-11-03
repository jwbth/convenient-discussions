import { describe, expect, test } from 'vitest'

import { highlightText, removeHighlights } from '../src/textHighlighting'

describe('text highlighting', () => {
	test('matches a trimmed phrase without regard to case and highlights only that phrase', () => {
		const element = document.createElement('div')
		element.textContent = 'Use COMPACT comments'

		expect(highlightText(element, '  compact COMMENTS  ')).toBe(true)
		expect(element.innerHTML).toBe('Use <span class="cd-searchHighlight">COMPACT comments</span>')
	})

	test('highlights every occurrence within a text node', () => {
		const element = document.createElement('div')
		element.textContent = 'TOC, toc, and Toc'

		expect(highlightText(element, 'toc')).toBe(true)
		expect(element.innerHTML).toBe(
			'<span class="cd-searchHighlight">TOC</span>, ' +
				'<span class="cd-searchHighlight">toc</span>, and ' +
				'<span class="cd-searchHighlight">Toc</span>',
		)
	})

	test('highlights across markup while keeping links, attributes, and handlers', () => {
		const element = document.createElement('div')
		element.innerHTML = 'Use com<a href="/wiki/Help" title="Help" data-example="value">pa<b>ct</b></a> mode'
		const link = element.querySelector('a')
		let clicks = 0
		link.addEventListener('click', (event) => {
			event.preventDefault()
			clicks++
		})

		expect(highlightText(element, 'compact')).toBe(true)
		expect(element.innerHTML).toBe(
			'Use <span class="cd-searchHighlight">com</span>' +
				'<a href="/wiki/Help" title="Help" data-example="value">' +
				'<span class="cd-searchHighlight">pa</span><b>' +
				'<span class="cd-searchHighlight">ct</span></b></a> mode',
		)
		expect(element.querySelector('a')).toBe(link)
		link.click()
		expect(clicks).toBe(1)
	})

	test('removes highlights and restores the original text nodes and markup exactly', () => {
		const element = document.createElement('div')
		element.innerHTML = 'Use com<a href="/wiki/Help">pact</a><!--note--> mode'
		const adjacentText = document.createTextNode(' again')
		const emptyText = document.createTextNode('')
		element.append(adjacentText, emptyText)
		const originalMarkup = element.innerHTML
		const originalChildren = [...element.childNodes]
		const originalLinkText = element.querySelector('a').firstChild

		highlightText(element, 'compact')
		removeHighlights(element)

		expect(element.innerHTML).toBe(originalMarkup)
		expect([...element.childNodes]).toHaveLength(originalChildren.length)
		originalChildren.forEach((node, index) => {
			expect(element.childNodes[index]).toBe(node)
		})
		expect(element.querySelector('a').firstChild).toBe(originalLinkText)
		expect(originalChildren[0].textContent).toBe('Use com')
		expect(originalLinkText.textContent).toBe('pact')
	})

	test('keeps match positions correct after characters whose lowercase form has a different length', () => {
		const element = document.createElement('div')
		element.textContent = 'İ TOC'

		expect(highlightText(element, 'toc')).toBe(true)
		expect(element.innerHTML).toBe('İ <span class="cd-searchHighlight">TOC</span>')
	})

	test.each(['missing', 'compact mode', 'CAFE', '', ' \n\t '])(
		'leaves the DOM unchanged when %j does not match',
		(query) => {
			const element = document.createElement('div')
			element.innerHTML = 'Compact <a href="/wiki/Help">comments</a> in café mode'
			const originalMarkup = element.innerHTML
			const originalChildren = [...element.childNodes]

			expect(highlightText(element, query)).toBe(false)
			removeHighlights(element)

			expect(element.innerHTML).toBe(originalMarkup)
			originalChildren.forEach((node, index) => {
				expect(element.childNodes[index]).toBe(node)
			})
		},
	)

	test('treats regular expression characters as literal text and keeps accents significant', () => {
		const element = document.createElement('div')
		element.textContent = 'Café (compact)? mode'

		expect(highlightText(element, '(compact)?')).toBe(true)
		expect(element.innerHTML).toBe('Café <span class="cd-searchHighlight">(compact)?</span> mode')
		removeHighlights(element)
		expect(highlightText(element, 'CAFÉ')).toBe(true)
		expect(element.innerHTML).toBe('<span class="cd-searchHighlight">Café</span> (compact)? mode')
	})

	test('can highlight a new query after removal and restore the same nodes again', () => {
		const element = document.createElement('div')
		element.innerHTML = 'Compact <a href="/wiki/Help">comments</a> and compact help'
		const originalMarkup = element.innerHTML
		const originalChildren = [...element.childNodes]
		const originalLinkText = element.querySelector('a').firstChild

		highlightText(element, 'compact')
		removeHighlights(element)
		expect(highlightText(element, 'comments')).toBe(true)
		expect(element.innerHTML).toBe(
			'Compact <a href="/wiki/Help"><span class="cd-searchHighlight">comments</span></a> and compact help',
		)
		removeHighlights(element)
		removeHighlights(element)

		expect(element.innerHTML).toBe(originalMarkup)
		originalChildren.forEach((node, index) => {
			expect(element.childNodes[index]).toBe(node)
		})
		expect(element.querySelector('a').firstChild).toBe(originalLinkText)
	})
})
