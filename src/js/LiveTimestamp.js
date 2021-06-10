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
 * Class representing an element that has contains automatically updated relative date and time
 * timestamps.
 */
export default class LiveTimestamp {
  constructor(element, date, callback) {
    // TODO: remove after tested.
    if (!cd.g.liveTimestamps) {
      cd.g.liveTimestamps = [];
    }
    cd.g.liveTimestamps.push(this);

    cd.debug.startTimer('setDateUpdateTimer');
    this.element = element;
    this.date = date;
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

  update() {
    this.element.textContent = formatDate(this.date, true);
    if (this.callback) {
      this.callback();
    }
  }

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
    const ndsTimeout = setTimeout(
      LiveTimestamp.updateImproved,
      nextDayStart.getTime() - Date.now()
    );
    const nndsTimeout = setTimeout(
      LiveTimestamp.updateImproved,
      nextNextDayStart.getTime() - Date.now()
    );
    updateTimeouts.push(ndsTimeout, nndsTimeout);
    cd.debug.stopTimer('reformatTimestamps setTimeout');
  }

  static updateImproved() {
    improvedTimestamps.forEach((timestamp) => {
      timestamp.update();
    });
    navPanel.updateTimestampsInRefreshButtonTooltip();
  }

  static reset() {
    updateTimeouts.forEach(clearTimeout);
    updateTimeouts = [];
    improvedTimestampsInitted = false;
    improvedTimestamps = [];

    // TODO: remove after tested.
    cd.g.liveTimestamps = [];
  }
}
