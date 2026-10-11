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
 * @property {string[]} [carriedOverUnreadIds] IDs of the comments unread when the previous boot
 *   ended; absent on a first boot, where the unread and old comments come from sessionStorage.
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
 * A change on the new/old axis.
 *
 * @typedef {VisitStart} NewOldChange
 */

/**
 * @typedef {object} EventMap
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
	 * Start a visit: apply the read status rules to the comments. Call
	 * {@link ReadStatus#announceVisitStart} once the returned visits are saved.
	 *
	 * @param {VisitStartOptions} options
	 * @returns {string[]} Visits to save.
	 */
	startVisit({ comments, visits: rememberedVisits, currentTime, markAsRead, carriedOverUnreadIds }) {
		const visits = this.forgetVisits(rememberedVisits, currentTime, markAsRead)
		const timeConflict =
			visits.length > 0 &&
			this.applyRules(comments, visits, currentTime, markAsRead, carriedOverUnreadIds)
		this.previousVisitTime = visits.length ? Number(visits.at(-1)) : undefined

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
	 * @param {string[]} [carriedOverUnreadIds]
	 * @returns {boolean} Whether a comment is dated in the minute of the current time (a time
	 *   conflict).
	 * @private
	 */
	applyRules(comments, visits, currentTime, markAsRead, carriedOverUnreadIds) {
		const isFirstBoot = !carriedOverUnreadIds
		const unreadIds = markAsRead ? [] : (carriedOverUnreadIds ?? this.loadIds('unreadComments'))
		const oldIds = isFirstBoot ? this.loadIds('oldComments') : []
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
		this.saveUnread(comments)

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
	 * _For internal use._ Store the IDs of the unread comments among the page's comments in
	 * sessionStorage.
	 *
	 * @param {ReadStatusComment[]} comments
	 */
	saveUnread(comments) {
		this.saveIds(
			'unreadComments',
			comments.filter((comment) => comment.isRead() === false),
		)
	}

	/**
	 * _For internal use._ Store the IDs of the old comments among the page's comments in
	 * sessionStorage.
	 *
	 * @param {ReadStatusComment[]} comments
	 */
	saveOld(comments) {
		this.saveIds(
			'oldComments',
			comments.filter((comment) => !comment.hasFlag('new')),
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
