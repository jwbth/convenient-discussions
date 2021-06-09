/**
 * Methods for loading site data, such as MediaWiki messages and configuration, and setting date
 * formats based on it.
 *
 * The code of this module, together with {@link module:timestamp}, is based on parts of {@link
 * https://github.com/wikimedia/mediawiki-extensions-DiscussionTools/ DiscussionTools} code.
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
  const languageOrFallback = (lang) => (
    DATE_FORMATS[lang] ?
    lang :
    (LANGUAGE_FALLBACKS[lang] || []).find((fallback) => DATE_FORMATS[fallback])
  );

  const contentLanguage = languageOrFallback(mw.config.get('wgContentLanguage'));
  const userLanguage = languageOrFallback(mw.config.get('wgUserLanguage'));
  cd.g.CONTENT_DATE_FORMAT = DATE_FORMATS[contentLanguage];
  cd.g.USER_DATE_FORMAT = DATE_FORMATS[userLanguage];
  cd.g.CONTENT_DIGITS = mw.config.get('wgTranslateNumerals') ? DIGITS[contentLanguage] : null;
  cd.g.USER_DIGITS = mw.config.get('wgTranslateNumerals') ? DIGITS[userLanguage] : null;
}

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
 * Load messages needed to parse and generate timestamps, as well as some site data.
 *
 * @returns {Promise[]}
 */
export function loadSiteData() {
  setFormats();

  const contentDateTokensMessageNames = getUsedDateTokens(cd.g.CONTENT_DATE_FORMAT)
    .map((pattern) => dateTokenToMessageNames[pattern]);
  const contentLanguageMessageNames = [
    'word-separator', 'comma-separator', 'colon-separator', 'timezone-utc'
  ].concat(...contentDateTokensMessageNames);

  const userDateTokensMessageNames = getUsedDateTokens(cd.g.USER_DATE_FORMAT)
    .map((pattern) => dateTokenToMessageNames[pattern]);
  const userLanguageMessageNames = [
    'parentheses', 'parentheses-start', 'parentheses-end', 'word-separator', 'comma-separator',
    'colon-separator', 'nextdiff', 'timezone-utc'
  ].concat(...userDateTokensMessageNames);

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

  return requests;
}
