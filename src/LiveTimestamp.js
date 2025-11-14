import dayjs from 'dayjs';

import EventEmitter from './EventEmitter';
import cd from './loader/cd';
import settings from './settings';
import { removeFromArrayIfPresent } from './shared/utils-general';
import { mixInObject } from './utils-oojs';
import { formatDate } from './utils-window';

/**
 * @typedef {'default'|'improved'|'relative'} TimestampFormat
 */

/**
 * Some numbers for several units used in calculations needed to update relative
 * {@link LiveTimestamp timestamps}. 1 means 1 minute.
 *
 * @typedef {object} RelativeTimeThreshold
 * @property {number} range The top of the number range for the unit (e.g. 60 for minutes)
 * @property {number} start The start of the number range for the unit (e.g. 1 for minutes; don't
 *   need 0 because that would be taken care of by the previous loop iteration as minute 60 [= the
 *   first minute of the next hour])
 * @property {number} step How often the relative timestamp should update (e.g. 1 for minutes)
 */

/**
 * @type {RelativeTimeThreshold[]}
 */
export const relativeTimeThresholds = [
  // Seconds
  {
    range: 1,
    start: 0,
    step: 1,
  },

  // Minutes
  {
    range: 60,
    start: 1,
    step: 1,
  },

  // Hours
  {
    range: 60 * 24,
    start: 60,
    step: 60,
  },

  // Days
  {
    range: 60 * 24 * 31,
    start: 60 * 24,
    step: 60 * 24,
  },

  // We don't update months and years. Additional `setTimeout`s are costly, and an algorithm for
  // them is also too complex.
];

/**
 * @typedef {object} EventMap
 * @property {[]} updateImproved
 */

/**
 * An element that contains an automatically updated timestamp with relative (dependent on the
 * current date and time somehow) date and time.
 */
class LiveTimestamp extends mixInObject(
  // eslint-disable-next-line jsdoc/require-jsdoc
  class {},
  /** @type {typeof EventEmitter<EventMap>} */ (EventEmitter)
) {
  /**
   * Create a live timestamp.
   *
   * @param {Element} element Element that has the timestamp.
   * @param {Date} date Timestamp's date.
   * @param {boolean} addTimezone Whether to add a timezone to the timestamp.
   */
  constructor(element, date, addTimezone) {
    super();

    /**
     * Element that has the timestamp.
     *
     * @type {Element}
     * @private
     */
    this.element = element;

    /**
     * Timestamp's date.
     *
     * @type {Date}
     * @private
     */
    this.date = date;

    /**
     * Whether to add timezone to the timestamp.
     *
     * @type {boolean}
     * @private
     */
    this.addTimezone = addTimezone;

    this.format = settings.get('timestampFormat');
  }

  /**
   * Initialize the timestamp (set the necessary timeouts for the timestamp to be updated when
   * needed).
   */
  init() {
    if (this.format === 'improved') {
      if (!LiveTimestamp.improvedTimestampsInited) {
        // Timestamps of the "improved" format are updated all together, at the boundaries of days.
        // So, we only need to initiate the timeouts once.
        LiveTimestamp.initImproved();
      }
      if (this.date.getTime() > LiveTimestamp.yesterdayStart) {
        LiveTimestamp.improvedTimestamps.push(this);
      }
    } else if (this.format === 'relative') {
      this.setUpdateTimeout();
    }
  }

  /**
   * Set a delay (timeout) until the next timestamp update.
   *
   * @param {boolean} update Whether to update the timestamp now.
   * @private
   */
  setUpdateTimeout(update = false) {
    if (update) {
      this.update();
    }

    const differenceMs = Date.now() - this.date.getTime();
    const threshold = relativeTimeThresholds.find((thr) => differenceMs < thr.range * cd.g.msInMin);
    if (threshold) {
      // Find the relevant time boundary at which the timestamp should be updated.
      for (
        let boundary =
          (
            threshold.start +

            (
              // The number of steps to take to get to the time boundary preceding the current time,
              // e.g. 1 hour for 1 hour and 25 minutes
              Math.floor(differenceMs / cd.g.msInMin / threshold.step) *

              threshold.step
            )
          );
        boundary <= threshold.range;
        boundary += threshold.step
      ) {
        const boundaryMs = boundary * cd.g.msInMin;
        if (differenceMs < boundaryMs) {
          removeFromArrayIfPresent(LiveTimestamp.updateTimeouts, this.updateTimeout);
          this.updateTimeout = setTimeout(() => {
            this.setUpdateTimeout(true);
          }, boundaryMs - differenceMs);
          LiveTimestamp.updateTimeouts.push(this.updateTimeout);
          break;
        }
      }
    }
  }

  /**
   * _For internal use._ Update the timestamp.
   */
  update() {
    this.element.textContent = formatDate(this.date, this.addTimezone);
  }

  /** @type {number[]} */
  static updateTimeouts = [];

  static improvedTimestampsInited = false;

  /** @type {LiveTimestamp[]} */
  static improvedTimestamps = [];

  /** @type {number} */
  static yesterdayStart;

  /**
   * _For internal use._ Initialize improved timestamps (when the timestamp format is set to
   * "improved").
   */
  static initImproved() {
    let date = dayjs();
    const timezone = cd.g.timestampTools.user.timezone;
    if (settings.get('useUiTime') && !['UTC', 0, undefined].includes(timezone)) {
      date = typeof timezone === 'number' ? date.utcOffset(timezone) : date.tz(timezone);
    } else {
      date = date.utc();
    }
    date = date.startOf('day');
    this.yesterdayStart = date.subtract(1, 'day').valueOf();

    this.updateTimeouts.push(
      // Tomorrow start
      setTimeout(this.updateImproved, date.add(1, 'day').valueOf() - Date.now()),

      // Day after tomorrow start
      setTimeout(this.updateImproved, date.add(2, 'day').valueOf() - Date.now())
    );

    this.improvedTimestampsInited = true;
  }

  /**
   * _For internal use._ Update the timestamps (when the timestamp format is set to "improved").
   */
  static updateImproved = () => {
    this.improvedTimestamps.forEach((timestamp) => {
      timestamp.update();
    });
    this.emit('updateImproved');
  };

  /**
   * Reset the list of live timestamps on the page (this is run at every page load).
   */
  static reset() {
    this.updateTimeouts.forEach(clearTimeout);
    this.updateTimeouts = [];
    this.improvedTimestampsInited = false;
    this.improvedTimestamps = [];
  }
}

export default LiveTimestamp;
