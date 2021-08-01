/**
 * Automatically updated relative date and time timestamps class.
 *
 * @module LiveTimestamp
 */

import dayjs from 'dayjs';

import cd from './cd';
import navPanel from './navPanel';
import { formatDate, relativeTimeThresholds } from './timestamp';
import { removeFromArrayIfPresent } from './util';

let yesterdayStart;

let updateTimeouts = [];
let improvedTimestampsInitted = false;
let improvedTimestamps = [];

/**
 * Class representing an element that has contains an automatically updated timestamp with relative
 * (dependent on the current date and time somehow) date and time.
 */
export default class LiveTimestamp {
  /**
   * Create a live timestamp.
   *
   * @param {Element} element Element that has the timestamp.
   * @param {Date} date Timestamp's date.
   * @param {boolean} addTimezone Whether to add timezone to the timestamp.
   * @param {Function} callback Function to run after the timestamp updates.
   */
  constructor(element, date, addTimezone, callback) {
    /**
     * Element that has the timestamp.
     *
     * @type {Element}
     */
    this.element = element;

    /**
     * Timestamp's date.
     *
     * @type {Date}
     */
    this.date = date;

    /**
     * Whether to add timezone to the timestamp.
     *
     * @type {boolean}
     */
    this.addTimezone = addTimezone;

    /**
     * Function to run after the timestamp updates.
     *
     * @type {Function}
     */
    this.callback = callback;

    if (cd.settings.timestampFormat === 'improved') {
      if (!improvedTimestampsInitted) {
        // Timestamps of the "improved" format are updated all together, on the border of days. So,
        // we only need to initiate the timeouts once.
        LiveTimestamp.initImproved();
      }
      if (date.getTime() > yesterdayStart) {
        improvedTimestamps.push(this);
      }
    } else if (cd.settings.timestampFormat === 'relative') {
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
    const msInMin = cd.g.MILLISECONDS_IN_MINUTE;
    const threshold = relativeTimeThresholds
      .find((threshold) => difference < threshold.interval * msInMin);
    if (threshold) {
      const minSteps = Math.floor((difference / msInMin) / threshold.step);
      for (
        let boundary = (threshold.start + (minSteps * threshold.step)) * msInMin;
        boundary <= threshold.interval * msInMin;
        boundary += threshold.step * msInMin
      ) {
        if (difference < boundary) {
          removeFromArrayIfPresent(updateTimeouts, this.updateTimeout);
          this.updateTimeout = setTimeout(() => {
            this.setUpdateTimeout(true);
          }, boundary - difference);
          updateTimeouts.push(this.updateTimeout);

          break;
        }
      }
    }
  }

  /**
   * Update the timestamp.
   *
   * @private
   */
  update() {
    this.element.textContent = formatDate(this.date, this.addTimezone);
    if (this.callback) {
      this.callback();
    }
  }

  /**
   * Initialize improved timestamps (when the timestamp format is set to "improved").
   *
   * @private
   */
  static initImproved() {
    improvedTimestampsInitted = true;
    let date = dayjs();
    if (cd.settings.useUiTime && !['UTC', 0].includes(cd.g.UI_TIMEZONE)) {
      date = typeof cd.g.UI_TIMEZONE === 'number' ?
        date.utcOffset(cd.g.UI_TIMEZONE) :
        date.tz(cd.g.UI_TIMEZONE);
    } else {
      date = date.utc();
    }
    date = date.startOf('day');
    yesterdayStart = date.subtract(1, 'day').valueOf();
    const tomorrowStart = date.add(1, 'day').valueOf();
    const dayAfterTomorrowStart = date.add(2, 'day').valueOf();

    const tsDelay = tomorrowStart - Date.now();
    const tsTimeout = setTimeout(LiveTimestamp.updateImproved, tsDelay);
    const datsDelay = dayAfterTomorrowStart - Date.now();
    const datsTimeout = setTimeout(LiveTimestamp.updateImproved, datsDelay);
    updateTimeouts.push(tsTimeout, datsTimeout);
    cd.g.delays = [tsDelay, datsDelay];
  }

  /**
   * _For internal use._ Update the timestamps (when the timestamp format is set to "improved").
   */
  static updateImproved() {
    improvedTimestamps.forEach((timestamp) => {
      timestamp.update();
    });
    if (navPanel.isMounted()) {
      navPanel.updateTimestampsInRefreshButtonTooltip();
    }
  }

  /**
   * Reset all the live timestamps on the page (this is run on page reloads).
   */
  static reset() {
    updateTimeouts.forEach(clearTimeout);
    updateTimeouts = [];
    improvedTimestampsInitted = false;
    improvedTimestamps = [];
  }
}
