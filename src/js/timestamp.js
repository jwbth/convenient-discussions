/**
 * Comment timestamp and author processing utilities. These are mostly format conversion utilities.
 * Listing of different formats of dates, digits, and timezones together with regexp and parser
 * generators go in {@link module:dateFormat}. Functions related to wikitext parsing go in {@link
 * module:wikitext}.
 *
 * Terminology used here (and in other modules):
 * - "date" is a `Date` object,
 * - "timestamp" is a string date as it is present on wiki pages (`23:29, 10 May 2019 (UTC)`).
 *
 * @module timestamp
 */

import cd from './cd';
import { getMessages, spacesToUnderlines } from './util';

let parseTimestampRegexp;
let parseTimestampRegexpNoTimezone;

/**
 * @typedef {object} ParseTimestampReturn
 * @property {Date} date
 * @property {object} match
 */

/**
 * Parse a timestamp, and return a date and the match object.
 *
 * @param {string} timestamp
 * @param {number} [timezoneOffset=0] Timezone offset in minutes.
 * @returns {?ParseTimestampReturn}
 */
export function parseTimestamp(timestamp, timezoneOffset) {
  // Creating these regexp every time takes too long, so we cache them.
  if (!parseTimestampRegexp) {
    parseTimestampRegexp = new RegExp(`^([^]*)(${cd.g.TIMESTAMP_REGEXP.source})`);
  }
  if (!parseTimestampRegexpNoTimezone) {
    parseTimestampRegexpNoTimezone = (
      new RegExp(`^([^]*)(${cd.g.TIMESTAMP_REGEXP_NO_TIMEZONE.source})`)
    );
  }

  const regexp = timezoneOffset === undefined ?
    parseTimestampRegexp :
    parseTimestampRegexpNoTimezone;
  const match = timestamp.match(regexp);
  if (!match) {
    return null;
  }

  let date = cd.g.TIMESTAMP_PARSER(match, cd);
  if (timezoneOffset) {
    date = new Date(date.getTime() - timezoneOffset * cd.g.MILLISECONDS_IN_A_MINUTE);
  }

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
