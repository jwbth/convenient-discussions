import { describe, test, expect, beforeEach } from 'vitest'

import readStatus from '../src/readStatus'

const articleId = 123

/** Unix time, in seconds, at the start of a minute, the precision of comment dates. */
const minuteStart = 1_699_999_980
const now = minuteStart + 30
const hour = 3600

/** @type {{ [name: string]: any }} */
let settings

/**
 * A stand-in for a comment, carrying only what the read status module reads and writes.
 *
 * @param {object} options
 * @param {string} [options.id]
 * @param {number} [options.time] Unix time of the comment date, in seconds.
 * @param {boolean} [options.own]
 */
const makeComment = ({ id, time, own = false }) => {
	const flags = new Set(own ? ['own'] : [])

	return {
		id,
		date: time === undefined ? undefined : new Date(time * 1000),
		/** @type {boolean | undefined} */
		read: undefined,
		isRead() {
			return this.read
		},
		setRead(/** @type {boolean | undefined} */ value) {
			this.read = value
		},
		hasFlag: (/** @type {string} */ flag) => flags.has(flag),
		addFlag: (/** @type {string} */ flag) => {
			flags.add(flag)
		},
		removeFlag: (/** @type {string} */ flag) => {
			flags.delete(flag)
		},
	}
}

/**
 * @param {ReturnType<typeof makeComment>} comment
 */
const statusOf = (comment) => ({ new: comment.hasFlag('new'), read: comment.isRead() })

/**
 * @param {Partial<Parameters<typeof readStatus.startVisit>[0]>} options
 */
const startVisit = (options) =>
	readStatus.startVisit({
		comments: [],
		visits: [],
		currentTime: now,
		markAsRead: false,
		...options,
	})

beforeEach(() => {
	sessionStorage.clear()
	mw.config.set('wgArticleId', articleId)
	settings = { highlightNewInterval: 7 * 24 * 60 }
	global.convenientDiscussions.settings = /** @type {any} */ ({
		get: (/** @type {string} */ name) => settings[name],
	})
	Object.assign(mw, { hook: () => ({ fire: () => {} }) })
})

describe('readStatus.startVisit', () => {
	test('makes comments since the earliest visit new, and those since the latest unread', () => {
		const beforeEarliest = makeComment({ id: 'a', time: now - 5 * hour })
		const betweenVisits = makeComment({ id: 'b', time: now - 3 * hour })
		const sinceLatest = makeComment({ id: 'c', time: now - hour })

		startVisit({
			comments: [beforeEarliest, betweenVisits, sinceLatest],
			visits: [String(now - 4 * hour), String(now - 2 * hour)],
		})

		expect(statusOf(beforeEarliest)).toEqual({ new: false, read: true })
		expect(statusOf(betweenVisits)).toEqual({ new: true, read: true })
		expect(statusOf(sinceLatest)).toEqual({ new: true, read: false })
	})

	test('makes comments dated more than 3 minutes ahead, or undated, neither new nor unread', () => {
		const withinTolerance = makeComment({ id: 'a', time: now + 3 * 60 })
		const beyondTolerance = makeComment({ id: 'b', time: now + 3 * 60 + 1 })
		const undated = makeComment({})

		startVisit({
			comments: [withinTolerance, beyondTolerance, undated],
			visits: [String(now - hour)],
		})

		expect(statusOf(withinTolerance)).toEqual({ new: true, read: false })
		expect(statusOf(beyondTolerance)).toEqual({ new: false, read: true })
		expect(statusOf(undated)).toEqual({ new: false, read: true })
	})

	test('makes a comment dated in the minute of the latest visit new and unread', () => {
		const comment = makeComment({ id: 'a', time: minuteStart - hour })

		startVisit({ comments: [comment], visits: [String(minuteStart - hour + 50)] })

		expect(statusOf(comment)).toEqual({ new: true, read: false })
	})

	test("makes the user's own comments since the latest visit new but read", () => {
		const comment = makeComment({ id: 'a', time: now - hour, own: true })

		startVisit({ comments: [comment], visits: [String(now - 2 * hour)] })

		expect(statusOf(comment)).toEqual({ new: true, read: true })
	})

	test('forgets visits before the latest one older than the highlight interval', () => {
		settings.highlightNewInterval = 60
		const beforeForgotten = makeComment({ id: 'a', time: now - 2.5 * hour })

		expect(
			startVisit({
				comments: [beforeForgotten],
				visits: [String(now - 3 * hour), String(now - 2 * hour), String(now - hour / 2)],
			}),
		).toEqual([String(now - 2 * hour), String(now - hour / 2), String(now)])
		expect(statusOf(beforeForgotten)).toEqual({ new: false, read: true })
	})

	test('keeps only the latest visit when the highlight interval is 0', () => {
		settings.highlightNewInterval = 0
		const beforeLatest = makeComment({ id: 'a', time: now - 2 * hour })
		const sinceLatest = makeComment({ id: 'b', time: now - hour / 2 })

		expect(
			startVisit({
				comments: [beforeLatest, sinceLatest],
				visits: [String(now - 3 * hour), String(now - hour)],
			}),
		).toEqual([String(now - hour), String(now)])
		expect(statusOf(beforeLatest)).toEqual({ new: false, read: true })
		expect(statusOf(sinceLatest)).toEqual({ new: true, read: false })
	})

	test('restores unread and old comments from sessionStorage on a first boot', () => {
		sessionStorage.setItem(
			'convenientDiscussions-unreadComments',
			JSON.stringify({ [articleId]: ['a'] }),
		)
		sessionStorage.setItem(
			'convenientDiscussions-oldComments',
			JSON.stringify({ [articleId]: ['b'] }),
		)
		const unread = makeComment({ id: 'a', time: now - 5 * hour })
		const old = makeComment({ id: 'b', time: now - 3 * hour })

		startVisit({
			comments: [unread, old],
			visits: [String(now - 4 * hour), String(now - 2 * hour)],
		})

		expect(statusOf(unread)).toEqual({ new: true, read: false })
		expect(statusOf(old)).toEqual({ new: false, read: true })
	})

	test('stores the unread comments in sessionStorage', () => {
		startVisit({
			comments: [
				makeComment({ id: 'a', time: now - 3 * hour }),
				makeComment({ id: 'b', time: now - hour }),
			],
			visits: [String(now - 2 * hour)],
		})

		expect(
			JSON.parse(sessionStorage.getItem('convenientDiscussions-unreadComments') ?? 'null'),
		).toEqual({ [articleId]: ['b'] })
	})

	test('makes the comments carried over as unread by a reboot new and unread', () => {
		const comment = makeComment({ id: 'a', time: now - 5 * hour })

		startVisit({
			comments: [comment],
			visits: [String(now - 4 * hour), String(now - 2 * hour)],
			carriedOverUnreadIds: ['a'],
		})

		expect(statusOf(comment)).toEqual({ new: true, read: false })
	})

	test('makes every comment shown so far read and old on a mark-as-read refresh', () => {
		sessionStorage.setItem(
			'convenientDiscussions-unreadComments',
			JSON.stringify({ [articleId]: ['b'] }),
		)
		const shown = makeComment({ id: 'a', time: now - 2 * hour })
		const shownUnread = makeComment({ id: 'b', time: now - 2 * hour })
		const sinceLatest = makeComment({ id: 'c', time: now - hour / 2 })

		expect(
			startVisit({
				comments: [shown, shownUnread, sinceLatest],
				visits: [String(now - 3 * hour), String(now - hour)],
				markAsRead: true,
			}),
		).toEqual([String(now - hour), String(now)])
		expect(statusOf(shown)).toEqual({ new: false, read: true })
		expect(statusOf(shownUnread)).toEqual({ new: false, read: true })
		expect(statusOf(sinceLatest)).toEqual({ new: true, read: false })
	})

	test('makes a comment new at an earlier visit old when the rules turn false', () => {
		const comment = makeComment({ id: 'a', time: now - 2 * hour })
		const visits = startVisit({
			comments: [comment],
			visits: [String(now - 3 * hour), String(now - hour)],
		})
		expect(statusOf(comment)).toEqual({ new: true, read: true })

		startVisit({ comments: [comment], visits, markAsRead: true })

		expect(statusOf(comment)).toEqual({ new: false, read: true })
	})

	test('makes no comment new or unread at the first visit to the page', () => {
		const comment = makeComment({ id: 'a', time: minuteStart })

		expect(startVisit({ comments: [comment] })).toEqual([String(now)])
		expect(comment.hasFlag('new')).toBe(false)
		expect(comment.isRead()).not.toBe(false)
	})

	test('makes a comment new if dated less than 60 seconds before the earliest visit', () => {
		const time = minuteStart - hour
		const atBoundary = makeComment({ id: 'a', time })
		const insideBoundary = makeComment({ id: 'a', time })

		startVisit({
			comments: [atBoundary],
			visits: [String(time + 60), String(now - hour / 2)],
		})
		startVisit({
			comments: [insideBoundary],
			visits: [String(time + 59), String(now - hour / 2)],
		})

		expect(atBoundary.hasFlag('new')).toBe(false)
		expect(insideBoundary.hasFlag('new')).toBe(true)
	})

	test('makes a comment unread if dated less than 60 seconds before the latest visit', () => {
		const time = minuteStart - hour
		const atBoundary = makeComment({ id: 'a', time })
		const insideBoundary = makeComment({ id: 'a', time })

		startVisit({
			comments: [atBoundary],
			visits: [String(time - hour), String(time + 60)],
		})
		startVisit({
			comments: [insideBoundary],
			visits: [String(time - hour), String(time + 59)],
		})

		expect(atBoundary.isRead()).toBe(true)
		expect(insideBoundary.isRead()).toBe(false)
	})

	test('shifts the visit by 60 seconds when a comment is dated in its minute', () => {
		/**
		 * @param {number} time
		 */
		const visitWithCommentAt = (time) =>
			startVisit({ comments: [makeComment({ id: 'a', time })], visits: [String(now - hour)] }).at(
				-1,
			)

		expect(visitWithCommentAt(now)).toBe(String(now + 60))
		expect(visitWithCommentAt(now - 59)).toBe(String(now + 60))
		expect(visitWithCommentAt(now - 60)).toBe(String(now))
		expect(visitWithCommentAt(now + 1)).toBe(String(now))
	})

	test('makes a comment dated in the minute of a visit read at the next visit', () => {
		const time = minuteStart
		const visits = startVisit({
			comments: [makeComment({ id: 'a', time })],
			visits: [String(now - hour)],
		})
		const atNextVisit = makeComment({ id: 'a', time })

		// A visit in another tab session
		sessionStorage.clear()
		startVisit({ comments: [atNextVisit], visits, currentTime: now + hour })

		expect(statusOf(atNextVisit)).toEqual({ new: true, read: true })
	})
})

describe('readStatus.announceVisitStart', () => {
	test('announces the started visit with the comments read status in place', () => {
		const comment = makeComment({ id: 'a', time: now - hour })
		/** @type {any[]} */
		const deliveries = []
		const listener = (/** @type {any} */ change) => {
			deliveries.push({ change, status: statusOf(comment) })
		}
		readStatus.on('newOld', listener)

		startVisit({ comments: [comment], visits: [String(now - 3 * hour), String(now - 2 * hour)] })
		const deliveriesBeforeAnnouncing = [...deliveries]
		readStatus.announceVisitStart()

		readStatus.off('newOld', listener)
		expect(deliveriesBeforeAnnouncing).toEqual([])
		expect(deliveries).toEqual([
			{
				change: { type: 'visitStart', previousVisitTime: now - 2 * hour },
				status: { new: true, read: false },
			},
		])
	})

	test('announces no previous visit time at the first visit to the page', () => {
		/** @type {any[]} */
		const changes = []
		const listener = (/** @type {any} */ change) => {
			changes.push(change)
		}
		readStatus.on('newOld', listener)

		startVisit({ comments: [makeComment({ id: 'a', time: now - hour })] })
		readStatus.announceVisitStart()

		readStatus.off('newOld', listener)
		expect(changes).toEqual([{ type: 'visitStart', previousVisitTime: undefined }])
	})

	test('fires the newCommentsHighlighted hook after the new/old event', () => {
		/** @type {string[]} */
		const calls = []
		Object.assign(mw, {
			hook: (/** @type {string} */ name) => ({
				fire: () => {
					calls.push(name)
				},
			}),
		})
		const listener = () => {
			calls.push('newOld')
		}
		readStatus.on('newOld', listener)

		startVisit({
			comments: [makeComment({ id: 'a', time: now - hour })],
			visits: [String(now - 2 * hour)],
		})
		readStatus.announceVisitStart()

		readStatus.off('newOld', listener)
		expect(calls).toEqual(['newOld', 'convenientDiscussions.newCommentsHighlighted'])
	})
})
