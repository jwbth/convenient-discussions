/**
 * Comment timestamp and also anchor processing utilities. Timestamp formats are set in
 * {@link module:siteData}. Functions related to wikitext parsing go in {@link module:wikitext}.
 *
 * Terminology used here (and in other modules):
 * - "date" is a `Date` object,
 * - "timestamp" is a string date as it is present on wiki pages (`23:29, 10 May 2019 (UTC)`).
 *
 * @module timestamp
 */

import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { formatDistanceToNowStrict } from 'date-fns';
import { getTimezoneOffset } from 'date-fns-tz';

import cd from './cd';
import { getContentLanguageMessages, removeDirMarks, spacesToUnderlines } from './util';

let parseTimestampContentRegexp;
let parseTimestampUiRegexp;
let utcString;

export const dateTokenToMessageNames = {
  xg: [
    'january-gen', 'february-gen', 'march-gen', 'april-gen', 'may-gen', 'june-gen', 'july-gen',
    'august-gen', 'september-gen', 'october-gen', 'november-gen', 'december-gen'
  ],
  D: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
  l: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
  F: [
    'january', 'february', 'march', 'april', 'may_long', 'june', 'july', 'august', 'september',
    'october', 'november', 'december'
  ],
  M: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'],
};

export const relativeTimeThresholds = [
  // Seconds
  {
    interval: 1,
    start: 0,
    step: 1,
  },

  // Minutes
  {
    interval: 60,
    start: 1,
    step: 1,
  },

  // Hours
  {
    interval: 60 * 24,
    start: 60,
    step: 60,
  },

  // Days
  {
    interval: 60 * 24 * 31,
    start: 60 * 24,
    step: 60 * 24,
  },

  // We don't update months and years. Additional setTimeouts are costly, and algorithm for them is
  // also too complex.
];

let commentAnchors = [];

/**
 * _For internal use._ Prepare `dayjs` object for further use (add plugins and a locale).
 */
export function initDayjs() {
  if (dayjs.utc) return;

  const locale = cd.i18n[cd.g.USER_LANGUAGE].dayjsLocale;
  if (locale) {
    dayjs.locale(locale);
  }

  dayjs.extend(utc);
  dayjs.extend(timezone);

  // TODO: remove after testing.
  cd.g.dayjs = dayjs;
}

/**
 * Get a regexp that matches timestamps (without timezone at the end) generated using the given date
 * format.
 *
 * This only supports format characters that are used by the default date format in any of
 * MediaWiki's languages, namely: D, d, F, G, H, i, j, l, M, n, Y, xg, xkY (and escape characters),
 * and only dates when MediaWiki existed, let's say 2000 onwards (Thai dates before 1941 are
 * complicated).
 *
 * @param {string} language `'content'` or `'user'`.
 * @returns {string} Pattern to be a part of a regular expression.
 * @private
 * @author Bartosz Dziewoński <matma.rex@gmail.com>
 * @author Jack who built the house
 * @license MIT
 */
function getTimestampMainPartPattern(language) {
  const isContentLanguage = language === 'content';
  const format = isContentLanguage ? cd.g.CONTENT_DATE_FORMAT : cd.g.UI_DATE_FORMAT;
  const digits = isContentLanguage ? cd.g.CONTENT_DIGITS : cd.g.UI_DIGITS;
  const digitsPattern = digits ? `[${digits}]` : '\\d';

  const regexpGroup = (regexp) => '(' + regexp + ')';
  const regexpAlternateGroup = (arr) => '(' + arr.map(mw.util.escapeRegExp).join('|') + ')';

  let s = '\\b';

  for (let p = 0; p < format.length; p++) {
    let num = false;
    let code = format[p];
    if ((code === 'x' && p < format.length - 1) || (code === 'xk' && p < format.length - 1)) {
      code += format[++p];
    }

    switch (code) {
      case 'xx':
        s += 'x';
        break;
      case 'xg':
      case 'D':
      case 'l':
      case 'F':
      case 'M': {
        const messages = isContentLanguage ?
          getContentLanguageMessages(dateTokenToMessageNames[code]) :
          dateTokenToMessageNames[code].map(mw.msg);
        s += regexpAlternateGroup(messages);
        break;
      }
      case 'd':
      case 'H':
      case 'i':
        num = '2';
        break;
      case 'j':
      case 'n':
      case 'G':
        num = '1,2';
        break;
      case 'Y':
      case 'xkY':
        num = '4';
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
        s += mw.util.escapeRegExp(format[p]);
    }
    if (num !== false) {
      s += regexpGroup(digitsPattern + '{' + num + '}');
    }
  }

  return s;
}

/**
 * Get codes of date components for the function that parses timestamps in the local date format
 * based on the result of matching the regexp set by `setTimestampRegexps()`.
 *
 * @param {string} format
 * @returns {string[]}
 * @private
 * @author Bartosz Dziewoński <matma.rex@gmail.com>
 * @author Jack who built the house
 * @license MIT
 */
function getMatchingGroups(format) {
  const matchingGroups = [];
  for (let p = 0; p < format.length; p++) {
    let code = format[p];
    if ((code === 'x' && p < format.length - 1) || (code === 'xk' && p < format.length - 1)) {
      code += format[++p];
    }

    switch (code) {
      case 'xx':
        break;
      case 'xg':
      case 'd':
      case 'j':
      case 'D':
      case 'l':
      case 'F':
      case 'M':
      case 'n':
      case 'Y':
      case 'xkY':
      case 'G':
      case 'H':
      case 'i':
        matchingGroups.push(code);
        break;
      case '\\':
        // Backslash escaping
        if (p < format.length - 1) {
          ++p;
        }
        break;
      case '"':
        // Quoted literal
        if (p < format.length - 1) {
          const endQuote = format.indexOf('"', p + 1)
          if (endQuote !== -1) {
            p = endQuote;
          }
        }
        break;
      default:
        break;
    }
  }

  return matchingGroups;
}

/**
 * _For internal use._ Set the global object properties related to timestamp parsing.
 *
 * @param {string} language
 */
export function initTimestampParsingTools(language) {
  if (language === 'content') {
    const mainPartPattern = getTimestampMainPartPattern('content');
    const utcPattern = mw.util.escapeRegExp(mw.message('(content)timezone-utc').parse());
    const timezonePattern = '\\((?:' + utcPattern + '|[A-Z]{1,5}|[+-]\\d{0,4})\\)';

    /**
     * Regular expression for matching timestamps in content.
     *
     * ` +` to account for RTL and LTR marks replaced with a space.
     *
     * @name CONTENT_TIMESTAMP_REGEXP
     * @type {RegExp}
     * @memberof module:cd~convenientDiscussions.g
     */
    cd.g.CONTENT_TIMESTAMP_REGEXP = new RegExp(mainPartPattern + ' +' + timezonePattern);

    /**
     * Regular expression for matching timestamps in content with no timezone at the end.
     *
     * @name CONTENT_TIMESTAMP_NO_TZ_REGEXP
     * @type {RegExp}
     * @memberof module:cd~convenientDiscussions.g
     */
    cd.g.CONTENT_TIMESTAMP_NO_TZ_REGEXP = new RegExp(mainPartPattern);

    /**
     * Codes of date (in content language) components for the timestamp parser function.
     *
     * @name CONTENT_TIMESTAMP_MATCHING_GROUPS
     * @type {string[]}
     * @memberof module:cd~convenientDiscussions.g
     */
    cd.g.CONTENT_TIMESTAMP_MATCHING_GROUPS = getMatchingGroups(cd.g.CONTENT_DATE_FORMAT);

    /**
     * Regular expression for matching timezone, with the global flag.
     *
     * @name TIMEZONE_REGEXP
     * @type {RegExp}
     * @memberof module:cd~convenientDiscussions.g
     */
    cd.g.TIMEZONE_REGEXP = new RegExp(timezonePattern, 'g');
  } else {
    /**
     * Regular expression for matching timestamps in the interface with no timezone at the end.
     *
     * @name UI_TIMESTAMP_REGEXP
     * @type {RegExp}
     * @memberof module:cd~convenientDiscussions.g
     */
    cd.g.UI_TIMESTAMP_REGEXP = new RegExp(getTimestampMainPartPattern('user'));

    /**
     * Codes of date (in interface language) components for the timestamp parser function.
     *
     * @name UI_TIMESTAMP_MATCHING_GROUPS
     * @type {string[]}
     * @memberof module:cd~convenientDiscussions.g
     */
    cd.g.UI_TIMESTAMP_MATCHING_GROUPS = getMatchingGroups(cd.g.UI_DATE_FORMAT);

    const timezoneParts = mw.user.options.get('timecorrection')?.split('|');

    /**
     * Timezone per user preferences: standard timezone name or offset in minutes.
     *
     * @name UI_TIMEZONE
     * @type {?(string|number)}
     * @memberof module:cd~convenientDiscussions.g
     */
    cd.g.UI_TIMEZONE = (timezoneParts && timezoneParts[2]) || Number(timezoneParts[1]) || null;
  }
}

/**
 * Parse a timestamp, accepting a regexp match and returning a date.
 *
 * @param {Array} match Regexp match data.
 * @param {string|number} [timezone] Timezone standard name or offset in minutes. If set, it is
 *   implied that the timestamp is in the user (interface) language, not in the content language.
 * @returns {Date}
 * @author Bartosz Dziewoński <matma.rex@gmail.com>
 * @author Jack who built the house
 * @license MIT
 */
export function getDateFromTimestampMatch(match, timezone) {
  cd.debug.startTimer('parse timestamps');

  let isContentLanguage = timezone === undefined;
  if (isContentLanguage) {
    timezone = cd.g.CONTENT_TIMEZONE;
  }

  const digits = isContentLanguage ? cd.g.CONTENT_DIGITS : cd.g.UI_DIGITS;
  const matchingGroups = isContentLanguage ?
    cd.g.CONTENT_TIMESTAMP_MATCHING_GROUPS :
    cd.g.UI_TIMESTAMP_MATCHING_GROUPS;

  const untransformDigits = (text) => {
    if (!digits) {
      return text;
    }
    const regexp = new RegExp('[' + digits + ']', 'g');
    return text.replace(regexp, (m) => digits.indexOf(m));
  };

  let year = 0;
  let monthIdx = 0;
  let day = 0;
  let hours = 0;
  let minutes = 0;

  for (let i = 0; i < matchingGroups.length; i++) {
    const code = matchingGroups[i];
    const text = match[i + 3];

    switch (code) {
      case 'xg':
      case 'F':
      case 'M': {
        // The worker context doesn't have `mw.msg`, but `isContentLanguage` should be always
        // `true` there.
        const messages = isContentLanguage ?
          getContentLanguageMessages(dateTokenToMessageNames[code]) :
          dateTokenToMessageNames[code].map(mw.msg);
        monthIdx = messages.indexOf(text);
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
        throw 'Not implemented';
    }
  }

  cd.debug.startTimer('parse timestamps tz');
  const unixTime = Date.UTC(year, monthIdx, day, hours, minutes);
  let timezoneOffset;
  if (typeof timezone === 'number') {
    timezoneOffset = timezone * cd.g.MILLISECONDS_IN_MINUTE;
  } else {
    timezoneOffset = timezone === 'UTC' ? 0 : getTimezoneOffset(timezone, unixTime);
  }
  const date = new Date(unixTime - timezoneOffset);
  cd.debug.stopTimer('parse timestamps tz');

  cd.debug.stopTimer('parse timestamps');

  return date;
}

/**
 * @typedef {object} ParseTimestampReturn
 * @property {Date} date
 * @property {object} match
 */

/**
 * Parse a timestamp and return a date and a match object.
 *
 * @param {string} timestamp
 * @param {string|number} [timezone] Standard timezone name or offset in minutes. If set, it is
 *   implied that the timestamp is in the user (interface) language, not in the content language.
 * @returns {?ParseTimestampReturn}
 */
export function parseTimestamp(timestamp, timezone) {
  // Remove left-to-right and right-to-left marks that are sometimes copied from the edit history to
  // the timestamp (for example, https://meta.wikimedia.org/w/index.php?diff=20418518).
  timestamp = removeDirMarks(timestamp, true);

  // Creating these regexps every time takes too long (say, 5ms for 1000 runs on an average
  // machine), so we cache them.
  let regexp;
  if (timezone === undefined) {
    parseTimestampContentRegexp = (
      parseTimestampContentRegexp ||
      new RegExp(`^([^]*)(${cd.g.CONTENT_TIMESTAMP_REGEXP.source})(?!["»])`)
    );
    regexp = parseTimestampContentRegexp;
  } else {
    parseTimestampUiRegexp = (
      parseTimestampUiRegexp ||
      new RegExp(`^([^]*)(${cd.g.UI_TIMESTAMP_REGEXP.source})`)
    );
    regexp = parseTimestampUiRegexp;
  }

  const match = timestamp.match(regexp);
  if (!match) {
    return null;
  }
  const date = getDateFromTimestampMatch(match, timezone);

  return { date, match };
}

/**
 * Convert a date to a string in the format set in the settings.
 *
 * @param {Date} date
 * @param {boolean} [addTimezone=false]
 * @returns {string}
 */
export function formatDate(date, addTimezone = false) {
  let s;
  if (cd.settings.timestampFormat === 'default') {
    s = formatDateNative(date);
  } else if (cd.settings.timestampFormat === 'improved') {
    s = formatDateImproved(date);
  } else if (cd.settings.timestampFormat === 'relative') {
    s = formatDateRelative(date);
  }

  if (addTimezone && !cd.settings.hideTimezone && cd.settings.timestampFormat !== 'relative') {
    if (!utcString) {
      utcString = cd.mws('timezone-utc');
    }
    let postfix = ` (${utcString})`;
    if (cd.settings.useLocalTime) {
      // Not necessarily an integer
      const offset = date.getTimezoneOffset() / 60;

      if (offset !== 0) {
        const sign = offset > 0 ? '-' : '+';
        postfix = ` (${utcString}${sign}${Math.abs(offset)})`;
      }
    }
    s += postfix;
  }
  return s;
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
 * Convert a date to a string in the default timestamp format.
 *
 * @param {Date} date
 * @param {string} [timezone] Use the specified time zone no matter user settings.
 * @returns {string}
 */
export function formatDateNative(date, timezone) {
  let year;
  let monthIdx;
  let day;
  let hours;
  let minutes;
  let dayOfWeek;
  if (cd.settings.useLocalTime && !timezone) {
    year = date.getFullYear();
    monthIdx = date.getMonth();
    day = date.getDate();
    hours = date.getHours();
    minutes = date.getMinutes();
    dayOfWeek = date.getDay();
  } else if (!timezone || timezone === 'UTC') {
    year = date.getUTCFullYear();
    monthIdx = date.getUTCMonth();
    day = date.getUTCDate();
    hours = date.getUTCHours();
    minutes = date.getUTCMinutes();
    dayOfWeek = date.getUTCDay();
  } else {
    const dayjsDate = dayjs(date).tz(timezone);
    year = dayjsDate.year();
    monthIdx = dayjsDate.month();
    day = dayjsDate.date();
    hours = dayjsDate.hour();
    minutes = dayjsDate.minute();
    dayOfWeek = dayjsDate.day();
  }

  let s = '';
  const format = cd.g.UI_DATE_FORMAT;
  for (let p = 0; p < format.length; p++) {
    let code = format[p];
    if ((code === 'x' && p < format.length - 1) || (code === 'xk' && p < format.length - 1)) {
      code += format[++p];
    }

    switch (code) {
      case 'xx':
        s += 'x';
        break;
      case 'xg':
      case 'F':
      case 'M':
        s += dateTokenToMessageNames[code].map(mw.msg)[monthIdx];
        break;
      case 'd':
        s += zeroPad(day, 2);
        break;
      case 'D':
      case 'l': {
        s += dateTokenToMessageNames[code].map(mw.msg)[dayOfWeek];
        break;
      }
      case 'j':
        s += day;
        break;
      case 'n':
        s += monthIdx + 1;
        break;
      case 'Y':
        s += year;
        break;
      case 'xkY':
        s += year + 543;
        break;
      case 'G':
        s += hours;
        break;
      case 'H':
        s += zeroPad(hours, 2);
        break;
      case 'i':
        s += zeroPad(minutes, 2);
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
 * Format a date in the "improved" format.
 *
 * @param {Date} date
 * @returns {string}
 */
export function formatDateImproved(date) {
  cd.debug.startTimer('formatDateImproved');
  const useLocalTime = cd.settings.useLocalTime;

  let day = useLocalTime ? date.getDate() : date.getUTCDate();
  let monthIdx = useLocalTime ? date.getMonth() : date.getUTCMonth();
  let year = useLocalTime ? date.getFullYear() : date.getUTCFullYear();

  const now = new Date();
  let nowDay = useLocalTime ? now.getDate() : now.getUTCDate();
  let nowMonthIdx = useLocalTime ? now.getMonth() : now.getUTCMonth();
  let nowYear = useLocalTime ? now.getFullYear() : now.getUTCFullYear();

  let formattedDate;
  let dayjsDate = dayjs(date);
  if (!useLocalTime) {
    dayjsDate = dayjsDate.utc();
  }
  if (day === nowDay && monthIdx === nowMonthIdx && year === nowYear) {
    formattedDate = dayjsDate.format(cd.s('comment-timestamp-today'));
  } else if (day === nowDay - 1 && monthIdx === nowMonthIdx && year === nowYear) {
    formattedDate = dayjsDate.format(cd.s('comment-timestamp-yesterday'));
  } else if (year === nowYear) {
    formattedDate = dayjsDate.format(cd.s('comment-timestamp-currentyear'));
  } else {
    formattedDate = dayjsDate.format(cd.s('comment-timestamp-other'));
  }
  cd.debug.stopTimer('formatDateImproved');

  return formattedDate;
}

/**
 * Format a date in the "relative" format.
 *
 * @param {Date} date
 * @returns {string}
 */
export function formatDateRelative(date) {
  if (date.getTime() > Date.now() - cd.g.MILLISECONDS_IN_MINUTE) {
    return cd.s('comment-timestamp-lessthanminute');
  }

  // We have relative dates rounded down (1 hour 59 minutes rounded to 1 hour, not 2 hours), as is
  // the standard across the web, judging by Facebook, YouTube, Twitter, and also Google's guideline
  // on date formats: https://material.io/design/communication/data-formats.html. We also use
  // date-fns here as its locales always have strings with numbers ("1 day ago", not "a day ago"),
  // which, IMHO, are more likely to be perceived as "something in between 24 hours and 48 hours",
  // not "something around 24 hours" (jwbth).
  return formatDistanceToNowStrict(date, {
    addSuffix: true,
    roundingMethod: 'floor',
    locale: cd.i18n[cd.g.USER_LANGUAGE].dateFnsLocale,
  });
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
