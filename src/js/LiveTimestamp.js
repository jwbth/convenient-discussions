/**
 * Automatically updated relative date and time timestamps class.
 *
 * @module LiveTimestamp
 */

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
    cd.debug.startTimer('setDateUpdateTimer');

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
      if (date > yesterdayStart) {
        improvedTimestamps.push(this);
      }
    } else if (cd.settings.timestampFormat === 'relative') {
      this.setUpdateTimeout();
    }
    cd.debug.stopTimer('setDateUpdateTimer');
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
        cd.debug.counters['date update timer']++;
        if (difference < boundary) {
          cd.debug.startTimer('setDateUpdateTimer setTimeout');
          removeFromArrayIfPresent(updateTimeouts, this.updateTimeout);
          this.updateTimeout = setTimeout(() => {
            this.setUpdateTimeout(true);
          }, boundary - difference);
          updateTimeouts.push(this.updateTimeout);

          // TODO: remove after tested.
          this.updateTimeoutDelay = boundary - difference;

          cd.debug.stopTimer('setDateUpdateTimer setTimeout');
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
    const msInMin = cd.g.MILLISECONDS_IN_MINUTE;
    let date = new Date();
    if (cd.settings.useLocalTime) {
      date.setHours(0);
      date.setMinutes(0);
      date.setSeconds(0);
    } else {
      date.setUTCHours(0);
      date.setUTCMinutes(0);
      date.setUTCSeconds(0);
    }
    yesterdayStart = new Date(date.getTime() - msInMin * 60 * 24);
    const nextDayStart = new Date(date.getTime() + msInMin * 60 * 24);
    const nextNextDayStart = new Date(date.getTime() + msInMin * 60 * 24 * 2);

    cd.debug.startTimer('reformatTimestamps setTimeout');
    const ndsDelay = nextDayStart.getTime() - Date.now();
    const ndsTimeout = setTimeout(LiveTimestamp.updateImproved, ndsDelay);
    const nndsDelay = nextNextDayStart.getTime() - Date.now();
    const nndsTimeout = setTimeout(LiveTimestamp.updateImproved, nndsDelay);
    updateTimeouts.push(ndsTimeout, nndsTimeout);
    cd.debug.stopTimer('reformatTimestamps setTimeout');
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
