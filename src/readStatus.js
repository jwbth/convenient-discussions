import EventEmitter from './EventEmitter'
import SessionStorageItemWithKeys from './SessionStorageItemWithKeys'
import cd from './loader/cd'
import { defined } from './shared/utils-general'

/**
 * What the read status module reads and writes on a comment.
 *
 * @typedef {Pick<
 *   import('./Comment').default,
 *   'id' | 'date' | 'isRead' | 'setRead' | 'hasFlag' | 'addFlag' | 'removeFlag'
 * >} ReadStatusComment
 */

/**
 * @typedef {object} VisitStartOptions
 * @property {ReadStatusComment[]} comments Comments on the page.
 * @property {string[]} visits Remembered visits to the page, as Unix times in seconds, oldest first.
 * @property {number} currentTime Unix time in seconds.
 * @property {boolean} markAsRead Whether the user requested to make every comment shown so far read
 *   and old.
 */

/**
 * @param {ReadStatusComment} comment
 * @returns {number | undefined}
 */
const getUnixTime = (comment) => comment.date && Math.floor(comment.date.getTime() / 1000)

/**
 * The start of a visit, on the new/old axis.
 *
 * @typedef {object} VisitStart
 * @property {'visitStart'} type
 * @property {number} [previousVisitTime] Unix time in seconds of the latest remembered visit before
 *   this one.
 */

/**
 * Comments made old with "Mark as read".
 *
 * @typedef {object} MarkAsRead
 * @property {'markAsRead'} type
 * @property {ReadStatusComment[]} comments
 */

/**
 * A change on the new/old axis.
 *
 * @typedef {VisitStart | MarkAsRead} NewOldChange
 */

/**
 * @typedef {object} EventMap
 * @property {[]} readUnread
 * @property {[NewOldChange]} newOld
 */

/**
 * Singleton that is the only writer of read status.
 *
 * @augments EventEmitter<EventMap>
 */
class ReadStatus extends EventEmitter {
	/**
	 * Unix time in seconds of the latest remembered visit before the started one.
	 *
	 * @type {number | undefined}
	 * @private
	 */
	previousVisitTime

	/**
	 * Comments on the page at the started visit.
	 *
	 * @type {ReadStatusComment[]}
	 * @private
	 */
	comments = []

	/**
	 * Comments unread at the start of the visit and not made old since.
	 *
	 * @type {Set<ReadStatusComment>}
	 * @private
	 */
	unreadAtLoad = new Set()

	/**
	 * Whether each comment marked as changed was read before its first change.
	 *
	 * @type {Map<ReadStatusComment, boolean | undefined>}
	 * @private
	 */
	readBeforeChange = new Map()

	/**
	 * Start a visit: apply the read status rules to the comments, keeping the unread and old comments
	 * stored in sessionStorage, whether the page was booted anew, rebooted, or reloaded. Call
	 * {@link ReadStatus#announceVisitStart} once the returned visits are saved.
	 *
	 * @param {VisitStartOptions} options
	 * @returns {string[]} Visits to save.
	 */
	startVisit({ comments, visits: rememberedVisits, currentTime, markAsRead }) {
		this.comments = comments
		this.readBeforeChange = new Map()
		const visits = this.forgetVisits(rememberedVisits, currentTime, markAsRead)
		const timeConflict =
			visits.length > 0 &&
			this.applyRules(comments, visits, currentTime, markAsRead)
		this.previousVisitTime = visits.length ? Number(visits.at(-1)) : undefined
		this.unreadAtLoad = new Set(comments.filter((comment) => comment.isRead() === false))

		// (Nearly) eliminate the possibility that we will wrongfully mark a read comment as unread/new
		// at the next page load by adding a minute to the visit time if there is at least one comment
		// posted at the same minute. If instead we required the comment time to be less than the
		// current time to be highlighted, it would result in missed comments if the comment was posted
		// at the same minute as our visit but after that moment.
		//
		// We sacrifice the chance that sometimes we will wrongfully mark an unread comment as read -
		// but for that,
		// * one comment should be added at the same minute as our visit but earlier;
		// * another comment should be added at the same minute as our visit but later.
		//
		// We could decide that not marking unread comments as read is an absolute priority and remove
		// the time conflict stuff.
		return [...visits, String(currentTime + (timeConflict ? 60 : 0))]
	}

	/**
	 * Announce the visit started with {@link ReadStatus#startVisit}.
	 *
	 * @fires newCommentsHighlighted
	 */
	announceVisitStart() {
		this.emit('newOld', { type: 'visitStart', previousVisitTime: this.previousVisitTime })

		/**
		 * New comments have been highlighted.
		 *
		 * @event newCommentsHighlighted
		 * @param {object} cd {@link convenientDiscussions} object.
		 */
		mw.hook('convenientDiscussions.newCommentsHighlighted').fire(cd)
	}

	/**
	 * Set the comments' read status given the visits.
	 *
	 * @param {ReadStatusComment[]} comments
	 * @param {string[]} visits At least one.
	 * @param {number} currentTime
	 * @param {boolean} markAsRead
	 * @returns {boolean} Whether a comment is dated in the minute of the current time (a time
	 *   conflict).
	 * @private
	 */
	applyRules(comments, visits, currentTime, markAsRead) {
		const unreadIds = markAsRead ? [] : this.loadIds('unreadComments')
		const oldIds = this.loadIds('oldComments')
		comments.forEach((comment) => {
			const commentTime = getUnixTime(comment)

			// Let's take 3 minutes as a tolerable time discrepancy.
			if (commentTime === undefined || commentTime > currentTime + 3 * 60) {
				comment.removeFlag('new', false)
				comment.setRead(true)

				return
			}

			const restoredUnread = Boolean(comment.id && unreadIds.includes(comment.id))
			const restoredOld = Boolean(comment.id && oldIds.includes(comment.id))

			// Add 60 seconds to the comment time because it doesn't have seconds whereas the visit time
			// has. See also the time conflict in startVisit(). A comment restored as unread can predate the
			// earliest visit if it was changed; it is new nonetheless.
			if (!restoredOld && (commentTime + 60 > Number(visits[0]) || restoredUnread)) {
				comment.addFlag('new', false)
			} else {
				comment.removeFlag('new', false)
			}
			comment.setRead(
				(commentTime + 60 <= Number(visits.at(-1)) || comment.hasFlag('own')) && !restoredUnread,
			)
		})
		this.saveUnread()

		return comments.some((comment) => {
			const commentTime = getUnixTime(comment)

			return (
				commentTime !== undefined && commentTime <= currentTime && currentTime < commentTime + 60
			)
		})
	}

	/**
	 * Load the IDs of the page's comments stored under a sessionStorage key.
	 *
	 * @param {'unreadComments' | 'oldComments'} key
	 * @returns {string[]}
	 * @private
	 */
	loadIds(key) {
		const articleId = mw.config.get('wgArticleId')

		return (articleId && new SessionStorageItemWithKeys(key).get(articleId)) || []
	}

	/**
	 * Register that a comment came into view: make it read if it is unread.
	 *
	 * @param {ReadStatusComment} comment
	 * @returns {boolean} Whether the comment became read.
	 */
	registerInView(comment) {
		if (comment.isRead() !== false) {
			return false
		}

		this.setRead([comment], true)

		return true
	}

	/**
	 * Make comments read and old (a section's "Mark as read").
	 *
	 * @param {ReadStatusComment[]} comments
	 */
	markAsRead(comments) {
		this.setRead(comments, true)
		comments.forEach((comment) => {
			comment.removeFlag('new')
			this.unreadAtLoad.delete(comment)
		})
		this.saveOld()
		this.emit('newOld', { type: 'markAsRead', comments })
	}

	/**
	 * Get the comments unread at the start of the visit and not made old since, in page order.
	 *
	 * @returns {ReadStatusComment[]}
	 */
	getUnreadAtLoad() {
		return [...this.unreadAtLoad]
	}

	/**
	 * Check whether a comment was unread at the start of the visit and hasn't been made old since.
	 *
	 * @param {ReadStatusComment} comment
	 * @returns {boolean}
	 */
	isUnreadAtLoad(comment) {
		return this.unreadAtLoad.has(comment)
	}

	/**
	 * Make comments read, keeping them new ("Mark the thread as read").
	 *
	 * @param {ReadStatusComment[]} comments
	 */
	markThreadAsRead(comments) {
		this.setRead(comments, true)
	}

	/**
	 * Register that a comment was changed: make it unread if edits count as new comments.
	 *
	 * @param {ReadStatusComment} comment
	 */
	markAsChanged(comment) {
		if (!cd.settings.get('countEditsAsNewComments')) return

		if (!this.readBeforeChange.has(comment)) {
			this.readBeforeChange.set(comment, comment.isRead())
		}
		this.setRead([comment], false)
	}

	/**
	 * Register that a comment's change was undone: make it read again if it was read before the
	 * change and hasn't been read since.
	 *
	 * @param {ReadStatusComment} comment
	 */
	unmarkAsChanged(comment) {
		if (!cd.settings.get('countEditsAsNewComments')) return

		const readBefore = this.readBeforeChange.get(comment)
		this.readBeforeChange.delete(comment)
		if (readBefore) {
			this.setRead([comment], true)
		}
	}

	/**
	 * Set the comments' read field, store the unread comments, and announce the change if there is
	 * one.
	 *
	 * @param {ReadStatusComment[]} comments
	 * @param {boolean} value
	 * @private
	 */
	setRead(comments, value) {
		const changed = comments.filter((comment) => comment.isRead() !== value)
		if (!changed.length) return

		changed.forEach((comment) => {
			comment.setRead(value)
		})
		this.saveUnread()
		this.emit('readUnread')
	}

	/**
	 * Store the IDs of the page's unread comments in sessionStorage.
	 *
	 * @private
	 */
	saveUnread() {
		this.saveIds(
			'unreadComments',
			this.comments.filter((comment) => comment.isRead() === false),
		)
	}

	/**
	 * Store the IDs of the page's old comments in sessionStorage.
	 *
	 * @private
	 */
	saveOld() {
		this.saveIds(
			'oldComments',
			this.comments.filter((comment) => !comment.hasFlag('new')),
		)
	}

	/**
	 * @param {'unreadComments' | 'oldComments'} key
	 * @param {ReadStatusComment[]} comments
	 * @private
	 */
	saveIds(key, comments) {
		const articleId = mw.config.get('wgArticleId')
		if (!articleId) return

		const ids = comments.map((comment) => comment.id).filter(defined)
		const storageItem = new SessionStorageItemWithKeys(key)
		if (ids.length) {
			storageItem.set(articleId, ids).save()
		} else {
			storageItem.remove(articleId).save()
		}
	}

	/**
	 * Forget visits before the latest one older than the highlight interval, or all but the latest
	 * one on a mark-as-read refresh.
	 *
	 * @param {string[]} visits
	 * @param {number} currentTime
	 * @param {boolean} markAsRead
	 * @returns {string[]}
	 * @private
	 */
	forgetVisits(visits, currentTime, markAsRead) {
		const interval = cd.settings.get('highlightNewInterval')
		const firstKeptIndex = visits.findLastIndex(
			(visit) =>
				Number(visit) < currentTime - 60 * interval ||
				// Keeping only the latest visit also covers rare cases when it is later than the current
				// time (see the time conflict in startVisit()): with the interval of 0, the user shouldn't
				// get comments highlighted again all of a sudden.
				!interval ||
				markAsRead,
		)

		return visits.slice(Math.max(firstKeptIndex, 0))
	}
}

export default new ReadStatus()
