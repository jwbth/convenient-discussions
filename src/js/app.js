/**
 * Main module.
 *
 * @module app
 */

import CONFIG_URLS from '../../config/urls.json';
import I18N_LIST from '../../data/i18nList.json';
import LANGUAGE_FALLBACKS from '../../data/languageFallbacks.json';
import cd from './cd';
import controller from './controller';
import debug from './debug';
import defaultConfig from '../../config/default';
import { addCommentLinksToSpecialSearch } from './addCommentLinks';
import { getFooter, mergeRegexps, unique } from './utils';

let config;

if (IS_SINGLE) {
  try {
    config = require(`../../config/${CONFIG_FILE_NAME}`).default;
  } catch {
    // Empty
  }

  // Copy of the function in misc/utils.js. If altering it, make sure they are synchronized.
  const replaceEntities = (string) => (
    string
      .replace(/&nbsp;/g, '\xa0')
      .replace(/&#32;/g, ' ')
      .replace(/&rlm;/g, '\u200f')
      .replace(/&lrm;/g, '\u200e')
  );

  cd.i18n = {};
  cd.i18n.en = require('../../i18n/en.json');
  Object.keys(cd.i18n.en).forEach((name) => {
    cd.i18n.en[name] = replaceEntities(cd.i18n.en[name]);
  });
  if (LANG_CODE !== 'en') {
    cd.i18n[LANG_CODE] = require(`../../i18n/${LANG_CODE}.json`);
    const langObj = cd.i18n[LANG_CODE];
    Object.keys(cd.i18n[LANG_CODE])
      .filter((name) => typeof langObj[name] === 'string')
      .forEach((name) => {
        langObj[name] = replaceEntities(langObj[name]);
      });
    langObj.dayjsLocale = require(`dayjs/locale/${LANG_CODE}`);
    langObj.dateFnsLocale = require(`date-fns/locale`)[LANG_CODE];
  }
}

/**
 * Add the script's strings to `mw.messages`.
 *
 * @private
 */
function setStrings() {
  // Strings that should be displayed in the site language, not the user language.
  const contentStrings = [
    'es-',
    'cf-autocomplete-commentlinktext',
    'move-',
  ];

  if (!IS_SINGLE) {
    require('../../dist/convenientDiscussions-i18n/en.js');
  }
  const strings = {};
  Object.keys(cd.i18n.en).forEach((name) => {
    const relevantLang = contentStrings.some((contentStringName) => (
      name === contentStringName ||
      (contentStringName.endsWith('-') && name.startsWith(contentStringName))
    )) ?
      cd.g.contentLanguage :
      cd.g.userLanguage;
    strings[name] = cd.i18n[relevantLang]?.[name] || cd.i18n.en[name];
  });

  Object.keys(strings).forEach((name) => {
    mw.messages.set(`convenient-discussions-${name}`, strings[name]);
  });
}

/**
 * Add a footer link to enable/disable CD on this page once.
 *
 * @private
 */
function maybeAddFooterSwitcher() {
  if (!mw.config.get('wgIsArticle')) return;

  const enable = !controller.isTalkPage();
  const url = new URL(location.href);
  url.searchParams.set('cdtalkpage', enable ? '1' : '0');
  const $li = $('<li>').attr('id', 'footer-places-togglecd');
  const $a = $('<a>')
    .attr('href', url.toString())
    .addClass('noprint')
    .text(cd.s(enable ? 'footer-runcd' : 'footer-dontruncd'))
    .appendTo($li);
  if (enable) {
    $a.on('click', (e) => {
      if (e.ctrlKey || e.shiftKey || e.metaKey) return;

      e.preventDefault();
      history.pushState(history.state, '', url.toString());
      $li.remove();
      go();
    });
  }
  getFooter().append($li);
}

/**
 * Change the destination of the "Add topic" button to redirect topic creation to the script's form.
 * This is not done on `action=view` pages to make sure the user can open the classic form. The
 * exception is when the new topic tool is enabled with the "Offer to add a new topic" setting: in
 * that case, the classic form doesn't open anyway.
 *
 * @private
 */
function maybeTweakAddTopicButton() {
  const dtCreatePage = mw.user.options.get('discussiontools-newtopictool-createpage');
  if (
    !controller.isArticlePageTalkPage() ||
    (mw.config.get('wgAction') === 'view' && !dtCreatePage)
  ) {
    return;
  }

  const $addTopicLink = $('#ca-addsection a');
  const href = $addTopicLink.prop('href');
  if (href) {
    const url = new URL(href);
    if (dtCreatePage) {
      url.searchParams.set('dtenable', 0);
    } else {
      url.searchParams.delete('action');
      url.searchParams.delete('section');
      url.searchParams.set('cdaddtopic', 1);
    }
    $addTopicLink.attr('href', url);
  }
}

/**
 * Function executed after the config and localization strings are ready.
 *
 * @fires preprocessed
 * @private
 */
async function go() {
  debug.startTimer('start');

  require('./convenientDiscussions');

  // Don't run again if `go()` runs the second time (see `maybeAddFooterSwitcher()`).
  if (cd.g.pageWhitelistRegexp === undefined) {
    /**
     * Script configuration. The default configuration is in {@link module:defaultConfig}.
     *
     * @name config
     * @type {object}
     * @memberof convenientDiscussions
     */
    cd.config = Object.assign(defaultConfig, cd.config);

    cd.g.pageWhitelistRegexp = mergeRegexps(cd.config.pageWhitelist);
    cd.g.pageBlacklistRegexp = mergeRegexps(cd.config.pageBlacklist);

    setStrings();
  }

  controller.init();
  controller.loadToTalkPage();
  maybeAddFooterSwitcher();
  maybeTweakAddTopicButton();
  controller.loadToCommentLinksPage();
  addCommentLinksToSpecialSearch();

  if (!controller.isBooting()) {
    debug.stopTimer('start');
  }

  /**
   * The page has been preprocessed (not parsed yet, but its type has been checked and some
   * important mechanisms have been initialized).
   *
   * @event preprocessed
   * @param {object} cd {@link convenientDiscussions} object.
   * @global
   */
  mw.hook('convenientDiscussions.preprocessed').fire(cd);
}

/**
 * Set language properties of the global object, taking fallback languages into account.
 *
 * @returns {boolean} Are fallbacks employed.
 * @private
 */
function setLanguages() {
  const languageOrFallback = (lang) => (
    I18N_LIST.includes(lang) ?
      lang :
      (LANGUAGE_FALLBACKS[lang] || []).find((fallback) => I18N_LIST.includes(fallback)) || 'en'
  );

  cd.g.userLanguage = languageOrFallback(mw.config.get('wgUserLanguage'));

  // Should we use a fallback for the content language? Maybe, but in case of MediaWiki messages
  // used for signature parsing we will have to use the real content language (see
  // init.loadSiteData()). As a result, we use cd.g.contentLanguage only for the script's own
  // messages, not the native MediaWiki messages.
  cd.g.contentLanguage = languageOrFallback(mw.config.get('wgContentLanguage'));

  return !(
    cd.g.userLanguage === mw.config.get('wgUserLanguage') &&
    cd.g.contentLanguage === mw.config.get('wgContentLanguage')
  );
}

/**
 * Load and execute the configuration script if available.
 *
 * @returns {Promise.<undefined>}
 * @private
 */
function getConfig() {
  return new Promise((resolve, reject) => {
    let key = location.hostname;
    if (IS_TEST) {
      key += '.test';
    }
    const configUrl = CONFIG_URLS[key] || CONFIG_URLS[location.hostname];
    if (configUrl) {
      const rejectWithMsg = (e) => {
        reject(['Convenient Discussions can\'t run: couldn\'t load the configuration.', e]);
      };

      const [, gadgetName] = configUrl.match(/modules=ext.gadget.([^?&]+)/) || [];
      if (gadgetName && mw.user.options.get(`gadget-${gadgetName}`)) {
        // A gadget is enabled on the wiki, and it should be loaded and executed without any
        // additional requests; we just wait until it happens.
        mw.loader.using(`ext.gadget.${gadgetName}`).then(() => {
          resolve();
        });
        return;
      }
      mw.loader.getScript(configUrl).then(
        () => {
          resolve();
        },
        rejectWithMsg
      );
    } else {
      resolve();
    }
  });
}

/**
 * Load and add localization strings to the `cd.i18n` object. Use fallback languages if default
 * languages are unavailable.
 *
 * @returns {Promise.<undefined>}
 * @private
 */
function getStrings() {
  const requests = [cd.g.userLanguage, cd.g.contentLanguage]
    .filter(unique)
    .filter((lang) => lang !== 'en' && !cd.i18n?.[lang])
    .map((lang) => {
      const url = `https://commons.wikimedia.org/w/index.php?title=User:Jack_who_built_the_house/convenientDiscussions-i18n/${lang}.js&action=raw&ctype=text/javascript`;
      return mw.loader.getScript(url);
    });

  // We assume it's OK to fall back to English if the translation is unavailable for any reason.
  return Promise.all(requests).catch(() => {});
}

/**
 * The main script function.
 *
 * @fires launched
 * @private
 */
async function app() {
  if (cd.isRunning) {
    console.warn('One instance of Convenient Discussions is already running.');
    return;
  }

  /**
   * Is the script running.
   *
   * @name isRunning
   * @type {boolean}
   * @memberof convenientDiscussions
   */
  cd.isRunning = true;

  if (
    /(^|\.)m\./.test(location.hostname) ||
    /[?&]cdenable=(0|false|no|n)(?=&|$)/.test(location.search) ||
    mw.config.get('wgPageContentModel') !== 'wikitext' ||

    // Liquid Threads, for example https://en.wiktionary.org/wiki/User_talk:Yair_rand/newentrywiz.js
    $('.lqt-talkpage').length ||

    mw.config.get('wgIsMainPage')
  ) {
    return;
  }

  if (IS_SINGLE) {
    cd.config = config;
  }

  cd.g = {};

  debug.init();
  debug.startTimer('total time');
  debug.startTimer('loading config and strings');

  /**
   * The script has launched.
   *
   * @event launched
   * @param {object} cd {@link convenientDiscussions} object.
   * @global
   */
  mw.hook('convenientDiscussions.launched').fire(cd);

  const areLanguageFallbacksEmployed = setLanguages();
  const getStringsPromise = areLanguageFallbacksEmployed ?
    getStrings() :

    // cd.getStringsPromise may be set in the configuration file.
    !cd.i18n && (cd.getStringsPromise || getStrings());

  try {
    await Promise.all([!cd.config && getConfig(), getStringsPromise]);
  } catch (e) {
    console.error(e);
    return;
  }

  debug.stopTimer('loading config and strings');

  $(go);
}

app();
