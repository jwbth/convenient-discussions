/**
 * Functions for loading and setting site data, such as MediaWiki messages and configuration, and
 * setting date formats based on it.
 *
 * The code of this module, together with {@link module:timestamp}, is based on parts of
 * {@link https://github.com/wikimedia/mediawiki-extensions-DiscussionTools/ DiscussionTools} code.
 *
 * @author Bartosz Dziewoński <matma.rex@gmail.com>
 * @author Jack who built the house
 * @license MIT
 * @module siteData
 */

import DATE_FORMATS from '../../data/dateFormats.json';
import DIGITS from '../../data/digits.json';
import LANGUAGE_FALLBACKS from '../../data/languageFallbacks.json';
import cd from './cd';
import { createApi } from './boot';
import { dateTokenToMessageNames } from './timestamp';

/**
 * Set the global variables related to date format.
 *
 * @private
 */
function setFormats() {
  const getFallbackLanguage = (lang) => (
    (LANGUAGE_FALLBACKS[lang] || []).find((fallback) => DATE_FORMATS[fallback])
  );
  const languageOrFallback = (lang) => DATE_FORMATS[lang] ? lang : getFallbackLanguage(lang);

  const contentLanguage = languageOrFallback(mw.config.get('wgContentLanguage'));
  const userLanguage = languageOrFallback(mw.config.get('wgUserLanguage'));

  /**
   * Format of date in content language, as used by MediaWiki.
   *
   * @name CONTENT_DATE_FORMAT
   * @type {string}
   * @memberof convenientDiscussions.g
   */
  cd.g.CONTENT_DATE_FORMAT = DATE_FORMATS[contentLanguage];

  /**
   * Format of date in user (interface) language, as used by MediaWiki.
   *
   * @name UI_DATE_FORMAT
   * @type {string}
   * @memberof convenientDiscussions.g
   */
  cd.g.UI_DATE_FORMAT = DATE_FORMATS[userLanguage];

  /**
   * Regular expression matching a single digit in content language, e.g. `[0-9]`.
   *
   * @name CONTENT_DIGITS
   * @type {string}
   * @memberof convenientDiscussions.g
   */
  cd.g.CONTENT_DIGITS = mw.config.get('wgTranslateNumerals') ? DIGITS[contentLanguage] : null;

  /**
   * Regular expression matching a single digit in user (interface) language, e.g. `[0-9]`.
   *
   * @name UI_DIGITS
   * @type {string}
   * @memberof convenientDiscussions.g
   */
  cd.g.UI_DIGITS = mw.config.get('wgTranslateNumerals') ? DIGITS[userLanguage] : null;
}

/**
 * Get date tokens used in a format (to load only needed tokens).
 *
 * @param {string} format
 * @returns {string[]}
 * @private
 */
function getUsedDateTokens(format) {
  const tokens = [];

  for (let p = 0; p < format.length; p++) {
    let code = format[p];
    if ((code === 'x' && p < format.length - 1) || (code === 'xk' && p < format.length - 1)) {
      code += format[++p];
    }

    if (['xg', 'D', 'l', 'F', 'M'].includes(code)) {
      tokens.push(code);
    } else if (code === '\\' && p < format.length - 1) {
      ++p;
    }
  }

  return tokens;
}

/**
 * _For internal use._ Load messages needed to parse and generate timestamps as well as some site
 * data.
 *
 * @returns {Promise[]} There should be at least one promise in the array.
 */
export function loadSiteData() {
  setFormats();

  const contentDateTokensMessageNames = getUsedDateTokens(cd.g.CONTENT_DATE_FORMAT)
    .map((pattern) => dateTokenToMessageNames[pattern]);
  const contentLanguageMessageNames = [
    'word-separator', 'comma-separator', 'colon-separator', 'timezone-utc'
  ].concat(...contentDateTokensMessageNames);

  const uiDateTokensMessageNames = getUsedDateTokens(cd.g.UI_DATE_FORMAT)
    .map((pattern) => dateTokenToMessageNames[pattern]);
  const userLanguageMessageNames = [
    'parentheses', 'parentheses-start', 'parentheses-end', 'word-separator', 'comma-separator',
    'colon-separator', 'nextdiff', 'timezone-utc'
  ].concat(...uiDateTokensMessageNames);

  const areLanguagesEqual = mw.config.get('wgContentLanguage') === mw.config.get('wgUserLanguage');
  if (areLanguagesEqual) {
    const userLanguageConfigMessages = {};
    Object.keys(cd.config.messages)
      .filter((name) => userLanguageMessageNames.includes(name))
      .forEach((name) => {
        userLanguageConfigMessages[name] = cd.config.messages[name];
      });
    mw.messages.set(userLanguageConfigMessages);
  }

  // We need this object to pass it to the web worker.
  cd.g.contentLanguageMessages = {};

  const setContentLanguageMessages = (messages) => {
    Object.keys(messages).forEach((name) => {
      mw.messages.set('(content)' + name, messages[name]);
      cd.g.contentLanguageMessages[name] = messages[name];
    });
  };

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
  if (areLanguagesEqual) {
    const messagesToRequest = contentLanguageMessageNames.concat(userLanguageMessageNames);
    let nextNames;
    while ((nextNames = messagesToRequest.splice(0, 50)).length) {
      const request = cd.g.mwApi.loadMessagesIfMissing(nextNames).then(() => {
        filterAndSetContentLanguageMessages(mw.messages.get());
      });
      requests.push(request);
    }
  } else {
    let nextNames;
    const contentLanguageMessagesToRequest = contentLanguageMessageNames
      .filter((name) => !cd.g.contentLanguageMessages[name]);
    while ((nextNames = contentLanguageMessagesToRequest.splice(0, 50)).length) {
      const request = cd.g.mwApi.getMessages(nextNames, {
        amlang: mw.config.get('wgContentLanguage'),
      }).then(setContentLanguageMessages);
      requests.push(request);
    }

    const userLanguageMessagesRequest = cd.g.mwApi.loadMessagesIfMissing(userLanguageMessageNames);
    requests.push(userLanguageMessagesRequest);
  }

  /**
   * Contributions page local name.
   *
   * @name CONTRIBS_PAGE
   * @type {string}
   * @memberof convenientDiscussions.g
   */
  cd.g.CONTRIBS_PAGE = cd.config.contribsPage;

  /**
   * Timezone of the wiki.
   *
   * @name CONTENT_TIMEZONE
   * @type {?string}
   * @memberof convenientDiscussions.g
   */
  cd.g.CONTENT_TIMEZONE = cd.config.timezone;

  if (!cd.g.CONTRIBS_PAGE || !cd.g.CONTENT_TIMEZONE) {
    const request = cd.g.mwApi.get({
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

      cd.g.CONTENT_TIMEZONE = resp.query.general.timezone;
    });
    requests.push(request);
  }

  return requests;
}
