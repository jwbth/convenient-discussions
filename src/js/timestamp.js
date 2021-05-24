/**
 * Comment timestamp and author processing utilities. These are mostly format conversion utilities.
 * Listing of different formats of dates, digits, and timezones together with regexp and parser
 * generators go in {@link module:siteData}. Functions related to wikitext parsing go in {@link
 * module:wikitext}.
 *
 * Terminology used here (and in other modules):
 * - "date" is a `Date` object,
 * - "timestamp" is a string date as it is present on wiki pages (`23:29, 10 May 2019 (UTC)`).
 *
 * @module timestamp
 */

import { getTimezoneOffset } from 'date-fns-tz';

import cd from './cd';
import { getMessages, removeDirMarks, spacesToUnderlines } from './util';

let parseTimestampRegexp;
let parseTimestampRegexpNoTimezone;

/**
 * Parse a timestamp, accepting a regexp match and returning a date.
 *
 * @param {Array} match Regexp match data.
 * @param {object} cd `convenientDiscussions` (in the window context) / `cd` (in the worker
 *   context) global object.
 * @param {number} [timezoneOffset] User's timezone offset in minutes, if it should be used instead
 *   of the wiki's timezone offset.
 * @returns {Date}
 * @author Bartosz Dziewoński <matma.rex@gmail.com>
 * @license GPL-2.0-only
 */
export function getDateFromTimestampMatch(match, cd, timezoneOffset) {
  cd.debug.startTimer('parse timestamps');

  const untransformDigits = (text) => {
    if (!cd.g.DIGITS) {
      return text;
    }
    return text.replace(new RegExp('[' + cd.g.DIGITS + ']', 'g'), (m) => cd.g.DIGITS.indexOf(m));
  };

  // Override the imported function to be able to use it in the worker context.
  const getMessages = (messages) => messages.map((name) => cd.g.messages[name]);

  let year = 0;
  let monthIdx = 0;
  let day = 0;
  let hours = 0;
  let minutes = 0;

  for (let i = 0; i < cd.g.TIMESTAMP_MATCHING_GROUPS.length; i++) {
    const code = cd.g.TIMESTAMP_MATCHING_GROUPS[i];
    const text = match[i + 3];

    switch (code) {
      case 'xg':
        monthIdx = getMessages([
          'january-gen', 'february-gen', 'march-gen', 'april-gen', 'may-gen', 'june-gen',
          'july-gen', 'august-gen', 'september-gen', 'october-gen', 'november-gen', 'december-gen'
        ]).indexOf(text);
        break;
      case 'd':
      case 'j':
        day = Number(untransformDigits(text));
        break;
      case 'D':
      case 'l':
        // Day of the week - unused
        break;
      case 'F':
        monthIdx = getMessages([
          'january', 'february', 'march', 'april', 'may_long', 'june', 'july', 'august',
          'september', 'october', 'november', 'december'
        ]).indexOf(text);
        break;
      case 'M':
        monthIdx = getMessages([
          'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
        ]).indexOf(text);
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
        throw 'Not implemented';
    }
  }

  let date;
  let timezoneOffsetMs;
  const unixTime = Date.UTC(year, monthIdx, day, hours, minutes);
  if (timezoneOffset === undefined) {
    timezoneOffsetMs = cd.g.TIMEZONE === 'UTC' ? 0 : getTimezoneOffset(cd.g.TIMEZONE, unixTime);
  } else {
    timezoneOffsetMs = timezoneOffset * cd.g.MILLISECONDS_IN_MINUTE;
  }
  date = new Date(unixTime - timezoneOffsetMs);

  cd.debug.stopTimer('parse timestamps');

  return date;
}

/**
 * @typedef {object} ParseTimestampReturn
 * @property {Date} date
 * @property {object} match
 */

/**
 * Parse a timestamp and return the date and the match object.
 *
 * @param {string} timestamp
 * @param {number} [timezoneOffset] Timezone offset in minutes.
 * @returns {?ParseTimestampReturn}
 */
export function parseTimestamp(timestamp, timezoneOffset) {
  // Remove left-to-right and right-to-left marks that sometimes are copied from the edit history to
  // the timestamp (for example, https://meta.wikimedia.org/w/index.php?diff=20418518).
  timestamp = removeDirMarks(timestamp);

  // Creating these regexps every time takes too long (say, 10ms for 1000 runs on an average
  // machine), so we cache them.
  if (!parseTimestampRegexp) {
    parseTimestampRegexp = new RegExp(`^([^]*)(${cd.g.TIMESTAMP_REGEXP.source})(?!["»])`);
    parseTimestampRegexpNoTimezone = new RegExp(
      `^([^]*)(${cd.g.TIMESTAMP_REGEXP_NO_TIMEZONE.source})`
    );
  }

  const regexp = timezoneOffset === undefined ?
    parseTimestampRegexp :
    parseTimestampRegexpNoTimezone;
  const match = timestamp.match(regexp);
  if (!match) {
    return null;
  }
  const date = getDateFromTimestampMatch(match, cd, timezoneOffset);

  return { date, match };
}

/**
 * Pad a number with zeros like this: `4` → `04` or `0004`.
 *
 * @param {number} number Number to pad.
 * @param {number} length Length of the resultant string.
 * @returns {string}
 * @private
 */
function zeroPad(number, length) {
  return ('0000' + number).slice(-length);
}

/**
 * Convert a date to a string in the timestamp format.
 *
 * @param {Date} date
 * @returns {string}
 */
export function formatDate(date) {
  const format = cd.g.DATE_FORMAT;

  let s = '';

  for (let p = 0; p < format.length; p++) {
    let code = format[p];
    if (code === 'x' && p < format.length - 1) {
      code += format[++p];
    }
    if (code === 'xk' && p < format.length - 1) {
      code += format[++p];
    }

    switch (code) {
      case 'xx':
        s += 'x';
        break;
      case 'xg':
        s += getMessages([
          'january-gen', 'february-gen', 'march-gen', 'april-gen', 'may-gen', 'june-gen',
          'july-gen', 'august-gen', 'september-gen', 'october-gen', 'november-gen', 'december-gen'
        ])[date.getUTCMonth()];
        break;
      case 'd':
        s += zeroPad(date.getUTCDate(), 2);
        break;
      case 'D':
        s += getMessages(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'])[date.getUTCDay()];
        break;
      case 'j':
        s += date.getUTCDate();
        break;
      case 'l':
        s += getMessages([
          'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'
        ])[date.getDay()];
        break;
      case 'F':
        s += getMessages([
          'january', 'february', 'march', 'april', 'may_long', 'june', 'july', 'august',
          'september', 'october', 'november', 'december'
        ])[date.getUTCMonth()];
        break;
      case 'M':
        s += getMessages([
          'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
        ])[date.getUTCMonth()];
        break;
      case 'n':
        s += date.getUTCMonth() + 1;
        break;
      case 'Y':
        s += date.getUTCFullYear();
        break;
      case 'xkY':
        s += date.getUTCFullYear() + 543;
        break;
      case 'G':
        s += date.getUTCHours();
        break;
      case 'H':
        s += zeroPad(date.getUTCHours(), 2);
        break;
      case 'i':
        s += zeroPad(date.getUTCMinutes(), 2);
        break;
      case '\\':
        // Backslash escaping
        if (p < format.length - 1) {
          s += format[++p];
        } else {
          s += '\\';
        }
        break;
      case '"':
        // Quoted literal
        if (p < format.length - 1) {
          const endQuote = format.indexOf('"', p + 1)
          if (endQuote === -1) {
            // No terminating quote, assume literal "
            s += '"';
          } else {
            s += format.substr(p + 1, endQuote - p - 1);
            p = endQuote;
          }
        } else {
          // Quote at end of string, assume literal "
          s += '"';
        }
        break;
      default:
        s += format[p];
    }
  }

  return s;
}

/**
 * Generate a comment anchor from a date and author.
 *
 * @param {Date} date
 * @param {string} [author]
 * @param {boolean} [resolveCollisions=false] If set to `true`, anchors that collide with anchors
 *   already registered via {@link module:timestamp.registerCommentAnchor} will get a `_<number>`
 *   postfix.
 * @returns {string}
 */
export function generateCommentAnchor(date, author, resolveCollisions = false) {
  let year = date.getUTCFullYear();
  let month = date.getUTCMonth();
  let day = date.getUTCDate();
  let hours = date.getUTCHours();
  let minutes = date.getUTCMinutes();

  let anchor = (
    zeroPad(year, 4) +
    zeroPad(month + 1, 2) +
    zeroPad(day, 2) +
    zeroPad(hours, 2) +
    zeroPad(minutes, 2) +
    (author ? '_' + spacesToUnderlines(author) : '')
  );
  if (resolveCollisions && commentAnchors.includes(anchor)) {
    let anchorNum = 2;
    const base = anchor;
    do {
      anchor = `${base}_${anchorNum}`;
      anchorNum++;
    } while (commentAnchors.includes(anchor));
  }
  return anchor;
}

let commentAnchors = [];

/**
 * Add a comment anchor to the registry to avoid collisions.
 *
 * @param {string} anchor
 */
export function registerCommentAnchor(anchor) {
  if (anchor) {
    commentAnchors.push(anchor);
  }
}

/**
 * Empty the comment anchor registry.
 *
 * Meant to be executed any time we start processing a new page. If we forget to run it, the newly
 * registered anchors can get extra `_2` or similar text at the end due to collisions with the
 * existing anchors that were not unloaded.
 */
export function resetCommentAnchors() {
  commentAnchors = [];
}

/**
 * @typedef {object} ParseCommentAnchorReturn
 * @property {Date} date
 * @property {string} author
 */

/**
 * Extract a date and author from a comment anchor.
 *
 * @param {string} commentAnchor
 * @returns {?ParseCommentAnchorReturn}
 */
export function parseCommentAnchor(commentAnchor) {
  const match = commentAnchor.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})_(.+)$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const hours = Number(match[4]);
  const minutes = Number(match[5]);
  const author = match[6];

  const date = new Date(Date.UTC(year, month, day, hours, minutes));

  return { date, author };
}
