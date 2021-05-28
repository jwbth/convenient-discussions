/**
 * Timestamp regexp generator, timestamp parser generator, date formats, digits, timezones,
 * MediaWiki messages, and other site data.
 *
 * The code is based on {@link
 * https://gerrit.wikimedia.org/r/#/c/mediawiki/core/+/539305/3/signaturedetector.js}. It is created
 * by Bartosz Dziewoński <matma.rex@gmail.com> and licensed under GPL-2.0-only.
 *
 * @module siteData
 */

import DATE_FORMATS from '../../data/dateFormats.json';
import DIGITS from '../../data/digits.json';
import LANGUAGE_FALLBACKS from '../../data/languageFallbacks.json';
import cd from './cd';
import { createApi } from './boot';
import { getContentLanguageMessages } from './util';

const patternToMessageNames = {
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

/**
 * Set the global variables related to date format.
 *
 * @private
 */
function setFormats() {
  let lang = mw.config.get('wgPageContentLanguage');
  if (!DATE_FORMATS[lang]) {
    lang = (LANGUAGE_FALLBACKS[lang] || []).find((fallback) => DATE_FORMATS[fallback]);
    if (!DATE_FORMATS[lang]) {
      // https://incubator.wikimedia.org/wiki/Talk:Wp/enm/Mayne_Page
      lang = mw.config.get('wgContentLanguage');
    }
  }
  cd.g.DATE_FORMAT = DATE_FORMATS[lang];
  cd.g.DIGITS = mw.config.get('wgTranslateNumerals') ? DIGITS[lang] : null;
}

function getUsedDatePatterns(format) {
  const formats = [];

  for (let p = 0; p < format.length; p++) {
    let code = format[p];
    if ((code === 'x' && p < format.length - 1) || (code === 'xk' && p < format.length - 1)) {
      code += format[++p];
    }

    if (['xg', 'D', 'l', 'F', 'M'].includes(code)) {
      formats.push(code);
    } else if (code === '\\' && p < format.length - 1) {
      ++p;
    }
  }

  return formats;
}

/**
 * Load messages needed to parse and generate timestamps, as well as some site data.
 *
 * @returns {Promise}
 */
export function loadSiteData() {
  setFormats();

  const datePatternsMessageNames = getUsedDatePatterns(cd.g.DATE_FORMAT)
    .map((pattern) => patternToMessageNames[pattern]);
  const contentLanguageMessageNames = [
    'timezone-utc', 'word-separator', 'comma-separator', 'colon-separator'
  ].concat(...datePatternsMessageNames);

  const userLanguageMessageNames = [
    'parentheses', 'parentheses-start', 'parentheses-end', 'word-separator', 'comma-separator',
    'colon-separator', 'nextdiff',
  ];

  // We need this object to pass it to the web worker.
  cd.g.contentLanguageMessages = {};

  const setContentLanguageMessages = (messages) => {
    Object.keys(messages).forEach((name) => {
      mw.messages.set('(content)' + name, messages[name]);
      cd.g.contentLanguageMessages[name] = messages[name];
    });
  };

  const areUserAndContentLanguagesEqual = mw.config.get('wgContentLanguage') === cd.g.USER_LANGUAGE;
  if (areUserAndContentLanguagesEqual) {
    const userLanguageConfigMessages = {};
    Object.keys(cd.config.messages)
      .filter((name) => userLanguageMessageNames.includes(name))
      .forEach((name) => {
        userLanguageConfigMessages[name] = cd.config.messages[name];
      });
    mw.messages.set(userLanguageConfigMessages);
  }

  const filterAndSetContentLanguageMessages = (obj) => {
    const messages = {};
    Object.keys(obj)
      .filter((name) => contentLanguageMessageNames.includes(name))
      .forEach((name) => {
        messages[name] = obj[name];
      });
    setContentLanguageMessages(messages);
  };
  filterAndSetContentLanguageMessages(cd.config.messages);

  createApi();

  // I hope we won't be scolded too much for making two message requests in parallel (if the user
  // and content language are different).
  const requests = [];
  if (areUserAndContentLanguagesEqual) {
    const messagesToRequest = contentLanguageMessageNames.concat(userLanguageMessageNames);
    let nextNames;
    while ((nextNames = messagesToRequest.splice(0, 50)).length) {
      const request = cd.g.api.loadMessagesIfMissing(nextNames, {
        amlang: mw.config.get('wgContentLanguage'),
      }).then(() => {
        filterAndSetContentLanguageMessages(mw.messages.get());
      });
      requests.push(request);
    }
  } else {
    let nextNames;
    const contentLanguageMessagesToRequest = contentLanguageMessageNames
      .filter((name) => !cd.g.contentLanguageMessages[name]);
    while ((nextNames = contentLanguageMessagesToRequest.splice(0, 50)).length) {
      const request = cd.g.api.getMessages(nextNames, {
        amlang: mw.config.get('wgContentLanguage'),
      }).then(setContentLanguageMessages);
      requests.push(request);
    }

    const userLanguageMessagesRequest = cd.g.api.loadMessagesIfMissing(userLanguageMessageNames, {
      amlang: cd.g.USER_LANGUAGE,
    });
    requests.push(userLanguageMessagesRequest);
  }

  cd.g.CONTRIBS_PAGE = cd.config.contribsPage;
  cd.g.TIMEZONE = cd.config.timezone;

  if (!cd.g.CONTRIBS_PAGE || cd.g.TIMEZONE == null) {
    const request = cd.g.api.get({
      action: 'query',
      meta: 'siteinfo',
      siprop: ['specialpagealiases', 'general'],
    }).then((resp) => {
      resp.query.specialpagealiases.some((alias) => {
        if (alias.realname === 'Contributions') {
          cd.g.CONTRIBS_PAGE = mw.config.get('wgFormattedNamespaces')[-1] + ':' + alias.aliases[0];
          return true;
        }
      });

      cd.g.TIMEZONE = resp.query.general.timezone;
    });
    requests.push(request);
  }

  return Promise.all(requests.every((request) => request.state() === 'resolved') ? [] : requests);
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
 * @param {string} format Date format, as used by MediaWiki.
 * @param {string} digits Regular expression matching a single localized digit, e.g. `[0-9]`.
 * @returns {string} Pattern to be a part of a regular expression.
 * @private
 */
function getTimestampMainPartPattern(format, digits) {
  const regexpGroup = (regexp) => '(' + regexp + ')';
  const regexpAlternateGroup = (arr) => '(' + arr.map(mw.util.escapeRegExp).join('|') + ')';

  let s = '\\b';

  for (let p = 0; p < format.length; p++) {
    let num = false;
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
        s += regexpAlternateGroup(getContentLanguageMessages(patternToMessageNames.xg));
        break;
      case 'd':
        num = '2';
        break;
      case 'D':
        s += regexpAlternateGroup(getContentLanguageMessages(patternToMessageNames.D));
        break;
      case 'j':
        num = '1,2';
        break;
      case 'l':
        s += regexpAlternateGroup(getContentLanguageMessages(patternToMessageNames.l));
        break;
      case 'F':
        s += regexpAlternateGroup(getContentLanguageMessages(patternToMessageNames.F));
        break;
      case 'M':
        s += regexpAlternateGroup(getContentLanguageMessages(patternToMessageNames.M));
        break;
      case 'n':
        num = '1,2';
        break;
      case 'Y':
        num = '4';
        break;
      case 'xkY':
        num = '4';
        break;
      case 'G':
        num = '1,2';
        break;
      case 'H':
        num = '2';
        break;
      case 'i':
        num = '2';
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
      s += regexpGroup(digits + '{' + num + '}');
    }
  }

  return s;
}

/**
 * Create and set the regexp that matches timestamps in the local date format.
 *
 * This calls `getTimestampMainPartPattern()` with data for the current wiki.
 *
 * @private
 */
function setLocalTimestampRegexps() {
  const digitsPattern = cd.g.DIGITS ? `[${cd.g.DIGITS}]` : '\\d';
  const mainPartPattern = getTimestampMainPartPattern(cd.g.DATE_FORMAT, digitsPattern);
  const utcParsed = mw.message('(content)timezone-utc').parse();
  const utcPattern = mw.util.escapeRegExp(utcParsed);
  const timezonePattern = '\\((?:' + utcPattern + '|[A-Z]{1,5}|[+-]\\d{0,4})\\)';

  // "+" to account for RTL and LTR marks replaced with a space.
  const pattern = mainPartPattern + ' +' + timezonePattern;

  /**
   * Regular expression for matching timestamps.
   *
   * @name TIMESTAMP_REGEXP
   * @type {RegExp}
   * @memberof module:cd~convenientDiscussions.g
   */
  cd.g.TIMESTAMP_REGEXP = new RegExp(pattern);

  /**
   * Regular expression for matching timestamps with no timezone at the end.
   *
   * @name TIMESTAMP_REGEXP_NO_TIMEZONE
   * @type {RegExp}
   * @memberof module:cd~convenientDiscussions.g
   */
  cd.g.TIMESTAMP_REGEXP_NO_TIMEZONE = new RegExp(mainPartPattern);

  /**
   * Regular expression for matching timezone, with a global flag.
   *
   * @name TIMEZONE_REGEXP
   * @type {RegExp}
   * @memberof module:cd~convenientDiscussions.g
   */
  cd.g.TIMEZONE_REGEXP = new RegExp(timezonePattern, 'g');
}

/**
 * Create and set the function that parses timestamps in the local date format, based on the result
 * of matching the regexp set by `setLocalTimestampRegexps()`.
 *
 * @private
 */
function setMatchingGroupsForLocalTimestampParser() {
  const format = cd.g.DATE_FORMAT;

  const matchingGroups = [];
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

  // We can't use the variables from the scope of the current function and have to accept the global
  // object as a parameter because we need to use the function in a web worker which can receive
  // functions only as strings, forgetting their scope.

  /**
   * Codes of date components for the parser function.
   *
   * @name TIMESTAMP_MATCHING_GROUPS
   * @type {string[]}
   * @memberof module:cd~convenientDiscussions.g
   */
  cd.g.TIMESTAMP_MATCHING_GROUPS = matchingGroups;
}

/**
 * Set the global variables related to timestamp parsing.
 */
export function initTimestampParsingTools() {
  setLocalTimestampRegexps();
  setMatchingGroupsForLocalTimestampParser();
}
