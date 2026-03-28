/**
 * Module for URL-related tasks on page load, including scrolling to the target comment if needed,
 * and showing a notification if the target comment or section is not found, optionally searching in
 * the archive.
 *
 * @module processUrl
 */

import Comment from './Comment'
import commentManager from './commentManager'
import cd from './loader/cd'
import sectionManager from './sectionManager'
import { defined, sleep, underlinesToSpaces } from './shared/utils-general'
import { removeWikiMarkup } from './shared/utils-wikitext'
import { formatDateNative } from './utils-date'
import { isExistentAnchor, wrapHtml } from './utils-window'

/**
 * @typedef {object} SearchResult
 * @property {string} snippet
 * @property {string} title
 * @property {string} [sectiontitle]
 */

/** @type {SearchResult[]} */
let searchResults

/**
 * Highlight new comments based on URL parameters.
 *
 * @param {boolean} [noScroll] Don't scroll to the topmost highlighted comment.
 * @private
 */
function highlightNewComments(noScroll = false) {
	const url = new URL(location.href)
	const newCommentIds = url.searchParams.get('dtnewcomments')?.split('|') || []
	const newCommentsSinceId = url.searchParams.get('dtnewcommentssince')
	const inThread = url.searchParams.get('dtinthread')
	const sinceThread = url.searchParams.get('dtsincethread')

	/** @type {Comment[]} */
	const commentsToHighlight = []

	if (newCommentsSinceId) {
		const newCommentsSince = commentManager.getByDtId(newCommentsSinceId)
		if (newCommentsSince?.date) {
			const sinceTimestamp = newCommentsSince.date.getTime()
			const commentsToCheck = inThread
				? newCommentsSince.section
					? newCommentsSince.section.comments
					: [newCommentsSince, ...newCommentsSince.getChildren(true)]
				: commentManager.getAll()

			commentsToCheck.forEach((comment) => {
				if (comment.date && comment.date.getTime() >= sinceTimestamp) {
					if (sinceThread) {
						// Check that we are in a thread that is newer than sinceTimestamp
						// Thread age is determined by looking at the oldest comment
						const section = comment.section
						if (section) {
							const oldestComment = section.oldestComment
							if (!(oldestComment?.date && oldestComment.date.getTime() >= sinceTimestamp)) {
								return
							}
						}
					}
					commentsToHighlight.push(comment)
				}
			})
		}
	}

	// Add explicitly specified comment IDs
	if (newCommentIds.length) {
		newCommentIds.forEach((id) => {
			const comment = commentManager.getByDtId(id)
			if (comment && !commentsToHighlight.includes(comment)) {
				commentsToHighlight.push(comment)
			}
		})
	}

	// Highlight and scroll to the first comment
	if (commentsToHighlight.length) {
		commentsToHighlight.forEach((comment, index) => {
			markCommentAsLinked(comment, !noScroll && index === 0)
		})
	}
}

/**
 * Get a comment from the URL fragment.
 *
 * @returns {string | undefined}
 * @private
 */
function getFragment() {
	const value = location.hash.slice(1)
	let decodedValue
	try {
		decodedValue = decodeURIComponent(value)
	} catch (error) {
		cd.debug.logError(error)
	}

	return decodedValue
}

/**
 * Get a comment from the URL fragment.
 *
 * @param {string} fragment
 * @returns {{ comment: Comment | undefined, date: Date | undefined, author: string | undefined }}
 */
function getCommentFromFragment(fragment) {
	let commentId
	let date
	let author
	if (Comment.isId(fragment)) {
		commentId = fragment
	}

	/**
	 * @type {Comment | undefined}
	 */
	let comment
	if (commentId) {
		;({ date, author } = Comment.parseId(commentId) || {})
		comment = commentManager.getById(commentId, true)
	} else if (fragment) {
		;({ comment, date, author } = commentManager.getByDtId(fragment, true) || {})
	}

	return { comment, date, author }
}

/**
 * Mark a comment as linked and scroll to it.
 *
 * @param {Comment} comment
 * @param {boolean} [scroll] Whether to scroll to the comment.
 * @private
 */
function markCommentAsLinked(comment, scroll = true) {
	// sleep() is for Firefox - for some reason, without it Firefox positions the underlay
	// incorrectly. (TODO: does it still? Need to check.)
	sleep().then(() => {
		if (scroll) {
			comment.scrollTo({
				smooth: false,
				expandThreads: true,
				flash: false,
			})
		}

		comment.markAsLinked()

		// Replace CD's comment ID in the fragment with DiscussionTools' if available. In any case,
		// add the state.
		history.replaceState(
			{ ...history.state, cdTargetComment: false, cdLinkedComment: true },
			'',
			comment.dtId ? `#${comment.dtId}` : undefined,
		)
	})
}

/**
 * _For internal use._ Perform URL fragment-related tasks.
 */
export default function processFragment() {
	const fragment = getFragment()
	let comment
	let date
	let author
	if (fragment) {
		;({ comment, date, author } = getCommentFromFragment(fragment))
	}
	handleComments(comment)

	if (
		fragment &&
		!cd.page.isArchive() &&
		// Try to find the target
		!(
			comment ||
			cd.config.idleFragments.some((regexp) => fragment.match(regexp)) ||
			// `/media/` is from MediaViewer, `noticeApplied` is from RedWarn
			/^\/media\/|^noticeApplied-|^h-/.test(fragment) ||
			$(':target').length ||
			isExistentAnchor(location.hash.slice(1)) ||
			isExistentAnchor(fragment)
		)
	) {
		maybeNotifyNotFound({ fragment, date, author })
	}
}

/**
 * _For internal use._ Handle URL parts related to comments.
 *
 * @param {Comment} [comment]
 */
function handleComments(comment) {
	if (comment) {
		markCommentAsLinked(comment)
	} else {
		// Handle URL parameters for highlighting multiple comments
		highlightNewComments()
	}
}

/**
 * _For internal use._ Handle URL parameters for highlighting comments (e.g., on popstate).
 *
 * @param {boolean} [noScroll] Don't scroll to the topmost highlighted comment.
 */
export function processUrlParameters(noScroll = false) {
	highlightNewComments(noScroll)
}

/**
 * Show a notification that a section/comment was not found, a link to search in the archive, a
 * link to the section/comment if it was found automatically, and/or a link to a section found
 * with a similar name or a comment found with the closest date in the past.
 *
 * @param {object} options
 * @param {string} options.fragment
 * @param {Date} [options.date]
 * @param {string} [options.author]
 * @private
 */
function maybeNotifyNotFound({ fragment, date, author }) {
	let label
	let guessedCommentText = ''
	let guessedSectionText = ''
	/** @type {string | undefined} */
	let sectionName

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
		sectionName = underlinesToSpaces(fragment)
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
		searchForNotFoundItem({ fragment, sectionName, date, guessedCommentText, guessedSectionText })
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
 * @param {object} options
 * @param {string} options.fragment
 * @param {Date} [options.date]
 * @param {string} [options.sectionName]
 * @param {string} options.guessedCommentText
 * @param {string} options.guessedSectionText
 * @private
 */
async function searchForNotFoundItem({
	fragment,
	date,
	sectionName,
	guessedCommentText,
	guessedSectionText,
}) {
	const token = date
		? formatDateNative(date, false, cd.g.timestampTools.content.timezone)
		: /** @type {string} */ (sectionName).replace(/"/g, '')
	let searchQuery = `"${token}"`

	/** @type {string | undefined} */
	let sectionNameDotDecoded

	if (sectionName) {
		try {
			sectionNameDotDecoded = decodeURIComponent(sectionName.replace(/\.([0-9A-F]{2})/g, '%$1'))
		} catch {
			// Empty
		}

		if (sectionNameDotDecoded && sectionName !== sectionNameDotDecoded) {
			const tokenDotDecoded = sectionNameDotDecoded.replace(/"/g, '')
			searchQuery += ` OR "${tokenDotDecoded}"`
		}
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

	notifyAboutSearchResults({
		fragment,
		date,
		sectionName,
		sectionNameDotDecoded,
		token,
		searchQuery,
		guessedCommentText,
		guessedSectionText,
	})
}

/**
 * Show an "Item not found" notification.
 *
 * @param {object} options
 * @param {string} options.fragment
 * @param {string} [options.sectionName]
 * @param {string} [options.sectionNameDotDecoded]
 * @param {string} options.token
 * @param {string} options.searchQuery
 * @param {Date | undefined} options.date
 * @param {string} options.guessedCommentText
 * @param {string} options.guessedSectionText
 * @private
 */
function notifyAboutSearchResults({
	fragment,
	sectionName,
	sectionNameDotDecoded,
	token,
	searchQuery,
	date,
	guessedCommentText,
	guessedSectionText,
}) {
	const searchUrl =
		cd.g.server +
		mw.util.getUrl('Special:Search', {
			search: searchQuery,
			sort: 'create_timestamp_desc',
			cdcomment: date && fragment,
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
							(guessedSectionText && /** @type {string} */ (sectionName).includes('{{')
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
			const targetFragment = /** @type {string} */ (date ? fragment : sectionNameFound)
			const wikilink = `${exactMatchPageTitle}#${targetFragment}`
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
