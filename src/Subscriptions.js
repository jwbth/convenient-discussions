import EventEmitter from './EventEmitter'
import cd from './loader/cd'
import CdError from './shared/CdError'
import { wrapHtml } from './utils-window'

/**
 * @typedef {{ [sectionId: string]: boolean }} SubscriptionsData
 */

/**
 * @typedef {object} EventMap
 * @property {[]} process
 */

/**
 * Implementation of the subscriptions feature in general terms. It is extended by
 * {@link DtSubscriptions DisussionTools' topic subscription}.
 *
 * @augments EventEmitter<EventMap>
 */
class Subscriptions extends EventEmitter {
	/** @type {SubscriptionsData} */
	data

	/** @type {string|undefined} */
	type

	/**
	 * Do everything {@link .load} does and also perform manipulations with the talk page.
	 *
	 * @param {import('./BootProcess').default} [bootProcess]
	 * @param {...*} args
	 */
	async loadToTalkPage(bootProcess, ...args) {
		await this.load(bootProcess, ...args)

		this.processOnTalkPage(bootProcess)
	}

	/**
	 * @param {...*} _args
	 * @abstract
	 */
	// eslint-disable-next-line no-unused-vars
	async load(..._args) {
		// This method is defined in subclasses.
	}

	/**
	 * @param {...*} _args
	 * @abstract
	 * @returns {boolean}
	 */
	// eslint-disable-next-line no-unused-vars
	areLoaded(..._args) {
		// This method is defined in subclasses.
		return true
	}

	/**
	 * @param {...*} _args
	 * @abstract
	 * @protected
	 */
	// eslint-disable-next-line no-unused-vars
	async actuallySubscribe(..._args) {
		// This method is defined in subclasses.
	}

	/**
	 * @param {...*} _args
	 * @abstract
	 * @protected
	 */
	// eslint-disable-next-line no-unused-vars
	async actuallyUnsubscribe(..._args) {
		// This method is defined in subclasses.
	}

	/**
	 * Process subscriptions when they are {@link Subscriptions#loadToTalkPage loaded to a talk page}.
	 *
	 * @param {import('./BootProcess').default} [_bootProcess]
	 */
	processOnTalkPage(_bootProcess) {
		this.emit('process')
	}

	/**
	 * Update the subscription list by adding or removing a subscription, without saving anything to
	 * the server.
	 *
	 * @param {string} subscribeId Section's subscribe ID (modern or legacy format).
	 * @param {boolean} subscribe Subscribe or unsubscribe.
	 * @protected
	 */
	updateLocally(subscribeId, subscribe) {
		// this.data can be not set on newly created pages with DT subscriptions enabled.
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		this.data ??= {}

		this.data[subscribeId] = subscribe
	}

	/**
	 * Subscribe to a section.
	 *
	 * @param {string} subscribeId Section's DiscussionTools ID.
	 * @param {string} [id] Section's ID. Not required for DiscussionTools subscriptions.
	 * @param {boolean} [quiet] Don't show a success notification.
	 */
	async subscribe(subscribeId, id, quiet = false) {
		await this.actuallySubscribe(subscribeId, id)

		if (!quiet) {
			const body = subscribeId.startsWith('p-')
				? cd.mws('discussiontools-newtopicssubscription-notify-subscribed-body')
				: cd.mws('discussiontools-topicsubscription-notify-subscribed-body')
			mw.notify(wrapHtml(body), {
				title: subscribeId.startsWith('p-')
					? cd.mws('discussiontools-newtopicssubscription-notify-subscribed-title')
					: cd.mws('discussiontools-topicsubscription-notify-subscribed-title'),
			})
		}
	}

	/**
	 * Unsubscribe from a section.
	 *
	 * @param {string} subscribeId Section's DiscussionTools ID.
	 * @param {string} [id] Section's ID. Not required for DiscussionTools subscriptions.
	 * @param {boolean} [quiet] Don't show a success notification.
	 */
	async unsubscribe(subscribeId, id, quiet = false) {
		await this.actuallyUnsubscribe(subscribeId, id)

		if (!quiet) {
			const body = subscribeId.startsWith('p-')
				? cd.mws('discussiontools-newtopicssubscription-notify-unsubscribed-body')
				: cd.mws('discussiontools-topicsubscription-notify-unsubscribed-body')
			mw.notify(wrapHtml(body), {
				title: subscribeId.startsWith('p-')
					? cd.mws('discussiontools-newtopicssubscription-notify-unsubscribed-title')
					: cd.mws('discussiontools-topicsubscription-notify-unsubscribed-title'),
			})
		}
	}

	/**
	 * Get the subscription state of a section or the page.
	 *
	 * @param {string} subscribeId
	 * @returns {boolean | undefined}
	 * @throws {CdError}
	 */
	getState(subscribeId) {
		if (!cd.user.isRegistered()) {
			return
		}

		if (!this.areLoaded()) {
			throw new CdError()
		}

		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		if (!this.data || !(subscribeId in this.data)) {
			return
		}

		return this.data[subscribeId]
	}

	/**
	 * _For internal use._ Convert the subscription list to the standard format, with section IDs as
	 * keys instead of array elements, to store it.
	 *
	 * @param {string[]} arr Array of section IDs.
	 * @returns {SubscriptionsData}
	 */
	itemsToKeys(arr) {
		return Object.assign({}, ...arr.map((page) => ({ [page]: true })))
	}
}

export default Subscriptions
