import { isKeyOf, typedKeysOf } from '../shared/utils-general'

/**
 * @typedef {object} TimerData
 * @property {number} [total] Total time for the current measurement.
 * @property {number} [startTimestamp] Timestamp when the timer started.
 * @property {number} [runCount] Number of times the timer has run.
 * @property {number} [allRunsTotal] Total time for all timer runs.
 */

/**
 * A number of methods to simplify measuring time that it takes to run certain routines as well as
 * counting the number of times certain instructions run.
 *
 * @module debug
 */
class Debug {
	/**
	 * Object containing all data for active and past timers.
	 *
	 * @type {Partial<{ [label: string]: TimerData }>}
	 */
	timers = {}

	/**
	 * An array to keep any values sequentially.
	 *
	 * @type {any[]}
	 */
	array = []

	/**
	 * An object to keep any values by key.
	 *
	 * @type {AnyByKey}
	 */
	object = {}

	/**
	 * An object to keep values of counters.
	 *
	 * @type {NumbersByKey}
	 */
	counters

	/**
	 * Init/reset all properties of the debug object.
	 */
	init() {
		this.timers = {}
		this.initCounters()

		this.array = []
		this.object = {}
	}

	/**
	 * Init counters object to have incrementation work with any of its properties without the need to
	 * assign 0 to it first.
	 */
	initCounters() {
		this.counters =
			typeof Proxy === 'undefined'
				? {}
				: new Proxy(
					/** @type {AnyByKey} */({}),
					{ get: (obj, prop) => isKeyOf(prop, obj) ? obj[prop] : 0 }
				)
	}

	/**
	 * Start the specified timer.
	 *
	 * @param {string} label
	 */
	startTimer(label) {
		this.timers[label] ??= {}
		this.timers[label].total ??= 0
		this.timers[label].startTimestamp = performance.now()
	}

	/**
	 * Stop the specified timer.
	 *
	 * @param {string} label
	 */
	stopTimer(label) {
		const timer = this.timers[label]
		if (timer?.startTimestamp === undefined) return

		const interval = performance.now() - timer.startTimestamp
		timer.total = (timer.total || 0) + interval
		delete timer.startTimestamp

		timer.allRunsTotal ??= 0
		timer.allRunsTotal += interval

		timer.runCount ??= 0
		timer.runCount++
	}

	/**
	 * Reset the total time value for the timer.
	 *
	 * @param {string} label
	 */
	resetTimer(label) {
		const timer = this.timers[label]
		if (!timer) return

		if (timer.startTimestamp !== undefined) {
			this.stopTimer(label)
		}
		delete timer.total
	}

	/**
	 * Remove all data associated with the timer.
	 *
	 * @param {string} label
	 */
	fullResetTimer(label) {
		// We can simply delete the entry from the map entirely
		delete this.timers[label]
	}

	/**
	 * Log and reset the specified timer.
	 *
	 * @param {string} label
	 */
	logAndResetTimer(label) {
		const timer = this.timers[label]
		if (!timer) return

		if (timer.startTimestamp !== undefined) {
			this.stopTimer(label)
		}
		if (timer.total !== undefined) {
			console.debug(`Convenient Discussions: ${label}: ${timer.total.toFixed(1)}`)
			this.resetTimer(label)
		}
	}

	/**
	 * Log and reset all timers, as well as counters and other collected values.
	 *
	 * @param {boolean} [sort] Whether to sort timers and counters alphabetically.
	 */
	logAndResetEverything(sort = false) {
		const timerLabels = Object.keys(this.timers)
		if (sort) {
			timerLabels.sort()
		}
		timerLabels.forEach((label) => {
			this.logAndResetTimer(label)
		})

		const counterLabels = typedKeysOf(this.counters)
		if (sort) {
			counterLabels.sort()
		}
		counterLabels.forEach((label) => {
			console.debug(`counter ${label}: ${this.counters[label]}`)
		})
		this.initCounters()

		if (this.array.length) {
			console.debug(`array:`, this.array)
			this.array = []
		}

		if (Object.keys(this.object).length) {
			console.debug(`object:`, this.object)
			this.object = {}
		}
	}

	/**
	 * Get the total time for a timer.
	 *
	 * @param {string} label
	 * @returns {number | undefined}
	 */
	getTimerTotal(label) {
		return this.timers[label]?.total
	}

	/**
	 * Log the average time one run of the specified timer takes. All runs of the timer are taken into
	 * account unless a {@link module:debug.fullResetTimer full reset} has been performed.
	 *
	 * @param {string} label
	 */
	getAverageTimerTime(label) {
		const timer = this.timers[label]

		if (timer?.allRunsTotal === undefined || timer.runCount === undefined) {
			console.error(`No data for timer ${label}`)

			return
		}
		const average = (timer.allRunsTotal / timer.runCount).toFixed(3)
		console.debug(`${label}: ${average} average for ${timer.runCount} runs`)
	}

	/**
	 * Increment the specified counter.
	 *
	 * @param {string} label
	 */
	incrementCounter(label) {
		this.counters[label]++
	}
};

export default new Debug()
