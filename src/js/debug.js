/**
 * A number of methods to simplify measuring time that it takes to run certain routines as well as
 * counting the number of times certain instructions run.
 *
 * @namespace
 * @memberof convenientDiscussions
 */
const debug = {
  /**
   * Init/reset all properties of the debug object.
   */
  init() {
    /**
     * Total time for every timer.
     *
     * @type {object}
     * @memberof convenientDiscussions.debug
     */
    this.timerTotal = {};

    /**
     * Timer start timestamps for every timer.
     *
     * @type {object}
     * @memberof convenientDiscussions.debug
     * @private
     */
    this.timerStartTimestamps = {};

    /**
     * The number of times a timer has run.
     *
     * @type {object}
     * @memberof convenientDiscussions.debug
     */
    this.timerRunCount = {};

    /**
     * Total time for all timer runs, ignoring
     * {@link convenientDiscussions.debug.resetTimer timer resets} (but not
     * {@link convenientDiscussions.debug.fullResetTimer full resets}).
     *
     * @type {object}
     * @memberof convenientDiscussions.debug
     */
    this.timerAllRunsTotal = {};

    this.initCounters();

    /**
     * An array to keep any values sequentially.
     *
     * @type {Array}
     * @memberof convenientDiscussions.debug
     */
    this.array = [];

    /**
     * An object to keep any values by key.
     *
     * @type {Array}
     * @memberof convenientDiscussions.debug
     */
    this.object = {};
  },

  /**
   * Init counters object to have incrementation work with any of its properties without the need to
   * assign 0 to it first.
   */
  initCounters() {
    /**
     * An object to keep values of counters.
     *
     * @type {Proxy|object}
     * @memberof convenientDiscussions.debug
     */
    this.counters = typeof Proxy === 'undefined' ?
      {} :
      new Proxy({}, { get: (obj, prop) => prop in obj ? obj[prop] : 0 });
  },

  /**
   * Start the specified timer.
   *
   * @param {string} label
   */
  startTimer(label) {
    if (this.timerTotal[label] === undefined) {
      this.timerTotal[label] = 0;
    }
    this.timerStartTimestamps[label] = performance.now();
  },

  /**
   * Stop the specified timer.
   *
   * @param {string} label
   */
  stopTimer(label) {
    if (this.timerStartTimestamps[label] === undefined) return;

    const interval = performance.now() - this.timerStartTimestamps[label];
    this.timerTotal[label] += interval;
    delete this.timerStartTimestamps[label];

    if (this.timerAllRunsTotal[label] === undefined) {
      this.timerAllRunsTotal[label] = 0;
      this.timerRunCount[label] = 0;
    }
    this.timerAllRunsTotal[label] += interval;
    this.timerRunCount[label]++;
  },

  /**
   * Reset the total time value for the timer.
   *
   * @param {string} label
   */
  resetTimer(label) {
    if (this.timerStartTimestamps[label] !== undefined) {
      this.stopTimer(label);
    }
    delete this.timerTotal[label];
  },

  /**
   * Remove all data associated with the timer.
   *
   * @param {string} label
   */
  fullResetTimer(label) {
    this.resetTimer(label);
    delete this.timerAllRunsTotal[label];
    delete this.timerRunCount[label];
  },

  /**
   * Log and reset the specified timer.
   *
   * @param {string} label
   */
  logAndResetTimer(label) {
    if (this.timerStartTimestamps[label] !== undefined) {
      this.stopTimer(label);
    }
    if (this.timerTotal[label] !== undefined) {
      console.debug(`${label}: ${this.timerTotal[label].toFixed(1)}`);
      this.resetTimer(label);
    }
  },

  /**
   * Log and reset all timers, as well as counters and other collected values.
   *
   * @param {boolean} sort Whether to sort timers and counters alphabetically.
   */
  logAndResetEverything(sort) {
    const timerLabels = Object.keys(this.timerTotal);
    if (sort) {
      timerLabels.sort();
    }
    timerLabels.forEach((label) => {
      this.logAndResetTimer(label);
    });

    const counterLabels = Object.keys(this.counters);
    if (sort) {
      counterLabels.sort();
    }
    counterLabels.forEach((label) => {
      console.debug(`counter ${label}: ${this.counters[label]}`);
    });
    this.initCounters();

    if (this.array.length) {
      console.debug(`array: `, this.array);
      this.array = [];
    }

    if (Object.keys(this.object).length) {
      console.debug(`object: `, this.object);
      this.object = {};
    }
  },

  /**
   * Get the {@link convenientDiscussions.debug.timerTotal total time} for a timer.
   *
   * @param {string} label
   * @returns {number}
   */
  getTimerTotal(label) {
    return this.timerTotal[label];
  },

  /**
   * Log the average time one run of the specified timer takes. All runs of the timer are taken into
   * account unless a {@link convenientDiscussions.debug.fullResetTimer full reset} has been
   * performed.
   *
   * @param {string} label
   */
  getAverageTimerTime(label) {
    if (this.timerAllRunsTotal[label] === undefined) {
      console.error(`No data for timer ${label}`);
      return;
    }
    const average = this.timerAllRunsTotal[label] / this.timerRunCount[label];
    console.debug(`${label}: ${average.toFixed(3)} average for ${this.timerRunCount[label]} runs`);
  },

  /**
   * Increment the specified counter.
   *
   * @param {string} label
   */
  incrementCounter(label) {
    this.counters[label]++;
  },
};

export default debug;
