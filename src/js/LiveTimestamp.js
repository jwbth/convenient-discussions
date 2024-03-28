import dayjs from 'dayjs';

import cd from './cd';
import navPanel from './navPanel';
import settings from './settings';
import { removeFromArrayIfPresent } from './utils-general';
import { formatDate, relativeTimeThresholds } from './utils-timestamp';

/**
 * Class representing an element that has contains an automatically updated timestamp with relative
 * (dependent on the current date and time somehow) date and time.
 */
class LiveTimestamp {
  /**
   * Create a live timestamp.
   *
   * @param {Element} element Element that has the timestamp.
   * @param {Date} date Timestamp's date.
   * @param {boolean} addTimezone Whether to add timezone to the timestamp.
   * @param {Function} [callback] Function to run after the timestamp updates.
   */
  constructor(element, date, addTimezone, callback) {
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

    /**
     * Function to run after the timestamp updates.
     *
     * @type {Function|undefined}
     * @private
     */
    this.callback = callback;

    this.format = settings.get('timestampFormat');
    this.useUiTime = settings.get('useUiTime');
  }

  /**
   * Initialize the timestamp (set the necessary timeouts for the timestamp to be updated when
   * needed).
   */
  init() {
    if (this.format === 'improved') {
      if (!this.constructor.improvedTimestampsInitted) {
        // Timestamps of the "improved" format are updated all together, at the boundaries of days.
        // So, we only need to initiate the timeouts once.
        LiveTimestamp.initImproved();
      }
      if (this.date.getTime() > this.constructor.yesterdayStart) {
        this.constructor.improvedTimestamps.push(this);
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

    const difference = Date.now() - this.date.getTime();
    const threshold = relativeTimeThresholds
      .find((threshold) => difference < threshold.interval * cd.g.msInMin);
    if (threshold) {
      const minSteps = Math.floor((difference / cd.g.msInMin) / threshold.step);
      for (
        let boundary = (threshold.start + (minSteps * threshold.step)) * cd.g.msInMin;
        boundary <= threshold.interval * cd.g.msInMin;
        boundary += threshold.step * cd.g.msInMin
      ) {
        if (difference < boundary) {
          removeFromArrayIfPresent(this.constructor.updateTimeouts, this.updateTimeout);
          this.updateTimeout = setTimeout(() => {
            this.setUpdateTimeout(true);
          }, boundary - difference);
          this.constructor.updateTimeouts.push(this.updateTimeout);
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
    this.callback?.();
  }

  static updateTimeouts = [];
  static improvedTimestampsInitted = false;
  static improvedTimestamps = [];

  /**
   * _For internal use._ Initialize improved timestamps (when the timestamp format is set to
   * "improved").
   */
  static initImproved() {
    this.improvedTimestampsInitted = true;
    let date = dayjs();
    if (this.useUiTime && !['UTC', 0].includes(cd.g.uiTimezone)) {
      date = typeof cd.g.uiTimezone === 'number' ?
        date.utcOffset(cd.g.uiTimezone) :
        date.tz(cd.g.uiTimezone);
    } else {
      date = date.utc();
    }
    date = date.startOf('day');
    this.yesterdayStart = date.subtract(1, 'day').valueOf();
    const tomorrowStart = date.add(1, 'day').valueOf();
    const dayAfterTomorrowStart = date.add(2, 'day').valueOf();

    const tsDelay = tomorrowStart - Date.now();
    const tsTimeout = setTimeout(LiveTimestamp.updateImproved, tsDelay);
    const datsDelay = dayAfterTomorrowStart - Date.now();
    const datsTimeout = setTimeout(LiveTimestamp.updateImproved, datsDelay);
    this.updateTimeouts.push(tsTimeout, datsTimeout);
  }

  /**
   * _For internal use._ Update the timestamps (when the timestamp format is set to "improved").
   */
  static updateImproved() {
    this.improvedTimestamps.forEach((timestamp) => {
      timestamp.update();
    });
    if (navPanel.isMounted()) {
      navPanel.updateTimestampsInRefreshButtonTooltip();
    }
  }

  /**
   * Reset all the live timestamps on the page (this is run at every page load).
   */
  static reset() {
    this.updateTimeouts.forEach(clearTimeout);
    this.updateTimeouts = [];
    this.improvedTimestampsInitted = false;
    this.improvedTimestamps = [];
  }
}

export default LiveTimestamp;
