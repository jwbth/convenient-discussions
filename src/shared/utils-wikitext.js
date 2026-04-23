/**
 * Wikitext parsing and processing utilities.
 *
 * @module utilsWikitext
 */

import TextMasker from '../TextMasker'

import cd from './cd'
import { decodeHtmlEntities } from './utils-general'

/**
 * Generate a regular expression that searches for specified tags in the text (opening, closing, and
 * content between them).
 *
 * @param {string[]} tags
 * @returns {RegExp}
 */
export function generateTagsRegexp(tags) {
	const tagsJoined = tags.join('|')

	return new RegExp(`(<(${tagsJoined})(?: [\\w ]+(?:=[^<>]+?)?| *)>)([^]*?)(</\\2>)`, 'ig')
}

/**
 * Replace HTML comments (`<!-- -->`), `<nowiki>`, `<syntaxhighlight>`, `<source>`, and `<pre>` tags
 * content, left-to-right and right-to-left marks, and also newlines inside some tags (`<br\n>`) in
 * the code with spaces.
 *
 * This is used to ignore comment contents (there could be section code examples for novices there
 * that could confuse search results) but get right positions and code in the result.
 *
 * @param {string} code
 * @returns {string}
 */
export function maskDistractingCode(code) {
	return code
		.replace(
			generateTagsRegexp(['nowiki', 'syntaxhighlight', 'source', 'pre']),
			/** @type {ReplaceCallback} */ (_s, before, _tagName, content, after) =>
				before + ' '.repeat(content.length) + after,
		)
		.replace(
			/<!--([^]*?)-->/g,
			/** @type {ReplaceCallback} */ (_s, content) =>
				'\u0001' + ' '.repeat(content.length + 5) + '\u0002',
		)
		.replace(/[\u200E\u200F]/g, () => ' ')
		.replace(
			/(<\/?(?:br|p)\b.*)(\n+)(>)/g,
			/** @type {ReplaceCallback} */ (_s, before, newline, after) =>
				before + ' '.repeat(newline.length) + after,
		)
}

/**
 * Remove certain kinds of wiki markup from code, such as formatting, links, tags, and comments.
 * Also replace multiple spaces with one and trim the input. The product of this function is usually
 * not for display (for example, it just removes template names making the resulting code look
 * silly), but for comparing purposes.
 *
 * @param {string} code
 * @returns {string}
 */
export function removeWikiMarkup(code) {
	// Ideally, only text from images in the `thumb` format should be captured, because in the
	// standard format the text is not displayed. See img_thumbnail in
	// https://ru.wikipedia.org/w/api.php?action=query&meta=siteinfo&siprop=magicwords&formatversion=2.
	// Unfortunately, that would add like 100ms to the server's response time. So, we use it if it is
	// present in the config file.
	// eslint-disable-next-line no-one-time-vars/no-one-time-vars
	const fileEmbedRegexp = new RegExp(
		`\\[\\[${cd.g.filePrefixPattern}[^\\]]+?(?:\\|[^\\]]+?\\| *((?:\\[\\[[^\\]]+?\\]\\]|[^|\\]])+))? *\\]\\]`,
		'ig',
	)

	return (
		code
			// Remove comments
			.replace(/<!--[^]*?-->/g, '')

			// Remove text hidden by the script (for example, in wikitext.maskDistractingCode)
			.replace(/\u0001 *\u0002/g, '')

			// Pipe trick
			.replace(cd.g.pipeTrickRegexp, '$1$2$3')

			// Extract displayed text from file embeddings
			.replace(fileEmbedRegexp, (s, m) => (cd.g.isThumbRegexp.test(s) ? m : ''))

			// Extract displayed text from [[wikilinks]]
			.replace(/\[\[:?(?:[^|[\]<>\n]+\|)?(.+?)\]\]/g, '$1')

			// For optimization purposes, remove template names
			.replace(/\{\{:?(?:[^|{}<>\n]+)(?:\|(.+?))?\}\}/g, '$1')

			// Extract displayed text from [links]
			.replace(/\[https?:\/\/[^[\]<>"\n ]+ *([^\]]*)\]/g, '$1')

			// Remove bold
			.replace(/'''(.+?)'''/g, '$1')

			// Remove italics
			.replace(/''(.+?)''/g, '$1')

			// Replace <br> with a space
			.replace(/<br ?\/?>/g, ' ')

			// Remove opening and self-closing tags (won't work with <smth param=">">, but the native parser
			// fails too).
			.replace(/<\w+(?: [\w ]+(?:=[^<>]+?)?| *\/?)>/g, '')

			// Remove closing tags
			.replace(/<\/\w+(?: [\w ]+)? *>/g, '')

			// Replace multiple spaces with one space
			.replace(/ {2,}/g, ' ')

			.trim()
	)
}

/**
 * Replace HTML entities with corresponding characters. Also replace different kinds of spaces,
 * including multiple, with one normal space.
 *
 * @param {string} text
 * @returns {string}
 */
export function normalizeCode(text) {
	return decodeHtmlEntities(text).replace(/\s+/g, ' ').trim()
}

/**
 * Encode text to put it in a `[[wikilink]]`. This is meant for section links as the characters that
 * this function encodes are forbidden in page titles anyway, so page titles containing them are not
 * valid titles.
 *
 * @param {string} link
 * @returns {string}
 */
export function encodeWikilink(link) {
	return link
		.replace(/<(\w+(?: [\w ]+(?:=[^<>]+?)?| *\/?)|\/\w+(?: [\w ]+)? *)>/g, '%3C$1%3E')
		.replace(/\[/g, '%5B')
		.replace(/\]/g, '%5D')
		.replace(/\{/g, '%7B')
		.replace(/\|/g, '%7C')
		.replace(/\}/g, '%7D')
		.replace(/\s+/g, ' ')
}

/**
 * Modify a string or leave it unchanged so that is has two newlines at the end of it. (Meant for
 * section wikitext.)
 *
 * @param {string} code
 * @returns {string}
 */
export function endWithTwoNewlines(code) {
	return code.replace(/([^\n])\n?$/, '$1\n\n')
}

/**
 * Replace `<br>`s with `\n`, except in list elements and `<pre>`'s created by a space starting a
 * line.
 *
 * @param {string} code
 * @param {string} replacement
 * @returns {string}
 */
export function brsToNewlines(code, replacement = '\n') {
	return code.replace(/^(?![:*# ]).*<br[ \n]*\/?>.*$/gim, (s) =>
		s.replace(/<br[ \n]*\/?>(?![:*#;])\n? */gi, () => replacement),
	)
}

/**
 * Mask links that have `|`, replace `|` with `{{!}}`, unmask links. If `maskedTexts` is not
 * provided, sensitive code will be masked as well.
 *
 * Also masks bare `{` and `}` that weren't identified as part of other markup (e.g. try quoting the
 * sentence "Или держал в голове то, что практика использования {{doc/begin}} ... делали </div>
 * вместо шаблона." in
 * https://ru.wikipedia.org/wiki/User_talk:Jack_who_built_the_house#c-Jack_who_built_the_house-2020-03-22T12:18:00.000Z-DonRumata-2020-03-22T11:05:00.000Z
 * - "</div>" screws everything up.)
 *
 * @param {string} code
 * @param {string[]} [maskedTexts]
 * @returns {string}
 */
export function escapePipesOutsideLinks(code, maskedTexts) {
	const textMasker = new TextMasker(code, maskedTexts)
	if (!maskedTexts) {
		textMasker.maskSensitiveCode()
	}

	return textMasker
		.mask(/\[\[[^\]|]+\|/g, 'link')
		.withText((text) =>
			text.replace(/\{/g, '&#123;').replace(/\}/g, '&#125;').replace(/\|/g, '{{!}}'),
		)
		.unmask(maskedTexts ? 'link' : undefined)
		.getText()
}

/**
 * Given a string, not necessarily with arabic numerals, and a set of digits in the target language,
 * extract the digits and convert them to a number.
 *
 * @param {string} string
 * @param {string} [digits]
 * @returns {number}
 */
export function extractNumeralAndConvertToNumber(string, digits = '0123456789') {
	return Number(
		string
			// Remove non-digits
			.replace(new RegExp(`[^${digits}]`, 'g'), '')

			.replace(new RegExp(`[${digits}]`, 'g'), (s) => String(digits.indexOf(s))),
	)
}

/**
 * Escape equals signs in text by replacing them with `{{=}}` template syntax.
 * This is used when passing text as template parameters to prevent equals signs
 * from being interpreted as parameter separators.
 *
 * @param {string} text
 * @returns {string}
 */
export function escapeEqualsInTemplate(text) {
	return text.replace(/=/g, '{{=}}')
}

/**
 * Encode a link label for use in wikilinks by escaping special characters.
 *
 * @param {string} label
 * @returns {string}
 */
export function encodeLinkLabel(label) {
	return label
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/\[/g, '&#91;')
		.replace(/\]/g, '&#93;')
}
