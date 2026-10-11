import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'

import cd from './loader/cd'
import CdError from './shared/CdError'
import { subtractDaysFromNow, typedKeysOf } from './shared/utils-general'
import { getUserInfo, saveLocalOption } from './utils-api'

/**
 * Class implementing loading and saving of page visits.
 */
class Visits {
	/** @type {{ [articleId: number]: string[] }} */
	data

	/**
	 * Request the pages visits data from the server.
	 *
	 * {@link https://doc.wikimedia.org/mediawiki-core/master/js/mw.user.html#.options mw.user.options}
	 * is not used even on the first run because the script may not run immediately after the page has
	 * loaded. In fact, when the page is loaded in a background tab, it can be throttled until it is
	 * focused, so an indefinite amount of time can pass.
	 *
	 * @param {boolean} [reuse] Whether to reuse a cached userinfo request.
	 * @returns {Promise<string[] | undefined>} Visits to the current page, oldest first, if the user
	 *   is registered and the visits have loaded.
	 */
	async load(reuse = false) {
		if (!cd.user.isRegistered()) return

		try {
			// mw.user.options is not used even on first run because it appears to be cached sometimes
			// which can be critical for determining subscriptions.
			this.unpack(await getUserInfo(reuse).then(({ visits }) => visits))
		} catch (error) {
			cd.debug.logWarn("Couldn't load the settings from the server.", error)

			return
		}

		const articleId = mw.config.get('wgArticleId')

		return articleId in this.data ? this.data[articleId] : []
	}

	/**
	 * Save the visits to the current page, along with those to other pages, to the server.
	 *
	 * @param {string[]} currentPageVisits
	 */
	save(currentPageVisits) {
		this.data[mw.config.get('wgArticleId')] = currentPageVisits
		this.upload()
	}

	/**
	 * Convert a visits object into an optimized string and compress it.
	 *
	 * @returns {string}
	 * @private
	 */
	pack() {
		// The format of the items:
		// <Page ID>,<List of visits, from oldest to newest, separated by comma>\n
		return compressToEncodedURIComponent(
			typedKeysOf(this.data)
				.map((key) => `${key},${this.data[key].join(',')}\n`)
				.join('')
				.trim(),
		)
	}

	/**
	 * Unpack a compressed visits string into a visits object.
	 *
	 * @param {string|undefined} compressed
	 * @private
	 */
	unpack(compressed) {
		this.data = {}
		if (!compressed) return

		const string = decompressFromEncodedURIComponent(compressed)
		if (string) {
			// eslint-disable-next-line no-one-time-vars/no-one-time-vars
			const regexp = /^(\d+),(.+)$/gm
			let match
			while ((match = regexp.exec(string))) {
				this.data[Number(match[1])] = match[2].split(',')
			}
		}
	}

	/**
	 * Upload the pages visits data to the server.
	 *
	 * @private
	 */
	async upload() {
		let compressed = this.pack()
		if (compressed.length > 20_480) {
			this.cleanUp((compressed.length - 20_480) / compressed.length + 0.05)
			compressed = this.pack()
		}

		try {
			await saveLocalOption(cd.g.visitsOptionName, compressed)
		} catch (error) {
			if (error instanceof CdError) {
				if (error.getType() === 'internal' && error.getCode() === 'sizeLimit') {
					this.cleanUp(0.1)
					this.upload()
				} else {
					cd.debug.logError(error)
				}
			} else {
				cd.debug.logError(error)
			}
		}
	}

	/**
	 * Remove the oldest `share`% of visits when the size limit is hit.
	 *
	 * @param {number} [share]
	 * @private
	 */
	cleanUp(share = 0.1) {
		const visits = { ...this.data }
		const timestamps = typedKeysOf(visits)
			.reduce((acc, key) => acc.concat(Number(visits[key])), /** @type {number[]} */ ([]))
			.sort((a, b) => a - b)
		const boundary = timestamps[Math.floor(timestamps.length * share)]
		typedKeysOf(visits).forEach((key) => {
			visits[key] = visits[key].filter((visit) => Number(visit) >= boundary)
			if (!visits[key].length) {
				delete visits[key]
			}
		})
		this.data = visits
	}

	/**
	 * For tests: set the last visit to a date or a number of days before the current date. Use via
	 * `cd.tests.visits.rollBack()`, then refresh the page.
	 *
	 * @param {Date|number} [dateOrDays]
	 */
	rollBack(dateOrDays = 1) {
		this.save([
			(
				(typeof dateOrDays === 'object' ? dateOrDays.getTime() : subtractDaysFromNow(dateOrDays)) /
				1000
			).toFixed(0),
		])
	}
}

export default new Visits()
