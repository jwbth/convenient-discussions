/**
 * Comment timestamp processing utilities. Timestamp formats are set in {@link module:siteData}.
 * Functions related to wikitext parsing go in {@link module:wikitext}.
 *
 * Terminology used here (and in other modules):
 * - "date" is a `Date` object,
 * - "timestamp" is a string date as it is present on wiki pages (`23:29, 10 May 2019 (UTC)`).
 *
 * @module utilsTimestamp
 */

import { getTimezoneOffset } from 'date-fns-tz';

import CdError from './CdError';
import cd from './cd';
import { getContentLanguageMessages, removeDirMarks } from './utils-general';

export const dateTokenToMessageNames = {
  xg: [
    'january-gen',
    'february-gen',
    'march-gen',
    'april-gen',
    'may-gen',
    'june-gen',
    'july-gen',
    'august-gen',
    'september-gen',
    'october-gen',
    'november-gen',
    'december-gen',
  ],
  D: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
  l: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
  F: [
    'january',
    'february',
    'march',
    'april',
    'may_long',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ],
  M: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'],
};

/**
 * Parse a timestamp, accepting a regexp match and returning a date.
 *
 * @param {string[]} match Regexp match data.
 * @param {string|number} [timezone] Timezone standard name or offset in minutes. If set, it is
 *   implied that the timestamp is in the user (interface) language, not in the content language.
 * @returns {Date}
 * @author Bartosz Dziewoński <matma.rex@gmail.com>
 * @author Jack who built the house
 * @license MIT
 */
export function getDateFromTimestampMatch(match, timezone) {
  let isContentLanguage = false;
  if (timezone === undefined) {
    isContentLanguage = true;
    timezone = cd.g.contentTimezone || 'UTC';
  }

  const digits = isContentLanguage ? cd.g.contentDigits : cd.g.uiDigits;

  const untransformDigits = (/** @type {string} */ text) => {
    if (!digits) {
      return text;
    }

    return text.replace(
      new RegExp('[' + digits + ']', 'g'),
      (m) => String(digits.indexOf(m))
    );
  };

  let year = 0;
  let monthIdx = 0;
  let day = 0;
  let hours = 0;
  let minutes = 0;

  for (const [i, code] of (
    isContentLanguage ? cd.g.contentTimestampMatchingGroups : cd.g.uiTimestampMatchingGroups
  ).entries()) {
    const text = match[i + 3];

    switch (code) {
      case 'xg':
      case 'F':
      case 'M': {
        // The worker context doesn't have mw.msg(), but isContentLanguage should be always `true`
        // there.
        monthIdx = // Messages
          (
            isContentLanguage
              ? getContentLanguageMessages(dateTokenToMessageNames[code])
              : dateTokenToMessageNames[code].map((token) => mw.msg(token))
          ).indexOf(text);
        break;
      }
      case 'd':
      case 'j':
        day = Number(untransformDigits(text));
        break;
      case 'D':
      case 'l':
        // Day of the week - unused
        break;
      case 'n':
        monthIdx = Number(untransformDigits(text)) - 1;
        break;
      case 'Y':
        year = Number(untransformDigits(text));
        break;
      case 'xkY':
        // Thai year
        year = Number(untransformDigits(text)) - 543;
        break;
      case 'G':
      case 'H':
        hours = Number(untransformDigits(text));
        break;
      case 'i':
        minutes = Number(untransformDigits(text));
        break;
      default:
        throw new CdError('Not implemented');
    }
  }

  const unixTime = Date.UTC(year, monthIdx, day, hours, minutes);

  return new Date(
    unixTime -

    // Timezone offset
    (
      typeof timezone === 'number'
        ? timezone * cd.g.msInMin
        : timezone === 'UTC'
          ? 0

        // Using date-fns-tz's getTimezoneOffset() is way faster than day.js's methods.
          : getTimezoneOffset(timezone, unixTime)
    )
  );
}

/**
 * @typedef {object} ParseTimestampReturn
 * @property {Date} date
 * @property {RegExpMatchArray} match
 */

/**
 * Parse a timestamp and return a date and a match object.
 *
 * @param {string} timestamp
 * @param {string|number} [timezone] Standard timezone name or offset in minutes. If set, it is
 *   implied that the timestamp is in the user (interface) language, not in the content language.
 * @returns {ParseTimestampReturn | undefined}
 */
export function parseTimestamp(timestamp, timezone) {
  // Remove left-to-right and right-to-left marks that are sometimes copied from edit history to the
  // timestamp (for example, https://meta.wikimedia.org/w/index.php?diff=20418518). Replace with a
  // space to keep offsets.
  const match = removeDirMarks(timestamp, true).match(
    timezone === undefined ? cd.g.parseTimestampContentRegexp : cd.g.parseTimestampUiRegexp
  );
  if (!match) {
    return;
  }

  return {
    date: getDateFromTimestampMatch(match, timezone),
    match,
  };
}
