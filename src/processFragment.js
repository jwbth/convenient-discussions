/**
 * Module for URL fragment-related tasks on page load, including scrolling to the target comment if
 * needed, and showing a notification if the target comment or section is not found, optionally
 * searching in the archive.
 *
 * @module processFragment
 */

import Comment from './Comment'
import commentManager from './commentManager'
import cd from './loader/cd'
import sectionManager from './sectionManager'
import { defined, sleep, underlinesToSpaces } from './shared/utils-general'
import { removeWikiMarkup } from './shared/utils-wikitext'
import { formatDateNative } from './utils-date'
import { isExistentAnchor, wrapHtml } from './utils-window'

/** @type {string} */
let decodedValue
/** @type {Date | undefined} */
let date
/** @type {string | undefined} */
let author
/** @type {string} */
let guessedCommentText
/** @type {string} */
let guessedSectionText
/** @type {string} */
let sectionName
/** @type {string} */
let sectionNameDotDecoded
/** @type {string} */
let token
/** @type {string} */
let searchQuery

/**
 * @typedef {object} SearchResult
 * @property {string} snippet
 * @property {string} title
 * @property {string} [sectiontitle]
 */

/** @type {SearchResult[]} */
let searchResults

/**
 * _For internal use._ Perform URL fragment-related tasks.
 */
export default function processFragment() {
	const value = location.hash.slice(1)
	let commentId
	try {
		decodedValue = decodeURIComponent(value)
		if (Comment.isId(value)) {
			commentId = decodedValue
		}
	} catch (error) {
		cd.debug.logError(error)
	}

	/**
	 * @type {Comment | undefined}
	 */
	let comment
	if (commentId) {
		;({ date, author } = Comment.parseId(commentId) || {})
		comment = commentManager.getById(commentId, true)
	} else if (decodedValue) {
		;({ comment, date, author } = commentManager.getByDtId(decodedValue, true) || {})
	}

	if (comment) {
		// sleep() is for Firefox - for some reason, without it Firefox positions the underlay
		// incorrectly. (TODO: does it still? Need to check.)
		sleep().then(() => {
			comment.scrollTo({
				smooth: false,
				expandThreads: true,
			})

			// Replace CD's comment ID in the fragment with DiscussionTools' if available.
			history.replaceState(
				{ ...history.state, cdJumpedToComment: true },
				'',
				comment.dtId ? `#${comment.dtId}` : undefined,
			)
		})
	}

	if (
		decodedValue &&
		!cd.page.isArchive() &&
		// Try to find the target
		!(
			comment ||
			cd.config.idleFragments.some((regexp) => decodedValue.match(regexp)) ||
			// `/media/` is from MediaViewer, `noticeApplied` is from RedWarn
			/^\/media\/|^noticeApplied-|^h-/.test(decodedValue) ||
			$(':target').length ||
			isExistentAnchor(value) ||
			isExistentAnchor(decodedValue)
		)
	) {
		maybeNotifyNotFound()
	}
}

/**
 * Show a notification that a section/comment was not found, a link to search in the archive, a
 * link to the section/comment if it was found automatically, and/or a link to a section found
 * with a similar name or a comment found with the closest date in the past.
 *
 * @private
 */
function maybeNotifyNotFound() {
	let label
	guessedCommentText = ''
	guessedSectionText = ''

	if (date && author) {
		label = cd.sParse('deadanchor-comment-lead')
		const priorComment = /** @type {Comment & { id: string } | undefined} */ (
			commentManager.findPriorComment(date, author)
		)
		if (priorComment) {
			guessedCommentText = (' ' + cd.sParse('deadanchor-comment-previous', '#' + priorComment.id))
				// Until https://phabricator.wikimedia.org/T288415 is online on most wikis.
				.replace(cd.g.articlePathRegexp, '$1')
			label += guessedCommentText
		}
	} else {
		sectionName = underlinesToSpaces(decodedValue)
		label =
			cd.sParse('deadanchor-section-lead', sectionName) +
			' ' +
			cd.sParse('deadanchor-section-reason')
		const sectionMatch = sectionManager.findByHeadlineParts(sectionName)
		if (sectionMatch) {
			guessedSectionText = (
				' ' + cd.sParse('deadanchor-section-similar', '#' + sectionMatch.id, sectionMatch.headline)
			)
				// Until https://phabricator.wikimedia.org/T288415 is online on most wikis.
				.replace(cd.g.articlePathRegexp, '$1')
			label += guessedSectionText
		}
	}

	if (cd.page.canHaveArchives()) {
		searchForNotFoundItem()
	} else {
		mw.notify(wrapHtml(label), {
			type: 'warn',
			autoHideSeconds: 'long',
		})
	}
}

/**
 * Make a search request and show an "Item not found" notification.
 *
 * @private
 */
async function searchForNotFoundItem() {
	token = date
		? formatDateNative(date, false, cd.g.timestampTools.content.timezone)
		: sectionName.replace(/"/g, '')
	searchQuery = `"${token}"`

	if (!date) {
		try {
			sectionNameDotDecoded = decodeURIComponent(sectionName.replace(/\.([0-9A-F]{2})/g, '%$1'))
		} catch {
			// Empty
		}
	}
	if (sectionName && sectionName !== sectionNameDotDecoded) {
		const tokenDotDecoded = sectionNameDotDecoded.replace(/"/g, '')
		searchQuery += ` OR "${tokenDotDecoded}"`
	}

	if (date) {
		// There can be a time difference between the time we know (taken from the history) and the
		// time on the page. We take it to be not more than 3 minutes for the time on the page.
		for (let gap = 1; gap <= 3; gap++) {
			const adjustedToken = formatDateNative(
				new Date(date.getTime() - cd.g.msInMin * gap),
				false,
				cd.g.timestampTools.content.timezone,
			)
			searchQuery += ` OR "${adjustedToken}"`
		}
	}
	const archivePrefix = cd.page.getArchivePrefix()
	if (archivePrefix) {
		searchQuery += ` prefix:${archivePrefix}`
	}

	const response = await cd.getApi().get({
		action: 'query',
		list: 'search',
		srsearch: searchQuery,
		srprop: date ? undefined : 'sectiontitle',

		// List more recent archives first
		srsort: 'create_timestamp_desc',

		srlimit: 20,
	})
	searchResults = response.query?.search

	notifyAboutSearchResults()
}

/**
 * Show an "Item not found" notification.
 *
 * @private
 */
function notifyAboutSearchResults() {
	const searchUrl =
		cd.g.server +
		mw.util.getUrl('Special:Search', {
			search: searchQuery,
			sort: 'create_timestamp_desc',
			cdcomment: date && decodedValue,
		})

	if (searchResults.length === 0) {
		mw.notify(
			wrapHtml(
				date
					? cd.sParse('deadanchor-comment-lead') +
							' ' +
							cd.sParse('deadanchor-comment-notfound', searchUrl) +
							guessedCommentText
					: cd.sParse('deadanchor-section-lead', sectionName) +
							(guessedSectionText && sectionName.includes('{{')
								? // Use of a template in the section title. In such a case, it's almost always the real
									// match, so we don't show any fail messages.
									''
								: ' ' +
									cd.sParse('deadanchor-section-notfound', searchUrl) +
									' ' +
									cd.sParse('deadanchor-section-reason', searchUrl)) +
							guessedSectionText,
			),
			{
				type: 'warn',
				autoHideSeconds: 'long',
			},
		)
	} else {
		let exactMatchPageTitle

		// Will be either sectionName or sectionNameDotDecoded.
		let sectionNameFound = sectionName

		if (date) {
			const matches = Object.entries(searchResults)
				.map(([, result]) => result)
				.filter((result) => result.snippet && removeWikiMarkup(result.snippet).includes(token))
			if (matches.length === 1) {
				exactMatchPageTitle = matches[0].title
			}
		} else {
			// Obtain the first exact section title match (which would be from the most recent archive).
			// This loop iterates over just one item in the vast majority of cases.
			const exactMatch = Object.entries(searchResults)
				.map(([, result]) => result)
				.find(
					(result) =>
						result.sectiontitle &&
						[sectionName, sectionNameDotDecoded].filter(defined).includes(result.sectiontitle),
				)
			if (exactMatch) {
				exactMatchPageTitle = exactMatch.title
				sectionNameFound = underlinesToSpaces(/** @type {string} */ (exactMatch.sectiontitle))
			}
		}

		let label
		if (exactMatchPageTitle) {
			const fragment = date ? decodedValue : sectionNameFound
			const wikilink = `${exactMatchPageTitle}#${fragment}`
			label = date
				? cd.sParse('deadanchor-comment-exactmatch', wikilink, searchUrl) + guessedCommentText
				: cd.sParse('deadanchor-section-exactmatch', sectionNameFound, wikilink, searchUrl)
		} else {
			label = date
				? cd.sParse('deadanchor-comment-inexactmatch', searchUrl) + guessedCommentText
				: cd.sParse('deadanchor-section-inexactmatch', sectionNameFound, searchUrl)
		}

		mw.notify(wrapHtml(label), {
			type: 'warn',
			autoHideSeconds: 'long',
		})
	}
}
